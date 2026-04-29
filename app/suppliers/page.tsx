"use client";

import { useState, useEffect, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { useCompanies } from "@/components/providers/companies-provider";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { SupplierFilters, SupplierSortOption } from "@/components/suppliers/supplier-filters";
import { PriceDisplay } from "@/components/ui/price-display";
import { cn } from "@/lib/utils";

export default function SuppliersPage() {
    const router = useRouter();
    const { companies } = useCompanies();
    const activeCompany = companies[0];
    const { suppliers, isLoading: isSuppliersLoading } = useSuppliers(activeCompany?.id);

    const [searchQuery, setSearchQuery] = useState("");
    const [sortOption, setSortOption] = useState<SupplierSortOption>("spend_desc");
    const [alertMessage, setAlertMessage] = useState<string | null>(null);

    useEffect(() => {
        if (alertMessage) {
            const timer = setTimeout(() => setAlertMessage(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [alertMessage]);

    // 1. Hydration Safety (Flicker-free)
    const [isMounted, setIsMounted] = useState(() => typeof window !== "undefined" && (window as any).__HYDRATED);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        (window as any).__HYDRATED = true;
        const savedSort = localStorage.getItem("suppliers_sort");
        if (savedSort) setSortOption(savedSort as SupplierSortOption);
        const savedSearch = localStorage.getItem("suppliers_search");
        if (savedSearch) setSearchQuery(savedSearch);
        setIsInitialized(true);
    }, []);

    useEffect(() => {
        if (isInitialized) {
            localStorage.setItem("suppliers_sort", sortOption);
            localStorage.setItem("suppliers_search", searchQuery);
        }
    }, [sortOption, searchQuery, isInitialized]);

    const isLoading = !isMounted || isSuppliersLoading;

    // SCROLL RESTORATION HOOK
    const { saveScrollPosition } = useScrollRestoration("suppliers_scroll", isLoading, suppliers);

    const getCategoryColor = (category: string) => {
        const colors: Record<string, string> = {
            'Diffusion': 'bg-purple-100 text-purple-700',
            'Antenne': 'bg-blue-100 text-blue-700',
            'Charges fiscales': 'bg-red-100 text-red-700',
            'Digital': 'bg-emerald-100 text-emerald-700',
            'Régie': 'bg-pink-100 text-pink-700',
            'Production': 'bg-purple-100 text-purple-700',
            'Marketing': 'bg-pink-100 text-pink-700',
            'Technique': 'bg-emerald-100 text-emerald-700',
            'Administratif': 'bg-orange-100 text-orange-700',
            'Autre': 'bg-gray-100 text-gray-700',
        };
        return colors[category] || 'bg-gray-100 text-gray-700';
    };

    // Filter Logic
    const filteredSuppliers = suppliers.filter(s =>
        (s.supplier_name || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort Logic
    const sortedSuppliers = [...filteredSuppliers].sort((a, b) => {
        switch (sortOption) {
            case "spend_desc":
                return (b.total_spend || 0) - (a.total_spend || 0);
            case "spend_asc":
                return (a.total_spend || 0) - (b.total_spend || 0);
            case "delay_desc":
                return (b.average_delay || 0) - (a.average_delay || 0);
            case "delay_asc":
                return (a.average_delay || 0) - (b.average_delay || 0);
            case "count_desc":
                return (b.invoices_count || 0) - (a.invoices_count || 0);
            case "unpaid_desc":
                return (b.total_unpaid || 0) - (a.total_unpaid || 0);
            case "unpaid_asc":
                return (a.total_unpaid || 0) - (b.total_unpaid || 0);
            default:
                return (b.total_spend || 0) - (a.total_spend || 0);
        }
    });

    const formatMoney = (amount: number) => {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
    };

    // Calculate Target Year for Display
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const targetYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    return (
        <main className={cn(
            "p-6 max-w-md mx-auto space-y-6 pb-32 transition-opacity duration-300",
            isMounted ? "opacity-100" : "opacity-0"
        )}>
            {/* Header */}
            <header className="space-y-4">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold tracking-tight text-gray-900">Liste des fournisseurs</h1>
                </div>
            </header>

            {/* Search & Filters */}
            <section className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Rechercher un fournisseur..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 h-10 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                </div>
                <SupplierFilters currentSort={sortOption} onSortChange={setSortOption} />
            </section>

            {/* Suppliers List */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                    {isLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="p-5 flex items-center gap-4 h-[94px]">
                                <div className="h-14 w-14 rounded-xl bg-gray-50 animate-pulse shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-32 bg-gray-100 animate-pulse rounded" />
                                    <div className="h-3 w-20 bg-gray-50 animate-pulse rounded" />
                                </div>
                                <div className="text-right space-y-1">
                                    <div className="h-4 w-16 bg-gray-100 animate-pulse rounded ml-auto" />
                                    <div className="h-3 w-12 bg-gray-50 animate-pulse rounded ml-auto" />
                                </div>
                            </div>
                        ))
                    ) : (
                        sortedSuppliers.map((supplier) => (
                            <div
                                key={supplier.supplier_id}
                                onClick={() => {
                                    saveScrollPosition();
                                    router.push(`/suppliers/${supplier.supplier_id}`);
                                }}
                                className="p-5 flex items-center gap-4 hover:bg-gray-50 transition-colors cursor-pointer group"
                            >
                                {/* Logo */}
                                {/* Logo with Notification Badge */}
                                <div className="relative shrink-0">
                                    <div className="h-14 w-14 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-sm font-bold text-gray-400 uppercase overflow-hidden">
                                        {supplier.logo_url ? (
                                            <img
                                                src={supplier.logo_url}
                                                alt={supplier.supplier_name}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <span>{supplier.supplier_name?.substring(0, 2)}</span>
                                        )}
                                    </div>
                                    {(supplier.current_max_delay > 90) && (
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setAlertMessage("Ce fournisseur a au moins une facture en attente dont la date d'échéance date de plus de 3 mois (90 jours).");
                                            }}
                                            className="absolute -top-1 -right-1 bg-white rounded-full p-[2px] shadow-sm ring-1 ring-gray-100 z-10 cursor-help"
                                        >
                                            <AlertCircle className="h-4 w-4 text-red-500 fill-white" />
                                        </div>
                                    )}
                                </div>

                                {/* Supplier Info - takes remaining space */}
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <p className="font-bold text-sm text-gray-900 truncate">{supplier.supplier_name}</p>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold w-fit",
                                            getCategoryColor(supplier.supplier_category)
                                        )}>
                                            {supplier.supplier_category}
                                        </span>

                                    </div>
                                </div>

                                {/* Amount - fixed width for alignment */}
                                <div className="text-right w-[100px] shrink-0">
                                    <PriceDisplay amount={supplier.total_spend || 0} size="sm" />
                                    <div className="flex items-center justify-end gap-1 mt-0.5">
                                        <PriceDisplay amount={supplier.total_unpaid || 0} size="xs" className="text-gray-500" mutedColor="text-gray-400/60" />
                                    </div>
                                </div>

                                {/* Chevron */}
                                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                            </div>
                        ))
                    )}

                    {!isLoading && sortedSuppliers.length === 0 && (
                        <div className="p-8 text-center text-gray-500 text-sm">
                            Aucun fournisseur trouvé.
                        </div>
                    )}
                </div>
            </section>


            {/* Custom Toast Notification */}
            {
                alertMessage && (
                    <div
                        onClick={() => setAlertMessage(null)}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-gray-900/90 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl z-50 flex items-start gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300 cursor-pointer ring-1 ring-white/10"
                    >
                        <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm font-medium leading-normal">{alertMessage}</p>
                    </div>
                )
            }
        </main >
    );
}
