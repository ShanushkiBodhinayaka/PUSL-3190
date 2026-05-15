# HardwareHub

HardwareHub is a role-based hardware inventory management app built with React and Supabase. It supports stock tracking, point-of-sale checkout, purchase order workflows, reporting, and user administration.

## Features

- Authentication with role-aware routing
- Inventory catalog with low-stock indicators
- POS checkout with transactional stock updates
- Manual stock movement recording
- Forecast-based reorder suggestions powered by trained time-series models when available
- Purchase order creation and approval workflow
- Reporting for sales trends and purchase order history
- Admin user management with invite support through a Supabase Edge Function

## Tech Stack

- React 19
- React Router
- Tailwind CSS
- Supabase Auth, Database, Realtime, and Edge Functions
- Recharts

## Project Structure

```text
src/
  components/        Shared layout and route guards
  contexts/          Auth context
  lib/               Supabase client and domain helpers
  pages/             Route screens
supabase/
  functions/
    invite-user/     Edge Function for admin-only invitations
forecasting/         Synthetic history generation and model training pipeline
supabase-schema.sql  Database schema, RLS policies, and RPC functions
seed-data.sql        Sample products and movements
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file from `.env.example`.

3. In Supabase SQL Editor, run:

- `supabase-schema.sql`
- `seed-data.sql` (optional sample data)

4. Deploy the invite function:

```bash
supabase functions deploy invite-user
```

5. Configure Supabase function secrets:

```bash
supabase secrets set SUPABASE_URL=...
supabase secrets set SUPABASE_ANON_KEY=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

6. Start the app:

```bash
npm start
```

## Forecasting Workflow

If you want the app to use trained forecasts instead of fallback heuristics:

1. Generate retail-style history for the current catalog:

```bash
python forecasting/generate_synthetic_history.py
```

2. Train forecasts and export SQL:

```bash
python forecasting/train_forecasts.py
```

3. Run `forecasting/generated/demand_forecasts.sql` in Supabase.

The app will then use rows from `demand_forecasts` when generating forecast-based purchase orders.

## Environment Variables

Frontend:

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_KEY`

Edge Function:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Roles

- `admin`: full access, user management, approvals
- `inventory_manager`: inventory maintenance and stock control
- `sales_operator`: POS and sales-driven stock movement
- `procurement_manager`: create purchase orders and view reports
- `approval_manager`: approve or reject purchase orders
- `staff`: view inventory and record basic stock movements

## Database Notes

The schema includes two important RPC functions used by the frontend:

- `complete_sale(...)`: creates the sale, sale items, stock movements, and stock deductions in one transaction
- `record_stock_movement(...)`: records a movement and updates stock in one transaction
- `demand_forecasts`: stores trained model outputs that the frontend prefers over heuristic predictions

This prevents partial writes from leaving the inventory in an inconsistent state.

## Scripts

- `npm start`: run the development server
- `npm run build`: build the production bundle
- `npm test -- --watchAll=false`: run the test suite once

## Testing

The current automated tests cover:

- stock prediction logic
- role helper logic
- post-login navigation logic
- protected route behavior

## Remaining Operational Work

- deploy the Supabase Edge Function in your actual Supabase project
- apply the latest SQL schema to the target database
- create real auth users or send invitations from the admin panel
- verify each role end-to-end in the deployed environment
