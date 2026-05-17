# HardwareHub Project Report README

## 1. Project Overview

HardwareHub is a role-based inventory management system for a hardware store. The application supports product catalog management, stock movement tracking, cashier sales import, purchase order management, approval workflows, demand forecasting, reporting, and user administration.

The main goal of the project is to reduce manual inventory errors by centralizing stock records, enforcing role-based permissions, validating stock updates, and using forecast signals to support restocking decisions.

The system is implemented as a React frontend connected to Supabase for authentication, PostgreSQL database storage, row-level security, server-side functions, realtime updates, and an Edge Function for inviting users.

## 2. Main Objectives

- Maintain an accurate product inventory with SKU-based identification.
- Allow controlled stock updates through sales, restocks, adjustments, and damage records.
- Prevent invalid stock operations such as negative stock or duplicate pending purchase orders.
- Support CSV-based product and sales import workflows.
- Provide role-specific access for administrators, inventory staff, sales operators, approval managers, and staff.
- Generate reorder recommendations using trained demand forecasts where available, with a fallback heuristic.
- Support approval and receiving workflows for purchase orders.
- Provide dashboards and reports for operational visibility.
- Keep critical write operations transactional at the database level.

## 3. Technology Stack

### Frontend

- React 19 for the user interface.
- React Router for protected route navigation.
- Tailwind CSS for styling and responsive layout.
- Headless UI for modal dialogs.
- Heroicons for interface icons.
- Recharts for report visualizations.
- React Hot Toast for success and error notifications.

### Backend and Database

- Supabase Auth for login sessions.
- Supabase PostgreSQL for relational data storage.
- Supabase Row Level Security for authorization at the database layer.
- Supabase RPC functions for transactional business operations.
- Supabase Realtime for live updates on selected screens.
- Supabase Edge Functions for privileged user invitation.

### Forecasting

- Python forecasting scripts in the `forecasting/` directory.
- Synthetic sales history generation.
- Model training and forecast export.
- Demand forecast records loaded into the `demand_forecasts` table.

### Testing

- React Scripts test runner.
- Jest and React Testing Library.
- Unit tests for role logic, navigation logic, protected route behavior, stock prediction logic, and product search helper logic.

## 4. High-Level Architecture

```text
User Browser
  |
  | React frontend
  | - pages
  | - shared components
  | - auth context
  | - domain helpers
  |
  v
Supabase
  |
  | Auth
  | - login session
  | - user identity
  |
  | PostgreSQL
  | - products
  | - stock_movements
  | - sales
  | - sale_items
  | - purchase_orders
  | - demand_forecasts
  | - profiles
  |
  | RPC functions
  | - record_stock_movement
  | - import_sales_batch
  | - import_product_master
  | - place_forecast_purchase_orders
  | - receive_purchase_order
  | - update_product_master
  | - archive_product
  | - delete_product
  |
  | Edge Functions
  | - invite-user
  | - delete-user
  | - generate-forecasts
```

The frontend is responsible for user interaction, previews, UI validation, filtering, and screen-level workflows. The database functions are responsible for enforcing core business rules, permissions, and transactional updates.

## 5. Project Structure

```text
hardware-inventory/
  src/
    App.jsx
    index.js
    index.css
    components/
      Layout.jsx
      Navbar.jsx
      Sidebar.jsx
      ProtectedRoute.jsx
      ProductSearchInput.jsx
      StockCard.jsx
      OrderCard.jsx
    contexts/
      AuthContext.jsx
    lib/
      supabase.js
      roles.js
      navigation.js
      predictions.js
      csv.js
      productSearch.js
    pages/
      Login.jsx
      Dashboard.jsx
      Inventory.jsx
      SalesImport.jsx
      ImportHistory.jsx
      StockMovements.jsx
      PurchaseOrders.jsx
      OrderApproval.jsx
      Reports.jsx
      UserManagement.jsx
  forecasting/
    generate_synthetic_history.py
    train_forecasts.py
    download_online_retail.py
    import_online_retail_seed.py
    generated/
  supabase/
    functions/
      invite-user/
        index.ts
      delete-user/
        index.ts
      generate-forecasts/
        index.ts
  supabase-schema.sql
  seed-data.sql
  demo-large-data.sql
```

## 6. Authentication Flow

Authentication is handled in `src/contexts/AuthContext.jsx`.

The flow is:

1. The app starts and calls `supabase.auth.getSession()`.
2. If a session exists, the app fetches the matching row from the `profiles` table.
3. The profile row provides the role used for route authorization.
4. The auth state is cached in local storage under `hardwarehub.auth-cache`.
5. If a Supabase auth request times out, the app falls back to cached auth data where possible.
6. The app listens to `supabase.auth.onAuthStateChange()` so login and logout changes are reflected immediately.

The auth context exposes:

- `user`: current authenticated Supabase user.
- `profile`: profile row from the database.
- `role`: application role from the profile.
- `loading`: auth bootstrap state.
- `signIn(email, password)`: login wrapper around Supabase Auth.
- `signOut()`: logout wrapper that also clears cached local auth state.

### Auth Timeout Handling

The auth context uses a timeout wrapper around Supabase auth calls. If loading the session or profile takes too long, the app avoids hanging indefinitely and attempts to use cached state instead. This improves resilience during temporary network or Supabase latency issues.

## 7. Route Protection

Routes are protected using `src/components/ProtectedRoute.jsx`.

Protected route behavior:

- If `REACT_APP_DEMO_BYPASS=true`, route checks are skipped for demo mode.
- If auth is loading, the user sees a spinner.
- If no user is logged in, the app redirects to `/login`.
- If the user has no role, the app shows an account setup incomplete message.
- If the user role is not allowed for the route, the app redirects to `/unauthorized`.
- Otherwise, the protected page renders normally.

Route permission configuration is stored in `src/lib/roles.js`.

## 8. Roles and Permissions

The system has five roles.

| Role | Purpose |
| --- | --- |
| `admin` | Full system access, product import, user management, approvals, reports, stock control |
| `inventory_manager` | Inventory maintenance, stock movements, purchase order creation, receiving, reports |
| `sales_operator` | Cashier sales import and sales-only stock movement |
| `approval_manager` | Purchase order approval and reports |
| `staff` | Inventory visibility and basic damage stock movement |

### Route Access Matrix

| Feature / Page | Admin | Inventory Manager | Sales Operator | Approval Manager | Staff |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Yes | Yes | Yes | Yes | Yes |
| Sales Import | Yes | Yes | Yes | No | No |
| Import History | Yes | Yes | Yes | No | No |
| Inventory | Yes | Yes | No | No | Yes |
| Stock Movements | Yes | Yes | Yes | No | Yes |
| Purchase Orders | Yes | Yes | Yes | Yes | Yes |
| Order Approval | Yes | No | No | Yes | No |
| Reports | Yes | Yes | No | Yes | No |
| User Management | Yes | No | No | No | No |

### Important Role Rules

- Only `admin` and `inventory_manager` can create purchase orders.
- Only `admin` can import product master data.
- Only `admin` and `inventory_manager` can edit product master details.
- `sales_operator` can only record `sale` stock movements.
- `staff` can only record `damage` stock movements.
- `approval_manager` can approve or reject purchase orders.
- User invitation is limited to `admin`.

## 9. Database Design

The database schema is defined in `supabase-schema.sql`.

### Main Tables

#### `profiles`

Stores application user profile data linked to Supabase Auth users.

Important fields:

- `id`: references `auth.users`.
- `full_name`: display name.
- `role`: one of `admin`, `inventory_manager`, `sales_operator`, `approval_manager`, `staff`.
- `created_at`: profile creation timestamp.

The schema includes a trigger function `handle_new_user()` that creates a profile row when a new auth user signs up or is invited.

#### `categories`

Stores product categories.

Important fields:

- `name`: unique category name.
- `active`: whether the category is selectable.

The schema includes case-insensitive uniqueness for category names.

#### `products`

Stores product master records.

Important fields:

- `id`: product ID.
- `name`: product name.
- `sku`: unique SKU.
- `category`: linked to category name.
- `current_stock`: live inventory quantity.
- `reorder_point`: safety stock threshold.
- `reorder_quantity`: suggested purchase quantity.
- `unit_price`: selling or valuation price.
- `supplier_name`: supplier display text.
- `active`: whether the product appears in normal active workflows.
- `archived_at`: archive timestamp.

Important constraints:

- SKU is unique.
- A case-insensitive SKU index prevents duplicate SKUs with different capitalization.
- `current_stock >= 0`.
- `reorder_point >= 0`.
- `reorder_quantity > 0`.

#### `stock_movements`

Records every stock-changing operation.

Important fields:

- `product_id`: product affected.
- `movement_type`: `sale`, `restock`, `adjustment`, or `damage`.
- `quantity`: positive quantity moved.
- `notes`: optional explanation.
- `created_by`: profile/user who recorded the movement.
- `created_at`: timestamp.

This table is used for auditing and reporting. Direct writes are not exposed through frontend logic. Critical writes go through RPC functions.

#### `sales`

Stores cashier sale batches or imported receipt-level sales.

Important fields:

- `receipt_number`: unique sale identifier.
- `customer_name`: used to identify imported cashier batches.
- `subtotal`, `discount_amount`, `total_amount`.
- `payment_method`, `payment_status`.
- `created_by`, `created_at`.

#### `sale_items`

Stores product lines inside a sale.

Important fields:

- `sale_id`: parent sale.
- `product_id`: product sold.
- `quantity`: positive quantity.
- `unit_price`: price used.
- `line_total`: quantity multiplied by unit price.

#### `sales_import_batches`

Stores metadata about imported cashier CSV files.

Important fields:

- `file_name`.
- `file_hash`: unique hash to prevent duplicate file imports.
- `total_rows`.
- `total_units`.
- `total_amount`.
- `imported_by`.
- `imported_at`.

#### `sales_import_items`

Stores line-level details from sales imports.

Important fields:

- `batch_id`.
- `product_id`.
- `sku`.
- `quantity`.
- `unit_price`.
- `line_total`.

#### `product_import_batches`

Stores metadata for product master imports.

Important fields:

- `mode`.
- `total_rows`.
- `created_count`.
- `updated_count`.
- `skipped_count`.
- `imported_by`.
- `imported_at`.

#### `purchase_orders`

Stores restock requests and purchase order workflow state.

Important fields:

- `order_number`.
- `product_id`.
- `quantity_ordered`.
- `status`: `pending`, `approved`, `rejected`, `ordered`, or `received`.
- `triggered_by`: `ai_prediction` or `manual`.
- `predicted_days_until_stockout`.
- `notes`.
- `approved_by`.
- `approved_at`.

Important constraints:

- Order number is unique.
- Quantity ordered must be positive.
- A partial unique index prevents more than one `pending` order for the same product.

#### `demand_forecasts`

Stores trained demand forecast outputs.

Important fields:

