from __future__ import annotations

import argparse
import csv
import os
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def get_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value.rstrip("/")


def parse_created_date(value: str) -> str:
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized).astimezone(timezone.utc).date().isoformat()


def fetch_sales_movements(supabase_url: str, api_key: str, page_size: int) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
    }

    while True:
        params = urlencode(
            {
                "select": "created_at,quantity,products(sku,name,category)",
                "movement_type": "eq.sale",
                "order": "created_at.asc",
                "limit": str(page_size),
                "offset": str(offset),
            }
        )
        request = Request(
            f"{supabase_url}/rest/v1/stock_movements?{params}",
            headers=headers,
            method="GET",
        )
        with urlopen(request, timeout=30) as response:
            batch = json.loads(response.read().decode("utf-8"))
        rows.extend(batch)

        if len(batch) < page_size:
            break
        offset += page_size

    return rows


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export actual sale stock movements from Supabase into a daily SKU sales history CSV."
    )
    parser.add_argument("--output", default="forecasting/generated/actual_sales_history.csv")
    parser.add_argument("--page-size", type=int, default=1000)
    args = parser.parse_args()

    supabase_url = get_env("SUPABASE_URL")
    api_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or get_env("SUPABASE_ANON_KEY")

    repo_root = Path(__file__).resolve().parents[1]
    output_path = repo_root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    movements = fetch_sales_movements(supabase_url, api_key, args.page_size)
    daily_sales: dict[tuple[str, str], dict] = defaultdict(
        lambda: {
            "date": "",
            "sku": "",
            "product_name": "",
            "category": "",
            "units_sold": 0,
            "promo_flag": 0,
        }
    )

    for movement in movements:
        product = movement.get("products") or {}
        sku = product.get("sku")
        if not sku:
            continue

        day = parse_created_date(movement["created_at"])
        key = (day, sku)
        row = daily_sales[key]
        row["date"] = day
        row["sku"] = sku
        row["product_name"] = product.get("name") or sku
        row["category"] = product.get("category") or "Uncategorized"
        row["units_sold"] += int(movement.get("quantity") or 0)

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["date", "sku", "product_name", "category", "units_sold", "promo_flag"],
        )
        writer.writeheader()
        for row in sorted(daily_sales.values(), key=lambda item: (item["date"], item["sku"])):
            writer.writerow(row)

    print(f"Wrote {len(daily_sales)} daily SKU rows from {len(movements)} sale movements to {output_path}")


if __name__ == "__main__":
    main()
