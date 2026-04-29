import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/utils/db'
import { getValidQontoToken } from '@/utils/qonto-token'
import { runFullReconciliation } from '@/lib/reconciliation'
import axios from 'axios'

export const dynamic = 'force-dynamic'

const QONTO_API_BASE = 'https://thirdparty.qonto.com/v2'

// Map Qonto bank names to clean display names
function getDisplayName(bankName: string, accountName: string): string {
    const lowerBank = (bankName || '').toLowerCase()
    const lowerAccount = (accountName || '').toLowerCase()
    
    if (lowerBank.includes('qonto') || lowerAccount.includes('qonto')) return 'Qonto'
    if (lowerBank.includes('crédit mutuel') || lowerBank.includes('credit mutuel') || 
        lowerAccount.includes('crédit mutuel') || lowerAccount.includes('credit mutuel')) return 'Crédit Mutuel'
    if (lowerBank.includes('banque populaire') || lowerAccount.includes('banque populaire')) return 'Banque Populaire'
    
    return accountName || bankName || 'Compte bancaire'
}

function getBankType(bankName: string, accountName: string): string {
    const lowerBank = (bankName || '').toLowerCase()
    const lowerAccount = (accountName || '').toLowerCase()
    
    if (lowerBank.includes('qonto') || lowerAccount.includes('qonto')) return 'QONTO'
    return 'OTHER'
}

async function fetchAllTransactions(headers: any, iban: string, slug?: string) {
    const allTransactions: any[] = []
    let currentPage = 1
    let hasMore = true

    while (hasMore) {
        try {
            const params: any = {
                iban,
                sort_by: 'settled_at:desc',
                current_page: currentPage,
                per_page: 100,
            }
            // Only add slug for native Qonto accounts
            if (slug) params.slug = slug

            const txRes = await axios.get(`${QONTO_API_BASE}/transactions`, { headers, params })
            const transactions = txRes.data.transactions || []
            allTransactions.push(...transactions)

            const meta = txRes.data.meta || {}
            hasMore = currentPage < (meta.total_pages || 1)
            currentPage++
        } catch (err: any) {
            console.error(`Error fetching transactions page ${currentPage} for ${iban}:`, err.message)
            hasMore = false
        }
    }

    return allTransactions
}

