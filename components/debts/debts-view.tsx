"use client";


import { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { useInstantNavigation } from "@/hooks/use-instant-navigation";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ChevronRight, TrendingDown, Calendar, Wallet, CheckCircle2, ArrowUpDown, Loader2, Filter, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanies } from "@/components/providers/companies-provider";
import { useDebts } from "@/hooks/use-debts";
import { usePayments } from "@/components/providers/payments-provider";
import { useUnpaidInvoices } from "@/hooks/use-unpaid-invoices";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { format, parseISO, startOfMonth, endOfMonth, subMonths, isWithinInterval, isSameMonth, addMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { PriceDisplay } from "@/components/ui/price-display";

import { Debt } from "@/components/providers/debts-provider";

interface DebtsViewProps {
    initialDebts: Debt[];
}

export default function DebtsView({ initialDebts }: DebtsViewProps) {
    const { navigate, isNavigating } = useInstantNavigation();
    const { companies, isLoading: isCompaniesLoading } = useCompanies();
    const activeCompany = companies[0];
    const { debts: clientDebts, isLoading: isDebtsLoading } = useDebts(activeCompany?.id);

    // Hydration / SSR Strategy
    // Use initialDebts while client is loading
    const debts = isDebtsLoading ? initialDebts : clientDebts;
    const { unpaidCounts, isLoading: isInvoicesLoading } = useUnpaidInvoices(activeCompany?.id);
    const { invoices, fetchInvoices } = usePayments(); // Access all invoices for history calculation

    // 1. Hydration Safety: Track mount state (Flicker-free)
    const [isMounted, setIsMounted] = useState(() => typeof window !== "undefined" && (window as any).__HYDRATED);
    const [isInitialized, setIsInitialized] = useState(false);

    // View Mode Toggle for Monthly Payments
    const [viewMode, setViewMode] = useState<"SCHEDULE" | "GLOBAL">("SCHEDULE");

    // 2. Filter & Sort State - Neutral defaults for SSR
    const [sortOption, setSortOption] = useState<"date-asc" | "date-desc" | "amount-asc" | "amount-desc">("date-asc");
    const [showPaid, setShowPaid] = useState(false);
    const [filterType, setFilterType] = useState<"ALL" | "SCHEDULE" | "CURRENT" | "CONSTATED">("ALL");
    const [searchQuery, setSearchQuery] = useState("");

    // 3. Mount & Initial Load
    useEffect(() => {
        setIsMounted(true);
        (window as any).__HYDRATED = true;

        // Load from localStorage only after mount
        const savedSort = localStorage.getItem("debts_sort");
        if (savedSort && ["date-asc", "date-desc", "amount-asc", "amount-desc"].includes(savedSort)) {
            setSortOption(savedSort as any);
        }
        const savedShowPaid = localStorage.getItem("debts_show_paid");
        if (savedShowPaid) setShowPaid(savedShowPaid === "true");
        const savedSearch = localStorage.getItem("debts_search");
        if (savedSearch) setSearchQuery(savedSearch);
        const savedFilterType = localStorage.getItem("debts_filter_type");
        if (savedFilterType && ["ALL", "SCHEDULE", "CURRENT", "CONSTATED"].includes(savedFilterType)) {
            setFilterType(savedFilterType as any);
        }

        const savedViewMode = localStorage.getItem("debts_view_mode");
        if (savedViewMode && ["SCHEDULE", "GLOBAL"].includes(savedViewMode)) {
            setViewMode(savedViewMode as any);
        }

        setIsInitialized(true);
    }, []);

    // 4. Persistence - Save on change
    useEffect(() => {
        if (isInitialized) {
            localStorage.setItem("debts_sort", sortOption);
        }
    }, [sortOption, isInitialized]);

    useEffect(() => {
        if (isInitialized) {
            localStorage.setItem("debts_show_paid", showPaid.toString());
        }
    }, [showPaid, isInitialized]);

    useEffect(() => {
        if (isInitialized) {
            localStorage.setItem("debts_search", searchQuery);
        }
    }, [searchQuery, isInitialized]);

    useEffect(() => {
        if (isInitialized) {
            localStorage.setItem("debts_filter_type", filterType);
        }
    }, [filterType, isInitialized]);

    useEffect(() => {
        if (isInitialized) {
            localStorage.setItem("debts_view_mode", viewMode);
        }
    }, [viewMode, isInitialized]);

    // Fetch invoices for global average calculation if not already loaded
    useEffect(() => {
        if (activeCompany?.id) {
            fetchInvoices(activeCompany.id);
        }
    }, [activeCompany?.id, fetchInvoices]);

    const isLoading = !isMounted || isCompaniesLoading || isDebtsLoading || isInvoicesLoading;

    // SCROLL RESTORATION HOOK
    const { saveScrollPosition } = useScrollRestoration("debts_scroll", isLoading, debts);

    // STATS CALCULATIONS (memoized to avoid recomputing on every render)
    const { totalOriginal, totalRemaining, totalPaid, progressPercentage } = useMemo(() => {
        const processedSuppliers = new Set<string>();

        const { totalOriginal, totalRemaining } = debts.reduce((acc, d) => {
            const scheduleInitial = Math.max(d.initial_amount || 0, d.remaining_amount || 0);
            const scheduleRemaining = d.remaining_amount || 0;

            let currentInitial = 0;
            let currentRemaining = 0;

            const supplierId = d.supplier?.id;
            if (supplierId && !processedSuppliers.has(supplierId)) {
                processedSuppliers.add(supplierId);
                const isStructured = (d.monthly_amount || 0) > 0;
                const fixedDebt = !isStructured ? (d.remaining_amount || 0) : 0;
                currentInitial = (d.current_debt?.total_amount || 0) + fixedDebt;
                currentRemaining = ((d.current_debt?.total_amount || 0) - (d.current_debt?.paid_amount || 0)) + fixedDebt;
            }

            return {
                totalOriginal: acc.totalOriginal + scheduleInitial + currentInitial,
                totalRemaining: acc.totalRemaining + scheduleRemaining + currentRemaining
            };
        }, { totalOriginal: 0, totalRemaining: 0 });

        const totalPaid = totalOriginal - totalRemaining;
        const progressPercentage = totalOriginal > 0 ? (totalPaid / totalOriginal) * 100 : 0;
        return { totalOriginal, totalRemaining, totalPaid, progressPercentage };
    }, [debts]);

    // --- GLOBAL AVERAGE CALCULATION ---
    // Average of last 3 months paid invoices
    // --- 1. Calculate Structural Monthly Sum (Fixed Schedule) ---
    const structuralMonthlySum = activeCompany ? debts
        .filter(d => d.status === 'ACTIVE' && (d.monthly_amount || 0) > 0)
        .reduce((sum, d) => sum + (d.monthly_amount || 0), 0) : 0;

    // --- 2. Calculate Average Irregular Repayments (Last 3 Months) ---
    // Mimics logic from app/situations/page.tsx:
    // Remb (Month) = Structural + Irregular (Paid in Month AND (!Due Date OR Due Date != Payment Date))
    const averageIrregularKey = invoices ? invoices.length + '-' + viewMode : 'empty';
    const globalMonthlyDebt = useMemo(() => {
        if (!invoices || invoices.length === 0) return structuralMonthlySum;

        const today = new Date();
        const last3Months = [1, 2, 3].map(i => subMonths(today, i));

        let totalIrregularRepayments = 0;

        last3Months.forEach(monthDate => {
            const monthStart = startOfMonth(monthDate);
            const monthEnd = endOfMonth(monthDate);

            // Find invoices PAID in this month
            const paidInMonth = invoices.filter(inv => {
                if (inv.status !== 'PAID' || !inv.payment_date) return false;
                const pDate = parseISO(inv.payment_date);
                return isWithinInterval(pDate, { start: monthStart, end: monthEnd });
            });

            // Filter for "Irregular" repayments (No due date OR Due Month != Paid Month)
            const irregularSum = paidInMonth.reduce((sum, inv) => {
                // If no due date, it's strictly a debt repayment
                if (!inv.due_date) return sum + (inv.amount_ttc || 0);

                const dDate = parseISO(inv.due_date);
                const pDate = parseISO(inv.payment_date!); // we checked it exists above

                // If due date is NOT in the same month as payment, it counts as debt repayment (catching up or early)
                if (!isSameMonth(dDate, pDate)) {
                    return sum + (inv.amount_ttc || 0);
                }

                // Otherwise it's a regular "Charge" (paid on time/in month), not debt repayment
                return sum;
            }, 0);

            totalIrregularRepayments += irregularSum;
        });

        const averageIrregular = totalIrregularRepayments / 3;
        return structuralMonthlySum + averageIrregular;

    }, [invoices, structuralMonthlySum, averageIrregularKey]);

    const displayedMonthlyValue = viewMode === 'SCHEDULE' ? structuralMonthlySum : globalMonthlyDebt;

    // Filter Logic (memoized)
    const filteredDebts = useMemo(() => debts
        .filter(d => {
            // Calculate effective remaining including Smart Current Debt
            const smartTotal = d.current_debt?.total_amount || 0;
            const smartPaid = d.current_debt?.paid_amount || 0;
            const smartRemaining = Math.max(smartTotal - smartPaid, 0);

            // Fixed debt logic: if not structured, remaining is current. But we sum everything for visibility.
            const totalRemaining = (d.remaining_amount || 0) + smartRemaining;
            const totalInitial = (d.initial_amount || 0) + smartTotal;

            const hasValue = totalInitial > 0 || totalRemaining > 0;
            if (!hasValue) return false;

            // Search Filter
            if (searchQuery && !d.supplier?.name?.toLowerCase().includes(searchQuery.toLowerCase())) {
                return false;
            }

            // Type Filter
            if (filterType !== 'ALL') {
                const isStructuredSchedule = (d.monthly_amount || 0) > 0;
                const hasTrackedCurrent = (d.current_debt?.total_amount || 0) > 0;
                const activeRemaining = (d.remaining_amount || 0) > 0;

                // Flags
                const hasSchedule = isStructuredSchedule && activeRemaining; // Strict schedule
                const hasCurrent = hasTrackedCurrent; // Strict Current (Purple)
                const isConstated = !isStructuredSchedule && !hasTrackedCurrent && activeRemaining;

                if (filterType === 'SCHEDULE' && !hasSchedule) return false;
                if (filterType === 'CURRENT' && !hasCurrent) return false;
                if (filterType === 'CONSTATED' && !isConstated) return false;
            }

            // Status Filter: Active means we have something to pay
            return showPaid
                ? d.status === 'PAID' || totalRemaining === 0
                : d.status === 'ACTIVE' && totalRemaining > 0;
        })
        .sort((a, b) => {
            const dateA = a.end_date ? new Date(a.end_date).getTime() : 0;
            const dateB = b.end_date ? new Date(b.end_date).getTime() : 0;

            // Helper to get total remaining for sort
            const getRemaining = (d: any) => {
                const sRem = Math.max((d.current_debt?.total_amount || 0) - (d.current_debt?.paid_amount || 0), 0);
                return (d.remaining_amount || 0) + sRem;
            };

            switch (sortOption) {
                case "date-asc": return dateA - dateB;
                case "date-desc": return dateB - dateA;
                case "amount-desc": return getRemaining(b) - getRemaining(a);
                case "amount-asc": return getRemaining(a) - getRemaining(b);
                default: return 0;
            }
        }), [debts, searchQuery, filterType, showPaid, sortOption]);

    return (
        <main className={cn(
            "p-6 max-w-md mx-auto space-y-8 pb-40 transition-opacity duration-300 overflow-x-hidden",
            isMounted ? "opacity-100" : "opacity-0"
        )}>
            <header className="space-y-6">
                <div className="sticky top-0 -mx-6 px-6 py-4 bg-gray-50/95 backdrop-blur-sm z-30 flex items-center gap-3 border-b border-transparent transition-all">
                    <h1 className="text-xl font-bold tracking-tight text-gray-900">Dettes & Échéanciers</h1>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <div className="flex justify-between items-start">
                        <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
                                <Wallet className="w-4 h-4" /> Reste à payer
                            </p>
                            <div className="mt-1 h-9 flex items-center">
                                {isLoading ? (
                                    <div className="h-8 w-40 bg-gray-100 animate-pulse rounded-lg" />
                                ) : (
                                    <PriceDisplay amount={totalRemaining} size="2xl" />
                                )}
                            </div>
                        </div>
                        <div className="h-6 flex items-center">
                            {isLoading ? (
                                <div className="h-6 w-16 bg-blue-50 animate-pulse rounded-lg" />
                            ) : (
                                <div className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                                    {Math.round(progressPercentage)}% réglé
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 py-2 border-y border-gray-50">
                        <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total dû</p>
                            <div className="h-5 flex items-center mt-0.5">
                                {isLoading ? (
                                    <div className="h-4 w-20 bg-gray-100 animate-pulse rounded" />
                                ) : (
                                    <PriceDisplay amount={totalOriginal} size="sm" />
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Déjà payé</p>
                            <div className="h-5 flex justify-end items-center mt-0.5">
                                {isLoading ? (
                                    <div className="h-4 w-20 bg-gray-100 animate-pulse rounded" />
                                ) : (
                                    <PriceDisplay amount={totalPaid} size="sm" className="text-emerald-600" mutedColor="text-emerald-500/60" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Visual Progress */}
                    <div className="space-y-2">
                        <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex">
                            <div
                                className={cn(
                                    "h-full bg-blue-600 rounded-full transition-all duration-500",
                                    isLoading ? "opacity-20 animate-pulse" : "opacity-100"
                                )}
                                style={{ width: `${isLoading ? 100 : progressPercentage}%` }}
                            />
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-medium text-gray-400">
                            {isLoading ? (
                                <>
                                    <div className="h-3 w-16 bg-gray-50 animate-pulse rounded" />
                                    <div className="h-3 w-24 bg-gray-50 animate-pulse rounded" />
                                </>
                            ) : (
                                <>
                                    <span>{Math.round(progressPercentage)}% complété</span>
                                    <span>{totalRemaining.toLocaleString('fr-FR')} € restants</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Secondary Cards: Action & Projection */}
                <div className="grid grid-cols-2 gap-3">
                    {/* Next Payment */}
                    {/* Next Payment / Monthly Average Toggle */}
                    {/* Mensualités Card with Switch */}
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between group h-full">
                        <div className="flex items-center gap-2 mb-2 text-orange-600">
                            <div className="p-1.5 bg-orange-50 rounded-lg group-hover:bg-orange-100 transition-colors">
                                <Calendar className="w-3.5 h-3.5" />
                            </div>
                            <p className="text-xs font-bold uppercase tracking-wider">Mensualités</p>
                        </div>

                        <div className="space-y-3">
                            <div className="h-8 flex items-center">
                                {isLoading ? (
                                    <div className="h-7 w-24 bg-gray-100 animate-pulse rounded" />
                                ) : (
                                    <PriceDisplay
                                        amount={displayedMonthlyValue}
                                        size="xl"
                                        className="text-gray-900"
                                    />
                                )}
                            </div>

                            {/* Single Toggle Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setViewMode(prev => prev === 'SCHEDULE' ? 'GLOBAL' : 'SCHEDULE');
                                }}
                                className="w-full flex flex-col items-center gap-1.5 py-2.5 px-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-100 transition-all active:scale-[0.98] group/btn overflow-hidden relative"
                            >
                                <div className="flex items-center gap-2 relative z-10 w-full justify-center">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-900">
                                        Mode {viewMode === 'SCHEDULE' ? 'Échéancier' : 'Global'}
                                    </span>
                                    <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />
                                </div>
                            </button>
                            <p className="text-[9px] text-gray-500 font-bold text-center uppercase tracking-tight">
                                {viewMode === 'SCHEDULE' ? 'Basé sur vos contrats' : 'Moyenne réelle 3 mois'}
                            </p>
                        </div>
                    </div>

                    {/* Future Balance - Calculated from remaining and monthly payments */}
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-2 mb-2 text-gray-500">
                            <TrendingDown className="w-4 h-4" />
                            <p className="text-xs font-bold uppercase tracking-wider">Futur solde</p>
                        </div>
                        <div className="h-7 flex items-center">
                            {isLoading ? (
                                <div className="h-6 w-20 bg-white animate-pulse rounded" />
                            ) : (() => {
                                const futureBalance = Math.max(0, totalRemaining - displayedMonthlyValue);
                                return (
                                    <p className="text-xl font-bold text-gray-700">
                                        {futureBalance.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                                    </p>
                                );
                            })()}
                        </div>
                        <p className="text-[10px] text-gray-400 font-medium mt-1 uppercase">
                            Projection M+1
                        </p>
                    </div>
                </div>
            </header>

            <section className="space-y-4">
                {/* Compact Filters & Sort UI */}
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-gray-900">Vos créanciers</h2>
                            {/* Filter Dropdown Icon */}
                            <div className="relative">
                                <select
                                    value={filterType}
                                    onChange={(e) => setFilterType(e.target.value as any)}
                                    className="appearance-none w-6 h-6 opacity-0 absolute inset-0 cursor-pointer z-10"
                                >
                                    <option value="ALL">Tout</option>
                                    <option value="SCHEDULE">Échéanciers</option>
                                    <option value="CURRENT">Dette courante</option>
                                    <option value="CONSTATED">Dette constatée</option>
                                </select>
                                <div className={cn(
                                    "h-6 w-6 flex items-center justify-center rounded-full transition-colors",
                                    filterType !== 'ALL' ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400 hover:text-gray-600"
                                )}>
                                    <Filter className="w-3.5 h-3.5" />
                                </div>
                            </div>
                        </div>

                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setShowPaid(false)}
                                className={cn(
                                    "px-3 py-1 text-[11px] font-bold rounded-md transition-all",
                                    !showPaid ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-900"
                                )}
                            >
                                En cours
                            </button>
                            <button
                                onClick={() => setShowPaid(true)}
                                className={cn(
                                    "px-3 py-1 text-[11px] font-bold rounded-md transition-all",
                                    showPaid ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-900"
                                )}
                            >
                                Soldés
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Rechercher un fournisseur..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                            </div>
                        </div>

                        <div className="relative">
                            <select
                                value={sortOption}
                                onChange={(e) => setSortOption(e.target.value as any)}
                                className="appearance-none w-10 h-full opacity-0 absolute inset-0 cursor-pointer z-10"
                            >
                                <option value="date-asc">Échéance proche</option>
                                <option value="date-desc">Échéance lointaine</option>
                                <option value="amount-desc">Montant élevé</option>
                                <option value="amount-asc">Montant faible</option>
                            </select>
                            <div className="h-full w-10 flex items-center justify-center bg-white border border-gray-200 rounded-xl shadow-sm">
                                <ArrowUpDown className="h-4 w-4 text-gray-500" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                                <div className="flex-1 mr-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 bg-gray-50 animate-pulse rounded-xl" />
                                            <div className="h-4 w-32 bg-gray-100 animate-pulse rounded" />
                                        </div>
                                        <div className="h-4 w-16 bg-gray-50 animate-pulse rounded" />
                                    </div>
                                    <div className="h-2 w-full bg-gray-50 animate-pulse rounded-full mt-3" />
                                    <div className="flex justify-between mt-1">
                                        <div className="h-2 w-12 bg-gray-50 animate-pulse rounded" />
                                        <div className="h-2 w-16 bg-gray-50 animate-pulse rounded" />
                                    </div>
                                </div>
                                <div className="h-4 w-4 bg-gray-50 animate-pulse rounded" />
                            </div>
                        ))
                    ) : filteredDebts.length > 0 ? (
                        filteredDebts.map((debt) => (
                            <div
                                key={debt.id}
                                onClick={() => {
                                    saveScrollPosition();
                                    navigate(`/dettes/${debt.id}`);
                                }}
                                className={cn(
                                    "bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 cursor-pointer group flex items-start justify-between",
                                    isNavigating(`/dettes/${debt.id}`) && "opacity-60"
                                )}
                            >
                                <div className="flex-1 mr-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "h-10 w-10 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden",
                                                totalRemaining === 0
                                                    ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                                                    : "bg-gray-50 border-gray-100 text-gray-500"
                                            )}>
                                                {totalRemaining === 0 ? (
                                                    <CheckCircle2 className="w-4 h-4" />
                                                ) : debt.supplier?.logo_url ? (
                                                    <img
                                                        src={debt.supplier.logo_url}
                                                        alt={debt.supplier.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    debt.supplier?.name?.substring(0, 2).toUpperCase() || "EC"
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className={cn("font-bold text-sm", totalRemaining === 0 ? "text-gray-500 line-through decoration-gray-300" : "text-gray-900")}>
                                                        {debt.supplier?.name}
                                                    </p>

                                                    {/* BADGES */}
                                                    {(debt.monthly_amount || 0) > 0 && debt.remaining_amount > 0 && (
                                                        <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-blue-100">
                                                            ÉCHÉANCIER
                                                        </span>
                                                    )}

                                                    {/* Current Debt Badge: Only if tracked (Purple) */}
                                                    {(() => {
                                                        const hasTrackedCurrent = (debt.current_debt?.total_amount || 0) > 0;
                                                        if (hasTrackedCurrent) {
                                                            return (
                                                                <span className="bg-purple-50 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-purple-100 uppercase">
                                                                    DETTE COURANTE
                                                                </span>
                                                            );
                                                        }
                                                        return null;
                                                    })()}

                                                    {/* Dette Constatée Badge: Fixed debt with no tracking (Orange) */}
                                                    {(() => {
                                                        const isStructuredSchedule = (debt.monthly_amount || 0) > 0;
                                                        const hasTrackedCurrent = (debt.current_debt?.total_amount || 0) > 0;
                                                        // Is Constated if: No schedule, No live tracking, but has remaining
                                                        const isConstated = !isStructuredSchedule && !hasTrackedCurrent && (debt.remaining_amount || 0) > 0;

                                                        if (isConstated) {
                                                            return (
                                                                <span className="bg-orange-50 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-orange-100 uppercase">
                                                                    DETTE CONSTATÉE
                                                                </span>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                                <p className="text-[10px] text-gray-500 mt-0.5">Fin : {debt.end_date ? format(parseISO(debt.end_date), 'MMM yyyy', { locale: fr }) : 'N/A'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {(() => {
                                        const supplierId = debt.supplier?.id;

                                        // LOGIC REFINEMENT:
                                        // A debt is an "Échéancier" (Schedule) ONLY if it has a monthly_amount > 0.
                                        // Otherwise, it is considered a "Dette Courante" (fixed old debt).
                                        const isStructuredSchedule = (debt.monthly_amount || 0) > 0;

                                        // 1. Schedule Data
                                        const scheduleInitial = isStructuredSchedule ? Math.max(Number(debt.initial_amount) || 0, Number(debt.remaining_amount) || 0) : 0;
                                        const scheduleRemaining = isStructuredSchedule ? Number(debt.remaining_amount) || 0 : 0;

                                        // 2. Current Debt Data (Purple)
                                        // Only if current_debt exists
                                        const smartTotal = Number(debt.current_debt?.total_amount) || 0;
                                        const smartPaid = Number(debt.current_debt?.paid_amount) || 0;
                                        const snapshotCurrentRemaining = Math.max(smartTotal - smartPaid, 0);
                                        const snapshotCurrentInitial = smartTotal;

                                        // 3. Dette Constatée Data (Orange)
                                        // Fixed debt with no schedule and no tracking
                                        const isConstated = !isStructuredSchedule && smartTotal === 0 && (Number(debt.remaining_amount) || 0) > 0;
                                        const constatedRemaining = isConstated ? Number(debt.remaining_amount) || 0 : 0;
                                        const constatedInitial = isConstated ? Math.max(Number(debt.initial_amount) || 0, Number(debt.remaining_amount) || 0) : 0;

                                        const hasSchedule = scheduleRemaining > 0 || scheduleInitial > 0;
                                        const hasCurrent = snapshotCurrentRemaining > 0 || snapshotCurrentInitial > 0;
                                        const hasConstated = constatedRemaining > 0 || constatedInitial > 0;

                                        const totalRemaining = scheduleRemaining + snapshotCurrentRemaining + constatedRemaining;

                                        // If everything is 0, don't render the card? 
                                        // Or render it showing 0?
                                        // If hasSchedule is false and hasCurrent is false, checking if we should show it at all.
                                        // The loop iterates over `filteredDebts`. 
                                        // If debt matches filter (ACTIVE), it shows.

                                        return (
                                            <div className="mt-4 space-y-4">
                                                {/* Échéancier Row */}
                                                {hasSchedule && (
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between items-baseline">
                                                            <div className="flex items-center gap-1.5">
                                                                <p className={cn("text-[11px] font-medium uppercase tracking-tight", scheduleRemaining === 0 ? "text-emerald-600" : "text-blue-600")}>
                                                                    Échéancier
                                                                </p>
                                                                {scheduleRemaining === 0 && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                                            </div>
                                                            <p className={cn("text-sm font-medium", scheduleRemaining === 0 ? "text-emerald-600" : "text-gray-700")}>
                                                                {scheduleRemaining === 0 ? `${scheduleInitial.toLocaleString('fr-FR')} € (Soldé)` : `${scheduleRemaining.toLocaleString('fr-FR')} €`}
                                                            </p>
                                                        </div>
                                                        <ProgressBar
                                                            value={scheduleInitial - scheduleRemaining}
                                                            max={scheduleInitial}
                                                            className={cn("h-1.5", scheduleRemaining === 0 ? "bg-emerald-50" : "bg-blue-50")}
                                                            indicatorClassName={scheduleRemaining === 0 ? "bg-emerald-600" : "bg-blue-600"}
                                                        />
                                                    </div>
                                                )}

                                                {/* Dette Courante Row */}
                                                {hasCurrent && (
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between items-baseline">
                                                            <p className="text-[11px] font-medium text-purple-600 uppercase tracking-tight">Dette courante</p>
                                                            <p className="text-sm font-medium text-gray-700">{snapshotCurrentRemaining.toLocaleString('fr-FR')} €</p>
                                                        </div>
                                                        <ProgressBar
                                                            value={snapshotCurrentInitial - snapshotCurrentRemaining}
                                                            max={snapshotCurrentInitial || 1}
                                                            className="h-1.5 bg-purple-50"
                                                            indicatorClassName="bg-purple-600"
                                                        />
                                                    </div>
                                                )}

                                                {/* Dette Constatée Row (Orange) */}
                                                {hasConstated && (
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between items-baseline">
                                                            <p className="text-[11px] font-medium text-orange-600 uppercase tracking-tight">Dette constatée</p>
                                                            <p className="text-sm font-medium text-gray-700">{constatedRemaining.toLocaleString('fr-FR')} €</p>
                                                        </div>
                                                        <ProgressBar
                                                            value={constatedInitial - constatedRemaining}
                                                            max={constatedInitial || 1}
                                                            className="h-1.5 bg-orange-200"
                                                            indicatorClassName="bg-orange-600"
                                                        />
                                                    </div>
                                                )}

                                                {/* Summary footer for the card */}
                                                <div className="flex justify-end items-center pt-2 mt-1">
                                                    <span className={cn(
                                                        "text-xs font-bold px-2 py-0.5 rounded-full capitalize",
                                                        totalRemaining === 0 ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-900"
                                                    )}>
                                                        {totalRemaining === 0 ? "Soldé" : `${totalRemaining.toLocaleString('fr-FR')} € restant`}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-600 transition-colors mt-1" />
                            </div>
                        ))
                    ) : (
                        <div className="bg-white p-8 rounded-2xl border border-gray-100 text-center text-gray-400 text-sm">
                            Aucune dette trouvée pour ces critères.
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}
