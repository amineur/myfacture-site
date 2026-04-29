-- Add start_date and first_unpaid_invoice_id to current_debts
ALTER TABLE public.current_debts
ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS first_unpaid_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

-- Index for date queries
CREATE INDEX IF NOT EXISTS idx_current_debts_start_date ON public.current_debts(start_date);
