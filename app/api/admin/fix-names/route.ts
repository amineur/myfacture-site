import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const actions: string[] = []

    // Fix "Crédit Mutuelle" → "Crédit Mutuel"
    const cm = await prisma.bank_accounts.updateMany({
        where: { name: 'Crédit Mutuelle' },
        data: { name: 'Crédit Mutuel' },
    })
    if (cm.count > 0) actions.push(`Renamed ${cm.count} "Crédit Mutuelle" → "Crédit Mutuel"`)

    // Fix bank_type for non-Qonto accounts
    const extFix = await prisma.bank_accounts.updateMany({
        where: {
            name: { in: ['Crédit Mutuel', 'Banque Populaire'] },
            bank_type: 'QONTO',
        },
        data: { bank_type: 'OTHER' },
    })
    if (extFix.count > 0) actions.push(`Fixed bank_type to OTHER for ${extFix.count} external accounts`)

    if (actions.length === 0) actions.push('Nothing to fix')

    const accounts = await prisma.bank_accounts.findMany({ orderBy: { created_at: 'asc' } })
    return NextResponse.json({
        actions,
        accounts: accounts.map(a => ({ id: a.id, name: a.name, bank_type: a.bank_type, balance: Number(a.balance) })),
    })
}
