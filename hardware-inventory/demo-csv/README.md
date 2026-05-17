# Demo CSV Files

Use these files to demonstrate the CSV workflows in HardwareHub.

## Product Master Import

Screen: `Inventory` -> `Import Products`

- `product_master_create_update.csv`
  - Use mode: `Create + update stock`
  - Demonstrates creating new demo products and updating an existing SKU.

- `product_master_create_only.csv`
  - Use mode: `Create only`
  - Demonstrates creating products while skipping existing SKUs.

- `product_master_update_details.csv`
  - Use mode: `Update details only`
  - Demonstrates changing product name/category/safety stock/order quantity/price/supplier without changing current stock.

- `product_master_update_baseline.csv`
  - Use mode: `Update stock baseline`
  - Demonstrates updating current stock only.

- `product_master_with_issues.csv`
  - Use any product import mode except baseline.
  - Demonstrates validation errors such as duplicate SKU, missing SKU, invalid stock, invalid safety stock, invalid quantity, and invalid price.

## Sales Import

Screen: `Sales Import`

- `sales_import_valid.csv`
  - Demonstrates a clean cashier sales import using existing seed SKUs.
  - Uses small quantities so it is safe for normal seed data.

- `sales_import_with_issues.csv`
  - Demonstrates validation errors such as unknown SKU, missing SKU, invalid quantity, negative price, and likely insufficient stock.

## Suggested Demo Order

1. Import `product_master_create_update.csv`.
2. Search the new `DEMOCSV-` SKUs in Inventory.
3. Import `sales_import_valid.csv`.
4. Open Stock Movements and show the sale movements.
5. Try `sales_import_with_issues.csv` and show row-level errors.
6. Try `product_master_with_issues.csv` and show row-level errors plus issue export.
7. Run Generate Forecast after importing valid sales.
