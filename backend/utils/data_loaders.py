from __future__ import annotations

import csv
import os
from pathlib import Path
from typing import Any


def _load_csv_values(path: Path, column: str) -> dict[int, Any]:
  values: list[Any] = []
  with path.open("r", encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
      v = row.get(column)
      if v is None:
        continue
      v = str(v).strip()
      if not v:
        continue
      values.append(v)
  # prompt expects `.values` and then `set(...)`, so we return an index->value dict
  return {i: v for i, v in enumerate(values)}


def load_categories_suppliers(data_dir: str | os.PathLike) -> tuple[dict[str, Any], dict[str, Any]]:
  """
  Minimal loader for backend/llm_extraction.py.

  Expected (real) CSVs in backend/data (names can be adjusted as needed):
  - categories.csv with columns: category_l1, category_l2, typical_unit
  - suppliers.csv with columns: supplier_name, currency
  """
  data_path = Path(data_dir)

  categories: dict[str, Any] = {
    "category_l1": {},
    "category_l2": {},
    "typical_unit": {},
  }
  suppliers: dict[str, Any] = {
    "supplier_name": {},
    "currency": {},
  }

  categories_csv = data_path / "categories.csv"
  suppliers_csv = data_path / "suppliers.csv"

  if categories_csv.exists():
    categories["category_l1"] = _load_csv_values(categories_csv, "category_l1")
    categories["category_l2"] = _load_csv_values(categories_csv, "category_l2")
    categories["typical_unit"] = _load_csv_values(categories_csv, "typical_unit")

  if suppliers_csv.exists():
    suppliers["supplier_name"] = _load_csv_values(suppliers_csv, "supplier_name")
    suppliers["currency"] = _load_csv_values(suppliers_csv, "currency")

  return categories, suppliers

