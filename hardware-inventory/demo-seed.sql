-- ============================================================
-- Smart Inventory Management System — Demo Seed Data
-- ============================================================
-- WARNING: Wipes all existing inventory data. Safe to re-run.
-- Profiles / auth users are NOT touched.
-- Run this in the Supabase SQL Editor AFTER supabase-schema.sql.
-- ============================================================

-- ============================================================
-- STEP 1 — CLEAR EXISTING INVENTORY DATA
-- ============================================================
TRUNCATE TABLE
  demand_forecasts,
  purchase_orders,
  sales_import_items,
  sales_import_batches,
  sale_items,
  sales,
  stock_movements,
  product_import_batches,
  products
CASCADE;

-- ============================================================
-- STEP 2 — PRODUCTS  (56 SKUs across 8 categories)
-- Low / critical stock items are deliberate for demo impact.
-- ============================================================
INSERT INTO products
  (name, sku, category, current_stock, reorder_point, reorder_quantity, unit_price, supplier_name)
VALUES
-- ── FASTENERS (10) ──────────────────────────────────────────
('Wood Screws 3" Box 100ct',        'SCR-WD-300',  'Fasteners',  342,  50, 200,   550.00, 'FastenAll Supplies'),
('Drywall Screws 1.5" Box 200ct',   'SCR-DW-150',  'Fasteners',   12,  25, 150,   480.00, 'FastenAll Supplies'),
('Hex Bolts M10 x 50mm 50ct',       'BLT-HX-M10',  'Fasteners',   88,  20,  80,   950.00, 'BoltMaster Co'),
('Concrete Anchors 1/4" 50ct',      'ANC-CN-025',  'Fasteners',  208,  30, 100,  1100.00, 'BoltMaster Co'),
('Roofing Nails 1.75" 5lb',         'NAL-RF-175',  'Fasteners',  118,  25, 100,   820.00, 'FastenAll Supplies'),
('Framing Nails 3.25" 5lb',         'NAL-FR-325',  'Fasteners',    6,  20,  80,  1150.00, 'FastenAll Supplies'),
('Self-Tapping Screws #8 100ct',    'SCR-ST-08',   'Fasteners',  278,  40, 150,   650.00, 'FastenAll Supplies'),
('Carriage Bolts 3/8"x3" 25ct',     'BLT-CR-38',   'Fasteners',   70,  15,  60,   780.00, 'BoltMaster Co'),
('Zinc Nuts M8 100ct',              'NUT-ZN-M8',   'Fasteners',  168,  30, 100,   390.00, 'BoltMaster Co'),
('Flat Washers 1/2" 100ct',         'WSH-HX-050',  'Fasteners',  244,  30, 100,   320.00, 'FastenAll Supplies'),
-- ── POWER TOOLS (8) ─────────────────────────────────────────
('Cordless Drill 18V',              'DRL-CL-18V',  'Power Tools', 12,   5,  20, 28500.00, 'ProTool Inc'),
('Circular Saw 7.25"',              'SAW-CR-725',  'Power Tools',  7,   3,  10, 38000.00, 'ProTool Inc'),
('Angle Grinder 4.5"',              'GRN-AG-45',   'Power Tools',  3,   5,  15, 12500.00, 'ProTool Inc'),
('Jigsaw 6.5A',                     'JSW-65A-STD', 'Power Tools',  9,   4,  12, 11000.00, 'ProTool Inc'),
('Random Orbital Sander 5"',        'SND-RO-5IN',  'Power Tools', 11,   4,  12,  9500.00, 'ProTool Inc'),
('Impact Driver 20V',               'DRV-IM-20V',  'Power Tools',  3,   4,  15, 22000.00, 'ProTool Inc'),
('Power Planer 3-1/4"',             'PLN-PW-325',  'Power Tools',  2,   3,  10, 25000.00, 'ProTool Inc'),
('Air Compressor 6gal',             'CMP-AR-6GL',  'Power Tools', 14,   3,  10, 48000.00, 'ProTool Inc'),
-- ── PLUMBING (8) ────────────────────────────────────────────
('PVC Pipe 2" x 10ft',              'PIP-PV-210',  'Plumbing',   154,  30, 100,  1200.00, 'FlowPipe Ltd'),
('Copper Pipe 3/4" x 10ft',         'PIP-CP-075',  'Plumbing',    14,  20,  60,  4500.00, 'FlowPipe Ltd'),
('Ball Valve 1/2"',                 'VLV-BL-050',  'Plumbing',    68,  15,  40,   950.00, 'FlowPipe Ltd'),
('PVC Elbow 2" 90deg',              'FIT-PV-2E90', 'Plumbing',   218,  40, 100,   145.00, 'FlowPipe Ltd'),
('Pipe Thread Tape 1/2"',           'TAP-PT-050',  'Plumbing',   298,  50, 150,    85.00, 'FlowPipe Ltd'),
('Compression Fitting 1/2"',        'FIT-CP-050',  'Plumbing',    88,  20,  60,   580.00, 'FlowPipe Ltd'),
('P-Trap 1.5" PVC',                 'TRP-PV-150',  'Plumbing',    50,  15,  40,   420.00, 'FlowPipe Ltd'),
('Flexible Hose 12"',               'HOS-FL-12',   'Plumbing',     5,  15,  50,   750.00, 'FlowPipe Ltd'),
-- ── PAINT (7) ───────────────────────────────────────────────
('Interior Latex Paint White 1gal', 'PNT-LT-W1G',  'Paint',       24,  10,  40,  3200.00, 'ColorPro Paints'),
('Exterior Paint Gray 1gal',        'PNT-EX-G1G',  'Paint',        4,  10,  35,  4500.00, 'ColorPro Paints'),
('Paint Roller Kit 9"',             'PNT-RK-9IN',  'Paint',       44,  10,  30,   850.00, 'ColorPro Paints'),
('Primer Sealer 1gal',              'PNT-PR-1GL',  'Paint',       20,   8,  30,  2800.00, 'ColorPro Paints'),
('Spray Paint Black 12oz',          'SPR-BK-12',   'Paint',       86,  20,  60,   750.00, 'ColorPro Paints'),
('Wood Stain Dark Walnut 1qt',      'STN-DW-1QT',  'Paint',       32,  10,  30,  1800.00, 'ColorPro Paints'),
('Caulk White Silicone 10oz',       'CLK-WH-SIL',  'Paint',       74,  20,  60,   550.00, 'ColorPro Paints'),
-- ── LUMBER (6) ──────────────────────────────────────────────
('2x4x8 Pine Lumber',               'LMB-2x4-8',   'Lumber',     135,  40, 100,  1100.00, 'TimberFirst LLC'),
('Plywood 4x8 Sheet 3/4"',          'PLY-4x8-75',  'Lumber',      11,  15,  30,  7500.00, 'TimberFirst LLC'),
('OSB Board 4x8 7/16"',             'OSB-4x8-716', 'Lumber',       8,  15,  30,  4800.00, 'TimberFirst LLC'),
('2x6x12 Pine Lumber',              'LMB-2x6-12',  'Lumber',      62,  20,  60,  2200.00, 'TimberFirst LLC'),
('1x4x8 Pine Boards',               'LMB-1x4-8',   'Lumber',      80,  25,  60,   950.00, 'TimberFirst LLC'),
('Cedar Deck Board 2x6x16',         'LMB-CD-2x6',  'Lumber',      30,  12,  30,  3500.00, 'TimberFirst LLC'),
-- ── CONCRETE (5) ────────────────────────────────────────────
('Cement Mix 60lb Bag',             'CMT-MX-60',   'Concrete',    46,  20,  50,  1150.00, 'BuildBase Co'),
('Concrete Block 8x8x16',           'BLK-CN-888',  'Concrete',   198,  50, 100,   120.00, 'BuildBase Co'),
('Mortar Mix 60lb Bag',             'MRT-MX-60',   'Concrete',    34,  15,  50,  1200.00, 'BuildBase Co'),
('Sand 50lb Bag',                   'SND-AG-50',   'Concrete',    90,  25,  75,   480.00, 'BuildBase Co'),
('Rebar 1/2" x 20ft',               'RBR-050-20',  'Concrete',    40,  10,  30,  2800.00, 'BuildBase Co'),
-- ── ELECTRICAL (7) ──────────────────────────────────────────
('Electrical Wire 12AWG 100ft',     'WIR-EL-12',   'Electrical',  22,  10,  20,  8500.00, 'Spark Electric'),
('Circuit Breaker 20A',             'BRK-CB-20A',  'Electrical',   5,   8,  20,  1800.00, 'Spark Electric'),
('Duplex Outlet 15A',               'OUT-DP-15A',  'Electrical', 106,  20,  60,   350.00, 'Spark Electric'),
('Light Switch Single Pole',        'SWT-SP-STD',  'Electrical',  83,  20,  60,   280.00, 'Spark Electric'),
('Junction Box 4" Square',          'BOX-JN-4SQ',  'Electrical', 140,  25,  80,   185.00, 'Spark Electric'),
('GFCI Outlet 20A',                 'OUT-GF-20A',  'Electrical',  28,  10,  30,  2800.00, 'Spark Electric'),
('Conduit 1/2" x 10ft',             'CDT-050-10',  'Electrical',  53,  15,  40,   720.00, 'Spark Electric'),
-- ── SAFETY (5) ──────────────────────────────────────────────
('Safety Helmet Hard Hat',          'SAF-HM-STD',  'Safety',      34,  10,  25,  1850.00, 'SafeGuard Equip'),
('Safety Glasses Clear',            'SAF-GL-CLR',  'Safety',      60,  15,  40,   680.00, 'SafeGuard Equip'),
('Work Gloves L Size',              'SAF-GV-LRG',  'Safety',       9,  12,  30,   850.00, 'SafeGuard Equip'),
('Hi-Vis Safety Vest L',            'SAF-VS-LRG',  'Safety',      19,   8,  20,  1950.00, 'SafeGuard Equip'),
('Ear Protection 25dB',             'SAF-EP-25D',  'Safety',      40,  12,  30,  1150.00, 'SafeGuard Equip');

