import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/utils/db'

export async function POST(req: NextRequest) {
    try {
        const { email, password, first_name, last_name } = await req.json()

        if (!email || !password) {
            return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
        }

        const existing = await prisma.users.findUnique({
            where: { email: email.toLowerCase() },
        })
        if (existing) {
            return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 })
        }

        const password_hash = await bcrypt.hash(password, 12)
        const user = await prisma.users.create({
            data: {
                email: email.toLowerCase(),
                password_hash,
                first_name: first_name || null,
                last_name: last_name || null,
            },
        })

        return NextResponse.json({ success: true, id: user.id })
    } catch (error: any) {
        console.error('Register error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
