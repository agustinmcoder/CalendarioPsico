-- Ejecutar en Supabase > SQL Editor > New query > Run
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_frequency_check;
ALTER TABLE patients ADD CONSTRAINT patients_frequency_check
  CHECK (frequency IN ('weekly', 'biweekly', 'on_demand'));