-- ============================================================
-- STEP 3 — STOCK MOVEMENTS
-- Generates 91 days of daily sales history + periodic restocks
-- + a handful of damages and manual adjustments.
-- Produces ~5 000–6 000 rows.
-- ============================================================
DO $$
DECLARE
  v_p        RECORD;
  v_day      INTEGER;
  v_ts       TIMESTAMPTZ;
  v_dow      INTEGER;
  v_qty      INTEGER;
  v_trend    FLOAT;
BEGIN
  PERFORM setseed(0.7382);

  FOR v_p IN (
    SELECT
      p.id, p.sku, p.category,
      CASE p.category
        WHEN 'Fasteners'   THEN 0.07
        WHEN 'Power Tools' THEN 0.48
        WHEN 'Plumbing'    THEN 0.17
        WHEN 'Paint'       THEN 0.21
        WHEN 'Lumber'      THEN 0.14
        WHEN 'Concrete'    THEN 0.18
        WHEN 'Electrical'  THEN 0.15
        WHEN 'Safety'      THEN 0.27
        ELSE 0.20
      END AS skip_prob,
      CASE p.category
        WHEN 'Fasteners'   THEN 20
        WHEN 'Power Tools' THEN  1
        WHEN 'Plumbing'    THEN 10
        WHEN 'Paint'       THEN  5
        WHEN 'Lumber'      THEN 13
        WHEN 'Concrete'    THEN 22
        WHEN 'Electrical'  THEN 11
        WHEN 'Safety'      THEN  4
        ELSE 6
      END AS base_qty,
      CASE p.category
        WHEN 'Fasteners'   THEN 28
        WHEN 'Power Tools' THEN  2
        WHEN 'Plumbing'    THEN 14
        WHEN 'Paint'       THEN  8
        WHEN 'Lumber'      THEN 20
        WHEN 'Concrete'    THEN 32
        WHEN 'Electrical'  THEN 16
        WHEN 'Safety'      THEN  6
        ELSE 8
      END AS qty_var,
      CASE p.category
        WHEN 'Fasteners'   THEN 14
        WHEN 'Power Tools' THEN 45
        WHEN 'Plumbing'    THEN 21
        WHEN 'Paint'       THEN 21
        WHEN 'Lumber'      THEN 18
        WHEN 'Concrete'    THEN 14
        WHEN 'Electrical'  THEN 21
        WHEN 'Safety'      THEN 30
        ELSE 21
      END AS restock_every,
      CASE p.category
        WHEN 'Fasteners'   THEN 28
        WHEN 'Power Tools' THEN 10
        WHEN 'Plumbing'    THEN 15
        WHEN 'Paint'       THEN 12
        WHEN 'Lumber'      THEN 20
        WHEN 'Concrete'    THEN 24
        WHEN 'Electrical'  THEN 15
        WHEN 'Safety'      THEN 12
        ELSE 14
      END AS restock_mult
    FROM products p ORDER BY p.sku
  ) LOOP
    -- Day 0 = today, 91 = 91 days ago, -1 = tomorrow
    FOR v_day IN REVERSE 91..(-1) LOOP
      v_ts  := (CURRENT_DATE - v_day)::TIMESTAMPTZ
              + ((9 + floor(random() * 9)) || ' hours')::INTERVAL
              + ((floor(random() * 59)) || ' minutes')::INTERVAL;
      v_dow := EXTRACT(DOW FROM v_ts)::INTEGER;

      -- Gradual upward trend toward present
      v_trend := 1.0 + (91 - v_day)::FLOAT / 350.0;

      -- ── SALE MOVEMENT ──────────────────────────────────────
      IF random() > (v_p.skip_prob - (91 - v_day) * 0.0004) THEN
        v_qty := GREATEST(1,
          floor((v_p.base_qty + random() * v_p.qty_var) * v_trend)::INTEGER
        );

        -- Power tools: contractors don't buy on weekends → skip ~60% of weekend days
        IF v_p.category = 'Power Tools' AND v_dow IN (0, 6) AND random() > 0.4 THEN
          -- no sale today for this product
        ELSE
          -- DIY products move faster on weekends
          IF v_p.category IN ('Fasteners', 'Concrete', 'Paint') AND v_dow IN (0, 6) THEN
            v_qty := floor(v_qty * 1.30)::INTEGER;
          END IF;
          INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at)
          VALUES (v_p.id, 'sale', v_qty, 'Daily sales', v_ts);
        END IF;
      END IF;

      -- ── RESTOCK DELIVERY ───────────────────────────────────
      IF v_day > 0 AND v_day % v_p.restock_every = 0 THEN
        INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at)
        VALUES (
          v_p.id, 'restock',
          v_p.base_qty * v_p.restock_mult,
          'Scheduled supplier delivery',
          v_ts + INTERVAL '3 hours'
        );
      END IF;
    END LOOP;

    -- ── RANDOM DAMAGE EVENTS (0–2 per product) ─────────────
    IF random() > 0.40 THEN
      INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at)
      VALUES (
        v_p.id, 'damage',
        GREATEST(1, floor(random() * 4)::INTEGER),
        'Damaged in storage',
        (CURRENT_DATE - floor(random() * 70)::INTEGER)::TIMESTAMPTZ + INTERVAL '11 hours'
      );
    END IF;
    IF random() > 0.68 THEN
      INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at)
      VALUES (
        v_p.id, 'damage',
        1,
        'Damaged during handling',
        (CURRENT_DATE - floor(random() * 35)::INTEGER)::TIMESTAMPTZ + INTERVAL '14 hours'
      );
    END IF;
  END LOOP;
