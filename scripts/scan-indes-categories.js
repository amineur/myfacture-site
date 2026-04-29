/**
 * Scan a sample of Les Indés invoices to discover all categories.
 * Run: INDES_TOKEN="..." node scripts/scan-indes-categories.js
 */
const pdfParse = require('pdf-parse');

const BASE = 'https://lesindescorporate.fr';
const RADIO_ID = '3934864599684677758';
const TOKEN = process.env.INDES_TOKEN;

if (!TOKEN) {
    console.error('Usage: INDES_TOKEN="eyJ..." node scripts/scan-indes-categories.js');
    process.exit(1);
}

async function fetchJson(url) {
    const res = await fetch(`${BASE}${url}`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
}

async function fetchPdfText(url) {
    const res = await fetch(`${BASE}${url}`, {
        headers: { 'Authorization': `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const data = await pdfParse(buf);
    return data.text;
}

function extractCategory(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Look for category line before DÉSIGNATION
    const desigIdx = lines.findIndex(l => /D[ÉE]SIGNATION/i.test(l));
    if (desigIdx > 0) {
        for (let i = desigIdx - 1; i >= Math.max(0, desigIdx - 3); i--) {
            const line = lines[i];
            if (/(?:SIRET|TVA|France|Versailles|Chantiers|ADRESSE|FACTURATION|URBAN|EUROMEDMULTIMEDIA|Quantit|Montant|Prix)/i.test(line)) continue;
            if (line.length > 5 && line.length < 100 && !/^\d/.test(line) && !/^N°/.test(line)) {
                return line;
            }
        }
    }

    // Fallback: look for known patterns
    const known = [
        'Hébergement Scaleway', 'Incidents de diffusion', 'Frais de gestion',
        'Cotisation', 'Redevance', 'Reversement', 'Commission',
        'Frais techniques', 'Streaming', 'Webradio', 'Frais de diffusion',
        'Frais de régie', 'Contribution', 'Refacturation', 'Provision',
        'Abonnement', 'Maintenance', 'Licence',
    ];
    for (const k of known) {
        if (text.includes(k)) return k;
    }

    return null;
}

function extractType(text) {
    if (/\bAvoir\b/i.test(text)) return 'AVOIR';
    if (/\bFacture\b/i.test(text)) return 'FACTURE';
    return 'UNKNOWN';
}

(async () => {
    console.log('Fetching document tree...');
    const tree = await fetchJson(`/api/content/mydocs/${RADIO_ID}`);

    function findById(items, id) {
        for (const item of items) {
            if (item.id === id) return item;
            if (item.subList) { const f = findById(item.subList, id); if (f) return f; }
        }
        return null;
    }

    const section = findById(tree, '4129498607212560412');
    const docs = (section.subList || []).filter(d => d.url && d.title.toLowerCase().endsWith('.pdf'));
    console.log(`Found ${docs.length} PDFs. Sampling ~30 across the full range...\n`);

    // Sample evenly across the list
    const step = Math.max(1, Math.floor(docs.length / 30));
    const indices = [];
    for (let i = 0; i < docs.length; i += step) indices.push(i);
    // Also add first/last few
    indices.push(0, 1, 2, docs.length - 1, docs.length - 2, docs.length - 3);
    const unique = [...new Set(indices)].sort((a, b) => a - b).filter(i => i >= 0 && i < docs.length);

    const categories = {};
    const types = { FACTURE: 0, AVOIR: 0, UNKNOWN: 0 };
    let errors = 0;

    for (const idx of unique) {
        const doc = docs[idx];
        try {
            const text = await fetchPdfText(doc.url);
            const cat = extractCategory(text);
            const type = extractType(text);
            types[type]++;
            const key = cat || 'UNKNOWN';
            if (!categories[key]) categories[key] = { count: 0, examples: [] };
            categories[key].count++;
            if (categories[key].examples.length < 2) {
                categories[key].examples.push(doc.title);
            }
            process.stdout.write(`[${idx}/${docs.length}] ${type} | ${key} | ${doc.title}\n`);
        } catch (e) {
            errors++;
            process.stdout.write(`[${idx}] ERROR: ${e.message} | ${doc.title}\n`);
        }
    }

    console.log('\n========== RÉSULTATS ==========');
    console.log(`\nTypes: ${JSON.stringify(types)}`);
    console.log(`Errors: ${errors}`);
    console.log(`\nCatégories trouvées (${Object.keys(categories).length}):`);
    const sorted = Object.entries(categories).sort((a, b) => b[1].count - a[1].count);
    for (const [cat, info] of sorted) {
        console.log(`  - "${cat}" (${info.count}x) ex: ${info.examples[0]}`);
    }
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
