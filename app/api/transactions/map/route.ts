import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/utils/auth';
import { prisma } from '@/utils/db';
import { runFullReconciliation } from '@/lib/reconciliation';

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const { companyId, supplierId, pattern, applyToExisting = true } = await req.json();

        if (!companyId || !supplierId || !pattern) {
            return NextResponse.json({ error: 'Données manquantes (companyId, supplierId, pattern)' }, { status: 400 });
        }

        // 1. Create or update the mapping rule
        const existing = await prisma.transaction_mapping_rules.findFirst({
            where: { company_id: companyId, pattern: pattern }
        });

        const rule = existing
            ? await prisma.transaction_mapping_rules.update({
                where: { id: existing.id },
                data: { supplier_id: supplierId },
            })
            : await prisma.transaction_mapping_rules.create({
                data: { company_id: companyId, pattern, supplier_id: supplierId },
            });

        let updatedCount = 0;
        let reconciledCount = 0;

        if (applyToExisting) {
            // 2. Apply pattern with flexible matching (normalized)
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normPattern = normalize(pattern);

            // Fetch all unassigned transactions and apply pattern flexibly
            const unassigned = await prisma.bank_transactions.findMany({
                where: { company_id: companyId, supplier_id: null },
            });

            for (const tx of unassigned) {
                if (normalize(tx.label).includes(normPattern)) {
                    await prisma.bank_transactions.update({
                        where: { id: tx.id },
                        data: { supplier_id: supplierId },
                    });
                    updatedCount++;
                }
            }

            // 3. Run full reconciliation pipeline
            const reconResult = await runFullReconciliation(companyId);
            reconciledCount = reconResult.reconciled;
        }

        return NextResponse.json({
            success: true,
            rule,
            updatedCount,
            reconciledCount,
            message: `${updatedCount} transactions mappées. ${reconciledCount} factures lettrées automatiquement.`
        });

    } catch (error: any) {
        console.error('Error in transaction mapping:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