END $$;

-- Manual stocktake adjustments (adds realism)
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM products WHERE sku = 'SCR-WD-300';
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at)
  VALUES (v_id, 'adjustment', 60, 'Stocktake correction — 60 units found in back-room overflow', NOW() - INTERVAL '18 days');

  SELECT id INTO v_id FROM products WHERE sku = 'BLK-CN-888';
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at)
  VALUES (v_id, 'adjustment', 40, 'Stocktake — pallet found unmarked in yard storage', NOW() - INTERVAL '25 days');

  SELECT id INTO v_id FROM products WHERE sku = 'OUT-DP-15A';
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at)
  VALUES (v_id, 'adjustment', 25, 'Annual audit correction', NOW() - INTERVAL '10 days');

  SELECT id INTO v_id FROM products WHERE sku = 'LMB-2x4-8';
  INSERT INTO stock_movements (product_id, movement_type, quantity, notes, created_at)
  VALUES (v_id, 'restock', 200, 'Emergency top-up — peak season', NOW() - INTERVAL '7 days');
END $$;

-- ============================================================
-- STEP 4 — SALES RECORDS + SALE ITEMS + IMPORT BATCHES
-- One import batch and one aggregated sale per day for 92 days.
-- Also includes today and tomorrow.
-- Produces ~92 sales, ~700 sale_items, ~92 batches.
-- ============================================================
DO $$
DECLARE
  v_day       INTEGER;
  v_date      DATE;
  v_sale_id   UUID;
  v_batch_id  UUID;
  v_receipt   TEXT;
  v_hash      TEXT;
  v_p         RECORD;
  v_qty       INTEGER;
  v_price     NUMERIC;
  v_subtotal  NUMERIC;
  v_units     INTEGER;
