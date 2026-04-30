"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

export type SupplierSpend = {
    supplier_id: string
    company_id: string
    supplier_name: string
    supplier_category: string
    logo_url?: string | null
    total_spend: number
    total_spend_year?: number
    total_paid: number
    total_unpaid: number
    invoices_count: number
    invoices_count_year?: number
    last_invoice_date?: string
    average_delay: number
    current_max_delay: number
}

type SuppliersContextType = {
    suppliers: SupplierSpend[];
    isLoading: boolean;
    fetchSuppliers: (companyId: string) => Promise<void>;
    refresh: () => Promise<void>;
};

const SuppliersContext = createContext<SuppliersContextType | undefined>(undefined);

// Module-level cache: instant data on navigation, background refresh
const suppliersCache: { data: SupplierSpend[] | null; companyId: string | null; timestamp: number } = {
    data: null, companyId: null, timestamp: 0,
};
const SUPPLIERS_CACHE_TTL = 30_000; // 30 seconds

export function SuppliersProvider({ children }: { children: React.ReactNode }) {
    const cached = suppliersCache.companyId !== null && suppliersCache.data;
    const [suppliers, setSuppliers] = useState<SupplierSpend[]>(cached ? suppliersCache.data! : []);
    const [isLoading, setIsLoading] = useState(!cached);
    const [lastCompanyId, setLastCompanyId] = useState<string | null>(suppliersCache.companyId);

    const isFetchingRef = React.useRef(false);
    const lastCompanyIdRef = React.useRef(lastCompanyId);

    React.useEffect(() => { lastCompanyIdRef.current = lastCompanyId; }, [lastCompanyId]);

    const fetchSuppliers = useCallback(async (companyId: string, force = false) => {
        if (!companyId) return;
        if (isFetchingRef.current) return;

        // Return cached data if fresh
        const isCacheFresh = suppliersCache.companyId === companyId && (Date.now() - suppliersCache.timestamp) < SUPPLIERS_CACHE_TTL;
        if (!force && isCacheFresh && suppliersCache.data) {
            if (lastCompanyIdRef.current !== companyId) {
                setSuppliers(suppliersCache.data);
                setLastCompanyId(companyId);
            }
            return;
        }
        if (!force && lastCompanyIdRef.current === companyId && suppliersCache.data) return;

        isFetchingRef.current = true;
        setIsLoading(true);
        setLastCompanyId(companyId);

        try {
            const res = await fetch(`/api/suppliers-data?companyId=${companyId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            const targetYear = currentMonth === 0 ? currentYear - 1 : currentYear;

            const processed: SupplierSpend[] = (data || []).map((s: any) => {
                const invoices = s.invoices || [];

                const totalPaid = invoices.filter((i: any) => i.status === 'PAID').reduce((sum: number, i: any) => sum + (i.amount_ttc || 0), 0);
                const totalUnpaid = invoices.filter((i: any) => i.status !== 'PAID' && i.status !== 'CANCELLED').reduce((sum: number, i: any) => sum + (i.amount_ttc || 0), 0);

                const paidInvoices = invoices.filter((i: any) => i.status === 'PAID' && i.payment_date && i.due_date);
                const totalDelay = paidInvoices.reduce((sum: number, i: any) => {
                    const diff = new Date(i.payment_date).getTime() - new Date(i.due_date).getTime();
                    return sum + Math.ceil(diff / (1000 * 60 * 60 * 24));
                }, 0);
                const averageDelay = paidInvoices.length > 0 ? totalDelay / paidInvoices.length : 0;

                const unpaid = invoices.filter((i: any) => i.status !== 'PAID' && i.status !== 'CANCELLED');
                const oldestDue = unpaid.reduce((oldest: any, i: any) => {
                    if (!i.due_date) return oldest;
                    return !oldest || new Date(i.due_date) < new Date(oldest.due_date) ? i : oldest;
                }, null);
                const currentMaxDelay = oldestDue?.due_date ? Math.ceil((now.getTime() - new Date(oldestDue.due_date).getTime()) / (1000 * 60 * 60 * 24)) : 0;

                const yearInvoices = invoices.filter((i: any) => i.issued_date && new Date(i.issued_date).getFullYear() === targetYear);

                return {
                    supplier_id: s.id,
                    company_id: s.company_id,
                    supplier_name: s.name,
                    supplier_category: s.category || 'Autre',
                    logo_url: s.logo_url,
                    total_spend: totalPaid + totalUnpaid,
                    total_spend_year: yearInvoices.filter((i: any) => i.status !== 'CANCELLED').reduce((sum: number, i: any) => sum + (i.amount_ttc || 0), 0),
                    total_paid: totalPaid,
                    total_unpaid: totalUnpaid,
                    invoices_count: invoices.length,
                    invoices_count_year: yearInvoices.length,
                    last_invoice_date: invoices.reduce((latest: any, i: any) => !latest || new Date(i.issued_date) > new Date(latest) ? i.issued_date : latest, null),
                    average_delay: averageDelay,
                    current_max_delay: currentMaxDelay,
                };
            });

            processed.sort((a, b) => b.total_spend - a.total_spend);
            suppliersCache.data = processed;
            suppliersCache.companyId = companyId;
            suppliersCache.timestamp = Date.now();
            setSuppliers(processed);
        } catch (err) {
            console.error('[fetchSuppliers] error:', err);
        } finally {
            isFetchingRef.current = false;
            setIsLoading(false);
        }
    }, []);

    const refresh = useCallback(async () => {
        if (lastCompanyId) await fetchSuppliers(lastCompanyId, true);
    }, [lastCompanyId, fetchSuppliers]);

    const value = useMemo(() => ({ suppliers, isLoading, fetchSuppliers, refresh }), [suppliers, isLoading, fetchSuppliers, refresh]);

    return (
        <SuppliersContext.Provider value={value}>
            {children}
        </SuppliersContext.Provider>
    );
}

export function useSuppliersContext() {
    const context = useContext(SuppliersContext);
    if (context === undefined) throw new Error("useSuppliersContext must be used within a SuppliersProvider");
    return context;
}
