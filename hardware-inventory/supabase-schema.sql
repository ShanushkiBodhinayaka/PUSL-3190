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
-- 7. DEMAND FORECASTS
-- ============================================================
create table if not exists demand_forecasts (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references products(id) on delete cascade,
  model_name text not null,
  training_data_source text,
  history_start date,
  history_end date,
  forecast_date date not null,
  horizon_days integer not null check (horizon_days > 0),
  predicted_demand numeric(12,2) not null default 0,
  predicted_daily_demand numeric(12,4) not null default 0,
  safety_stock integer not null default 0,
  recommended_reorder_quantity integer not null default 0,
  reorder_signal boolean not null default false,
  validation_mae numeric(12,4),
  validation_rmse numeric(12,4),
  validation_mape numeric(12,4),
  metadata jsonb default '{}'::jsonb,
  generated_at timestamp with time zone default now()
);

create index if not exists demand_forecasts_product_generated_idx
  on demand_forecasts (product_id, generated_at desc);

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.complete_sale(
  p_customer_name text,
  p_discount_amount numeric,
  p_payment_method text,
  p_payment_status text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_sale_id uuid;
  v_receipt_number text;
  v_subtotal numeric(10, 2) := 0;
  v_discount numeric(10, 2) := greatest(coalesce(p_discount_amount, 0), 0);
  v_total numeric(10, 2);
  v_item jsonb;
  v_product products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric(10, 2);
begin
  v_role := public.current_app_role();

  if v_role not in ('admin', 'sales_operator') then
    raise exception 'You do not have permission to complete sales.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale requires at least one item.';
  end if;

  if p_payment_method not in ('cash', 'card', 'bank_transfer', 'mobile_payment', 'other') then
    raise exception 'Invalid payment method.';
  end if;

  if p_payment_status not in ('paid', 'pending') then
    raise exception 'Invalid payment status.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := greatest(coalesce((v_item->>'quantity')::integer, 0), 0);

    if v_product_id is null or v_quantity <= 0 then
      raise exception 'Each sale item must include a valid product and quantity.';
    end if;

    select *
    into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception 'Product % was not found.', v_product_id;
    end if;

    if v_product.current_stock < v_quantity then
      raise exception 'Insufficient stock for %.', v_product.name;
    end if;

    v_unit_price := coalesce(v_product.unit_price, 0);
    v_subtotal := v_subtotal + (v_quantity * v_unit_price);
  end loop;

  v_discount := least(v_discount, v_subtotal);
  v_total := greatest(v_subtotal - v_discount, 0);
  v_receipt_number := 'POS-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  insert into public.sales (
    receipt_number,
    customer_name,
    subtotal,
    discount_amount,
    total_amount,
    payment_method,
    payment_status,
    created_by
  )
  values (
    v_receipt_number,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    v_subtotal,
    v_discount,
    v_total,
    p_payment_method,
    p_payment_status,
    auth.uid()
  )
  returning id into v_sale_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;

    select *
    into v_product
    from public.products
    where id = v_product_id
    for update;

    v_unit_price := coalesce(v_product.unit_price, 0);

    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_sale_id,
      v_product_id,
      v_quantity,
      v_unit_price,
      v_quantity * v_unit_price
    );

    insert into public.stock_movements (
      product_id,
      movement_type,
      quantity,
      notes,
      created_by
    )
    values (
      v_product_id,
      'sale',
      v_quantity,
      'Receipt ' || v_receipt_number,
      auth.uid()
    );

    update public.products
    set current_stock = current_stock - v_quantity
    where id = v_product_id;
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number,
    'subtotal', v_subtotal,
    'discount_amount', v_discount,
    'total_amount', v_total
  );
end;
$$;

create or replace function public.record_stock_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_product products%rowtype;
  v_new_stock integer;
begin
  v_role := public.current_app_role();

  if v_role not in ('admin', 'inventory_manager', 'sales_operator', 'staff') then
    raise exception 'You do not have permission to record stock movements.';
  end if;

  if p_movement_type not in ('sale', 'restock', 'adjustment', 'damage') then
    raise exception 'Invalid movement type.';
  end if;

  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product % was not found.', p_product_id;
  end if;

  if p_movement_type in ('sale', 'damage') then
    if v_product.current_stock < p_quantity then
      raise exception 'Insufficient stock for %.', v_product.name;
    end if;
    v_new_stock := v_product.current_stock - p_quantity;
  else
    v_new_stock := v_product.current_stock + p_quantity;
  end if;

  insert into public.stock_movements (
    product_id,
    movement_type,
    quantity,
    notes,
    created_by
  )
  values (
    p_product_id,
    p_movement_type,
    p_quantity,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  );

  update public.products
  set current_stock = v_new_stock
  where id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'movement_type', p_movement_type,
    'quantity', p_quantity,
    'current_stock', v_new_stock
  );
