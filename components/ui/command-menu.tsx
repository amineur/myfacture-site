"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Search, ChevronRight, Home, CreditCard, Banknote, List, Users, Briefcase, Settings, ArrowRightLeft, FileText, Building2, Calendar, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanies } from "@/components/providers/companies-provider";

interface CommandMenuProps {
    open: boolean;
    setOpen: (open: boolean) => void;
}

interface NavItem {
    label: string;
    href: string;
    icon: any;
    keywords: string[];
}

interface SearchResult {
    type: 'nav' | 'invoice' | 'supplier' | 'debt' | 'situation';
    label: string;
    href: string;
    icon: any;
    subtitle?: string;
}

const NAV_ITEMS: NavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: Home, keywords: ["accueil", "home", "stats"] },
    { label: "Suivi Règlements", href: "/payments", icon: CreditCard, keywords: ["paiement", "facture", "payer", "virement", "liste", "historique"] },
    { label: "Dettes", href: "/dettes", icon: Banknote, keywords: ["dette", "urssaf", "tva", "impot", "social", "fiscal", "liste", "échéancier"] },
    { label: "Fournisseurs", href: "/suppliers", icon: List, keywords: ["fournisseur", "prestataire", "achat", "liste", "annuaire"] },
    { label: "Transactions", href: "/transactions", icon: ArrowRightLeft, keywords: ["banque", "mouvement", "relevé", "ligne", "liste", "flux"] },
    { label: "Imports", href: "/imports", icon: FileDown, keywords: ["import", "automatique", "historique", "facture", "log"] },
    { label: "Entreprises", href: "/companies", icon: Briefcase, keywords: ["société", "boite", "entité"] },
    { label: "Equipe", href: "/team", icon: Users, keywords: ["membre", "user", "utilisateur", "accès"] },
    { label: "Paramètres", href: "/settings", icon: Settings, keywords: ["config", "compte", "profile", "déconnexion"] },
];

const STOP_WORDS = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'a', 'au', 'aux', 'pour', 'sur', 'dans']);

