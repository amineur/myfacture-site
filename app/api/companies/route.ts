import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companies = await prisma.companies.findMany({
        where: {
            OR: [
                { owner_id: session.user.id },
                { members: { some: { user_id: session.user.id, status: 'ACTIVE' } } },
            ],
        },
        orderBy: { created_at: 'desc' },
    })

    return NextResponse.json(companies)
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, handle, address } = await req.json()
    if (!name || !handle) {
        return NextResponse.json({ error: 'name et handle requis' }, { status: 400 })
    }

    const company = await prisma.companies.create({
        data: {
            name,
            handle,
            address: address || null,
            owner_id: session.user.id,
        },
    })

    // Auto-add owner as OWNER member
    await prisma.company_members.create({
        data: {
            company_id: company.id,
            user_id: session.user.id,
            role: 'OWNER',
            status: 'ACTIVE',
        },
    })

    return NextResponse.json(company, { status: 201 })
}
