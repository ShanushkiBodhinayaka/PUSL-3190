-- ============================================================
-- Hardware Store Seed Data
-- Paste into Supabase SQL Editor AFTER running supabase-schema.sql
-- NOTE: You must manually create auth users in Supabase Dashboard
-- then update the IDs below to match the real auth user UUIDs.
-- ============================================================

-- ============================================================
-- PROFILES (create auth users first in Supabase Auth dashboard,
--           then copy their UUIDs here)
-- ============================================================
-- Replace these UUIDs with real ones from your Supabase Auth table
-- INSERT INTO profiles (id, full_name, role) VALUES
--   ('REPLACE-WITH-ADMIN-UUID',       'John Admin',        'admin'),
--   ('REPLACE-WITH-INVENTORY-UUID',   'Sarah Inventory',   'inventory_manager'),
--   ('REPLACE-WITH-SALES-UUID',       'Tom Sales',         'sales_operator'),
--   ('REPLACE-WITH-APPROVER-UUID',    'Lisa Approver',     'approval_manager'),
--   ('REPLACE-WITH-STAFF-UUID',       'Mike Staff',        'staff');

-- ============================================================
-- PRODUCTS — 20 realistic hardware store items
-- ============================================================
INSERT INTO products (name, sku, category, current_stock, reorder_point, reorder_quantity, unit_price, supplier_name) VALUES
  ('Wood Screws 3" Box (100ct)',       'SCR-WD-300',    'Fasteners',        450,  50,  200,  8.99,   'FastenAll Supplies'),
  ('Drywall Screws 1.5" Box (200ct)',  'SCR-DW-150',    'Fasteners',        8,    25,  100,  6.49,   'FastenAll Supplies'),
  ('Hex Bolts M10 x 50mm (50ct)',      'BLT-HX-M10',    'Fasteners',        120,  20,  80,   12.99,  'BoltMaster Co'),
  ('Cordless Drill 18V',               'DRL-CL-18V',    'Power Tools',      14,   5,   20,   149.99, 'ProTool Inc'),
  ('Circular Saw 7.25"',               'SAW-CR-725',    'Power Tools',      6,    3,   10,   199.99, 'ProTool Inc'),
  ('Angle Grinder 4.5"',               'GRN-AG-45',     'Power Tools',      3,    5,   15,   89.99,  'ProTool Inc'),
  ('PVC Pipe 2" x 10ft',               'PIP-PV-210',    'Plumbing',         200,  30,  100,  7.50,   'FlowPipe Ltd'),
  ('Copper Pipe 3/4" x 10ft',          'PIP-CP-075',    'Plumbing',         12,   20,  60,   24.99,  'FlowPipe Ltd'),
  ('Ball Valve 1/2"',                  'VLV-BL-050',    'Plumbing',         85,   15,  40,   15.99,  'FlowPipe Ltd'),
  ('Interior Latex Paint 1gal White',  'PNT-LT-W1G',    'Paint',            35,   10,  40,   29.99,  'ColorPro Paints'),
  ('Exterior Paint 1gal Gray',         'PNT-EX-G1G',    'Paint',            4,    10,  35,   39.99,  'ColorPro Paints'),
  ('Paint Roller Kit 9"',              'PNT-RK-9IN',    'Paint',            60,   10,  30,   12.49,  'ColorPro Paints'),
  ('2x4x8 Lumber (Pine)',              'LMB-2x4-8',     'Lumber',           180,  40,  100,  5.99,   'TimberFirst LLC'),
  ('Plywood 4x8 Sheet 3/4"',          'PLY-4x8-75',    'Lumber',           22,   15,  30,   55.99,  'TimberFirst LLC'),
  ('OSB Board 4x8 Sheet 7/16"',       'OSB-4x8-716',   'Lumber',           9,    15,  30,   32.99,  'TimberFirst LLC'),
  ('Cement Mix 60lb Bag',              'CMT-MX-60',     'Concrete',         65,   20,  50,   8.99,   'BuildBase Co'),
  ('Concrete Block 8x8x16',           'BLK-CN-888',    'Concrete',         250,  50,  100,  2.49,   'BuildBase Co'),
  ('Electrical Wire 12AWG 100ft',      'WIR-EL-12',     'Electrical',       28,   10,  20,   59.99,  'Spark Electric Supply'),
  ('Circuit Breaker 20A',              'BRK-CB-20A',    'Electrical',       5,    8,   20,   12.99,  'Spark Electric Supply'),
  ('Safety Helmet (Hard Hat)',         'SAF-HM-STD',    'Safety',           42,   10,  25,   24.99,  'SafeGuard Equipment');

