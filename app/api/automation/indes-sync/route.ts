import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'
import { writeFile, mkdir, access } from 'fs/promises'
import path from 'path'
import { runFullReconciliation } from '@/lib/reconciliation'

const INDES_BASE_URL = 'https://lesindescorporate.fr'
// Urban Hit radioId (France Maghreb 2 = 3934864599684677663)
const RADIO_ID = '3934864599684677758'

interface IndesDocument {
    id: string
    title: string
    url: string | null
    subList: IndesDocument[] | null
    description: string | null
    type: string | null
}

function findSectionById(items: IndesDocument[], id: string): IndesDocument | null {
    for (const item of items) {
        if (item.id === id) return item
        if (item.subList) {
            const found = findSectionById(item.subList, id)
            if (found) return found
        }
    }
    return null
}

// ── PDF Text Extraction (pdf-parse v1.x) ────────────────────────────
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    // pdf-parse v1.x has a bug where it tries to load a test PDF file on import.
    // Workaround: import the inner module directly to skip the test file loading.
    const pdfParse = require('pdf-parse/lib/pdf-parse')
    const data = await pdfParse(buffer)
    return data.text
}

/**
 * Parse structured invoice data from PDF text content.
 * Handles both new format (2026+) and old format (2016-era).
 *
 * New format fields:
 *   N°F_20260402619, DATE : 19-04-2026, DATE D'ÉMISSION : 24-04-2026,
 *   DATE D'ÉCHÉANCE : 10-06-2026, TOTAL TTC 194,40 €, TOTAL HT 162,00 €,
 *   Category line: "Hébergement Scaleway 2026"
 *
 * Old format fields:
 *   Numéro FR000146, Date 15 déc. 2016, Avoir/Facture,
 *   Net à déduire / Montant TTC, Category: "Incidents de diffusion"
 */
