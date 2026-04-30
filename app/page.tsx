"use client"
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, TrendingUp, AlertCircle, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanies } from "@/components/providers/companies-provider";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { PriceDisplay } from "@/components/ui/price-display";
import { ExpensesBreakdown } from "@/components/dashboard/expenses-breakdown";
import { useSuppliersContext } from "@/components/providers/suppliers-provider";
import { usePayments } from "@/components/providers/payments-provider";
// import { formatCurrency } from "@/lib/utils";

const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
}
// Force Rebuild Trigger

export default function Dashboard() {
    const { companies, isLoading: loadingCompanies } = useCompanies();
    const activeCompany = companies[0];
    const { fetchSuppliers } = useSuppliersContext();
    const { fetchInvoices } = usePayments();

    // Prefetch suppliers & invoices data in background for instant navigation
    useEffect(() => {
        if (activeCompany?.id) {
            // Use requestIdleCallback to avoid blocking the main thread
            const prefetch = () => {
                fetchSuppliers(activeCompany.id);
                fetchInvoices(activeCompany.id);
            };
            if ('requestIdleCallback' in window) {
                (window as any).requestIdleCallback(prefetch);
            } else {
                setTimeout(prefetch, 100);
            }
        }
    }, [activeCompany?.id, fetchSuppliers, fetchInvoices]);

    const {
        cashBalance,
        unpaidInvoicesCount,
        unpaidInvoicesAmount,
        monthlySpend,
        nextDebt,
        totalDue,
        averagePaymentDelay,
        isLoading: loadingStats
    } = useDashboardStats(activeCompany?.id);

    // 1. Hydration Safety (Flicker-free)
    const [isMounted, setIsMounted] = useState(() => typeof window !== "undefined" && (window as any).__HYDRATED);
    const [userName, setUserName] = useState(() => {
        if (typeof window !== 'undefined') return (window as any).__CACHED_USERNAME || '';
        return '';
    });
    useEffect(() => {
        setIsMounted(true);
        (window as any).__HYDRATED = true;
    }, []);

    // Fetch user name from profile (with cache)
    useEffect(() => {
        if ((window as any).__CACHED_USERNAME) {
            setUserName((window as any).__CACHED_USERNAME);
            return;
        }
        const fetchUserName = async () => {
            try {
                const res = await fetch('/api/profile');
                if (res.ok) {
                    const profile = await res.json();
                    const name = profile?.first_name || profile?.email?.split('@')[0] || '';
                    setUserName(name);
                    (window as any).__CACHED_USERNAME = name;
                }
            } catch (e) {
                console.error('Failed to fetch user name:', e);
            }
        };
        fetchUserName();
    }, []);

    const isLoading = !isMounted || loadingCompanies || loadingStats;

    return (
        <main className={cn(
            "p-6 max-w-md mx-auto space-y-8 pb-24 transition-opacity duration-300",
            isMounted ? "opacity-100" : "opacity-0"
        )}>
            {/* Header */}
            <header>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Bonjour, {userName}</h1>
                    <div className="h-5 flex items-center">
                        {(!isMounted || loadingCompanies) ? (
                            <div className="h-4 w-32 bg-gray-100 animate-pulse rounded mt-1" />
                        ) : (
                            <p className="text-sm text-gray-500">
                                {activeCompany ? activeCompany.name : "Aperçu financier"}
                            </p>
                        )}
                    </div>
                </div>
            </header>

            {/* Hero Card - Runway/Cash */}
            <section>
                <Card className="bg-black text-white dark:bg-zinc-900 border-none relative overflow-hidden shadow-2xl shadow-blue-900/20 min-h-[160px]">
                    <div className="relative z-10 p-6">
                        <span className="text-sm font-medium opacity-80">Trésorerie (Solde Qonto)</span>
                        <div className="mt-2 h-10 flex items-baseline gap-2">
                            {isLoading ? (
                                <div className="h-9 w-32 bg-white/20 animate-pulse rounded-lg" />
                            ) : (
                                <PriceDisplay
                                    amount={cashBalance}
                                    size="4xl"
                                    className={cashBalance < 0 ? 'text-red-400' : 'text-white'}
                                    mutedColor={cashBalance < 0 ? 'text-red-300/60' : 'text-white/60'}
                                />
                            )}
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-400">
                            <TrendingUp className="h-4 w-4" />
                            <span>Mise à jour temps réel</span>
                        </div>
                    </div>
                    {/* Abstract decoration */}
                    <div className="absolute top-0 right-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-blue-500 opacity-20 blur-3xl" />
                </Card>
            </section>

            {/* Action Widget - Urgent */}
            <section className="space-y-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Actions requises</h2>

                {/* Factures à payer */}
                <Card className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors border-l-4 border-l-red-500 shadow-sm h-[88px]">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="h-5 flex items-center">
                                {isLoading ? (
                                    <div className="h-4 w-32 bg-gray-100 animate-pulse rounded" />
                                ) : (
                                    <p className="font-bold text-gray-900">
                                        {unpaidInvoicesCount} Factures à payer
                                    </p>
                                )}
                            </div>
                            <div className="h-4 flex items-center mt-0.5">
                                {isLoading ? (
                                    <div className="h-3 w-20 bg-gray-50 animate-pulse rounded" />
                                ) : (
                                    <p className="text-xs text-red-600 font-medium whitespace-nowrap">
                                        Total: {formatMoney(unpaidInvoicesAmount)}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                    <Link href="/payments">
                        <Button variant="outline" size="sm" className="rounded-full h-8">Voir</Button>
                    </Link>
                </Card>

            </section>

            {/* Quick Insights */}
            <section className="grid grid-cols-2 gap-4">
                <Card className="p-4 space-y-2 shadow-sm">
                    <p className="text-xs text-gray-500">Reste à payer (mois en cours)</p>
                    <div className="flex flex-col">
                        <div className="h-7 flex items-center">
                            {isLoading ? (
                                <div className="h-6 w-20 bg-gray-100 animate-pulse rounded" />
                            ) : (
                                <p className="text-xl font-bold text-gray-900">
                                    {formatMoney(monthlySpend)}
                                </p>
                            )}
                        </div>
                        <div className="h-4 flex items-center mt-0.5">
                            {(!isLoading && totalDue > 0) ? (
                                <p className="text-[10px] text-gray-400">
                                    Total dû : {formatMoney(totalDue)}
                                </p>
                            ) : isLoading && (
                                <div className="h-3 w-24 bg-gray-50 animate-pulse rounded" />
                            )}
                        </div>
                    </div>
                </Card>
                <Card className="p-4 space-y-2 shadow-sm">
                    <p className="text-xs text-gray-500">Délai de paiement moyen</p>
                    <div className="h-7 flex items-center">
                        {isLoading ? (
                            <div className="h-6 w-12 bg-gray-100 animate-pulse rounded" />
                        ) : (
                            <p className={`text-xl font-bold ${averagePaymentDelay > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                {Math.abs(averagePaymentDelay) >= 30
                                    ? `${Math.floor(Math.abs(averagePaymentDelay) / 30)} mois ${Math.abs(averagePaymentDelay) % 30}j`
                                    : `${averagePaymentDelay}j`
                                }
                            </p>
                        )}
                    </div>
                    <p className="text-[10px] text-gray-400">vs Date d'échéance</p>
                </Card>
            </section>

            {/* Expenses Breakdown */}
            <ExpensesBreakdown companyId={activeCompany?.id} />

        </main>
    );
}