-- ============================================================
-- STOCK MOVEMENTS — realistic movement history (last 30 days)
-- ============================================================
-- This generates movement data referencing product SKUs
DO $$
DECLARE
  v_scr_dw   uuid;
  v_drl      uuid;
  v_grn      uuid;
  v_pip_cp   uuid;
  v_pnt_ex   uuid;
  v_osb      uuid;
  v_brk      uuid;
  v_any      uuid;
BEGIN
  SELECT id INTO v_scr_dw FROM products WHERE sku = 'SCR-DW-150' LIMIT 1;
  SELECT id INTO v_drl    FROM products WHERE sku = 'DRL-CL-18V' LIMIT 1;
  SELECT id INTO v_grn    FROM products WHERE sku = 'GRN-AG-45'  LIMIT 1;
  SELECT id INTO v_pip_cp FROM products WHERE sku = 'PIP-CP-075' LIMIT 1;
  SELECT id INTO v_pnt_ex FROM products WHERE sku = 'PNT-EX-G1G' LIMIT 1;
  SELECT id INTO v_osb    FROM products WHERE sku = 'OSB-4x8-716' LIMIT 1;
  SELECT id INTO v_brk    FROM products WHERE sku = 'BRK-CB-20A' LIMIT 1;

  -- Drywall Screws - heavy sales (critical stock)
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at) VALUES
    (v_scr_dw, 'sale', 15, 'Contractor bulk order', now() - interval '28 days'),
    (v_scr_dw, 'sale', 20, 'Walk-in customer',       now() - interval '25 days'),
    (v_scr_dw, 'sale', 10, 'Small contractor',       now() - interval '22 days'),
    (v_scr_dw, 'sale', 18, 'Daily sales',            now() - interval '18 days'),
    (v_scr_dw, 'sale', 12, 'Daily sales',            now() - interval '14 days'),
    (v_scr_dw, 'sale', 8,  'Daily sales',            now() - interval '10 days'),
    (v_scr_dw, 'sale', 9,  'Daily sales',            now() - interval '5 days');

  -- Cordless Drill - moderate sales
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at) VALUES
    (v_drl, 'sale', 3, 'Weekend sales',   now() - interval '27 days'),
    (v_drl, 'sale', 2, 'Contractor sale', now() - interval '20 days'),
    (v_drl, 'sale', 4, 'Promo weekend',   now() - interval '12 days'),
    (v_drl, 'sale', 2, 'Regular sale',    now() - interval '5 days');

  -- Angle Grinder - critical
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at) VALUES
    (v_grn, 'sale', 3, 'Contractor order', now() - interval '25 days'),
    (v_grn, 'sale', 2, 'Walk-in sale',     now() - interval '15 days'),
    (v_grn, 'sale', 1, 'Online order',     now() - interval '7 days');

  -- Copper Pipe - at risk
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at) VALUES
    (v_pip_cp, 'sale', 5,  'Plumber order',     now() - interval '29 days'),
    (v_pip_cp, 'sale', 8,  'Contractor bulk',   now() - interval '20 days'),
    (v_pip_cp, 'sale', 6,  'Regular sales',     now() - interval '12 days'),
    (v_pip_cp, 'sale', 4,  'Walk-in customer',  now() - interval '4 days');

  -- Exterior Paint - low stock
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at) VALUES
    (v_pnt_ex, 'sale', 8,  'Weekend sale',    now() - interval '28 days'),
    (v_pnt_ex, 'sale', 10, 'Contractor bulk', now() - interval '21 days'),
    (v_pnt_ex, 'sale', 7,  'Regular sales',   now() - interval '14 days'),
    (v_pnt_ex, 'sale', 6,  'Daily sales',     now() - interval '7 days');

  -- OSB Board - at risk
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at) VALUES
    (v_osb, 'sale', 4, 'Contractor order', now() - interval '26 days'),
    (v_osb, 'sale', 3, 'Weekend sale',     now() - interval '18 days'),
    (v_osb, 'sale', 5, 'Bulk order',       now() - interval '10 days'),
    (v_osb, 'sale', 2, 'Regular sale',     now() - interval '3 days');

  -- Circuit Breaker - critical
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at) VALUES
    (v_brk, 'sale', 3, 'Electrician order', now() - interval '27 days'),
    (v_brk, 'sale', 4, 'Contractor bulk',   now() - interval '18 days'),
    (v_brk, 'sale', 2, 'Shop sale',         now() - interval '9 days'),
    (v_brk, 'sale', 1, 'Daily sale',        now() - interval '2 days');

END $$;
