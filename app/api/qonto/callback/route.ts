import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'
import axios from 'axios'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) return NextResponse.json({ error: `Qonto Auth Error: ${error}` }, { status: 400 })
    if (!code) return NextResponse.json({ error: 'No code provided' }, { status: 400 })

    const QONTO_CLIENT_ID = process.env.QONTO_CLIENT_ID
    const QONTO_CLIENT_SECRET = process.env.QONTO_CLIENT_SECRET
    const REDIRECT_URI = process.env.QONTO_REDIRECT_URI || 'http://localhost:3000/api/qonto/callback'
    const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    if (!QONTO_CLIENT_ID || !QONTO_CLIENT_SECRET) {
        return NextResponse.json({ error: 'Qonto Creds missing' }, { status: 500 })
    }

    try {
        const params = new URLSearchParams()
        params.append('grant_type', 'authorization_code')
        params.append('code', code)
        params.append('client_id', QONTO_CLIENT_ID)
        params.append('client_secret', QONTO_CLIENT_SECRET)
        params.append('redirect_uri', REDIRECT_URI)

        const oauthBase = process.env.QONTO_OAUTH_URL || 'https://oauth.qonto.com';
        const tokenRes = await axios.post(`${oauthBase}/oauth2/token`, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })

        const { access_token, refresh_token, expires_in } = tokenRes.data
        const expiresAt = new Date(Date.now() + expires_in * 1000)

        let companyId: string | undefined
        if (state) {
            try {
                const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
                companyId = stateData.companyId
            } catch {}
        }

        if (!companyId) {
            const session = await getServerSession(authOptions)
            if (session?.user?.id) {
                const member = await prisma.company_members.findFirst({
                    where: { user_id: session.user.id, status: 'ACTIVE' },
                })
                companyId = member?.company_id
            }
        }

        if (!companyId) {
            const company = await prisma.companies.findFirst()
            companyId = company?.id
        }

        if (!companyId) {
            return NextResponse.json({ error: 'No company found.' }, { status: 500 })
        }

        // Delete old credentials and insert new ones
        await prisma.qonto_credentials.deleteMany({ where: { company_id: companyId } })
        await prisma.qonto_credentials.create({
            data: { access_token, refresh_token, expires_at: expiresAt, company_id: companyId },
        })

        return NextResponse.redirect(`${BASE_URL}/settings?qonto_connected=true`)
    } catch (e: any) {
        return NextResponse.json({ error: 'Failed to exchange token', details: e.message }, { status: 500 })
    }
}
