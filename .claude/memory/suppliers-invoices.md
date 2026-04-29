# Suppliers & Invoices

## Key Suppliers
- **Les Indes Radios** — Main platform supplier (auto-synced invoices)
- **TF1 Publicite** — Advertising invoices via Les Indes
- **Indes Digital** — Digital services
- **VT Consult** — Consulting services (issued_date corrections done 2026-04)
- **TowerCast** — Broadcast infrastructure (duplicate invoice 0000048240 flagged for deletion)
- **Saooti** — Podcast platform (KPI/Historique inconsistency fixed 2026-04)
- **Qonto** — Bank account integration

## Invoice Status Flow
- PENDING → PAID (manual or auto when due_date passes for Les Indes invoices)
- Amounts stored as Decimal(10,2) in PostgreSQL
- Serialization: always Number() for API responses

## Known Issues / Past Fixes
- pdf-parse v2.x incompatible — must use v1.1.1
- Old format PDF accented months: regex needs broad char class [a-zA-ZéèêëàâäùûüôöîïçÉÈÊÀÂÔÎÇ]+
- Old format amounts: parse "Net a deduire" line, first=TTC, third=HT
- Description cleaning: strip embedded amounts with /\d+,\d{2}\s*[€%]?\s*/g

## Pending Items (as of 2026-04-29)
- Delete duplicate invoice 0000048240 from TowerCast
- Populate TVA numbers: POST /api/suppliers/populate-tva
- Delete app/manifest.ts
- Remove _debug field from automation API
