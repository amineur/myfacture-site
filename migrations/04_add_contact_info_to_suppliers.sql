-- Add phone and contact_name columns to suppliers table
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_name TEXT;

-- IBAN and BIC should already exist from migration 03, but ensuring they are there safely
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS iban TEXT;