export function CommandMenu({ open, setOpen }: CommandMenuProps) {
    const router = useRouter();
    const { companies } = useCompanies();
    const activeCompany = companies[0];
    const [search, setSearch] = useState("");
    const [invoices, setInvoices] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [debts, setDebts] = useState<any[]>([]);
    const [isDataLoaded, setIsDataLoaded] = useState(false);

    const fetchData = async () => {
        if (!activeCompany?.id || isDataLoaded) return;

        try {
            const res = await fetch(`/api/search-data?companyId=${activeCompany.id}`);
            if (res.ok) {
                const data = await res.json();
                setInvoices(data.invoices || []);
                setSuppliers(data.suppliers || []);
                setDebts(data.debts || []);
                setIsDataLoaded(true);
            }
        } catch (error) {
            console.error('Error fetching search data:', error);
        }
    };

    // Fetch data only once when menu opens
    useEffect(() => {
        if (open && activeCompany?.id && !isDataLoaded) {
            setSearch("");
            fetchData();
        }
    }, [open, activeCompany?.id]);

    const filteredResults = useMemo((): SearchResult[] => {
        const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const rawTerms = normalize(search).split(/\s+/).filter(t => t.length > 0);

        // Filter out stop words for matching, but keep at least one term if only stop words were provided
        const significantTerms = rawTerms.filter(t => !STOP_WORDS.has(t));
        const searchTerms = significantTerms.length > 0 ? significantTerms : rawTerms;

        // If no search, show only nav items
        if (!search || searchTerms.length === 0) {
            return NAV_ITEMS.map(item => ({
                type: 'nav' as const,
                label: item.label,
                href: item.href,
                icon: item.icon
            }));
        }

        const results: SearchResult[] = [];

        // Search nav items
        NAV_ITEMS.forEach(item => {
            const labelNorm = normalize(item.label);
            const keywordsNorm = item.keywords.map(k => normalize(k));

            const matchesAll = searchTerms.every(term =>
                labelNorm.includes(term) || keywordsNorm.some(k => k.includes(term))
            );

            if (matchesAll) {
                results.push({
                    type: 'nav',
                    label: item.label,
                    href: item.href,
                    icon: item.icon
                });
            }
        });

        // Search invoices
        invoices.forEach(invoice => {
            // Supplier can be an object or an array depending on DB config
            const supplierData = Array.isArray(invoice.supplier) ? invoice.supplier[0] : invoice.supplier;
            const supplierName = supplierData?.name || '';

            const refNorm = normalize(invoice.reference || '');
            const supplierNorm = normalize(supplierName);
            const invoiceKeyword = normalize('Facture');

            // Extract month and year if date exists
            let dateKeywords = '';
            if (invoice.issued_date) {
                const date = new Date(invoice.issued_date);
                const month = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(date);
                const year = date.getFullYear().toString();
                dateKeywords = `${normalize(month)} ${year}`;
            }

            const searchableText = `${refNorm} ${supplierNorm} ${invoiceKeyword} ${dateKeywords}`;
            const matchesAll = searchTerms.every(term => searchableText.includes(term));

            if (matchesAll) {
                results.push({
                    type: 'invoice',
                    label: `Facture ${invoice.reference}`,
                    subtitle: `${supplierName} • ${invoice.amount_ttc.toLocaleString('fr-FR')}€`,
                    href: `/payments/${invoice.id}`,
                    icon: FileText
                });
            }
        });



        // Search suppliers
        suppliers.forEach(supplier => {
            const nameNorm = normalize(supplier.name || '');
            const categoryNorm = normalize(supplier.category || '');
            const supplierKeyword = normalize('Fournisseur');

            const matchesAll = searchTerms.every(term =>
                nameNorm.includes(term) || categoryNorm.includes(term) || supplierKeyword.includes(term)
            );

            if (matchesAll) {
                results.push({
                    type: 'supplier',
                    label: supplier.name,
                    subtitle: supplier.category,
                    href: `/suppliers/${supplier.id}`,
                    icon: Building2
                });
            }
        });

        // Search debts/payment schedules
        debts.forEach(debt => {
            const supplierData = Array.isArray(debt.supplier) ? debt.supplier[0] : debt.supplier;
            const supplierName = supplierData?.name || '';

            const refNorm = normalize(debt.contract_ref || '');
            const supplierNorm = normalize(supplierName);
            const debtKeyword = normalize('Dette');

            const searchableText = `${refNorm} ${supplierNorm} ${debtKeyword}`;
            const matchesAll = searchTerms.every(term => searchableText.includes(term));

            if (matchesAll) {
                const isPaid = debt.status === 'PAID';
                results.push({
                    type: 'debt',
                    label: supplierName || 'Sans nom',
                    subtitle: isPaid
                        ? 'Dette • Soldée'
                        : `Dette • Reste: ${debt.remaining_amount?.toLocaleString('fr-FR')}€`,
                    href: `/dettes/${debt.id}`,
                    icon: Banknote
                });
            }
        });

        // Search situations (Last 24 months)
        const situMonths = Array.from({ length: 24 }, (_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            // "décembre 2025"
            const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d);
            return {
                label: `Situation ${monthName}`,
                monthName: monthName,
                href: `/payments/month/${encodeURIComponent(monthName)}`
            };
        });

        situMonths.forEach(situ => {
            const labelNorm = normalize(situ.label);
            const monthNorm = normalize(situ.monthName);
            // Allow searching by "situation", "decembre", "2025", "situation decembre"

            const matchesAll = searchTerms.every(term =>
                labelNorm.includes(term) || monthNorm.includes(term)
            );

            if (matchesAll) {
                results.push({
                    type: 'situation',
                    label: situ.label.charAt(0).toUpperCase() + situ.label.slice(1),
                    subtitle: "Rapport Mensuel",
                    href: situ.href,
                    icon: Calendar
                });
            }
        });


        return results;
    }, [search, invoices, suppliers, debts]);

    const handleSelect = (href: string) => {
        router.push(href);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="fixed inset-0 md:inset-auto md:top-[12vh] md:left-1/2 md:-translate-x-1/2 md:max-w-md translate-y-0 p-0 overflow-hidden bg-white gap-0 border-0 shadow-2xl md:rounded-2xl ring-1 ring-black/5 flex flex-col">
                <DialogHeader className="p-4 py-3 md:sr-only border-b border-gray-50 flex flex-row items-center pr-12">
                    <DialogTitle className="text-lg font-semibold tracking-tight">Recherche</DialogTitle>
                </DialogHeader>

                <div className="flex items-center border-b border-gray-50 px-4 py-3">
                    <Search className="h-5 w-5 text-gray-400 shrink-0" />
                    <input
                        className="flex-1 border-none bg-transparent px-3 py-1 text-base outline-none placeholder:text-gray-400"
                        placeholder="Rechercher une page, facture, fournisseur..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 max-h-[calc(100dvh-120px)] md:max-h-[60vh] p-2">
                    {filteredResults.length === 0 ? (
                        <p className="p-4 text-center text-sm text-gray-400">Aucun résultat.</p>
                    ) : (
                        <div className="space-y-1">
                            {filteredResults.map((item, index) => (
                                <button
                                    key={`${item.type}-${item.href}-${index}`}
                                    onClick={() => handleSelect(item.href)}
                                    className="w-full flex items-center justify-between rounded-xl px-3 py-3 text-sm transition-colors hover:bg-gray-50 active:bg-blue-50/50 group"
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className={cn(
                                            "flex h-9 w-9 items-center justify-center rounded-lg shrink-0 transition-colors",
                                            item.type === 'nav' ? "bg-gray-50/80 text-gray-500 group-hover:text-blue-600 group-hover:bg-blue-50" :
                                                item.type === 'invoice' ? "bg-orange-50 text-orange-600" :
                                                    item.type === 'debt' ? "bg-purple-50 text-purple-600" :
                                                        item.type === 'situation' ? "bg-indigo-50 text-indigo-600" :
                                                            "bg-blue-50 text-blue-600"
                                        )}>
                                            <item.icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex flex-col items-start min-w-0 flex-1">
                                            <span className="font-medium text-gray-700 group-hover:text-gray-900 text-sm truncate w-full text-left">
                                                {item.label}
                                            </span>
                                            {item.subtitle && (
                                                <span className="text-xs text-gray-400 truncate w-full text-left">{item.subtitle}</span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
