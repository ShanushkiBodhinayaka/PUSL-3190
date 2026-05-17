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
  role text check (role in ('admin', 'inventory_manager', 'sales_operator', 'approval_manager', 'staff')),
  created_at timestamp with time zone default now()
);

-- Normalize older role names if this schema is applied to an existing project.
alter table profiles drop constraint if exists profiles_role_check;

update profiles
set role = case role
  when 'warehouse_manager' then 'inventory_manager'
  when 'procurement_manager' then 'inventory_manager'
  when 'cashier' then 'sales_operator'
  when 'worker' then 'staff'
  else role
end
where role in ('warehouse_manager', 'procurement_manager', 'cashier', 'worker');

alter table profiles
  add constraint profiles_role_check
  check (role in ('admin', 'inventory_manager', 'sales_operator', 'approval_manager', 'staff'));

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
-- 2. CATEGORIES TABLE
-- ============================================================
create table if not exists categories (
  id uuid default gen_random_uuid() primary key,
  name text unique not null,
  active boolean not null default true,
  created_at timestamp with time zone default now()
);

insert into categories (name, active) values
  ('Fasteners', true),
  ('Power Tools', true),
  ('Plumbing', true),
  ('Paint', true),
  ('Lumber', true),
  ('Concrete', true),
  ('Electrical', true),
  ('Safety', true),
  ('Uncategorized', true)
on conflict (name) do nothing;

do $$
begin
  if to_regclass('public.products') is not null then
    update public.products p
    set category = older.name
    from public.categories newer
    join public.categories older
      on lower(newer.name) = lower(older.name)
     and newer.id > older.id
    where p.category = newer.name;
  end if;
end;
$$;

delete from categories newer
using categories older
where lower(newer.name) = lower(older.name)
  and newer.id > older.id;

create unique index if not exists categories_name_lower_unique
  on categories (lower(name));

-- ============================================================
-- 3. PRODUCTS TABLE
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
  active boolean not null default true,
  archived_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

alter table products add column if not exists active boolean not null default true;
alter table products add column if not exists archived_at timestamp with time zone;

update products
set category = 'Uncategorized'
where category is null or trim(category) = '';

insert into categories (name, active)
select min(trim(p.category)), true
from products p
where p.category is not null
  and trim(p.category) <> ''
  and not exists (
    select 1
    from categories c
    where lower(c.name) = lower(trim(p.category))
  )
group by lower(trim(p.category))
on conflict (name) do nothing;

update products p
set category = c.name
from categories c
where p.category is not null
  and lower(p.category) = lower(c.name)
  and p.category <> c.name;

alter table products drop constraint if exists products_category_fkey;
alter table products
  add constraint products_category_fkey
  foreign key (category) references categories(name)
  on update cascade on delete set null;

create unique index if not exists products_sku_lower_unique
  on products (lower(sku));

-- ============================================================
-- 4. STOCK MOVEMENTS TABLE
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
-- 5. SALES TABLE
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
-- 6. SALE ITEMS TABLE
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
-- 7. SALES IMPORT BATCHES
-- ============================================================
create table if not exists sales_import_batches (
  id uuid default gen_random_uuid() primary key,
  file_name text not null,
  file_hash text unique not null,
  source text not null default 'cashier_csv',
  total_rows integer not null default 0,
  total_units integer not null default 0,
  total_amount decimal(10,2) not null default 0,
  imported_by uuid references profiles(id),
  imported_at timestamp with time zone default now()
);

create table if not exists sales_import_items (
  id uuid default gen_random_uuid() primary key,
  batch_id uuid references sales_import_batches(id) on delete cascade,
  product_id uuid references products(id) on delete restrict,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price decimal(10,2) not null default 0,
  line_total decimal(10,2) not null default 0
);

create table if not exists product_import_batches (
  id uuid default gen_random_uuid() primary key,
  mode text not null,
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  imported_by uuid references profiles(id),
  imported_at timestamp with time zone default now()
);

-- ============================================================
-- 8. PURCHASE ORDERS TABLE
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

create unique index if not exists purchase_orders_one_pending_per_product
  on purchase_orders (product_id)
  where status = 'pending';

-- ============================================================
-- 9. DEMAND FORECASTS
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

drop function if exists public.complete_sale(text, numeric, text, text, jsonb);

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

  if v_role = 'sales_operator' and p_movement_type <> 'sale' then
    raise exception 'Sales operators can only record sale movements.';
  end if;

  if v_role = 'staff' and p_movement_type <> 'damage' then
    raise exception 'Staff can only record damage movements.';
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