export async function GET(req: NextRequest) {
    try {
        const company = await prisma.companies.findFirst()
        const companyId = company?.id ?? undefined

        // Get valid OAuth token
        const accessToken = await getValidQontoToken(companyId)
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        }

        // =============================================
        // STEP 1: Sync native Qonto accounts from /organization
        // =============================================
        const orgRes = await axios.get(`${QONTO_API_BASE}/organization`, { headers })
        const orgAccounts = orgRes.data.organization?.bank_accounts || []

        let totalSynced = 0
        const syncedIbans: string[] = []

        for (const acc of orgAccounts) {
            const displayName = getDisplayName(acc.bank_name || 'Qonto', acc.name)
            const bankType = getBankType(acc.bank_name || 'Qonto', acc.name)

            // Skip the "TVA, Impots, Urssaf" secondary account
            const isSecondary = acc.slug?.includes('bank-account-3') || acc.name?.toLowerCase().includes('tva')
            if (isSecondary) continue

            // Find or create in DB
            let dbAccount = await prisma.bank_accounts.findFirst({
                where: { metadata: { path: ['iban'], equals: acc.iban } },
            })

            const accountData = {
                balance: acc.balance_cents / 100,
                last_sync_at: new Date(),
                bank_type: bankType,
                metadata: {
                    iban: acc.iban,
                    bic: acc.bic,
                    currency: acc.currency,
                    slug: acc.slug,
                    id: acc.id,
                    bank_name: acc.bank_name || 'Qonto',
                    account_name: acc.name,
                },
            }

            // Use specific name for secondary accounts
            const finalName = isSecondary ? 'Qonto - TVA/Urssaf' : displayName

            if (dbAccount) {
                await prisma.bank_accounts.update({
                    where: { id: dbAccount.id },
                    data: { ...accountData, name: finalName },
                })
            } else {
                dbAccount = await prisma.bank_accounts.create({
                    data: {
                        ...accountData,
                        name: finalName,
                        company_id: companyId ?? null,
                        currency: acc.currency,
                    },
                })
            }

            // Fetch and upsert transactions
            const transactions = await fetchAllTransactions(headers, acc.iban, acc.slug)
            for (const tx of transactions) {
                await prisma.bank_transactions.upsert({
                    where: { external_id: tx.transaction_id },
                    update: {
                        amount: tx.side === 'debit' ? -Math.abs(tx.amount_cents / 100) : Math.abs(tx.amount_cents / 100),
                        label: tx.label,
                        date: new Date(tx.settled_at || tx.emitted_at),
                        raw_data: tx,
                    },
                    create: {
                        external_id: tx.transaction_id,
                        account_id: dbAccount.id,
                        company_id: companyId ?? null,
                        date: new Date(tx.settled_at || tx.emitted_at),
                        amount: tx.side === 'debit' ? -Math.abs(tx.amount_cents / 100) : Math.abs(tx.amount_cents / 100),
                        label: tx.label,
                        side: tx.side.toUpperCase() as any,
                        status: 'RAW',
                        raw_data: tx,
                    },
                })
                totalSynced++
            }

            syncedIbans.push(acc.iban)
        }

        // =============================================
        // STEP 2: Sync external connected accounts (Crédit Mutuel, etc.)
        // These aren't in /organization but their transactions are available via IBAN
        // =============================================
        const externalAccounts = await prisma.bank_accounts.findMany({
            where: {
                OR: [
                    { bank_type: 'OTHER' },
                    { NOT: { metadata: { path: ['iban'], string_contains: 'FR7616958' } } }
                ]
            },
        })

        for (const extAcc of externalAccounts) {
            const metadata = extAcc.metadata as any
            const iban = metadata?.iban
            if (!iban || syncedIbans.includes(iban)) continue

            // Try to fetch transactions from Qonto API using this IBAN
            try {
                const transactions = await fetchAllTransactions(headers, iban)

                if (transactions.length > 0) {
                    // Update transactions
                    for (const tx of transactions) {
                        await prisma.bank_transactions.upsert({
                            where: { external_id: tx.transaction_id },
                            update: {
                                amount: tx.side === 'debit' ? -Math.abs(tx.amount_cents / 100) : Math.abs(tx.amount_cents / 100),
                                label: tx.label,
                                date: new Date(tx.settled_at || tx.emitted_at),
                                raw_data: tx,
                            },
                            create: {
                                external_id: tx.transaction_id,
                                account_id: extAcc.id,
                                company_id: companyId ?? null,
                                date: new Date(tx.settled_at || tx.emitted_at),
                                amount: tx.side === 'debit' ? -Math.abs(tx.amount_cents / 100) : Math.abs(tx.amount_cents / 100),
                                label: tx.label,
                                side: tx.side.toUpperCase() as any,
                                status: 'RAW',
                                raw_data: tx,
                            },
                        })
                        totalSynced++
                    }

                    // Calculate balance from all transactions for external accounts
                    const allDbTx = await prisma.bank_transactions.findMany({
                        where: { account_id: extAcc.id },
                        select: { amount: true },
                    })
                    const initialBalance = Number(metadata?.initial_balance || 0)
                    const calculatedBalance = allDbTx.reduce((sum, tx) => sum + Number(tx.amount), initialBalance)

                    await prisma.bank_accounts.update({
                        where: { id: extAcc.id },
                        data: {
                            last_sync_at: new Date(),
                            // Update balance including initial_balance if set
                            balance: Math.round(calculatedBalance * 100) / 100,
                        },
                    })
                }

                syncedIbans.push(iban)
            } catch (err: any) {
                console.error(`Failed to sync external account ${extAcc.name} (${iban}):`, err.message)
            }
        }

        // =============================================
        // STEP 3: Run reconciliation pipeline after sync
        // =============================================
        let reconciled = 0
        if (companyId) {
            try {
                const reconResult = await runFullReconciliation(companyId)
                reconciled = reconResult.reconciled
            } catch (err: any) {
                console.error('Reconciliation error (non-blocking):', err.message)
            }
        }

        return NextResponse.json({ success: true, synced: totalSynced, accounts: syncedIbans.length, reconciled })
    } catch (error: any) {
        console.error('Qonto sync error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
