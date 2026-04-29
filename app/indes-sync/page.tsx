"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, Clock, FileText, Search, Filter, ChevronDown, ChevronUp, ExternalLink, Loader2, Play, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useCompanies } from "@/components/providers/companies-provider";

type IndesInvoice = {
    id: string;
    reference: string | null;
    amount_ttc: number;
    amount_ht: number | null;
    issued_date: string | null;
    due_date: string | null;
    status: string;
    payment_date: string | null;
    pdf_url: string | null;
    metadata: {
        source?: string;
        category?: string | null;
        description?: string | null;
        is_avoir?: boolean;
        needs_review?: boolean;
        review_reasons?: string[];
        original_filename?: string;
        payment_mode?: string;
    } | null;
};

type SyncStatus = {
    status: string;
    token_expires?: string;
    token_user?: string;
    api_status?: number;
    message?: string;
};

type SyncResult = {
    total_in_section: number;
    processed: number;
    created: number;
    needs_review: number;
    skipped_existing: number;
    skipped_no_supplier: number;
    errors: string[];
    invoices: any[];
};

const formatMoney = (amount: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(amount);

// Auth via session NextAuth (pas besoin de clé API)

export default function IndesSyncPage() {
    const router = useRouter();
    const { companies } = useCompanies();
    const activeCompany = companies[0];

    const [invoices, setInvoices] = useState<IndesInvoice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
    const [filter, setFilter] = useState<'all' | 'review' | 'ok'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ category: string; amount_ttc: string }>({ category: '', amount_ttc: '' });

    // Fetch invoices from Les Indés
    const fetchInvoices = useCallback(async () => {
        if (!activeCompany?.id) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/indes-invoices?companyId=${activeCompany.id}`);
            if (res.ok) {
                const data = await res.json();
                setInvoices(data);
            }
        } catch (e) {
            console.error('Error fetching indés invoices:', e);
        }
        setIsLoading(false);
    }, [activeCompany?.id]);

    // Check sync status
    const checkStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/automation/indes-sync', {
                // Session auth (no API key needed)
            });
            if (res.ok) {
                const data = await res.json();
                setSyncStatus(data);
            }
        } catch (e) {
            setSyncStatus({ status: 'error', message: 'Impossible de vérifier le statut' });
        }
    }, []);

    useEffect(() => {
        fetchInvoices();
        checkStatus();
    }, [fetchInvoices, checkStatus]);

    // Launch sync
    const handleSync = async (dryRun: boolean) => {
        setIsSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/automation/indes-sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Session auth
                },
                body: JSON.stringify({ dryRun, limit: 999 }),
            });
            const data = await res.json();
            setSyncResult(data);
            if (!dryRun && data.created > 0) {
                fetchInvoices(); // Refresh list
            }
        } catch (e) {
            setSyncResult({ total_in_section: 0, processed: 0, created: 0, needs_review: 0, skipped_existing: 0, skipped_no_supplier: 0, errors: ['Erreur réseau'], invoices: [] });
        }
        setIsSyncing(false);
    };

    // Save review correction
    const handleSaveReview = async (invoiceId: string) => {
        try {
            const res = await fetch(`/api/indes-invoices/${invoiceId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: editForm.category,
                    amount_ttc: editForm.amount_ttc ? parseFloat(editForm.amount_ttc) : undefined,
                }),
            });
            if (res.ok) {
                setEditingId(null);
                fetchInvoices();
            }
        } catch (e) {
            console.error('Error saving:', e);
        }
    };

    // Filter invoices
    const filtered = invoices.filter(inv => {
        if (filter === 'review' && !inv.metadata?.needs_review) return false;
        if (filter === 'ok' && inv.metadata?.needs_review) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const ref = (inv.reference || '').toLowerCase();
            const cat = (inv.metadata?.category || '').toLowerCase();
            const desc = (inv.metadata?.description || '').toLowerCase();
            if (!ref.includes(q) && !cat.includes(q) && !desc.includes(q)) return false;
        }
        return true;
    });

    const reviewCount = invoices.filter(i => i.metadata?.needs_review).length;
    const totalAmount = invoices.reduce((sum, i) => sum + Number(i.amount_ttc || 0), 0);

    return (
        <main className="p-6 max-w-md mx-auto space-y-6 pb-32">
            {/* Header */}
            <header className="flex items-center gap-3">
                <button onClick={() => router.back()} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-gray-900">Importations IndésCorporate</h1>
                    <p className="text-xs text-gray-500">Interface de synchronisation Les Indés → Dashboard</p>
                </div>
            </header>

            {/* Sync Status Card */}
            <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-900">Statut connexion</p>
                    {syncStatus ? (
                        <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            syncStatus.status === 'ok' ? "bg-emerald-50 text-emerald-700" :
                            syncStatus.status === 'token_expired' ? "bg-red-50 text-red-700" :
                            syncStatus.status === 'not_configured' ? "bg-amber-50 text-amber-700" :
                            "bg-gray-100 text-gray-600"
                        )}>
                            {syncStatus.status === 'ok' ? 'Connecté' :
                             syncStatus.status === 'token_expired' ? 'Token expiré' :
                             syncStatus.status === 'not_configured' ? 'Non configuré' :
                             syncStatus.status}
                        </span>
                    ) : (
                        <div className="h-5 w-20 bg-gray-100 animate-pulse rounded-full" />
                    )}
                </div>
                {syncStatus?.token_user && (
                    <p className="text-xs text-gray-400">Compte : {syncStatus.token_user}</p>
                )}
                {syncStatus?.token_expires && (
                    <p className="text-xs text-gray-400">
                        Expiration token : {format(parseISO(syncStatus.token_expires), 'dd MMM yyyy HH:mm', { locale: fr })}
                    </p>
                )}
                {syncStatus?.status === 'not_configured' && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
                        Ajoutez INDES_JWT_TOKEN dans votre .env pour activer la synchronisation.
                    </p>
                )}
            </Card>

            {/* Sync Actions */}
            <div className="flex gap-3">
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={() => handleSync(true)}
                    disabled={isSyncing || syncStatus?.status !== 'ok'}
                >
                    {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    Aperçu (dry run)
                </Button>
                <Button
                    size="sm"
                    className="flex-1 gap-2 bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => handleSync(false)}
                    disabled={isSyncing || syncStatus?.status !== 'ok'}
                >
                    {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Synchroniser
                </Button>
            </div>

            {/* Sync Result */}
            {syncResult && (
                <Card className={cn("p-4 space-y-2 border-l-4", syncResult.errors.length > 0 ? "border-l-amber-500" : "border-l-emerald-500")}>
                    <p className="text-sm font-bold text-gray-900">
                        {syncResult.created > 0 ? `${syncResult.created} facture(s) importée(s)` : 'Aucune nouvelle facture'}
                    </p>
                    {syncResult.errors.length > 0 && (
                        <div className="text-xs text-red-600 space-y-1 mt-2">
                            {syncResult.errors.slice(0, 3).map((err, i) => (
                                <p key={i}>• {err}</p>
                            ))}
                            {syncResult.errors.length > 3 && <p>... et {syncResult.errors.length - 3} autres erreurs</p>}
                        </div>
                    )}
                </Card>
            )}

            {/* Stats */}
            <section className="grid grid-cols-2 gap-3">
                <Card className="p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{invoices.length}</p>
                    <p className="text-[10px] text-gray-500">Importées</p>
                </Card>
                <Card className={cn("p-3 text-center", syncResult && syncResult.errors.length > 0 && "border-red-200 bg-red-50/50")}>
                    <p className={cn("text-2xl font-bold", syncResult && syncResult.errors.length > 0 ? "text-red-600" : "text-gray-900")}>
                        {syncResult ? syncResult.errors.length : 0}
                    </p>
                    <p className="text-[10px] text-gray-500">Échouées</p>
                </Card>
                <Card className={cn("p-3 text-center", reviewCount > 0 && "border-amber-200 bg-amber-50/50")}>
                    <p className={cn("text-2xl font-bold", reviewCount > 0 ? "text-amber-600" : "text-gray-900")}>{reviewCount}</p>
                    <p className="text-[10px] text-gray-500">À corriger</p>
                </Card>
                <Card className="p-3 text-center">
                    <p className="text-lg font-bold text-gray-900">{formatMoney(totalAmount)}</p>
                    <p className="text-[10px] text-gray-500">Total TTC</p>
                </Card>
            </section>

            {/* Filters */}
            <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                    {([
                        ['all', `Toutes (${invoices.length})`],
                        ['review', `À corriger (${reviewCount})`],
                        ['ok', 'OK'],
                    ] as const).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={cn(
                                "px-3 py-1.5 rounded-md transition-colors font-medium",
                                filter === key ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex-1 relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Rechercher..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>
            </div>

            {/* Invoice List */}
            <section className="space-y-2">
                {isLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-20 bg-gray-50 animate-pulse rounded-xl" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <Card className="p-8 text-center">
                        <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">
                            {invoices.length === 0
                                ? "Aucune facture importée. Lancez une synchronisation."
                                : "Aucune facture ne correspond aux filtres."
                            }
                        </p>
                    </Card>
                ) : (
                    filtered.map(inv => {
                        const isExpanded = expandedId === inv.id;
                        const isEditing = editingId === inv.id;
                        const needsReview = inv.metadata?.needs_review;

                        return (
                            <Card
                                key={inv.id}
                                className={cn(
                                    "overflow-hidden transition-colors",
                                    needsReview && "border-l-4 border-l-amber-400",
                                )}
                            >
                                {/* Row header */}
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                                    className="w-full p-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                                >
                                    <div className={cn(
                                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                                        needsReview ? "bg-amber-100 text-amber-700" :
                                        inv.status === 'PAID' ? "bg-emerald-100 text-emerald-700" :
                                        "bg-blue-100 text-blue-700"
                                    )}>
                                        {needsReview ? <AlertTriangle className="h-4 w-4" /> :
                                         inv.status === 'PAID' ? <CheckCircle2 className="h-4 w-4" /> :
                                         <Clock className="h-4 w-4" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-bold text-gray-900 truncate">
                                                {inv.metadata?.category || inv.reference || 'Sans catégorie'}
                                            </p>
                                            {inv.metadata?.is_avoir && (
                                                <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">AVOIR</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span>{inv.reference || '—'}</span>
                                            {inv.issued_date && (
                                                <>
                                                    <span>•</span>
                                                    <span>{format(parseISO(inv.issued_date), 'dd MMM yyyy', { locale: fr })}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className={cn(
                                            "text-sm font-bold",
                                            inv.amount_ttc === 0 ? "text-amber-500" : "text-gray-900"
                                        )}>
                                            {inv.amount_ttc === 0 ? '—' : formatMoney(inv.amount_ttc)}
                                        </p>
                                        <p className={cn(
                                            "text-[10px] font-medium",
                                            inv.status === 'PAID' ? "text-emerald-600" : "text-blue-600"
                                        )}>
                                            {inv.status === 'PAID' ? 'Payé' : 'En attente'}
                                        </p>
                                    </div>
                                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
                                </button>

                                {/* Expanded details */}
                                {isExpanded && (
                                    <div className="px-3 pb-3 space-y-3 border-t border-gray-50">
                                        {/* Review warnings */}
                                        {needsReview && (
                                            <div className="mt-2 bg-amber-50 rounded-lg p-2 space-y-1">
                                                <p className="text-xs font-bold text-amber-700 flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3" /> À corriger
                                                </p>
                                                {inv.metadata?.review_reasons?.map((reason, i) => (
                                                    <p key={i} className="text-xs text-amber-600">• {reason}</p>
                                                ))}
                                            </div>
                                        )}

                                        {/* Details grid */}
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>
                                                <p className="text-gray-400">Catégorie</p>
                                                <p className="font-medium text-gray-700">{inv.metadata?.category || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Description</p>
                                                <p className="font-medium text-gray-700 truncate">{inv.metadata?.description || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Montant HT</p>
                                                <p className="font-medium text-gray-700">{inv.amount_ht ? formatMoney(inv.amount_ht) : '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Montant TTC</p>
                                                <p className="font-medium text-gray-700">{inv.amount_ttc ? formatMoney(inv.amount_ttc) : '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Date émission</p>
                                                <p className="font-medium text-gray-700">
                                                    {inv.issued_date ? format(parseISO(inv.issued_date), 'dd/MM/yyyy') : '—'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Échéance</p>
                                                <p className="font-medium text-gray-700">
                                                    {inv.due_date ? format(parseISO(inv.due_date), 'dd/MM/yyyy') : '—'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Fichier</p>
                                                <p className="font-medium text-gray-700 truncate">{inv.metadata?.original_filename || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400">Mode paiement</p>
                                                <p className="font-medium text-gray-700 truncate">{inv.metadata?.payment_mode || '—'}</p>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-2 pt-1">
                                            {inv.pdf_url && (
                                                <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                                                    <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
                                                        <FileText className="h-3 w-3" /> PDF
                                                    </Button>
                                                </a>
                                            )}
                                            {needsReview && !isEditing && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="gap-1 text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-50"
                                                    onClick={() => {
                                                        setEditingId(inv.id);
                                                        setEditForm({
                                                            category: inv.metadata?.category || '',
                                                            amount_ttc: inv.amount_ttc ? String(inv.amount_ttc) : '',
                                                        });
                                                    }}
                                                >
                                                    Corriger
                                                </Button>
                                            )}
                                        </div>

                                        {/* Edit form */}
                                        {isEditing && (
                                            <div className="bg-gray-50 rounded-lg p-3 space-y-2 mt-1">
                                                <div>
                                                    <label className="text-[10px] text-gray-500 font-medium">Catégorie</label>
                                                    <input
                                                        type="text"
                                                        value={editForm.category}
                                                        onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                                                        placeholder="ex: Hébergement Scaleway"
                                                        className="w-full mt-0.5 px-2 py-1.5 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-gray-500 font-medium">Montant TTC (€)</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={editForm.amount_ttc}
                                                        onChange={e => setEditForm(f => ({ ...f, amount_ttc: e.target.value }))}
                                                        placeholder="194.40"
                                                        className="w-full mt-0.5 px-2 py-1.5 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        className="flex-1 text-xs h-7 bg-blue-600 text-white hover:bg-blue-700"
                                                        onClick={() => handleSaveReview(inv.id)}
                                                    >
                                                        Enregistrer
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-xs h-7"
                                                        onClick={() => setEditingId(null)}
                                                    >
                                                        Annuler
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        );
                    })
                )}
            </section>
        </main>
    );
}
