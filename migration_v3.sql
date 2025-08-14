-- MIGRACIÓN v3 - Solo agregar lo que falta sin duplicar
-- Ejecutar solo si no existe

-- Agregar tipo Mixto al enum existente (solo si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'Mixto') THEN
        ALTER TYPE pay_enum ADD VALUE 'Mixto';
    END IF;
END $$;

-- Agregar campos a tabla sales (solo si no existen)
DO $$ 
BEGIN
    -- Verificar si cash_amount no existe y agregarlo
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'cash_amount') THEN
        ALTER TABLE sales ADD COLUMN cash_amount integer NOT NULL DEFAULT 0;
    END IF;
    
    -- Verificar si transfer_amount no existe y agregarlo
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'transfer_amount') THEN
        ALTER TABLE sales ADD COLUMN transfer_amount integer NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Crear tabla employees (solo si no existe)
CREATE TABLE IF NOT EXISTS employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  daily_salary integer not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Crear tabla activity_log (solo si no existe)
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time not null,
  action text not null,
  table_name text not null,
  record_id uuid,
  details jsonb,
  created_by uuid,
  created_at timestamptz default now()
);

-- Crear tabla weekly_expenses (solo si no existe)
CREATE TABLE IF NOT EXISTS weekly_expenses (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  concept text not null,
  amount integer not null check (amount >= 0),
  attributed_to text,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

-- Habilitar RLS en nuevas tablas
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_expenses ENABLE ROW LEVEL SECURITY;

-- Políticas para employees
DROP POLICY IF EXISTS select_all_employees ON employees;
DROP POLICY IF EXISTS insert_auth_employees ON employees;
DROP POLICY IF EXISTS update_auth_employees ON employees;
CREATE POLICY select_all_employees ON employees FOR SELECT USING (true);
CREATE POLICY insert_auth_employees ON employees FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY update_auth_employees ON employees FOR UPDATE USING (auth.role() = 'authenticated');

-- Políticas para activity_log
DROP POLICY IF EXISTS select_all_activity_log ON activity_log;
DROP POLICY IF EXISTS insert_auth_activity_log ON activity_log;
CREATE POLICY select_all_activity_log ON activity_log FOR SELECT USING (true);
CREATE POLICY insert_auth_activity_log ON activity_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Políticas para weekly_expenses
DROP POLICY IF EXISTS select_all_weekly_expenses ON weekly_expenses;
DROP POLICY IF EXISTS insert_auth_weekly_expenses ON weekly_expenses;
DROP POLICY IF EXISTS update_auth_weekly_expenses ON weekly_expenses;
DROP POLICY IF EXISTS delete_auth_weekly_expenses ON weekly_expenses;
CREATE POLICY select_all_weekly_expenses ON weekly_expenses FOR SELECT USING (true);
CREATE POLICY insert_auth_weekly_expenses ON weekly_expenses FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY update_auth_weekly_expenses ON weekly_expenses FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY delete_auth_weekly_expenses ON weekly_expenses FOR DELETE USING (auth.role() = 'authenticated');

-- Índices para las nuevas tablas
CREATE INDEX IF NOT EXISTS employees_active_idx ON employees(active);
CREATE INDEX IF NOT EXISTS activity_log_date_idx ON activity_log(date);
CREATE INDEX IF NOT EXISTS activity_log_table_idx ON activity_log(table_name);
CREATE INDEX IF NOT EXISTS weekly_expenses_week_idx ON weekly_expenses(week_start);

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'Migración v3 completada exitosamente';
END $$;