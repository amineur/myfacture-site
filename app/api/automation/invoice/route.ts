import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/utils/db'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { runFullReconciliation } from '@/lib/reconciliation'

async function savePdfLocally(pdf_base64: string, reference: string): Promise<string> {
    const filename = `${reference.replace(/[^a-zA-Z0-9._-]/g, '_')}_${Date.now()}.pdf`
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'pdfs')
    await mkdir(uploadsDir, { recursive: true })
    await writeFile(path.join(uploadsDir, filename), Buffer.from(pdf_base64, 'base64'))
    return `/uploads/pdfs/${filename}`
}

export async function POST(req: NextRequest) {
    try {
        const apiKey = req.headers.get('x-automation-key')
        if (!apiKey || apiKey !== process.env.AUTOMATION_API_KEY) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: any = {}
        let pdf_file: File | null = null
        const contentType = req.headers.get('content-type') || ''

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData()
            formData.forEach((value, key) => {
                if (key !== 'file') body[key] = value
            })
            pdf_file = formData.get('file') as File
        } else {
            body = await req.json()
        }

        const { company_handle, supplier_name, amount_ttc, amount_ht, reference, issued_date, due_date, status = 'PENDING' } = body

        // pdf_url (external link) OU pdf_base64 OU pdf_file (multipart)
        let pdf_url = body.pdf_url || null
        if (!pdf_url) {
            if (pdf_file) {
                const buffer = Buffer.from(await pdf_file.arrayBuffer())
                const filename = `${(reference || 'invoice').replace(/[^a-zA-Z0-9._-]/g, '_')}_${Date.now()}.pdf`
                const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'pdfs')
                await mkdir(uploadsDir, { recursive: true })
                await writeFile(path.join(uploadsDir, filename), buffer)
                pdf_url = `/uploads/pdfs/${filename}`
            } else if (body.pdf_base64) {
                pdf_url = await savePdfLocally(body.pdf_base64, reference || `invoice_${Date.now()}`)
            }
        }

        if (!company_handle || !supplier_name || (amount_ttc === undefined || amount_ttc === null)) {
            const missing = []
            if (!company_handle) missing.push('company_handle')
            if (!supplier_name) missing.push('supplier_name')
            if (amount_ttc === undefined || amount_ttc === null) missing.push('amount_ttc')
            return NextResponse.json({ error: 'Missing required fields', missing }, { status: 400 })
        }

        const company = await prisma.companies.findUnique({ where: { handle: company_handle } })
        if (!company) return NextResponse.json({ error: `Company not found: ${company_handle}` }, { status: 404 })

        // TDF SAS envoie des factures pour Urban Global (TDF UG) ET Euromedmultimedia (TDF E3M)
        // On distingue par le destinataire dans le PDF
        const pdfTextLower = (body.pdf_text || '').toLowerCase()
        let tdfTarget = 'TDF UG' // default
        if (pdfTextLower.includes('euromedmultimedia') || pdfTextLower.includes('eurom') || pdfTextLower.includes('e3m')) {
            tdfTarget = 'TDF E3M'
        }

        const SUPPLIER_MAPPING: Record<string, string> = {
            'TDF E3M': 'TDF E3M', 'E3M': 'TDF E3M',
            'TDF SAS': tdfTarget, 'TDF': tdfTarget,
            'Voice Track': 'VT Consult', 'Voice Track - Consulting - EVénemenTiel': 'VT Consult',
            'VT CONSULT': 'VT Consult', 'SARL VT CONSULT': 'VT Consult',
            'TOWERCAST': 'TowerCast',
        }

        // Build dynamic mappings from supplier metadata (TVA, domains) stored in DB
        const allCompanySuppliers = await prisma.suppliers.findMany({ where: { company_id: company.id } })

        const dynamicTvaMappings: Record<string, string> = {}
        const dynamicDomainMappings: Record<string, string> = {}

        for (const s of allCompanySuppliers) {
            const meta = (s.metadata as any) || {}
            // TVA from metadata
            if (meta.tva_number) {
                dynamicTvaMappings[meta.tva_number.toLowerCase()] = s.name
            }
            // Domains from metadata
            if (meta.domains && Array.isArray(meta.domains)) {
                for (const domain of meta.domains) {
                    dynamicDomainMappings[domain.toLowerCase()] = s.name
                }
            }
            // Also extract domain from website/email fields
            if (s.website) {
                const domain = s.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
                dynamicDomainMappings[domain.toLowerCase()] = s.name
            }
            if (s.email) {
                const emailDomain = s.email.split('@')[1]
                if (emailDomain) dynamicDomainMappings[emailDomain.toLowerCase()] = s.name
            }
        }

        // Hardcoded fallbacks (kept for safety, DB values take priority)
        const DOMAIN_FALLBACK: Record<string, string> = {
            'towercast.fr': 'TowerCast',
            'towercast.com': 'TowerCast',
            'vtconsult.fr': 'VT Consult',
            'e3m.fr': 'TDF E3M',
        }
        const TVA_FALLBACK: Record<string, string> = {
            'fr83434822441': 'TowerCast',
        }

        // Merge: DB values override hardcoded
        const DOMAIN_MAPPING = { ...DOMAIN_FALLBACK, ...dynamicDomainMappings }
        const TVA_MAPPING = { ...TVA_FALLBACK, ...dynamicTvaMappings }

        // Reject empty/unknown supplier names — but first try to recover from PDF text content
        const REJECTED_NAMES = ['', 'inconnu', 'fournisseur inconnu', 'unknown', 'n/a', 'null', 'undefined']
        let cleanedInput = (supplier_name || '').replace(/[{}]+/g, '').trim()

        // If name is empty/unknown, try to identify from PDF text (passed in body.pdf_text)
        if (REJECTED_NAMES.includes(cleanedInput.toLowerCase()) && body.pdf_text) {
            const pdfText = (body.pdf_text || '').toLowerCase()

            // Try domain mapping: find domain in PDF text
            for (const [domain, name] of Object.entries(DOMAIN_MAPPING)) {
                if (pdfText.includes(domain)) {
                    cleanedInput = name
                    break
                }
            }

            // Try TVA mapping: find TVA number in PDF text
            if (REJECTED_NAMES.includes(cleanedInput.toLowerCase())) {
                for (const [tva, name] of Object.entries(TVA_MAPPING)) {
                    if (pdfText.includes(tva.toLowerCase())) {
                        cleanedInput = name
                        break
                    }
                }
            }
        }

        if (REJECTED_NAMES.includes(cleanedInput.toLowerCase())) {
            return NextResponse.json({
                error: 'Supplier name is empty or unknown. Please check the PDF extraction.',
                supplier_name_received: supplier_name,
            }, { status: 400 })
        }

        // Nettoyer agressivement le nom : supprimer }}, {{, formes juridiques, normaliser espaces
        let mappedName = cleanedInput
            .replace(/\b(SARL|SAS|SA|EURL|SCI|SASU)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
        // Sort by key length DESC so "TDF E3M" matches before "TDF"
        const sortedMapping = Object.entries(SUPPLIER_MAPPING).sort((a, b) => b[0].length - a[0].length)
        for (const [key, value] of sortedMapping) {
            if (mappedName.toLowerCase().includes(key.toLowerCase())) {
                mappedName = value;
                break;
            }
        }

        let supplier = await prisma.suppliers.findFirst({
            where: { company_id: company.id, name: { equals: mappedName, mode: 'insensitive' } },
        })

        if (!supplier) {
            const allSuppliers = allCompanySuppliers
            const editDist = (s1: string, s2: string) => {
                const costs: number[] = []
                for (let i = 0; i <= s1.length; i++) {
                    let last = i
                    for (let j = 0; j <= s2.length; j++) {
                        if (i === 0) costs[j] = j
                        else if (j > 0) {
                            let nv = costs[j - 1]
                            if (s1[i - 1] !== s2[j - 1]) nv = Math.min(nv, last, costs[j]) + 1
                            costs[j - 1] = last; last = nv
                        }
                    }
                    if (i > 0) costs[s2.length] = last
                }
                return costs[s2.length]
            }
            const sim = (a: string, b: string) => { const l = Math.max(a.length, b.length); return l === 0 ? 1 : (l - editDist(a, b)) / l }
            let best = 0, bestMatch = null
            for (const s of allSuppliers) {
                const score = sim(mappedName.toLowerCase(), s.name.toLowerCase())
                if (score > best && score >= 0.7) { best = score; bestMatch = s }
            }

            // Also try matching each word of the supplier name against existing suppliers
            if (!bestMatch && mappedName.length >= 4) {
                const words = mappedName.toLowerCase().split(/\s+/).filter(w => w.length >= 4)
                for (const s of allSuppliers) {
                    const sName = s.name.toLowerCase()
                    for (const word of words) {
                        if (sName.includes(word) || word.includes(sName)) {
                            bestMatch = s
                            break
                        }
                    }
                    if (bestMatch) break
                }
            }

            supplier = bestMatch
        }

        if (!supplier) {
            // Don't auto-create — return error so n8n can flag it for manual review
            return NextResponse.json({
                error: 'No matching supplier found. Please add this supplier manually or update the mapping.',
                supplier_name_received: supplier_name,
                cleaned_name: mappedName,
            }, { status: 404 })
        }

        const parseDate = (d: any, fallback: Date | string) => {
            if (!d) return new Date(fallback);
            const parsed = new Date(d);
            return isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
        }

        const fallbackDate = new Date().toISOString().split('T')[0];
        const finalIssuedDate = parseDate(issued_date, fallbackDate);
        // Toujours forcer due_date = issued_date + 30 jours
        const dueDateFromIssued = new Date(finalIssuedDate);
        dueDateFromIssued.setDate(dueDateFromIssued.getDate() + 30);
        const finalDueDate = dueDateFromIssued;

        // Normaliser la référence : enlever les zéros devant
        const normalizedRef = reference ? reference.replace(/^0+/, '') : null;

        let result;
        // Chercher par référence exacte OU par référence sans zéros devant
        let existingInvoice = null;
        if (normalizedRef) {
            const candidates = await prisma.invoices.findMany({
                where: {
                    company_id: company.id,
                    reference: { not: null }
                }
            });
            existingInvoice = candidates.find(inv =>
                inv.reference === reference ||
                inv.reference === normalizedRef ||
                inv.reference?.replace(/^0+/, '') === normalizedRef
            ) || null;
        }

        if (existingInvoice) {
            // Mise à jour : on garde le status et la date de paiement actuels
            result = await prisma.invoices.update({
                where: { id: existingInvoice.id },
                data: {
                    supplier_id: supplier.id,
                    amount_ttc: Number(amount_ttc),
                    amount_ht: amount_ht ? Number(amount_ht) : null,
                    issued_date: finalIssuedDate,
                    due_date: finalDueDate,
                    pdf_url: pdf_url || existingInvoice.pdf_url
                }
            })
        } else {
            // Création classique
            result = await prisma.invoices.create({
                data: {
                    company_id: company.id,
                    supplier_id: supplier.id,
                    reference: normalizedRef || reference || null,
                    amount_ttc: Number(amount_ttc),
                    amount_ht: amount_ht ? Number(amount_ht) : null,
                    issued_date: finalIssuedDate,
                    due_date: finalDueDate,
                    status: status as any,
                    pdf_url
                }
            })
        }

        const detail = { supplier_name: supplier_name.trim(), matched_supplier: supplier.name, reference: reference || 'N/A', amount_ttc }
        const existingLog = await prisma.import_logs.findFirst({
            where: { company_id: company.id, source: 'automation', status: 'success' },
            orderBy: { imported_at: 'desc' }
        })

        if (existingLog && (new Date().getTime() - new Date(existingLog.imported_at).getTime() < 60000)) {
            const updatedInvoices = [...((existingLog.invoices as any[]) || []), detail]
            await prisma.import_logs.update({
                where: { id: existingLog.id },
                data: { invoices: updatedInvoices, invoice_count: updatedInvoices.length },
            })
        } else {
            await prisma.import_logs.create({
                data: { company_id: company.id, invoice_count: 1, invoices: [detail], source: 'automation', status: 'success' },
            })
        }

        // Trigger reconciliation in background to link to Qonto transaction
        runFullReconciliation(company.id).catch(err => console.error('[Automation Recon Error]', err.message))

        const debugInfo = { 
            pdf_text_received: !!body.pdf_text, 
            pdf_text_length: (body.pdf_text || '').length, 
            tdf_target: pdfTextLower.includes('euromedmultimedia') ? 'TDF E3M' : 'TDF UG', 
            matched_supplier: supplier.name 
        }
        console.log('[Automation Debug]', debugInfo)

        return NextResponse.json({ success: true, ...result, _debug: debugInfo })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function GET() {
    return NextResponse.json({ status: 'Automation endpoint active' })
}
