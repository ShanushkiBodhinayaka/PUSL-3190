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
  role text check (role in ('admin', 'inventory_manager', 'sales_operator', 'procurement_manager', 'approval_manager', 'staff')),
  created_at timestamp with time zone default now()
);

-- Normalize older role names if this schema is applied to an existing project.
alter table profiles drop constraint if exists profiles_role_check;

update profiles
set role = case role
  when 'warehouse_manager' then 'inventory_manager'
  when 'cashier' then 'sales_operator'
  when 'worker' then 'staff'
  else role
end
where role in ('warehouse_manager', 'cashier', 'worker');

alter table profiles
  add constraint profiles_role_check
  check (role in ('admin', 'inventory_manager', 'sales_operator', 'procurement_manager', 'approval_manager', 'staff'));

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', coalesce(new.raw_user_meta_data->>'role', 'staff'));
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
-- 4. SALES TABLE
-- ============================================================
create table if not exists sales (
  id uuid default gen_random_uuid() primary key,
  receipt_number text unique not null,
  customer_name text,
  subtotal decimal(10,2) not null default 0,
  discount_amount decimal(10,2) not null default 0,
  total_amount decimal(10,2) not null default 0,
  payment_method text check (payment_method in ('cash', 'card', 'bank_transfer', 'mobile_payment', 'other')) not null default 'cash',
  payment_status text check (payment_status in ('paid', 'pending')) not null default 'paid',
  created_by uuid references profiles(id),
  created_at timestamp with time zone default now()
);

-- ============================================================
-- 5. SALE ITEMS TABLE
-- ============================================================
create table if not exists sale_items (
  id uuid default gen_random_uuid() primary key,
  sale_id uuid references sales(id) on delete cascade,
  product_id uuid references products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price decimal(10,2) not null default 0,
  line_total decimal(10,2) not null default 0
);

-- ============================================================
-- 6. PURCHASE ORDERS TABLE
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
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table profiles enable row level security;
alter table products enable row level security;
alter table stock_movements enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
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

-- Sales: authenticated users can read/insert POS sales
create policy "Sales viewable by all" on sales
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert sales" on sales
  for insert with check (auth.role() = 'authenticated');

-- Sale items: authenticated users can read/insert POS sale lines
create policy "Sale items viewable by all" on sale_items
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert sale items" on sale_items
  for insert with check (auth.role() = 'authenticated');

-- Purchase orders: all authenticated users can read
create policy "Purchase orders viewable by all" on purchase_orders
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert purchase orders" on purchase_orders
  for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can update purchase orders" on purchase_orders
  for update using (auth.role() = 'authenticated');

-- ============================================================
-- 8. ENABLE REALTIME on purchase_orders
-- ============================================================
alter publication supabase_realtime add table purchase_orders;
