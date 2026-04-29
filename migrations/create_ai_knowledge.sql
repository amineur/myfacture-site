-- Create ENUM for knowledge types
DROP TYPE IF EXISTS knowledge_type CASCADE;
CREATE TYPE knowledge_type AS ENUM ('ALIAS', 'BUSINESS_RULE', 'USER_PREFERENCE', 'CORRECTION', 'FACT');

-- Create ai_knowledge table
CREATE TABLE IF NOT EXISTS ai_knowledge (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    type knowledge_type NOT NULL,
    confidence FLOAT DEFAULT 1.0,
    context TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE ai_knowledge ENABLE ROW LEVEL SECURITY;

-- Create policy to allow full access (since this is an internal tool for now)
-- In a real multi-tenant app, we would scope this by company_id or user_id
CREATE POLICY "Enable all access for authenticated users" ON ai_knowledge
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create index for faster lookups by key
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_key ON ai_knowledge(key);

-- Create index for filtering by type
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_type ON ai_knowledge(type);

-- Grant permissions (adjust based on your roles)
GRANT ALL ON ai_knowledge TO authenticated;
GRANT ALL ON ai_knowledge TO service_role;
