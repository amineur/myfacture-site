-- Create bank_accounts table
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  bank_type TEXT NOT NULL,
  balance NUMERIC(15, 2) DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS (standard practice, though explicit policy might be needed later)
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

-- Create policy for full access (temp / dev) or specific
-- For now, allow authenticated users to read available accounts
CREATE POLICY "Allow read access for authenticated users" ON bank_accounts
  FOR SELECT TO authenticated USING (true);
