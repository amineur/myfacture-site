import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        // Invoice 2511 880
        const inv = await prisma.invoices.findFirst({
            where: { reference: { contains: '2511 880' } },
            select: {
                id: true, reference: true, amount_ttc: true, status: true, payment_date: true,
                supplier: { select: { name: true, id: true } },
            },
        })

        // All unlinked VT Consult transactions at -898.80
        const unlinkedVT = await prisma.bank_transactions.findMany({
            where: {
                invoice_id: null,
                amount: { gte: -900, lte: -897 },
                side: 'DEBIT',
            },
            select: {
                id: true, label: true, amount: true, date: true, raw_data: true, invoice_id: true,
            },
            orderBy: { date: 'desc' },
        })

        // Also: all VT Consult -898.80 that are linked but check their raw_ref
        const allVT898 = await prisma.bank_transactions.findMany({
            where: {
                amount: { gte: -900, lte: -897 },
                side: 'DEBIT',
            },
            select: {
                id: true, label: true, amount: true, date: true, raw_data: true, invoice_id: true,
            },
            orderBy: { date: 'desc' },
        })

        // Find any tx whose raw_ref contains 2511880
        const matchingRef = allVT898.filter(tx => {
            const rd = tx.raw_data as any
            const ref = (rd?.reference || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
            return ref.includes('2511880')
        })

        return NextResponse.json({
            invoice_2511_880: inv ? { ...inv, amount_ttc: Number(inv.amount_ttc) } : null,
            unlinked_vt_consult_898: unlinkedVT.map(tx => ({
                id: tx.id, label: tx.label, amount: Number(tx.amount), date: tx.date,
                raw_reference: (tx.raw_data as any)?.reference || null,
            })),
            tx_with_rawref_2511880: matchingRef.map(tx => ({
                id: tx.id, label: tx.label, amount: Number(tx.amount), date: tx.date,
                invoice_id: tx.invoice_id,
                raw_reference: (tx.raw_data as any)?.reference || null,
            })),
            total_vt_898_count: allVT898.length,
            linked_count: allVT898.filter(t => t.invoice_id).length,
            unlinked_count: allVT898.filter(t => !t.invoice_id).length,
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
