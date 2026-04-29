import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

export const prisma =
    globalForPrisma.prisma ??
    (() => {
        const connectionString = process.env.DATABASE_URL || 'postgresql://dummy:password@localhost:5432/dummy'
        console.log('🔌 Connecting to database:', connectionString.replace(/:[^:@]+@/, ':****@'))
        const pool = new Pool({ connectionString })
        const adapter = new PrismaPg(pool)
        return new PrismaClient({
            adapter,
            log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        })
    })()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
