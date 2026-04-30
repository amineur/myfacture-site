"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

export type Debt = {
    id: string
    company_id: string
    supplier: { name: string, id: string, logo_url?: string | null } | null
    debt_category: { name: string, color?: string } | null
    initial_amount: number
    remaining_amount: number
    monthly_amount: number
    start_date: string
    end_date: string
    interest_rate: number
    contract_ref: string
    status: 'ACTIVE' | 'PAID' | 'CANCELLED'
    current_debt?: {
        id: string
        initial_unpaid_count: number
        initial_unpaid_total: number
        triggered_at: string
        total_amount?: number
        paid_amount?: number
        invoice_ids?: string[]
    } | null
}

type DebtsContextType = {
    debts: Debt[];
    isLoading: boolean;
    fetchDebts: (companyId: string) => Promise<void>;
    refresh: () => Promise<void>;
};

const DebtsContext = createContext<DebtsContextType | undefined>(undefined);

// Module-level cache: instant data on navigation, background refresh
const debtsCache: { data: Debt[] | null; companyId: string | null; timestamp: number } = {
    data: null, companyId: null, timestamp: 0,
};
const DEBTS_CACHE_TTL = 30_000; // 30 seconds

export function DebtsProvider({ children }: { children: React.ReactNode }) {
    const cached = debtsCache.companyId !== null && debtsCache.data;
    const [debts, setDebts] = useState<Debt[]>(cached ? debtsCache.data! : []);
    const [isLoading, setIsLoading] = useState(!cached);
    const [lastCompanyId, setLastCompanyId] = useState<string | null>(debtsCache.companyId);

    const isFetchingRef = React.useRef(false);
    const lastCompanyIdRef = React.useRef(lastCompanyId);
    const debtsRef = React.useRef(debts);

    React.useEffect(() => { lastCompanyIdRef.current = lastCompanyId; }, [lastCompanyId]);
    React.useEffect(() => { debtsRef.current = debts; }, [debts]);

    const fetchDebts = useCallback(async (companyId: string, force = false) => {
        if (!companyId) return;
        if (isFetchingRef.current) return;

        // Return cached data if fresh
        const isCacheFresh = debtsCache.companyId === companyId && (Date.now() - debtsCache.timestamp) < DEBTS_CACHE_TTL;
        if (!force && isCacheFresh && debtsCache.data) {
            if (lastCompanyIdRef.current !== companyId || debtsRef.current.length === 0) {
                setDebts(debtsCache.data);
                setLastCompanyId(companyId);
                setIsLoading(false);
            }
            return;
        }
        if (!force && lastCompanyIdRef.current === companyId && debtsRef.current.length > 0) return;

        isFetchingRef.current = true;
        setIsLoading(true);
        setLastCompanyId(companyId);

        try {
            const res = await fetch(`/api/debts-data?companyId=${companyId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const { debts: rawDebts, currentDebts: rawCurrentDebts } = await res.json();

            const currentDebtsMap = new Map();
            rawCurrentDebts?.forEach((cd: any) => {
                currentDebtsMap.set(cd.supplier_id, {
                    id: cd.id,
                    initial_unpaid_count: cd.initial_unpaid_count,
                    initial_unpaid_total: cd.initial_unpaid_total,
                    triggered_at: cd.triggered_at,
                    total_amount: cd.total_amount,
                    paid_amount: cd.paid_amount,
                    invoice_ids: cd.invoice_ids,
                    _full_record: cd
                });
            });

            const formattedDebts = rawDebts?.map((d: any) => ({
                ...d,
                initial_amount: d.total_amount,
                remaining_amount: d.remaining_amount,
                debt_category: { name: d.supplier?.category || 'Autre' },
                current_debt: d.supplier?.id ? currentDebtsMap.get(d.supplier.id) : null
            })) || [];

            const activeSupplierIds = new Set(formattedDebts.map((d: any) => d.supplier?.id));
            rawCurrentDebts?.forEach((cd: any) => {
                if (!activeSupplierIds.has(cd.supplier_id)) {
                    formattedDebts.push({
                        id: `synthetic-${cd.id}`,
                        company_id: cd.company_id,
                        supplier: cd.supplier,
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
                            total_amount: cd.total_amount,
                            paid_amount: cd.paid_amount,
                            invoice_ids: cd.invoice_ids
                        }
                    });
                }
            });

            debtsCache.data = formattedDebts;
            debtsCache.companyId = companyId;
            debtsCache.timestamp = Date.now();
            setDebts(formattedDebts);
        } catch (e) {
            console.error('[fetchDebts] error:', e);
        } finally {
            isFetchingRef.current = false;
            setIsLoading(false);
        }
    }, []);

    const refresh = useCallback(async () => {
        if (lastCompanyId) await fetchDebts(lastCompanyId, true);
    }, [lastCompanyId, fetchDebts]);

    const value = useMemo(() => ({ debts, isLoading, fetchDebts, refresh }), [debts, isLoading, fetchDebts, refresh]);

    return (
        <DebtsContext.Provider value={value}>
            {children}
        </DebtsContext.Provider>
    );
}

export function useDebtsContext() {
    const context = useContext(DebtsContext);
    if (context === undefined) throw new Error("useDebtsContext must be used within a DebtsProvider");
    return context;
}
