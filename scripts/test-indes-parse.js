const pdfParse = require('pdf-parse');
const fs = require('fs');

function parseFrenchNumber(str) {
    return parseFloat(str.replace(/\s/g, '').replace(',', '.'));
}

const MONTHS = {
    'janv':'01','jan':'01','févr':'02','fév':'02','feb':'02',
    'mars':'03','mar':'03','avr':'04','apr':'04',
    'mai':'05','may':'05','juin':'06','jun':'06',
    'juil':'07','jul':'07','août':'08','aug':'08',
    'sept':'09','sep':'09','oct':'10',
    'nov':'11','déc':'12','dec':'12',
};

const KNOWN_CATEGORIES = [
    'Hébergement Scaleway', 'Incidents de diffusion', 'Frais de gestion',
    'Cotisation', 'Redevance', 'Reversement', 'Commission',
    'Frais techniques', 'Streaming', 'Webradio', 'Frais de diffusion',
    'Frais de régie', 'Contribution', 'Refacturation',
];

function parseInvoicePdfText(text) {
    const result = {
        reference: null, issuedDate: null, dueDate: null, emissionDate: null,
        amountHT: null, amountTTC: null, category: null, description: null,
        isAvoir: false, paymentMode: null,
    };

    result.isAvoir = /\bAvoir\b/i.test(text);

    // Reference
    let refMatch = text.match(/N°\s*F?_?(\d{8,})/i);
    if (refMatch === null) {
        refMatch = text.match(/(?:Numéro|Référence)\s*\n?\s*([A-Z]{1,3}\d{4,})/i);
    }
    if (refMatch) result.reference = refMatch[1];

    // Date new format
    const dateMatch = text.match(/\bDATE\s*:\s*(\d{2}-\d{2}-\d{4})/i);
    if (dateMatch) {
        const [d, m, y] = dateMatch[1].split('-');
        result.issuedDate = `${y}-${m}-${d}`;
    }

    // Date old format - broad char class for accented month names
    if (result.issuedDate === null) {
        const oldDateMatch = text.match(/(\d{1,2})\s+([a-zA-ZéèêëàâäùûüôöîïçÉÈÊÀÂÔÎÇ]+)\.?\s+(\d{4})/);
        if (oldDateMatch) {
            const day = oldDateMatch[1].padStart(2, '0');
            const monthKey = oldDateMatch[2].toLowerCase().replace('.','');
            const month = MONTHS[monthKey] || '01';
            result.issuedDate = `${oldDateMatch[3]}-${month}-${day}`;
        }
    }

    // Emission date
    const emissionMatch = text.match(/DATE\s+D['\u2019']?ÉMISSION\s*:\s*(\d{2}-\d{2}-\d{4})/i);
    if (emissionMatch) {
        const [d, m, y] = emissionMatch[1].split('-');
        result.emissionDate = `${y}-${m}-${d}`;
    }

    // Due date new format
    const dueMatch = text.match(/DATE\s+D['\u2019']?ÉCHÉANCE\s*:\s*(\d{2}-\d{2}-\d{4})/i);
    if (dueMatch) {
        const [d, m, y] = dueMatch[1].split('-');
        result.dueDate = `${y}-${m}-${d}`;
    }

    // Due date old format: "le 15/12/16" anywhere
    if (result.dueDate === null) {
        const oldDueMatch = text.match(/le\s+(\d{2})\/(\d{2})\/(\d{2,4})/i);
        if (oldDueMatch) {
            const day = oldDueMatch[1], month = oldDueMatch[2];
            let year = oldDueMatch[3];
            if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year;
            result.dueDate = `${year}-${month}-${day}`;
        }
    }

    // Amounts: TTC
    const ttcMatch = text.match(/(?:TOTAL\s+TTC|NET\s+[ÀA]\s+PAYER)\s*\n?\s*([\d\s]+,\d{2})/i);
    if (ttcMatch) {
        result.amountTTC = parseFrenchNumber(ttcMatch[1]);
    }

    // Old format: columns are scrambled — headers on one line, amounts on next
    // "Net à déduire €Total TVA 20%Total HT €"
    // "55,13 €9,19 €45,94 €"
    // Strategy: find the amounts-line (multiple "XX,XX €" values), parse all amounts,
    // then first = TTC (Net à déduire), last = HT (Total HT)
    if (result.amountTTC === null) {
        const amountsLineMatch = text.match(/(?:Net\s+[àa]\s+d[ée]duire|Montant\s+TTC)[^]*?\n([\d,.\s€]+€)/i);
        if (amountsLineMatch) {
            const amountsLine = amountsLineMatch[1];
            const amounts = [...amountsLine.matchAll(/([\d\s]+,\d{2})\s*€/g)]
                .map(m => parseFrenchNumber(m[1]));
            if (amounts.length >= 1) result.amountTTC = amounts[0]; // first = TTC
            if (amounts.length >= 3) result.amountHT = amounts[2];  // third = HT
            else if (amounts.length >= 2) result.amountHT = amounts[amounts.length - 1]; // last = HT
        }
    }

    // Amounts: HT (new format)
    if (result.amountHT === null) {
        const htMatch = text.match(/TOTAL\s+HT\s*€?\s*\n?\s*([\d\s]+,\d{2})/i);
        if (htMatch) result.amountHT = parseFrenchNumber(htMatch[1]);
    }

    // Avoir → negative
    if (result.isAvoir) {
        if (result.amountTTC > 0) result.amountTTC = -result.amountTTC;
        if (result.amountHT > 0) result.amountHT = -result.amountHT;
    }

    // Category
    for (const cat of KNOWN_CATEGORIES) {
        if (text.includes(cat)) { result.category = cat; break; }
    }
    if (result.category === null) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const desigIdx = lines.findIndex(l => /D[ÉE]SIGNATION/i.test(l));
        if (desigIdx > 0) {
            for (let i = desigIdx - 1; i >= Math.max(0, desigIdx - 3); i--) {
                const line = lines[i];
                if (/(?:SIRET|TVA|France|Versailles|Chantiers|ADRESSE|FACTURATION|URBAN|EUROMEDMULTIMEDIA|Quantit)/i.test(line)) continue;
                if (line.length > 5 && line.length < 80 && /^\d/.test(line) === false && /^N°/.test(line) === false) {
                    result.category = line; break;
                }
            }
        }
    }

    // Description
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const desigIdx = lines.findIndex(l => /D[ÉE]SIGNATION/i.test(l));
    if (desigIdx >= 0) {
        for (let i = desigIdx + 1; i < Math.min(desigIdx + 5, lines.length); i++) {
            const line = lines[i];
            if (/^QT[ÉE]|^PU|^TVA|^TOTAL|^BASE|^Mode/i.test(line)) continue;
            if (line.length > 10) {
                let cleaned = line
                    .replace(/^[\d,.\s]+(?:€\s*)?/g, '')    // leading numbers
                    .replace(/\d+,\d{2}\s*[€%]?\s*/g, '')   // embedded amounts
                    .replace(/\d+,\d{2}/g, '')               // remaining numbers
                    .trim();
                if (cleaned.length > 5) { result.description = cleaned; break; }
            }
        }
    }

    // Payment mode
    const paymentMatch = text.match(/Mode\s+de\s+(?:paiement|règlement)\s*:\s*\n?\s*(.+)/i);
    if (paymentMatch) {
        const mode = paymentMatch[1].trim();
        if (mode.length > 3 && /^\d/.test(mode) === false) result.paymentMode = mode;
    }

    return result;
}

async function test(file, label) {
    const buf = fs.readFileSync(file);
    const data = await pdfParse(buf);
    const parsed = parseInvoicePdfText(data.text);
    console.log(`=== ${label} ===`);
    console.log(JSON.stringify(parsed, null, 2));
    console.log('');
}

(async () => {
    await test('/sessions/busy-clever-galileo/mnt/uploads/urban-hit_20260402619_2026-04-19 (2).pdf', 'NEW FORMAT');
    await test('/sessions/busy-clever-galileo/mnt/uploads/urban-hit_fr000146.pdf', 'OLD FORMAT');
})().catch(e => console.log('Error:', e.message, e.stack));
