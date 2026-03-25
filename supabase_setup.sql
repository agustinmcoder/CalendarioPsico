-- =====================================================
-- PASO 1: Pegar este SQL en Supabase > SQL Editor > New query > Run
-- =====================================================

-- Tablas
CREATE TABLE IF NOT EXISTS patients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE,
  frequency TEXT CHECK (frequency IN ('weekly', 'biweekly')),
  session_price DECIMAL(10,2) DEFAULT 0,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_history (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT REFERENCES patients(id) ON DELETE SET NULL,
  title TEXT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  is_personal BOOLEAN DEFAULT FALSE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_type TEXT CHECK (recurrence_type IN ('weekly', 'biweekly')),
  recurrence_end_date DATE,
  parent_session_id BIGINT REFERENCES sessions(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  session_id BIGINT REFERENCES sessions(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seguridad: solo usuarios autenticados pueden acceder a los datos
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_autenticados" ON patients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solo_autenticados" ON clinical_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solo_autenticados" ON sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "solo_autenticados" ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Función para resumen mensual de pagos
CREATE OR REPLACE FUNCTION get_monthly_summary(p_patient_id BIGINT)
RETURNS TABLE(month TEXT, total_billed NUMERIC, total_paid NUMERIC, total_pending NUMERIC, session_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    TO_CHAR(COALESCE(s.start_datetime, py.created_at), 'YYYY-MM') AS month,
    SUM(py.amount) AS total_billed,
    SUM(CASE WHEN py.status = 'paid' THEN py.amount ELSE 0 END) AS total_paid,
    SUM(CASE WHEN py.status = 'pending' THEN py.amount ELSE 0 END) AS total_pending,
    COUNT(py.id)::BIGINT AS session_count
  FROM payments py
  LEFT JOIN sessions s ON py.session_id = s.id
  WHERE py.patient_id = p_patient_id
  GROUP BY TO_CHAR(COALESCE(s.start_datetime, py.created_at), 'YYYY-MM')
  ORDER BY month DESC;
END;
$$;
