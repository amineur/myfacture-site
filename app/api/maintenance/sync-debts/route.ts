import { prisma } from '@/utils/db';
import { syncCurrentDebt } from '@/lib/actions/debts';
import { NextResponse } from 'next/server';

export async function GET() {
    const companies = await prisma.companies.findMany({ select: { id: true } });

    if (!companies.length) return NextResponse.json({ success: true, count: 0 });

    let count = 0;

    for (const company of companies) {
        const suppliers = await prisma.suppliers.findMany({
            where: { company_id: company.id },
            select: { id: true },
        });

        for (const s of suppliers) {
            try {
                await syncCurrentDebt(company.id, s.id);
                count++;
            } catch (e) {
                console.error(`Sync failed for ${s.id}`, e);
            }
        }
    }

    return NextResponse.json({ success: true, count });
}
