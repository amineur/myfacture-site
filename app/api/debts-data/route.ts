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

    const [debts, currentDebts] = await Promise.all([
        prisma.debts.findMany({
            where: { company_id: companyId },
            include: { supplier: { select: { id: true, name: true, category: true, logo_url: true } } },
            orderBy: { end_date: 'asc' },
        }),
        prisma.current_debts.findMany({
            where: { company_id: companyId, status: 'ACTIVE' },
            include: { supplier: { select: { id: true, name: true, logo_url: true, category: true } } },
        }),
    ])

    const serialize = (obj: any): any => {
        if (obj === null || obj === undefined) return obj
        if (obj?.toNumber) return obj.toNumber()
        if (typeof obj === 'bigint') return Number(obj)
        if (obj instanceof Date) return obj.toISOString()
        if (Array.isArray(obj)) return obj.map(serialize)
        if (typeof obj === 'object') {
            return Object.fromEntries(
                Object.entries(obj).map(([k, v]) => [k, serialize(v)])
            )
        }
        return obj
    }

    return NextResponse.json({
        debts: serialize(debts),
        currentDebts: serialize(currentDebts),
    })
}
