import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

/**
 * GET /api/indes-invoices?companyId=xxx
 *
 * Returns all invoices imported from Les Indés (metadata.source = 'indes-sync'),
 * ordered by issued_date desc. Used by the /indes-sync UI page.
 */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) return NextResponse.json({ error: 'companyId requis' }, { status: 400 })

    // Filter invoices where metadata->source = 'indes-sync'
    const invoices = await prisma.invoices.findMany({
        where: {
            company_id: companyId,
            metadata: {
                path: ['source'],
                equals: 'indes-sync',
            },
        },
        include: {
            supplier: {
                select: { id: true, name: true, logo_url: true },
            },
        },
        orderBy: { issued_date: 'desc' },
    })

    const serialized = invoices.map((inv) => ({
        ...inv,
        amount_ttc: Number(inv.amount_ttc),
        amount_ht: inv.amount_ht ? Number(inv.amount_ht) : null,
        issued_date: inv.issued_date?.toISOString().split('T')[0],
        due_date: inv.due_date?.toISOString().split('T')[0] ?? null,
        payment_date: inv.payment_date?.toISOString().split('T')[0] ?? null,
    }))

    return NextResponse.json(serialized)
}
