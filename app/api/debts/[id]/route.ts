import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const serialize = (obj: any): any => {
        if (obj === null || obj === undefined) return obj
        if (obj?.toNumber) return obj.toNumber()
        if (typeof obj === 'bigint') return Number(obj)
        if (obj instanceof Date) return obj.toISOString()
        if (Array.isArray(obj)) return obj.map(serialize)
        if (typeof obj === 'object') return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, serialize(v)]))
        return obj
    }

    try {
        if (id.startsWith('synthetic-')) {
            const realId = id.replace('synthetic-', '')
            const cd = await prisma.current_debts.findUnique({
                where: { id: realId },
                include: { supplier: { select: { id: true, name: true, logo_url: true } } },
            })
            if (!cd) return NextResponse.json({ error: 'Not found' }, { status: 404 })

            const data = {
                id,
                supplier: cd.supplier,
                monthly_amount: 0,
                start_date: cd.triggered_at,
                end_date: null,
                status: 'ACTIVE',
                contract_ref: 'DETTE COURANTE',
                remaining_amount: 0,
                total_amount: 0,
            }

            return NextResponse.json({ debt: serialize(data), currentDebt: serialize(cd), type: 'synthetic' })
        }

        const debt = await prisma.debts.findUnique({
            where: { id },
            include: { supplier: { select: { id: true, name: true, logo_url: true } } },
        })
        if (!debt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

        let currentDebt = null
        if (debt.supplier?.id) {
            currentDebt = await prisma.current_debts.findFirst({
                where: { supplier_id: debt.supplier.id, status: 'ACTIVE' },
            })
        }

        return NextResponse.json({ debt: serialize(debt), currentDebt: serialize(currentDebt), type: 'real' })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
