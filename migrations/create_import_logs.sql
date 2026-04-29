-- Create import_logs table to track automated invoice imports
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  invoice_count INTEGER DEFAULT 0 NOT NULL,
  invoices JSONB DEFAULT '[]'::jsonb, -- Array of {supplier_name, reference, amount_ttc}
  source TEXT DEFAULT 'automation',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_import_logs_company ON import_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_imported_at ON import_logs(imported_at DESC);

-- Enable RLS
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see import logs for their companies
CREATE POLICY "Users can view import logs for their companies"
  ON import_logs
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id 
      FROM company_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service role can insert (for automation)
CREATE POLICY "Service role can insert import logs"
  ON import_logs
  FOR INSERT
  WITH CHECK (true);
