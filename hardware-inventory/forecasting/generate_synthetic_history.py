from __future__ import annotations

import csv
import math
import random
import re
from datetime import date, timedelta
from pathlib import Path

SEED = 42
HISTORY_DAYS = 540

PRODUCT_PATTERN = re.compile(
    r"\('(?P<name>[^']*)'\s*,\s*'(?P<sku>[^']+)'\s*,\s*'(?P<category>[^']+)'\s*,\s*(?P<current_stock>\d+)\s*,\s*(?P<reorder_point>\d+)\s*,\s*(?P<reorder_quantity>\d+)\s*,\s*(?P<unit_price>[\d.]+)\s*,\s*'(?P<supplier>[^']+)'\)"
)

CATEGORY_BASELINES = {
    "Fasteners": 8.5,
    "Power Tools": 0.7,
    "Plumbing": 2.8,
    "Paint": 2.4,
    "Lumber": 3.2,
    "Concrete": 2.1,
    "Electrical": 1.8,
    "Safety": 1.2,
}


def load_products(seed_sql_path: Path) -> list[dict]:
    text = seed_sql_path.read_text(encoding="utf-8")
    return [match.groupdict() for match in PRODUCT_PATTERN.finditer(text)]


def weekend_multiplier(day_index: int) -> float:
    if day_index == 5:
        return 1.3
    if day_index == 6:
        return 1.15
    return 0.95


def month_multiplier(month: int, category: str) -> float:
    if category in {"Paint", "Lumber", "Concrete"} and month in {3, 4, 5, 6, 7, 8}:
        return 1.25
    if category == "Safety" and month in {11, 12}:
        return 1.15
    if category == "Power Tools" and month in {10, 11, 12}:
        return 1.2
    return 1.0


def intermittent_probability(category: str) -> float:
    if category == "Power Tools":
        return 0.55
    if category == "Safety":
        return 0.7
    return 0.92


def poisson_sample(lam: float, rng: random.Random) -> int:
    if lam <= 0:
        return 0
    l_value = math.exp(-lam)
    k = 0
    p_value = 1.0
    while p_value > l_value:
        k += 1
        p_value *= rng.random()
    return max(0, k - 1)


def main() -> None:
    rng = random.Random(SEED)
    repo_root = Path(__file__).resolve().parents[1]
    products = load_products(repo_root / "seed-data.sql")

    output_dir = repo_root / "forecasting" / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "synthetic_sales_history.csv"

    start_date = date.today() - timedelta(days=HISTORY_DAYS - 1)

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["date", "sku", "product_name", "category", "units_sold", "promo_flag"],
        )
        writer.writeheader()

        for product in products:
            category = product["category"]
            base = CATEGORY_BASELINES.get(category, 1.5)
            reorder_point = int(product["reorder_point"])
            current_stock = int(product["current_stock"])
            product_factor = 0.65 + (current_stock / max(reorder_point, 1)) * 0.08 + rng.uniform(0.0, 0.65)
            promo_days = {rng.randint(0, HISTORY_DAYS - 1) for _ in range(rng.randint(6, 12))}

            for offset in range(HISTORY_DAYS):
                current_date = start_date + timedelta(days=offset)
                probability = intermittent_probability(category)
                if rng.random() > probability:
                    units = 0
                else:
                    weekly = weekend_multiplier(current_date.weekday())
                    seasonal = month_multiplier(current_date.month, category)
                    trend = 1.0 + (offset / HISTORY_DAYS) * rng.uniform(-0.08, 0.12)
                    promo = 1.8 if offset in promo_days else 1.0
                    lam = max(0.05, base * product_factor * weekly * seasonal * trend * promo)
                    units = poisson_sample(lam, rng)

                writer.writerow(
                    {
                        "date": current_date.isoformat(),
                        "sku": product["sku"],
                        "product_name": product["name"],
                        "category": category,
                        "units_sold": units,
                        "promo_flag": int(offset in promo_days),
                    }
                )

    print(f"Wrote synthetic sales history to {output_path}")


if __name__ == "__main__":
    main()
