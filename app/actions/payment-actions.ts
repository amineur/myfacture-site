
"use server";

import { prisma } from "@/utils/db";
import axios from "axios";
import { v4 as uuidv4 } from 'uuid';

const QONTO_API_URL = "https://thirdparty.qonto.com/v2";

// ============================================
// FONCTIONS DE VALIDATION ET NETTOYAGE
// ============================================

/**
 * Nettoie et valide un IBAN
 */
const cleanIban = (iban: string | undefined | null): string => {
    if (!iban) {
        throw new Error('IBAN manquant');
    }

    // Supprime espaces et met en majuscules
    const cleaned = iban.trim().toUpperCase().replace(/\s/g, '');

    // Vérifie le format basique (2 lettres pays + 2 chiffres clé + max 30 caractères)
    const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/;

    if (!ibanRegex.test(cleaned)) {
        throw new Error(`IBAN invalide: ${iban}. Format attendu: FR76...`);
    }

    // Vérifie longueur selon pays
    const countryLengths: Record<string, number> = {
        'FR': 27, 'DE': 22, 'ES': 24, 'IT': 27, 'BE': 16,
        'NL': 18, 'PT': 25, 'LU': 20, 'AT': 20, 'IE': 22
    };

    const country = cleaned.substring(0, 2);
    const expectedLength = countryLengths[country];

    if (expectedLength && cleaned.length !== expectedLength) {
        throw new Error(`IBAN ${country} invalide: longueur attendue ${expectedLength}, reçue ${cleaned.length}`);
    }

    return cleaned;
};

/**
 * Nettoie et valide un BIC
 */
const cleanBic = (bic: string | undefined | null): string | undefined => {
    if (!bic || !bic.trim()) {
        // BIC is optional for SEPA in many cases (IBAN-only rule)
        return undefined;
    }

    // Supprime espaces et met en majuscules
    const cleaned = bic.trim().toUpperCase().replace(/\s/g, '');

    // Vérifie le format (8 ou 11 caractères alphanumériques)
    const bicRegex = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

    if (!bicRegex.test(cleaned)) {
        throw new Error(`BIC invalide: ${bic}. Format attendu: 8 ou 11 caractères (ex: AGRIFRPP)`);
    }

    return cleaned;
};

/**
 * Nettoie le nom du bénéficiaire (caractères autorisés par Qonto)
 */
const cleanBeneficiaryName = (name: string | undefined | null): string => {
    if (!name) {
        throw new Error('Nom du bénéficiaire manquant');
    }

    // Remplace accents et caractères spéciaux
    const cleanName = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
        .replace(/[^a-zA-Z0-9 \-&.,]/g, '') // Garde uniquement caractères autorisés
        .trim()
        .substring(0, 69); // Max 69 caractères selon doc Qonto

    if (cleanName.length === 0) {
        throw new Error(`Nom du bénéficiaire invalide après nettoyage: "${name}"`);
    }

    return cleanName;
};

/**
 * Nettoie la référence de virement
 */
