import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'
import { startOfMonth, endOfMonth, subMonths, differenceInDays, format } from 'date-fns'

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) return NextResponse.json({ error: 'companyId requis' }, { status: 400 })

    const now = new Date()
    const startMonthDate = startOfMonth(now)
    const endMonthDate = endOfMonth(now)

    const [invoices, accounts, paidInvoices] = await Promise.all([
        prisma.invoices.findMany({
            where: { company_id: companyId, status: { in: ['PENDING', 'OPEN', 'LATE'] } },
            select: { amount_ttc: true, status: true, due_date: true },
        }),
        prisma.bank_accounts.findMany({
            where: { company_id: companyId },
            select: { balance: true, metadata: true },
        }),
        prisma.invoices.findMany({
            where: {
                company_id: companyId,
                status: 'PAID',
                payment_date: { not: null },
                due_date: { not: null },
            },
            select: { payment_date: true, due_date: true, supplier_id: true },
        }),
    ])

    // Ne compter que les factures dont l'échéance est ≤ fin du mois en cours (pas les futures)
    const dueNow = invoices.filter((inv) => {
        if (!inv.due_date) return true // Pas de date d'échéance = à payer maintenant
        return new Date(inv.due_date) <= endMonthDate
    })
    const unpaidCount = dueNow.length
    const unpaidAmount = dueNow.reduce((acc, inv) => acc + Number(inv.amount_ttc || 0), 0)

    const currentMonthDue = invoices.reduce((acc, inv) => {
        if (inv.due_date) {
            const d = new Date(inv.due_date)
            if (d >= startMonthDate && d <= endMonthDate) return acc + Number(inv.amount_ttc || 0)
        }
        return acc
    }, 0)

    const totalDue = invoices.reduce((acc, inv) => {
        if (inv.due_date) {
            const d = new Date(inv.due_date)
            if (d <= endMonthDate) return acc + Number(inv.amount_ttc || 0)
        }
        return acc
    }, 0)

    const cash = accounts.reduce((sum, acc) => {
        const isClosed = (acc.metadata as any)?.is_closed === true
        if (isClosed) return sum
        return sum + Number(acc.balance || 0)
    }, 0)

    // Moyenne des délais moyens par fournisseur (même logique que les pages fournisseurs : 3 derniers mois)
    const threeMonthsAgo = subMonths(now, 3)
    const supplierDelays: Record<string, { total: number; count: number }> = {}
    paidInvoices.forEach((inv) => {
        if (inv.payment_date && inv.due_date && inv.supplier_id) {
            const payDate = new Date(inv.payment_date)
            if (payDate < threeMonthsAgo) return
            const delay = differenceInDays(payDate, new Date(inv.due_date))
            if (!supplierDelays[inv.supplier_id]) supplierDelays[inv.supplier_id] = { total: 0, count: 0 }
            supplierDelays[inv.supplier_id].total += delay
            supplierDelays[inv.supplier_id].count++
        }
    })
    const supplierAvgs = Object.values(supplierDelays).filter(s => s.count > 0).map(s => s.total / s.count)
    const avgDelay = supplierAvgs.length > 0 ? Math.round(supplierAvgs.reduce((a, b) => a + b, 0) / supplierAvgs.length) : 0

    const res = NextResponse.json({
        cashBalance: cash,
        unpaidInvoicesCount: unpaidCount,
        unpaidInvoicesAmount: unpaidAmount,
        monthlySpend: currentMonthDue,
        totalDue,
        averagePaymentDelay: avgDelay,
    })
    res.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')
    return res
}