BEGIN
  PERFORM setseed(0.4491);

  FOR v_day IN REVERSE 91..(-1) LOOP
    v_date     := CURRENT_DATE - v_day;
    v_receipt  := 'RCP-' || to_char(v_date, 'YYYYMMDD') || '-001';
    v_hash     := md5('batch-' || to_char(v_date, 'YYYYMMDD'));
    v_subtotal := 0;
    v_units    := 0;

    -- Import batch record
    INSERT INTO sales_import_batches (file_name, file_hash, total_rows, total_units, total_amount, imported_at)
    VALUES (
      'cashier_export_' || to_char(v_date, 'YYYY_MM_DD') || '.csv',
      v_hash, 0, 0, 0,
      v_date::TIMESTAMPTZ + INTERVAL '18 hours'
    ) RETURNING id INTO v_batch_id;

    -- Sale header
    INSERT INTO sales (receipt_number, total_amount, created_at)
    VALUES (
      v_receipt, 0,
      v_date::TIMESTAMPTZ + INTERVAL '17 hours' + ((floor(random() * 59)) || ' minutes')::INTERVAL
    ) RETURNING id INTO v_sale_id;

    -- 5–12 line items per day
    FOR v_p IN (
      SELECT id, sku, unit_price
      FROM products
      WHERE unit_price IS NOT NULL
      ORDER BY random()
      LIMIT (5 + floor(random() * 8))::INTEGER
    ) LOOP
      v_qty   := GREATEST(1, floor(random() * 22 + 1)::INTEGER);
      v_price := v_p.unit_price;
      v_subtotal := v_subtotal + (v_qty * v_price);
      v_units    := v_units + v_qty;

      INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, line_total)
      VALUES (v_sale_id, v_p.id, v_qty, v_price, v_qty * v_price);

      INSERT INTO sales_import_items (batch_id, product_id, sku, quantity, unit_price, line_total)
      VALUES (v_batch_id, v_p.id, v_p.sku, v_qty, v_price, v_qty * v_price);
    END LOOP;

    -- Update header totals
    UPDATE sales
    SET total_amount = v_subtotal
    WHERE id = v_sale_id;

    UPDATE sales_import_batches
    SET total_rows = v_units, total_units = v_units, total_amount = v_subtotal
    WHERE id = v_batch_id;
  END LOOP;
