import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/utils/db'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { runFullReconciliation } from '@/lib/reconciliation'

const INDES_BASE_URL = 'https://lesindescorporate.fr'
// Urban Hit radioId (France Maghreb 2 = 3934864599684677663)
const RADIO_ID = '3934864599684677758'

interface IndesDocument {
    id: string
    title: string
    url: string | null
    subList: IndesDocument[] | null
    description: string | null
    type: string | null
}

function findSectionById(items: IndesDocument[], id: string): IndesDocument | null {
    for (const item of items) {
        if (item.id === id) return item
        if (item.subList) {
            const found = findSectionById(item.subList, id)
            if (found) return found
        }
    }
    return null
}

// ── PDF Text Extraction (pdf-parse v1.x) ────────────────────────────
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    // pdf-parse v1.x exports the function directly
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(buffer)
    return data.text
}

/**
 * Parse structured invoice data from PDF text content.
 * Handles both new format (2026+) and old format (2016-era).
 *
 * New format fields:
 *   N°F_20260402619, DATE : 19-04-2026, DATE D'ÉMISSION : 24-04-2026,
 *   DATE D'ÉCHÉANCE : 10-06-2026, TOTAL TTC 194,40 €, TOTAL HT 162,00 €,
 *   Category line: "Hébergement Scaleway 2026"
 *
 * Old format fields:
 *   Numéro FR000146, Date 15 déc. 2016, Avoir/Facture,
 *   Net à déduire / Montant TTC, Category: "Incidents de diffusion"
 */
