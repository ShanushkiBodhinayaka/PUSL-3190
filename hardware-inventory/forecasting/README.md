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
- `import_online_retail_seed.py`: converts an Online Retail style Kaggle/UCI dataset into demo seed SQL for this app

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

## Seed demo data from a real retail dataset

If you want more realistic demo data than `seed-data.sql`, you can use the common Online Retail dataset
that is available on UCI and mirrors many Kaggle versions of the same data.

1. Download the dataset:

```bash
python forecasting/download_online_retail.py
```

2. Convert it into app-friendly SQL:

```bash
python forecasting/import_online_retail_seed.py
```

Output:

- `forecasting/generated/kaggle_demo_seed.sql`

3. Run that generated SQL in the Supabase SQL Editor after `supabase-schema.sql`.

Notes:

- The importer upserts products and appends sale stock movements.
- It keeps only the top revenue products so the demo stays readable.
- It is designed for Online Retail style columns such as `InvoiceNo`, `StockCode`, `Description`,
  `Quantity`, `InvoiceDate`, and `UnitPrice`.
- Many Kaggle copies of the Online Retail dataset work without modification. If your file uses the same
  columns, pass it with `--input path/to/file.csv`.

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
