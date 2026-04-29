import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const supplierId = searchParams.get('supplierId')
    const currentDebtCreatedAt = searchParams.get('currentDebtCreatedAt')

    if (!supplierId) return NextResponse.json({ error: 'supplierId requis' }, { status: 400 })

    const today = new Date()

    const invoices = await prisma.invoices.findMany({
        where: {
            supplier_id: supplierId,
            status: { in: ['OPEN', 'LATE', 'PENDING'] },
            due_date: { lte: today },
        },
        select: {
            id: true,
            reference: true,
            amount_ttc: true,
            status: true,
            issued_date: true,
            due_date: true,
        },
        orderBy: { due_date: 'asc' },
    })

    let sessionInvoices = null
    if (currentDebtCreatedAt) {
        const sessionStartDate = new Date(currentDebtCreatedAt).toISOString().split('T')[0]
        const all = await prisma.invoices.findMany({
            where: {
                supplier_id: supplierId,
                issued_date: { gte: new Date(sessionStartDate) },
            },
            select: { amount_ttc: true, status: true },
        })
        sessionInvoices = all.map(inv => ({
            amount_ttc: Number(inv.amount_ttc),
            status: inv.status,
        }))
    }

    return NextResponse.json({
        invoices: invoices.map(inv => ({
            ...inv,
            amount_ttc: Number(inv.amount_ttc),
            issued_date: inv.issued_date?.toISOString().split('T')[0],
            due_date: inv.due_date?.toISOString().split('T')[0] ?? null,
        })),
        sessionInvoices,
    })
}
