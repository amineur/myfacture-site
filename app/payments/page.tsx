"use client";

import { useState, useEffect, useLayoutEffect } from "react";
import { useInstantNavigation } from "@/hooks/use-instant-navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Filter, Check, X, ChevronRight, Loader2, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanies } from "@/components/providers/companies-provider";
import { useInvoices, Invoice } from "@/hooks/use-invoices";
import { format, parseISO, startOfMonth, isAfter } from "date-fns";
import { fr } from "date-fns/locale";
import { PriceDisplay } from "@/components/ui/price-display";
import { PaymentDialog } from "@/components/payments/payment-dialog";

import useLongPress from "@/hooks/use-long-press";

// Helper component for List Item with Long Press
const PaymentItem = ({
    invoice,
    isSelectionMode,
    isSelected,
    isWarning,
    onLongPress,
    onClick
}: {
    invoice: Invoice;
    isSelectionMode: boolean;
    isSelected: boolean;
    isWarning: boolean;
    onLongPress: (id: string, status: string) => void;
    onClick: (id: string, status: string) => void;
}) => {
    const bind = useLongPress(
        () => onLongPress(invoice.id, invoice.status),
        () => onClick(invoice.id, invoice.status),
        { shouldPreventDefault: true, delay: 500 }
    );

    const formatDueDate = (dateStr: string) => {
        try {
            return format(parseISO(dateStr), 'dd MMMM yyyy', { locale: fr });
        } catch (e) {
            return dateStr;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'PAID': return 'Payé';
            case 'PENDING': return 'En attente';
            case 'OPEN': return 'À payer';
            case 'LATE': return 'En retard';
            default: return status;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PAID': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'PENDING': return 'bg-orange-50 text-orange-700 border-orange-100';
            case 'OPEN': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'LATE': return 'bg-red-50 text-red-700 border-red-100';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <div
            {...bind}
            className={cn(
                "p-4 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer group select-none touch-manipulation relative overflow-hidden",
                isSelectionMode && isSelected && "bg-blue-50/50"
            )}
        >
            {/* Contextual Warning Overlay */}
            {isWarning && (
                <div className="absolute inset-0 bg-gray-900/90 z-20 flex items-center justify-center">
                    <p className="text-white font-bold text-sm flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-400" />
                        Déjà payé
                    </p>
                </div>
            )}

            <div className="flex items-start gap-4" style={{ filter: isWarning ? "blur(2px)" : "none", transition: "filter 0.2s" }}>
                {isSelectionMode && (
                    <div className={cn(
                        "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 mt-2",
                        isSelected ? "bg-blue-600 border-blue-600" : "border-gray-200 bg-white"
                    )}>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                    </div>
                )}
                <div className="h-12 w-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xs font-bold text-gray-400 overflow-hidden shrink-0">
                    {invoice.supplier?.logo_url ? <img src={invoice.supplier.logo_url} alt={invoice.supplier.name} className="w-full h-full object-cover" loading="lazy" /> : invoice.supplier?.name?.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-gray-900 truncate">{invoice.supplier?.name}</p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">{invoice.reference || "Réf. inconnue"}</p>
                        </div>
                        <div className="text-right shrink-0 py-0.5">
                            <PriceDisplay amount={invoice.amount_ttc || 0} size="base" />
                        </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <Badge variant="secondary" className={cn("text-[10px] h-5 px-1.5 font-medium border border-gray-100", getStatusColor(invoice.status))}>
                            {getStatusLabel(invoice.status)}
                        </Badge>
                        <span className="text-[10px] text-gray-400 font-medium capitalize">
                            {invoice.status === 'PAID'
                                ? (invoice.payment_date ? formatDueDate(invoice.payment_date) : 'Date inconnue')
                                : (invoice.due_date ? formatDueDate(invoice.due_date) : 'Sans échéance')
                            }
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function PaymentsPage() {
    const { navigate } = useInstantNavigation();
    const { companies } = useCompanies();
    const activeCompany = companies[0];
    const { invoices, isLoading: isInvoicesLoading, error: invoicesError, payInvoices, refresh } = useInvoices(activeCompany?.id);


    // UI State
    const [filter, setFilter] = useState<"all" | "todo" | "paid">("all");
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [showSummary, setShowSummary] = useState(false);
    const [showFuture, setShowFuture] = useState(false);
    const [warningId, setWarningId] = useState<string | null>(null);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);

    // Auto-hide warning
    useEffect(() => {
        if (warningId) {
            const timer = setTimeout(() => setWarningId(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [warningId]);

    const triggerWarning = (id: string) => {
        setWarningId(id);
        if (navigator.vibrate) navigator.vibrate(200);
    };

    // 1. Hydration Safety (Flicker-free)
    const [isMounted, setIsMounted] = useState(() => typeof window !== "undefined" && (window as any).__HYDRATED);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        (window as any).__HYDRATED = true;
        const savedFilter = localStorage.getItem("payments_filter");
        if (savedFilter && ["all", "todo", "paid"].includes(savedFilter)) {
            setFilter(savedFilter as any);
        }
        const savedSearch = localStorage.getItem("payments_search");
        if (savedSearch) setSearchTerm(savedSearch);
        setIsInitialized(true);
    }, []);

    useEffect(() => {
        if (isInitialized) {
            localStorage.setItem("payments_filter", filter);
            localStorage.setItem("payments_search", searchTerm);
        }
    }, [filter, searchTerm, isInitialized]);

    const isLoading = !isMounted || isInvoicesLoading || !activeCompany;

    // SCROLL RESTORATION
    useLayoutEffect(() => {
        if (isInitialized && !isLoading && invoices.length > 0) {
            const savedScroll = localStorage.getItem("payments_scroll");
            if (savedScroll) {
                window.scrollTo(0, parseInt(savedScroll));
                localStorage.removeItem("payments_scroll");
            }
        }
    }, [invoices, isInitialized, isLoading]);

    // SELECTION LOGIC
    const toggleSelection = (id: string) => {
        if (selectedIds.includes(id)) {
            const newIds = selectedIds.filter(i => i !== id);
            setSelectedIds(newIds);
            // Exit selection mode if no items left
            if (newIds.length === 0) {
                setIsSelectionMode(false);
            }
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleLongPress = (id: string, status: string) => {
        if (status === 'PAID') {
            triggerWarning(id);
            return;
        }

        if (!isSelectionMode) {
            setIsSelectionMode(true);
            setSelectedIds([id]);
        } else {
            // User requested: "If I want to remove it I have to do a long press again"
            // So we allow long press to toggle selection as well
            toggleSelection(id);
        }

        // Haptic feedback if available (optional)
        if (navigator.vibrate) navigator.vibrate(50);
    };

    const handleItemClick = (id: string, status: string) => {
        if (isSelectionMode) {
            if (status !== 'PAID') {
                toggleSelection(id);
            } else {
                triggerWarning(id);
            }
        } else {
            localStorage.setItem("payments_scroll", window.scrollY.toString());
            navigate(`/payments/${id}`);
        }
    };

    const handleMainAction = () => {
        if (isSelectionMode && selectedIds.length > 0) {
            setShowSummary(true);
        }
    };

    const confirmPayment = async () => {
        setIsPaymentDialogOpen(true);
        // We don't close selection mode yet, we wait for success
    };

    const cancelPayment = () => {
        setShowSummary(false);
    };

    // FILTERING LOGIC
    const filteredPayments = invoices.filter((p) => {
        if (searchTerm) {
            const cleanSearch = searchTerm.toLowerCase().replace(/\s/g, '');
            const supplierMatch = p.supplier?.name.toLowerCase().includes(searchTerm.toLowerCase());
            const referenceMatch = p.reference?.toLowerCase().replace(/\s/g, '').includes(cleanSearch);

            if (!supplierMatch && !referenceMatch) {
                return false;
            }
        }

        if (filter === "all") return true;
        if (filter === "todo") return ['PENDING', 'OPEN', 'LATE'].includes(p.status);
        if (filter === "paid") return p.status === 'PAID';
        return true;
    });

    // GROUPING LOGIC (By Month of Due Date)
    const groupedPayments = filteredPayments.reduce((groups, invoice) => {
        if (!invoice.due_date) {
            // Invoices without due_date go into a "Sans échéance" group
            const monthKey = 'Sans échéance';
            if (!groups[monthKey]) {
                groups[monthKey] = { items: [], total: 0 };
            }
            groups[monthKey].items.push(invoice);
            groups[monthKey].total += (invoice.amount_ttc || 0);
            return groups;
        }

        const date = parseISO(invoice.due_date);

        // Guard against invalid dates
        if (isNaN(date.getTime())) {
            const monthKey = 'Sans échéance';
            if (!groups[monthKey]) {
                groups[monthKey] = { items: [], total: 0 };
            }
            groups[monthKey].items.push(invoice);
            groups[monthKey].total += (invoice.amount_ttc || 0);
            return groups;
        }

        const monthStart = startOfMonth(date);
        const currentMonthStart = startOfMonth(new Date());

        // Skip future months if not toggled, UNLESS we are searching
        if (!showFuture && !searchTerm && isAfter(monthStart, currentMonthStart)) {
            return groups;
        }

        const monthKey = format(date, 'MMMM yyyy', { locale: fr });

        if (!groups[monthKey]) {
            groups[monthKey] = { items: [], total: 0 };
        }
        groups[monthKey].items.push(invoice);
        groups[monthKey].total += (invoice.amount_ttc || 0);
        return groups;
    }, {} as Record<string, { items: Invoice[], total: number }>);

    // STATS LOGIC
    const now = new Date();
    const isOverdue = (inv: Invoice) => {
        if (inv.status === 'PAID') return false;
        if (inv.status === 'LATE') return true;
        if (!inv.due_date) return false;
        const due = parseISO(inv.due_date);
        if (isNaN(due.getTime())) return false;
        return due.getTime() < now.getTime();
    };

    const currentMonthKey = format(now, 'MMMM yyyy', { locale: fr });

    const stats = {
        currentMonthRemaining: invoices
            .filter(p => {
                if (!p.due_date) return false;
                const pDate = parseISO(p.due_date);
                if (isNaN(pDate.getTime())) return false;
                return format(pDate, 'MMMM yyyy', { locale: fr }) === currentMonthKey
                    && ['PENDING', 'OPEN', 'LATE'].includes(p.status);
            })
            .reduce((acc, curr) => acc + (curr.amount_ttc || 0), 0),
        previousRemaining: invoices
            .filter(p => isOverdue(p))
            .reduce((acc, curr) => acc + (curr.amount_ttc || 0), 0),
        totalRemaining: invoices
            .filter(p => {
                if (!['PENDING', 'OPEN', 'LATE'].includes(p.status)) return false;

                // Sync visibility with groupedPayments: Skip future months if not toggled + not searching
                if (!showFuture && !searchTerm && p.due_date) {
                    const pDue = parseISO(p.due_date);
                    if (!isNaN(pDue.getTime())) {
                        const monthStart = startOfMonth(pDue);
                        const currentMonthStart = startOfMonth(new Date());
                        if (isAfter(monthStart, currentMonthStart)) return false;
                    }
                }
                return true;
            })
            .reduce((acc, curr) => acc + (curr.amount_ttc || 0), 0),
    };

    const fmt = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'PAID': return 'Payé';
            case 'PENDING': return 'En attente';
            case 'OPEN': return 'À payer';
            case 'LATE': return 'En retard';
            default: return status;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'PAID': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'PENDING': return 'bg-orange-50 text-orange-700 border-orange-100';
            case 'OPEN': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'LATE': return 'bg-red-50 text-red-700 border-red-100';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    // --- RENDER HELPERS ---
    const renderPaymentDialog = () => (
        <PaymentDialog
            isOpen={isPaymentDialogOpen}
            onClose={() => setIsPaymentDialogOpen(false)}
            invoices={invoices.filter(inv => selectedIds.includes(inv.id)).map(inv => ({
                id: inv.id,
                reference: inv.reference || "",
                amount_ttc: inv.amount_ttc,
                supplier: {
                    id: (inv.supplier as any)?.id || "",
                    name: inv.supplier?.name || "Inconnu",
                    iban: (inv.supplier as any)?.iban,
                    bic: (inv.supplier as any)?.bic
                }
            }))}
            onSuccess={() => {
                setIsPaymentDialogOpen(false);
                setIsSelectionMode(false);
                setSelectedIds([]);
                setShowSummary(false);
                refresh();
            }}
        />
    );

    // --- PAYMENT SUMMARY VIEW ---
    if (showSummary) {
        const selectedItems = invoices.filter(p => selectedIds.includes(p.id));
        const totalToPay = selectedItems.reduce((acc, curr) => acc + (curr.amount_ttc || 0), 0);

        return (
            <>
                <main className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
                    <header className="px-6 pt-6 pb-4 bg-white border-b border-gray-100 flex items-center gap-4 sticky top-0 z-10">
                        <Button variant="ghost" size="icon" onClick={() => setShowSummary(false)} className="-ml-2 h-10 w-10 rounded-full hover:bg-gray-100 transition-colors">
                            <ChevronRight className="h-6 w-6 rotate-180 text-gray-900" />
                        </Button>
                        <h1 className="text-xl font-bold text-gray-900">Récapitulatif du virement</h1>
                    </header>

                    <div className="flex-1 p-6 overflow-y-auto">
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                            <div className="px-5 py-4 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Factures ({selectedItems.length})</p>
                            </div>
                            <div className="divide-y divide-gray-50">
                                {selectedItems.map(item => (
                                    <div key={item.id} className="p-4 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0">
                                                {item.supplier?.logo_url ? (
                                                    <img src={item.supplier.logo_url} alt={item.supplier.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    item.supplier?.name?.substring(0, 2).toUpperCase()
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-gray-900 line-clamp-1">{item.supplier?.name}</p>
                                                <p className="text-xs text-gray-400 font-medium">{item.reference}</p>
                                            </div>
                                        </div>
                                        <PriceDisplay amount={item.amount_ttc || 0} size="sm" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-white border-t border-gray-100 pb-10 safe-area-pb shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-medium text-gray-500">Total à payer</span>
                            <PriceDisplay amount={totalToPay} size="3xl" className="text-blue-600" mutedColor="text-blue-400/70" />
                        </div>
                        <Button onClick={confirmPayment} className="w-full h-12 rounded-full shadow-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all">
                            Valider le paiement ({selectedItems.length})
                        </Button>
                        <Button onClick={cancelPayment} variant="ghost" className="w-full mt-3 h-12 rounded-full text-gray-500">
                            Annuler
                        </Button>
                    </div>
                </main>
                {renderPaymentDialog()}
            </>
        );
    }

    // --- MAIN LIST VIEW ---
    return (
        <main className={cn(
            "p-6 max-w-md mx-auto space-y-6 pb-32",
            isMounted ? "opacity-100" : "opacity-0"
        )}>
            <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight text-gray-900">Suivi des règlements</h1>
            </div>

            <section className="grid grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-28">
                    <p className="text-sm font-medium text-gray-500 capitalize">{currentMonthKey}</p>
                    <div className="min-h-[40px] flex flex-col justify-center">
                        {isLoading ? (
                            <div className="h-7 w-24 bg-gray-100 animate-pulse rounded" />
                        ) : (
                            <PriceDisplay amount={stats.currentMonthRemaining} size="2xl" />
                        )}
                        <p className="text-xs text-blue-600 font-medium mt-1">à payer ce mois</p>
                    </div>
                </div>

                <div className="bg-red-50 p-4 rounded-2xl border border-red-100 flex flex-col justify-between h-28">
                    <div className="flex justify-between items-start">
                        <p className="text-sm font-bold text-red-900">En retard</p>
                        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">Attention</Badge>
                    </div>
                    <div className="min-h-[40px] flex flex-col justify-center">
                        {isLoading ? (
                            <div className="h-7 w-24 bg-white/50 animate-pulse rounded" />
                        ) : (
                            <PriceDisplay amount={stats.previousRemaining} size="2xl" className="text-red-700" mutedColor="text-red-600/60" />
                        )}
                        <div className="h-4 flex items-center mt-1">
                            {isLoading ? (
                                <div className="h-3 w-32 bg-white/30 animate-pulse rounded" />
                            ) : (
                                <div className="flex items-center gap-1 text-[10px] text-red-700 font-medium leading-tight">
                                    <span>Total dû :</span>
                                    <PriceDisplay amount={stats.totalRemaining} size="xs" className="text-red-700" mutedColor="text-red-600/60" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-gray-100 p-1 rounded-xl flex gap-1">
                <button onClick={() => { setFilter("all"); setIsSelectionMode(false); }} className={cn("flex-1 py-2 text-sm font-medium rounded-lg", filter === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}>Tous</button>
                <button onClick={() => setFilter("todo")} className={cn("flex-1 py-2 text-sm font-medium rounded-lg", filter === "todo" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}>À payer</button>
                <button onClick={() => { setFilter("paid"); setIsSelectionMode(false); }} className={cn("flex-1 py-2 text-sm font-medium rounded-lg", filter === "paid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}>Payé</button>
            </section>

            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-3 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Rechercher une facture..."
                        className="w-full bg-white border border-gray-100 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                    />
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowFuture(!showFuture)}
                    className={cn(
                        "h-10 w-10 rounded-xl shrink-0 transition-all",
                        showFuture ? "bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100" : "bg-white border border-gray-100 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    )}
                    title={showFuture ? "Masquer le futur" : "Voir le futur"}
                >
                    <CalendarClock className="h-5 w-5" />
                </Button>
            </div>

            <section className="space-y-6">
                {isLoading ? (
                    <div className="space-y-6">
                        {/* Month 1 Skeleton */}
                        <div className="space-y-3">
                            <div className="flex items-baseline justify-between px-1">
                                <div className="h-6 w-32 bg-gray-100 animate-pulse rounded" />
                                <div className="h-6 w-20 bg-gray-50 animate-pulse rounded-full" />
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="p-4 border-b border-gray-50 last:border-0 flex items-center gap-4 h-[72px]">
                                        <div className="h-10 w-10 rounded-xl bg-gray-50 animate-pulse" />
                                        <div className="flex-1 space-y-2">
                                            <div className="h-4 w-28 bg-gray-100 animate-pulse rounded" />
                                            <div className="h-3 w-40 bg-gray-50 animate-pulse rounded" />
                                        </div>
                                        <div className="h-4 w-16 bg-gray-100 animate-pulse rounded" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* Month 2 Skeleton */}
                        <div className="space-y-3">
                            <div className="flex items-baseline justify-between px-1 opacity-50">
                                <div className="h-6 w-24 bg-gray-100 animate-pulse rounded" />
                                <div className="h-6 w-16 bg-gray-50 animate-pulse rounded-full" />
                            </div>
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden opacity-50">
                                {Array.from({ length: 2 }).map((_, i) => (
                                    <div key={i} className="p-4 border-b border-gray-50 last:border-0 flex items-center gap-4 h-[72px]">
                                        <div className="h-10 w-10 rounded-xl bg-gray-50 animate-pulse" />
                                        <div className="flex-1 space-y-1">
                                            <div className="h-3.5 w-24 bg-gray-100 animate-pulse rounded" />
                                            <div className="h-2.5 w-32 bg-gray-50 animate-pulse rounded" />
                                        </div>
                                        <div className="h-3.5 w-14 bg-gray-100 animate-pulse rounded" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : searchTerm ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {filteredPayments.length > 0 ? filteredPayments.map((invoice) => (
                            <PaymentItem
                                key={invoice.id}
                                invoice={invoice}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedIds.includes(invoice.id)}
                                isWarning={warningId === invoice.id}
                                onLongPress={handleLongPress}
                                onClick={handleItemClick}
                            />
                        )) : (
                            <div className="p-8 text-center text-gray-400">Aucun résultat pour "{searchTerm}"</div>
                        )}
                    </div>
                ) : invoicesError ? (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-2">
                        <p className="text-sm font-medium text-red-800">Erreur de chargement</p>
                        <p className="text-xs text-red-600">{invoicesError}</p>
                        <button onClick={() => refresh()} className="text-xs text-red-700 underline mt-2">Réessayer</button>
                    </div>
                ) : Object.keys(groupedPayments).length === 0 && filteredPayments.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-2">
                        <p className="text-sm font-medium text-gray-500">
                            {filter === "todo" ? "Aucune facture à payer" : filter === "paid" ? "Aucune facture payée" : "Aucune facture"}
                        </p>
                        <p className="text-xs text-gray-400">
                            {invoices.length > 0
                                ? `${invoices.length} facture(s) chargée(s) mais aucune ne correspond au filtre actuel`
                                : "Aucune facture trouvée pour cette entreprise"}
                        </p>
                    </div>
                ) : Object.keys(groupedPayments).length === 0 && filteredPayments.length > 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-2">
                        <p className="text-sm font-medium text-gray-500">
                            {filteredPayments.length} facture(s) dans des mois futurs
                        </p>
                        <p className="text-xs text-gray-400">Appuyez sur l'icône calendrier pour afficher les mois à venir</p>
                    </div>
                ) : (
                    Object.entries(groupedPayments).map(([month, group]) => (
                        <div key={month} className="space-y-3">
                            <div
                                onClick={() => navigate(`/payments/month/${encodeURIComponent(month)}`)}
                                className="flex items-baseline justify-between px-1 cursor-pointer hover:opacity-70 transition-opacity card-pressable"
                            >
                                <h3 className="text-lg font-bold text-gray-900 capitalize">{month}</h3>
                                <PriceDisplay amount={group.total} size="sm" className="bg-gray-100 px-2 py-0.5 rounded-full text-gray-500" mutedColor="text-gray-400" />
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                {group.items.map((invoice) => (
                                    <PaymentItem
                                        key={invoice.id}
                                        invoice={invoice}
                                        isSelectionMode={isSelectionMode}
                                        isSelected={selectedIds.includes(invoice.id)}
                                        isWarning={warningId === invoice.id}
                                        onLongPress={handleLongPress}
                                        onClick={handleItemClick}
                                    />
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </section>

            {/* FLOATING ACTION BUTTON - ONLY SHOW WHEN SELECTED */}
            {isSelectionMode && selectedIds.length > 0 && (
                <div className="fixed bottom-32 left-6 right-6 max-w-md mx-auto z-40 transition-all duration-300 animate-in slide-in-from-bottom-10 fade-in">
                    <Button onClick={handleMainAction} className="w-full h-14 rounded-full shadow-xl font-semibold transition-all duration-300 flex flex-col items-center justify-center gap-0.5 bg-gray-900 hover:bg-black text-white">
                        <span className="text-sm">Payer la sélection ({selectedIds.length})</span>
                        <PriceDisplay
                            amount={invoices.filter(inv => selectedIds.includes(inv.id)).reduce((acc, inv) => acc + (inv.amount_ttc || 0), 0)}
                            size="xs"
                            className="text-white opacity-90"
                            mutedColor="text-white/60"
                        />
                    </Button>
                    <Button variant="outline" onClick={() => { setIsSelectionMode(false); setSelectedIds([]); }} className="w-full h-12 rounded-full bg-white border-2 border-gray-200 text-gray-700 hover:bg-gray-50 font-medium shadow-lg mt-3">
                        <X className="h-4 w-4 mr-2" /> Annuler
                    </Button>
                </div>
            )}
            {/* TOAST NOTIFICATION REMOVED (Replaced by Contextual Warning) */}
            {/* PAYMENT DIALOG REDERED VIA HELPER */}
            {renderPaymentDialog()}
        </main>
    );
}
