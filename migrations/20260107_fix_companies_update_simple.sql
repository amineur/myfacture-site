-- ============================================================================
-- FIX: Simplify Company Update Policy (No Recursion)
-- Date: 2026-01-07
-- Problem: Previous policy caused infinite recursion by checking company_members
-- Solution: Use ONLY owner_id for updates (simpler, no recursion)
-- ============================================================================

BEGIN;

-- Drop the problematic policy
DROP POLICY IF EXISTS "update_company" ON public.companies;

-- Create a simple, non-recursive policy
-- Only the direct owner can update (no company_members check)
CREATE POLICY "update_company"
ON public.companies
FOR UPDATE
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

COMMIT;
