import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/utils/db'
import { addDays } from 'date-fns'

export async function POST(req: NextRequest) {
    try {
        const references = [
            '20392138', '20391997', 
            '20388784', '20388878', 
            '20386303', '20386397'
        ];

        const invoices = await prisma.invoices.findMany({
            where: {
                reference: { in: references }
            }
        });

        let updatedCount = 0;
        for (const invoice of invoices) {
            const paymentDate = addDays(new Date(invoice.issued_date), 30);
            
            await prisma.invoices.update({
                where: { id: invoice.id },
                data: {
                    status: 'PAID',
                    payment_date: paymentDate
                }
            });
            updatedCount++;
        }

        return NextResponse.json({ success: true, updatedCount });
    } catch (error: any) {
        console.error('Error fixing invoices:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
