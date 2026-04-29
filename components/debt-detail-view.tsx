"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Calendar, Wallet, CheckCircle2, Building2, CreditCard, ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { differenceInDays, parseISO } from 'date-fns';

// Mock Data Type
export type DebtDetail = {
    id: string;
    contractRef: string;
    startDate: string;
    startYear: number;
    endDate: string;
    endYear: number;
    // Displayed values (dynamic)
    paidMonths: number;
    totalMonths: number;
    monthlyAmount: number;
    totalAmount: number;
    remainingAmount: number;
    paidAmount: number;
    // Component source data for filtering
    scheduledTotal?: number;
    scheduledRemaining?: number;
    scheduledPaid?: number;
    scheduledTotalMonths?: number;
    scheduledPaidMonths?: number;
    currentTotal?: number;
    currentRemaining?: number;
    currentPaid?: number;
    currentTotalMonths?: number;
    currentPaidMonths?: number;
    // Meta
    status: "active" | "paid";
    providerName: string;
    providerLogo: string;
    tags: string[];
    unpaidInvoices?: Array<{
        id: string;
        reference: string;
        issuedDate: string;
        dueDate: string;
        daysLate: number;
        amount: number;
    }>;
};

interface DebtDetailViewProps {
    debtId?: string;
    embedded?: boolean; // If true, hides header/back button for tab integration
}

