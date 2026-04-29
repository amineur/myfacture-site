"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Invoice } from "@/hooks/use-invoices";

type PaymentsContextType = {
    invoices: Invoice[];
    isLoading: boolean;
    error: string | null;
    fetchInvoices: (companyId: string) => Promise<void>;
    payInvoices: (ids: string[]) => Promise<void>;
    refresh: () => Promise<void>;
};

const PaymentsContext = createContext<PaymentsContextType | undefined>(undefined);

export function PaymentsProvider({ children }: { children: React.ReactNode }) {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastCompanyId, setLastCompanyId] = useState<string | null>(null);

    const isFetchingRef = React.useRef(false);
    const lastCompanyIdRef = React.useRef(lastCompanyId);
    const invoicesRef = React.useRef(invoices);

    React.useEffect(() => { lastCompanyIdRef.current = lastCompanyId; }, [lastCompanyId]);
    React.useEffect(() => { invoicesRef.current = invoices; }, [invoices]);

    const fetchInvoices = useCallback(async (companyId: string, force = false) => {
        if (!companyId) return;
        if (isFetchingRef.current) return;
        if (!force && lastCompanyIdRef.current === companyId && invoicesRef.current.length > 0) return;

        isFetchingRef.current = true;
        setIsLoading(true);
        setError(null);
        setLastCompanyId(companyId);

        try {
            const res = await fetch(`/api/invoices?companyId=${companyId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setInvoices(data || []);
        } catch (err: any) {
            setError(`Erreur chargement factures: ${err.message}`);
            setInvoices([]);
        } finally {
            isFetchingRef.current = false;
            setIsLoading(false);
        }
    }, []);

    const refresh = useCallback(async () => {
        if (lastCompanyId) await fetchInvoices(lastCompanyId, true);
    }, [lastCompanyId, fetchInvoices]);

    const payInvoices = useCallback(async (ids: string[]) => {
        const res = await fetch('/api/invoices', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, status: 'PAID', payment_date: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error(await res.text());
        await refresh();
    }, [refresh]);

    const value = useMemo(() => ({
        invoices, isLoading, error, fetchInvoices, payInvoices, refresh
    }), [invoices, isLoading, error, fetchInvoices, payInvoices, refresh]);

    return (
        <PaymentsContext.Provider value={value}>
            {children}
        </PaymentsContext.Provider>
    );
}

export function usePayments() {
    const context = useContext(PaymentsContext);
    if (context === undefined) throw new Error("usePayments must be used within a PaymentsProvider");
    return context;
}
