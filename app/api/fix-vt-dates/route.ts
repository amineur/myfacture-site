import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/utils/db'
import { endOfMonth, addDays, parse } from 'date-fns'

export async function POST(req: NextRequest) {
    try {
        const supplierId = 'e7108bd9-b125-41f3-b2ce-a85e7d29290b'; // VT Consult

        const invoices = await prisma.invoices.findMany({
            where: { supplier_id: supplierId },
        });

        let updatedCount = 0;

        for (const invoice of invoices) {
            if (!invoice.reference) continue;

            // Pattern: YYMM XXX (e.g., 2603 181)
            const match = invoice.reference.match(/^(\d{2})(\d{2})\s/);
            if (match) {
                const year = 2000 + parseInt(match[1]);
                const month = parseInt(match[2]);
                
                // Real date is last day of that month
                const correctIssuedDate = endOfMonth(new Date(year, month - 1));
                const correctDueDate = addDays(correctIssuedDate, 30);

                await prisma.invoices.update({
                    where: { id: invoice.id },
                    data: {
                        issued_date: correctIssuedDate,
                        due_date: correctDueDate,
                    }
                });
                updatedCount++;
            }
        }

        return NextResponse.json({ success: true, updatedCount });
    } catch (error: any) {
        console.error('Error fixing VT dates:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
