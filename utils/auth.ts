import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './db'

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: 'credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                console.log('[Auth] Attempting login for:', credentials?.email?.toLowerCase());
                if (!credentials?.email || !credentials?.password) {
                    console.log('[Auth] Missing email or password');
                    return null;
                }

                try {
                    const user = await prisma.users.findUnique({
                        where: { email: credentials.email.toLowerCase() },
                    })

                    if (!user) {
                        console.log('[Auth] User not found in DB:', credentials.email.toLowerCase());
                        return null;
                    }

                    if (!user.password_hash) {
                        console.log('[Auth] User found but has no password_hash');
                        return null;
                    }

                    console.log('[Auth] Comparing passwords for:', user.email);
                    const isValid = await bcrypt.compare(credentials.password, user.password_hash)
                    
                    if (!isValid) {
                        console.log('[Auth] Password mismatch for:', user.email);
                        return null;
                    }

                    console.log('[Auth] Login successful for:', user.email);
                    return {
                        id: user.id,
                        email: user.email,
                        name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email,
                    }
                } catch (error) {
                    console.error('[Auth] Error during authorize:', error);
                    return null;
                }
            },
        }),
    ],
    debug: true,
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id
            }
            return token
        },
        async session({ session, token }) {
            if (token.id) {
                session.user.id = token.id as string
            }
            return session
        },
    },
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 jours
    },
    secret: process.env.NEXTAUTH_SECRET,
}
