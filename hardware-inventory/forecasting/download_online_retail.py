from pathlib import Path
import zipfile
import io

import requests

DATASET_URL = "https://archive.ics.uci.edu/static/public/352/online+retail.zip"


def main() -> None:
    output_dir = Path(__file__).resolve().parent / "data" / "online_retail"
    output_dir.mkdir(parents=True, exist_ok=True)

    response = requests.get(DATASET_URL, timeout=60)
    response.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        archive.extractall(output_dir)

    print(f"Downloaded and extracted dataset to {output_dir}")


if __name__ == "__main__":
    main()
