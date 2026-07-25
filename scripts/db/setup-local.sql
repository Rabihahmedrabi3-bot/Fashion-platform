-- Local Postgres setup for fashion-platform.
--
-- Run this once against your existing local Postgres instance, as a
-- superuser (e.g. the `postgres` role):
--
--   psql -U postgres -f scripts/db/setup-local.sql
--
-- Edit the password below before running, then put the resulting
-- connection strings into services/backend-api/.env (copy from .env.example).
-- This script is idempotent - safe to re-run.

DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'fashion_platform_app') THEN
      CREATE ROLE fashion_platform_app WITH LOGIN PASSWORD 'changeme';
   END IF;
END
$$;

SELECT 'CREATE DATABASE fashion_platform_dev OWNER fashion_platform_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fashion_platform_dev')
\gexec

SELECT 'CREATE DATABASE fashion_platform_test OWNER fashion_platform_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fashion_platform_test')
\gexec

GRANT ALL PRIVILEGES ON DATABASE fashion_platform_dev TO fashion_platform_app;
GRANT ALL PRIVILEGES ON DATABASE fashion_platform_test TO fashion_platform_app;
