// Check if there are 2025 invoices on Les Indés Corporate
const TOKEN = process.env.INDES_JWT_TOKEN;
if (!TOKEN) { console.log('Set INDES_JWT_TOKEN env var'); process.exit(1); }

const RADIO_ID = '3934864599684677758';
const SECTION_ID = '4129498607212560412'; // "Vos dernières factures"

const res = await fetch(`https://lesindescorporate.fr/api/content/mydocs/${RADIO_ID}`, {
  headers: { 'Authorization': `Bearer ${TOKEN}` },
});
const tree = await res.json();

function findSection(nodes, targetId) {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    if (node.subList) {
      const found = findSection(node.subList, targetId);
      if (found) return found;
    }
  }
  return null;
}

const section = findSection(tree, SECTION_ID);
if (!section || !section.subList) { console.log('Section not found'); process.exit(1); }

const allPdfs = section.subList.filter(d => d.title && d.title.toLowerCase().endsWith('.pdf'));
console.log(`Total PDFs: ${allPdfs.length}`);

// Group by year from filename
const byYear = {};
allPdfs.forEach(d => {
  const m = d.title.match(/_(\d{4})/);
  const year = m ? m[1] : 'unknown';
  if (!byYear[year]) byYear[year] = [];
  byYear[year].push(d.title);
});

Object.keys(byYear).sort().forEach(year => {
  console.log(`${year}: ${byYear[year].length} PDFs`);
});

// Show 2025 ones specifically
if (byYear['2025']) {
  console.log('\n2025 PDFs:');
  byYear['2025'].forEach(t => console.log('  ' + t));
} else {
  console.log('\nNo 2025 PDFs found in filenames.');
  // Check for old format (no year in filename)
  const unknown = byYear['unknown'] || [];
  console.log(`\n${unknown.length} PDFs without year in filename (old format):`);
  unknown.slice(0, 10).forEach(t => console.log('  ' + t));
}
