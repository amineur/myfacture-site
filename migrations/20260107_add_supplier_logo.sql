-- Migration: Add logo_url to suppliers table
-- Date: 2026-01-07

ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.suppliers.logo_url IS 'URL to supplier logo image';