- `product_id`.
- `model_name`.
- `predicted_demand`.
- `predicted_daily_demand`.
- `horizon_days`.
- `safety_stock`.
- `recommended_reorder_quantity`.
- `reorder_signal`.
- `generated_at`.

The frontend uses this table before falling back to heuristic stock prediction.

## 10. Row Level Security

Row Level Security is enabled for all main tables.

Main RLS decisions:

- Authenticated users can read profiles, categories, products, stock movements, sales, sales items, sales import history, purchase orders, and demand forecasts.
- Product writes are limited to `admin` and `inventory_manager`.
- Category management is limited to `admin`.
- Product import history is readable by `admin` and `inventory_manager`.
- Purchase order inserts are limited to `admin` and `inventory_manager`.
- Purchase order updates are limited to `admin`, `inventory_manager`, and `approval_manager`.
- Demand forecast writes are restricted to service role tools.
- Stock movement, sales import, product import, receiving, and forecast order writes are mainly done through RPC functions.

The helper function `current_app_role()` reads the current user's role from `profiles`. This lets SQL policies and RPC functions enforce permissions inside the database.

## 11. Backend RPC Functions

### `record_stock_movement(product_id, movement_type, quantity, notes)`

Used by the Stock Movements page.

Responsibilities:

- Checks the current user's role.
- Allows only `admin`, `inventory_manager`, `sales_operator`, and `staff`.
- Restricts `sales_operator` to `sale` movements.
- Restricts `staff` to `damage` movements.
- Validates the movement type.
- Validates positive quantity.
- Locks the product row using `FOR UPDATE`.
- Rejects the movement if the product does not exist.
- Prevents sale or damage movements from exceeding available stock.
- Inserts a row into `stock_movements`.
- Updates `products.current_stock`.
- Returns the new stock quantity.

This function is transactional. If any validation fails, the stock movement and product stock update are both rolled back.

### `import_sales_batch(file_name, file_hash, items)`

Used by the Sales Import page.

Responsibilities:

- Allows only `admin`, `inventory_manager`, and `sales_operator`.
- Requires file name and file hash.
- Rejects duplicate imports using `file_hash`.
- Requires at least one item.
- Creates a `sales_import_batches` record.
- Creates a parent `sales` record.
- For each imported item:
  - Validates SKU and positive quantity.
  - Finds the product by SKU.
  - Locks the product row.
  - Rejects unknown SKUs.
  - Rejects insufficient stock.
  - Inserts a `sale_items` row.
  - Inserts a `stock_movements` sale row.
  - Inserts a `sales_import_items` row.
  - Decreases `products.current_stock`.
- Updates sale totals and batch totals.
- Returns import totals.

This function avoids partial imports. If any row fails at the database level, the whole import fails.

### `import_product_master(mode, items)`

Used by the Inventory product import modal.

Allowed role:

- `admin` only.

Supported modes:

- `create_update`: create missing products and update existing products.
- `create_only`: create new products and skip existing SKUs.
- `update_details`: update descriptive fields without changing stock.
- `update_baseline`: update baseline stock only.

Responsibilities:

- Validates import mode.
- Requires a JSON array of product items.
- Processes SKUs case-insensitively.
- Creates missing categories automatically when needed.
- Updates category active state when reused.
- Inserts or updates products based on import mode.
- Tracks created, updated, and skipped counts.
- Inserts a product import batch record.
- Returns summary counts.

### `update_product_master(...)`

Used by the Inventory edit product modal.

Responsibilities:

- Allows only `admin` and `inventory_manager`.
- Validates product name.
- Validates reorder point is not negative.
- Validates reorder quantity is positive.
- Validates unit price is not negative.
- Creates or reactivates category if needed.
- Updates product master fields without directly recording a stock movement.

Stock baseline changes are handled separately through import modes or stock movement workflows.

### `archive_product(product_id, next_active)`

Used by the Inventory archive/restore action.

Responsibilities:

- Allows only `admin` and `inventory_manager`.
- Marks products inactive or active.
- Preserves historical sales and movement records.
- Sets or clears `archived_at`.

Archiving is preferred over deletion when a product has business history.

### `delete_product(product_id)`

Used by the Inventory delete action.

Responsibilities:

- Allows only `admin` and `inventory_manager`.
- Locks the product row.
- Checks whether the product exists.
- Checks `sale_items` and `sales_import_items`.
- Rejects deletion if sales history exists.
- Deletes only products without sales history.

This protects reporting accuracy.

### `place_forecast_purchase_orders(items)`

Used by forecast reorder workflows.

Responsibilities:

- Allows only `admin` and `inventory_manager`.
- Requires at least one selected item.
- Validates product ID and positive quantity.
- Locks each product row.
- Skips products that already have a pending purchase order.
- Creates `pending` purchase orders with `triggered_by = ai_prediction`.
- Returns created and skipped counts.

This prevents duplicate pending purchase requests.

### `receive_purchase_order(order_id, notes)`

Used by the Purchase Orders receiving action.

Responsibilities:

- Allows only `admin` and `inventory_manager`.
- Locks the purchase order row.
- Requires order status to be `approved` or `ordered`.
- Locks the product row.
- Increases product stock by `quantity_ordered`.
- Reactivates the product if archived.
- Inserts a `restock` stock movement.
- Marks the order as received.
- Returns the received quantity and new stock.

This keeps receiving and stock update as one transaction.

### `rename_category(category_id, name)`

Used by category management.

Responsibilities:

- Allows category name maintenance.
- Normalizes and validates category names.
- Updates related product category names through the category relationship.

## 12. Frontend Pages and Implementation Details

### Login

File: `src/pages/Login.jsx`

Responsibilities:

