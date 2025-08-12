-- SCHEMA v2 (sin IF NOT EXISTS en CREATE POLICY)
-- Tipos
create type pos_enum as enum ('Barra','Granizados');
create type pay_enum as enum ('Efectivo','Transferencia');
create type expense_enum as enum ('Gasto','Nomina','DescuentoSocio');
create type move_enum as enum ('sale','purchase','adjust');

-- Tablas
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  share_pct numeric not null check (share_pct >= 0 and share_pct <= 100),
  created_at timestamptz default now()
);

create table pos_managers (
  id uuid primary key default gen_random_uuid(),
  pos pos_enum unique not null,
  manager_name text not null,
  created_at timestamptz default now()
);

create table products (
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

create table inventory_counts (
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

create table inventory_moves (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  pos pos_enum not null,
  product_id uuid references products(id) on delete set null,
  qty integer not null,
  kind move_enum not null,
  ref_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time not null,
  pos pos_enum not null,
  product_id uuid references products(id) on delete set null,
  qty integer not null check (qty > 0),
  pay_method pay_enum not null,
  discount_partner integer not null default 0,
  shortage integer not null default 0,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

create table purchases (
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

create table expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type expense_enum not null,
  concept text not null,
  amount integer not null check (amount >= 0),
  attributed_to text,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

create table debts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  person text not null,
  reason text not null,
  amount integer not null,
  balance integer not null,
  created_at timestamptz default now()
);

-- Índices
create index sales_date_idx on sales(date);
create index purchases_date_idx on purchases(date);
create index expenses_date_idx on expenses(date);
create index inv_counts_date_idx on inventory_counts(count_date);
create index inv_moves_date_idx on inventory_moves(date);
create index products_pos_idx on products(pos);

-- RLS
alter table partners enable row level security;
alter table pos_managers enable row level security;
alter table products enable row level security;
alter table inventory_counts enable row level security;
alter table inventory_moves enable row level security;
alter table purchases enable row level security;
alter table sales enable row level security;
alter table expenses enable row level security;
alter table debts enable row level security;

-- Borrar políticas si existen (para reruns) y recrearlas
-- partners
drop policy if exists select_all_partners on partners;
drop policy if exists insert_auth_partners on partners;
create policy select_all_partners on partners for select using (true);
create policy insert_auth_partners on partners for insert with check (auth.role() = 'authenticated');

-- pos_managers
drop policy if exists select_all_pos_managers on pos_managers;
drop policy if exists insert_auth_pos_managers on pos_managers;
create policy select_all_pos_managers on pos_managers for select using (true);
create policy insert_auth_pos_managers on pos_managers for insert with check (auth.role() = 'authenticated');

-- products
drop policy if exists select_all_products on products;
drop policy if exists insert_auth_products on products;
create policy select_all_products on products for select using (true);
create policy insert_auth_products on products for insert with check (auth.role() = 'authenticated');

-- inventory_counts
drop policy if exists select_all_inv_counts on inventory_counts;
drop policy if exists upsert_auth_inv_counts on inventory_counts;
drop policy if exists update_auth_inv_counts on inventory_counts;
create policy select_all_inv_counts on inventory_counts for select using (true);
create policy upsert_auth_inv_counts on inventory_counts for insert with check (auth.role() = 'authenticated');
create policy update_auth_inv_counts on inventory_counts for update using (auth.role() = 'authenticated');

-- inventory_moves
drop policy if exists select_all_inv_moves on inventory_moves;
drop policy if exists insert_auth_inv_moves on inventory_moves;
create policy select_all_inv_moves on inventory_moves for select using (true);
create policy insert_auth_inv_moves on inventory_moves for insert with check (auth.role() = 'authenticated');

-- purchases
drop policy if exists select_all_purchases on purchases;
drop policy if exists insert_auth_purchases on purchases;
create policy select_all_purchases on purchases for select using (true);
create policy insert_auth_purchases on purchases for insert with check (auth.role() = 'authenticated');

-- sales
drop policy if exists select_all_sales on sales;
drop policy if exists insert_auth_sales on sales;
create policy select_all_sales on sales for select using (true);
create policy insert_auth_sales on sales for insert with check (auth.role() = 'authenticated');

-- expenses
drop policy if exists select_all_expenses on expenses;
drop policy if exists insert_auth_expenses on expenses;
create policy select_all_expenses on expenses for select using (true);
create policy insert_auth_expenses on expenses for insert with check (auth.role() = 'authenticated');

-- debts
drop policy if exists select_all_debts on debts;
drop policy if exists insert_auth_debts on debts;
create policy select_all_debts on debts for select using (true);
create policy insert_auth_debts on debts for insert with check (auth.role() = 'authenticated');