const cleanReference = (reference: string | undefined | null): string => {
    if (!reference) {
        throw new Error('Référence manquante');
    }

    // Normalise et nettoie
    const cleanRef = reference
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprime accents
        .replace(/[^a-zA-Z0-9 \-\/\?:().,'+]/g, '') // Caractères autorisés par Qonto
        .trim()
        .substring(0, 139); // Max 139 caractères

    if (cleanRef.length === 0) {
        throw new Error(`Référence invalide après nettoyage: "${reference}"`);
    }

    return cleanRef;
};

/**
 * Valide et formate un montant
 */
const validateAmount = (amount: any): string => {
    const numAmount = Number(amount);

    if (isNaN(numAmount)) {
        throw new Error(`Montant invalide: ${amount}`);
    }

    if (numAmount <= 0) {
        throw new Error(`Le montant doit être supérieur à 0 (reçu: ${numAmount})`);
    }

    if (numAmount > 999999999.99) {
        throw new Error(`Montant trop élevé: ${numAmount}`);
    }

    // Arrondi à 2 décimales
    return numAmount.toFixed(2);
};

/**
 * Vérifie si l'IBAN est dans la zone SEPA
 */
const isSepaCountry = (iban: string): boolean => {
    const sepaCountries = [
        'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
        'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU',
        'MT', 'MC', 'NL', 'NO', 'PL', 'PT', 'RO', 'SM', 'SK', 'SI',
        'ES', 'SE', 'CH', 'GB'
    ];

    const country = iban.substring(0, 2);
    return sepaCountries.includes(country);
};

// ============================================
// FONCTION PRINCIPALE DE PAIEMENT (INTERNE)
// ============================================

async function processQontoPayment(
    invoice: any,
    qontoAccount: any,
    beneficiaryName: string,
    iban: string,
    bic: string,
    sourceIban: string,
    accessToken: string
) {
    try {
        console.log('🚀 Démarrage du paiement Qonto...');

        // ============================================
        // 1. VALIDATION DU COMPTE QONTO
        // ============================================
        // Prefer UUID 'id' from metadata, fallback to 'bank_account_id' legacy or slug if misnamed
        const bankAccountId = qontoAccount?.metadata?.id || qontoAccount?.metadata?.bank_account_id;

        if (!bankAccountId) {
            throw new Error('ID du compte bancaire Qonto manquant (bank_account_id)');
        }

        if (!sourceIban) {
            throw new Error('IBAN source manquant');
        }

        // ============================================
        // 2. NETTOYAGE ET VALIDATION DES DONNÉES
        // ============================================

        // Montant
        const formattedAmount = validateAmount(invoice.amount_ttc);

        // IBAN bénéficiaire
        const cleanedIban = cleanIban(iban);

        // Vérification SEPA
        if (!isSepaCountry(cleanedIban)) {
            throw new Error(`L'IBAN ${cleanedIban} n'est pas dans la zone SEPA`);
        }

        // BIC (Try pass empty if missing? code throws. Let's assume we have it or user provides it)
        const cleanedBic = cleanBic(bic);

        // Nom bénéficiaire
        const cleanedName = cleanBeneficiaryName(beneficiaryName);

        // Référence
        const cleanedRef = cleanReference(invoice.reference);

        // ============================================
        // 3. CONSTRUCTION DU PAYLOAD
        // ============================================

        // Check if supplier has a Qonto beneficiary_id
        const supplier = (invoice as any).suppliers;
        const qontoBeneficiaryId = supplier?.metadata?.qonto_beneficiary_id;

        let transferPayload: any = {
            bank_account_id: bankAccountId,
            debit_iban: sourceIban,
            amount: formattedAmount,
            currency: 'EUR',
            reference: cleanedRef
        };

        if (qontoBeneficiaryId) {
            // Use beneficiary_id (trusted beneficiary, no SCA required)
            console.log(`✅ Using Qonto beneficiary_id: ${qontoBeneficiaryId}`);
            transferPayload.beneficiary_id = qontoBeneficiaryId;
        } else {
            // Fallback to beneficiary details (may require SCA)
            console.log(`⚠️  No beneficiary_id found, using beneficiary details`);
            transferPayload.beneficiary = {
                name: cleanedName,
                iban: cleanedIban,
                ...(cleanedBic ? { bic: cleanedBic } : {})
            };
        }

        console.log('📦 Payload:', JSON.stringify(transferPayload));

        // ============================================
        // 4. VERIFY PAYEE (Get VOP Proof Token)
        // ============================================

        console.log('🔐 Verifying payee to get VOP proof token...');

        const verifyPayload: any = {
            iban: cleanedIban,
            beneficiary_name: cleanedName
        };

        const verifyRes = await axios.post(
            `${QONTO_API_URL}/sepa/verify_payee`,
            verifyPayload,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const vopProofToken = verifyRes.data?.proof_token?.token;

        if (!vopProofToken) {
            throw new Error('Failed to obtain VOP proof token from verify_payee');
        }

        console.log('✅ VOP proof token obtained');

        // ============================================
        // 5. ENVOI À L'API QONTO (with VOP token)
        // ============================================

        const transferRes = await axios.post(
            `${QONTO_API_URL}/sepa/transfers`,
            {
                vop_proof_token: vopProofToken,
                transfer: transferPayload
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'X-Qonto-Idempotency-Key': uuidv4(),
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        console.log('✅ Virement OK:', transferRes.data.transfer?.id);

        return {
            success: true,
            data: transferRes.data,
            transfer_id: transferRes.data?.transfer?.id || transferRes.data?.id
        };

    } catch (error: any) {
        console.error('❌ Erreur:', error.message);

        // Format error for upstream
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            const detail = data?.errors?.[0]?.detail || data?.message || JSON.stringify(data);
            throw new Error(`Qonto API (${status}): ${detail}`);
        }
        throw error; // Rethrow internal errors
    }
}

// ============================================
// SERVER ACTION EXPORTÉE
// ============================================

export async function initiatePaymentAction(invoiceIds: string[], manualIban?: string, manualBic?: string, manualBeneficiaryName?: string) {
    // 1. Fetch Invoices
    const invoicesRaw = await prisma.invoices.findMany({
        where: { id: { in: invoiceIds } },
        include: { supplier: { select: { id: true, name: true, iban: true, bic: true, email: true } } },
    });

    const invoices = invoicesRaw.map(inv => ({
        ...inv,
        amount_ttc: Number(inv.amount_ttc),
        suppliers: inv.supplier,
    }));

    if (!invoices || invoices.length === 0) return { success: false, error: "Facture introuvable." };

    // 1b. Get Bank Account
    const qontoAccount = await prisma.bank_accounts.findFirst({
        where: { bank_type: 'QONTO' },
        select: { id: true, metadata: true },
    });
    if (!qontoAccount) console.error("No Qonto bank account found");

    const sourceIban = qontoAccount?.metadata?.iban;
    if (!sourceIban) return { success: false, error: "IBAN Qonto source introuvable." };

    const results = [];

    // Dynamically import token helper
    const { getValidQontoToken, refreshQontoToken } = await import('@/utils/qonto-token');

    for (const invoice of invoices) {
        try {
            // Prepare Data
            const supplier = (invoice as any).suppliers;
            const iban = (invoices.length === 1 && manualIban) ? manualIban : (supplier?.iban || '');
            const bic = (invoices.length === 1 && manualBic) ? manualBic : (supplier?.bic || '');
            const beneficiaryName = (invoices.length === 1 && manualBeneficiaryName) ? manualBeneficiaryName : (supplier?.name || '');

            if (!iban) {
                results.push({ invoiceId: invoice.id, status: 'failed', error: `IBAN manquant pour ${beneficiaryName || 'fournisseur inconnu'}. Veuillez le renseigner.` });
                continue;
            }
            if (!beneficiaryName) {
                results.push({ invoiceId: invoice.id, status: 'failed', error: `Nom du bénéficiaire manquant pour la facture ${invoice.reference}.` });
                continue;
            }

            // Save manual override
            if (invoices.length === 1 && manualIban && supplier?.id) {
                await prisma.suppliers.update({
                    where: { id: supplier.id },
                    data: { iban: manualIban, ...(manualBic ? { bic: manualBic } : {}) },
                });
            }

            // Get Token
            let accessToken = await getValidQontoToken(invoice.company_id);

            // PROCESS PAYMENT (With Auto-Retry on 401)
            try {
                const result = await processQontoPayment(
                    invoice,
                    qontoAccount,
                    beneficiaryName,
                    iban,
                    bic,
                    sourceIban,
                    accessToken
                );

                if (result.success) {
                    await prisma.invoices.update({ where: { id: invoice.id }, data: { status: 'PAID', payment_date: new Date() } });
                    results.push({ invoiceId: invoice.id, status: 'success', transferId: result.transfer_id });

                    // Send email notification to supplier
                    if (supplier?.email) {
                        console.log(`📧 Sending payment notification to ${supplier.email}...`);
                        try {
                            const { sendPaymentNotificationEmail } = await import('@/utils/send-email');
                            await sendPaymentNotificationEmail(
                                supplier.email,
                                supplier.name,
                                invoice.reference,
                                invoice.amount_ttc,
                                new Date().toISOString().split('T')[0],
                                result.transfer_id
                            );
                        } catch (emailError) {
                            console.warn(`⚠️ Email failed:`, emailError);
                        }
                    }
                }
            } catch (err: any) {
                // If 401, Try Refreshing Token and Retry ONCE
                if (err.message && err.message.includes("401")) {
                    console.log("⚠️ 401 Detected. Attempting Forced Token Refresh...");
                    try {
                        // Force Refresh
                        accessToken = await refreshQontoToken(invoice.company_id);

                        console.log("🔄 Retrying Payment with new token...");
                        const retryResult = await processQontoPayment(
                            invoice,
                            qontoAccount,
                            beneficiaryName,
                            iban,
                            bic,
                            sourceIban,
                            accessToken
                        );

                        if (retryResult.success) {
                            await prisma.invoices.update({ where: { id: invoice.id }, data: { status: 'PAID', payment_date: new Date() } });
                            results.push({ invoiceId: invoice.id, status: 'success', transferId: retryResult.transfer_id });

                            // RE-ADD EMAIL LOGIC FOR RETRY
                            if (supplier?.email) {
                                console.log(`📧 (Retry) Sending payment notification to ${supplier.email}...`);
                                try {
                                    const { sendPaymentNotificationEmail } = await import('@/utils/send-email');
                                    await sendPaymentNotificationEmail(
                                        supplier.email,
                                        supplier.name,
                                        invoice.reference,
                                        invoice.amount_ttc,
                                        new Date().toISOString().split('T')[0],
                                        retryResult.transfer_id
                                    );
                                } catch (emailError) {
                                    console.warn(`⚠️ Email failed:`, emailError);
                                }
                            }
                        }
                    } catch (retryErr: any) {
                        console.error("❌ Retry Failed:", retryErr.message);
                        // Fallback to original error to let outer catch handle it
                        throw new Error("Connexion Qonto expirée (malgré tentative de rafraîchissement).");
                    }
                } else {
                    throw err; // Re-throw other errors
                }
            }

        } catch (err: any) {
            console.error(`Payment failed for ${invoice.reference}:`, err.message);
            // Translate common errors for UI
            let uiError = err.message;
            if (err.message.includes("401")) uiError = "Connexion Qonto expirée. Reconnectez-vous.";
            if (err.message.includes("BIC manquant")) uiError = "Code BIC manquant. Vérifiez la fiche fournisseur.";

            results.push({ invoiceId: invoice.id, status: 'failed', error: uiError });
        }
    }

    // Client-side will handle sync to avoid timeout
    return { success: true, results };
}
