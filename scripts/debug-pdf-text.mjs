import pg from 'pg';
import fs from 'fs';
import path from 'path';

const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;

const pdfPath = process.argv[2];
if (!pdfPath) { console.log('Usage: node scripts/debug-pdf-text.mjs <path-to-pdf>'); process.exit(1); }

const buffer = fs.readFileSync(pdfPath);
const data = await pdfParse(buffer);
console.log('=== PDF TEXT ===');
console.log(data.text);
console.log('=== END ===');
