
-- 1. Create Bank Accounts Table
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    bank_type TEXT CHECK (bank_type IN ('QONTO', 'CREDIT_MUTUEL', 'OTHER')),
    balance NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'EUR',
    last_sync_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS on bank_accounts
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view bank accounts" ON bank_accounts FOR SELECT USING (true); -- Simplify for now, or auth.uid() if user specific

-- 3. Seed Default Qonto Account
INSERT INTO bank_accounts (name, bank_type) 
SELECT 'Compte Qonto', 'QONTO'
WHERE NOT EXISTS (SELECT 1 FROM bank_accounts WHERE bank_type = 'QONTO');

-- 4. Rename Transactions Table
-- Note: 'qonto_transactions' -> 'bank_transactions'
-- We use IF EXISTS to be safe, but renaming validation is tricky in single script if strictly checked.
-- Assuming qonto_transactions exists based on check.
ALTER TABLE qonto_transactions RENAME TO bank_transactions;

-- 5. Add Account ID column
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES bank_accounts(id);

-- 6. Link existing transactions to the Qonto Account
UPDATE bank_transactions 
SET account_id = (SELECT id FROM bank_accounts WHERE bank_type = 'QONTO' LIMIT 1)
WHERE account_id IS NULL;

-- 7. Rename specific columns if needed?
-- qonto_id -> external_id ?
-- For now keep qonto_id or genericize. Let's genericize.
ALTER TABLE bank_transactions RENAME COLUMN qonto_id TO external_id;

-- 8. Add status/side constraints if missing?
-- Existing table likely has loose text. We leave as is.

-- 9. Enable RLS on bank_transactions (if not already)
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view transactions" ON bank_transactions FOR SELECT USING (true);
