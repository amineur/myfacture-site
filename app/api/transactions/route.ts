import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const accountIds = searchParams.getAll('accountId')

    let where: any = {}
    if (accountIds.length === 1 && accountIds[0] !== 'all') {
        where.account_id = accountIds[0]
    } else if (accountIds.length > 1) {
        where.account_id = { in: accountIds }
    }

    const transactions = await prisma.bank_transactions.findMany({
        where,
        orderBy: { date: 'desc' },
        take: 200,
        select: {
            id: true,
            date: true,
            label: true,
            amount: true,
            side: true,
            status: true,
            account_id: true,
            company_id: true,
            supplier_id: true,
            invoice_id: true,
            raw_data: true,
            supplier: { select: { id: true, name: true, logo_url: true } },
            invoice: { select: { id: true, reference: true } },
        },
    })

    const serialized = transactions.map((t) => {
        // Extraire uniquement les champs utiles de raw_data (peut être très lourd)
        const raw = (t.raw_data && typeof t.raw_data === 'object') ? t.raw_data as any : {}
        const lightRaw = {
            'Counterparty name': raw['Counterparty name'] || undefined,
            reference: raw.reference || raw.Reference || undefined,
            cashflow_category: raw.cashflow_category?.name ? { name: raw.cashflow_category.name } : undefined,
            cashflow_subcategory: raw.cashflow_subcategory?.name ? { name: raw.cashflow_subcategory.name } : undefined,
            note: raw.note || undefined,
        }

        return {
            id: t.id,
            date: t.date?.toISOString() ?? null,
            label: t.label,
            amount: Number(t.amount),
            side: t.side,
            status: t.status,
            account_id: t.account_id,
            company_id: t.company_id,
            supplier_id: t.supplier_id,
            invoice_id: t.invoice_id,
            raw_data: lightRaw,
            supplier: t.supplier ?? null,
            invoice: t.invoice ?? null,
        }
    })

    const res = NextResponse.json(serialized)
    res.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=30')
    return res
}

/**
 * POST: Add a manual bank transaction
 * Body: { date, amount, label, side?, supplier_name?, account_name?, raw_data? }
 */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const body = await req.json()
        const { date, amount, label, side, supplier_name, account_name, raw_data } = body

        if (!date || amount === undefined || !label) {
            return NextResponse.json({ error: 'Missing required fields: date, amount, label' }, { status: 400 })
        }

        const company = await prisma.companies.findFirst()
        if (!company) return NextResponse.json({ error: 'No company found' }, { status: 404 })

        // Find supplier if provided
        let supplier_id: string | null = null
        if (supplier_name) {
            const supplier = await prisma.suppliers.findFirst({
                where: { company_id: company.id, name: { contains: supplier_name, mode: 'insensitive' } },
            })
            if (supplier) supplier_id = supplier.id
        }

        // Find bank account if provided
        let account_id: string | null = null
        if (account_name) {
            const account = await prisma.bank_accounts.findFirst({
                where: { company_id: company.id, name: { contains: account_name, mode: 'insensitive' } },
            })
            if (account) account_id = account.id
        }

        const tx = await prisma.bank_transactions.create({
            data: {
                external_id: `manual_${Date.now()}`,
                company_id: company.id,
                account_id,
                date: new Date(date),
                amount: Number(amount),
                label,
                side: (side || (Number(amount) < 0 ? 'DEBIT' : 'CREDIT')) as any,
                supplier_id,
                raw_data: raw_data || { source: 'manual', note: label },
            },
        })

        return NextResponse.json({ success: true, id: tx.id })
    } catch (error: any) {
        console.error('Error creating transaction:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
