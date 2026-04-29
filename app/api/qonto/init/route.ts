import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
    const QONTO_CLIENT_ID = process.env.QONTO_CLIENT_ID;
    const REDIRECT_URI = process.env.QONTO_REDIRECT_URI || 'http://localhost:3000/api/qonto/callback';

    if (!QONTO_CLIENT_ID) {
        return NextResponse.json({ error: 'QONTO_CLIENT_ID not configured' }, { status: 500 });
    }

    // Generate random state to prevent CSRF
    const state = uuidv4();

    // Minimal Supported Scopes based on user's app rights
    const scopes = [
        'offline_access',
        'organization.read',
        'payment.write'
    ].join(' ');

    const oauthBase = process.env.QONTO_OAUTH_URL || 'https://oauth.qonto.com';
    const authUrl = `${oauthBase}/oauth2/auth?response_type=code&client_id=${QONTO_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}&state=${state}`;

    return NextResponse.redirect(authUrl);
}
