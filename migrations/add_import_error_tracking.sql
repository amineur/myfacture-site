-- Add status and error tracking to import_logs
ALTER TABLE import_logs 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'success',
ADD COLUMN IF NOT EXISTS error TEXT;

-- Create index for filtering by status
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status);
