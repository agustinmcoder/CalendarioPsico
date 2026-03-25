-- Ejecutar en Supabase > SQL Editor > New query > Run
ALTER TABLE patients ADD COLUMN IF NOT EXISTS pyc BOOLEAN DEFAULT FALSE;