function parseInvoicePdfText(text: string) {
    const result: {
        reference: string | null
        issuedDate: string | null
        dueDate: string | null
        emissionDate: string | null
        amountHT: number | null
        amountTTC: number | null
        category: string | null
        description: string | null
        isAvoir: boolean
        paymentMode: string | null
    } = {
        reference: null, issuedDate: null, dueDate: null, emissionDate: null,
        amountHT: null, amountTTC: null, category: null, description: null,
        isAvoir: false, paymentMode: null,
    }

    const parseFrenchNumber = (str: string): number =>
        parseFloat(str.replace(/\s/g, '').replace(',', '.'))

    const MONTHS: Record<string, string> = {
        'janv': '01', 'jan': '01', 'févr': '02', 'fév': '02', 'feb': '02',
        'mars': '03', 'mar': '03', 'avr': '04', 'apr': '04',
        'mai': '05', 'may': '05', 'juin': '06', 'jun': '06',
        'juil': '07', 'jul': '07', 'août': '08', 'aug': '08',
        'sept': '09', 'sep': '09', 'oct': '10',
        'nov': '11', 'déc': '12', 'dec': '12',
    }

    // ── Type: Avoir (credit note) or Facture ──
    result.isAvoir = /\bAvoir\b/i.test(text)

    // ── Reference ──
    // New: N°F_20260402619
    let refMatch = text.match(/N°\s*F?_?(\d{8,})/i)
    if (!refMatch) {
        // Old: Référence\nFR000146 (may be on separate lines in PDF extraction)
        refMatch = text.match(/(?:Numéro|Référence)\s*\n?\s*([A-Z]{1,3}\d{4,})/i)
    }
    if (refMatch) result.reference = refMatch[1]

    // ── Dates ──
    // New format: DATE : 19-04-2026
    const dateMatch = text.match(/\bDATE\s*:\s*(\d{2}-\d{2}-\d{4})/i)
    if (dateMatch) {
        const [d, m, y] = dateMatch[1].split('-')
        result.issuedDate = `${y}-${m}-${d}`
    }

    // Old format: "15 déc. 2016" — use broad char class for accented month names
    if (!result.issuedDate) {
        const oldDateMatch = text.match(/(\d{1,2})\s+([a-zA-ZéèêëàâäùûüôöîïçÉÈÊÀÂÔÎÇ]+)\.?\s+(\d{4})/)
        if (oldDateMatch) {
            const day = oldDateMatch[1].padStart(2, '0')
            const monthKey = oldDateMatch[2].toLowerCase().replace('.', '')
            const month = MONTHS[monthKey] || '01'
            result.issuedDate = `${oldDateMatch[3]}-${month}-${day}`
        }
    }

    // Emission date: DATE D'ÉMISSION : 24-04-2026
    const emissionMatch = text.match(/DATE\s+D['\u2019']?ÉMISSION\s*:\s*(\d{2}-\d{2}-\d{4})/i)
    if (emissionMatch) {
        const [d, m, y] = emissionMatch[1].split('-')
        result.emissionDate = `${y}-${m}-${d}`
    }

    // Due date: DATE D'ÉCHÉANCE : 10-06-2026
    const dueMatch = text.match(/DATE\s+D['\u2019']?ÉCHÉANCE\s*:\s*(\d{2}-\d{2}-\d{4})/i)
    if (dueMatch) {
        const [d, m, y] = dueMatch[1].split('-')
        result.dueDate = `${y}-${m}-${d}`
    }

    // Old format: "le 15/12/16" anywhere in text (PDF table columns get scrambled)
    if (!result.dueDate) {
        const oldDueMatch = text.match(/le\s+(\d{2})\/(\d{2})\/(\d{2,4})/i)
        if (oldDueMatch) {
            const day = oldDueMatch[1]
            const month = oldDueMatch[2]
            let year = oldDueMatch[3]
            if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year
            result.dueDate = `${year}-${month}-${day}`
        }
    }

    // ── Amounts ──
    // TOTAL TTC / NET À PAYER (new format)
    const ttcMatch = text.match(/(?:TOTAL\s+TTC|NET\s+[ÀA]\s+PAYER)\s*\n?\s*([\d\s]+,\d{2})/i)
    if (ttcMatch) {
        result.amountTTC = parseFrenchNumber(ttcMatch[1])
    }

    // Old format: columns scrambled — headers on one line, amounts on next
    // "Net à déduire €Total TVA 20%Total HT €"
    // "55,13 €9,19 €45,94 €"
    // First amount = TTC, last = HT
    if (!result.amountTTC) {
        const amountsLineMatch = text.match(/(?:Net\s+[àa]\s+d[ée]duire|Montant\s+TTC)[^]*?\n([\d,.\s€]+€)/i)
        if (amountsLineMatch) {
            const amountsLine = amountsLineMatch[1]
            const amounts = [...amountsLine.matchAll(/([\d\s]+,\d{2})\s*€/g)]
                .map(m => parseFrenchNumber(m[1]))
            if (amounts.length >= 1) result.amountTTC = amounts[0]
            if (amounts.length >= 3) result.amountHT = amounts[2]
            else if (amounts.length >= 2) result.amountHT = amounts[amounts.length - 1]
        }
    }

    // TOTAL HT (new format)
    if (!result.amountHT) {
        const htMatch = text.match(/TOTAL\s+HT\s*€?\s*\n?\s*([\d\s]+,\d{2})/i)
        if (htMatch) {
            result.amountHT = parseFrenchNumber(htMatch[1])
        }
    }

    // If avoir, amounts should be negative
    if (result.isAvoir) {
        if (result.amountTTC && result.amountTTC > 0) result.amountTTC = -result.amountTTC
        if (result.amountHT && result.amountHT > 0) result.amountHT = -result.amountHT
    }

    // ── Category / Description ──
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    // Known categories to search for in full text
    const KNOWN_CATEGORIES = [
        'Hébergement Scaleway', 'Incidents de diffusion', 'Frais de gestion',
        'Cotisation', 'Redevance', 'Reversement', 'Commission',
        'Frais techniques', 'Streaming', 'Webradio', 'Frais de diffusion',
        'Frais de régie', 'Contribution', 'Refacturation',
    ]
    for (const cat of KNOWN_CATEGORIES) {
        if (text.includes(cat)) {
            result.category = cat
            break
        }
    }

    // New format: standalone category line before DÉSIGNATION (e.g. "Hébergement Scaleway 2026")
    if (!result.category) {
        const desigIdx = lines.findIndex(l => /D[ÉE]SIGNATION/i.test(l))
        if (desigIdx > 0) {
            for (let i = desigIdx - 1; i >= Math.max(0, desigIdx - 3); i--) {
                const line = lines[i]
                if (/(?:SIRET|TVA|France|Versailles|Chantiers|ADRESSE|FACTURATION|URBAN|EUROMEDMULTIMEDIA|Quantit)/i.test(line)) continue
                if (line.length > 5 && line.length < 80 && !/^\d/.test(line) && !/^N°/.test(line)) {
                    result.category = line
                    break
                }
            }
        }
    }

    // Description: extract from line item text
    // New format: "Provision avril 2026 selon nombre d'appels et webservices1,00162,00..."
    // Old format: "1,0045,9445,94 €Incidents de diffusion"
    const desigIdx = lines.findIndex(l => /D[ÉE]SIGNATION/i.test(l))
    if (desigIdx >= 0) {
        for (let i = desigIdx + 1; i < Math.min(desigIdx + 5, lines.length); i++) {
            const line = lines[i]
            if (/^QT[ÉE]|^PU|^TVA|^TOTAL|^BASE|^Mode/i.test(line)) continue
            if (line.length > 10) {
                // Strip numbers and amounts from the description
                let cleaned = line
                    .replace(/^[\d,.\s]+(?:€\s*)?/g, '')    // leading numbers
                    .replace(/\d+,\d{2}\s*[€%]?\s*/g, '')   // embedded amounts
                    .replace(/\d+,\d{2}/g, '')               // remaining number pairs
                    .trim()
                if (cleaned.length > 5) {
                    result.description = cleaned
                    break
                }
            }
        }
    }

    // Payment mode
    const paymentMatch = text.match(/Mode\s+de\s+(?:paiement|règlement)\s*:\s*\n?\s*(.+)/i)
    if (paymentMatch) {
        const mode = paymentMatch[1].trim()
        // Filter out amounts that got captured as payment mode in old format
        if (mode.length > 3 && !/^\d/.test(mode)) {
            result.paymentMode = mode
        }
    }

    return result
}

