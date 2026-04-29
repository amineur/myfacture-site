"use client";

import { use, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Mail, AlertCircle, Wallet, History, CheckCircle2, XCircle, Search, Download, Clock, TrendingUp, Loader2, Upload, Camera, Phone, Eye, Unlink, Link as LinkIcon, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DebtDetailView } from "@/components/debt-detail-view";
import { PriceDisplay } from "@/components/ui/price-display";
import { format, parseISO, differenceInDays, subMonths } from "date-fns";
import { fr } from "date-fns/locale";

// Data Types
type YearStats = {
    purchases: number;
    paid: number;
};

type SupplierDetails = {
    id: string;
    name: string;
    category: string;
    logo: string;
    logo_url: string | null;
    overdueCount: number;
    overdueAmount: number;
    overdueDays: number; // avg days late
    pendingCount: number;
    pendingAmount: number;
    pendingDaysLeft: number; // avg days until due
    averageDelay: number;
    email: string;
    iban: string | null;
    // bic: string | null; // Removed
    phone: string | null;
    contactName: string | null;
    relationshipStartYear: number;
    stats: Record<number, YearStats>;
};

type InvoiceItem = {
    id: string;
    dbId: string; // UUID for linking to detail page
    amount: number;
    date: string; // Formatted date
    rawDate: string; // ISO date for sorting
    paymentDate: string | null;
    status: "paid" | "unpaid";
    pdfUrl: string | null;
    bank_transactions: Array<{
        date: string;
        amount: number;
    }>;
};

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const searchParams = useSearchParams();
    const [supplier, setSupplier] = useState<SupplierDetails | null>(null);
    const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
    const [debtId, setDebtId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // States — read initial tab from URL query param
    const initialTab = (searchParams.get("tab") as "overview" | "history" | "debt") || "overview";
    const [activeTab, setActiveTabState] = useState<"overview" | "history" | "debt">(initialTab);

    // Wrapper to update both state and URL
    const setActiveTab = (tab: "overview" | "history" | "debt") => {
        setActiveTabState(tab);
        const url = tab === "overview" ? `/suppliers/${id}` : `/suppliers/${id}?tab=${tab}`;
        router.replace(url, { scroll: false });
    };
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);

            const res = await fetch(`/api/suppliers/${id}`);
            if (!res.ok) {
                console.error("Error fetching supplier");
                setIsLoading(false);
                return;
            }
            const { supplier: supplierData, invoices: invoicesData, debtId: fetchedDebtId } = await res.json();

            if (!supplierData) {
                setIsLoading(false);
                return;
            }

            setDebtId(fetchedDebtId || null);

            // --- PROCESSING DATA ---

            const allInvoices = invoicesData || [];

            // Calc KPI: Séparer impayés en retard vs facturés non réglés
            const todayDate = new Date();
            const todayStr = todayDate.toISOString().split('T')[0]; // "YYYY-MM-DD"
            const allUnpaid = allInvoices.filter((i: any) =>
                i.status !== 'PAID' && i.status !== 'CANCELLED'
            );
            // En retard : échéance strictement passée (due_date < aujourd'hui)
            const overdueInvoices = allUnpaid.filter((i: any) => i.due_date && i.due_date < todayStr);
            const overdueCount = overdueInvoices.length;
            const overdueAmount = overdueInvoices.reduce((acc: number, curr: any) => acc + Number(curr.amount_ttc || 0), 0);
            const overdueDays = overdueCount > 0
                ? Math.round(overdueInvoices.reduce((acc: number, curr: any) => acc + differenceInDays(todayDate, parseISO(curr.due_date)), 0) / overdueCount)
                : 0;
            // Non échues : pas de due_date OU échéance >= aujourd'hui
            const pendingInvoices = allUnpaid.filter((i: any) => !i.due_date || i.due_date >= todayStr);
            const pendingCount = pendingInvoices.length;
            const pendingAmount = pendingInvoices.reduce((acc: number, curr: any) => acc + Number(curr.amount_ttc || 0), 0);
            const pendingDaysLeft = pendingCount > 0
                ? Math.round(pendingInvoices.filter((i: any) => i.due_date).reduce((acc: number, curr: any) => acc + differenceInDays(parseISO(curr.due_date), todayDate), 0) / pendingCount)
                : 0;

            // Calc KPI: Délai moyen de règlement vs échéance (3 derniers mois)
            // = moyenne de (payment_date - due_date) pour les factures payées récemment
            // Positif = payé en retard, négatif = payé en avance
            const threeMonthsAgo = subMonths(todayDate, 3);
            let totalDays = 0;
            let countPaid = 0;

            allInvoices.forEach((inv: any) => {
                if (inv.status === 'PAID' && inv.payment_date && inv.due_date) {
                    const paymentDate = parseISO(inv.payment_date);
                    const dueDate = parseISO(inv.due_date);

                    // Only count invoices paid in the last 3 months
                    if (paymentDate >= threeMonthsAgo) {
                        const diff = differenceInDays(paymentDate, dueDate);
                        totalDays += diff;
                        countPaid++;
                    }
                }
            });

            const averageDelay = countPaid > 0 ? Math.round(totalDays / countPaid) : 0;

            // Calc KPI: Stats by Year
            const stats: Record<number, YearStats> = {};

            allInvoices.forEach((inv: any) => {
                const date = parseISO(inv.issued_date);
                const year = date.getFullYear();

                if (!stats[year]) {
                    stats[year] = { purchases: 0, paid: 0 };
                }

                stats[year].purchases += Number(inv.amount_ttc || 0);
                if (inv.status === 'PAID') {
                    stats[year].paid += Number(inv.amount_ttc || 0);
                }
            });

            // Fallback for current year if empty
            const currentYear = new Date().getFullYear();
            if (!stats[currentYear]) stats[currentYear] = { purchases: 0, paid: 0 };

            // Start Year: use metadata override, fallback to oldest invoice or created_at
            const metadataStartYear = supplierData.metadata?.relationship_start_year;
            const startYear = metadataStartYear
                ? Number(metadataStartYear)
                : allInvoices.length > 0
                    ? new Date(Math.min(...allInvoices.map((i: any) => new Date(i.issued_date).getTime()))).getFullYear()
                    : new Date(supplierData.created_at).getFullYear();

            setSupplier({
                id: supplierData.id,
                name: supplierData.name || "Inconnu",
                category: supplierData.category || "Autre",
                logo: (supplierData.name || "?").substring(0, 2).toUpperCase(),
                logo_url: supplierData.logo_url || null,
                overdueCount,
                overdueAmount,
                overdueDays,
                pendingCount,
                pendingAmount,
                pendingDaysLeft,
                averageDelay,
                email: supplierData.email || "Non renseigné",
                iban: supplierData.iban || null,
                // bic: supplierData.bic || null,
                phone: supplierData.phone || null,
                contactName: supplierData.contact_name || null,
                relationshipStartYear: startYear,
                stats
            });

            // Process Invoices for List
            setInvoices(allInvoices.map((inv: any) => ({
                id: (inv.reference || inv.id.substring(0, 8)).replace(/^0+/, ''),
                dbId: inv.id,
                amount: Number(inv.amount_ttc),
                date: format(parseISO(inv.issued_date), 'dd MMMM yyyy', { locale: fr }),
                rawDate: inv.issued_date,
                // Use the latest bank transaction date as the payment date
                paymentDate: inv.status === 'PAID' && inv.bank_transactions?.length > 0
                    ? format(parseISO(inv.bank_transactions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date), 'dd MMM yyyy', { locale: fr })
                    : (inv.payment_date ? format(parseISO(inv.payment_date), 'dd MMM yyyy', { locale: fr }) : null),
                status: inv.status === 'PAID' ? 'paid' : 'unpaid',
                pdfUrl: inv.pdf_url,
                bank_transactions: inv.bank_transactions || []
            })));

            setIsLoading(false);
            // Update selected year to one with data if possible
            if (stats[currentYear].purchases === 0) {
                const years = Object.keys(stats).map(Number).sort((a, b) => b - a);
                if (years.length > 0) setSelectedYear(years[0]);
            } else {
                setSelectedYear(currentYear);
            }
        };

        fetchData();
    }, [id]);

    // Handle Logo Upload
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !supplier) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('Veuillez sélectionner une image');
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert('L\'image ne doit pas dépasser 2MB');
            return;
        }

        setIsUploadingLogo(true);

        try {
            // Convert to base64
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64String = reader.result as string;

                // Update supplier in database
                const updateRes = await fetch(`/api/suppliers/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ logo_url: base64String }),
                });
                const error = updateRes.ok ? null : new Error('Update failed');

                if (error) {
                    console.error('Error updating logo:', error);
                    alert('Erreur lors de la mise à jour du logo');
                    setIsUploadingLogo(false);
                    return;
                }

                // Update local state
                setSupplier({
                    ...supplier,
                    logo_url: base64String
                });

                setIsUploadingLogo(false);
            };

            reader.onerror = () => {
                alert('Erreur lors de la lecture du fichier');
                setIsUploadingLogo(false);
            };

            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Error uploading logo:', error);
            alert('Erreur lors du téléchargement');
            setIsUploadingLogo(false);
        }
    };



    // Unlink bank transaction from invoice
    const handleUnlink = async (invoiceDbId: string) => {
        if (!confirm('Annuler le rapprochement bancaire pour cette facture ?')) return;
        try {
            const res = await fetch('/api/transactions/reconcile', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceId: invoiceDbId }),
            });
            const data = await res.json();
            if (data.success) {
                // Update local state
                setInvoices(prev => prev.map(inv =>
                    inv.dbId === invoiceDbId
                        ? { ...inv, status: 'unpaid' as const, paymentDate: null, bank_transactions: [] }
                        : inv
                ));
            } else {
                alert('Erreur: ' + (data.error || 'Échec'));
            }
        } catch (e) {
            alert('Erreur réseau');
        }
    };

    // Loading State handled in render
    // if (isLoading || !supplier) { ... } <- Removed blocking return

    const currentYear = new Date().getFullYear();
    const relationshipYears = supplier ? (currentYear - supplier.relationshipStartYear) : 0;

    const filteredInvoices = invoices
        .filter(inv =>
            inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            inv.date.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());

    // Get stats for selected year, fallback
    const currentStats = (supplier && supplier.stats[selectedYear]) ? supplier.stats[selectedYear] : { purchases: 0, paid: 0 };
    const availableYears = supplier ? Object.keys(supplier.stats).map(Number).sort((a, b) => b - a) : [];
    if (availableYears.length === 0) availableYears.push(currentYear);

    return (
        <>
        <main className="min-h-screen bg-gray-50 flex flex-col pb-10 animate-in slide-in-from-right duration-500 ease-out">
            {/* Header - Always Rendered */}
            <header className="px-6 pt-6 pb-2 bg-gray-50 sticky top-0 z-10 transition-colors">
                <div className="flex items-center justify-between mb-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="-ml-2 h-10 w-10 rounded-full bg-white shadow-sm border border-gray-100 hover:bg-gray-100 transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5 text-gray-900" />
                    </Button>
                    <h1 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Fiche Fournisseur</h1>
                    <div className="w-10"></div>
                </div>

                {isLoading || !supplier ? (
                    // SKELETON HEADER CONTENT
                    <div className="animate-pulse space-y-6 mb-6">
                        <div className="flex flex-col items-center space-y-4">
                            <div className="h-24 w-24 rounded-3xl bg-gray-200" />
                            <div className="space-y-2 flex flex-col items-center">
                                <div className="h-8 w-40 bg-gray-200 rounded" />
                                <div className="h-5 w-24 bg-gray-100 rounded-full" />
                            </div>
                        </div>
                        <div className="flex p-1 bg-gray-200/50 rounded-xl mb-2 h-10 w-full" />
                    </div>
                ) : (
                    <>
                        {/* Hero Identity */}
                        {/* Hero Identity */}
                        <div className="flex flex-row items-center text-left gap-4 mb-6 animate-in fade-in zoom-in-95 duration-300">
                            <div
                                className="h-20 w-20 rounded-3xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-3xl font-bold text-gray-300 relative group cursor-pointer shrink-0"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {supplier.logo_url ? (
                                    <img
                                        src={supplier.logo_url}
                                        alt={supplier.name}
                                        className="w-full h-full object-cover rounded-3xl"
                                    />
                                ) : (
                                    <span>{supplier.logo}</span>
                                )}

                                {/* Upload Overlay */}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-3xl">
                                    {isUploadingLogo ? (
                                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                                    ) : (
                                        <Camera className="h-6 w-6 text-white" />
                                    )}
                                </div>

                                {(supplier.overdueCount + supplier.pendingCount) > 0 && (
                                    <div className={cn("absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center z-10 shadow-lg", supplier.overdueCount > 0 ? "bg-red-500" : "bg-orange-400")}>
                                        <span className="text-[10px] font-bold text-white">{supplier.overdueCount + supplier.pendingCount}</span>
                                    </div>
                                )}
                            </div>

                            {/* Hidden File Input */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleLogoUpload}
                            />
                            <div className="flex flex-col items-start gap-1">
                                <h2 className="text-2xl font-bold text-gray-900 leading-tight">{supplier.name}</h2>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 tracking-wide uppercase">
                                    {supplier.category}
                                </span>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex p-1 bg-gray-200/50 rounded-xl mb-2">
                            <button
                                onClick={() => setActiveTab("overview")}
                                className={cn(
                                    "flex-1 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                                    activeTab === "overview" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                Vue d'ensemble
                            </button>
                            <button
                                onClick={() => setActiveTab("history")}
                                className={cn(
                                    "flex-1 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                                    activeTab === "history" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                Historique
                            </button>
                            {debtId && (
                                <button
                                    onClick={() => setActiveTab("debt")}
                                    className={cn(
                                        "flex-1 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                                        activeTab === "debt" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                    )}
                                >
                                    Détails dette
                                </button>
                            )}
                        </div>
                    </>
                )}
            </header>

            <div className={cn(
                "flex-1 px-6 space-y-6 overflow-y-auto pt-2 transition-opacity duration-300",
                (isLoading || !supplier) ? "opacity-50 pointer-events-none" : "opacity-100"
            )}>
                {(isLoading || !supplier) ? (
                    // SKELETON BODY
                    <div className="animate-pulse space-y-6">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-gray-200 h-32" />
                            <div className="rounded-2xl bg-gray-200 h-32" />
                        </div>
                        <div className="rounded-3xl bg-gray-200 h-40" />
                        <div className="rounded-3xl bg-gray-200 h-32" />
                    </div>
                ) : (
                    <>
                        {/* TAB: OVERVIEW */}
                        {activeTab === "overview" && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Situation (Unpaid) */}
                                    <div className={cn(
                                        "rounded-2xl p-4 border flex flex-col justify-between shadow-sm min-h-[120px]",
                                        supplier.overdueAmount > 0 ? "bg-red-50 border-red-100" : supplier.pendingAmount > 0 ? "bg-orange-50 border-orange-100" : "bg-emerald-50 border-emerald-100"
                                    )}>
                                        <div className="flex items-start justify-between">
                                            <span className={cn("text-xs font-bold uppercase tracking-wider", supplier.overdueAmount > 0 ? "text-red-400" : supplier.pendingAmount > 0 ? "text-orange-400" : "text-emerald-500")}>
                                                {supplier.overdueAmount > 0 ? "Situation" : supplier.pendingAmount > 0 ? "Situation" : "Situation"}
                                            </span>
                                            <AlertCircle className={cn("h-4 w-4", supplier.overdueAmount > 0 ? "text-red-400" : supplier.pendingAmount > 0 ? "text-orange-400" : "text-emerald-400")} />
                                        </div>
                                        <div className="space-y-2 mt-2">
                                            {supplier.overdueAmount > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-2 w-2 rounded-full bg-red-500" />
                                                        <span className="text-xs text-red-600 font-medium">
                                                            {supplier.overdueCount} en retard
                                                            <span className="text-red-400 ml-1">({supplier.overdueDays}j)</span>
                                                        </span>
                                                    </div>
                                                    <span className="text-sm font-bold text-red-700">{supplier.overdueAmount.toLocaleString('fr-FR')}€</span>
                                                </div>
                                            )}
                                            {supplier.pendingAmount > 0 && (
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-2 w-2 rounded-full bg-orange-400" />
                                                        <span className="text-xs text-orange-500 font-medium">
                                                            {supplier.pendingCount} non échue{supplier.pendingCount > 1 ? 's' : ''}
                                                            <span className="text-orange-400 ml-1">(J-{supplier.pendingDaysLeft})</span>
                                                        </span>
                                                    </div>
                                                    <span className="text-sm font-bold text-orange-600">{supplier.pendingAmount.toLocaleString('fr-FR')}€</span>
                                                </div>
                                            )}
                                            {supplier.overdueAmount === 0 && supplier.pendingAmount === 0 && (
                                                <p className="text-sm font-bold text-emerald-600">À jour</p>
                                            )}
                                            {(supplier.overdueAmount > 0 || supplier.pendingAmount > 0) && (
                                                <div className="border-t border-gray-200 pt-2 flex items-center justify-between">
                                                    <span className="text-[10px] text-gray-400 font-medium uppercase">Total dû</span>
                                                    <span className="text-lg font-bold text-gray-900">{(supplier.overdueAmount + supplier.pendingAmount).toLocaleString('fr-FR')}€</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Average Delay (Global) */}
                                    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between min-h-[120px]">
                                        <div className="flex items-start justify-between">
                                            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Délai moyen</span>
                                            <Clock className="h-4 w-4 text-gray-300" />
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold tracking-tight text-gray-900">
                                                {supplier.averageDelay > 30
                                                    ? `${Math.floor(supplier.averageDelay / 30)} mois ${supplier.averageDelay % 30 > 0 ? `${supplier.averageDelay % 30}j` : ''}`
                                                    : `${supplier.averageDelay}j`
                                                }
                                            </p>
                                            <p className="text-xs font-medium mt-1 text-gray-400">
                                                vs Échéance
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Annual Performance Card (Filterable) */}
                                <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                            <TrendingUp className="h-4 w-4 text-gray-400" />
                                            Volume d'activité
                                        </h3>
                                        {/* Year Pills */}
                                        <div className="flex bg-gray-100 p-1 rounded-full overflow-x-auto">
                                            {availableYears.map(year => (
                                                <button
                                                    key={year}
                                                    onClick={() => setSelectedYear(year)}
                                                    className={cn(
                                                        "px-3 py-1 rounded-full text-[10px] font-bold transition-all whitespace-nowrap",
                                                        selectedYear === year
                                                            ? "bg-white text-gray-900 shadow-sm"
                                                            : "text-gray-500 hover:text-gray-700"
                                                    )}
                                                >
                                                    {year}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-1">
                                        <div className="space-y-1">
                                            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Achats</p>
                                            <p className="text-xl font-bold text-gray-900">{currentStats.purchases.toLocaleString('fr-FR')}€</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Dont Réglé</p>
                                            <p className="text-xl font-bold text-emerald-700">{currentStats.paid.toLocaleString('fr-FR')}€</p>
                                        </div>
                                    </div>

                                    {/* Visual Progress Bar */}
                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                                            style={{ width: `${currentStats.purchases > 0 ? (currentStats.paid / currentStats.purchases) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Relationship */}
                                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 text-purple-600 bg-purple-50 rounded-full flex items-center justify-center shrink-0">
                                            <History className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 text-sm">Relation de confiance</p>
                                            <p className="text-xs text-gray-500">Depuis {supplier.relationshipStartYear}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-600 leading-relaxed font-medium pl-0 bg-gray-50 p-4 rounded-2xl border border-gray-50">
                                        Cela fait <span className="text-gray-900 font-bold">{relationshipYears} ans</span> que vous travaillez ensemble.
                                    </p>
                                    <div className="border-t border-dashed border-gray-100"></div>

                                    {/* Bank Details */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 text-gray-400 bg-gray-50 rounded-lg flex items-center justify-center">
                                                <Wallet className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900 text-sm">Coordonnées Bancaires</p>
                                                <p className="text-xs text-gray-400 font-mono tracking-wide">
                                                    {supplier.iban ? supplier.iban : "Non renseigné"}
                                                </p>
                                                {/* BIC removed as requested */}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-dashed border-gray-100"></div>

                                    {/* Contact Details */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 text-gray-400 bg-gray-50 rounded-lg flex items-center justify-center">
                                                    <Mail className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900 text-sm">Contact E-mail</p>
                                                    <Link href={`mailto:${supplier.email}`} className="text-xs text-blue-600 hover:underline truncate max-w-[200px] block">
                                                        {supplier.email}
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>

                                        {supplier.phone && (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 text-gray-400 bg-gray-50 rounded-lg flex items-center justify-center">
                                                        <Wallet className="h-4 w-4 rotate-90" /> {/* Phone icon placeholder or import Phone */}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900 text-sm">Téléphone</p>
                                                        <a href={`tel:${supplier.phone}`} className="text-xs text-blue-600 hover:underline font-mono tracking-wide">
                                                            {supplier.phone}
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {supplier.contactName && (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 text-gray-400 bg-gray-50 rounded-lg flex items-center justify-center">
                                                        <span className="text-[10px] font-bold">IT</span>
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900 text-sm">Interlocuteur</p>
                                                        <p className="text-xs text-gray-500">{supplier.contactName}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: HISTORY */}
                        {activeTab === "history" && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {/* Search Bar */}
                                <div className="relative">
                                    <Search className="absolute left-4 top-3 h-4 w-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Recherche (N°, Date...)"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-white border border-gray-100 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 shadow-sm"
                                    />
                                </div>

                                {/* Table / List */}
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-500 uppercase font-bold text-[10px] tracking-wider">
                                                <tr>
                                                    <th className="px-3 py-3 text-center w-8"></th>
                                                    <th className="px-3 py-3">Facture</th>
                                                    <th className="px-3 py-3 text-right">Montant</th>
                                                    <th className="px-3 py-3 text-center w-10">PDF</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {filteredInvoices.map((inv) => (
                                                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors group">
                                                        <td className="px-3 py-3 text-center">
                                                            {inv.status === 'paid' ? (
                                                                <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                                                            ) : (
                                                                <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <Link href={`/payments/${inv.dbId}`} className="font-bold text-gray-900 hover:underline text-sm cursor-pointer">
                                                                {inv.id}
                                                            </Link>
                                                            <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5">{inv.date}</p>
                                                        </td>
                                                        <td className="px-3 py-3 text-right">
                                                            <PriceDisplay amount={inv.amount} size="sm" />
                                                            <div className="flex items-center justify-end gap-1 mt-1">
                                                                {inv.status === 'paid' ? (
                                                                    <>
                                                                        <div className={cn(
                                                                            "flex items-center gap-1 px-1 rounded h-5",
                                                                            inv.bank_transactions?.length > 0 ? "bg-emerald-50 text-emerald-600" : "text-emerald-600 border border-emerald-100"
                                                                        )}>
                                                                            <p className="text-[9px] font-bold whitespace-nowrap">
                                                                                Réglé{inv.bank_transactions?.length > 0
                                                                                    ? ` le ${format(parseISO(inv.bank_transactions[0].date), 'dd/MM/yy', { locale: fr })}`
                                                                                    : inv.paymentDate ? ` le ${inv.paymentDate}` : ''
                                                                                }
                                                                            </p>
                                                                            {inv.bank_transactions?.length > 0 ? (
                                                                                <LinkIcon className="h-2.5 w-2.5 text-emerald-500" />
                                                                            ) : (
                                                                                <Link2 className="h-2.5 w-2.5 text-emerald-400" />
                                                                            )}
                                                                        </div>
                                                                        {inv.bank_transactions?.length > 0 && (
                                                                            <button onClick={() => handleUnlink(inv.dbId)} className="text-red-400 hover:text-red-600 transition-colors ml-0.5" title="Annuler le rapprochement">
                                                                                <Unlink className="h-3 w-3" />
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                ) : (
                                                                    <p className="text-[10px] text-red-400 font-medium mt-0.5 uppercase tracking-tighter">En attente</p>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-center">
                                                            <div className="inline-flex items-center gap-0.5">
                                                            {inv.pdfUrl ? (
                                                                <>
                                                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-900 hover:bg-gray-100 rounded-full" onClick={() => setPreviewPdfUrl(inv.pdfUrl)} title="Prévisualiser">
                                                                        <Eye className="h-4 w-4" />
                                                                    </Button>
                                                                    <a
                                                                        href={inv.pdfUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center justify-center"
                                                                    >
                                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-900 hover:bg-gray-100 rounded-full" title="Télécharger">
                                                                            <Download className="h-4 w-4" />
                                                                        </Button>
                                                                    </a>
                                                                </>
                                                            ) : (
                                                                <Button size="icon" variant="ghost" disabled className="h-8 w-8 text-gray-300 rounded-full opacity-50">
                                                                    <Download className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {filteredInvoices.length === 0 && (
                                        <div className="p-8 text-center text-gray-400 italic">
                                            Aucune facture trouvée.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* TAB: DEBT DETAIL */}
                        {activeTab === "debt" && (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {debtId ? (
                                    <DebtDetailView debtId={debtId} embedded={true} />
                                ) : (
                                    <div className="p-10 text-center text-gray-400 bg-white rounded-2xl border border-gray-100">
                                        Aucune dette active pour ce fournisseur.
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </main>

        {/* PDF Preview - Full screen overlay */}
        {previewPdfUrl && (
            <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={() => setPreviewPdfUrl(null)}>
                <div className="flex items-center justify-between px-4 py-3 bg-black/40 shrink-0">
                    <p className="text-sm font-medium text-white/80">Prévisualisation</p>
                    <div className="flex items-center gap-2">
                        <a href={previewPdfUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10 rounded-full" title="Télécharger">
                                <Download className="h-4 w-4" />
                            </Button>
                        </a>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10 rounded-full" onClick={() => setPreviewPdfUrl(null)}>
                            <XCircle className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
                    <embed src={previewPdfUrl + '#toolbar=0&navpanes=0&scrollbar=0'} type="application/pdf" className="w-full h-full" />
                </div>
            </div>
        )}
        </>
    );
}
