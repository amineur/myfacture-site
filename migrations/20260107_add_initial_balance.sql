
-- Migration: Add Initial Balance to Companies
-- Date: 2026-01-07

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS initial_balance DECIMAL(12,2) DEFAULT 0.00;
