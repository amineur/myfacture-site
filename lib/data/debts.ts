import { prisma } from '@/utils/db';

export async function getDebts(companyId: string) {
    const [debtsData, currentDebtsData] = await Promise.all([
        prisma.debts.findMany({
            where: { company_id: companyId },
            include: { supplier: { select: { id: true, name: true, category: true, logo_url: true } } },
            orderBy: { end_date: 'asc' },
        }),
        prisma.current_debts.findMany({
            where: { company_id: companyId, status: 'ACTIVE' },
            include: { supplier: { select: { id: true, name: true, logo_url: true, category: true } } },
        }),
    ]);

    const serialize = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'bigint') return Number(obj);
        if (obj instanceof Date) return obj.toISOString();
        if (Array.isArray(obj)) return obj.map(serialize);
        if (typeof obj === 'object') return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, serialize(v)]));
        if (obj?.toNumber) return obj.toNumber();
        return obj;
    };

    const currentDebtsMap = new Map();
    currentDebtsData.forEach((cd: any) => {
        currentDebtsMap.set(cd.supplier_id, {
            id: cd.id,
            initial_unpaid_count: cd.initial_unpaid_count,
            initial_unpaid_total: cd.initial_unpaid_total,
            triggered_at: cd.triggered_at,
            total_amount: Number(cd.total_due_amount || 0),
            paid_amount: Number(cd.total_paid_amount || 0),
            invoice_ids: cd.invoice_ids,
        });
    });

    const formattedDebts = debtsData.map((d: any) => ({
        ...serialize(d),
        initial_amount: Number(d.total_amount || 0),
        remaining_amount: Number(d.remaining_amount || 0),
        debt_category: { name: d.supplier?.category || 'Autre' },
        current_debt: d.supplier?.id ? (currentDebtsMap.get(d.supplier.id) || null) : null,
    }));

    const activeSupplierIds = new Set(formattedDebts.map((d: any) => d.supplier?.id));

    currentDebtsData.forEach((cd: any) => {
        if (!activeSupplierIds.has(cd.supplier_id)) {
            formattedDebts.push({
                id: `synthetic-${cd.id}`,
                company_id: cd.company_id,
                supplier: serialize(cd.supplier),
                debt_category: { name: cd.supplier?.category || 'Autre' },
                initial_amount: 0,
                remaining_amount: 0,
                monthly_amount: 0,
                start_date: cd.triggered_at,
                end_date: '',
                interest_rate: 0,
                contract_ref: 'DETTE COURANTE',
                status: 'ACTIVE',
                current_debt: {
                    id: cd.id,
                    initial_unpaid_count: cd.initial_unpaid_count,
                    initial_unpaid_total: cd.initial_unpaid_total,
                    triggered_at: cd.triggered_at,
                    total_amount: Number(cd.total_due_amount || 0),
                    paid_amount: Number(cd.total_paid_amount || 0),
                    invoice_ids: cd.invoice_ids,
                },
            });
        }
    });

    return formattedDebts;
}
