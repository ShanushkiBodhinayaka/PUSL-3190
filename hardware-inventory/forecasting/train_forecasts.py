from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.statespace.sarimax import SARIMAX

PRODUCT_PATTERN = re.compile(
    r"\('(?P<name>[^']*)'\s*,\s*'(?P<sku>[^']+)'\s*,\s*'(?P<category>[^']+)'\s*,\s*(?P<current_stock>\d+)\s*,\s*(?P<reorder_point>\d+)\s*,\s*(?P<reorder_quantity>\d+)\s*,\s*(?P<unit_price>[\d.]+)\s*,\s*'(?P<supplier>[^']+)'\)"
)


@dataclass
class CandidateResult:
    name: str
    mae: float
    rmse: float
    mape: float
    forecast: np.ndarray


def load_products(seed_sql_path: Path) -> pd.DataFrame:
    text = seed_sql_path.read_text(encoding="utf-8")
    rows = [match.groupdict() for match in PRODUCT_PATTERN.finditer(text)]
    frame = pd.DataFrame(rows)
    for column in ["current_stock", "reorder_point", "reorder_quantity", "unit_price"]:
        frame[column] = pd.to_numeric(frame[column])
    return frame


def seasonal_naive(train: pd.Series, horizon: int, seasonal_period: int = 7) -> np.ndarray:
    tail = train.iloc[-seasonal_period:].to_numpy()
    repeats = math.ceil(horizon / seasonal_period)
    return np.tile(tail, repeats)[:horizon]


def fit_holt_winters(train: pd.Series, horizon: int) -> np.ndarray:
    model = ExponentialSmoothing(
        train,
        trend="add",
        seasonal="add",
        seasonal_periods=7,
        initialization_method="estimated",
    ).fit(optimized=True, use_brute=False)
    forecast = model.forecast(horizon)
    return np.clip(forecast.to_numpy(), 0, None)


def fit_sarima(train: pd.Series, horizon: int) -> np.ndarray:
    candidate_specs = [
        ((1, 1, 1), (0, 1, 1, 7)),
        ((1, 0, 1), (1, 1, 0, 7)),
        ((2, 1, 1), (1, 1, 1, 7)),
    ]

    best_aic = float("inf")
    best_forecast = None

    for order, seasonal_order in candidate_specs:
        try:
            fitted = SARIMAX(
                train,
                order=order,
                seasonal_order=seasonal_order,
                enforce_stationarity=False,
                enforce_invertibility=False,
            ).fit(disp=False)
            if fitted.aic < best_aic:
                best_aic = fitted.aic
                forecast = fitted.get_forecast(steps=horizon).predicted_mean
                best_forecast = np.clip(forecast.to_numpy(), 0, None)
        except Exception:
            continue

    if best_forecast is None:
        raise RuntimeError("Unable to fit any SARIMA specification.")

    return best_forecast


def score_forecast(actual: np.ndarray, forecast: np.ndarray) -> tuple[float, float, float]:
    mae = float(np.mean(np.abs(actual - forecast)))
    rmse = float(np.sqrt(np.mean(np.square(actual - forecast))))
    safe_actual = np.where(actual == 0, 1, actual)
    mape = float(np.mean(np.abs((actual - forecast) / safe_actual)) * 100)
    return mae, rmse, mape


def choose_best_model(series: pd.Series, horizon: int) -> CandidateResult:
    train = series.iloc[:-horizon]
    actual = series.iloc[-horizon:].to_numpy()
    candidates: list[CandidateResult] = []

    naive_forecast = seasonal_naive(train, horizon)
    naive_mae, naive_rmse, naive_mape = score_forecast(actual, naive_forecast)
    candidates.append(CandidateResult("seasonal_naive", naive_mae, naive_rmse, naive_mape, naive_forecast))

    if len(train) >= 28:
        try:
            hw_forecast = fit_holt_winters(train, horizon)
            mae, rmse, mape = score_forecast(actual, hw_forecast)
            candidates.append(CandidateResult("holt_winters", mae, rmse, mape, hw_forecast))
        except Exception:
            pass

    if len(train) >= 56:
        try:
            sarima_forecast = fit_sarima(train, horizon)
            mae, rmse, mape = score_forecast(actual, sarima_forecast)
            candidates.append(CandidateResult("sarima", mae, rmse, mape, sarima_forecast))
        except Exception:
            pass

    return min(candidates, key=lambda item: item.mae)


def refit_full_series(series: pd.Series, model_name: str, horizon: int) -> np.ndarray:
    if model_name == "holt_winters" and len(series) >= 28:
        return fit_holt_winters(series, horizon)
    if model_name == "sarima" and len(series) >= 56:
        return fit_sarima(series, horizon)
    return seasonal_naive(series, horizon)


