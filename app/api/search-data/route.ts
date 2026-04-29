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

    const [invoices, suppliers, debts] = await Promise.all([
        prisma.invoices.findMany({
            where: { company_id: companyId },
            select: {
                id: true,
                reference: true,
                amount_ttc: true,
                issued_date: true,
                supplier: { select: { name: true } },
            },
            orderBy: { issued_date: 'desc' },
            take: 200,
        }),
        prisma.suppliers.findMany({
            where: { company_id: companyId },
            select: { id: true, name: true, category: true },
            take: 50,
        }),
        prisma.debts.findMany({
            where: { company_id: companyId },
            select: {
                id: true,
                contract_ref: true,
                remaining_amount: true,
                status: true,
                supplier: { select: { name: true } },
            },
            take: 100,
        }),
    ])

    return NextResponse.json({
        invoices: invoices.map((inv) => ({
            ...inv,
            amount_ttc: Number(inv.amount_ttc),
            issued_date: inv.issued_date?.toISOString().split('T')[0],
        })),
        suppliers,
        debts: debts.map((d) => ({
            ...d,
            remaining_amount: Number(d.remaining_amount),
        })),
    })
}