- Collects email and password.
- Calls `signIn()` from `AuthContext`.
- Uses role-aware post-login navigation.
- Displays toast errors for failed login attempts.

### Dashboard

File: `src/pages/Dashboard.jsx`

Responsibilities:

- Loads active products, recent stock movements, pending orders, receivable orders, today's sales count, today's import count, and active forecast reorder signals.
- Computes low stock items using `getStockStatus()`.
- Groups low stock counts by category.
- Shows role-specific dashboard content:
  - Admin and inventory manager see operational stats.
  - Approval manager sees pending approvals.
  - Sales operator sees import guidance.
  - Staff sees urgent restock information.

Implementation details:

- Uses parallel Supabase queries with `Promise.all`.
- Shows a spinner while loading.
- Uses role checks to hide irrelevant dashboard cards.

### Inventory

File: `src/pages/Inventory.jsx`

Responsibilities:

- Lists product catalog with search, category filtering, status filtering, and pagination.
- Shows product stock health.
- Shows forecast signals per product.
- Supports add, edit, archive, restore, and delete workflows.
- Supports admin product master CSV import.
- Supports category management.
- Supports product detail modal with related movements, orders, forecasts, and sales data.
- Supports forecast analysis and forecast purchase order placement.
- Generates per-product forecasts from actual sale movement history when the user clicks Generate Forecast.
- Reads stored forecast rows for the current day instead of recalculating every time the page is opened.

Search implementation:

- Uses Supabase query filtering with `name.ilike` and `sku.ilike`.
- Escapes `%` and `_` characters before building search expressions.

Product import implementation:

- Reads CSV client-side.
- Parses headers using `normalizeHeader()`.
- Requires SKU and name depending on mode.
- Supports stock, safety stock, suggested order quantity, unit price, supplier, and category columns.
- Detects duplicate SKUs inside the file.
- Compares rows against existing products.
- Shows row-level validation errors before import.
- Allows exporting invalid rows to CSV for correction.
- Calls `import_product_master()` only when preview has no blocking errors.

Forecast implementation:

- Loads products, stock movements, and latest demand forecast rows.
- Uses stored trained forecasts when available for catalog-level signals.
- Calls the `generate-forecasts` Edge Function when the user explicitly generates forecasts.
- Stores generated forecasts in `demand_forecasts` with the current `forecast_date`.
- Reuses the current day's stored forecasts until the day changes or the user clicks Generate Forecast again.
- Forecasts every active product, not only low-stock products.
- Uses actual `stock_movements` rows where `movement_type = sale` as the live demand source.
- Tests multiple time-series candidates in the Edge Function and selects the lowest-MAE model for each product.
- Ranks reorder candidates by risk and days until stockout.
- Allows users to select suggested orders and adjust quantities.
- Calls `place_forecast_purchase_orders()` to create pending orders.

### Sales Import

File: `src/pages/SalesImport.jsx`

Responsibilities:

- Allows sales CSV upload.
- Validates CSV format and product SKUs.
- Aggregates repeated SKUs.
- Shows a preview before import.
- Rejects imports with unknown SKUs or insufficient stock.
- Calls `import_sales_batch()` to import sales transactionally.

Supported CSV headers:

- SKU: `sku`, `product_sku`, `item_sku`, `item_code`, `code`.
- Quantity: `quantity`, `qty`, `units`, `units_sold`, `sold_quantity`, `sold_qty`.
- Price: `unit_price`, `price`, `sale_price`, `selling_price`.

Client-side validation:

- File must be CSV.
- Required headers must exist.
- SKU must be known.
- Quantity must be positive.
- Stock must be sufficient.
- Unit price is optional and falls back to product unit price.

Duplicate prevention:

- The frontend hashes the file contents with SHA-256.
- The backend rejects the same file hash if it was already imported.

### Import History

File: `src/pages/ImportHistory.jsx`

Responsibilities:

- Displays sales import batches.
- Displays product import batches.
- Shows row counts, imported units, totals, mode, created/updated/skipped counts, and import timestamps.

This gives traceability for bulk operations.

### Stock Movements

File: `src/pages/StockMovements.jsx`

Responsibilities:

- Records manual stock movements.
- Supports SKU/name product search through `ProductSearchInput`.
- Shows selected product context: stock, safety stock, category, and SKU.
- Restricts movement type options based on role.
- Validates quantity.
- Prevents sale or damage quantities greater than available stock on the client side.
- Calls `record_stock_movement()` for transactional database enforcement.
- Displays recent movements.
- Supports filtering by movement type.
- Supports search by SKU, product, user, note, or movement type.
- Shows who recorded each movement.
- Supports loading more movement history.

Movement types:

- `sale`: decreases stock.
- `damage`: decreases stock.
- `restock`: increases stock.
- `adjustment`: increases stock in the current implementation.

### Purchase Orders

File: `src/pages/PurchaseOrders.jsx`

Responsibilities:

- Lists purchase orders by status.
- Supports searching by order number, SKU, product, status, trigger type, and notes.
- Allows `admin` and `inventory_manager` to create manual purchase orders.
- Uses SKU/name product search through `ProductSearchInput`.
- Blocks products with existing pending purchase orders.
- Auto-fills quantity from `reorder_quantity`.
- Shows selected product stock, safety stock, reorder quantity, and supplier.
- Allows receiving approved or ordered purchase orders.
- Calls `receive_purchase_order()` to update stock and record restock movement.

Order status flow:

```text
pending -> approved -> received
pending -> rejected
approved -> received
ordered -> received
```

### Order Approval

File: `src/pages/OrderApproval.jsx`

