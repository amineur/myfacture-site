-- Dashboard Media — PostgreSQL Init Script
-- Idempotent: safe to run multiple times
-- Run this on your VPS PostgreSQL BEFORE the first docker compose up

-- ─── Create database (idempotent) ────────────────────────────────────────────
SELECT 'CREATE DATABASE dashboard_media'
  WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'dashboard_media'
  )\gexec

-- ─── Create user (idempotent) ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dashboard_user') THEN
    CREATE USER dashboard_user WITH ENCRYPTED PASSWORD 'DH5-q8-Zp-K9t-2026';
    RAISE NOTICE 'User dashboard_user created.';
  ELSE
    RAISE NOTICE 'User dashboard_user already exists, skipping.';
  END IF;
END
$$;

-- Grant database access
GRANT ALL PRIVILEGES ON DATABASE dashboard_media TO dashboard_user;

-- ─── Connect to the database ─────────────────────────────────────────────────
\c dashboard_media

-- ─── Schema permissions ──────────────────────────────────────────────────────
GRANT ALL ON SCHEMA public TO dashboard_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dashboard_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dashboard_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO dashboard_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO dashboard_user;

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Next steps ───────────────────────────────────────────────────────────────
-- Tables are created automatically by Prisma at container startup (prisma db push).
-- After this script, just run:
--   docker compose up -d --build
-- The entrypoint.sh will handle the schema creation.