create or replace function public.import_sales_batch(
  p_file_name text,
  p_file_hash text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_batch_id uuid;
  v_sale_id uuid;
  v_receipt_number text;
  v_item jsonb;
  v_product products%rowtype;
  v_sku text;
  v_quantity integer;
  v_unit_price numeric(10, 2);
  v_line_total numeric(10, 2);
  v_total_amount numeric(10, 2) := 0;
  v_total_units integer := 0;
  v_total_rows integer;
begin
  v_role := public.current_app_role();

  if v_role not in ('admin', 'inventory_manager', 'sales_operator') then
    raise exception 'You do not have permission to import sales.';
  end if;

  if nullif(trim(coalesce(p_file_name, '')), '') is null then
    raise exception 'File name is required.';
  end if;

  if nullif(trim(coalesce(p_file_hash, '')), '') is null then
    raise exception 'File hash is required.';
  end if;

  if exists (select 1 from public.sales_import_batches where file_hash = p_file_hash) then
    raise exception 'This sales file has already been imported.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A sales import requires at least one item.';
  end if;

  v_total_rows := jsonb_array_length(p_items);
  v_receipt_number := 'IMP-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  insert into public.sales_import_batches (
    file_name,
    file_hash,
    total_rows,
    imported_by
  )
  values (
    trim(p_file_name),
    trim(p_file_hash),
    v_total_rows,
    auth.uid()
  )
  returning id into v_batch_id;

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
    'Cashier import: ' || trim(p_file_name),
    0,
    0,
    0,
    'other',
    'paid',
    auth.uid()
  )
  returning id into v_sale_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_sku := trim(coalesce(v_item->>'sku', ''));
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    v_unit_price := nullif(trim(coalesce(v_item->>'unit_price', '')), '')::numeric;

    if v_sku = '' or v_quantity <= 0 then
      raise exception 'Each import item must include a SKU and positive quantity.';
    end if;

    select *
    into v_product
    from public.products
    where lower(sku) = lower(v_sku)
    for update;

    if not found then
      raise exception 'Product with SKU % was not found.', v_sku;
    end if;

    if v_product.current_stock < v_quantity then
      raise exception 'Insufficient stock for %.', v_product.name;
    end if;

    v_unit_price := coalesce(v_unit_price, v_product.unit_price, 0);
    v_line_total := v_quantity * v_unit_price;

    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_sale_id,
      v_product.id,
      v_quantity,
      v_unit_price,
      v_line_total
    );

    insert into public.stock_movements (
      product_id,
      movement_type,
      quantity,
      notes,
      created_by
    )
    values (
      v_product.id,
      'sale',
      v_quantity,
      'Sales import ' || trim(p_file_name) || ' (' || v_receipt_number || ')',
      auth.uid()
    );

    insert into public.sales_import_items (
      batch_id,
      product_id,
      sku,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_batch_id,
      v_product.id,
      v_product.sku,
      v_quantity,
      v_unit_price,
      v_line_total
    );

    update public.products
    set current_stock = current_stock - v_quantity
    where id = v_product.id;

    v_total_units := v_total_units + v_quantity;
    v_total_amount := v_total_amount + v_line_total;
  end loop;

  update public.sales
  set subtotal = v_total_amount,
      total_amount = v_total_amount
  where id = v_sale_id;

  update public.sales_import_batches
  set total_units = v_total_units,
      total_amount = v_total_amount
  where id = v_batch_id;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'sale_id', v_sale_id,
    'receipt_number', v_receipt_number,
    'imported_items', v_total_rows,
    'total_units', v_total_units,
    'total_amount', v_total_amount
  );
end;
$$;

