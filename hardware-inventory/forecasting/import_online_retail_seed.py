from __future__ import annotations

import argparse
import math
import re
from pathlib import Path

import pandas as pd


DEFAULT_OUTPUT = Path(__file__).resolve().parent / "generated" / "kaggle_demo_seed.sql"
DEFAULT_INPUT = Path(__file__).resolve().parent / "data" / "online_retail" / "Online Retail.xlsx"


def slugify_sku(value: str, existing: set[str]) -> str:
    base = re.sub(r"[^A-Z0-9]+", "-", str(value).upper()).strip("-") or "ITEM"
    sku = f"KGL-{base}"[:40]
    candidate = sku
    counter = 2

    while candidate in existing:
        suffix = f"-{counter}"
        candidate = f"{sku[: 40 - len(suffix)]}{suffix}"
        counter += 1

    existing.add(candidate)
    return candidate


def sql_quote(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def infer_category(description: str) -> str:
    text = description.lower()
    mapping = [
        ("Storage", ["box", "drawer", "basket", "jar", "tin", "cabinet"]),
        ("Decor", ["heart", "ornament", "frame", "clock", "lamp", "candle", "garland"]),
        ("Kitchen", ["mug", "plate", "bowl", "kitchen", "spoon", "cup", "teapot", "jug"]),
        ("Textiles", ["cushion", "blanket", "towel", "napkin", "bag", "rug"]),
        ("Party", ["party", "christmas", "birthday", "card", "gift", "wrap"]),
        ("Accessories", ["wallet", "purse", "necklace", "bracelet", "ring"]),
    ]

    for category, keywords in mapping:
        if any(keyword in text for keyword in keywords):
            return category

    return "General Merchandise"


def pick_inventory_levels(rank: int, sold_qty: int) -> tuple[int, int, int]:
    reorder_point = max(5, min(80, math.ceil(sold_qty / 18)))
    reorder_quantity = max(reorder_point * 2, math.ceil(sold_qty / 8))

    if rank % 4 == 0:
        current_stock = max(2, reorder_point - 3)
    elif rank % 4 == 1:
        current_stock = reorder_point
    elif rank % 4 == 2:
        current_stock = reorder_point + max(4, math.ceil(reorder_point * 0.4))
    else:
        current_stock = reorder_point + max(8, reorder_point)

    return current_stock, reorder_point, reorder_quantity


def load_dataset(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    if path.suffix.lower() in {".xlsx", ".xls"}:
        frame = pd.read_excel(path)
    else:
        frame = pd.read_csv(path)

    frame.columns = [column.strip().lower().replace(" ", "") for column in frame.columns]

    required = {
        "invoiceno",
        "stockcode",
        "description",
        "quantity",
        "invoicedate",
        "unitprice",
    }
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Dataset is missing required columns: {', '.join(sorted(missing))}")

    frame["description"] = frame["description"].fillna("").astype(str).str.strip()
    frame["stockcode"] = frame["stockcode"].fillna("").astype(str).str.strip()
    frame["invoiceno"] = frame["invoiceno"].fillna("").astype(str).str.strip()
    frame["quantity"] = pd.to_numeric(frame["quantity"], errors="coerce")
    frame["unitprice"] = pd.to_numeric(frame["unitprice"], errors="coerce")
    frame["invoicedate"] = pd.to_datetime(frame["invoicedate"], errors="coerce")

    frame = frame[
        frame["description"].ne("")
        & frame["stockcode"].ne("")
        & frame["quantity"].gt(0)
        & frame["unitprice"].gt(0)
        & frame["invoicedate"].notna()
        & ~frame["invoiceno"].str.upper().str.startswith("C")
    ].copy()

    frame["revenue"] = frame["quantity"] * frame["unitprice"]
    return frame


def build_seed_sql(frame: pd.DataFrame, top_products: int, movement_days: int) -> str:
    product_summary = (
        frame.groupby(["stockcode", "description"], as_index=False)
        .agg(
            sold_qty=("quantity", "sum"),
            avg_price=("unitprice", "median"),
            revenue=("revenue", "sum"),
        )
        .sort_values(["revenue", "sold_qty"], ascending=[False, False])
        .head(top_products)
        .reset_index(drop=True)
    )

    selected_codes = set(product_summary["stockcode"])
    filtered = frame[frame["stockcode"].isin(selected_codes)].copy()

    latest_date = filtered["invoicedate"].max().normalize()
    earliest_date = latest_date - pd.Timedelta(days=movement_days - 1)
    filtered = filtered[filtered["invoicedate"] >= earliest_date].copy()
    filtered["movement_day"] = filtered["invoicedate"].dt.normalize()

    sku_registry: set[str] = set()
    product_rows = []

    for rank, row in product_summary.iterrows():
        current_stock, reorder_point, reorder_quantity = pick_inventory_levels(rank, int(row["sold_qty"]))
        product_rows.append(
            {
                "stockcode": row["stockcode"],
                "name": row["description"][:120],
                "sku": slugify_sku(row["stockcode"], sku_registry),
                "category": infer_category(row["description"]),
                "current_stock": current_stock,
                "reorder_point": reorder_point,
                "reorder_quantity": reorder_quantity,
                "unit_price": round(float(row["avg_price"]), 2),
                "supplier_name": "Kaggle Demo Import",
            }
        )

    product_frame = pd.DataFrame(product_rows)

    movement_rows = (
        filtered.groupby(["stockcode", "movement_day"], as_index=False)
        .agg(quantity=("quantity", "sum"))
        .sort_values(["movement_day", "stockcode"])
    )

    sql_lines = [
        "-- ============================================================",
        "-- Demo seed generated from an Online Retail style Kaggle/UCI dataset",
        "-- Safe to run after supabase-schema.sql",
        "-- This upserts products by SKU and appends sale stock movements.",
        "-- ============================================================",
        "",
        "insert into products (name, sku, category, current_stock, reorder_point, reorder_quantity, unit_price, supplier_name)",
        "values",
    ]

    value_lines = []
    for product in product_rows:
        value_lines.append(
            "  ("
            + ", ".join(
                [
                    sql_quote(product["name"]),
                    sql_quote(product["sku"]),
                    sql_quote(product["category"]),
                    str(product["current_stock"]),
                    str(product["reorder_point"]),
                    str(product["reorder_quantity"]),
                    f"{product['unit_price']:.2f}",
                    sql_quote(product["supplier_name"]),
                ]
            )
            + ")"
        )

    sql_lines.append(",\n".join(value_lines))
    sql_lines.append(
        "on conflict (sku) do update set "
        "name = excluded.name, "
        "category = excluded.category, "
        "current_stock = excluded.current_stock, "
        "reorder_point = excluded.reorder_point, "
        "reorder_quantity = excluded.reorder_quantity, "
        "unit_price = excluded.unit_price, "
        "supplier_name = excluded.supplier_name;"
    )
    sql_lines.append("")
    sql_lines.append("insert into stock_movements (product_id, movement_type, quantity, notes, created_at)")
    sql_lines.append("select p.id, 'sale', src.quantity, src.notes, src.created_at::timestamptz")
    sql_lines.append("from (values")

    movement_value_lines = []
    sku_by_stockcode = {
        row["stockcode"]: row["sku"]
        for row in product_rows
    }

    for movement in movement_rows.itertuples(index=False):
        sku = sku_by_stockcode[movement.stockcode]
        created_at = pd.Timestamp(movement.movement_day).strftime("%Y-%m-%d 12:00:00+00")
        note = f"Imported retail sale volume for {movement.stockcode}"
        movement_value_lines.append(
            "  ("
            + ", ".join(
                [
                    sql_quote(sku),
                    str(int(movement.quantity)),
                    sql_quote(note),
                    sql_quote(created_at),
                ]
            )
            + ")"
        )

    sql_lines.append(",\n".join(movement_value_lines))
    sql_lines.append(") as src(sku, quantity, notes, created_at)")
    sql_lines.append("join products p on p.sku = src.sku;")
    sql_lines.append("")
    sql_lines.append("-- Summary")
    sql_lines.append(f"-- Products imported: {len(product_rows)}")
    sql_lines.append(f"-- Sale movement rows imported: {len(movement_value_lines)}")
    sql_lines.append(f"-- Source date window: {earliest_date.date()} to {latest_date.date()}")
    return "\n".join(sql_lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert an Online Retail Kaggle/UCI dataset into demo seed SQL for HardwareHub."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help="Path to the CSV/XLSX dataset file.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Where to write the generated SQL file.",
    )
    parser.add_argument(
        "--top-products",
        type=int,
        default=24,
        help="Number of highest-revenue products to import.",
    )
    parser.add_argument(
        "--movement-days",
        type=int,
        default=30,
        help="How many trailing days of sales history to convert into stock movements.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    frame = load_dataset(args.input)
    sql = build_seed_sql(
        frame=frame,
        top_products=max(1, args.top_products),
        movement_days=max(7, args.movement_days),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(sql, encoding="utf-8")
    print(f"Wrote demo seed SQL to {args.output}")


if __name__ == "__main__":
    main()
