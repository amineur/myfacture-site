-- ============================================================================
-- FIX: Allow Company Updates via Owner ID
-- Date: 2026-01-07
-- Problem: The previous policy relied solely on `company_members`. If that table
-- is out of sync or empty, the owner cannot update their company.
-- Solution: Add a direct check on `companies.owner_id`.
-- ============================================================================

BEGIN;

-- Drop the restrictive policy
DROP POLICY IF EXISTS "update_company" ON public.companies;

-- Create a more robust policy
CREATE POLICY "update_company"
ON public.companies
FOR UPDATE
USING (
  -- 1. Direct Ownership Check (Fallback)
  auth.uid() = owner_id
  OR
  -- 2. Membership Check (Standard)
  EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = id
    AND user_id = auth.uid()
    AND role IN ('OWNER', 'ADMIN')
  )
);

COMMIT;