create or replace function public.rename_category(
  p_category_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_category categories%rowtype;
  v_name text := trim(coalesce(p_name, ''));
begin
  v_role := public.current_app_role();

  if v_role <> 'admin' then
    raise exception 'Only admins can manage categories.';
  end if;

  if v_name = '' then
    raise exception 'Category name is required.';
  end if;

  select * into v_category from public.categories where id = p_category_id for update;
  if not found then
    raise exception 'Category was not found.';
  end if;

  update public.categories
  set name = v_name
  where id = p_category_id;

  return jsonb_build_object('category_id', p_category_id, 'name', v_name);
end;
$$;

create or replace function public.import_product_master(
  p_mode text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_mode text := coalesce(p_mode, 'create_update');
  v_item jsonb;
  v_product products%rowtype;
  v_product_found boolean;
  v_sku text;
  v_name text;
  v_category text;
  v_existing_category_name text;
  v_current_stock integer;
  v_reorder_point integer;
  v_reorder_quantity integer;
  v_unit_price numeric(10, 2);
  v_supplier_name text;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  v_role := public.current_app_role();

  if v_role <> 'admin' then
    raise exception 'Only admins can import product master data.';
  end if;

  if v_mode not in ('create_update', 'create_only', 'update_details', 'update_baseline') then
    raise exception 'Invalid product import mode.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Product import requires an array of items.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sku := trim(coalesce(v_item->>'sku', ''));
    v_name := trim(coalesce(v_item->>'name', ''));
    v_category := nullif(trim(coalesce(v_item->>'category', '')), '');
    v_current_stock := nullif(trim(coalesce(v_item->>'current_stock', '')), '')::integer;
    v_reorder_point := coalesce(nullif(trim(coalesce(v_item->>'reorder_point', '')), '')::integer, 10);
    v_reorder_quantity := coalesce(nullif(trim(coalesce(v_item->>'reorder_quantity', '')), '')::integer, 50);
    v_unit_price := coalesce(nullif(trim(coalesce(v_item->>'unit_price', '')), '')::numeric, 0);
    v_supplier_name := nullif(trim(coalesce(v_item->>'supplier_name', '')), '');

    if v_sku = '' then
      raise exception 'Each product requires SKU.';
    end if;

    select * into v_product
    from public.products
    where lower(sku) = lower(v_sku)
    for update;
    v_product_found := found;

    if v_product_found then
      if v_mode = 'create_only' then
        v_skipped := v_skipped + 1;
        continue;
      end if;
    else
      if v_mode in ('update_details', 'update_baseline') then
        v_skipped := v_skipped + 1;
        continue;
      end if;
    end if;

    if v_mode <> 'update_baseline' and v_name = '' then
      raise exception 'Name is required for SKU %.', v_sku;
    end if;

    if v_current_stock is null and v_mode <> 'update_details' then
      raise exception 'Current stock is required for SKU %.', v_sku;
    end if;

    if v_mode <> 'update_baseline' then
      if v_category is null then
        v_category := 'Uncategorized';
      end if;

      select name into v_existing_category_name
      from public.categories
      where lower(name) = lower(v_category)
      limit 1;

      if found then
        update public.categories
        set active = true
        where name = v_existing_category_name;

        v_category := v_existing_category_name;
      else
        insert into public.categories (name, active)
        values (v_category, true);
      end if;
    end if;

    if v_product_found then
      if v_mode = 'update_details' then
        update public.products
        set name = v_name,
            category = v_category,
            reorder_point = v_reorder_point,
            reorder_quantity = v_reorder_quantity,
            unit_price = v_unit_price,
            supplier_name = v_supplier_name
        where id = v_product.id;
        v_updated := v_updated + 1;
      elsif v_mode = 'update_baseline' then
        update public.products
        set current_stock = v_current_stock
        where id = v_product.id;
        v_updated := v_updated + 1;
      else
        update public.products
        set name = v_name,
            category = v_category,
            current_stock = v_current_stock,
            reorder_point = v_reorder_point,
            reorder_quantity = v_reorder_quantity,
            unit_price = v_unit_price,
            supplier_name = v_supplier_name
        where id = v_product.id;
        v_updated := v_updated + 1;
      end if;
    else
      insert into public.products (
        sku,
        name,
        category,
        current_stock,
        reorder_point,
        reorder_quantity,
        unit_price,
        supplier_name
      )
      values (
        v_sku,
        v_name,
        v_category,
        v_current_stock,
        v_reorder_point,
        v_reorder_quantity,
        v_unit_price,
        v_supplier_name
      );
      v_created := v_created + 1;
    end if;
  end loop;

  insert into public.product_import_batches (
    mode,
    total_rows,
    created_count,
    updated_count,
    skipped_count,
    imported_by
  )
  values (
    v_mode,
    jsonb_array_length(p_items),
    v_created,
    v_updated,
    v_skipped,
    auth.uid()
  );

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped
  );
end;
$$;

create or replace function public.update_product_master(
  p_product_id uuid,
  p_name text,
  p_category text,
  p_reorder_point integer,
  p_reorder_quantity integer,
  p_unit_price numeric,
  p_supplier_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_category text := nullif(trim(coalesce(p_category, '')), '');
  v_existing_category_name text;
begin
  v_role := public.current_app_role();

  if v_role not in ('admin', 'inventory_manager') then
    raise exception 'You do not have permission to edit products.';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Product name is required.';
  end if;

  if coalesce(p_reorder_point, -1) < 0 then
    raise exception 'Safety stock must be zero or greater.';
  end if;

  if coalesce(p_reorder_quantity, 0) <= 0 then
    raise exception 'Suggested order quantity must be greater than zero.';
  end if;

  if coalesce(p_unit_price, 0) < 0 then
    raise exception 'Unit price must be zero or greater.';
  end if;

  if v_category is null then
    v_category := 'Uncategorized';
  end if;

  select name into v_existing_category_name
  from public.categories
  where lower(name) = lower(v_category)
  limit 1;

  if found then
    update public.categories
    set active = true
    where name = v_existing_category_name;

    v_category := v_existing_category_name;
  else
    insert into public.categories (name, active)
    values (v_category, true);
  end if;

  update public.products
  set name = trim(p_name),
      category = v_category,
      reorder_point = p_reorder_point,
      reorder_quantity = p_reorder_quantity,
      unit_price = coalesce(p_unit_price, 0),
      supplier_name = nullif(trim(coalesce(p_supplier_name, '')), '')
  where id = p_product_id;

  if not found then
    raise exception 'Product was not found.';
  end if;

  return jsonb_build_object('product_id', p_product_id, 'updated', true);
end;
$$;

create or replace function public.archive_product(
  p_product_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := public.current_app_role();

  if v_role not in ('admin', 'inventory_manager') then
    raise exception 'You do not have permission to archive products.';
  end if;

  update public.products
  set active = coalesce(p_active, false),
      archived_at = case when coalesce(p_active, false) then null else now() end
  where id = p_product_id;

  if not found then
    raise exception 'Product was not found.';
  end if;

  return jsonb_build_object(
    'product_id', p_product_id,
    'active', coalesce(p_active, false)
  );
end;
$$;

create or replace function public.place_forecast_purchase_orders(
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_item jsonb;
  v_product_id uuid;
  v_product products%rowtype;
  v_quantity integer;
  v_days_until_stockout integer;
  v_notes text;
  v_created integer := 0;
  v_skipped integer := 0;
  v_order_number text;
begin
  v_role := public.current_app_role();

  if v_role not in ('admin', 'inventory_manager') then
    raise exception 'You do not have permission to place forecast order requests.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one product.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    v_days_until_stockout := nullif(trim(coalesce(v_item->>'predicted_days_until_stockout', '')), '')::integer;
    v_notes := nullif(trim(coalesce(v_item->>'notes', '')), '');

    if v_product_id is null or v_quantity <= 0 then
      raise exception 'Each selected product requires a product and positive quantity.';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception 'Product % was not found.', v_product_id;
    end if;

    if exists (
      select 1
      from public.purchase_orders
      where product_id = v_product_id
        and status = 'pending'
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_order_number := 'PO-FC-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || v_product.sku;

    insert into public.purchase_orders (
      order_number,
      product_id,
      quantity_ordered,
      status,
      triggered_by,
      predicted_days_until_stockout,
      notes
    )
    values (
      v_order_number,
      v_product_id,
      v_quantity,
      'pending',
      'ai_prediction',
      v_days_until_stockout,
      v_notes
    );

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('created', v_created, 'skipped', v_skipped);
end;
$$;

create or replace function public.delete_product(
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_product products%rowtype;
  v_sale_item_count integer;
  v_import_item_count integer;
begin
  v_role := public.current_app_role();

  if v_role not in ('admin', 'inventory_manager') then
    raise exception 'You do not have permission to delete products.';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product was not found.';
  end if;

  select count(*)
  into v_sale_item_count
  from public.sale_items
  where product_id = p_product_id;

  select count(*)
  into v_import_item_count
  from public.sales_import_items
  where product_id = p_product_id;

  if v_sale_item_count > 0 or v_import_item_count > 0 then
    raise exception 'This product has sales history. Keep it for reporting instead of deleting it.';
  end if;

  delete from public.products
  where id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'sku', v_product.sku,
    'deleted', true
  );
end;
$$;

create or replace function public.receive_purchase_order(
  p_order_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_order purchase_orders%rowtype;
  v_product products%rowtype;
  v_new_stock integer;
begin
  v_role := public.current_app_role();

  if v_role not in ('admin', 'inventory_manager') then
    raise exception 'You do not have permission to receive purchase orders.';
  end if;

  select *
  into v_order
  from public.purchase_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Purchase order was not found.';
  end if;

  if v_order.status not in ('approved', 'ordered') then
    raise exception 'Only approved or ordered purchase orders can be received.';
  end if;

  select *
  into v_product
  from public.products
  where id = v_order.product_id
  for update;

  if not found then
    raise exception 'Product was not found.';
  end if;

  v_new_stock := coalesce(v_product.current_stock, 0) + v_order.quantity_ordered;

  update public.products
  set current_stock = v_new_stock,
      active = true,
      archived_at = null
  where id = v_product.id;

  insert into public.stock_movements (
    product_id,
    movement_type,
    quantity,
    notes,
    created_by
  )
  values (
    v_product.id,
    'restock',
    v_order.quantity_ordered,
    coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'Received purchase order ' || v_order.order_number),
    auth.uid()
  );

  update public.purchase_orders
  set status = 'received',
      notes = concat_ws(E'\n', notes, nullif(trim(coalesce(p_notes, '')), ''))
  where id = v_order.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'product_id', v_product.id,
    'quantity_received', v_order.quantity_ordered,
    'current_stock', v_new_stock
  );
end;
$$;

grant execute on function public.record_stock_movement(uuid, text, integer, text) to authenticated;
grant execute on function public.import_sales_batch(text, text, jsonb) to authenticated;
grant execute on function public.rename_category(uuid, text) to authenticated;
grant execute on function public.import_product_master(text, jsonb) to authenticated;
grant execute on function public.update_product_master(uuid, text, text, integer, integer, numeric, text) to authenticated;
grant execute on function public.archive_product(uuid, boolean) to authenticated;
grant execute on function public.place_forecast_purchase_orders(jsonb) to authenticated;
grant execute on function public.delete_product(uuid) to authenticated;
grant execute on function public.receive_purchase_order(uuid, text) to authenticated;

-- ============================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table profiles enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table stock_movements enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table sales_import_batches enable row level security;
alter table sales_import_items enable row level security;
alter table product_import_batches enable row level security;
alter table purchase_orders enable row level security;
alter table demand_forecasts enable row level security;

drop policy if exists "Profiles are viewable by authenticated users" on profiles;
drop policy if exists "Users can update own profile" on profiles;
drop policy if exists "Service can insert profiles" on profiles;
drop policy if exists "Admins can manage profiles" on profiles;
drop policy if exists "Categories viewable by all" on categories;
drop policy if exists "Admins can insert categories" on categories;
drop policy if exists "Admins can update categories" on categories;
drop policy if exists "Admins can delete categories" on categories;
drop policy if exists "Products viewable by all" on products;
drop policy if exists "Admins and managers can insert products" on products;
drop policy if exists "Admins and managers can update products" on products;
drop policy if exists "Stock movements viewable by all" on stock_movements;
drop policy if exists "Authenticated users can insert stock movements" on stock_movements;
drop policy if exists "Sales viewable by all" on sales;
drop policy if exists "Authenticated users can insert sales" on sales;
drop policy if exists "Sale items viewable by all" on sale_items;
drop policy if exists "Authenticated users can insert sale items" on sale_items;
drop policy if exists "Sales import batches viewable by all" on sales_import_batches;
drop policy if exists "Sales import items viewable by all" on sales_import_items;
drop policy if exists "Product import batches viewable by admins and managers" on product_import_batches;
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

-- Categories: all authenticated users can read, admins can manage
create policy "Categories viewable by all" on categories
  for select using (auth.role() = 'authenticated');

create policy "Admins can insert categories" on categories
  for insert with check (public.current_app_role() = 'admin');

create policy "Admins can update categories" on categories
  for update using (public.current_app_role() = 'admin')
  with check (public.current_app_role() = 'admin');

create policy "Admins can delete categories" on categories
  for delete using (public.current_app_role() = 'admin');

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

-- Sales: all authenticated users can read; imports write through RPC functions
create policy "Sales viewable by all" on sales
  for select using (auth.role() = 'authenticated');

-- Sale items: all authenticated users can read; imports write through RPC functions
create policy "Sale items viewable by all" on sale_items
  for select using (auth.role() = 'authenticated');

-- Sales imports: all authenticated users can read; imports write through RPC functions
create policy "Sales import batches viewable by all" on sales_import_batches
  for select using (auth.role() = 'authenticated');

create policy "Sales import items viewable by all" on sales_import_items
  for select using (auth.role() = 'authenticated');

create policy "Product import batches viewable by admins and managers" on product_import_batches
  for select using (
    public.current_app_role() in ('admin', 'inventory_manager')
  );

-- Purchase orders: all authenticated users can read; only specific roles can write
create policy "Purchase orders viewable by all" on purchase_orders
  for select using (auth.role() = 'authenticated');

create policy "Authenticated users can insert purchase orders" on purchase_orders
  for insert with check (
    public.current_app_role() in ('admin', 'inventory_manager')
  );

create policy "Authenticated users can update purchase orders" on purchase_orders
  for update using (
    public.current_app_role() in ('admin', 'inventory_manager', 'approval_manager')
  )
  with check (
    public.current_app_role() in ('admin', 'inventory_manager', 'approval_manager')
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
