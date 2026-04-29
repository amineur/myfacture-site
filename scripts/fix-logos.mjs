import pg from 'pg';
const c = new pg.Client({connectionString:'postgresql://dashboard_user:DH5-q8-Zp-K9t-2026@localhost:5433/dashboard_media'});
await c.connect();

const logo = await c.query("SELECT logo_url FROM suppliers WHERE name = 'Indes - Cotisation'");
const logoUrl = logo.rows[0]?.logo_url;
if (!logoUrl) { console.log('Pas de logo trouvé sur Indes - Cotisation'); await c.end(); process.exit(); }

console.log('Logo:', logoUrl);
const r = await c.query("UPDATE suppliers SET logo_url = $1 WHERE name LIKE 'Indes -%' AND (logo_url IS NULL OR logo_url != $1)", [logoUrl]);
console.log('Fournisseurs mis à jour:', r.rowCount);
await c.end();
