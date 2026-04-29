-- Add unique constraint to suppliers to enable UPSERT
ALTER TABLE public.suppliers 
ADD CONSTRAINT suppliers_company_id_name_key UNIQUE (company_id, name);
