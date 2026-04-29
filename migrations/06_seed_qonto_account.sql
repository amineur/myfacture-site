-- Insert the Qonto Account with the user provided IBAN
INSERT INTO bank_accounts (name, bank_type, metadata)
VALUES (
  'Compte Qonto',
  'QONTO',
  '{"iban": "FR7616958000016598537041348"}'::jsonb
);
