import { prisma } from '../utils/db'
import { uploadInvoiceToQonto } from '../utils/qonto-attachments'

// ============================================
// NORMALISATION & UTILS
// ============================================

/**
 * Normalize a string for flexible comparison:
 * removes spaces, dashes, dots, underscores, converts to lowercase
 * e.g. "2510 802" → "2510802", "FA-2024.001" → "fa2024001"
 */
function normalize(str: string): string {
    return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Extract all searchable text from a transaction:
 * label + raw_data.reference + raw_data.note + counterparty name
 */
function getTransactionSearchText(tx: { label: string, raw_data?: any }): string {
    const parts: string[] = [tx.label || '']

    if (tx.raw_data && typeof tx.raw_data === 'object') {
        const rd = tx.raw_data as any
        if (rd.reference) parts.push(rd.reference)
        if (rd.Reference) parts.push(rd.Reference)
        if (rd.note) parts.push(rd.note)
        if (rd.comment) parts.push(rd.comment)
        if (rd['Counterparty name']) parts.push(rd['Counterparty name'])
        if (rd.label) parts.push(rd.label)
    }

    return parts.join(' ')
}

/**
 * Check if a normalized reference is found inside transaction text.
 * Searches label AND raw_data fields.
 * Minimum length 3 chars to avoid false positives.
 */
function referenceMatchesTransaction(reference: string, tx: { label: string, raw_data?: any }): boolean {
    const normRef = normalize(reference)
    if (!normRef || normRef.length < 3) return false

    const searchText = getTransactionSearchText(tx)
    const normText = normalize(searchText)

    return normText.includes(normRef)
}

/**
 * Check if supplier name matches transaction text (for proactive supplier detection)
 */
function supplierNameMatchesTransaction(supplierName: string, tx: { label: string, raw_data?: any }): boolean {
    const normName = normalize(supplierName)
    if (!normName || normName.length < 3) return false

    const searchText = getTransactionSearchText(tx)
    const normText = normalize(searchText)

    return normText.includes(normName)
}

/**
 * Check if two amounts match (absolute values, rounded to 2 decimals)
 */
function amountsMatch(a: number | string, b: number | string): boolean {
    const absA = Math.abs(Number(a)).toFixed(2)
    const absB = Math.abs(Number(b)).toFixed(2)
    return absA === absB
}

// ============================================
// CORE: Link a transaction to an invoice
// ============================================

/**
 * Link a specific transaction to an invoice, update invoice status/date,
 * and mark the transaction as MATCHED.
 */
export async function reconcileTransaction(transactionId: string, invoiceIdOrRef: string) {
    // Resolve invoice: try by UUID first, then by reference
    let resolvedInvoiceId = invoiceIdOrRef

    // Check if it looks like a UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceIdOrRef)

    if (!isUuid) {
        // Search by reference (exact then normalized)
        const tx = await prisma.bank_transactions.findUnique({ where: { id: transactionId }, select: { company_id: true } })
        if (!tx) throw new Error('Transaction introuvable')

        let invoice = await prisma.invoices.findFirst({
            where: { company_id: tx.company_id, reference: invoiceIdOrRef }
        })

        if (!invoice) {
            // Try normalized search
            const normSearch = normalize(invoiceIdOrRef)
            if (normSearch.length >= 3) {
                const allInvoices = await prisma.invoices.findMany({
                    where: { company_id: tx.company_id },
                    select: { id: true, reference: true }
                })
                invoice = allInvoices.find(inv => {
                    const normRef = normalize(inv.reference || '')
                    return normRef === normSearch || normRef.includes(normSearch) || normSearch.includes(normRef)
                }) as any
            }
        }

        if (!invoice) throw new Error(`Facture introuvable pour la référence "${invoiceIdOrRef}"`)
        resolvedInvoiceId = invoice.id
    }

    // 1. Link the transaction and mark as MATCHED
    const updatedTx = await prisma.bank_transactions.update({
        where: { id: transactionId },
        data: {
            invoice_id: resolvedInvoiceId,
            status: 'MATCHED',
        },
        include: {
            account: true,
            invoice: true
        }
    })

    // 2. Optional: Upload to Qonto if it's a Qonto account and we have a PDF
    if (updatedTx.account?.bank_type === 'QONTO' && updatedTx.invoice?.pdf_url && updatedTx.company_id) {
        // Trigger upload in background (non-blocking)
        uploadInvoiceToQonto(updatedTx.external_id, updatedTx.invoice.pdf_url, updatedTx.company_id)
            .catch(err => console.error('[Qonto Link Error]', err.message))
    }

    // 3. Update invoice status
    return await updateInvoiceStatus(resolvedInvoiceId)
}

/**
 * Recalculate and update invoice status based on linked transactions
 */
async function updateInvoiceStatus(invoiceId: string) {
    const invoice = await prisma.invoices.findUnique({
        where: { id: invoiceId },
        include: { bank_transactions: true }
    })

    if (!invoice) throw new Error('Invoice not found')

    const totalPaid = invoice.bank_transactions.reduce(
        (acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0
    )
    const amountTTC = Math.abs(Number(invoice.amount_ttc || 0))

    // 1% tolerance for rounding
    if (totalPaid >= amountTTC * 0.99) {
        const latestDate = new Date(
            Math.max(...invoice.bank_transactions.map(t => new Date(t.date).getTime()))
        )

        await prisma.invoices.update({
            where: { id: invoiceId },
            data: { status: 'PAID', payment_date: latestDate }
        })
        return { success: true, status: 'PAID', totalPaid, invoiceRef: invoice.reference }
    } else if (totalPaid > 0) {
        await prisma.invoices.update({
            where: { id: invoiceId },
            data: { status: 'PENDING' }
        })
        return { success: true, status: 'PENDING', totalPaid, invoiceRef: invoice.reference }
    }
    return { success: true, status: invoice.status, totalPaid, invoiceRef: invoice.reference }
}

// ============================================
// AUTO-RECONCILE: Smart matching engine
// ============================================

/**
 * STRATEGY (in order of confidence):
 * 1. EXACT: amount matches AND reference found in label/raw_data → auto-link
 * 2. PROACTIVE: if no supplier_id on tx, scan ALL pending invoices for match
 * 3. SUPPLIER+NAME: amount matches AND supplier name in tx label → auto-link (unique only)
 * 4. SUPPLIER+AMOUNT UNIQUE: same supplier, same amount, only 1 candidate
 */
export async function autoReconcile(companyId: string, supplierId?: string) {
    const details: Array<{
        transactionId: string
        invoiceId: string
        invoiceRef: string
        amount: number
        status: string
        method: string
    }> = []

    // Get unlinked DEBIT transactions
    const txWhere: any = {
        company_id: companyId,
        invoice_id: null,
        side: 'DEBIT',
    }
    if (supplierId) txWhere.supplier_id = supplierId

    const transactions = await prisma.bank_transactions.findMany({
        where: txWhere,
        orderBy: { date: 'desc' },
    })

    // Get all pending invoices
    const invWhere: any = {
        company_id: companyId,
        status: { in: ['PENDING', 'OPEN', 'LATE'] },
    }
    if (supplierId) invWhere.supplier_id = supplierId

    const pendingInvoices = await prisma.invoices.findMany({
        where: invWhere,
        include: { supplier: { select: { id: true, name: true } } },
    })

    const matchedInvoiceIds = new Set<string>()

    for (const tx of transactions) {
        const txAmount = Number(tx.amount)

        // ---- PASS 1: Known supplier + amount + reference ----
        if (tx.supplier_id) {
            const candidates = pendingInvoices.filter(
                inv => inv.supplier_id === tx.supplier_id && !matchedInvoiceIds.has(inv.id)
            )
            const match = candidates.find(inv =>
                amountsMatch(txAmount, inv.amount_ttc) &&
                referenceMatchesTransaction(inv.reference || '', tx)
            )
            if (match) {
                const result = await reconcileTransaction(tx.id, match.id)
                matchedInvoiceIds.add(match.id)
                details.push({ transactionId: tx.id, invoiceId: match.id, invoiceRef: match.reference || '', amount: txAmount, status: result.status, method: 'supplier+amount+ref' })
                continue
            }
        }

        // ---- PASS 2: Proactive scan (amount + reference across ALL invoices) ----
        const allCandidates = pendingInvoices.filter(inv => !matchedInvoiceIds.has(inv.id))
        const refMatch = allCandidates.find(inv =>
            amountsMatch(txAmount, inv.amount_ttc) &&
            referenceMatchesTransaction(inv.reference || '', tx)
        )
        if (refMatch) {
            await prisma.bank_transactions.update({
                where: { id: tx.id },
                data: { supplier_id: refMatch.supplier_id }
            })
            const result = await reconcileTransaction(tx.id, refMatch.id)
            matchedInvoiceIds.add(refMatch.id)
            details.push({ transactionId: tx.id, invoiceId: refMatch.id, invoiceRef: refMatch.reference || '', amount: txAmount, status: result.status, method: 'proactive:amount+ref' })
            continue
        }

        // ---- PASS 3: Amount + supplier name in transaction text ----
        const nameMatch = allCandidates.find(inv =>
            amountsMatch(txAmount, inv.amount_ttc) &&
            inv.supplier?.name &&
            supplierNameMatchesTransaction(inv.supplier.name, tx)
        )
        if (nameMatch) {
            await prisma.bank_transactions.update({
                where: { id: tx.id },
                data: { supplier_id: nameMatch.supplier_id }
            })
            const result = await reconcileTransaction(tx.id, nameMatch.id)
            matchedInvoiceIds.add(nameMatch.id)
            details.push({ transactionId: tx.id, invoiceId: nameMatch.id, invoiceRef: nameMatch.reference || '', amount: txAmount, status: result.status, method: 'proactive:amount+name' })
            continue
        }

        // ---- PASS 4: Known supplier + unique amount match ----
        if (tx.supplier_id) {
            const amountOnly = pendingInvoices.filter(
                inv => inv.supplier_id === tx.supplier_id &&
                    !matchedInvoiceIds.has(inv.id) &&
                    amountsMatch(txAmount, inv.amount_ttc)
            )
            if (amountOnly.length === 1) {
                const result = await reconcileTransaction(tx.id, amountOnly[0].id)
                matchedInvoiceIds.add(amountOnly[0].id)
                details.push({ transactionId: tx.id, invoiceId: amountOnly[0].id, invoiceRef: amountOnly[0].reference || '', amount: txAmount, status: result.status, method: 'supplier+amount_unique' })
            }
        }
    }

    return { linkedCount: details.length, details }
}

// ============================================
// STATUS FIX: Re-evaluate invoices with linked transactions
// ============================================

/**
 * Find invoices that have linked transactions but are still PENDING/OPEN/LATE
 * and update their status to PAID if fully covered.
 */
export async function fixLinkedInvoiceStatuses(companyId: string) {
    const invoices = await prisma.invoices.findMany({
        where: {
            company_id: companyId,
            status: { in: ['PENDING', 'OPEN', 'LATE'] },
            bank_transactions: { some: {} }, // Has at least one linked transaction
        },
        include: { bank_transactions: true },
    })

    let fixedCount = 0
    const fixed: Array<{ ref: string, status: string }> = []

    for (const inv of invoices) {
        const totalPaid = inv.bank_transactions.reduce(
            (acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0
        )
        const amountTTC = Math.abs(Number(inv.amount_ttc || 0))

        if (totalPaid >= amountTTC * 0.99) {
            const latestDate = new Date(
                Math.max(...inv.bank_transactions.map(t => new Date(t.date).getTime()))
            )
            await prisma.invoices.update({
                where: { id: inv.id },
                data: { status: 'PAID', payment_date: latestDate }
            })

            // Also mark linked transactions as MATCHED
            await prisma.bank_transactions.updateMany({
                where: { invoice_id: inv.id },
                data: { status: 'MATCHED' }
            })

            fixedCount++
            fixed.push({ ref: inv.reference || inv.id, status: 'PAID' })
        }
    }

    return { fixedCount, fixed }
}

// ============================================
// APPLY MAPPING RULES
// ============================================

export async function applyMappingRules(companyId: string) {
    const rules = await prisma.transaction_mapping_rules.findMany({
        where: { company_id: companyId },
    })

    let totalAssigned = 0

    for (const rule of rules) {
        const normPattern = normalize(rule.pattern)

        const unassigned = await prisma.bank_transactions.findMany({
            where: { company_id: companyId, supplier_id: null },
        })

        for (const tx of unassigned) {
            const normText = normalize(getTransactionSearchText(tx))
            if (normText.includes(normPattern)) {
                await prisma.bank_transactions.update({
                    where: { id: tx.id },
                    data: { supplier_id: rule.supplier_id },
                })
                totalAssigned++
            }
        }
    }

    return { totalAssigned }
}

// ============================================
// CROSS-LINK FIX: Detect and correct mismatched reference links
// ============================================

/**
 * Find transactions whose raw_data.reference contains a DIFFERENT invoice reference
 * than the one they are currently linked to. This detects cases where Pass 4 (amount-only)
 * linked the wrong transaction before the reference-based pass could match correctly.
 *
 * For each mismatch:
 * 1. Unlink the wrong transaction from its current invoice
 * 2. Find the correct invoice matching the raw_data.reference
 * 3. Re-link to the correct invoice
 * 4. Re-evaluate both affected invoices' statuses
 */
export async function fixCrossLinkedTransactions(companyId: string) {
    const fixed: Array<{ txId: string, oldInvoiceRef: string, newInvoiceRef: string, rawRef: string }> = []

    // Get all linked DEBIT transactions with raw_data
    const linkedTxs = await prisma.bank_transactions.findMany({
        where: {
            company_id: companyId,
            invoice_id: { not: null },
            side: 'DEBIT',
        },
        include: {
            invoice: { select: { id: true, reference: true } },
        },
    })

    for (const tx of linkedTxs) {
        if (!tx.raw_data || typeof tx.raw_data !== 'object') continue
        const rd = tx.raw_data as any
        const rawRef = (rd.reference || '').trim()
        if (!rawRef || rawRef.length < 4) continue

        const normRawRef = normalize(rawRef)
        const invoiceRef = tx.invoice?.reference || ''
        const normInvoiceRef = normalize(invoiceRef)

        // Skip if the raw reference matches the linked invoice
        if (normInvoiceRef && normRawRef.includes(normInvoiceRef)) continue
        if (normInvoiceRef && normInvoiceRef.includes(normRawRef)) continue

        // The raw reference doesn't match — find which invoice it SHOULD be linked to
        const correctInvoice = await prisma.invoices.findFirst({
            where: {
                company_id: companyId,
            },
        })

        // Search for matching invoice by normalized reference
        const allInvoices = await prisma.invoices.findMany({
            where: { company_id: companyId },
            select: { id: true, reference: true, amount_ttc: true },
        })

        const correctMatch = allInvoices.find(inv => {
            const normRef = normalize(inv.reference || '')
            return normRef.length >= 4 && normRawRef.includes(normRef) && amountsMatch(tx.amount, inv.amount_ttc)
        })

        if (!correctMatch) continue
        if (correctMatch.id === tx.invoice_id) continue // Already correct

        // Check if the correct invoice already has the right transaction linked
        // (i.e. the swap target already has a transaction whose raw ref matches IT)
        const oldInvoiceId = tx.invoice_id!
        const oldInvoiceRef = invoiceRef

        // Unlink this transaction from the wrong invoice
        await prisma.bank_transactions.update({
            where: { id: tx.id },
            data: { invoice_id: correctMatch.id, status: 'MATCHED' },
        })

        // Update both affected invoices
        await updateInvoiceStatus(correctMatch.id)
        await updateInvoiceStatusOrReset(oldInvoiceId)

        fixed.push({
            txId: tx.id,
            oldInvoiceRef: oldInvoiceRef,
            newInvoiceRef: correctMatch.reference || correctMatch.id,
            rawRef: rawRef,
        })
    }

    return { fixedCount: fixed.length, fixed }
}

/**
 * Update invoice status, or reset to PENDING if no more linked transactions
 */
async function updateInvoiceStatusOrReset(invoiceId: string) {
    const invoice = await prisma.invoices.findUnique({
        where: { id: invoiceId },
        include: { bank_transactions: true },
    })
    if (!invoice) return

    if (invoice.bank_transactions.length === 0) {
        await prisma.invoices.update({
            where: { id: invoiceId },
            data: { status: 'PENDING', payment_date: null },
        })
        return
    }

    await updateInvoiceStatus(invoiceId)
}

// ============================================
// FULL RECONCILIATION PIPELINE
// ============================================

/**
 * Run the complete reconciliation pipeline:
 * 0. Fix cross-linked transactions (wrong reference matches)
 * 1. Fix statuses of already-linked invoices
 * 2. Apply mapping rules (assign supplier_id)
 * 3. Auto-reconcile (match transactions to invoices)
 */
export async function runFullReconciliation(companyId: string) {
    console.log(`[Reconciliation] Starting full pipeline for company ${companyId}...`)

    // Step 0: Fix cross-linked transactions (reference mismatch)
    const crossFix = await fixCrossLinkedTransactions(companyId)
    console.log(`[Reconciliation] Fixed ${crossFix.fixedCount} cross-linked transactions`)
    if (crossFix.fixed.length > 0) {
        crossFix.fixed.forEach(f => {
            console.log(`   Relinked: raw_ref="${f.rawRef}" from ${f.oldInvoiceRef} -> ${f.newInvoiceRef}`)
        })
    }

    // Step 1: Fix statuses of invoices that already have linked transactions
    const statusFix = await fixLinkedInvoiceStatuses(companyId)
    console.log(`[Reconciliation] Fixed ${statusFix.fixedCount} invoice statuses`)

    // Step 2: Apply mapping rules
    const mappingResult = await applyMappingRules(companyId)
    console.log(`[Reconciliation] Assigned ${mappingResult.totalAssigned} transactions via mapping rules`)

    // Step 3: Auto-reconcile
    const reconResult = await autoReconcile(companyId)
    console.log(`[Reconciliation] Linked ${reconResult.linkedCount} transactions to invoices`)

    if (reconResult.details.length > 0) {
        reconResult.details.forEach(d => {
            console.log(`   ${d.invoiceRef} -> ${d.amount} (${d.method})`)
        })
    }

    return {
        crossLinksFixed: crossFix.fixedCount,
        crossLinksFixedDetails: crossFix.fixed,
        statusesFixed: statusFix.fixedCount,
        statusesFixedDetails: statusFix.fixed,
        mappingAssigned: mappingResult.totalAssigned,
        reconciled: reconResult.linkedCount,
        details: reconResult.details,
    }
}
