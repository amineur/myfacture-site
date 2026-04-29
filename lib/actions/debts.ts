import { prisma } from '@/utils/db';
import { addMonths, isBefore } from 'date-fns';

/**
 * STRICT IMPLEMENTATION OF "DETTE COURANTE" (LIVING CYCLE)
 */
export async function syncCurrentDebt(companyId: string, supplierId: string) {
    const allUnpaidOrPartial = await prisma.invoices.findMany({
        where: {
            company_id: companyId,
            supplier_id: supplierId,
            status: { not: 'PAID' },
        },
        include: {
            payments: { select: { amount: true } },
        },
    });

    const today = new Date();

    const eligibleInvoices = allUnpaidOrPartial.filter(inv => {
        if (!inv.issued_date) return false;
        const sumPayments = inv.payments?.reduce((s: number, p: any) => s + Number(p.amount || 0), 0) || 0;
        if (sumPayments >= Number(inv.amount_ttc || 0)) return false;
        const triggerDate = addMonths(inv.issued_date, 2);
        return isBefore(triggerDate, today);
    });

    const currentDebt = await prisma.current_debts.findFirst({
        where: { company_id: companyId, supplier_id: supplierId, status: 'ACTIVE' },
    });

    if (!currentDebt) {
        if (eligibleInvoices.length === 0) return;

        eligibleInvoices.sort((a, b) => new Date(a.issued_date!).getTime() - new Date(b.issued_date!).getTime());
        const oldest = eligibleInvoices[0];
        const openedAt = addMonths(oldest.issued_date!, 2);

        const invoiceIds = eligibleInvoices.map(i => i.id);
        const stats = calculateStats(eligibleInvoices);

        await prisma.current_debts.create({
            data: {
                company_id: companyId,
                supplier_id: supplierId,
                status: 'ACTIVE',
                triggered_at: openedAt,
                invoice_ids: invoiceIds,
                total_due_amount: stats.totalDue,
                total_paid_amount: stats.totalPaid,
                initial_unpaid_count: invoiceIds.length,
                initial_unpaid_total: stats.totalDue,
                updated_at: new Date(),
            },
        });
        return;
    }

    const trackedIds = (currentDebt.invoice_ids as string[]) || [];
    const newEligibleIds = eligibleInvoices.map(i => i.id);
    const allIds = Array.from(new Set([...trackedIds, ...newEligibleIds]));

    const allLinked = await prisma.invoices.findMany({
        where: { id: { in: allIds } },
        include: { payments: { select: { amount: true } } },
    });

    const stats = calculateStats(allLinked);
    const remaining = Math.max(stats.totalDue - stats.totalPaid, 0);

    if (remaining <= 0.01) {
        await prisma.current_debts.update({
            where: { id: currentDebt.id },
            data: {
                status: 'CLOSED',
                closed_at: new Date(),
                invoice_ids: allIds,
                total_due_amount: stats.totalDue,
                total_paid_amount: stats.totalPaid,
                updated_at: new Date(),
            },
        });
        console.log(`[Sync] Closed debt for ${supplierId} (Balance: ${remaining}€)`);
    } else {
        await prisma.current_debts.update({
            where: { id: currentDebt.id },
            data: {
                invoice_ids: allIds,
                total_due_amount: stats.totalDue,
                total_paid_amount: stats.totalPaid,
                updated_at: new Date(),
            },
        });
    }
}

function calculateStats(invoices: any[]) {
    let totalDue = 0;
    let totalPaid = 0;
    invoices.forEach(inv => {
        const amount = Number(inv.amount_ttc || 0);
        const paid = inv.payments?.reduce((s: number, p: any) => s + Number(p.amount || 0), 0) || 0;
        totalDue += amount;
        totalPaid += paid;
    });
    return { totalDue, totalPaid };
}

export async function recordPayment(companyId: string, supplierId: string, amount: number, date: string, method: string, invoiceId?: string) {
    if (invoiceId) {
        await prisma.payments.create({
            data: {
                company_id: companyId,
                supplier_id: supplierId,
                invoice_id: invoiceId,
                amount,
                payment_date: new Date(date),
                payment_method: method,
            },
        });
        await syncCurrentDebt(companyId, supplierId);
        return;
    }

    const debt = await prisma.current_debts.findFirst({
        where: { company_id: companyId, supplier_id: supplierId, status: 'ACTIVE' },
    });

    if (!debt || !debt.invoice_ids) {
        await prisma.payments.create({
            data: {
                company_id: companyId,
                supplier_id: supplierId,
                amount,
                payment_date: new Date(date),
                payment_method: method,
            },
        });
        return;
    }

    const invoiceIds = debt.invoice_ids as string[];
    const invoices = await prisma.invoices.findMany({
        where: { id: { in: invoiceIds } },
        include: { payments: { select: { amount: true } } },
        orderBy: { issued_date: 'asc' },
    });

    let remainingToAllocate = amount;
    for (const inv of invoices) {
        if (remainingToAllocate <= 0) break;
        const paid = inv.payments?.reduce((s: number, p: any) => s + Number(p.amount || 0), 0) || 0;
        const due = Number(inv.amount_ttc || 0) - paid;
        if (due > 0) {
            const alloc = Math.min(due, remainingToAllocate);
            await prisma.payments.create({
                data: {
                    company_id: companyId,
                    supplier_id: supplierId,
                    invoice_id: inv.id,
                    amount: alloc,
                    payment_date: new Date(date),
                    payment_method: method,
                    notes: 'Auto-allocation',
                },
            });
            remainingToAllocate -= alloc;
        }
    }

    if (remainingToAllocate > 0) {
        await prisma.payments.create({
            data: {
                company_id: companyId,
                supplier_id: supplierId,
                amount: remainingToAllocate,
                payment_date: new Date(date),
                payment_method: method,
                notes: 'Reste non alloué',
            },
        });
    }

    await syncCurrentDebt(companyId, supplierId);
}
