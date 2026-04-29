export class DbSchemaService {
    static async getTables(): Promise<string[]> {
        return [
            'invoices',
            'bank_transactions',
            'suppliers',
            'companies',
            'debts',
            'payments',
            'import_logs',
            'ai_knowledge'
        ];
    }

    static async getTableSchemas(tables: string[]): Promise<string> {
        const schemas: Record<string, string> = {
            'invoices': `
- id (uuid)
- reference (text)
- supplier_id (uuid) -> suppliers.id
- amount_ttc (numeric)
- amount_ht (numeric)
- issued_date (date)
- due_date (date)
- status (text) [PENDING, OPEN, PAID, LATE, DEBT]
- pdf_url (text)
- payment_date (date)
- created_at (timestamp)
`,
            'bank_transactions': `
- id (uuid)
- amount (numeric)
- side (text) [DEBIT, CREDIT]
- label (text)
- status (text) [completed, pending, declined]
- date (timestamp)
- raw_data (jsonb) --> CONTAINS IMPORTANT FIELDS:
    - 'Settled balance' (Current Bank Balance AFTER this transaction)
    - 'Reference'
    - 'Operation type' [Card payment, Transfer, Direct debit...]
    - 'Counterparty name'
- invoice_id (uuid) -> invoices.id
`,
            'suppliers': `
- id (uuid)
- name (text)
- vat_number (text)
- category (text)
- email (text)
- website (text)
- logo_url (text)
`,
            'companies': `
- id (uuid)
- name (text)
- handle (text)
- owner_id (uuid)
- initial_balance (numeric)
`,
            'debts': `
- id (uuid)
- supplier_id (uuid)
- total_amount (numeric)
- remaining_amount (numeric)
- monthly_amount (numeric)
- start_date (date)
- end_date (date)
- status (text) [active, paid]
- contract_ref (text)
`,
            'payments': `
- id (uuid)
- supplier_id (uuid)
- invoice_id (uuid)
- amount (numeric)
- payment_date (date)
- payment_method (text)
- notes (text)
`,
            'import_logs': `
- id (uuid)
- imported_at (timestamp)
- invoice_count (int)
- invoices (jsonb)
- source (text) [EMAIL, MANUAL]
- status (text) [SUCCESS, PARTIAL, ERROR]
- error (text)
`,
            'ai_knowledge': `
- key (text)
- value (text)
- type (text) [ALIAS, RULE, FACT]
- confidence (numeric)
`
        };

        let output = '';
        for (const table of tables) {
            if (schemas[table]) {
                output += `Table '${table}':${schemas[table]}\n`;
            }
        }

        output += `\n(HELPER VIEW) v_suppliers_spend:\n- supplier_name, total_spend, total_paid, total_due, invoices_count\n`;
        return output;
    }
}
