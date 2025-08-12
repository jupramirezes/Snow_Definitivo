-- PR: Supabase schema for Control_BAR_SNOW
-- Enums
create type pos_enum as enum ('Barra','Granizados');
create type pay_enum as enum ('Efectivo','Transferencia');
create type expense_enum as enum ('Gasto','Nomina','DescuentoSocio');
create type move_enum as enum ('sale','purchase','adjust');

-- Socios
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  share_pct numeric not null check (share_pct >= 0 and share_pct <= 100),
  created_at timestamptz default now()
);

-- Encargados de POS (para descuadres)
create table if not exists pos_managers (
  id uuid primary key default gen_random_uuid(),
  pos pos_enum unique not null,
  manager_name text not null,
  created_at timestamptz default now()
);

-- Productos e insumos
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  pos pos_enum not null,
  type text not null check (type in ('producto','insumo')),
  price integer not null default 0,
  vasos_per_unit integer not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Conteos de inventario (inicial y final por día y POS)
create table if not exists inventory_counts (
  id uuid primary key default gen_random_uuid(),
  count_date date not null,
  pos pos_enum not null,
  product_id uuid references products(id) on delete cascade,
  initial_qty integer not null default 0,
  final_qty integer not null default 0,
  created_by uuid,
  created_at timestamptz default now(),
  unique (count_date, pos, product_id)
);

-- Movimientos de inventario (trazabilidad)
create table if not exists inventory_moves (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  pos pos_enum not null,
  product_id uuid references products(id) on delete set null,
  qty integer not null, -- negativo venta, positivo compra/ajuste
  kind move_enum not null,
  ref_id uuid, -- id de venta/compra/ajuste
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

-- Ventas
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time not null,
  pos pos_enum not null,
  product_id uuid references products(id) on delete set null,
  qty integer not null check (qty > 0),
  pay_method pay_enum not null,
  discount_partner integer not null default 0, -- COP
  shortage integer not null default 0,        -- descuadre
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

-- Compras
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  pos pos_enum not null,
  product_id uuid references products(id) on delete set null,
  qty integer not null check (qty >= 0),
  unit_cost integer not null default 0,
  notes text,
  invoice_path text,
  created_by uuid,
  created_at timestamptz default now()
);

-- Gastos
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type expense_enum not null,
  concept text not null,
  amount integer not null check (amount >= 0),
  attributed_to text, -- socio/persona
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

-- Deudas (descuares u otros ajustes internos)
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  person text not null,
  reason text not null,
  amount integer not null,
  balance integer not null,
  created_at timestamptz default now()
);

-- Índices
create index if not exists sales_date_idx on sales(date);
create index if not exists purchases_date_idx on purchases(date);
create index if not exists expenses_date_idx on expenses(date);
create index if not exists inv_counts_date_idx on inventory_counts(count_date);
create index if not exists inv_moves_date_idx on inventory_moves(date);
create index if not exists products_pos_idx on products(pos);

-- Habilitar RLS
alter table partners enable row level security;
alter table pos_managers enable row level security;
alter table products enable row level security;
alter table inventory_counts enable row level security;
alter table inventory_moves enable row level security;
alter table purchases enable row level security;
alter table sales enable row level security;
alter table expenses enable row level security;
alter table debts enable row level security;

-- Políticas basicas: lectura general, escritura autenticado (afinable por rol)
do $$
begin
  perform 1;
  exception when others then
    -- ignore
end $$;

create policy if not exists "select_all" on partners for select using (true);
create policy if not exists "insert_all" on partners for insert with check (auth.role() = 'authenticated');

create policy if not exists "select_all" on pos_managers for select using (true);
create policy if not exists "insert_all" on pos_managers for insert with check (auth.role() = 'authenticated');

create policy if not exists "select_all" on products for select using (true);
create policy if not exists "insert_all" on products for insert with check (auth.role() = 'authenticated');

create policy if not exists "select_all" on inventory_counts for select using (true);
create policy if not exists "upsert_all" on inventory_counts for insert with check (auth.role() = 'authenticated');
create policy if not exists "update_all" on inventory_counts for update using (auth.role() = 'authenticated');

create policy if not exists "select_all" on inventory_moves for select using (true);
create policy if not exists "insert_all" on inventory_moves for insert with check (auth.role() = 'authenticated');

create policy if not exists "select_all" on purchases for select using (true);
create policy if not exists "insert_all" on purchases for insert with check (auth.role() = 'authenticated');

create policy if not exists "select_all" on sales for select using (true);
create policy if not exists "insert_all" on sales for insert with check (auth.role() = 'authenticated');

create policy if not exists "select_all" on expenses for select using (true);
create policy if not exists "insert_all" on expenses for insert with check (auth.role() = 'authenticated');

create policy if not exists "select_all" on debts for select using (true);
create policy if not exists "insert_all" on debts for insert with check (auth.role() = 'authenticated');
