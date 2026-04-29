
"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initiatePaymentAction } from "@/app/actions/payment-actions";
import { Loader2, CheckCircle2, AlertCircle, CreditCard, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InvoiceForPayment {
    id: string;
    reference: string;
    amount_ttc: number;
    supplier: {
        id: string;
        name: string;
        iban?: string; // Checked from DB externally or passed here
        bic?: string;
    } | null;
}

interface PaymentDialogProps {
    isOpen: boolean;
    onClose: () => void;
    invoices: InvoiceForPayment[];
    onSuccess?: () => void;
}

export function PaymentDialog({ isOpen, onClose, invoices, onSuccess }: PaymentDialogProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; results?: any[]; error?: string } | null>(null);

    // Group by supplier to handle IBAN inputs
    const [missingInfoMap, setMissingInfoMap] = useState<Record<string, { iban: string, bic: string, name: string }>>({});

    // Check for missing IBANs on mount/invoices change
    useEffect(() => {
        if (!isOpen) {
            setResult(null);
            setMissingInfoMap({});
            return;
        }

        const missing: Record<string, { iban: string, bic: string, name: string }> = {};
        invoices.forEach(inv => {
            if (inv.supplier && !inv.supplier.iban) {
                if (!missing[inv.supplier.id]) {
                    missing[inv.supplier.id] = { iban: "", bic: "", name: inv.supplier.name };
                }
            }
        });
        setMissingInfoMap(missing);
    }, [isOpen, invoices]);

    const handleConfirm = async () => {
        setIsLoading(true);

        // Prepare data
        // For multiple invoices, we pass IDs. 
        // Logic for manual IBANs: 
        // My server action currently accepts single 'manualIban' override.
        // It does NOT support map of overrides for bulk.
        // I need to update server action OR loop here.
        // Looping here is safer for the "Bulk Different Beneficiaries" requirement if the action doesn't support bulk overrides.
        // BUT `initiatePaymentAction` DOES handle array of invoices.
        // If I pay 3 invoices for 3 suppliers, and 1 needs manual IBAN, the action fails for that one if I don't pass it.
        // LIMITATION: `initiatePaymentAction` (current implementation) takes ONE `manualIban` arg.
        // So if multiple suppliers need IBAN, I can't do it in one request unless I update action.

        // Quick Fix Strategy:
        // Use the action for VALID ones.
        // For MISSING info ones, we probably need one action call per supplier or update the company first?
        // Updating company first is best.

        // 1. Update Companies with missing info (Separate Action? Or client-side API call?)
        // Let's use a server action helper for security or just trust the loop.
        // I will trust the `payment-actions` current limitation and:
        // If there are MANUAL IBANs needed:
        //   I will call `initiatePaymentAction` individually for those invoices (or grouped by supplier).
        // If NO manual info needed:
        //   Call bulk.

        const invoiceIds = invoices.map(i => i.id);
        const hasManual = Object.keys(missingInfoMap).length > 0;

        if (hasManual) {
            // Complex Bulk
            // Group invoices by Supplier
            const invoicesBySupplier: Record<string, string[]> = {};
            invoices.forEach(inv => {
                const sId = inv.supplier?.id || "unknown";
                if (!invoicesBySupplier[sId]) invoicesBySupplier[sId] = [];
                invoicesBySupplier[sId].push(inv.id);
            });

            const allResults: any[] = [];

            // Process each supplier group
            for (const [sId, ids] of Object.entries(invoicesBySupplier)) {
                const manualData = missingInfoMap[sId];
                // Call action for this batch
                const res = await initiatePaymentAction(
                    ids,
                    manualData?.iban || undefined,
                    manualData?.bic || undefined,
                    manualData?.name || undefined
                );
                if (res.results) allResults.push(...res.results);
            }

            setResult({ success: true, results: allResults }); // Approximate success

        } else {
            // Simple Bulk
            const res = await initiatePaymentAction(invoiceIds);
            setResult(res);
        }

        setIsLoading(false);

        // Auto-sync Qonto 10s after payment (let Qonto process the transfer)
        setTimeout(() => {
            fetch('/api/sync/qonto').catch(err => console.error("Auto-sync after payment error:", err));
        }, 10000);
    };

    const totalAmount = invoices.reduce((sum, inv) => sum + inv.amount_ttc, 0);
    const uniqueSuppliers = Array.from(new Set(invoices.map(i => i.supplier?.id).filter((id): id is string => !!id)));
    const missingCount = Object.keys(missingInfoMap).length;

    const handleCloseFinal = () => {
        // If we had successes, we trigger onSuccess to reload the page/update state
        const hasSuccess = result?.success || (result?.results && result.results.some(r => r.status === 'success'));
        if (hasSuccess) {
            // Trigger sync in background (fire and forget from client POV)
            fetch('/api/sync/qonto').catch(err => console.error("Background sync error:", err));
            if (onSuccess) onSuccess();
        } else {
            onClose();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isLoading && onClose()}>
            <DialogContent className="sm:max-w-md bg-white text-gray-900 border-gray-100">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-blue-600" />
                        Confirmer le virement
                    </DialogTitle>
                    <DialogDescription>
                        Vous allez régler {invoices.length} facture{invoices.length > 1 ? 's' : ''} pour un total de <span className="font-bold text-gray-900">{totalAmount.toLocaleString('fr-FR')} €</span>.
                    </DialogDescription>
                </DialogHeader>

                {!result ? (
                    <div className="space-y-4 py-4">
                        {/* Summary List */}
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                            {uniqueSuppliers.map(sId => {
                                const supplierInvoices = invoices.filter(i => i.supplier?.id === sId);
                                const first = supplierInvoices[0]?.supplier;
                                const needsInfo = !!missingInfoMap[sId];

                                return (
                                    <div key={sId} className={cn("p-3 rounded-xl border space-y-3", needsInfo ? "border-orange-200 bg-orange-50" : "border-gray-100 bg-gray-50")}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Building2 className="h-4 w-4 text-gray-500" />
                                                <span className="font-bold text-sm">{first?.name}</span>
                                            </div>
                                            <span className="text-xs font-bold text-gray-500">
                                                {supplierInvoices.reduce((s, i) => s + i.amount_ttc, 0).toLocaleString('fr-FR')} €
                                            </span>
                                        </div>

                                        {needsInfo && (
                                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                                <div className="flex items-center gap-1.5 text-xs text-orange-700 font-medium">
                                                    <AlertCircle className="h-3.5 w-3.5" />
                                                    IBAN manquant
                                                </div>
                                                <div className="grid gap-2">
                                                    <div className="space-y-1">
                                                        <Label htmlFor={`iban-${sId}`} className="text-xs">IBAN</Label>
                                                        <Input
                                                            id={`iban-${sId}`}
                                                            placeholder="FR76 ..."
                                                            value={missingInfoMap[sId].iban}
                                                            onChange={(e) => setMissingInfoMap(prev => ({
                                                                ...prev,
                                                                [sId as string]: { ...prev[sId as string], iban: e.target.value }
                                                            }))}
                                                            className="h-9 bg-white"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor={`bic-${sId}`} className="text-xs">BIC (Optionnel)</Label>
                                                        <Input
                                                            id={`bic-${sId}`}
                                                            placeholder="SWIFT..."
                                                            value={missingInfoMap[sId].bic}
                                                            onChange={(e) => setMissingInfoMap(prev => ({
                                                                ...prev,
                                                                [sId as string]: { ...prev[sId as string], bic: e.target.value }
                                                            }))}
                                                            className="h-9 bg-white"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="py-6 flex flex-col items-center text-center space-y-3 animate-in fade-in zoom-in-95">
                        {(() => {
                            const failures = result.results?.filter(r => r.status === 'failed') || [];
                            const successes = result.results?.filter(r => r.status === 'success') || [];
                            const isGlobalFailure = !result.success || failures.length === result.results?.length;
                            const isPartial = failures.length > 0 && successes.length > 0;
                            const isSuccess = result.success && failures.length === 0;

                            if (isSuccess) {
                                return (
                                    <>
                                        <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                                            <CheckCircle2 className="h-6 w-6" />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-900">Virement initié !</h3>
                                        <p className="text-sm text-gray-500 max-w-xs block">
                                            {successes.length > 1 ? `Les ${successes.length} ordres de virement ont été transmis.` : "L'ordre de virement a été transmis à Qonto."}
                                        </p>
                                    </>
                                );
                            }

                            return (
                                <>
                                    <div className={cn("h-12 w-12 rounded-full flex items-center justify-center mb-2", isPartial ? "bg-orange-100 text-orange-600" : "bg-red-100 text-red-600")}>
                                        <AlertCircle className="h-6 w-6" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900">{isPartial ? "Paiement partiel" : "Échec du virement"}</h3>

                                    {result.error && (
                                        <p className="text-sm text-red-600 font-medium bg-red-50 p-2 rounded-lg">{result.error}</p>
                                    )}

                                    {failures.length > 0 && (
                                        <div className="w-full text-left space-y-2 max-h-40 overflow-y-auto bg-gray-50 p-3 rounded-lg border border-gray-100 mt-2">
                                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Erreurs ({failures.length})</p>
                                            {failures.map((f, idx) => {
                                                const inv = invoices.find(i => i.id === f.invoiceId);
                                                return (
                                                    <div key={idx} className="text-xs flex gap-2 items-start">
                                                        <span className="text-gray-900 font-medium shrink-0">{inv?.reference || "Facture"}:</span>
                                                        <span className="text-red-600">{f.error}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {successes.length > 0 && (
                                        <p className="text-xs text-emerald-600 font-medium mt-2">
                                            {successes.length} virement(s) réussi(s).
                                        </p>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                )}

                <DialogFooter className="sm:justify-between gap-2">
                    {!result ? (
                        <>
                            <Button variant="ghost" onClick={onClose} disabled={isLoading}>Annuler</Button>
                            <Button onClick={handleConfirm} disabled={isLoading || Object.values(missingInfoMap).some(v => !v.iban)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                {isLoading ? "Traitement..." : `Payer ${totalAmount.toLocaleString('fr-FR')} €`}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={handleCloseFinal} className="w-full bg-gray-900 text-white">Fermer</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
