"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Building2, Calendar, CheckCircle2, CreditCard, Download, Euro, LayoutDashboard, Loader2, Minus, MoreHorizontal, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, Wallet, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { PriceDisplay } from "@/components/ui/price-display";
import { cn } from "@/lib/utils";

// Helper to clean raw bank labels
const cleanBankLabel = (label: string): string => {
    if (!label) return "Inconnu";
    let cleaned = label;
    const prefixes = ["PRLV SEPA", "VIR SEPA", "VIR INST", "VIREMENT", "PAIEMENT CB", "CB", "RETRAIT", "PRLV", "AVOIR", "VIR"];
    for (const prefix of prefixes) {
        if (cleaned.toUpperCase().startsWith(prefix)) {
            cleaned = cleaned.substring(prefix.length).trim();
        }
    }
    cleaned = cleaned.replace(/^[-:.\d\s]+/, '').trim();
    const final = cleaned || label;
    return final.charAt(0).toUpperCase() + final.slice(1).toLowerCase();
};

const getLogoPath = (name: string) => {
    if (name?.includes('Qonto')) return '/logos/qonto-logo.png';
    if (name?.includes('Crédit Mutue')) return '/logos/cm-logo.png';
    return null;
};

export default function TransactionsPage() {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [archivedAccounts, setArchivedAccounts] = useState<any[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

    interface Transaction {
        id: string;
        date: string;
        label: string;
        amount: number;
        side: 'CREDIT' | 'DEBIT';
        account_id: string;
        company_id: string;
        supplier_id: string | null;
        invoice_id: string | null;
        status: string;
        category?: string;
        supplier?: { id: string; name: string; logo_url?: string };
        invoice?: { reference: string };
        raw_data?: any;
    }

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isTransactionsLoading, setIsTransactionsLoading] = useState(false);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [isMapping, setIsMapping] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState<"all" | "in" | "out">("all");
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [showFilters, setShowFilters] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [isAutoScanning, setIsAutoScanning] = useState(false);
    const [longPressActiveId, setLongPressActiveId] = useState<string | null>(null);
    const [reconcileTarget, setReconcileTarget] = useState<string | null>(null); // transactionId for reconcile input
    const [reconcileRef, setReconcileRef] = useState("");
    const pressTimer = useRef<NodeJS.Timeout | null>(null);

    const startPress = (id: string) => {
        pressTimer.current = setTimeout(() => {
            setLongPressActiveId(id);
        }, 500); // 500ms for long press
    };

    const endPress = () => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    const fetchTransactions = useCallback(async () => {
        setIsTransactionsLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedAccountId !== 'all') {
                params.set('accountId', selectedAccountId);
            } else {
                // If searching, include ALL accounts (active + archived)
                const targetAccounts = searchTerm ? [...accounts, ...archivedAccounts] : accounts;
                const targetIds = targetAccounts.map(a => a.id).filter(Boolean);
                if (targetIds.length > 0) {
                    targetIds.forEach(id => params.append('accountId', id));
                }
            }
            const res = await fetch(`/api/transactions?${params}`);
            if (res.ok) {
                const data: Transaction[] = await res.json();
                setTransactions(data);
            } else {
                setTransactions([]);
            }
        } catch (error) {
            console.error("Error fetching transactions:", error);
            setTransactions([]);
        }
        setIsTransactionsLoading(false);
    }, [selectedAccountId, accounts, archivedAccounts, searchTerm]);

    useEffect(() => {
        setIsMounted(true);
        setIsTransactionsLoading(true);

        // Charger comptes ET transactions en parallèle
        Promise.all([
            fetch('/api/bank-accounts').then(res => res.ok ? res.json() : []),
            fetch('/api/transactions').then(res => res.ok ? res.json() : []),
        ]).then(([accountsData, txData]: [any[], Transaction[]]) => {
            if (accountsData?.length) {
                const active = accountsData.filter((a: any) => !a.metadata?.is_closed);
                const archived = accountsData.filter((a: any) => a.metadata?.is_closed);
                const order = ['Qonto', 'Crédit Mutuelle'];
                const sortedActive = active.sort((a: any, b: any) => {
                    const indexA = order.findIndex(o => a.name?.includes(order[0]));
                    const indexB = order.findIndex(o => b.name?.includes(order[1]));
                    return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
                });
                setAccounts(sortedActive);
                setArchivedAccounts(archived);

                // Charger fournisseurs en arrière-plan (non-bloquant)
                const companyId = accountsData[0]?.company_id;
                if (companyId) {
                    fetch(`/api/suppliers-data?companyId=${companyId}`)
                        .then(res => res.ok ? res.json() : [])
                        .then(setSuppliers);
                }
            }
            setTransactions(txData || []);
            setIsTransactionsLoading(false);
        });
    }, []);

    const handleMapSupplier = async (transaction: Transaction, supplierId: string, pattern: string, invoiceId?: string) => {
        setIsMapping(true);
        try {
            const companyId = accounts[0]?.company_id || (transaction as any).company_id;
            const res = await fetch('/api/transactions/map', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId,
                    supplierId,
                    pattern,
                    invoiceId,
                    applyToExisting: true
                })
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Succès : ${data.message}`);
                fetchTransactions(); // Refresh
            }
        } catch (error) {
            console.error("Error mapping supplier:", error);
        }
        setIsMapping(false);
    };

    const handleReconcile = async (transactionId: string, invoiceId: string) => {
        setIsMapping(true);
        try {
            const res = await fetch('/api/transactions/reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId, invoiceId })
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Rapprochement réussi : ${data.message || 'Facture liée'}`);
                fetchTransactions(); // Refresh
            } else {
                const error = await res.json();
                alert(`Erreur : ${error.error || 'Impossible de lier la facture'}`);
            }
        } catch (error) {
            console.error("Error reconciling transaction:", error);
        }
        setIsMapping(false);
    };

    const handleAutoReconcile = async () => {
        if (!accounts[0]?.company_id) return;
        setIsAutoScanning(true);
        try {
            const res = await fetch('/api/transactions/reconcile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    autoScan: true, 
                    companyId: accounts[0].company_id 
                })
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Scan terminé : ${data.linkedCount} rapprochement(s) effectué(s).`);
                fetchTransactions();
            }
        } catch (error) {
            console.error("Error in auto-scan:", error);
        }
        setIsAutoScanning(false);
    };

    // Re-fetch uniquement quand l'utilisateur change de compte (pas au mount initial)
    const prevAccountId = useRef(selectedAccountId);
    useEffect(() => {
        if (!isMounted) return;
        if (prevAccountId.current === selectedAccountId) {
            prevAccountId.current = selectedAccountId;
            return;
        }
        prevAccountId.current = selectedAccountId;
        fetchTransactions();
    }, [selectedAccountId, isMounted]); // eslint-disable-line react-hooks/exhaustive-deps

    const isLoading = !isMounted || isTransactionsLoading;

    const categories = Array.from(new Set(transactions.map(tx => {
        const raw = tx.raw_data || {};
        return raw.cashflow_subcategory?.name || tx.category || raw.cashflow_category?.name || "Autre";
    }))).filter(Boolean).sort();

    const filteredTransactions = transactions.filter((tx) => {
        if (searchTerm) {
            const cleanSearch = searchTerm.toLowerCase();
            // Normalized search: remove all non-alphanumeric chars for flexible matching
            const normSearch = cleanSearch.replace(/[^a-z0-9]/g, '');

            const labelMatch = tx.label.toLowerCase().includes(cleanSearch);
            const raw = tx.raw_data || {};
            const counterparty = (raw['Counterparty name'] || "").toLowerCase();
            const reference = (raw['reference'] || raw['Reference'] || "").toLowerCase();

            // Normalized reference match (e.g. "2312 1068" matches "F23121068")
            const normReference = reference.replace(/[^a-z0-9]/g, '');
            const normRefMatch = normSearch.length >= 3 && normReference.includes(normSearch);

            // Also search in linked invoice reference
            const invoiceRef = (tx.invoice?.reference || "").toLowerCase();
            const normInvoiceRef = invoiceRef.replace(/[^a-z0-9]/g, '');
            const invoiceRefMatch = invoiceRef.includes(cleanSearch) || (normSearch.length >= 3 && normInvoiceRef.includes(normSearch));

            // Amount matching (handle dots and commas)
            const amountStr = Math.abs(tx.amount).toString();
            const amountFr = Math.abs(tx.amount).toLocaleString('fr-FR', { minimumFractionDigits: 2, useGrouping: false }).replace('.', ',');
            const amountMatch = amountStr.includes(cleanSearch) || amountFr.includes(cleanSearch.replace('.', ','));

            if (!labelMatch && !counterparty.includes(cleanSearch) && !reference.includes(cleanSearch) && !normRefMatch && !invoiceRefMatch && !amountMatch) return false;
        }
        if (filterType === "in" && tx.side !== 'CREDIT') return false;
        if (filterType === "out" && tx.side !== 'DEBIT') return false;
        if (dateRange.start && tx.date < dateRange.start) return false;
        if (dateRange.end && tx.date > dateRange.end) return false;
        if (selectedCategory !== "all") {
            const raw = tx.raw_data || {};
            const catName = raw.cashflow_subcategory?.name || tx.category || raw.cashflow_category?.name || "Autre";
            if (catName !== selectedCategory) return false;
        }
        return true;
    });

    const [showFilteredBalance, setShowFilteredBalance] = useState(false);
    const allAccts = [...accounts, ...archivedAccounts];
    const selectedAccount = allAccts.find(a => a.id === selectedAccountId);
    const trueBalance = selectedAccountId === 'all' ? accounts.reduce((acc, a) => acc + (a.balance || 0), 0) : selectedAccount?.balance || 0;
    const filteredBalance = filteredTransactions.reduce((acc, tx) => acc + tx.amount, 0);

    let displayBalance = showFilteredBalance ? filteredBalance : trueBalance;
    if (selectedAccount?.metadata?.is_closed) displayBalance = 0;

    let balanceLabel = "Solde Actuel";
    if (selectedAccount?.metadata?.is_closed) balanceLabel = "Solde Archive";
    else if (selectedAccountId === 'all' && !showFilteredBalance) balanceLabel = "Solde Total";
    if (showFilteredBalance) {
        if (filterType === 'in') balanceLabel = "Total Entrées";
        else if (filterType === 'out') balanceLabel = "Total Sorties";
        else balanceLabel = "Total Sélection";
    }

    const resetFilters = () => {
        setFilterType("all");
        setDateRange({ start: "", end: "" });
        setSelectedCategory("all");
        setShowFilteredBalance(false);
    };

    const showLastUpdate = selectedAccount && !selectedAccount.metadata?.is_closed;

    return (
        <main className={cn("p-6 max-w-md mx-auto space-y-4 pb-24 transition-opacity", isMounted ? "opacity-100" : "opacity-0")}>
            <header className="space-y-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
                    <button 
                        onClick={handleAutoReconcile}
                        disabled={isAutoScanning}
                        className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                            isAutoScanning 
                                ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                                : "bg-blue-600 text-white hover:bg-blue-700 border-none shadow-md active:scale-95"
                        )}
                    >
                        {isAutoScanning ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <Sparkles className="h-3 w-3" />
                        )}
                        {isAutoScanning ? "Scan..." : "Rapprocher tout ✨"}
                    </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-6 px-6">
                    <button onClick={() => { setSelectedAccountId('all'); setFilterType("all"); }} className={cn("px-4 py-2 text-sm font-semibold rounded-full border whitespace-nowrap", selectedAccountId === 'all' ? "bg-gray-900 text-white border-gray-900 shadow-sm" : "bg-white text-gray-600 border-gray-200")}>Tout</button>
                    {allAccts.map(acc => {
                        const logo = getLogoPath(acc.name);
                        const isSelected = selectedAccountId === acc.id;
                        return (
                            <button key={acc.id} onClick={() => { setSelectedAccountId(acc.id); setFilterType(acc.metadata?.is_closed ? 'all' : (acc.name?.includes('Crédit Mutuelle') ? 'in' : (acc.name?.includes('Qonto') ? 'out' : 'all'))); }} className={cn("px-6 py-2 text-sm font-semibold rounded-full border whitespace-nowrap flex items-center justify-center gap-2", isSelected ? (acc.metadata?.is_closed ? "bg-amber-600 text-white border-amber-600" : "bg-gray-900 text-white border-gray-900 shadow-sm") : "bg-white text-gray-600 border-gray-200", acc.metadata?.is_closed && !isSelected && "text-gray-400 opacity-60")}>
                                {logo ? (
                                    <img src={logo} alt={acc.name} className={cn("h-3.5 w-auto object-contain transition-all shrink-0", isSelected && "brightness-0 invert")} />
                                ) : (
                                    <Building2 className="h-3 w-3 opacity-50 shrink-0" />
                                )}
                                <span className={cn("text-[10px] font-bold uppercase tracking-tight", isSelected ? "text-white" : "text-gray-900")}>
                                    {acc.name}
                                </span>
                                {acc.metadata?.is_closed && <X className="h-3 w-3 shrink-0 opacity-70" />}
                            </button>
                        );
                    })}
                </div>
                <Card className={cn("text-white p-5 rounded-2xl relative overflow-hidden shadow-lg", selectedAccount?.metadata?.is_closed ? "bg-amber-700" : "bg-gray-900")}>
                    <div className="relative z-10">
                        <p className={cn("text-xs font-medium flex items-center gap-2", displayBalance < 0 ? "text-red-400" : (displayBalance < 500 ? "text-orange-400" : "text-emerald-400"))}>
                            <Wallet className="h-3 w-3" /> {balanceLabel}
                        </p>
                        <div className="mt-1"><PriceDisplay amount={displayBalance} size="2xl" className="text-white" /></div>
                    </div>
                </Card>
                <div className="relative group">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input type="text" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-12 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none" />
                    <button onClick={() => setShowFilters(!showFilters)} className={cn("absolute right-2 top-1 px-2 py-1 rounded text-gray-400", showFilters && "text-blue-500")}><SlidersHorizontal className="h-4 w-4" /></button>
                </div>
                {showFilters && (
                    <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <input type="date" value={dateRange.start} onChange={(e) => setDateRange(p => ({ ...p, start: e.target.value }))} className="bg-gray-50 p-2 rounded text-xs outline-none" />
                            <input type="date" value={dateRange.end} onChange={(e) => setDateRange(p => ({ ...p, end: e.target.value }))} className="bg-gray-50 p-2 rounded text-xs outline-none" />
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-600">
                            <span>Calculer total filtré</span>
                            <button onClick={() => setShowFilteredBalance(!showFilteredBalance)} className={cn("w-7 h-4 rounded-full relative transition-colors", showFilteredBalance ? "bg-blue-500" : "bg-gray-300")}><div className={cn("absolute w-3 h-3 bg-white rounded-full transition-all top-0.5", showFilteredBalance ? "right-0.5" : "left-0.5")} /></button>
                        </div>
                    </div>
                )}
            </header>

            <section className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse bg-gray-50/50" />)
                ) : filteredTransactions.length > 0 ? (
                    filteredTransactions.map((tx) => {
                        const raw = tx.raw_data || {};
                        const counterparty = raw['Counterparty name'] || cleanBankLabel(tx.label) || "Inconnu";
                        const reference = raw['reference'] || raw['Reference'] || "Virement";
                        const displayCategory = raw.cashflow_subcategory?.name || tx.category || raw.cashflow_category?.name;
                        const acctName = allAccts.find(a => a.id === tx.account_id)?.name || "";
                        const logo = getLogoPath(acctName);
                        
                        return (
                            <div 
                                key={tx.id} 
                                onPointerDown={() => startPress(tx.id)}
                                onPointerUp={endPress}
                                onPointerLeave={endPress}
                                className="px-4 py-2 flex items-center justify-between hover:bg-gray-50/50 transition-colors group relative select-none"
                            >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    {/* Left: Bank Logo Centered */}
                                    {selectedAccountId === 'all' && (
                                        <div className="shrink-0">
                                            {logo ? (
                                                <img src={logo} alt={acctName} className="h-4 w-auto opacity-80 grayscale group-hover:opacity-100 transition-all" />
                                            ) : (
                                                <Building2 className="h-3.5 w-3.5 text-gray-300" />
                                            )}
                                        </div>
                                    )}

                                    {/* Main Content Column: Supplier & Reference */}
                                    <div className="min-w-0 flex-1 flex flex-col">
                                        <span className="text-[9px] text-gray-500 font-bold leading-none mb-1 uppercase tracking-tight">{format(parseISO(tx.date), 'dd MMM yy', { locale: fr })}</span>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-gray-900 text-xs truncate uppercase tracking-tight leading-tight">{counterparty}</p>
                                            {tx.supplier && (
                                                <div className="flex flex-wrap items-center gap-1">
                                                    <div className="flex items-center gap-1 bg-blue-50 px-1 rounded border border-blue-100 shrink-0">
                                                        <Building2 className="h-2 w-2 text-blue-500" />
                                                        <span className="text-[8px] font-bold text-blue-600 uppercase">{tx.supplier.name}</span>
                                                    </div>
                                                    {tx.invoice && (
                                                        <div className="flex items-center gap-1 bg-emerald-50 px-1 rounded border border-emerald-100 shrink-0">
                                                            <CheckCircle2 className="h-2 w-2 text-emerald-500" />
                                                            <span className="text-[8px] font-bold text-emerald-600 uppercase">Facture: {tx.invoice.reference}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[11px] text-gray-700 truncate max-w-[200px] font-normal leading-tight group-hover:text-gray-900 transition-colors">{reference}</p>
                                            
                                            {/* Discreet Long-Press Mapping Trigger */}
                                            <AnimatePresence>
                                                {longPressActiveId === tx.id && (
                                                    <motion.div 
                                                        initial={{ opacity: 0, x: -5 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        exit={{ opacity: 0, x: -5 }}
                                                        className="flex items-center gap-1"
                                                    >
                                                        {/* Supplier Selection Dropdown */}
                                                        {!tx.supplier_id && (
                                                            <select 
                                                                disabled={isMapping}
                                                                onChange={(e) => {
                                                                    const sId = e.target.value;
                                                                    if (sId === 'new') {
                                                                        alert("Redirection vers la création de fournisseur...");
                                                                    } else if (sId) {
                                                                        const pattern = prompt("Mot-clé pour automatisation :", counterparty) || counterparty;
                                                                        handleMapSupplier(tx, sId, pattern);
                                                                        setLongPressActiveId(null);
                                                                    }
                                                                }}
                                                                className="bg-blue-600 text-[8px] font-bold text-white rounded px-1 py-0.5 border-none focus:ring-0 outline-none cursor-pointer uppercase h-4 leading-none"
                                                                value={tx.supplier_id || ""}
                                                            >
                                                                <option value="" className="text-gray-900">Associer...</option>
                                                                {suppliers.map(s => (
                                                                    <option key={s.id} value={s.id} className="text-gray-900">{s.name}</option>
                                                                ))}
                                                                <option value="new" className="text-gray-900">+ Nouveau fournisseur</option>
                                                            </select>
                                                        )}

                                                        {/* Reconcile with Invoice Dropdown (if supplier exists) */}
                                                        {tx.supplier_id && !tx.invoice_id && (
                                                            <button
                                                                onPointerDown={(e) => e.stopPropagation()}
                                                                onPointerUp={(e) => e.stopPropagation()}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setReconcileTarget(tx.id);
                                                                    setReconcileRef("");
                                                                    setLongPressActiveId(null);
                                                                }}
                                                                className="bg-emerald-600 text-[8px] font-bold text-white rounded px-1 py-0.5 border-none hover:bg-emerald-700 transition-colors uppercase h-4 leading-none"
                                                            >
                                                                Lier facture
                                                            </button>
                                                        )}

                                                        <button 
                                                            onClick={() => setLongPressActiveId(null)}
                                                            className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <X className="h-2 w-2" />
                                                        </button>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: Amount & Category */}
                                <div className="text-right shrink-0 flex flex-col items-end gap-1.5 pl-2">
                                    <PriceDisplay amount={tx.amount} size="xs" className={cn("font-bold text-xs", tx.side === 'CREDIT' ? "text-emerald-600" : "text-gray-900")} />
                                    {displayCategory && (
                                        <span className="text-[8px] font-medium text-gray-400 bg-gray-50 px-1 rounded border border-gray-100 group-hover:bg-white">{displayCategory}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="p-8 text-center text-gray-400 text-xs italic">Aucune transaction</div>
                )}
            </section>

            {/* Modal Lier Facture */}
            {reconcileTarget && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setReconcileTarget(null)}>
                    <div className="bg-white rounded-xl p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-sm font-bold text-gray-900 mb-3">Lier une facture</h3>
                        <input
                            type="text"
                            autoFocus
                            value={reconcileRef}
                            onChange={(e) => setReconcileRef(e.target.value)}
                            onKeyDown={async (e) => {
                                if (e.key === 'Enter' && reconcileRef.trim()) {
                                    await handleReconcile(reconcileTarget, reconcileRef.trim());
                                    setReconcileTarget(null);
                                    setReconcileRef("");
                                }
                            }}
                            placeholder="Numéro de facture (ID ou Réf)"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        />
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => setReconcileTarget(null)}
                                className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={async () => {
                                    if (reconcileRef.trim()) {
                                        await handleReconcile(reconcileTarget, reconcileRef.trim());
                                        setReconcileTarget(null);
                                        setReconcileRef("");
                                    }
                                }}
                                className="flex-1 px-3 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors font-medium"
                            >
                                Lier
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
