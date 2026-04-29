import { prisma } from '@/utils/db'
import axios from 'axios'

const QONTO_CLIENT_ID = process.env.QONTO_CLIENT_ID
const QONTO_CLIENT_SECRET = process.env.QONTO_CLIENT_SECRET

export async function refreshQontoToken(companyId?: string) {
    if (!QONTO_CLIENT_ID || !QONTO_CLIENT_SECRET) {
        throw new Error('Missing Qonto OAuth Credentials (CLIENT_ID or CLIENT_SECRET not set)')
    }

    const creds = await prisma.qonto_credentials.findFirst({
        where: companyId ? { company_id: companyId } : {},
    })

    if (!creds) throw new Error('No Qonto Credentials found.')

    const params = new URLSearchParams()
    params.append('grant_type', 'refresh_token')
    params.append('refresh_token', creds.refresh_token)
    params.append('client_id', QONTO_CLIENT_ID)
    params.append('client_secret', QONTO_CLIENT_SECRET)

    const tokenRes = await axios.post('https://oauth.qonto.com/oauth2/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    const { access_token, refresh_token: new_refresh_token, expires_in } = tokenRes.data
    const safeExpiresIn = Math.max(0, expires_in - 300)
    const newExpiresAt = new Date(Date.now() + safeExpiresIn * 1000)

    await prisma.qonto_credentials.update({
        where: { id: creds.id },
        data: {
            access_token,
            refresh_token: new_refresh_token,
            expires_at: newExpiresAt,
        },
    })

    return access_token
}

export async function getValidQontoToken(companyId?: string) {
    if (!QONTO_CLIENT_ID || !QONTO_CLIENT_SECRET) {
        throw new Error('Missing Qonto OAuth Credentials')
    }

    const creds = await prisma.qonto_credentials.findFirst({
        where: companyId ? { company_id: companyId } : {},
    })

    if (!creds) throw new Error('Qonto Not Connected. Please connect Qonto in Settings.')

    const now = new Date()
    const expiresAt = new Date(creds.expires_at)

    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
        return await refreshQontoToken(companyId)
    }

    return creds.access_token
}
