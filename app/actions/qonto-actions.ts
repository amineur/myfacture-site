'use server';

import { prisma } from '@/utils/db';

export async function checkQontoConnectionAction(companyId?: string) {
    try {
        const credentials = await prisma.qonto_credentials.findFirst({
            where: companyId ? { company_id: companyId } : {},
            select: { refresh_token: true, expires_at: true },
        });

        if (!credentials || !credentials.refresh_token?.trim()) {
            return { connected: false };
        }

        try {
            const { refreshQontoToken } = await import('@/utils/qonto-token');
            await refreshQontoToken(companyId);
            return { connected: true, expiresAt: credentials.expires_at };
        } catch (e) {
            console.error('Qonto refresh_token is invalid:', e);
            return { connected: false, error: 'Token expired or invalid' };
        }
    } catch (e) {
        return { connected: false };
    }
}
