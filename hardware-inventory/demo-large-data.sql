-- ============================================================
-- HardwareHub Large Demo Dataset
-- Run AFTER supabase-schema.sql.
--
-- This script is idempotent for demo rows only. It removes rows
-- tagged with DEMO-LARGE / SKU prefix DEMO- and recreates them.
-- It does not delete your normal seed data or real business data.
-- ============================================================

begin;

-- Remove previous generated demo rows in dependency order.
delete from sale_items
where sale_id in (
  select id from sales where receipt_number like 'DEMO-LARGE-%'
);

delete from sales
where receipt_number like 'DEMO-LARGE-%';

delete from stock_movements
where notes like 'DEMO-LARGE:%';

delete from purchase_orders
where order_number like 'PO-DEMO-%';

delete from demand_forecasts
where product_id in (
  select id from products where sku like 'DEMO-%'
);

delete from products
where sku like 'DEMO-%';

-- Ensure demo categories exist and are active.
insert into categories (name, active) values
  ('Fasteners', true),
  ('Power Tools', true),
  ('Plumbing', true),
  ('Paint', true),
  ('Lumber', true),
  ('Concrete', true),
  ('Electrical', true),
  ('Safety', true),
  ('Garden', true),
  ('Adhesives', true),
  ('Hand Tools', true),
  ('Hardware', true)
on conflict (name) do update set active = excluded.active;

-- 1,200 demo products across common hardware categories.
insert into products (
  name,
  sku,
  category,
  current_stock,
  reorder_point,
  reorder_quantity,
  unit_price,
  supplier_name
)
select
  case ((gs - 1) % 12)
    when 0 then 'Galvanized Screws Pack '
    when 1 then 'Contractor Drill Bit Set '
    when 2 then 'PVC Elbow Fitting '
    when 3 then 'Interior Paint Gallon '
    when 4 then 'Treated Lumber Board '
    when 5 then 'Cement Mix Bag '
    when 6 then 'Copper Wire Roll '
    when 7 then 'Safety Gloves Pair '
    when 8 then 'Garden Hose Fitting '
    when 9 then 'Construction Adhesive Tube '
    when 10 then 'Adjustable Wrench '
    else 'Cabinet Hinge Set '
  end || gs::text as name,
  'DEMO-' || lpad(gs::text, 5, '0') as sku,
  case ((gs - 1) % 12)
    when 0 then 'Fasteners'
    when 1 then 'Power Tools'
    when 2 then 'Plumbing'
    when 3 then 'Paint'
    when 4 then 'Lumber'
    when 5 then 'Concrete'
    when 6 then 'Electrical'
    when 7 then 'Safety'
    when 8 then 'Garden'
    when 9 then 'Adhesives'
    when 10 then 'Hand Tools'
    else 'Hardware'
  end as category,
  case
    when gs % 17 = 0 then 0
    when gs % 11 = 0 then 3 + (gs % 9)
    when gs % 7 = 0 then 8 + (gs % 18)
    else 35 + (gs % 260)
  end as current_stock,
  10 + (gs % 45) as reorder_point,
  25 + (gs % 120) as reorder_quantity,
  round((2.25 + (gs % 180) * 1.37)::numeric, 2) as unit_price,
  case (gs % 8)
    when 0 then 'Northline Hardware Supply'
    when 1 then 'BuildPro Distribution'
    when 2 then 'Metro Trade Warehouse'
    when 3 then 'Island Contractor Supply'
    when 4 then 'Prime Tools Wholesale'
    when 5 then 'Reliable Materials Co'
    when 6 then 'TradeSource Depot'
    else 'Core Hardware Imports'
  end as supplier_name
from generate_series(1, 1200) gs;

