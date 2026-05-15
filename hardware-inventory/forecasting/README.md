# Forecasting Pipeline

This folder adds a real time-series forecasting workflow to HardwareHub.

## Why this approach

The app now supports a `demand_forecasts` table in Supabase. The frontend uses those forecasts first and falls back to heuristic logic only when no trained forecast is available.

Because SARIMA-style models are per-series models, a public retail dataset cannot directly forecast your app's current SKUs. For that reason this workflow does two things:

- generates synthetic retail-like history for your actual catalog so the app can be exercised end to end
- optionally downloads the UCI Online Retail dataset for benchmarking or later experimentation

## Files

- `generate_synthetic_history.py`: creates realistic daily sales history for the SKUs in `seed-data.sql`
- `train_forecasts.py`: trains real forecasting models and exports forecast recommendations
- `download_online_retail.py`: downloads the UCI Online Retail dataset

## Install

```bash
python -m pip install -r forecasting/requirements.txt
```

## Generate synthetic history

```bash
python forecasting/generate_synthetic_history.py
```

Output:

- `forecasting/generated/synthetic_sales_history.csv`

## Train and export forecasts

```bash
python forecasting/train_forecasts.py
```

Outputs:

- `forecasting/generated/demand_forecasts.csv`
- `forecasting/generated/demand_forecasts.sql`
- `forecasting/generated/model_metrics.json`

## Load forecasts into Supabase

Run the generated SQL file in your Supabase SQL editor:

```sql
-- paste forecasting/generated/demand_forecasts.sql
```

After that, the app will use those forecast rows when creating forecast-driven purchase orders.

## Notes on model choice

The trainer evaluates a small set of real forecasting candidates:

- SARIMA
- Holt-Winters Exponential Smoothing
- Seasonal naive baseline

It picks the best model per SKU by validation MAE. This is more robust across mixed retail products than forcing a single method on every item.