function parseInvoicePdfText(text: string) {
    const result: {
        reference: string | null
        issuedDate: string | null
        dueDate: string | null
        emissionDate: string | null
        amountHT: number | null
        amountTTC: number | null
        category: string | null
        description: string | null
        isAvoir: boolean
        paymentMode: string | null
    } = {
        reference: null, issuedDate: null, dueDate: null, emissionDate: null,
        amountHT: null, amountTTC: null, category: null, description: null,
        isAvoir: false, paymentMode: null,
    }

    // Normalize: replace ¤ with € (some old PDFs use ¤)
    text = text.replace(/¤/g, '€')

    const parseFrenchNumber = (str: string): number =>
        parseFloat(str.replace(/\s/g, '').replace(',', '.'))

    const MONTHS: Record<string, string> = {
        'janv': '01', 'jan': '01', 'févr': '02', 'fév': '02', 'feb': '02',
        'mars': '03', 'mar': '03', 'avr': '04', 'apr': '04',
        'mai': '05', 'may': '05', 'juin': '06', 'jun': '06',
        'juil': '07', 'jul': '07', 'août': '08', 'aug': '08',
        'sept': '09', 'sep': '09', 'oct': '10',
        'nov': '11', 'déc': '12', 'dec': '12',
    }

    // ── Type: Avoir (credit note) or Facture ──
    result.isAvoir = /\bAvoir\b/i.test(text)

    // ── Reference ──
    // New: N°F_20260402619
    let refMatch = text.match(/N°\s*F?_?(\d{8,})/i)
    if (!refMatch) {
        // Old: Référence\nFR000146 (may be on separate lines in PDF extraction)
        refMatch = text.match(/(?:Numéro|Référence)\s*\n?\s*([A-Z]{1,3}\d{4,})/i)
    }
    if (refMatch) result.reference = refMatch[1]



    // ── Dates ──
    // Helper: parse DD/MM/YYYY or DD/MM/YY or DD-MM-YYYY → YYYY-MM-DD
    const parseDMY = (d: string, m: string, y: string): string | null => {
        if (y.length === 2) y = (parseInt(y) > 50 ? '19' : '20') + y
        const day = d.padStart(2, '0')
        const month = m.padStart(2, '0')
        // Validate
        const intM = parseInt(month), intD = parseInt(day), intY = parseInt(y)
        if (intM < 1 || intM > 12 || intD < 1 || intD > 31 || intY < 2000 || intY > 2030) return null
        return `${y}-${month}-${day}`
    }

    // Collect ALL dates found in PDF with their context/source
    const foundDates: Array<{ date: string; source: string; priority: number }> = []

    // Priority 1: "DATE :" label (new format)
    const allDateLabel = [...text.matchAll(/\bDATE\s*:\s*(\d{2})-(\d{2})-(\d{4})/gi)]
    for (const m of allDateLabel) {
        const d = parseDMY(m[1], m[2], m[3])
        if (d) foundDates.push({ date: d, source: 'DATE:', priority: 1 })
    }

    // Priority 1: "Date" followed by DD/MM/YYYY (old format header)
    const allDateHeader = [...text.matchAll(/\bDate\b[^\n]{0,15}?(\d{1,2})\/(\d{2})\/(\d{2,4})/gi)]
    for (const m of allDateHeader) {
        const d = parseDMY(m[1], m[2], m[3])
        if (d) foundDates.push({ date: d, source: 'Date header', priority: 1 })
    }

    // Priority 2: French written date "5 juin 2016", "15 déc. 2016"
    const frenchDateMatches = [...text.matchAll(/(\d{1,2})\s+([a-zA-ZéèêëàâäùûüôöîïçÉÈÊÀÂÔÎÇ]{3,})\.?\s+(\d{4})/g)]
    for (const m of frenchDateMatches) {
        const monthKey = m[2].toLowerCase().replace('.', '')
        const month = MONTHS[monthKey]
        if (month) {
            const d = parseDMY(m[1], month, m[3])
            if (d) foundDates.push({ date: d, source: `French: ${m[0]}`, priority: 2 })
        }
    }

    // Priority 3: DD/MM/YYYY or DD/MM/YY standalone (any in text)
    const allSlashDates = [...text.matchAll(/(\d{1,2})\/(\d{2})\/(\d{2,4})/g)]
    for (const m of allSlashDates) {
        const d = parseDMY(m[1], m[2], m[3])
        if (d) foundDates.push({ date: d, source: `slash: ${m[0]}`, priority: 3 })
    }

    // Sort by priority (lowest = best), then pick the earliest date as invoice date
    foundDates.sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date))

    if (foundDates.length > 0) {
        // Use highest priority date as issued date
        result.issuedDate = foundDates[0].date
    }

    // Emission date: DATE D'ÉMISSION : 24-04-2026 (new format only)
    const emissionMatch = text.match(/DATE\s+D.*?MISSION\s*:\s*(\d{2})-(\d{2})-(\d{4})/i)
    if (emissionMatch) {
        result.emissionDate = parseDMY(emissionMatch[1], emissionMatch[2], emissionMatch[3])
    }

    // Due date: DATE D'ÉCHÉANCE (new format)
    const dueMatch = text.match(/DATE\s+D.*?CH.*?ANCE\s*:\s*(\d{2})-(\d{2})-(\d{4})/i)
    if (dueMatch) {
        result.dueDate = parseDMY(dueMatch[1], dueMatch[2], dueMatch[3])
    }

    // Old format due date: "le 15/12/16"
    if (!result.dueDate) {
        const oldDueMatch = text.match(/le\s+(\d{1,2})\/(\d{2})\/(\d{2,4})/i)
        if (oldDueMatch) {
            result.dueDate = parseDMY(oldDueMatch[1], oldDueMatch[2], oldDueMatch[3])
        }
    }

    // ── Amounts ──
    // TOTAL TTC / NET À PAYER (new format — single value on its own line)
    const ttcMatch = text.match(/(?:TOTAL\s+TTC|NET\s+[ÀA]\s+PAYER)\s*€?\s*\n\s*([\d\s]+,\d{2})/i)
    if (ttcMatch) {
        result.amountTTC = parseFrenchNumber(ttcMatch[1])
    }

    // Old format pattern 1: "Total TTC €Total TVA 20%Total HT €" on one line
    // followed by "319,00 €53,17 €265,84 €" or "1 800,00     300,00     1 500,00"
    // First amount = TTC, last = HT
    if (!result.amountTTC) {
        const totalLineMatch = text.match(/Total\s+TTC\s*€[^\n]*Total\s+HT\s*€\s*\n\s*([\d,.\s€]+)/i)
        if (totalLineMatch) {
            const amountsLine = totalLineMatch[1]
            // Try €-separated amounts first: "319,00 €53,17 €265,84 €"
            let amounts = [...amountsLine.matchAll(/([\d\s]+,\d{2})\s*€/g)]
                .map(m => parseFrenchNumber(m[1]))
            // If no €, try space-separated: "1 800,00      300,00      1 500,00"
            if (amounts.length === 0) {
                amounts = [...amountsLine.matchAll(/([\d\s]+,\d{2})/g)]
                    .map(m => parseFrenchNumber(m[1]))
            }
            if (amounts.length >= 1) result.amountTTC = amounts[0]
            if (amounts.length >= 3) result.amountHT = amounts[2]
            else if (amounts.length >= 2) result.amountHT = amounts[amounts.length - 1]
        }
    }

    // Old format pattern 2: "Total HT € Total TVA € 20%  Total TTC €" (reversed order)
    // followed by "1 500,00      300,00      1 800,00"
    if (!result.amountTTC) {
        const reversedMatch = text.match(/Total\s+HT\s*€[^\n]*Total\s+TTC\s*€\s*\n\s*([\d,.\s€]+)/i)
        if (reversedMatch) {
            const amountsLine = reversedMatch[1]
            let amounts = [...amountsLine.matchAll(/([\d\s]+,\d{2})\s*€/g)]
                .map(m => parseFrenchNumber(m[1]))
            if (amounts.length === 0) {
                amounts = [...amountsLine.matchAll(/([\d\s]+,\d{2})/g)]
                    .map(m => parseFrenchNumber(m[1]))
            }
            // Reversed: first = HT, last = TTC
            if (amounts.length >= 3) {
                result.amountHT = amounts[0]
                result.amountTTC = amounts[2]
            } else if (amounts.length >= 1) {
                result.amountTTC = amounts[amounts.length - 1]
            }
        }
    }

    // Old format pattern 3: "Net à déduire/payer €..." → next line has amounts
    if (!result.amountTTC) {
        const amountsLineMatch = text.match(/(?:Net\s+[àa]\s+(?:d[ée]duire|payer))\s*€[^\n]*\n\s*([\d,.\s€]+€)/i)
        if (amountsLineMatch) {
            const amountsLine = amountsLineMatch[1]
            const amounts = [...amountsLine.matchAll(/([\d\s]+,\d{2})\s*€/g)]
                .map(m => parseFrenchNumber(m[1]))
            if (amounts.length >= 1) result.amountTTC = amounts[0]
            if (amounts.length >= 3) result.amountHT = amounts[2]
            else if (amounts.length >= 2) result.amountHT = amounts[amounts.length - 1]
        }
    }

    // Fallback: look for standalone amount before "le DD/MM/YY" (old format: "167,02 €\nle 10/11/16")
    if (!result.amountTTC) {
        const beforeEchMatch = text.match(/([\d\s]+,\d{2})\s*€?\s*\n\s*le\s+\d{2}\/\d{2}\/\d{2,4}/i)
        if (beforeEchMatch) {
            result.amountTTC = parseFrenchNumber(beforeEchMatch[1])
        }
    }

    // TOTAL HT (new format)
    if (!result.amountHT) {
        const htMatch = text.match(/TOTAL\s+HT\s*€?\s*\n?\s*([\d\s]+,\d{2})/i)
        if (htMatch) {
            result.amountHT = parseFrenchNumber(htMatch[1])
        }
    }

    // If avoir, amounts should be negative
    if (result.isAvoir) {
        if (result.amountTTC && result.amountTTC > 0) result.amountTTC = -result.amountTTC
        if (result.amountHT && result.amountHT > 0) result.amountHT = -result.amountHT
    }

    // ── Category / Description ──
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    // Known categories to search for in full text
    const KNOWN_CATEGORIES = [
        'Hébergement Scaleway', 'Incidents de diffusion', 'Frais de gestion',
        'Cotisation', 'Redevance', 'Reversement', 'Commission',
        'Frais techniques', 'Streaming', 'Webradio', 'Frais de diffusion',
        'Frais de régie', 'Contribution', 'Refacturation',
    ]
    for (const cat of KNOWN_CATEGORIES) {
        if (text.includes(cat)) {
            result.category = cat
            break
        }
    }

    // New format: standalone category line before DÉSIGNATION (e.g. "Hébergement Scaleway 2026")
    if (!result.category) {
        const desigIdx = lines.findIndex(l => /D[ÉE]SIGNATION/i.test(l))
        if (desigIdx > 0) {
            for (let i = desigIdx - 1; i >= Math.max(0, desigIdx - 3); i--) {
                const line = lines[i]
                if (/(?:SIRET|TVA|France|Versailles|Chantiers|ADRESSE|FACTURATION|URBAN|EUROMEDMULTIMEDIA|Quantit|Numéro|Num[ée]ro|Montant|R[ée]f[ée]rence|Facture|Date|P[ée]riode|D[ée]signation|Mode\s+de)/i.test(line)) continue
                if (line.length > 5 && line.length < 80 && !/^\d/.test(line) && !/^N°/.test(line)) {
                    result.category = line
                    break
                }
            }
        }
    }

    // Description: extract from line item text
    // New format: "Provision avril 2026 selon nombre d'appels et webservices1,00162,00..."
    // Old format: "1,0045,9445,94 €Incidents de diffusion"
    const desigIdx = lines.findIndex(l => /D[ÉE]SIGNATION/i.test(l))
    if (desigIdx >= 0) {
        for (let i = desigIdx + 1; i < Math.min(desigIdx + 5, lines.length); i++) {
            const line = lines[i]
            if (/^QT[ÉE]|^PU|^TVA|^TOTAL|^BASE|^Mode/i.test(line)) continue
            if (line.length > 10) {
                // Strip numbers and amounts from the description
                let cleaned = line
                    .replace(/^[\d,.\s]+(?:€\s*)?/g, '')    // leading numbers
                    .replace(/\d+,\d{2}\s*[€%]?\s*/g, '')   // embedded amounts
                    .replace(/\d+,\d{2}/g, '')               // remaining number pairs
                    .trim()
                if (cleaned.length > 5) {
                    result.description = cleaned
                    break
                }
            }
        }
    }

    // Fallback: if no category found, use the description as category
    // Old format PDFs have the service name in the désignation line
    if (!result.category && result.description) {
        // Clean up: remove year/period suffixes like "2026", "janv./mars 2016"
        let cat = result.description
            .replace(/\s+\d{4}$/, '')                          // trailing year
            .replace(/\s+(?:du\s+)?\d{2}\/\d{4}\s+au\s+\d{2}\/\d{4}/i, '')  // period ranges
            .replace(/\s+(?:janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)[.\s/]+.*$/i, '') // month ranges
            .trim()
        if (cat.length > 3) {
            result.category = cat
        }
    }

    // Payment mode
    const paymentMatch = text.match(/Mode\s+de\s+(?:paiement|règlement)\s*:\s*\n?\s*(.+)/i)
    if (paymentMatch) {
        const mode = paymentMatch[1].trim()
        // Filter out amounts that got captured as payment mode in old format
        if (mode.length > 3 && !/^\d/.test(mode)) {
            result.paymentMode = mode
        }
    }

    return result
}