END $$;

-- ============================================================
-- STEP 5 — PURCHASE ORDERS
-- Mix of all statuses to showcase the full approval workflow.
-- ============================================================
DO $$
DECLARE pid UUID;
BEGIN
  -- RECEIVED (completed historical orders)
  SELECT id INTO pid FROM products WHERE sku = 'SCR-DW-150';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260401-001', pid, 150, 'received', 'ai_prediction', 4, 'Urgent restock — stock critically low', NOW() - INTERVAL '46 days');

  SELECT id INTO pid FROM products WHERE sku = 'GRN-AG-45';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260408-002', pid, 15, 'received', 'manual', 6, 'Angle grinders low after contractor season', NOW() - INTERVAL '39 days');

  SELECT id INTO pid FROM products WHERE sku = 'PNT-EX-G1G';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260415-003', pid, 35, 'received', 'ai_prediction', 5, 'Paint season demand spike', NOW() - INTERVAL '32 days');

  SELECT id INTO pid FROM products WHERE sku = 'BRK-CB-20A';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260418-004', pid, 20, 'received', 'ai_prediction', 3, 'Critical electrical safety item', NOW() - INTERVAL '29 days');

  SELECT id INTO pid FROM products WHERE sku = 'LMB-2x4-8';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260425-005', pid, 200, 'received', 'manual', 14, 'Seasonal lumber stock-up before peak', NOW() - INTERVAL '22 days');

  SELECT id INTO pid FROM products WHERE sku = 'SND-AG-50';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260428-006', pid, 75, 'received', 'manual', 18, 'Sand replenishment after large project sales', NOW() - INTERVAL '19 days');

  -- ORDERED (in transit from supplier)
  SELECT id INTO pid FROM products WHERE sku = 'PLY-4x8-75';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260506-007', pid, 30, 'approved', 'ai_prediction', 8, 'Plywood below reorder point — awaiting receipt', NOW() - INTERVAL '11 days');

  SELECT id INTO pid FROM products WHERE sku = 'OSB-4x8-716';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260507-008', pid, 30, 'approved', 'ai_prediction', 6, 'OSB board urgent replenishment', NOW() - INTERVAL '10 days');

  SELECT id INTO pid FROM products WHERE sku = 'DRV-IM-20V';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260508-009', pid, 15, 'approved', 'manual', 5, 'Impact drivers — stockout risk this week', NOW() - INTERVAL '9 days');

  -- APPROVED (waiting to be placed with supplier)
  SELECT id INTO pid FROM products WHERE sku = 'PIP-CP-075';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260511-010', pid, 60, 'approved', 'ai_prediction', 9, 'Copper pipe well below reorder threshold', NOW() - INTERVAL '6 days');

  SELECT id INTO pid FROM products WHERE sku = 'HOS-FL-12';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260512-011', pid, 50, 'approved', 'ai_prediction', 4, 'Flexible hose — 5 units left, approved for immediate order', NOW() - INTERVAL '5 days');

  -- PENDING (awaiting approval — shows on Dashboard for approval_manager)
  SELECT id INTO pid FROM products WHERE sku = 'NAL-FR-325';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260514-012', pid, 80, 'pending', 'ai_prediction', 3, 'Framing nails nearly depleted — needs immediate approval', NOW() - INTERVAL '3 days');

  SELECT id INTO pid FROM products WHERE sku = 'SAF-GV-LRG';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260515-013', pid, 30, 'pending', 'ai_prediction', 7, 'Work gloves below safety minimum threshold', NOW() - INTERVAL '2 days');

  SELECT id INTO pid FROM products WHERE sku = 'WIR-EL-12';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260516-014', pid, 20, 'pending', 'manual', 11, 'Electrical wire — monthly reorder check triggered', NOW() - INTERVAL '30 hours');

  SELECT id INTO pid FROM products WHERE sku = 'PLN-PW-325';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260516-015', pid, 10, 'pending', 'ai_prediction', 5, 'Power planer: only 2 units remaining in store', NOW() - INTERVAL '20 hours');

  SELECT id INTO pid FROM products WHERE sku = 'SCR-DW-150';
  INSERT INTO purchase_orders (order_number, product_id, quantity_ordered, status, triggered_by, predicted_days_until_stockout, notes, created_at)
  VALUES ('PO-20260517-016', pid, 150, 'pending', 'ai_prediction', 2, 'Drywall screws: 12 units left — highest priority', NOW() - INTERVAL '2 hours');
