import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!companyId || !startDate || !endDate) {
        return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const invoices = await prisma.invoices.findMany({
        where: {
            company_id: companyId,
            issued_date: {
                gte: new Date(startDate),
                lte: new Date(endDate),
            },
        },
        select: {
            amount_ttc: true,
            supplier: { select: { category: true } },
        },
    })

    const categoryMap: Record<string, number> = {}
    let totalSpend = 0

    invoices.forEach((inv) => {
        const cat = inv.supplier?.category || 'Non classé'
        const amount = Number(inv.amount_ttc || 0)
        categoryMap[cat] = (categoryMap[cat] || 0) + amount
        totalSpend += amount
    })

    const breakdown = Object.entries(categoryMap)
        .map(([category, amount]) => ({
            category,
            amount,
            percentage: totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount)

    return NextResponse.json({ breakdown, totalSpend })
}
