import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { reconcileTransaction, runFullReconciliation } from '@/lib/reconciliation'

/**
 * POST: Manual reconciliation or full re-scan
 * - { transactionId, invoiceId } → link a specific transaction to an invoice
 * - { companyId, fullScan: true } → run full reconciliation pipeline (mapping + matching)
 */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const body = await req.json()

        // Full re-scan mode (used for regularization of existing data)
        if (body.fullScan && body.companyId) {
            const result = await runFullReconciliation(body.companyId)
            return NextResponse.json({ success: true, ...result })
        }

        // Legacy autoScan mode (backwards compatible)
        if (body.autoScan && body.companyId) {
            const result = await runFullReconciliation(body.companyId)
            return NextResponse.json({ success: true, ...result })
        }

        // Manual link mode
        if (!body.transactionId || !body.invoiceId) {
            return NextResponse.json({ error: 'Missing transactionId or invoiceId' }, { status: 400 })
        }

        const result = await reconcileTransaction(body.transactionId, body.invoiceId)
        return NextResponse.json(result)

    } catch (error: any) {
        console.error('Error in reconciliation:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/**
 * DELETE: Unlink a transaction from an invoice
 * Body: { invoiceId } → unlinks ALL transactions from that invoice and resets to PENDING
 */
export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { prisma } = await import('@/utils/db')
        const body = await req.json()

        if (!body.invoiceId) {
            return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })
        }

        // Unlink all transactions from this invoice
        const updated = await prisma.bank_transactions.updateMany({
            where: { invoice_id: body.invoiceId },
            data: { invoice_id: null, status: 'RAW' },
        })

        // Reset invoice to PENDING
        await prisma.invoices.update({
            where: { id: body.invoiceId },
            data: { status: 'PENDING', payment_date: null },
        })

        return NextResponse.json({ success: true, unlinkedTransactions: updated.count })
    } catch (error: any) {
        console.error('Error unlinking:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/**
 * GET: Run full reconciliation for default company (for cron/automation calls)
 * Can be triggered by: curl http://localhost:3000/api/transactions/reconcile
 */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        // Use Prisma to load the default company
        const { prisma } = await import('@/utils/db')
        const company = await prisma.companies.findFirst()
        if (!company) return NextResponse.json({ error: 'No company found' }, { status: 404 })

        const result = await runFullReconciliation(company.id)
        return NextResponse.json({ success: true, ...result })
    } catch (error: any) {
        console.error('Error in reconciliation:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
