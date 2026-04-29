-- ============================================================================
-- CREATE: current_debts table for dynamic debt tracking
-- Date: 2026-01-07
-- Purpose: Track current debts (without payment schedule) based on unpaid invoices
-- ============================================================================

BEGIN;

-- Create current_debts table
CREATE TABLE IF NOT EXISTS public.current_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED')),
    triggered_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    initial_unpaid_count INTEGER NOT NULL,
    initial_unpaid_total DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_current_debts_company_supplier 
    ON public.current_debts(company_id, supplier_id, status);

CREATE INDEX IF NOT EXISTS idx_current_debts_triggered_at 
    ON public.current_debts(triggered_at DESC);

-- Enable RLS
ALTER TABLE public.current_debts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same pattern as other tables)
CREATE POLICY "view_current_debts"
ON public.current_debts
FOR SELECT
USING (
    auth.uid() IN (
        SELECT owner_id FROM public.companies WHERE id = company_id
    )
    OR
    public.is_member_of(company_id)
);

CREATE POLICY "manage_current_debts"
ON public.current_debts
FOR ALL
USING (
    auth.uid() IN (
        SELECT owner_id FROM public.companies WHERE id = company_id
    )
    OR
    public.is_member_of(company_id)
)
WITH CHECK (
    auth.uid() IN (
        SELECT owner_id FROM public.companies WHERE id = company_id
    )
    OR
    public.is_member_of(company_id)
);

COMMIT;
