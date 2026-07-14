-- This script runs only when the PostgreSQL data volume is first initialized.
SELECT 'CREATE DATABASE fastify_auth_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fastify_auth_test')\gexec
