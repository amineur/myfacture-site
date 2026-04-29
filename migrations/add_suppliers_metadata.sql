-- Add metadata column to suppliers table to store Qonto beneficiary_id
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
