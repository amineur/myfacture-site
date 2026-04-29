# Dashboard Media App

## Overview
Financial dashboard for Urban Hit radio station. Manages invoices, suppliers, bank transactions, debt tracking, and payment scheduling.

## Tech Stack
- **Framework**: Next.js (App Router) with TypeScript
- **Auth**: NextAuth.js (session-based)
- **DB**: PostgreSQL via Prisma ORM
- **UI**: Tailwind CSS + shadcn/ui components + Lucide icons
- **Date lib**: date-fns with French locale
- **Hosting**: VPS at 83.228.217.205 (facture.urban-hit.fr)
- **Container**: Docker Compose (service: dashboard-media)

## Key Directory Structure
```
app/
  api/
    invoices/           — CRUD invoices (GET list, PATCH bulk status)
    invoices/[id]/      — GET/PATCH single invoice
    indes-invoices/     — GET list (filtered by source=indes-sync)
    indes-invoices/[id]/ — PATCH corrections for needs_review
    automation/indes-sync/ — POST sync, GET token status
    bank-accounts/      — GET bank accounts
    suppliers/          — CRUD suppliers
    qonto/              — Qonto bank integration
  dashboard/            — Main dashboard page
  settings/             — Menu/settings page
  suppliers/            — Supplier list + detail pages
  payments/             — Payment management
  dettes/               — Debt tracking
  indes-sync/           — Les Indes Corporate sync UI
  imports/              — Import history
  situations/           — Monthly debt evolution
  transactions/         — Bank transaction history
components/
  providers/companies-provider.tsx — Global company context
  ui/                   — shadcn components (Button, Card, etc.)
prisma/
  schema.prisma         — DB schema
utils/
  auth.ts               — NextAuth config (authOptions)
  db.ts                 — Prisma client singleton
lib/
  reconciliation.ts     — Bank reconciliation logic
```

## Database Models (key ones)
- **companies** — Legal entities (Urban Hit = first company)
- **invoices** — id, company_id, supplier_id, reference, amount_ttc, amount_ht, issued_date, due_date, payment_date, status (PENDING/PAID), pdf_url, metadata (Json?)
- **suppliers** — id, company_id, name, category, iban, bic, logo_url, metadata (Json?)
- **bank_transactions** — Linked to bank_accounts, for reconciliation
- **debts** — Contract-based debt tracking with monthly payments
- **import_logs** — Tracks automated imports (source, count, status)
- **payments** — Payment records linked to invoices

## Auth
- API routes use `getServerSession(authOptions)` for auth
- Automation endpoints use `x-automation-key` header (env: AUTOMATION_API_KEY = 'dev-key')
- Company context from `useCompanies()` hook (first company = Urban Hit)

## Environment Variables (.env.local)
- DATABASE_URL — PostgreSQL connection string
- NEXTAUTH_SECRET, NEXTAUTH_URL
- AUTOMATION_API_KEY — For automation endpoints
- INDES_JWT_TOKEN — Les Indes Corporate JWT (expires ~30 days)
- QONTO_* — Qonto bank integration credentials
