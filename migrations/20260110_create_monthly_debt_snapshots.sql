-- Migration: Create monthly_debt_snapshots table
-- Date: 2026-01-10
-- Purpose: Store monthly snapshots of debt balances to fix historical calculation issues

CREATE TABLE IF NOT EXISTS monthly_debt_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  month_key TEXT NOT NULL, -- Format: "octobre 2025", "janvier 2026"
  snapshot_date DATE NOT NULL, -- Last day of the month: 2025-10-31, 2025-11-30, etc.
  
  -- Detailed balance breakdown
  total_debt_balance DECIMAL(10, 2) NOT NULL,
  structural_remaining DECIMAL(10, 2) NOT NULL DEFAULT 0,
  current_debt_remaining DECIMAL(10, 2) NOT NULL DEFAULT 0,
  constated_debt_remaining DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure one snapshot per company per month
  UNIQUE(company_id, month_key)
);

-- Index for fast lookups
CREATE INDEX idx_snapshots_company_month ON monthly_debt_snapshots(company_id, month_key);
CREATE INDEX idx_snapshots_date ON monthly_debt_snapshots(snapshot_date DESC);

-- RLS Policies
ALTER TABLE monthly_debt_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can view snapshots for their companies
CREATE POLICY "Users can view their company snapshots"
  ON monthly_debt_snapshots
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- Service role can insert/update snapshots (for cron jobs)
CREATE POLICY "Service role can manage snapshots"
  ON monthly_debt_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE monthly_debt_snapshots IS 'Monthly snapshots of debt balances for historical tracking';
COMMENT ON COLUMN monthly_debt_snapshots.month_key IS 'Human-readable month identifier in French (e.g., "janvier 2026")';
COMMENT ON COLUMN monthly_debt_snapshots.snapshot_date IS 'Last day of the month when snapshot was taken';
COMMENT ON COLUMN monthly_debt_snapshots.total_debt_balance IS 'Total remaining debt balance at end of month';
