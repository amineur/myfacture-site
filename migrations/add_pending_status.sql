-- Add EN_ATTENTE status to invoice_status enum
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'EN_ATTENTE';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'PENDING';