END $$;

-- ============================================================
-- STEP 6 — DEMAND FORECASTS
-- One record per product, forecast_date = tomorrow.
-- reorder_signal = true where current_stock <= reorder_point.
-- ============================================================
INSERT INTO demand_forecasts (
  product_id,
  model_name,
  forecast_date,
  predicted_demand,
  predicted_daily_demand,
  safety_stock,
  recommended_reorder_quantity,
  reorder_signal,
  generated_at
)
SELECT
  p.id,
  'holt_winters_additive'                                   AS model_name,
  CURRENT_DATE + 1                                          AS forecast_date,
  ROUND(CASE p.category
    WHEN 'Fasteners'   THEN (200 + random() * 90)
    WHEN 'Power Tools' THEN (  7 + random() *  5)
    WHEN 'Plumbing'    THEN ( 85 + random() * 40)
    WHEN 'Paint'       THEN ( 52 + random() * 24)
    WHEN 'Lumber'      THEN (105 + random() * 50)
    WHEN 'Concrete'    THEN (190 + random() * 90)
    WHEN 'Electrical'  THEN ( 92 + random() * 44)
    WHEN 'Safety'      THEN ( 38 + random() * 18)
    ELSE (48 + random() * 28)
  END::numeric, 2)                                          AS predicted_demand,
  ROUND(CASE p.category
    WHEN 'Fasteners'   THEN (14.5 + random() * 6.0)
    WHEN 'Power Tools' THEN ( 0.5 + random() * 0.4)
    WHEN 'Plumbing'    THEN ( 6.1 + random() * 2.8)
    WHEN 'Paint'       THEN ( 3.7 + random() * 1.8)
    WHEN 'Lumber'      THEN ( 7.5 + random() * 3.6)
    WHEN 'Concrete'    THEN (13.6 + random() * 6.4)
    WHEN 'Electrical'  THEN ( 6.6 + random() * 3.1)
    WHEN 'Safety'      THEN ( 2.7 + random() * 1.3)
    ELSE (3.4 + random() * 2.0)
  END::numeric, 4)                                          AS predicted_daily_demand,
  CASE p.category
    WHEN 'Fasteners'   THEN 45
    WHEN 'Power Tools' THEN  5
    WHEN 'Plumbing'    THEN 22
    WHEN 'Paint'       THEN 14
    WHEN 'Lumber'      THEN 28
    WHEN 'Concrete'    THEN 48
    WHEN 'Electrical'  THEN 24
    WHEN 'Safety'      THEN 12
    ELSE 14
  END                                                       AS safety_stock,
  CASE p.category
    WHEN 'Fasteners'   THEN 200
    WHEN 'Power Tools' THEN  15
    WHEN 'Plumbing'    THEN  80
    WHEN 'Paint'       THEN  40
    WHEN 'Lumber'      THEN  80
    WHEN 'Concrete'    THEN 100
    WHEN 'Electrical'  THEN  60
    WHEN 'Safety'      THEN  30
    ELSE 40
  END                                                       AS recommended_reorder_quantity,
  (p.current_stock <= p.reorder_point)                      AS reorder_signal,
  NOW() - INTERVAL '90 minutes'                             AS generated_at
FROM products p;