def escape_sql(value: str) -> str:
    return value.replace("'", "''")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history-csv", default="forecasting/generated/synthetic_sales_history.csv")
    parser.add_argument("--seed-sql", default="seed-data.sql")
    parser.add_argument("--horizon", type=int, default=14)
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    history_path = repo_root / args.history_csv
    products = load_products(repo_root / args.seed_sql)

    history = pd.read_csv(history_path, parse_dates=["date"])
    history["units_sold"] = pd.to_numeric(history["units_sold"])

    output_dir = repo_root / "forecasting" / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)

    forecast_rows = []
    metric_rows = []

    for product in products.to_dict(orient="records"):
        sku = product["sku"]
        series_df = history.loc[history["sku"] == sku, ["date", "units_sold"]].copy()
        if series_df.empty:
            continue

        series_df = (
            series_df.set_index("date")
            .resample("D")
            .sum()
            .sort_index()
        )
        series = series_df["units_sold"].astype(float)

        if len(series) < max(42, args.horizon * 3):
            continue

        best = choose_best_model(series, args.horizon)
        final_forecast = refit_full_series(series, best.name, args.horizon)

        predicted_demand = float(np.sum(final_forecast))
        predicted_daily_demand = float(np.mean(final_forecast))
        residual_std = float(series.rolling(window=28, min_periods=7).std().iloc[-1])
        if math.isnan(residual_std):
            residual_std = float(series.std())
        safety_stock = int(max(product["reorder_point"], math.ceil(1.65 * max(residual_std, 0.5) * math.sqrt(args.horizon))))
        projected_stock = float(product["current_stock"] - predicted_demand)
        reorder_signal = projected_stock <= safety_stock or product["current_stock"] <= product["reorder_point"]
        recommended_qty = int(max(
            product["reorder_quantity"],
            math.ceil(max(0.0, predicted_demand + safety_stock - product["current_stock"])),
        ))

        forecast_rows.append(
            {
                "sku": sku,
                "product_name": product["name"],
                "model_name": best.name,
                "training_data_source": history_path.name,
                "history_start": series.index.min().date().isoformat(),
                "history_end": series.index.max().date().isoformat(),
                "forecast_date": pd.Timestamp.today().date().isoformat(),
                "horizon_days": args.horizon,
                "predicted_demand": round(predicted_demand, 2),
                "predicted_daily_demand": round(predicted_daily_demand, 4),
                "safety_stock": safety_stock,
                "recommended_reorder_quantity": recommended_qty,
                "reorder_signal": bool(reorder_signal),
                "validation_mae": round(best.mae, 4),
                "validation_rmse": round(best.rmse, 4),
                "validation_mape": round(best.mape, 4),
                "projected_stock": round(projected_stock, 2),
            }
        )

        metric_rows.append(
            {
                "sku": sku,
                "selected_model": best.name,
                "mae": best.mae,
                "rmse": best.rmse,
                "mape": best.mape,
            }
        )

    forecast_df = pd.DataFrame(forecast_rows).sort_values(["reorder_signal", "predicted_demand"], ascending=[False, False])
    forecast_df.to_csv(output_dir / "demand_forecasts.csv", index=False)

    with (output_dir / "model_metrics.json").open("w", encoding="utf-8") as handle:
        json.dump(metric_rows, handle, indent=2)

    sql_lines = [
        "-- Generated by forecasting/train_forecasts.py",
        "delete from demand_forecasts;",
    ]
    for row in forecast_rows:
        sql_lines.append(
            "insert into demand_forecasts ("
            "product_id, model_name, training_data_source, history_start, history_end, forecast_date, horizon_days, "
            "predicted_demand, predicted_daily_demand, safety_stock, recommended_reorder_quantity, reorder_signal, "
            "validation_mae, validation_rmse, validation_mape, metadata"
            ") "
            "select p.id, "
            f"'{escape_sql(row['model_name'])}', "
            f"'{escape_sql(row['training_data_source'])}', "
            f"'{row['history_start']}', "
            f"'{row['history_end']}', "
            f"'{row['forecast_date']}', "
            f"{row['horizon_days']}, "
            f"{row['predicted_demand']}, "
            f"{row['predicted_daily_demand']}, "
            f"{row['safety_stock']}, "
            f"{row['recommended_reorder_quantity']}, "
            f"{str(row['reorder_signal']).lower()}, "
            f"{row['validation_mae']}, "
            f"{row['validation_rmse']}, "
            f"{row['validation_mape']}, "
            f"'{{\"projected_stock\": {row['projected_stock']}}}'::jsonb "
            "from products p "
            f"where p.sku = '{escape_sql(row['sku'])}';"
        )

    (output_dir / "demand_forecasts.sql").write_text("\n".join(sql_lines) + "\n", encoding="utf-8")

    print(f"Wrote {len(forecast_rows)} forecasts to {output_dir}")


if __name__ == "__main__":
    main()
