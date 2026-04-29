-- Add payment_date column to invoices table
-- This will store the real payment date from CSV "Date paiement réelle"
-- while issued_date will keep the original invoice date

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_date DATE;

-- Add comment for documentation
COMMENT ON COLUMN invoices.payment_date IS 'Real payment date from CSV "Date paiement réelle" for PAID invoices';
