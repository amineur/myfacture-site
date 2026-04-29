"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, Calendar, Building2, Hash, AlertCircle, CreditCard, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PaymentDialog } from "@/components/payments/payment-dialog";
// ... imports

type PaymentDetail = {
    id: string;
    supplierName: string;
    invoiceRef: string;
    amountTTC: number;
    amountHT: number;
    status: string;
    dueDate: string;
    paymentDate: string | null;
    invoiceDate: string;
    delayDays: number;
    category: string;
    logo: string;
    logoUrl?: string | null;
    supplierId: string;
    supplierIban?: string;
    supplierBic?: string;
    pdfUrl: string | null;
};

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);
    const [payment, setPayment] = useState<PaymentDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);

    useEffect(() => {
        const fetchInvoice = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/invoices/${id}`);
                if (!res.ok) throw new Error('Invoice not found');
                const data = await res.json();

                const now = new Date();
                const due = parseISO(data.due_date);
                const issued = parseISO(data.issued_date);
                const paymentDate = data.payment_date || (data.status === 'PAID' ? data.issued_date : null);
                const delay = differenceInDays(now, due);

                // PDFs are stored externally (Google Drive, etc.) — use url as-is
                const resolvedPdfUrl: string | null = data.pdf_url || null;

                setPayment({
                    id: data.id,
                    supplierName: data.supplier?.name || "Inconnu",
                    supplierId: data.supplier?.id || "",
                    invoiceRef: data.reference || "N/A",
                    amountTTC: data.amount_ttc,
                    amountHT: data.amount_ht || (data.amount_ttc * 0.8),
                    status: data.status.toLowerCase(),
                    dueDate: format(due, 'dd MMM yyyy', { locale: fr }),
                    paymentDate: paymentDate ? format(parseISO(paymentDate), 'dd MMM yyyy', { locale: fr }) : null,
                    invoiceDate: format(issued, 'dd MMM yyyy', { locale: fr }),
                    delayDays: delay,
                    category: data.supplier?.category || "Autre",
                    logo: data.supplier?.name ? data.supplier.name.substring(0, 2).toUpperCase() : "??",
                    logoUrl: data.supplier?.logo_url,
                    supplierIban: data.supplier?.iban,
                    supplierBic: data.supplier?.bic,
                    pdfUrl: resolvedPdfUrl
                });
            } catch (error) {
                console.error("Invoice not found or error", error);
            }
            setIsLoading(false);
        };

        fetchInvoice();
    }, [id]);

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col pb-32">
            {/* Header - Always immediate */}
            <header className="px-6 pt-6 pb-2 bg-gray-50 sticky top-0 z-10 w-full max-w-md mx-auto">
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
                        <h1 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Détail Facture</h1>
                        {payment && (
                            <span className="text-xs text-gray-400 font-bold font-mono mt-0.5">{payment.invoiceRef}</span>
                        )}
                    </div>
                    <div className="w-10"></div>
                </div>
            </header>

            <div className={cn(
                "flex-1 px-6 space-y-6 overflow-y-auto pt-4 max-w-md mx-auto w-full transition-all duration-300",
                isLoading ? "opacity-50 pointer-events-none" : "opacity-100"
            )}>
                {isLoading ? (
                    /* SKELETON STATE */
                    <div className="animate-pulse space-y-8 pt-4">
                        <div className="flex flex-col items-center space-y-4">
                            <div className="h-20 w-20 rounded-2xl bg-gray-200" />
                            <div className="space-y-2 flex flex-col items-center">
                                <div className="h-6 w-32 bg-gray-200 rounded" />
                                <div className="h-4 w-20 bg-gray-100 rounded" />
                            </div>
                            <div className="h-10 w-40 bg-gray-200 rounded mt-2" />
                        </div>
                        <div className="h-24 w-full bg-gray-200 rounded-2xl" />
                        <div className="h-64 w-full bg-white rounded-3xl border border-gray-100 p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="space-y-2">
                                        <div className="h-3 w-16 bg-gray-100 rounded" />
                                        <div className="h-4 w-24 bg-gray-200 rounded" />
                                    </div>
                                ))}
                            </div>
                            <div className="border-t border-gray-50 pt-4 space-y-3">
                                <div className="h-4 w-full bg-gray-50 rounded" />
                                <div className="h-4 w-full bg-gray-50 rounded" />
                            </div>
                        </div>
                    </div>
                ) : !payment ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                        <AlertCircle className="h-10 w-10 mb-2 opacity-20" />
                        <p>Facture introuvable.</p>
                    </div>
                ) : (
                    <>
                        {/* Hero Section: Supplier & Amount */}
                        <Link href={`/suppliers/${payment.supplierId}`} className="flex flex-row items-center justify-start gap-4 px-2 hover:bg-gray-50 p-2 rounded-2xl transition-colors cursor-pointer group">
                            <div className="h-16 w-16 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-xl font-bold text-gray-300 overflow-hidden relative shrink-0 group-hover:border-blue-200 transition-colors">
                                {payment.logoUrl ? (
                                    <img
                                        src={payment.logoUrl}
                                        alt={payment.supplierName}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    payment.logo
                                )}
                            </div>
                            <div className="flex flex-col items-start gap-1">
                                <h2 className="text-lg font-bold text-gray-900 leading-tight group-hover:text-blue-600 transition-colors">{payment.supplierName}</h2>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
                                    {payment.category}
                                </span>
                            </div>
                        </Link>

                        {/* Status Card - Late */}
                        {(payment.status === 'late' || ((payment.status === 'pending' || payment.status === 'open') && payment.delayDays > 0)) && (
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-red-700 text-sm">Attention : Paiement attendu</p>
                                    <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
                                        Date limite : <strong>{payment.dueDate}</strong>.
                                        {(payment.delayDays > 0) && ` (${payment.delayDays} jours de retard)`}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Status Card - Pending / Open (Future Due Date) */}
                        {((payment.status === 'pending' || payment.status === 'open') && payment.delayDays <= 0) && (
                            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
                                <Calendar className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-blue-700 text-sm">À régler prochainement</p>
                                    <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
                                        Date limite : <strong>{payment.dueDate}</strong>.
                                        {Math.abs(payment.delayDays) > 0 ? ` (Dans ${Math.abs(payment.delayDays)} jours)` : " (Aujourd'hui)"}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Status Card - Paid */}
                        {payment.status === 'paid' && (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <Hash className="h-3 w-3 text-emerald-600" />
                                </div>
                                <p className="font-bold text-emerald-700 text-sm">Payé le {payment.paymentDate}</p>
                            </div>
                        )}

                        {/* Info Grid Card */}
                        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                            <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 text-gray-400 text-xs font-medium uppercase tracking-wide">
                                        <Calendar className="h-3 w-3" />
                                        Date Facture
                                    </div>
                                    <p className="font-bold text-gray-900 text-sm">{payment.invoiceDate}</p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5 text-gray-400 text-xs font-medium uppercase tracking-wide">
                                        <Calendar className="h-3 w-3" />
                                        Échéance
                                    </div>
                                    <p className={cn("font-bold text-sm", (payment.status === 'late' || payment.delayDays > 0) ? "text-orange-600" : "text-gray-900")}>
                                        {payment.dueDate}
                                    </p>
                                </div>
                            </div>

                            <div className="border-t border-dashed border-gray-100"></div>

                            {/* Breakdown */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 font-medium">Montant HT</span>
                                    <span className="text-gray-900 font-medium">{payment.amountHT.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}€</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 font-medium">TVA (20%)</span>
                                    <span className="text-gray-900 font-medium">{(payment.amountTTC - payment.amountHT).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}€</span>
                                </div>
                                <div className="flex justify-between items-center text-base pt-2">
                                    <span className="text-gray-900 font-bold">Total TTC</span>
                                    <span className="text-gray-900 font-bold">{payment.amountTTC.toLocaleString('fr-FR')}€</span>
                                </div>
                            </div>
                        </div>

                        {/* PDF Card with Preview & Download */}
                        <div
                            className={cn(
                                "w-full bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between transition-all",
                                !payment.pdfUrl && "opacity-50"
                            )}
                        >
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-gray-900">
                                        {payment.pdfUrl ? "Facture PDF" : "Facture indisponible"}
                                    </p>
                                    <p className="text-xs text-gray-400">Document joint</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Preview Button */}
                                <button
                                    onClick={() => payment.pdfUrl && setIsPreviewOpen(true)}
                                    disabled={!payment.pdfUrl}
                                    className={cn(
                                        "h-10 w-10 rounded-full flex items-center justify-center transition-colors",
                                        payment.pdfUrl
                                            ? "bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600"
                                            : "bg-gray-50 text-gray-300 cursor-not-allowed"
                                    )}
                                    title="Prévisualiser"
                                >
                                    <Eye className="h-5 w-5" />
                                </button>

                                {/* Download Button */}
                                <a
                                    href={payment.pdfUrl || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={`Facture-${payment.invoiceRef}.pdf`}
                                    className={cn(
                                        "h-10 w-10 rounded-full flex items-center justify-center transition-colors",
                                        payment.pdfUrl
                                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                                            : "bg-gray-50 text-gray-300 cursor-not-allowed"
                                    )}
                                    title="Télécharger"
                                >
                                    <Download className="h-5 w-5" />
                                </a>
                            </div>
                        </div>

                        {/* Static Action Button (In Flow) */}
                        <div className="pt-4">
                            {payment.status !== 'paid' && (
                                <Button
                                    onClick={() => setIsPaymentDialogOpen(true)}
                                    className="w-full h-14 rounded-2xl shadow-sm bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg flex items-center justify-center gap-2.5"
                                >
                                    <CreditCard className="h-5 w-5 opacity-90" />
                                    <span>Régler {payment.amountTTC.toLocaleString('fr-FR')}€</span>
                                </Button>
                            )}
                            <div className="mt-6 text-center">
                                <Link href={`/suppliers/${payment.supplierId}`} className="text-xs font-bold text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-wide">
                                    Voir la fiche de {payment.supplierName}
                                </Link>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* PAYMENT DIALOG */}
            {payment && (
                <PaymentDialog
                    isOpen={isPaymentDialogOpen}
                    onClose={() => setIsPaymentDialogOpen(false)}
                    invoices={[{
                        id: payment.id,
                        reference: payment.invoiceRef,
                        amount_ttc: payment.amountTTC,
                        supplier: {
                            id: payment.supplierId,
                            name: payment.supplierName,
                            iban: payment.supplierIban,
                            bic: payment.supplierBic,
                        }
                    }]}
                    onSuccess={() => {
                        setIsPaymentDialogOpen(false)
                        // Reload or update status
                        window.location.reload()
                    }}
                />
            )}

            {/* PDF Preview Dialog */}
            {payment && (
                <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>

                    <DialogContent className="max-w-4xl h-[90vh] p-0 flex flex-col bg-gray-900 border-gray-800">
                        <div className="flex-1 w-full bg-gray-800 relative">
                            {payment.pdfUrl ? (
                                <iframe
                                    src={payment.pdfUrl}
                                    className="w-full h-full border-0"
                                    title="Aperçu PDF"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-400">
                                    Impossible de charger l'aperçu
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </main>
    );
}