export function DebtDetailView({ debtId, embedded = false }: DebtDetailViewProps) {
    const router = useRouter();
    const [debt, setDebt] = useState<DebtDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'combined' | 'scheduled' | 'current'>('combined');

    useEffect(() => {
        if (!debtId) return;

        const fetchDebt = async () => {
            // Fetch debt details via API
            const debtRes = await fetch(`/api/debts/${debtId}`);
            if (!debtRes.ok) {
                console.error("Error fetching debt");
                setIsLoading(false);
                return;
            }
            const { debt: fetchedDebt, currentDebt: fetchedCurrentDebt } = await debtRes.json();

            let data: any = fetchedDebt;
            const currentDebt = fetchedCurrentDebt;

            if (data) {
                const monthly = data.monthly_amount || 0;
                const hasSchedule = monthly > 0;

                // Common external data fetching (Unpaid Invoices)
                let unpaidInvoicesList: any[] = [];
                let currentUnpaidCount = 0;
                let currentUnpaidTotal = 0;
                let initialCount = 0;
                let initialTotal = 0;
                let sessionStrictPaid = 0;
                let sessionStrictPaidCount = 0;

                if (data.supplier?.id) {
                    const invParams = new URLSearchParams({ supplierId: data.supplier.id });
                    if (currentDebt?.created_at && !currentDebt?.total_amount) {
                        invParams.set('currentDebtCreatedAt', currentDebt.created_at);
                    }
                    const invRes = await fetch(`/api/debts/${debtId}/invoices?${invParams}`);
                    const invData = invRes.ok ? await invRes.json() : { invoices: [], sessionInvoices: null };

                    const invoices = invData.invoices || [];
                    currentUnpaidCount = invoices.length;
                    currentUnpaidTotal = invoices.reduce((sum: number, inv: any) => sum + (inv.amount_ttc || 0), 0);

                    initialCount = currentDebt?.initial_unpaid_count || currentUnpaidCount;
                    initialTotal = currentDebt?.total_amount || currentDebt?.initial_unpaid_total || currentUnpaidTotal;

                    unpaidInvoicesList = invoices.map((inv: any) => {
                        const dueDate = inv.due_date ? parseISO(inv.due_date) : new Date();
                        const daysLate = differenceInDays(new Date(), dueDate);
                        return {
                            id: inv.id,
                            reference: inv.reference || inv.id.slice(0, 8),
                            issuedDate: inv.issued_date || '',
                            dueDate: inv.due_date || '',
                            daysLate: Math.max(0, daysLate),
                            amount: inv.amount_ttc || 0
                        };
                    });

                    if (currentDebt?.total_amount) {
                        initialTotal = currentDebt.total_amount;
                        initialCount = currentDebt.initial_unpaid_count || 0;
                        sessionStrictPaid = currentDebt.paid_amount || 0;
                        sessionStrictPaidCount = currentDebt.paid_count || 0;
                    } else if (invData.sessionInvoices) {
                        const sessionInvoices = invData.sessionInvoices;
                        initialTotal = sessionInvoices.reduce((sum: number, inv: any) => sum + (inv.amount_ttc || 0), 0);
                        initialCount = sessionInvoices.length;
                        sessionStrictPaid = sessionInvoices
                            .filter((inv: any) => inv.status === 'PAID')
                            .reduce((sum: number, inv: any) => sum + (inv.amount_ttc || 0), 0);
                        sessionStrictPaidCount = sessionInvoices.filter((inv: any) => inv.status === 'PAID').length;
                    } else {
                        initialTotal = currentUnpaidTotal;
                        initialCount = currentUnpaidCount;
                    }
                }

                // Determine tags dynamically based on fetched data
                const tags: string[] = [];
                if (hasSchedule) tags.push("Échéancier");
                // Show "Dette courante" if we have a tracking record OR if we have unpaid invoices
                if (currentDebt || currentUnpaidCount > 0) tags.push("Dette courante");

                if (hasSchedule) {
                    // SCHEDULED DEBT: Use existing month-based logic
                    const now = new Date();
                    const start = data.start_date ? new Date(data.start_date) : now;
                    const end = data.end_date ? new Date(data.end_date) : now;

                    const diffMonths = (d1: Date, d2: Date) => {
                        let months = (d2.getFullYear() - d1.getFullYear()) * 12;
                        months -= d1.getMonth();
                        months += d2.getMonth();
                        return months <= 0 ? 0 : months;
                    };

                    const totalMonths = diffMonths(start, end) || 1;
                    const paidMonths = diffMonths(start, now);
                    // HYBRID: Add current unpaid debt to the scheduled amounts
                    const schedRemaining = data.remaining_amount || 0;
                    // Fix: Use initial_amount (DB column) instead of undefined total_amount
                    const schedTotal = Math.max(data.initial_amount || 0, data.total_amount || 0, schedRemaining);
                    const schedPaid = Math.max(0, schedTotal - schedRemaining);

                    const schedFinancialProgress = schedTotal > 0 ? (schedPaid / schedTotal) : 0;
                    const estimatedPaidMonths = Math.round(totalMonths * schedFinancialProgress);

                    // Current Debt Components
                    // Use explicit DB columns from Sync Script (Source of Truth)
                    const smartTotal = currentDebt?.total_amount || currentUnpaidTotal;
                    const smartPaid = currentDebt?.paid_amount || 0;

                    const safeCurrTotal = smartTotal;
                    const safeCurrPaid = smartPaid;
                    const safeCurrPaidCount = sessionStrictPaidCount; // Approximate

                    const safeCurrTotalCount = initialCount;

                    const remaining = schedRemaining + (currentUnpaidTotal || 0);
                    const total = schedTotal + (currentUnpaidTotal || 0); // Note: total should be SchedTotal + CurrTotal for FULL picture, but traditionally debt view focuses on specific tracked amounts.
                    // User asked for "Combine". If I combine "Scheduled Total" (fixed) + "Current Unpaid" (dynamic), I get "Total Liability".
                    // But for "Progress", I need "Total Amount Ever" vs "Total Paid Ever".
                    // SchedTotal is "Total Amount Ever".
                    // CurrTotal (initialTotal) is "Total Amount Ever" for current session.

                    // Let's refine "total" for combined view:
                    // Total = SchedTotal + SafeCurrTotal
                    // Paid = SchedPaid + SafeCurrPaid
                    // Remaining = SchedRemaining + CurrentUnpaidTotal
                    // Let's verify: (SchedTotal + SafeCurrTotal) - (SchedPaid + SafeCurrPaid)
                    // = (SchedTotal - SchedPaid) + (SafeCurrTotal - SafeCurrPaid)
                    // = SchedRemaining + (SmartTotal - SmartPaid)
                    // = SchedRemaining + CurrentUnpaidTotal (Assuming sync is correct)
                    // MATCHES!

                    const combinedTotal = schedTotal + safeCurrTotal;
                    const combinedPaid = schedPaid + safeCurrPaid;
                    const combinedRemaining = schedRemaining + (currentUnpaidTotal || 0);
                    const combinedPaidMonths = estimatedPaidMonths + safeCurrPaidCount; // Mixing units (months vs count) is tricky for progress bar.
                    // Progress bar for hybrid: Maybe avg %? Or simple financial %?
                    // Previous logic: financial progress -> months.
                    // New logic: we should probably stick to financial % for combined, or keep months for schedule dominance.
                    // User liked the previous "Sum" logic.
                    // Previous sum: total = schedTotal + currentUnpaidTotal. (Ignores already paid current debt).
                    // This means "Progress" was (SchedPaid) / (SchedTotal + CurrUnpaid).
                    // This is "conservatively correct" (ignores paid current debt as 'progress').
                    // Let's stick to what I just deployed as 'Combined' default to avoid jarring changes, BUT storing the raw data allows 'Current' view to be accurate.

                    setDebt({
                        id: data.id,
                        contractRef: data.contract_ref || "Non renseigné",
                        startDate: data.start_date ? new Date(data.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "N/A",
                        startYear: start.getFullYear(),
                        endDate: data.end_date ? new Date(data.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : "N/A",
                        endYear: end.getFullYear(),
                        paidMonths: estimatedPaidMonths,
                        totalMonths: totalMonths,
                        monthlyAmount: monthly,
                        // Default View: Combined (As previously implemented, roughly)
                        // Actually, let's use the FULL combined to be cleaner
                        totalAmount: combinedTotal,
                        remainingAmount: combinedRemaining,
                        paidAmount: combinedPaid,

                        // Store Components
                        scheduledTotal: schedTotal,
                        scheduledRemaining: schedRemaining,
                        scheduledPaid: schedPaid,
                        scheduledTotalMonths: totalMonths,
                        scheduledPaidMonths: estimatedPaidMonths,

                        currentTotal: safeCurrTotal,
                        currentRemaining: currentUnpaidTotal,
                        currentPaid: safeCurrPaid,
                        currentTotalMonths: safeCurrTotalCount,
                        currentPaidMonths: safeCurrPaidCount,

                        status: data.status === "ACTIVE" ? "active" : "paid",
                        providerName: data.supplier?.name || "Fournisseur",
                        providerLogo: data.supplier?.logo_url || "",
                        tags: tags,
                        unpaidInvoices: unpaidInvoicesList
                    });
                } else {
                    // CURRENT DEBT: Use invoice-based logic (now using pre-calculated values)
                    // Use strict paid count if available, otherwise fallback
                    const paidCount = currentDebt?.paid_count !== undefined ? currentDebt.paid_count : (sessionStrictPaidCount || 0);
                    // Use strict paid amount if available (session logic), otherwise fallback
                    const paidTotal = currentDebt?.paid_amount !== undefined ? currentDebt.paid_amount : (sessionStrictPaid || 0);

                    // Calculate start date based on persistent DB record
                    let startDateStr = "N/A";
                    let startYearNum = new Date().getFullYear();

                    if (currentDebt?.triggered_at) {
                        const dateObj = new Date(currentDebt.triggered_at);
                        startDateStr = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                        startYearNum = dateObj.getFullYear();
                    }

                    setDebt({
                        id: data.id,
                        contractRef: `${currentUnpaidCount} facture${currentUnpaidCount > 1 ? 's' : ''} impayée${currentUnpaidCount > 1 ? 's' : ''}`,
                        startDate: startDateStr,
                        startYear: startYearNum,
                        endDate: "En cours",
                        endYear: new Date().getFullYear(),
                        paidMonths: paidCount,
                        totalMonths: initialCount,
                        monthlyAmount: 0,
                        totalAmount: initialTotal,
                        remainingAmount: currentUnpaidTotal,
                        paidAmount: paidTotal,
                        status: data.status === "ACTIVE" ? "active" : "paid",
                        providerName: data.supplier?.name || "Fournisseur",
                        providerLogo: data.supplier?.logo_url || "",
                        tags: tags,
                        unpaidInvoices: unpaidInvoicesList
                    });
                }
            }
            setIsLoading(false);
        };

        fetchDebt();
    }, [debtId]);

    // Loading State handled in render
    // if (isLoading) return ...

    if (!isLoading && !debt) return <div className="p-10 text-center text-gray-400">Dossier introuvable</div>;

    // Derived Display Values based on View Mode (Safe access with defaults)
    const safeDebt = debt || {} as DebtDetail;
    let displayTotal = safeDebt.totalAmount || 0;
    let displayRemaining = safeDebt.remainingAmount || 0;
    let displayPaid = safeDebt.paidAmount || 0;
    let displayPaidCount = safeDebt.paidMonths || 0;
    let displayTotalCount = safeDebt.totalMonths || 0;
    let progress = 0;

    // Fix: Use tags to determine if we have both types (more robust than checking totals which might be 0)
    const hasBoth = safeDebt.tags?.includes("Échéancier") && safeDebt.tags?.includes("Dette courante");

    if (viewMode === 'scheduled' && safeDebt.scheduledTotal) {
        displayTotal = safeDebt.scheduledTotal;
        displayRemaining = safeDebt.scheduledRemaining || 0;
        displayPaid = safeDebt.scheduledPaid || 0;
        displayPaidCount = safeDebt.scheduledPaidMonths || 0;
        displayTotalCount = safeDebt.scheduledTotalMonths || 0;
    } else if (viewMode === 'current' && safeDebt.currentTotal) {
        displayTotal = safeDebt.currentTotal;
        displayRemaining = safeDebt.currentRemaining || 0;
        displayPaid = safeDebt.currentPaid || 0;
        displayPaidCount = safeDebt.currentPaidMonths || 0;
        displayTotalCount = safeDebt.currentTotalMonths || 0;
    }

    if (viewMode === 'current') {
        progress = displayTotalCount > 0 ? Math.round((displayPaidCount / displayTotalCount) * 100) : 0;
    } else {
        progress = displayTotal > 0 ? Math.round((displayPaid / displayTotal) * 100) : 0;
    }

    const remainingMonths = Math.max(0, (safeDebt.scheduledTotalMonths || 0) - (safeDebt.scheduledPaidMonths || 0));

    return (
        <div className={cn("space-y-6", !embedded && "min-h-screen bg-gray-50 flex flex-col pb-10")}>

            {/* Header (Only if standalone) */}
            {!embedded && (
                <header className="px-6 pt-6 pb-2 bg-gray-50 sticky top-0 z-10 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                        <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2 h-10 w-10 rounded-full bg-white shadow-sm border border-gray-100 hover:bg-gray-100 transition-colors">
                            <ArrowLeft className="h-5 w-5 text-gray-900" />
                        </Button>

                        {isLoading || !debt ? (
                            <div className="flex flex-col items-center animate-pulse">
                                <div className="h-3 w-20 bg-gray-200 rounded mb-1" />
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-5 h-5 rounded-full bg-gray-200" />
                                    <div className="h-5 w-32 bg-gray-200 rounded" />
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Détail Dette</span>
                                <div className="flex items-center justify-center gap-2 mb-1">
                                    {debt.providerLogo ? (
                                        <img src={debt.providerLogo} alt={debt.providerName} className="w-5 h-5 object-contain" />
                                    ) : null}
                                    <h1 className="text-base font-bold text-gray-900">{debt.providerName}</h1>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {debt.tags?.map(tag => (
                                        <span key={tag} className={cn(
                                            "text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide",
                                            tag === "Échéancier" ? "bg-blue-50 text-blue-600 border-blue-100" :
                                                tag === "Dette courante" ? "bg-purple-50 text-purple-600 border-purple-100" :
                                                    "bg-emerald-50 text-emerald-600 border-emerald-100"
                                        )}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="w-10"></div>
                    </div>
                </header>
            )}

            <div className={cn(!embedded && "flex-1 px-6")}>
                {isLoading || !debt ? (
                    // SKELETON
                    <div className="animate-pulse space-y-6">
                        {/* Hero Skeleton */}
                        <div className="rounded-3xl bg-gray-200 h-48 w-full shadow-sm" />

                        {/* Stats Grid Skeleton */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-2xl bg-gray-200 h-24" />
                            <div className="rounded-2xl bg-gray-200 h-24" />
                            <div className="col-span-2 rounded-2xl bg-gray-200 h-16" />
                        </div>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* View Filters for Hybrid Debts */}
                        {hasBoth && (
                            <div className="flex p-1 bg-gray-100/80 rounded-xl mb-6 mx-auto max-w-sm">
                                <button
                                    onClick={() => setViewMode('combined')}
                                    className={cn(
                                        "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg transition-all",
                                        viewMode === 'combined' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                    )}
                                >
                                    Cumulé
                                </button>
                                <button
                                    onClick={() => setViewMode('scheduled')}
                                    className={cn(
                                        "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg transition-all",
                                        viewMode === 'scheduled' ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                    )}
                                >
                                    Échéancier
                                </button>
                                <button
                                    onClick={() => setViewMode('current')}
                                    className={cn(
                                        "flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-lg transition-all",
                                        viewMode === 'current' ? "bg-white text-purple-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                    )}
                                >
                                    Courante
                                </button>
                            </div>
                        )}

                        {/* Hero Card */}
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 text-center mb-6 relative overflow-hidden">
                            <div className={cn("absolute top-0 left-0 right-0 h-1", displayRemaining === 0 ? "bg-emerald-500" : "bg-gradient-to-r from-blue-500 to-blue-600")}></div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                {viewMode === 'current' ? "Reste à payer (Courant)" : viewMode === 'scheduled' ? "Reste à payer (Plan)" : "Reste à payer (Total)"}
                            </p>
                            <p className={cn("text-4xl font-extrabold tracking-tight mb-2", displayRemaining === 0 ? "text-emerald-600" : "text-gray-900")}>
                                {displayRemaining.toLocaleString('fr-FR')}€
                            </p>
                            <p className="text-sm font-medium text-gray-500 mb-8">
                                {displayRemaining === 0 ? "Soldé" : (
                                    (viewMode === 'scheduled' || (viewMode === 'combined' && debt.monthlyAmount > 0)) ? (
                                        <span>Fin le <span className="text-gray-900 font-bold">{debt.endDate}</span></span>
                                    ) : null
                                )}
                            </p>

                            {/* Progress */}
                            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                <div className="flex justify-between items-center text-xs font-bold text-gray-900 mb-2">
                                    <span>Progression</span>
                                    <span>{progress}%</span>
                                </div>
                                <ProgressBar
                                    value={viewMode === 'current' ? displayPaidCount : displayPaid}
                                    max={viewMode === 'current' ? displayTotalCount : displayTotal}
                                    className="h-2.5 bg-gray-200"
                                    indicatorClassName={displayRemaining === 0 ? "bg-emerald-500" : "bg-blue-600"}
                                />
                                <div className="flex justify-between items-center text-[10px] font-medium text-gray-400 mt-2">
                                    <span>
                                        {viewMode === 'current' ? `${displayPaidCount} payées` : `${displayPaid.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}€ payés`}
                                    </span>
                                    <span>
                                        {viewMode === 'current' ? `${displayTotalCount} total` : `${displayTotal.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}€ total`}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Key Stats Grid */}
                        <div className="grid grid-cols-2 gap-4 pb-8">
                            {(viewMode === 'scheduled' || (viewMode === 'combined' && debt.monthlyAmount > 0)) ? (
                                <>
                                    {/* SCHEDULED DEBT */}
                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm ml-0">
                                        <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                                            <CreditCard className="h-4 w-4" />
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Mensualité</p>
                                        <p className="text-lg font-bold text-gray-900">{debt.monthlyAmount.toLocaleString('fr-FR')}€</p>
                                    </div>

                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                        <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                                            <Calendar className="h-4 w-4" />
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Restant</p>
                                        <p className="text-lg font-bold text-gray-900">{remainingMonths} mois</p>
                                    </div>

                                    {/* Full Width for Contract */}
                                    <div className="col-span-2 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Référence Contrat</p>
                                            <p className="text-sm font-bold text-gray-900 mt-0.5">{debt.contractRef}</p>
                                        </div>
                                        <div className="h-8 w-8 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center opacity-50">
                                            <Building2 className="h-4 w-4" />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* CURRENT DEBT */}
                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm ml-0">
                                        <div className="h-8 w-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                                            <Wallet className="h-4 w-4" />
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Montant Initial</p>
                                        <p className="text-lg font-bold text-gray-900">{displayTotal.toLocaleString('fr-FR')}€</p>
                                    </div>

                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                        <div className="h-8 w-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                                            <Calendar className="h-4 w-4" />
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">Date de début</p>
                                        <p className="text-lg font-bold text-gray-900">{debt.startDate}</p>
                                    </div>
                                </>
                            )}

                            {/* Total & Paid tiny */}
                            <div className="col-span-2 grid grid-cols-2 gap-4 px-2 mt-2">
                                <div>
                                    {debt.monthlyAmount > 0 && viewMode !== 'current' && (
                                        <>
                                            <p className="text-[10px] text-gray-400 uppercase font-medium">Montant Initial (Est.)</p>
                                            <p className="text-sm font-bold text-gray-900">{debt.totalAmount.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}€</p>
                                        </>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-400 uppercase font-medium">Déjà Payé (Est.)</p>
                                    <p className="text-sm font-bold text-emerald-600">{displayPaid.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}€</p>
                                </div>
                            </div>
                        </div>

                        {/* Unpaid Invoices List */}
                        {debt.unpaidInvoices && debt.unpaidInvoices.length > 0 && viewMode !== 'scheduled' && (
                            <div className="mt-6">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">
                                    {debt.unpaidInvoices.length} Facture{debt.unpaidInvoices.length > 1 ? 's' : ''} Impayée{debt.unpaidInvoices.length > 1 ? 's' : ''}
                                </h3>
                                <div className="space-y-2">
                                    {debt.unpaidInvoices.map((invoice) => {
                                        const { format, parseISO } = require('date-fns');
                                        const { fr } = require('date-fns/locale');

                                        return (
                                            <Link
                                                key={invoice.id}
                                                href={`/payments/${invoice.id}`}
                                                className="block bg-white p-4 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex-1">
                                                        <p className="text-sm font-bold text-gray-900">{invoice.reference}</p>
                                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                                            Émise le {invoice.issuedDate ? format(parseISO(invoice.issuedDate), 'dd MMM yyyy', { locale: fr }) : 'N/A'}
                                                        </p>
                                                    </div>
                                                    <p className="text-sm font-bold text-gray-900">{invoice.amount.toLocaleString('fr-FR')}€</p>
                                                </div>
                                                <div className="flex items-center justify-between text-[10px]">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-gray-500">
                                                            Échéance: {invoice.dueDate ? format(parseISO(invoice.dueDate), 'dd MMM yyyy', { locale: fr }) : 'N/A'}
                                                        </span>
                                                        <span className={cn(
                                                            "font-bold px-2 py-0.5 rounded-full",
                                                            invoice.daysLate > 30 ? "bg-red-50 text-red-700" :
                                                                invoice.daysLate > 7 ? "bg-orange-50 text-orange-700" :
                                                                    "bg-yellow-50 text-yellow-700"
                                                        )}>
                                                            {invoice.daysLate} jour{invoice.daysLate > 1 ? 's' : ''} de retard
                                                        </span>
                                                    </div>
                                                    <ChevronRight className="h-4 w-4 text-gray-300" />
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
