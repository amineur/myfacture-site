import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { getValidQontoToken } from '@/utils/qonto-token'
import axios from 'axios'

export const dynamic = 'force-dynamic'

const QONTO_API_BASE = 'https://thirdparty.qonto.com/v2'

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const accessToken = await getValidQontoToken()
        const headers = { 'Authorization': `Bearer ${accessToken}` }

        // 1. Organization (native Qonto accounts)
        const orgRes = await axios.get(`${QONTO_API_BASE}/organization`, { headers })
        const orgAccounts = orgRes.data.organization?.bank_accounts || []

        // 2. Try external bank accounts endpoints
        let externalAccounts: any = null
        try {
            const extRes = await axios.get(`${QONTO_API_BASE}/external_bank_accounts`, { headers })
            externalAccounts = extRes.data
        } catch (e: any) {
            externalAccounts = { error: e.response?.status + ': ' + (e.response?.data?.message || e.message) }
        }

        // 3. Try bank connections
        let bankConnections: any = null
        try {
            const connRes = await axios.get(`${QONTO_API_BASE}/bank_connections`, { headers })
            bankConnections = connRes.data
        } catch (e: any) {
            bankConnections = { error: e.response?.status + ': ' + (e.response?.data?.message || e.message) }
        }

        // 4. Try connected accounts
        let connectedAccounts: any = null
        try {
            const caRes = await axios.get(`${QONTO_API_BASE}/connected_accounts`, { headers })
            connectedAccounts = caRes.data
        } catch (e: any) {
            connectedAccounts = { error: e.response?.status + ': ' + (e.response?.data?.message || e.message) }
        }

        // 5. Transactions from main account (by IBAN only)
        let transactions_main: any = null
        try {
            const mainIban = orgAccounts.find((a: any) => a.slug?.includes('bank-account-1'))?.iban
            if (mainIban) {
                const txRes = await axios.get(`${QONTO_API_BASE}/transactions`, {
                    headers,
                    params: { iban: mainIban, sort_by: 'settled_at:desc', per_page: 3 }
                })
                transactions_main = { count: txRes.data.transactions?.length, meta: txRes.data.meta }
            }
        } catch (e: any) {
            transactions_main = { error: e.response?.status + ': ' + JSON.stringify(e.response?.data || e.message) }
        }

        // 6. Try fetching transactions for Crédit Mutuel IBAN (external connected account)
        let transactions_credit_mutuel: any = null
        const cmIban = 'FR7610278063980002273700107'
        try {
            const txRes = await axios.get(`${QONTO_API_BASE}/transactions`, {
                headers,
                params: { iban: cmIban, sort_by: 'settled_at:desc', per_page: 3 }
            })
            transactions_credit_mutuel = {
                count: txRes.data.transactions?.length,
                meta: txRes.data.meta,
                sample: (txRes.data.transactions || []).slice(0, 2).map((tx: any) => ({
                    label: tx.label,
                    amount: tx.amount_cents / 100,
                    side: tx.side,
                    settled_at: tx.settled_at,
                }))
            }
        } catch (e: any) {
            transactions_credit_mutuel = { error: e.response?.status + ': ' + JSON.stringify(e.response?.data || e.message) }
        }

        // 7. Try fetching Banque Populaire IBAN
        let transactions_bp: any = null
        const bpIban = 'FR7610207001457021212442166'
        try {
            const txRes = await axios.get(`${QONTO_API_BASE}/transactions`, {
                headers,
                params: { iban: bpIban, sort_by: 'settled_at:desc', per_page: 3 }
            })
            transactions_bp = {
                count: txRes.data.transactions?.length,
                meta: txRes.data.meta,
            }
        } catch (e: any) {
            transactions_bp = { error: e.response?.status + ': ' + JSON.stringify(e.response?.data || e.message) }
        }

        return NextResponse.json({
            organization_accounts: orgAccounts.map((a: any) => ({
                id: a.id,
                name: a.name,
                slug: a.slug,
                iban: a.iban,
                bic: a.bic,
                balance_cents: a.balance_cents,
                bank_name: a.bank_name,
                status: a.status,
            })),
            external_bank_accounts: externalAccounts,
            bank_connections: bankConnections,
            connected_accounts: connectedAccounts,
            transactions_main,
            transactions_credit_mutuel,
            transactions_bp,
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