-- 8,000 sales receipts over the last 120 days.
insert into sales (
  receipt_number,
  customer_name,
  subtotal,
  discount_amount,
  total_amount,
  payment_method,
  payment_status,
  created_at
)
select
  'DEMO-LARGE-' || lpad(gs::text, 6, '0') as receipt_number,
  case gs % 5
    when 0 then 'Walk-in Customer'
    when 1 then 'Residential Contractor'
    when 2 then 'Maintenance Team'
    when 3 then 'Small Builder'
    else 'Trade Account'
  end as customer_name,
  0,
  case when gs % 13 = 0 then round((5 + (gs % 30))::numeric, 2) else 0 end,
  0,
  case gs % 5
    when 0 then 'cash'
    when 1 then 'card'
    when 2 then 'bank_transfer'
    when 3 then 'mobile_payment'
    else 'other'
  end as payment_method,
  'paid',
  now() - ((gs % 120)::text || ' days')::interval - (((gs * 17) % 720)::text || ' minutes')::interval
from generate_series(1, 8000) gs;

-- 630 extra recent receipts from four days ago through the day after tomorrow.
-- This helps demo daily reports, recent sales, and near-term forecast behavior.
insert into sales (
  receipt_number,
  customer_name,
  subtotal,
  discount_amount,
  total_amount,
  payment_method,
  payment_status,
  created_at
)
select
  'DEMO-LARGE-RECENT-' || to_char(activity_day, 'YYYYMMDD') || '-' || lpad(receipt_no::text, 4, '0') as receipt_number,
  case receipt_no % 5
    when 0 then 'Walk-in Customer'
    when 1 then 'Commercial Contractor'
    when 2 then 'Emergency Repair Team'
    when 3 then 'Weekend Builder'
    else 'Trade Account'
  end as customer_name,
  0,
  case when receipt_no % 12 = 0 then 7.50 else 0 end,
  0,
  case receipt_no % 5
    when 0 then 'cash'
    when 1 then 'card'
    when 2 then 'bank_transfer'
    when 3 then 'mobile_payment'
    else 'other'
  end as payment_method,
  'paid',
  activity_day + make_interval(hours => 8 + (receipt_no % 10), mins => (receipt_no * 7) % 60)
from generate_series(current_date - 4, current_date + 2, interval '1 day') activity_day
cross join generate_series(1, 90) receipt_no;

-- One sale item per receipt, referencing deterministic demo products.
insert into sale_items (
  sale_id,
  product_id,
  quantity,
  unit_price,
  line_total
)
select
  s.id,
  p.id,
  1 + (gs % 9) as quantity,
  p.unit_price,
  round(((1 + (gs % 9)) * p.unit_price)::numeric, 2) as line_total
from generate_series(1, 8000) gs
join sales s
  on s.receipt_number = 'DEMO-LARGE-' || lpad(gs::text, 6, '0')
join products p
  on p.sku = 'DEMO-' || lpad((((gs * 37) % 1200) + 1)::text, 5, '0');

-- Sale items for the recent activity window.
insert into sale_items (
  sale_id,
  product_id,
  quantity,
  unit_price,
  line_total
)
select
  s.id,
  p.id,
  1 + (receipt_no % 11) as quantity,
  p.unit_price,
  round(((1 + (receipt_no % 11)) * p.unit_price)::numeric, 2) as line_total
from generate_series(current_date - 4, current_date + 2, interval '1 day') activity_day
cross join generate_series(1, 90) receipt_no
join sales s
  on s.receipt_number = 'DEMO-LARGE-RECENT-' || to_char(activity_day, 'YYYYMMDD') || '-' || lpad(receipt_no::text, 4, '0')
join products p
  on p.sku = 'DEMO-' || lpad(((((extract(day from activity_day)::integer * 97) + (receipt_no * 31)) % 1200) + 1)::text, 5, '0');

-- Match sale items with stock movements so reports and fallback forecasting have history.
insert into stock_movements (
  product_id,
  movement_type,
  quantity,
  notes,
  created_at
)
select
  si.product_id,
  'sale',
  si.quantity,
  'DEMO-LARGE: ' || s.receipt_number,
  s.created_at
from sale_items si
join sales s on s.id = si.sale_id
where s.receipt_number like 'DEMO-LARGE-%';

-- Add restocks and damages to make stock movement screens more realistic.
insert into stock_movements (
  product_id,
  movement_type,
  quantity,
  notes,
  created_at
)
select
  p.id,
  case when gs % 9 = 0 then 'damage' else 'restock' end,
  case when gs % 9 = 0 then 1 + (gs % 4) else 20 + (gs % 80) end,
  case when gs % 9 = 0 then 'DEMO-LARGE: damaged items' else 'DEMO-LARGE: supplier restock' end,
  now() - ((gs % 90)::text || ' days')::interval
