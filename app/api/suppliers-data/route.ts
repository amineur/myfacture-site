import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) return NextResponse.json({ error: 'companyId requis' }, { status: 400 })

    // Fetch suppliers with lightweight invoice data (NO bank_transactions)
    const suppliers = await prisma.suppliers.findMany({
        where: { company_id: companyId },
        include: {
            invoices: {
                select: {
                    id: true,
                    amount_ttc: true,
                    issued_date: true,
                    due_date: true,
                    payment_date: true,
                    status: true,
                },
            },
        },
    })

    // Batch-fetch reconciled invoice IDs (invoices with bank_transactions covering 99%+)
    // Instead of loading bank_transactions for EVERY invoice, we query only PENDING/OPEN/LATE ones
    const pendingInvoiceIds = suppliers.flatMap(s =>
        s.invoices
            .filter(inv => ['PENDING', 'OPEN', 'LATE'].includes(inv.status))
            .map(inv => inv.id)
    )

    const reconciledMap = new Map<string, { status: string; paymentDate: string | null }>()

    if (pendingInvoiceIds.length > 0) {
        // Single query: get invoices that have bank_transactions
        const invoicesWithTx = await prisma.invoices.findMany({
            where: { id: { in: pendingInvoiceIds } },
            select: {
                id: true,
                amount_ttc: true,
                bank_transactions: { select: { amount: true, date: true } },
            },
        })

        for (const inv of invoicesWithTx) {
            if (inv.bank_transactions.length === 0) continue
            const totalPaid = inv.bank_transactions.reduce(
                (acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0
            )
            const amountTTC = Math.abs(Number(inv.amount_ttc || 0))
            if (amountTTC > 0 && totalPaid >= amountTTC * 0.99) {
                const latestDate = new Date(
                    Math.max(...inv.bank_transactions.map(t => new Date(t.date).getTime()))
                )
                reconciledMap.set(inv.id, {
                    status: 'PAID',
                    paymentDate: latestDate.toISOString().split('T')[0],
                })
            }
        }
    }

    const serialized = suppliers.map((s) => ({
        ...s,
        invoices: s.invoices.map((inv) => {
            const reconciled = reconciledMap.get(inv.id)
            return {
                amount_ttc: Number(inv.amount_ttc),
                issued_date: inv.issued_date?.toISOString().split('T')[0],
                due_date: inv.due_date?.toISOString().split('T')[0] ?? null,
                payment_date: reconciled?.paymentDate
                    ?? inv.payment_date?.toISOString().split('T')[0]
                    ?? null,
                status: reconciled?.status ?? inv.status,
            }
        }),
    }))

    const res = NextResponse.json(serialized)
    res.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')
    return res
}
