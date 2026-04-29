import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'
import bcrypt from 'bcryptjs'

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.users.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            job_title: true,
            avatar_url: true,
            created_at: true,
        },
    })

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { first_name, last_name, job_title, email, newPassword } = body

    const updateData: any = {}
    if (first_name !== undefined) updateData.first_name = first_name
    if (last_name !== undefined) updateData.last_name = last_name
    if (job_title !== undefined) updateData.job_title = job_title
    if (email !== undefined) updateData.email = email
    if (newPassword) updateData.password_hash = await bcrypt.hash(newPassword, 12)

    const user = await prisma.users.update({
        where: { id: session.user.id },
        data: updateData,
        select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true,
            job_title: true,
            avatar_url: true,
        },
    })

    return NextResponse.json(user)
}
