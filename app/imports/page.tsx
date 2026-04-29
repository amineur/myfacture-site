"use client";

import { useState, useEffect, useMemo } from "react";
import { useCompanies } from "@/components/providers/companies-provider";
import { ArrowLeft, FileDown, ChevronDown, ChevronUp, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

type ImportLog = {
    id: string;
    imported_at: string;
    invoice_count: number;
    invoices: Array<{
        supplier_name: string;
        matched_supplier?: string;
        reference: string;
        amount_ttc: number;
    }>;
    source: string;
    status?: string;
    error?: string;
};

export default function ImportsPage() {
    const router = useRouter();
    const { companies } = useCompanies();
    const activeCompany = companies[0];
    const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchImportLogs = async () => {
            if (!activeCompany?.id) return;
            setIsLoading(true);
            try {
                const res = await fetch(`/api/import-logs?companyId=${activeCompany.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setImportLogs(data);
                }
            } catch (error) {
                console.error('Error fetching import logs:', error);
            }
            setIsLoading(false);
        };

        fetchImportLogs();
    }, [activeCompany?.id]);

    const toggleExpand = (logId: string) => {
        setExpandedLogs(prev => {
            const newSet = new Set(prev);
            if (newSet.has(logId)) {
                newSet.delete(logId);
            } else {
                newSet.add(logId);
            }
            return newSet;
        });
    };

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col pb-10">
            {/* Header */}
            <header className="px-6 pt-6 pb-2 bg-gray-50 sticky top-0 z-10">
                <div className="flex items-center justify-between mb-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                        className="-ml-2 h-10 w-10 rounded-full bg-white shadow-sm border border-gray-100 hover:bg-gray-100 transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5 text-gray-900" />
                    </Button>
                    <div className="flex flex-col items-center">
                        <h1 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Historique Imports</h1>
                    </div>
                    <div className="w-10"></div>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 px-6 space-y-4 mt-4">
                {isLoading ? (
                    // Skeleton
                    <div className="animate-pulse space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100">
                                <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
                                <div className="h-3 w-48 bg-gray-100 rounded"></div>
                            </div>
                        ))}
                    </div>
                ) : importLogs.length === 0 ? (
                    // Empty State
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                            <Package className="h-8 w-8 text-gray-300" />
                        </div>
                        <p className="text-gray-500 font-medium">Aucun import automatique</p>
                        <p className="text-xs text-gray-400 mt-1">Les imports de factures apparaîtront ici</p>
                    </div>
                ) : (
                    // Import Logs List
                    importLogs.map((log) => {
                        const isExpanded = expandedLogs.has(log.id);
                        const importDate = parseISO(log.imported_at);

                        return (
                            <div
                                key={log.id}
                                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                            >
                                {/* Header */}
                                <button
                                    onClick={() => toggleExpand(log.id)}
                                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "h-10 w-10 rounded-full flex items-center justify-center",
                                            log.status === 'error' ? 'bg-red-50' : 'bg-blue-50'
                                        )}>
                                            <FileDown className={cn(
                                                "h-5 w-5",
                                                log.status === 'error' ? 'text-red-600' : 'text-blue-600'
                                            )} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-gray-900">
                                                {format(importDate, "dd MMMM yyyy 'à' HH:mm", { locale: fr })}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {log.status === 'error' ? (
                                                    <span className="text-red-600">❌ Échec - {log.error || 'Erreur inconnue'}</span>
                                                ) : (
                                                    <>{log.invoice_count} facture{log.invoice_count > 1 ? 's' : ''} importée{log.invoice_count > 1 ? 's' : ''}</>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    {isExpanded ? (
                                        <ChevronUp className="h-5 w-5 text-gray-400" />
                                    ) : (
                                        <ChevronDown className="h-5 w-5 text-gray-400" />
                                    )}
                                </button>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
                                        {log.invoices?.map((invoice, idx) => (
                                            <div
                                                key={idx}
                                                className="bg-white rounded-xl p-3 border border-gray-100"
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex-1">
                                                        <p className="text-sm font-bold text-gray-900">
                                                            {invoice.matched_supplier || invoice.supplier_name}
                                                        </p>
                                                        {invoice.matched_supplier && invoice.matched_supplier !== invoice.supplier_name && (
                                                            <p className="text-xs text-gray-400 mt-0.5">
                                                                OCR: {invoice.supplier_name}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <p className="text-sm font-bold text-gray-900">
                                                        {invoice.amount_ttc.toLocaleString('fr-FR')}€
                                                    </p>
                                                </div>
                                                <p className="text-xs text-gray-500 font-mono">
                                                    {invoice.reference}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </main>
    );
}