from generate_series(1, 1600) gs
join products p
  on p.sku = 'DEMO-' || lpad((((gs * 19) % 1200) + 1)::text, 5, '0');

-- Update sales totals from sale items.
update sales s
set subtotal = totals.subtotal,
    total_amount = greatest(totals.subtotal - s.discount_amount, 0)
from (
  select sale_id, round(sum(line_total)::numeric, 2) as subtotal
  from sale_items
  group by sale_id
) totals
where s.id = totals.sale_id
  and s.receipt_number like 'DEMO-LARGE-%';

-- Forecast rows for all demo products. Some intentionally trigger reorder.
insert into demand_forecasts (
  product_id,
  model_name,
  training_data_source,
  history_start,
  history_end,
  forecast_date,
  horizon_days,
  predicted_demand,
  predicted_daily_demand,
  safety_stock,
  recommended_reorder_quantity,
  reorder_signal,
  validation_mae,
  validation_rmse,
  validation_mape,
  metadata,
  generated_at
)
select
  p.id,
  case when row_number() over (order by p.sku) % 3 = 0 then 'sarima' else 'synthetic_demo_model' end,
  'demo-large-data.sql',
  current_date - 120,
  current_date - 1,
  current_date,
  7,
  round((4 + ((row_number() over (order by p.sku)) % 22) * 0.75)::numeric, 2),
  round((0.6 + ((row_number() over (order by p.sku)) % 9) * 0.22)::numeric, 4),
  8 + ((row_number() over (order by p.sku)) % 55),
  greatest(p.reorder_quantity, 30 + ((row_number() over (order by p.sku)) % 150)),
  p.current_stock <= p.reorder_point
    or row_number() over (order by p.sku) % 14 = 0,
  round((0.4 + ((row_number() over (order by p.sku)) % 10) * 0.12)::numeric, 4),
  round((0.7 + ((row_number() over (order by p.sku)) % 10) * 0.15)::numeric, 4),
  round((5 + ((row_number() over (order by p.sku)) % 18))::numeric, 4),
  jsonb_build_object('dataset', 'large_demo', 'generated_products', 1200),
  now() - interval '1 day'
from products p
where p.sku like 'DEMO-%';

-- Pending forecast purchase orders for a subset, so approval screens have data.
insert into purchase_orders (
  order_number,
  product_id,
  quantity_ordered,
  status,
  triggered_by,
  predicted_days_until_stockout,
  notes,
  created_at
)
select
  'PO-DEMO-' || lpad(gs::text, 5, '0'),
  p.id,
  p.reorder_quantity,
  case gs % 5
    when 0 then 'approved'
    when 1 then 'ordered'
    when 2 then 'received'
    else 'pending'
  end,
  'ai_prediction',
  2 + (gs % 20),
  'DEMO-LARGE: generated forecast purchase order',
  now() - ((gs % 30)::text || ' days')::interval
from generate_series(1, 220) gs
join products p
  on p.sku = 'DEMO-' || lpad((((gs * 23) % 1200) + 1)::text, 5, '0')
where not exists (
  select 1
  from purchase_orders po
  where po.product_id = p.id
    and po.status = 'pending'
);

commit;

notify pgrst, 'reload schema';

-- Quick counts for the SQL Editor result panel.
select 'products' as table_name, count(*) as rows from products where sku like 'DEMO-%'
union all
select 'sales', count(*) from sales where receipt_number like 'DEMO-LARGE-%'
union all
select 'sale_items', count(*)
from sale_items si
join sales s on s.id = si.sale_id
where s.receipt_number like 'DEMO-LARGE-%'
union all
select 'stock_movements', count(*) from stock_movements where notes like 'DEMO-LARGE:%'
union all
select 'demand_forecasts', count(*)
from demand_forecasts df
join products p on p.id = df.product_id
where p.sku like 'DEMO-%'
union all
select 'purchase_orders', count(*) from purchase_orders where order_number like 'PO-DEMO-%';
