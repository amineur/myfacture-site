# Les Indes Corporate Integration

## Overview
Les Indes Corporate (lesindescorporate.fr) is a platform for French independent radio stations. They manage invoicing, revenue sharing, and technical services. Urban Hit receives invoices through this platform that are automatically deducted from their revenue.

## API
- **Base URL**: https://lesindescorporate.fr
- **Auth**: Bearer JWT token (stored in env INDES_JWT_TOKEN)
- **Token source**: localStorage key "authorizationTokenFront" on lesindescorporate.fr
- **Token expiry**: ~30 days
- **Backend**: Firebase (lir-extranet-cefec.firebaseio.com)

### Endpoints used
- `GET /api/content/mydocs/{radioId}` — Document tree (invoices, contracts, etc.)
- `GET /api/user/userInfos` — Current user info (to verify token)

### Radio IDs
- **Urban Hit**: 3934864599684677758 (the one we use)
- France Maghreb 2: 3934864599684677663 (NOT the target)

### Document Sections
- "Vos dernieres factures" ID: 4129498607212560412 (228 PDFs)
- "TF1 Publicite" ID: 4238596286370021766 (425 docs)
- "Indes Digital" ID: 4025544538513735718 (32 docs)
- "Releves mensuels" ID: 4025544538513735720 (113 docs)

## PDF Parsing
Two invoice formats exist:

### New format (2026+)
- Structured fields: N F_20260402619, DATE : 19-04-2026, DATE D EMISSION, DATE D ECHEANCE
- Clean amounts: TOTAL TTC / TOTAL HT on separate lines
- Category line before DESIGNATION header

### Old format (2016-era)
- Scrambled PDF columns (headers and values merge)
- Date: "15 dec. 2016" (accented month names)
- Due date: "le 15/12/16" standalone in text
- Amounts: "Net a deduire" line followed by merged "55,13 €9,19 €45,94 €"
- First amount = TTC, third = HT

### Known Invoice Categories
Hebergement Scaleway, Incidents de diffusion, Frais de gestion, Cotisation, Redevance, Reversement, Commission, Frais techniques, Streaming, Webradio, Frais de diffusion, Frais de regie, Contribution, Refacturation

## Business Logic
- **Due date = payment date** — invoices are automatically deducted from revenue at due date
- If `dueDate <= now` → status = PAID
- Invoices with "Avoir" in text → credit notes (negative amounts)
- `needs_review` flag when: category missing, amount missing, or date missing
- Metadata stored: source, category, description, is_avoir, payment_mode, original_filename, needs_review, review_reasons

## Sync API Route
`POST /api/automation/indes-sync` with body: `{ limit, dryRun, section }`
- Sections: factures (default), tf1, digital, releves
- Dedup by reference (normalized: strip F_ prefix + leading zeros)
- Uses pdf-parse v1.1.1 (v2.x has breaking API changes)
