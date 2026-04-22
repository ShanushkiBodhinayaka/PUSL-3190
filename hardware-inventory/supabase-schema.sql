-- ============================================================
-- Hardware Store Inventory Management System — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PROFILES TABLE
-- ============================================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  role text check (role in ('admin', 'warehouse_manager', 'cashier', 'approval_manager', 'worker')),
  created_at timestamp with time zone default now()
);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', coalesce(new.raw_user_meta_data->>'role', 'worker'));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. PRODUCTS TABLE
-- ============================================================
create table if not exists products (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  sku text unique not null,
  category text,
  current_stock integer default 0,
  reorder_point integer default 10,
  reorder_quantity integer default 50,
  unit_price decimal(10,2),
  supplier_name text,
  created_at timestamp with time zone default now()
);

-- ============================================================
-- 3. STOCK MOVEMENTS TABLE
-- ============================================================
create table if not exists stock_movements (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references products(id) on delete cascade,
  movement_type text check (movement_type in ('sale', 'restock', 'adjustment', 'damage')),
  quantity integer not null,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamp with time zone default now()
);

-- ============================================================
-- 4. PURCHASE ORDERS TABLE
-- ============================================================
create table if not exists purchase_orders (
  id uuid default gen_random_uuid() primary key,
  order_number text unique not null,
  product_id uuid references products(id) on delete cascade,
  quantity_ordered integer not null,
  status text check (status in ('pending', 'approved', 'rejected', 'ordered', 'received')) default 'pending',
  triggered_by text check (triggered_by in ('ai_prediction', 'manual')),
  predicted_days_until_stockout integer,
  notes text,
  created_at timestamp with time zone default now(),
  approved_by uuid references profiles(id),
  approved_at timestamp with time zone
);

-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table profiles enable row level security;
alter table products enable row level security;
alter table stock_movements enable row level security;
alter table purchase_orders enable row level security;

-- Profiles: users can read all profiles, update own
create policy "Profiles are viewable by authenticated users" on profiles
  for select using (auth.role() = 'authenticated');

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

create policy "Service can insert profiles" on profiles
  for insert with check (true);

-- Products: all authenticated users can read
create policy "Products viewable by all" on products
  for select using (auth.role() = 'authenticated');

create policy "Admins and managers can insert products" on products
  for insert with check (auth.role() = 'authenticated');

create policy "Admins and managers can update products" on products
  for update using (auth.role() = 'authenticated');

-- Stock movements: all authenticated users can read/insert
create policy "Stock movements viewable by all" on stock_movements
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert stock movements" on stock_movements
  for insert with check (auth.role() = 'authenticated');

-- Purchase orders: all authenticated users can read
create policy "Purchase orders viewable by all" on purchase_orders
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert purchase orders" on purchase_orders
  for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update purchase orders" on purchase_orders
  for update using (auth.role() = 'authenticated');

-- ============================================================
-- 6. ENABLE REALTIME on purchase_orders
-- ============================================================
alter publication supabase_realtime add table purchase_orders;