Responsibilities:

- Displays pending purchase orders awaiting approval.
- Allows `admin` and `approval_manager` to approve or reject.
- Allows adding or updating notes.
- Shows product context, current stock, reorder point, unit price, supplier, and predicted days until stockout.
- Uses Supabase Realtime to reload when purchase orders change.

Approval behavior:

- Approving sets status to `approved`, records `approved_by`, and sets `approved_at`.
- Rejecting sets status to `rejected`, records `approved_by`, sets `approved_at`, and appends the rejection reason into notes.

### Reports

File: `src/pages/Reports.jsx`

Responsibilities:

- Loads the last 30 days of sale stock movements.
- Calculates top consumed products.
- Builds a daily sales trend for selected products.
- Lets the user choose which products appear on the sales trend chart.
- Provides a Top 3 shortcut for quickly showing the highest-selling products.
- Loads purchase order history.
- Displays charts and tables for management review.

Implementation details:

- Uses `stock_movements` as the consumption source.
- Groups sales by product name.
- Groups selectable chart lines by product ID so products with similar names do not conflict.
- Uses Recharts for trend visualization.

### User Management

File: `src/pages/UserManagement.jsx`

Responsibilities:

- Lists profiles.
- Allows admins to change user roles.
- Allows admins to invite users through the Supabase Edge Function.
- Allows admins to delete users through a protected Supabase Edge Function.
- Uses Supabase Realtime to reload profiles when user data changes.

Role updates:

- Admin selects a new role.
- The frontend updates the `profiles` table.
- RLS ensures only admins can manage roles.

User invitation:

- Admin enters email, full name, and role.
- Frontend calls `supabase.functions.invoke('invite-user')`.
- Edge Function validates the caller is an admin.
- Edge Function uses Supabase service role to invite the user.
- Supabase sends an invitation email containing a secure invite link.
- The invited user clicks the invite link and completes Supabase's password setup flow.
- The user's `full_name` and `role` are passed as invite metadata.
- The database trigger `handle_new_user()` creates the matching `profiles` row from that metadata.

User deletion:

- Admin clicks the delete button in the user table.
- The frontend asks for confirmation before continuing.
- The current signed-in admin account is disabled in the UI to prevent accidental self-deletion.
- Frontend calls `supabase.functions.invoke('delete-user')` with the target user ID.
- Edge Function verifies the caller is authenticated.
- Edge Function verifies the caller has the `admin` role.
- Edge Function prevents deleting the current signed-in admin account.
- Edge Function prevents deleting the last remaining admin account.
- Edge Function calls Supabase Auth Admin API to delete the user.
- The `profiles` row is removed through the `profiles.id references auth.users on delete cascade` relationship.
- The user table refreshes after a successful deletion.

## 13. Shared Components and Helpers

### `ProductSearchInput`

File: `src/components/ProductSearchInput.jsx`

Purpose:

- Provides reusable product search by SKU or product name.
- Uses a native `datalist`.
- Accepts disabled product IDs, such as products with pending orders.
- Exposes selected product data to parent screens.
- Supports selected product display through a render prop.

Used in:

- Stock Movements.
- Purchase Orders.

### `productSearch.js`

File: `src/lib/productSearch.js`

Functions:

- `formatProductOption(product)`: formats an option as `SKU - Name`.
- `matchesProductSearch(product, query)`: matches product by SKU, name, formatted label, category, or supplier.
- `findProductForSearchInput(products, value)`: finds exact product by SKU, name, ID, or formatted label.
- `getProductSearchOptions(products, query, limit)`: returns filtered product options.

### `csv.js`

File: `src/lib/csv.js`

Functions:

- `normalizeHeader()`: converts CSV headers to a normalized lowercase underscore format.
- `parseNumber()`: parses numeric cells and removes currency symbols and commas.
- `findColumn()`: finds a header from accepted alternatives.
- `getCell()`: safely reads a CSV cell.
- `parseCsv()`: parses CSV text with quoted field support.
- `toCsv()`: exports rows back to CSV.

### `predictions.js`

File: `src/lib/predictions.js`

Functions:

- `analyzeStock(product, movements)`: fallback heuristic based on 30-day sale movement history.
- `buildForecastPrediction(product, forecast)`: converts trained forecast rows into reorder decisions.
- `generatePurchaseOrder(product, prediction)`: creates a forecast-driven purchase order request.
- `runPredictionsForAllProducts()`: analyzes all products and places eligible forecast orders.
- `getStockStatus(product)`: returns `out_of_stock`, `critical`, `low`, or `ok`.

## 14. Forecasting Design

The forecasting pipeline is in the `forecasting/` directory.

Purpose:

- Export actual sales history from the database for real forecasting.
- Generate realistic synthetic sales history for demo/testing when live sales data is not available.
- Train demand forecasting models.
- Export forecast records into SQL.
- Allow the frontend to use trained forecasts instead of only simple heuristics.

Production workflow:

1. Export actual sales history from Supabase:

```bash
python forecasting/export_sales_history_from_supabase.py
```

2. Train forecasts from exported actual sales:

```bash
python forecasting/train_forecasts.py --history-csv forecasting/generated/actual_sales_history.csv
```

3. Load generated SQL into Supabase:

```text
forecasting/generated/demand_forecasts.sql
```

The export script reads `stock_movements` rows where `movement_type = sale`, joins the related product, aggregates units sold per day per SKU, and writes `actual_sales_history.csv`. This is the correct real forecasting source because it reflects actual sales that reduced stock.

Demo workflow:

1. Generate synthetic history:

