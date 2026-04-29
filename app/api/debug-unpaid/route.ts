import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supplierId = 'e7108bd9-b125-41f3-b2ce-a85e7d29290b'

    const invoices = await prisma.invoices.findMany({
        where: {
            supplier_id: supplierId,
            status: { in: ['PENDING', 'OPEN', 'LATE'] },
        },
        include: { bank_transactions: { select: { id: true, date: true, amount: true } } },
        orderBy: { issued_date: 'desc' },
    })

    return NextResponse.json(invoices.map(inv => ({
        id: inv.id,
        reference: inv.reference,
        status: inv.status,
        amount_ttc: Number(inv.amount_ttc),
        issued_date: inv.issued_date?.toISOString().split('T')[0],
        due_date: inv.due_date?.toISOString().split('T')[0],
        payment_date: inv.payment_date?.toISOString().split('T')[0] ?? null,
        bank_transactions: inv.bank_transactions.length,
    })))
}
