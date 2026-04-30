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

    const invoices = await prisma.invoices.findMany({
        where: { company_id: companyId },
        select: {
            id: true,
            company_id: true,
            reference: true,
            amount_ttc: true,
            amount_ht: true,
            status: true,
            issued_date: true,
            due_date: true,
            payment_date: true,
            pdf_url: true,
            supplier: {
                select: { id: true, name: true, logo_url: true, iban: true, bic: true },
            },
        },
        orderBy: { issued_date: 'desc' },
    })

    // Serialize Decimal fields
    const serialized = invoices.map((inv) => ({
        ...inv,
        amount_ttc: Number(inv.amount_ttc),
        amount_ht: inv.amount_ht ? Number(inv.amount_ht) : null,
        issued_date: inv.issued_date?.toISOString().split('T')[0],
        due_date: inv.due_date?.toISOString().split('T')[0] ?? null,
        payment_date: inv.payment_date?.toISOString().split('T')[0] ?? null,
    }))

    const res = NextResponse.json(serialized)
    res.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=30')
    return res
}

export async function PATCH(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { ids, status, payment_date } = await req.json()

    if (!ids || !Array.isArray(ids)) {
        return NextResponse.json({ error: 'ids requis' }, { status: 400 })
    }

    await prisma.invoices.updateMany({
        where: { id: { in: ids } },
        data: {
            status: status || 'PAID',
            payment_date: payment_date ? new Date(payment_date) : new Date(),
        },
    })

    return NextResponse.json({ success: true })
}
