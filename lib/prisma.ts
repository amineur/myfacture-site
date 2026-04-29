// Legacy Prisma stub - actual Prisma client is in utils/db.ts
// This file is kept for compatibility but exports an empty stub.

const prismaClientSingleton = () => {
    return {} as any;
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
