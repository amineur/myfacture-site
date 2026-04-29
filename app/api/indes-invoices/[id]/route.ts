import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

/**
 * PATCH /api/indes-invoices/[id]
 *
 * Update an invoice imported from Les Indés — typically to correct
 * category or amount on needs_review invoices.
 *
 * Body: { category?: string, amount_ttc?: number }
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json()

    // Fetch existing invoice
    const existing = await prisma.invoices.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const currentMeta = (existing.metadata as Record<string, any>) || {}

    // Build updated metadata
    const updatedMeta = { ...currentMeta }
    if (body.category !== undefined) {
        updatedMeta.category = body.category
    }

    // Re-evaluate needs_review: clear if both category and amount are now present
    const newAmountTTC = body.amount_ttc !== undefined ? body.amount_ttc : Number(existing.amount_ttc)
    const hasCategory = !!updatedMeta.category
    const hasAmount = !!newAmountTTC
    const hasDate = !!existing.issued_date

    if (hasCategory && hasAmount && hasDate) {
        updatedMeta.needs_review = false
        updatedMeta.review_reasons = []
    } else {
        updatedMeta.needs_review = true
        updatedMeta.review_reasons = [
            ...(!hasCategory ? ['catégorie manquante'] : []),
            ...(!hasAmount ? ['montant TTC manquant'] : []),
            ...(!hasDate ? ['date émission manquante'] : []),
        ]
    }

    // Build update data
    const data: Record<string, any> = { metadata: updatedMeta }
    if (body.amount_ttc !== undefined) {
        data.amount_ttc = Math.abs(body.amount_ttc)
    }

    const updated = await prisma.invoices.update({ where: { id }, data })

    return NextResponse.json({
        success: true,
        id: updated.id,
        needs_review: updatedMeta.needs_review,
    })
}
