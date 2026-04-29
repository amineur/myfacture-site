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

    const suppliers = await prisma.suppliers.findMany({
        where: { company_id: companyId },
        include: {
            invoices: {
                select: {
                    amount_ttc: true,
                    issued_date: true,
                    due_date: true,
                    payment_date: true,
                    status: true,
                    bank_transactions: { select: { amount: true, date: true } },
                },
            },
        },
    })

    const serialized = suppliers.map((s) => ({
        ...s,
        invoices: s.invoices.map((inv) => {
            // Compute effective status: same logic as supplier detail API
            // Invoices with linked bank_transactions covering 99%+ are effectively PAID
            let effectiveStatus = inv.status
            let effectivePaymentDate = inv.payment_date

            if (['PENDING', 'OPEN', 'LATE'].includes(inv.status) && inv.bank_transactions.length > 0) {
                const totalPaid = inv.bank_transactions.reduce(
                    (acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0
                )
                const amountTTC = Math.abs(Number(inv.amount_ttc || 0))
                if (totalPaid >= amountTTC * 0.99) {
                    effectiveStatus = 'PAID'
                    effectivePaymentDate = new Date(
                        Math.max(...inv.bank_transactions.map(t => new Date(t.date).getTime()))
                    )
                }
            }

            return {
                amount_ttc: Number(inv.amount_ttc),
                issued_date: inv.issued_date?.toISOString().split('T')[0],
                due_date: inv.due_date?.toISOString().split('T')[0] ?? null,
                payment_date: effectivePaymentDate instanceof Date
                    ? effectivePaymentDate.toISOString().split('T')[0]
                    : (inv.payment_date?.toISOString().split('T')[0] ?? null),
                status: effectiveStatus,
            }
        }),
    }))

    return NextResponse.json(serialized)
}