```bash
python forecasting/generate_synthetic_history.py
```

2. Train forecasts from synthetic history:

```bash
python forecasting/train_forecasts.py
```

3. Load generated SQL into Supabase:

```text
forecasting/generated/demand_forecasts.sql
```

Model approach:

- The trainer evaluates multiple forecasting candidates.
- It can use SARIMA, Holt-Winters Exponential Smoothing, and seasonal naive baseline approaches.
- It chooses the best model per SKU by validation MAE.

Generated forecast approach:

- The Inventory Generate Forecast action calls the `generate-forecasts` Edge Function.
- The Edge Function reads actual sale movements already stored in Supabase.
- It groups each product's sale movements into a daily sales series.
- It reserves recent days as validation data.
- It evaluates these time-series candidates:
  - `average_demand`: predicts future demand as the product's recent average daily sales.
  - `seasonal_naive`: repeats the latest weekly sales pattern.
  - `holt_winters`: additive level, trend, and weekly seasonal smoothing.
- The lowest-MAE candidate becomes the selected live model for that product.
- The selected model is refit using the available sales history and forecasts the next 14 days.
- The app then calculates projected stock, safety stock, reorder signal, suggested quantity, and days until stockout.
- Forecast rows are stored in `demand_forecasts` and reused by the app for the rest of the day.
- If the user clicks Generate Forecast again, a new set of forecast rows is generated and the latest row per product is used.

The synthetic workflow is useful for demonstrations before enough real sales exist. It should not be described as the production forecasting source.

Frontend forecast usage:

- Catalog forecast signals can use recent rows in `demand_forecasts`.
- When the inventory user clicks Generate Forecast, the app runs the Edge Function forecast for every active product using current sale movements.
- Normal page views use today's stored `demand_forecasts` rows instead of recomputing the model.
- The generated forecast compares average demand, seasonal naive, and Holt-Winters candidates where enough history exists.
- If a product does not have enough sales history, the app marks the model as `insufficient_sales_history` and uses baseline stock rules.
- Forecast results show the selected model name, expected 7-day sales, average daily demand, risk level, and days until stockout.

Heuristic fallback:

- Looks at sale movements from the last 30 days.
- Calculates average daily consumption.
- Estimates expected 7-day sales.
- Calculates days until stockout.
- Marks products as `critical`, `at_risk`, or `ok`.

## 15. Error Handling Strategy

The project handles errors at multiple layers.

### UI-Level Error Handling

The frontend uses `react-hot-toast` for user-visible feedback.

Examples:

- Failed login shows a toast error.
- Failed product load shows `Failed to load products`.
- CSV parsing issues are shown before import.
- Unknown SKU and insufficient stock are shown during sales import preview.
- Invalid movement quantity shows an immediate toast.
- Failed RPC calls display the database error message.

### Client-Side Validation

Client-side validation improves user experience before calling the database.

Examples:

- Required CSV headers are checked.
- CSV file type is checked.
- Product import duplicate SKUs are detected.
- Sales import unknown SKUs are detected.
- Sales import insufficient stock is detected.
- Stock movement quantity must be positive.
- Sale/damage cannot exceed current stock.
- Purchase order quantity must be positive.
- Duplicate pending purchase orders are blocked in the UI.

### Database-Level Validation

Database validation protects integrity even if frontend validation is bypassed.

Examples:

- Role checks inside RPC functions.
- Positive quantity checks.
- SKU uniqueness.
- Case-insensitive SKU uniqueness.
- File hash uniqueness for sales imports.
- Product row locking with `FOR UPDATE`.
- Insufficient stock checks in RPC functions.
- Partial unique index preventing duplicate pending purchase orders.
- Restrictions on deleting products with sales history.

### Transactional Safety

Critical operations are implemented in PostgreSQL functions. This means all related updates succeed or fail together.

Examples:

- Sales import creates sale rows, sale items, stock movements, import records, and stock updates in one transaction.
- Stock movement insert and stock update happen in one transaction.
- Purchase order receiving updates order status, product stock, and stock movement history in one transaction.

## 16. Data Integrity and Concurrency

The database functions use row locks with `FOR UPDATE` when updating products or orders.

This protects against concurrent changes such as:

- Two users trying to sell the same stock at the same time.
- Receiving the same purchase order twice.
- Creating duplicate pending restock requests.
- Updating a product while another operation depends on its current stock.

The system also avoids direct client-side stock mutation for important flows. Instead, frontend code calls RPC functions that centralize validation and updates.

Additional concurrency protections:

- Stock movement recording locks the product row before checking and updating stock.
- Sales imports lock each product row before reducing stock.
- Purchase order receiving locks both the purchase order row and product row.
- Forecast order placement checks for existing pending orders before creating a new request.
- A partial unique index prevents duplicate pending purchase orders for the same product.
- Order approval and rejection use conditional updates that only succeed when the order is still `pending`.
- If two approval managers act on the same order at the same time, the first update wins and the second user is told that the order was already handled.
- Generated forecasts are unique per product per forecast date.
- Forecast generation uses upsert behavior so regenerating forecasts for the same day updates existing rows instead of creating duplicates.
- A database trigger prevents demoting or deleting the final remaining admin account.
- The user deletion Edge Function also prevents self-deletion and last-admin deletion.

These controls reduce race conditions where two users attempt the same action at nearly the same time. They also keep the final state consistent even if frontend screens are stale.

## 17. Realtime Features

Supabase Realtime is used where live operational updates are useful.

Examples:

- User Management subscribes to `profiles` changes so role updates appear without manual refresh.
- Order Approval subscribes to `purchase_orders` changes so the approval queue reloads when orders change.
- Sidebar notification counts are loaded from live database data.

