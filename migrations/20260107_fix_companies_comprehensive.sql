-- ============================================================================
-- COMPREHENSIVE FIX: Clean up all company policies
-- Date: 2026-01-07
-- Problem: Multiple conflicting policies + bug in delete_company
-- ============================================================================

BEGIN;

-- 1. Drop ALL existing policies on companies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.companies;
DROP POLICY IF EXISTS "view_companies" ON public.companies;
DROP POLICY IF EXISTS "create_company" ON public.companies;
DROP POLICY IF EXISTS "update_company" ON public.companies;
DROP POLICY IF EXISTS "delete_company" ON public.companies;

-- 2. Create clean, simple policies (no recursion possible)

-- SELECT: Users can view companies they own OR are members of
CREATE POLICY "view_companies"
ON public.companies
FOR SELECT
USING (
    auth.uid() = owner_id
    OR
    is_member_of(id)
);

-- INSERT: Any authenticated user can create a company
CREATE POLICY "create_company"
ON public.companies
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: Only the owner can update (SIMPLE, NO RECURSION)
CREATE POLICY "update_company"
ON public.companies
FOR UPDATE
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- DELETE: Only the owner can delete
CREATE POLICY "delete_company"
ON public.companies
FOR DELETE
USING (auth.uid() = owner_id);

COMMIT;
