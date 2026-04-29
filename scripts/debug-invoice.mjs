import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const search = process.argv[2] || '1610017';
// Search in reference OR metadata
const res = await client.query(`
  SELECT reference, amount_ttc, amount_ht, issued_date, metadata->>'category' as category
  FROM invoices
  WHERE reference LIKE $1
     OR metadata->>'category' ILIKE $1
  ORDER BY issued_date DESC
`, [`%${search}%`]);
console.log(`Found ${res.rows.length} invoices:`);
console.log(JSON.stringify(res.rows, null, 2));
await client.end();