## 18. Reporting Design

Reports are generated from operational tables instead of separate summary tables.

Sources:

- `stock_movements` for product consumption.
- `purchase_orders` for procurement history.
- `products` joined to movements and orders for display names and SKUs.

Report outputs:

- Top consumed products for the last 30 days.
- Daily sales trend for top products.
- Purchase order history and statuses.

This approach keeps reports consistent with the actual transactions recorded by the system.

## 19. Security Design

Security is implemented through several layers.

### Authentication

- Supabase Auth controls login and session management.
- The frontend only renders protected pages when a valid session and role exist.

### Authorization

- Frontend route protection hides unauthorized screens.
- Database Row Level Security restricts database access.
- RPC functions perform role checks before sensitive writes.
- Edge Functions validate admin role before privileged user-management operations such as inviting and deleting users.

### Service Role Isolation

The service role key is only used inside Supabase Edge Functions. It is not exposed to the frontend. This is necessary because inviting users and deleting Supabase Auth users require privileged Supabase Auth Admin access.

The frontend never deletes users directly from the browser. It sends the request to `delete-user`, and the Edge Function performs the operation only after checking the caller's role. This prevents a malicious user from calling the Supabase Admin API directly because the service role key stays on the server side.

### Duplicate and Fraud Prevention

- Duplicate sales files are prevented using SHA-256 file hash.
- Duplicate pending purchase orders are prevented by both UI checks and a database partial unique index.
- Product deletion is blocked when sales history exists.
- Stock cannot be reduced below zero through RPC functions.
- The current admin cannot delete their own account while signed in.
- The final remaining admin account cannot be deleted.

## 20. User Workflows

### Workflow 1: User Login

1. User opens the app.
2. App checks Supabase session.
3. User enters email and password.
4. Supabase validates credentials.
5. App loads profile and role.
6. App redirects user to the correct post-login page.
7. Protected routes enforce role access.

### Workflow 2: Product Setup

1. Admin opens Inventory.
2. Admin adds products manually or imports product master CSV.
3. Import preview validates required fields, duplicate SKUs, numeric values, and row actions.
4. Admin confirms import.
5. `import_product_master()` creates or updates products.
6. Product import summary is stored.
7. Inventory list refreshes.

### Workflow 3: Sales Import

1. Sales operator opens Sales Import.
2. User uploads cashier CSV.
3. Frontend parses CSV and validates headers.
4. Rows are matched to products by SKU.
5. Duplicate SKUs are aggregated.
6. Insufficient stock and unknown SKUs are displayed.
7. User confirms import if there are no errors.
8. Frontend sends file hash and items to `import_sales_batch()`.
9. Backend creates sale records, sale items, stock movement rows, and updates stock.
10. Import history is available in Import History.

### Workflow 4: Manual Stock Movement

1. User opens Stock Movements.
2. User searches product by SKU or product name.
3. App shows current stock and safety stock.
4. User selects movement type.
5. App limits movement type options based on role.
6. User enters quantity and notes.
7. Frontend validates quantity and available stock.
8. Backend `record_stock_movement()` repeats permission and stock validation.
9. Backend records movement and updates current stock.
10. Recent movements list refreshes.

### Workflow 5: Forecast Reorder

1. Inventory manager opens Inventory forecast tools.
2. App loads today's stored forecast rows from `demand_forecasts`.
3. If there is no current forecast, the user clicks Generate Forecast.
4. Frontend calls the `generate-forecasts` Edge Function.
5. Edge Function verifies the user is `admin` or `inventory_manager`.
6. Edge Function reads active products and actual sale movements.
7. Edge Function generates one forecast row per active product.
8. Forecast rows are stored in `demand_forecasts` with today's `forecast_date`.
9. The app reuses those rows until the day changes or the user generates forecasts again.
10. Products needing reorder are ranked.
11. User selects products and adjusts quantities.
12. App calls `place_forecast_purchase_orders()`.
13. Backend skips products with existing pending orders.
14. Pending purchase orders are created for approval.

### Workflow 6: Manual Purchase Order

1. Admin or inventory manager opens Purchase Orders.
2. User creates a new order.
3. User searches product by SKU or product name.
4. App blocks products with pending orders.
5. Quantity is prefilled from reorder quantity.
6. User submits order.
7. Pending purchase order appears in the order list.

### Workflow 7: Purchase Order Approval

1. Approval manager opens Order Approval.
2. Pending purchase orders are listed.
3. User reviews stock level, reorder point, supplier, and notes.
4. User approves or rejects.
5. Status is updated.
6. Approval metadata is recorded.

### Workflow 8: Purchase Order Receiving

1. Inventory manager opens Purchase Orders.
2. User finds an approved or ordered purchase order.
3. User clicks Receive.
4. Backend `receive_purchase_order()` validates status.
5. Backend increases product stock.
6. Backend records a `restock` stock movement.
7. Order status changes to received.

### Workflow 9: Reports Product Sales Comparison

1. Manager opens Reports.
2. App loads sale stock movements from the last 30 days.
3. App calculates top-selling products.
4. App automatically selects the top three products for the daily sales trend chart.
5. User can select or unselect product chips.
6. Chart updates to compare selected products over the last seven days.
7. Top 10 bar chart still shows the highest-selling products over the last 30 days.

### Workflow 10: User Invitation

