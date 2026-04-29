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

    const logs = await prisma.import_logs.findMany({
        where: { company_id: companyId },
        orderBy: { imported_at: 'desc' },
        take: 100,
    })

    const serialized = logs.map((l) => ({
        ...l,
        imported_at: l.imported_at?.toISOString() ?? null,
    }))

    return NextResponse.json(serialized)
}
