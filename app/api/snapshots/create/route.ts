import { prisma } from '@/utils/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/utils/auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { company_id, month_key, snapshot_date } = body;

        if (!company_id || !month_key || !snapshot_date) {
            return NextResponse.json(
                { error: 'Missing required fields: company_id, month_key, snapshot_date' },
                { status: 400 }
            );
        }

        const debts = await prisma.debts.findMany({
            where: { company_id, status: 'ACTIVE' },
            include: {
                supplier: { select: { id: true, name: true } },
                current_debts: { select: { total_due_amount: true, total_paid_amount: true } },
            },
        });

        const processedSuppliers = new Set<string>();
        let structuralRemaining = 0;
        let currentDebtRemaining = 0;
        let constatedDebtRemaining = 0;

        const totalDebtBalance = (debts || []).reduce((acc, d: any) => {
            const scheduleRemaining = Number(d.remaining_amount || 0);
            structuralRemaining += scheduleRemaining;

            let currentRemaining = 0;
            const supplierId = d.supplier?.id;
            if (supplierId && !processedSuppliers.has(supplierId)) {
                processedSuppliers.add(supplierId);
                const isStructured = Number(d.monthly_amount || 0) > 0;
                const fixedDebt = !isStructured ? Number(d.remaining_amount || 0) : 0;

                // Use first related current_debt if available
                const cTotal = Number(d.current_debts?.[0]?.total_due_amount || 0);
                const cPaid = Number(d.current_debts?.[0]?.total_paid_amount || 0);
                currentRemaining = (cTotal - cPaid) + fixedDebt;

                currentDebtRemaining += (cTotal - cPaid);
                constatedDebtRemaining += fixedDebt;
            }

            return acc + scheduleRemaining + currentRemaining;
        }, 0);

        // Upsert snapshot using updateMany + create pattern (no native upsert on compound key in Prisma)
        const existing = await prisma.monthly_debt_snapshots.findFirst({
            where: { company_id, month_key },
        });

        let snapshot;
        if (existing) {
            snapshot = await prisma.monthly_debt_snapshots.update({
                where: { id: existing.id },
                data: {
                    snapshot_date: new Date(snapshot_date),
                    total_debt_balance: totalDebtBalance,
                    structural_remaining: structuralRemaining,
                    current_debt_remaining: currentDebtRemaining,
                    constated_debt_remaining: constatedDebtRemaining,
                    updated_at: new Date(),
                },
            });
        } else {
            snapshot = await prisma.monthly_debt_snapshots.create({
                data: {
                    company_id,
                    month_key,
                    snapshot_date: new Date(snapshot_date),
                    total_debt_balance: totalDebtBalance,
                    structural_remaining: structuralRemaining,
                    current_debt_remaining: currentDebtRemaining,
                    constated_debt_remaining: constatedDebtRemaining,
                    updated_at: new Date(),
                },
            });
        }

        return NextResponse.json({
            success: true,
            snapshot,
            calculated: {
                total: totalDebtBalance,
                structural: structuralRemaining,
                current: currentDebtRemaining,
                constated: constatedDebtRemaining,
            },
        });
    } catch (error: any) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const company_id = searchParams.get('company_id');
        const month_key = searchParams.get('month_key');

        if (!company_id || !month_key) {
            return NextResponse.json({ error: 'Missing required params: company_id, month_key' }, { status: 400 });
        }

        const snapshot = await prisma.monthly_debt_snapshots.findFirst({
            where: { company_id, month_key },
        });

        return NextResponse.json({ snapshot: snapshot || null });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
