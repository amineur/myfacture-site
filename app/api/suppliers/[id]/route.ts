import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const [supplier, invoices, debt] = await Promise.all([
        prisma.suppliers.findUnique({ where: { id } }),
        prisma.invoices.findMany({
            where: { supplier_id: id },
            include: { bank_transactions: { select: { date: true, amount: true } } },
            orderBy: { issued_date: 'desc' },
        }),
        prisma.debts.findFirst({
            where: { supplier_id: id, status: 'ACTIVE' },
            select: { id: true },
        }),
    ])

    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

    // Compute effective status for each invoice based on linked bank transactions
    // This ensures KPI and Historique always agree, without writing to DB as a side-effect.
    // The reconciliation pipeline (fixLinkedInvoiceStatuses) handles persistent status fixes.
    for (const inv of invoices) {
        if (['PENDING', 'OPEN', 'LATE'].includes(inv.status) && inv.bank_transactions.length > 0) {
            const totalPaid = inv.bank_transactions.reduce(
                (acc, tx) => acc + Math.abs(Number(tx.amount || 0)), 0
            )
            const amountTTC = Math.abs(Number(inv.amount_ttc || 0))

            if (totalPaid >= amountTTC * 0.99) {
                const latestDate = new Date(
                    Math.max(...inv.bank_transactions.map(t => new Date(t.date).getTime()))
                )
                // Update in-memory ONLY (no DB write) — reconciliation handles persistence
                ;(inv as any).status = 'PAID'
                ;(inv as any).payment_date = latestDate
            }
        }
    }

    const serialize = (obj: any): any => {
        if (obj === null || obj === undefined) return obj
        if (obj?.toNumber) return obj.toNumber()
        if (typeof obj === 'bigint') return Number(obj)
        if (obj instanceof Date) return obj.toISOString()
        if (Array.isArray(obj)) return obj.map(serialize)
        if (typeof obj === 'object') return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, serialize(v)]))
        return obj
    }

    return NextResponse.json({
        supplier: serialize(supplier),
        invoices: serialize(invoices),
        debtId: debt?.id || null,
    })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json()

    const supplier = await prisma.suppliers.update({
        where: { id },
        data: body,
    })

    return NextResponse.json(supplier)
}