// ── File helpers ──────────────────────────────────────────────────────
async function downloadPdf(url: string, token: string): Promise<Buffer> {
    const res = await fetch(`${INDES_BASE_URL}${url}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Failed to download PDF: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
}

async function savePdf(buffer: Buffer, filename: string): Promise<string> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'pdfs', 'indes')
    await mkdir(uploadsDir, { recursive: true })
    await writeFile(path.join(uploadsDir, safeName), buffer)
    return `/uploads/pdfs/indes/${safeName}`
}

// ══════════════════════════════════════════════════════════════════════
// POST /api/automation/indes-sync
//
// Synchronise les factures depuis Les Indés Corporate.
// Body: { limit?: number, dryRun?: boolean, section?: string }
//
// Sections: "factures" (default), "tf1", "digital", "releves"
// ══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get('x-automation-key')
        if (!apiKey || apiKey !== process.env.AUTOMATION_API_KEY) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = process.env.INDES_JWT_TOKEN
        if (!token) {
            return NextResponse.json({
                error: 'INDES_JWT_TOKEN not configured. Connectez-vous sur lesindescorporate.fr, ouvrez la console DevTools et exécutez : localStorage.getItem("authorizationTokenFront")',
            }, { status: 500 })
        }

        const body = await req.json().catch(() => ({}))
        const limit = body.limit || 50
        const dryRun = body.dryRun === true
        const sectionKey = body.section || 'factures'

        const SECTION_MAP: Record<string, { id: string; supplier: string }> = {
            factures: { id: '4129498607212560412', supplier: 'Les Indés' },
            tf1: { id: '4238596286370021766', supplier: 'TF1 Publicité' },
            digital: { id: '4025544538513735718', supplier: 'Indés Digital' },
            releves: { id: '4025544538513735720', supplier: 'Les Indés' },
        }

        const sectionConfig = SECTION_MAP[sectionKey]
        if (!sectionConfig) {
            return NextResponse.json({ error: `Unknown section: ${sectionKey}`, available: Object.keys(SECTION_MAP) }, { status: 400 })
        }

        // 1. Fetch document tree
        console.log('[Indés Sync] Fetching document list...')
        const docsRes = await fetch(`${INDES_BASE_URL}/api/content/mydocs/${RADIO_ID}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        })
        if (!docsRes.ok) {
            if (docsRes.status === 401) {
                return NextResponse.json({
                    error: 'Token Les Indés expiré. Reconnectez-vous sur lesindescorporate.fr et mettez à jour INDES_JWT_TOKEN.',
                }, { status: 401 })
            }
            return NextResponse.json({ error: `Les Indés API error: ${docsRes.status}` }, { status: 502 })
        }

        const docsTree: IndesDocument[] = await docsRes.json()

        // 2. Find section
        const section = findSectionById(docsTree, sectionConfig.id)
        if (!section || !section.subList) {
            return NextResponse.json({ error: `Section "${sectionKey}" not found or empty` }, { status: 404 })
        }

        const allDocs = section.subList.filter(d => d.url && d.title.toLowerCase().endsWith('.pdf'))
        console.log(`[Indés Sync] Found ${allDocs.length} PDFs in "${section.title}"`)

        // 3. Company + Supplier
        const company = await prisma.companies.findFirst()
        if (!company) return NextResponse.json({ error: 'No company found' }, { status: 404 })

        let supplier = await prisma.suppliers.findFirst({
            where: { company_id: company.id, name: { contains: sectionConfig.supplier, mode: 'insensitive' } },
        })
        if (!supplier) {
            supplier = await prisma.suppliers.findFirst({
                where: { company_id: company.id, name: { contains: 'Indés', mode: 'insensitive' } },
            })
        }

        // 4. Existing refs for dedup
        const existingInvoices = await prisma.invoices.findMany({
            where: { company_id: company.id },
            select: { reference: true, pdf_url: true },
        })
        const existingRefs = new Set(existingInvoices.map(i => i.reference).filter(Boolean))
        // Also normalize: strip leading zeros and F_ prefix for matching
        const normalizedExistingRefs = new Set(
            existingInvoices
                .map(i => i.reference?.replace(/^F_?/i, '').replace(/^0+/, ''))
                .filter(Boolean)
        )

        // 5. Process
        const docsToProcess = allDocs.slice(0, limit)
        const results = {
            total_in_section: allDocs.length,
            processed: 0,
            created: 0,
            needs_review: 0,
            skipped_existing: 0,
            skipped_no_supplier: 0,
            errors: [] as string[],
            invoices: [] as any[],
        }

        for (const doc of docsToProcess) {
            results.processed++

            if (!supplier) {
                results.skipped_no_supplier++
                continue
            }

            try {
                // Download PDF
                const pdfBuffer = await downloadPdf(doc.url!, token)

                // Extract text and parse
                const pdfText = await extractTextFromPdf(pdfBuffer)
                const parsed = parseInvoicePdfText(pdfText)

                // Build reference for dedup
                const ref = parsed.reference || doc.title.replace(/\.pdf$/i, '').split('_').slice(-1)[0]
                const normalizedRef = ref.replace(/^F_?/i, '').replace(/^0+/, '')

                if (existingRefs.has(ref) || existingRefs.has(`F_${ref}`) || normalizedExistingRefs.has(normalizedRef)) {
                    results.skipped_existing++
                    continue
                }

                if (dryRun) {
                    const needsReview = !parsed.category || !parsed.amountTTC || !parsed.issuedDate
                    if (needsReview) results.needs_review++
                    results.invoices.push({
                        reference: ref,
                        category: parsed.category,
                        description: parsed.description,
                        issuedDate: parsed.issuedDate,
                        emissionDate: parsed.emissionDate,
                        dueDate: parsed.dueDate,
                        amountHT: parsed.amountHT,
                        amountTTC: parsed.amountTTC,
                        isAvoir: parsed.isAvoir,
                        filename: doc.title,
                        needs_review: needsReview,
                        review_reasons: [
                            ...(!parsed.category ? ['catégorie manquante'] : []),
                            ...(!parsed.amountTTC ? ['montant TTC manquant'] : []),
                            ...(!parsed.issuedDate ? ['date émission manquante'] : []),
                        ],
                        status: 'would_create',
                    })
                    results.created++
                    continue
                }

                // Save PDF
                const pdfPath = await savePdf(pdfBuffer, doc.title)

                // Dates
                const issuedDate = parsed.emissionDate || parsed.issuedDate
                    ? new Date(parsed.emissionDate || parsed.issuedDate!)
                    : new Date()
                const dueDate = parsed.dueDate ? new Date(parsed.dueDate) : (() => {
                    const d = new Date(issuedDate)
                    d.setDate(d.getDate() + 30)
                    return d
                })()

                // Status: si date d'échéance est passée → PAID (prélevé sur recettes)
                const now = new Date()
                const isPaid = dueDate <= now
                const status = isPaid ? 'PAID' : 'PENDING'
                const paymentDate = isPaid ? dueDate : null

                // Flag needs_review si catégorie manquante, montant à 0, ou date manquante
                const needsReview = !parsed.category || !parsed.amountTTC || !parsed.issuedDate
                if (needsReview) results.needs_review++

                // Create invoice
                const invoice = await prisma.invoices.create({
                    data: {
                        company_id: company.id,
                        supplier_id: supplier.id,
                        reference: ref,
                        amount_ttc: parsed.amountTTC ? Math.abs(parsed.amountTTC) : 0,
                        amount_ht: parsed.amountHT ? Math.abs(parsed.amountHT) : null,
                        issued_date: issuedDate,
                        due_date: dueDate,
                        status: status as any,
                        payment_date: paymentDate,
                        pdf_url: pdfPath,
                        metadata: {
                            source: 'indes-sync',
                            category: parsed.category,
                            description: parsed.description,
                            is_avoir: parsed.isAvoir,
                            payment_mode: parsed.paymentMode,
                            original_filename: doc.title,
                            needs_review: needsReview,
                            review_reasons: [
                                ...(!parsed.category ? ['catégorie manquante'] : []),
                                ...(!parsed.amountTTC ? ['montant TTC manquant'] : []),
                                ...(!parsed.issuedDate ? ['date émission manquante'] : []),
                            ],
                        },
                    },
                })

                // Add to existing refs to avoid duplicate within same batch
                existingRefs.add(ref)
                normalizedExistingRefs.add(normalizedRef)

                results.invoices.push({
                    id: invoice.id,
                    reference: ref,
                    category: parsed.category,
                    amountTTC: parsed.amountTTC,
                    amountHT: parsed.amountHT,
                    issuedDate: parsed.issuedDate,
                    dueDate: parsed.dueDate,
                    status,
                    isAvoir: parsed.isAvoir,
                    filename: doc.title,
                    pdf_url: pdfPath,
                })
                results.created++
            } catch (err: any) {
                results.errors.push(`Error processing ${doc.title}: ${err.message}`)
            }
        }

        // Log import
        if (results.created > 0 && !dryRun) {
            await prisma.import_logs.create({
                data: {
                    company_id: company.id,
                    invoice_count: results.created,
                    invoices: results.invoices,
                    source: 'indes-sync',
                    status: 'success',
                },
            })

            runFullReconciliation(company.id).catch(err => console.error('[Indés Recon Error]', err.message))
        }

        return NextResponse.json(results)
    } catch (error: any) {
        console.error('[Indés Sync Error]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// ══════════════════════════════════════════════════════════════════════
// GET /api/automation/indes-sync — Status & token check
// ══════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
    const apiKey = req.headers.get('x-automation-key')
    if (!apiKey || apiKey !== process.env.AUTOMATION_API_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = process.env.INDES_JWT_TOKEN
    if (!token) {
        return NextResponse.json({
            status: 'not_configured',
            message: 'INDES_JWT_TOKEN manquant dans .env',
        })
    }

    try {
        const parts = token.split('.')
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
        const expiresAt = new Date(payload.exp * 1000)
        const isExpired = expiresAt < new Date()

        const res = await fetch(`${INDES_BASE_URL}/api/user/userInfos`, {
            headers: { 'Authorization': `Bearer ${token}` },
        })

        return NextResponse.json({
            status: isExpired ? 'token_expired' : (res.ok ? 'ok' : 'token_invalid'),
            token_expires: expiresAt.toISOString(),
            token_user: payload.email,
            api_status: res.status,
        })
    } catch {
        return NextResponse.json({ status: 'error', message: 'Invalid token format' })
    }
}
