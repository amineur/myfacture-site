"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Users, User, Settings as SettingsIcon, LogOut, ChevronRight, List, Building2, Search, Activity, FileDown, Banknote, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanies } from "@/components/providers/companies-provider";
import { CommandMenu } from "@/components/ui/command-menu";

export default function SettingsPage() {
    const { companies } = useCompanies();
    const [openSearch, setOpenSearch] = useState(false);
    const companyLabel = companies.length > 1 ? "Mes sociétés" : "Ma société";

    const [qontoStatus, setQontoStatus] = useState<{ connected: boolean } | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);

    // Check Qonto connection status on mount and when companies change
    useEffect(() => {
        const checkQonto = async () => {
            if (companies.length === 0) return; // Wait for companies to load

            const { checkQontoConnectionAction } = await import("@/app/actions/qonto-actions");
            const status = await checkQontoConnectionAction(companies[0]?.id);
            setQontoStatus(status);

            // Fetch Connected Accounts
            const res = await fetch(`/api/bank-accounts?companyId=${companies[0]?.id}`);
            if (res.ok) {
                const data = await res.json();
                setAccounts(data);
            }
        };
        checkQonto();
    }, [companies]); // Re-check when companies change

    const menuItems = [
        {
            title: "Gestion",
            items: [
                { icon: Building2, label: companyLabel, href: "/companies", description: "Gérer vos entités légales" },
                { icon: Activity, label: "Suivi des situations", href: "/situations", description: "Évolution mensuelle des dettes" },
                { icon: Banknote, label: "Dettes", href: "/dettes", description: "Gestion des échéanciers de dette" },
                { icon: Users, label: "Fournisseurs", href: "/suppliers", description: "Gérer vos fournisseurs et statuts" },
                { icon: Users, label: "Membres & Équipe", href: "/team", description: "Gérer les accès et rôles" },
                { icon: List, label: "Transaction Banque", href: "/transactions", description: "Historique bancaire complet" },
                { icon: FileDown, label: "Imports", href: "/imports", description: "Historique des imports automatiques" },
            ]
        },
        {
            title: "Intégrations",
            items: [
                {
                    icon: Building2,
                    label: "Qonto",
                    href: "/api/qonto/init", // Direct link to init flow
                    description: qontoStatus?.connected ? "Compte principal connecté" : "Connexion requise",
                    highlight: !qontoStatus?.connected
                },
                {
                    icon: Radio,
                    label: "Importations IndésCorporate",
                    href: "/indes-sync",
                    description: "Synchroniser les factures Les Indés → Dashboard",
                    highlight: false
                },
                // Display other connected accounts if any
                ...(accounts.length > 0 ? accounts.filter(a => a.bank_type !== 'QONTO').map(acc => ({
                    icon: Building2,
                    label: acc.name,
                    href: "#",
                    description: `Solde : ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(acc.balance)}`,
                    highlight: false
                })) : [])
            ]
        },
        {
            title: "Mon Compte",
            items: [
                { icon: User, label: "Profil", href: "/profile", description: "Informations personnelles" },
                { icon: SettingsIcon, label: "Préférences", href: "#", description: "Notifications et affichage" },
            ]
        },
    ];

    return (
        <main className="p-6 max-w-md mx-auto space-y-8 pb-32">
            <header className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
                <button
                    onClick={() => setOpenSearch(true)}
                    className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                    <Search className="h-5 w-5" />
                </button>
            </header>

            <CommandMenu open={openSearch} setOpen={setOpenSearch} />

            <div className="space-y-8">
                {menuItems.map((section, idx) => (
                    <section key={idx} className="space-y-4">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider px-1">{section.title}</h2>
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
                            {section.items.map((item: any, itemIdx) => {
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={itemIdx}
                                        href={item.href}
                                        className={cn(
                                            "flex items-center justify-between p-4 hover:bg-gray-50 transition-colors group",
                                            item.highlight && "bg-blue-50/50"
                                        )}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", item.highlight ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600")}>
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900 text-sm">{item.label}</p>
                                                <p className="text-xs text-gray-500">{item.description}</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                ))}

                <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full p-4 flex items-center justify-center gap-2 text-red-600 font-bold bg-red-50 rounded-2xl hover:bg-red-100 transition-colors"
                >
                    <LogOut className="h-5 w-5" />
                    <span>Déconnexion</span>
                </button>
            </div>
        </main>
    );
}