// ── File helpers ──────────────────────────────────────────────────────
async function downloadPdf(url: string, token: string): Promise<Buffer> {
    const res = await fetch(`${INDES_BASE_URL}${url}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Failed to download PDF: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
}

async function savePdf(buffer: Buffer, filename: string): Promise<string> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'pdfs', 'indes')
    await mkdir(uploadsDir, { recursive: true })
    await writeFile(path.join(uploadsDir, safeName), buffer)
    return `/uploads/pdfs/indes/${safeName}`
}

// ══════════════════════════════════════════════════════════════════════
// POST /api/automation/indes-sync
//
// Synchronise les factures depuis Les Indés Corporate.
// Body: { limit?: number, dryRun?: boolean, section?: string }
//
// Sections: "factures" (default), "tf1", "digital", "releves"
// ══════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
    try {
        // Auth: either API key or NextAuth session (for UI calls)
        const apiKey = req.headers.get('x-automation-key')
        const session = await getServerSession(authOptions)
        if ((!apiKey || apiKey !== process.env.AUTOMATION_API_KEY) && !session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = process.env.INDES_JWT_TOKEN
        if (!token) {
            return NextResponse.json({
                error: 'INDES_JWT_TOKEN not configured. Connectez-vous sur lesindescorporate.fr, ouvrez la console DevTools et exécutez : localStorage.getItem("authorizationTokenFront")',
            }, { status: 500 })
        }

        const body = await req.json().catch(() => ({}))
        const limit = body.limit || 50
        const dryRun = body.dryRun === true
        const redownloadMissing = body.redownloadMissing === true
        const sectionKey = body.section || 'factures'

        const SECTION_MAP: Record<string, { id: string; supplier: string }> = {
            factures: { id: '4129498607212560412', supplier: 'Les Indés' },
            tf1: { id: '4238596286370021766', supplier: 'TF1 Publicité' },
            digital: { id: '4025544538513735718', supplier: 'Indés Digital' },
            releves: { id: '4025544538513735720', supplier: 'Les Indés' },
        }

        const sectionConfig = SECTION_MAP[sectionKey]
        if (!sectionConfig) {
            return NextResponse.json({ error: `Unknown section: ${sectionKey}`, available: Object.keys(SECTION_MAP) }, { status: 400 })
        }

        // 1. Fetch document tree
        console.log('[Indés Sync] Fetching document list...')
        const docsRes = await fetch(`${INDES_BASE_URL}/api/content/mydocs/${RADIO_ID}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        })
        if (!docsRes.ok) {
            if (docsRes.status === 401) {
                return NextResponse.json({
                    error: 'Token Les Indés expiré. Reconnectez-vous sur lesindescorporate.fr et mettez à jour INDES_JWT_TOKEN.',
                }, { status: 401 })
            }
            return NextResponse.json({ error: `Les Indés API error: ${docsRes.status}` }, { status: 502 })
        }

        const docsTree: IndesDocument[] = await docsRes.json()

        // 2. Find section
        const section = findSectionById(docsTree, sectionConfig.id)
        if (!section || !section.subList) {
            return NextResponse.json({ error: `Section "${sectionKey}" not found or empty` }, { status: 404 })
        }

        const allDocs = section.subList.filter(d => d.url && d.title.toLowerCase().endsWith('.pdf'))
        console.log(`[Indés Sync] Found ${allDocs.length} PDFs in "${section.title}"`)

        // 3. Company + Supplier
        const company = await prisma.companies.findFirst()
        if (!company) return NextResponse.json({ error: 'No company found' }, { status: 404 })

        // ── Keyword → supplier routing ──────────────────────────────────
        // Each entry: [regex to test against full PDF text, supplier suffix]
        // First match wins. Anything unmatched → "Divers"
        const PDF_KEYWORD_ROUTES: Array<[RegExp, string]> = [
            [/\bACPM\b/i, 'Acpm'],
            [/\bInd[ée]s\s*Market\b/i, 'Market'],
            [/\bRadio\s*Player\b/i, 'Radio Player'],
            [/\bMuzicast\b/i, 'Muzicast'],
            [/\bM[ée]diam[ée]trie\b/i, 'Médiamétrie'],
            [/\bHab\.?\s*d[''']?\s*[EÉée]coute\b/i, 'Médiamétrie'],
            [/\bEAR\b/, 'Médiamétrie'],
            [/\bQuote-part\b/i, 'Médiamétrie'],
            // Hébergement AVANT maintenance/site internet (priorité)
            [/h[ée]bergement/i, 'Hébergement'],
            [/\bScaleway\b/i, 'Hébergement'],
            [/\b(?:maintenance|infrastructure\s+commune)\b/i, 'Maintenance'],
            [/\bSite\s+Internet\b/i, 'Maintenance'],
            [/\bCardiweb\b/i, 'Maintenance'],
            [/\bMigration\b/i, 'Maintenance'],
            [/\bProvision\s+cotisation\b/i, 'Cotisation'],
            [/\bcotisation\b/i, 'Cotisation'],
            [/\br[ée]mun[ée]ration\b/i, 'Cotisation'],
            [/\berreur\s+de\s+diffusion\b/i, 'Incidents de diffusion'],
            [/\bincident\b/i, 'Incidents de diffusion'],
        ]

        // Category normalization map (for parsed category text, not PDF content)
        const CATEGORY_NORMALIZE: Record<string, string> = {
            'rémunération': 'Cotisation',
            'remuneration': 'Cotisation',
            'cotisation acpm': 'Acpm',
            'infrastructure commune': 'Maintenance',
            'maintenance': 'Maintenance',
        }

        // Supplier cache: one supplier per category (e.g. "Indes - Hébergement Scaleway")
        const supplierCache: Record<string, typeof company & { id: string; name: string }> = {}

        async function getOrCreateSupplier(category: string | null) {
            // Normalize category: trim, collapse spaces, then apply rename map
            let cleanCategory = category?.replace(/\s+/g, ' ').trim() || null
            if (cleanCategory) {
                const normalized = CATEGORY_NORMALIZE[cleanCategory.toLowerCase()]
                if (normalized) cleanCategory = normalized
            }
            const supplierName = cleanCategory
                ? `Indes - ${cleanCategory}`
                : 'Indes - Divers'

            // Cache key is lowercase to avoid duplicates
            const cacheKey = supplierName.toLowerCase()
            if (supplierCache[cacheKey]) return supplierCache[cacheKey]

            // Search existing supplier (case-insensitive + contains for flexibility)
            let found = await prisma.suppliers.findFirst({
                where: { company_id: company!.id, name: { equals: supplierName, mode: 'insensitive' } },
            })

            // Fallback: search by category keyword alone
            if (!found && cleanCategory) {
                found = await prisma.suppliers.findFirst({
                    where: { company_id: company!.id, name: { contains: cleanCategory, mode: 'insensitive' } },
                })
            }

            // Auto-create if not found
            if (!found) {
                found = await prisma.suppliers.create({
                    data: {
                        company_id: company!.id,
                        name: supplierName,
                    },
                })
                console.log(`[Indés Sync] Created supplier: ${found.name} (${found.id})`)
            }

            supplierCache[cacheKey] = found as any
            return found
        }

        // 4. Existing refs for dedup
        const existingInvoices = await prisma.invoices.findMany({
            where: { company_id: company.id },
            select: { id: true, reference: true, pdf_url: true },
        })
        const existingRefs = new Set(existingInvoices.map(i => i.reference).filter(Boolean))
        // Also normalize: strip leading zeros and F_ prefix for matching
        const normalizedExistingRefs = new Set(
            existingInvoices
                .map(i => i.reference?.replace(/^F_?/i, '').replace(/^0+/, ''))
                .filter(Boolean)
        )
        // Build a map ref → invoice for redownload mode
        const existingByRef = new Map<string, { id: string; pdf_url: string | null }>()
        for (const inv of existingInvoices) {
            if (inv.reference) {
                existingByRef.set(inv.reference, inv)
                const norm = inv.reference.replace(/^F_?/i, '').replace(/^0+/, '')
                existingByRef.set(norm, inv)
            }
        }

        // 5. Process
        const docsToProcess = allDocs.slice(0, limit)
        const results = {
            total_in_section: allDocs.length,
            processed: 0,
            created: 0,
            redownloaded: 0,
            needs_review: 0,
            skipped_existing: 0,
            skipped_no_supplier: 0,
            errors: [] as string[],
            invoices: [] as any[],
        }

        for (const doc of docsToProcess) {
            results.processed++

            // Throttle: 200ms pause between each PDF to avoid overloading Les Indés API
            if (results.processed > 1) {
                await new Promise(r => setTimeout(r, 200))
            }

            try {
                // Download PDF
                const pdfBuffer = await downloadPdf(doc.url!, token)

                // Extract text and parse
                const pdfText = await extractTextFromPdf(pdfBuffer)
                const parsed = parseInvoicePdfText(pdfText)

                // Debug: log PDFs where amount or date extraction fails
                if (!parsed.amountTTC) {
                    console.log(`[Indés Sync] ⚠ No amount for ${doc.title}:`)
                    console.log(pdfText.substring(0, 500))
                    console.log('---')
                }
                if (!parsed.issuedDate) {
                    console.log(`[Indés Sync] ⚠ No date for ${doc.title}, trying filename...`)
                    // Try to extract date from filename: _MMYYYY, _YYYYMM, _DDMMYYYY, _YYYYMMDD
                    const fn = doc.title
                    let fnDate: string | null = null
                    // Pattern: _MMYYYY (e.g. _052016)
                    const mmyyyyMatch = fn.match(/_(\d{2})(\d{4})(?:[._]|$)/)
                    if (mmyyyyMatch && parseInt(mmyyyyMatch[1]) >= 1 && parseInt(mmyyyyMatch[1]) <= 12) {
                        fnDate = `${mmyyyyMatch[2]}-${mmyyyyMatch[1]}-01`
                    }
                    // Pattern: _YYYYMMDD (e.g. _20160605)
                    if (!fnDate) {
                        const ymdMatch = fn.match(/_(\d{4})(\d{2})(\d{2})/)
                        if (ymdMatch && parseInt(ymdMatch[2]) >= 1 && parseInt(ymdMatch[2]) <= 12) {
                            fnDate = `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`
                        }
                    }
                    // Pattern: _YYYY in filename (at least get the year)
                    if (!fnDate) {
                        const yearMatch = fn.match(/_(\d{4})/)
                        if (yearMatch) {
                            fnDate = `${yearMatch[1]}-01-01`
                        }
                    }
                    if (fnDate) {
                        parsed.issuedDate = fnDate
                        console.log(`[Indés Sync]   → date from filename: ${fnDate}`)
                    } else {
                        console.log(`[Indés Sync]   → no date found anywhere, first 300 chars:`)
                        console.log(pdfText.substring(0, 300))
                    }
                }

                // Build reference for dedup
                const ref = parsed.reference || doc.title.replace(/\.pdf$/i, '').split('_').slice(-1)[0]
                const normalizedRef = ref.replace(/^F_?/i, '').replace(/^0+/, '')

                const isExisting = existingRefs.has(ref) || existingRefs.has(`F_${ref}`) || normalizedExistingRefs.has(normalizedRef)
                if (isExisting) {
                    if (redownloadMissing) {
                        // Check if PDF file actually exists on disk
                        const existingInv = existingByRef.get(ref) || existingByRef.get(normalizedRef)
                        if (existingInv?.pdf_url) {
                            const pdfFullPath = path.join(process.cwd(), 'public', existingInv.pdf_url)
                            try {
                                await access(pdfFullPath)
                                // PDF exists, skip
                                results.skipped_existing++
                                continue
                            } catch {
                                // PDF missing on disk, re-download it
                                console.log(`[Indés Sync] Re-downloading missing PDF: ${doc.title}`)
                                const pdfPath = await savePdf(pdfBuffer, doc.title)
                                await prisma.invoices.update({
                                    where: { id: existingInv.id },
                                    data: { pdf_url: pdfPath },
                                })
                                results.redownloaded++
                                results.invoices.push({
                                    id: existingInv.id,
                                    reference: ref,
                                    filename: doc.title,
                                    pdf_url: pdfPath,
                                    status: 'redownloaded',
                                })
                                continue
                            }
                        } else {
                            // No pdf_url at all, save the PDF and update the record
                            console.log(`[Indés Sync] Downloading PDF for existing invoice: ${doc.title}`)
                            const pdfPath = await savePdf(pdfBuffer, doc.title)
                            if (existingInv) {
                                await prisma.invoices.update({
                                    where: { id: existingInv.id },
                                    data: { pdf_url: pdfPath },
                                })
                            }
                            results.redownloaded++
                            results.invoices.push({
                                id: existingInv?.id,
                                reference: ref,
                                filename: doc.title,
                                pdf_url: pdfPath,
                                status: 'redownloaded',
                            })
                            continue
                        }
                    }
                    results.skipped_existing++
                    continue
                }

                // Route by PDF keyword matching → supplier name suffix
                let resolvedCategory = 'Divers' // default fallback
                for (const [regex, supplierSuffix] of PDF_KEYWORD_ROUTES) {
                    if (regex.test(pdfText)) {
                        resolvedCategory = supplierSuffix
                        break
                    }
                }
                // If no keyword matched but parser found a category, normalize it
                if (resolvedCategory === 'Divers' && parsed.category) {
                    const norm = CATEGORY_NORMALIZE[parsed.category.toLowerCase()]
                    resolvedCategory = norm || parsed.category
                }

                if (dryRun) {
                    const needsReview = !resolvedCategory || !parsed.amountTTC || !parsed.issuedDate
                    if (needsReview) results.needs_review++
                    results.invoices.push({
                        reference: ref,
                        category: resolvedCategory,
                        description: parsed.description,
                        issuedDate: parsed.issuedDate,
                        emissionDate: parsed.emissionDate,
                        dueDate: parsed.dueDate,
                        amountHT: parsed.amountHT,
                        amountTTC: parsed.amountTTC,
                        isAvoir: parsed.isAvoir,
                        filename: doc.title,
                        needs_review: needsReview,
                        review_reasons: [
                            ...(!parsed.category ? ['catégorie manquante'] : []),
                            ...(!parsed.amountTTC ? ['montant TTC manquant'] : []),
                            ...(!parsed.issuedDate ? ['date émission manquante'] : []),
                        ],
                        status: 'would_create',
                    })
                    results.created++
                    continue
                }

                // Find or create supplier based on resolved category
                const supplier = await getOrCreateSupplier(resolvedCategory)

                // Save PDF
                const pdfPath = await savePdf(pdfBuffer, doc.title)

                // Dates: use issuedDate (date facture) as primary, emissionDate as fallback
                const rawIssuedDate = parsed.issuedDate || parsed.emissionDate
                    ? new Date(parsed.issuedDate || parsed.emissionDate!)
                    : new Date()
                const issuedDate = isNaN(rawIssuedDate.getTime()) ? new Date() : rawIssuedDate

                const rawDueDate = parsed.dueDate ? new Date(parsed.dueDate) : null
                const dueDate = rawDueDate && !isNaN(rawDueDate.getTime()) ? rawDueDate : (() => {
                    const d = new Date(issuedDate)
                    d.setDate(d.getDate() + 30)
                    return d
                })()

                // Status: si date d'échéance est passée → PAID (prélevé sur recettes)
                const now = new Date()
                const isPaid = dueDate <= now
                const status = isPaid ? 'PAID' : 'PENDING'
                const paymentDate = isPaid ? dueDate : null

                // Flag needs_review si catégorie manquante, montant à 0, ou date manquante
                const needsReview = !resolvedCategory || !parsed.amountTTC || !parsed.issuedDate
                if (needsReview) results.needs_review++

                // Create invoice
                const invoice = await prisma.invoices.create({
                    data: {
                        company_id: company.id,
                        supplier_id: supplier.id,
                        reference: ref,
                        amount_ttc: parsed.amountTTC ? Math.abs(parsed.amountTTC) : 0,
                        amount_ht: parsed.amountHT ? Math.abs(parsed.amountHT) : null,
                        issued_date: issuedDate,
                        due_date: dueDate,
                        status: status as any,
                        payment_date: paymentDate,
                        pdf_url: pdfPath,
                        metadata: {
                            source: 'indes-sync',
                            category: resolvedCategory,
                            description: parsed.description,
                            is_avoir: parsed.isAvoir,
                            payment_mode: parsed.paymentMode,
                            original_filename: doc.title,
                            needs_review: needsReview,
                            review_reasons: [
                                ...(!parsed.category ? ['catégorie manquante'] : []),
                                ...(!parsed.amountTTC ? ['montant TTC manquant'] : []),
                                ...(!parsed.issuedDate ? ['date émission manquante'] : []),
                            ],
                        },
                    },
                })

                // Add to existing refs to avoid duplicate within same batch
                existingRefs.add(ref)
                normalizedExistingRefs.add(normalizedRef)

                results.invoices.push({
                    id: invoice.id,
                    reference: ref,
                    category: resolvedCategory,
                    amountTTC: parsed.amountTTC,
                    amountHT: parsed.amountHT,
                    issuedDate: parsed.issuedDate,
                    dueDate: parsed.dueDate,
                    status,
                    isAvoir: parsed.isAvoir,
                    filename: doc.title,
                    pdf_url: pdfPath,
                })
                results.created++
            } catch (err: any) {
                results.errors.push(`Error processing ${doc.title}: ${err.message}`)
            }
        }

        // Log import
        if (results.created > 0 && !dryRun) {
            await prisma.import_logs.create({
                data: {
                    company_id: company.id,
                    invoice_count: results.created,
                    invoices: results.invoices,
                    source: 'indes-sync',
                    status: 'success',
                },
            })

            runFullReconciliation(company.id).catch(err => console.error('[Indés Recon Error]', err.message))
        }

        return NextResponse.json(results)
    } catch (error: any) {
        console.error('[Indés Sync Error]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// ══════════════════════════════════════════════════════════════════════
// GET /api/automation/indes-sync — Status & token check
// ══════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
    // Auth: either API key or NextAuth session (for UI calls)
    const apiKey = req.headers.get('x-automation-key')
    const session = await getServerSession(authOptions)
    if ((!apiKey || apiKey !== process.env.AUTOMATION_API_KEY) && !session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = process.env.INDES_JWT_TOKEN
    if (!token) {
        return NextResponse.json({
            status: 'not_configured',
            message: 'INDES_JWT_TOKEN manquant dans .env',
        })
    }

    try {
        const parts = token.split('.')
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
        const expiresAt = new Date(payload.exp * 1000)
        const isExpired = expiresAt < new Date()

        const res = await fetch(`${INDES_BASE_URL}/api/user/userInfos`, {
            headers: { 'Authorization': `Bearer ${token}` },
        })

        return NextResponse.json({
            status: isExpired ? 'token_expired' : (res.ok ? 'ok' : 'token_invalid'),
            token_expires: expiresAt.toISOString(),
            token_user: payload.email,
            api_status: res.status,
        })
    } catch {
        return NextResponse.json({ status: 'error', message: 'Invalid token format' })
    }
}