1. Admin opens User Management.
2. Admin enters full name, email, and role.
3. Frontend calls the `invite-user` Edge Function.
4. Edge Function verifies caller authentication.
5. Edge Function checks caller profile role is `admin`.
6. Edge Function validates requested role.
7. Supabase Admin API sends invitation email.
8. Invited user opens the secure email link.
9. Supabase handles account confirmation and password setup.
10. User logs in through the normal login page after setting the password.
11. User profile is created through auth metadata and the `handle_new_user()` trigger.

### Workflow 11: User Deletion

1. Admin opens User Management.
2. Admin clicks the delete icon beside a user.
3. Frontend blocks deletion of the currently signed-in admin account.
4. Frontend asks for confirmation.
5. Frontend calls the `delete-user` Edge Function.
6. Edge Function verifies caller authentication.
7. Edge Function checks caller profile role is `admin`.
8. Edge Function validates the target user ID.
9. Edge Function blocks deletion of the current signed-in user.
10. Edge Function checks whether the target user is the last admin.
11. If the target is the last admin, deletion is rejected.
12. Otherwise, Supabase Auth Admin API deletes the user account.
13. The linked profile row is removed by cascade.
14. User Management reloads the profile list.

## 21. Testing Coverage

Current tests cover:

- Role helper behavior.
- Post-login navigation behavior.
- Protected route behavior.
- Stock prediction logic.
- Product search matching and option selection.

Test command:

```bash
npm test -- --watchAll=false
```

Build verification:

```bash
npm run build
```

## 22. Setup and Deployment

### Frontend Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```text
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_KEY=your_supabase_anon_key
```

Start development server:

```bash
npm start
```

Build production app:

```bash
npm run build
```

### Database Setup

Run in Supabase SQL Editor:

```text
supabase-schema.sql
```

Optional sample data:

```text
seed-data.sql
```

Optional large demo data:

```text
demo-large-data.sql
```

### Edge Function Setup

Deploy:

```bash
supabase functions deploy invite-user
supabase functions deploy delete-user
supabase functions deploy generate-forecasts
```

Set function secrets:

```bash
supabase secrets set SUPABASE_URL=...
supabase secrets set SUPABASE_ANON_KEY=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

All Edge Functions use the same secrets. `invite-user` needs the service role key to call `inviteUserByEmail()`. `delete-user` needs the service role key to call `deleteUser()`. `generate-forecasts` needs the service role key to read operational sales history and write generated forecast rows. These operations cannot be performed safely from the React frontend because the service role key must remain private.

Optional daily automation:

- Supabase can schedule the `generate-forecasts` function to run once per day.
- If scheduled, users will normally see that day's stored forecast without clicking Generate Forecast.
- If users need fresh predictions after a large sales import, they can click Generate Forecast manually.

## 23. Key Strengths of the Implementation

- Role-based route access and database-level authorization.
- Transactional backend functions for stock and import operations.
- SKU-centered product management.
- Client-side CSV preview before committing imports.
- Duplicate import prevention through file hashing.
- Duplicate pending purchase order prevention.
- Forecast-driven restock recommendations with heuristic fallback.
- Audit trail through stock movements and import batches.
- Product deletion safeguards to protect reporting history.
- Reusable product search component used across workflows.
- Clear user feedback using toast notifications.

## 24. Known Limitations

- The frontend still depends on Supabase availability for most screens.
- Some report calculations are done client-side from recent rows instead of pre-aggregated reporting tables.
- Manual purchase order creation uses direct insert instead of a dedicated manual order RPC function.
- The current `adjustment` movement type increases stock; a more advanced system could support signed adjustment direction.
- The product search component uses native `datalist`, which is simple and reliable but less customizable than a fully virtualized combobox.
- Forecast models are trained outside the app and imported into Supabase as SQL.
- There is no automated end-to-end test suite yet.

## 25. Recommended Future Improvements

### Functional Improvements

- Add a dedicated manual purchase order RPC function for stronger server-side validation.
- Add full audit logs for role changes and product edits.
- Add vendor/supplier management as a separate module.
- Add barcode scanning support using SKU lookup.
- Add stock transfer workflow if there are multiple stores or warehouses.
- Add notification emails for approved orders and critical low stock.
- Add export buttons for reports.

### Technical Improvements

- Add end-to-end tests for sales import, purchase approval, and receiving.
- Add database migrations instead of one large SQL setup file.
- Add server-side reporting views for faster dashboards.
- Add optimistic UI refresh where safe.
- Add stricter TypeScript typing or migrate React components to TypeScript.
- Add CI build and test pipeline on GitHub.

### Data Improvements

- Add supplier table and link products to suppliers by ID.
- Add purchase order line items to support multi-product orders.
- Add sales receipts with multiple customer/payment fields if needed.
- Add inventory valuation reports.
- Add forecast accuracy tracking over time.

## 26. Report Writing Notes

When writing the final academic or project report, this README can be used as the technical source. Suggested report sections:

1. Introduction and problem statement.
2. Objectives and scope.
3. System architecture.
4. Technology stack.
5. Database design.
6. Role-based access control.
7. Functional modules.
8. Stock movement and sales import workflow.
9. Purchase order and approval workflow.
10. Forecasting and reorder recommendation method.
11. Error handling and data validation.
12. Security and data integrity.
13. Testing and verification.
14. Limitations.
15. Future enhancements.
16. Conclusion.

## 27. Summary

HardwareHub is designed as a practical inventory management system with a strong focus on data integrity and role-based workflow control. The frontend provides usable operational screens for different types of employees, while Supabase handles authentication, secure data access, transactional stock operations, and privileged user management. The project combines traditional inventory management features with demand forecasting support, making it suitable for both day-to-day stock control and management-level decision support.
