from typing import Any

from backend.schemas.validate import ValidationIssue, ValidateResponse
from backend.services.extraction_service import extract_from_text
from backend.utils.case import keys_to_snake_case


DEFAULT_COMPARISON_FIELDS = [
  "category_l1",
  "category_l2",
  "quantity",
  "unit_of_measure",
  "budget_amount",
  "currency",
  "delivery_countries",
  "required_by_date",
  "preferred_supplier_mentioned",
  "preferred_supplier_mentioned_2",
  "preferred_supplier_mentioned_3",
]

def validate_extracted_vs_parsed(
  text: str,
  parsed: dict[str, Any],
  comparison_fields: list[str] | None = None,
) -> ValidateResponse:
  extracted_raw = extract_from_text(text=text)

  ex_snake = keys_to_snake_case(extracted_raw)
  pa_snake = keys_to_snake_case(parsed)

  fields = comparison_fields or DEFAULT_COMPARISON_FIELDS
  issues: list[ValidationIssue] = []

  def normalize_for_compare(v: Any) -> str:
    if v is None:
      return ""
    if isinstance(v, list):
      # deterministic list normalization
      return ", ".join([str(x).strip() for x in v if x is not None])
    if isinstance(v, str):
      return v.strip()
    return str(v).strip()

  for field in fields:
    ex_val = ex_snake.get(field)
    pa_val = pa_snake.get(field)

    ex_norm = normalize_for_compare(ex_val)
    pa_norm = normalize_for_compare(pa_val)

    # missing_in_extraction: extracted has nothing, but parsed has something.
    if not ex_norm and pa_norm:
      issues.append(
        ValidationIssue(
          type="missing_in_extraction",
          field=field,
          severity="warning",
          message="Value provided by user is missing from LLM extraction.",
          extracted_value=ex_val,
          parsed_value=pa_val,
        )
      )
      continue

    # contradiction: both are provided but differ.
    # Special handling: frontend quantity is bucket/range-like ("2-5", "100+")
    # while extracted quantity is usually a number. We treat "quantity" as a range match.
    if ex_norm and pa_norm and ex_norm != pa_norm:
      if field == "quantity":
        def parse_quantity_bucket(s: str) -> tuple[float, float] | None:
          s = s.strip()
          if not s:
            return None
          if s.endswith("+"):
            try:
              return float(s[:-1].strip()), float("inf")
            except Exception:
              return None
          if "-" in s:
            left, right = s.split("-", 1)
            try:
              return float(left.strip()), float(right.strip())
            except Exception:
              return None
          try:
            x = float(s)
            return x, x
          except Exception:
            return None

        def try_float(v: Any) -> float | None:
          if v is None:
            return None
          if isinstance(v, (int, float)):
            return float(v)
          if isinstance(v, str):
            try:
              return float(v.strip())
            except Exception:
              return None
          try:
            return float(str(v).strip())
          except Exception:
            return None

        ex_num = try_float(ex_val)
        pa_bucket = parse_quantity_bucket(pa_norm)
        if ex_num is not None and pa_bucket is not None:
          pa_min, pa_max = pa_bucket
          in_bucket = pa_min <= ex_num <= pa_max
          if in_bucket:
            # Range match: don't raise contradiction.
            continue

      issues.append(
        ValidationIssue(
          type="contradiction",
          field=field,
          severity="warning",
          message="User value differs from LLM extraction.",
          extracted_value=ex_val,
          parsed_value=pa_val,
        )
      )

  return ValidateResponse(
    parsed=pa_snake,
    extracted=ex_snake,
    issues=issues,
    is_valid=True,
  )

