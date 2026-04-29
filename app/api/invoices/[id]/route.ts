import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const invoice = await prisma.invoices.findUnique({
        where: { id },
        include: {
            supplier: { select: { id: true, name: true, logo_url: true, category: true, iban: true, bic: true } },
        },
    })

    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    return NextResponse.json({
        ...invoice,
        amount_ttc: Number(invoice.amount_ttc),
        amount_ht: invoice.amount_ht ? Number(invoice.amount_ht) : null,
        issued_date: invoice.issued_date?.toISOString().split('T')[0],
        due_date: invoice.due_date?.toISOString().split('T')[0] ?? null,
        payment_date: invoice.payment_date?.toISOString().split('T')[0] ?? null,
    })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json()

    // Only allow updating safe fields
    const allowed = ['pdf_url', 'status', 'payment_date', 'due_date', 'issued_date', 'reference']
    const data: Record<string, any> = {}
    for (const key of allowed) {
        if (body[key] !== undefined) data[key] = body[key]
    }

    if (Object.keys(data).length === 0)
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })

    // Convert date strings to Date objects (allow null to clear)
    if (data.payment_date === null) { /* keep null */ }
    else if (data.payment_date) data.payment_date = new Date(data.payment_date)
    if (data.due_date) data.due_date = new Date(data.due_date)
    if (data.issued_date) data.issued_date = new Date(data.issued_date)

    const invoice = await prisma.invoices.update({ where: { id }, data })

    return NextResponse.json({ success: true, id: invoice.id })
}
