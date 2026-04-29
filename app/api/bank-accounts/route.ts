import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')

    const accounts = await prisma.bank_accounts.findMany({
        where: companyId ? { company_id: companyId } : {},
        orderBy: { created_at: 'asc' },
    })

    const serialized = accounts.map((a) => ({
        ...a,
        balance: a.balance ? Number(a.balance) : 0,
        last_sync_at: a.last_sync_at?.toISOString() ?? null,
        created_at: a.created_at.toISOString(),
        updated_at: a.updated_at.toISOString(),
    }))

    return NextResponse.json(serialized)
}
