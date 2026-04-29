
-- Add IBAN and BIC to suppliers table
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bic TEXT;