end;
$$;

grant execute on function public.complete_sale(text, numeric, text, text, jsonb) to authenticated;
grant execute on function public.record_stock_movement(uuid, text, integer, text) to authenticated;

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table profiles enable row level security;
alter table products enable row level security;
alter table stock_movements enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table purchase_orders enable row level security;
alter table demand_forecasts enable row level security;

drop policy if exists "Profiles are viewable by authenticated users" on profiles;
drop policy if exists "Users can update own profile" on profiles;
drop policy if exists "Service can insert profiles" on profiles;
drop policy if exists "Admins can manage profiles" on profiles;
drop policy if exists "Products viewable by all" on products;
drop policy if exists "Admins and managers can insert products" on products;
drop policy if exists "Admins and managers can update products" on products;
drop policy if exists "Stock movements viewable by all" on stock_movements;
drop policy if exists "Authenticated users can insert stock movements" on stock_movements;
drop policy if exists "Sales viewable by all" on sales;
drop policy if exists "Authenticated users can insert sales" on sales;
drop policy if exists "Sale items viewable by all" on sale_items;
drop policy if exists "Authenticated users can insert sale items" on sale_items;
drop policy if exists "Purchase orders viewable by all" on purchase_orders;
drop policy if exists "Authenticated users can insert purchase orders" on purchase_orders;
drop policy if exists "Authenticated users can update purchase orders" on purchase_orders;
drop policy if exists "Demand forecasts viewable by all" on demand_forecasts;
drop policy if exists "Service can manage demand forecasts" on demand_forecasts;

-- Profiles: users can read all profiles, update own non-role fields, admins can manage all
create policy "Profiles are viewable by authenticated users" on profiles
  for select using (auth.role() = 'authenticated');

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = public.current_app_role()
  );

create policy "Admins can manage profiles" on profiles
  for update using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

create policy "Service can insert profiles" on profiles
  for insert with check (true);

-- Products: all authenticated users can read, inventory admins/managers can write
create policy "Products viewable by all" on products
  for select using (auth.role() = 'authenticated');

create policy "Admins and managers can insert products" on products
  for insert with check (public.current_app_role() in ('admin', 'inventory_manager'));

create policy "Admins and managers can update products" on products
  for update using (public.current_app_role() in ('admin', 'inventory_manager'))
  with check (public.current_app_role() in ('admin', 'inventory_manager'));

-- Stock movements: all authenticated users can read; writes go through RPC functions
create policy "Stock movements viewable by all" on stock_movements
  for select using (auth.role() = 'authenticated');

-- Sales: all authenticated users can read; checkout writes go through RPC functions
create policy "Sales viewable by all" on sales
  for select using (auth.role() = 'authenticated');

-- Sale items: all authenticated users can read; checkout writes go through RPC functions
create policy "Sale items viewable by all" on sale_items
  for select using (auth.role() = 'authenticated');

-- Purchase orders: all authenticated users can read; only specific roles can write
create policy "Purchase orders viewable by all" on purchase_orders
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert purchase orders" on purchase_orders
  for insert with check (
    public.current_app_role() in ('admin', 'inventory_manager', 'procurement_manager')
  );

create policy "Authenticated users can update purchase orders" on purchase_orders
  for update using (
    public.current_app_role() in ('admin', 'inventory_manager', 'procurement_manager', 'approval_manager')
  )
  with check (
    public.current_app_role() in ('admin', 'inventory_manager', 'procurement_manager', 'approval_manager')
  );

-- ============================================================
-- Demand forecasts: readable by authenticated users, writable by service/admin tools
create policy "Demand forecasts viewable by all" on demand_forecasts
  for select using (auth.role() = 'authenticated');

create policy "Service can manage demand forecasts" on demand_forecasts
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- 10. ENABLE REALTIME on purchase_orders
-- ============================================================
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchase_orders'
  ) then
    alter publication supabase_realtime add table purchase_orders;
  end if;
end $$;
