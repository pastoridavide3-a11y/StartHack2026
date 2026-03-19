"""
Lightweight JSON storage for processed pipeline outputs.
"""
from __future__ import annotations

import math
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path("backend/data")
OUTPUTS_FILE = DATA_DIR / "processed_outputs.json"


def sanitize_for_json(value: Any) -> Any:
    """
    Recursively sanitize values so json serialization is always valid JSON:
    - NaN -> None (so dumps emits `null`)
    - numpy/pandas scalar values -> native Python scalars
    - datetime -> ISO string
    """

    # numpy/pandas imports are optional here; sanitize should still work if they
    # aren't installed in some environments.
    np = None
    pd = None
    try:
        import numpy as _np  # type: ignore

        np = _np
    except Exception:
        np = None

    try:
        import pandas as _pd  # type: ignore

        pd = _pd
    except Exception:
        pd = None

    if value is None:
        return None

    # Convert numpy/pandas scalars to native Python values early.
    if np is not None and isinstance(value, np.generic):
        return sanitize_for_json(value.item())

    if pd is not None and hasattr(pd, "Timestamp"):
        # Pandas Timestamp is not json-serializable by default.
        if isinstance(value, pd.Timestamp):
            return value.isoformat()

    # Convert datetimes to ISO strings.
    if isinstance(value, datetime):
        return value.isoformat()

    # Handle NaN / non-finite floats.
    if isinstance(value, (float, int)):
        if isinstance(value, float):
            if not math.isfinite(value):
                return None
        return value

    # Catch numpy float NaN/Inf even if it didn't match np.generic above.
    if np is not None and isinstance(value, np.floating):
        if not np.isfinite(value):
            return None
        return float(value)

    # Catch pandas missing values (pd.NA / NaT / etc).
    if pd is not None:
        try:
            if pd.isna(value):
                return None
        except Exception:
            pass

    if isinstance(value, dict):
        return {k: sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(v) for v in value]
    if isinstance(value, tuple):
        return [sanitize_for_json(v) for v in value]

    # Leave other JSON-safe types as-is (str/bool/etc).
    return value


def _load_raw() -> dict[str, Any]:
    """Load data from JSON file. Returns { "outputs": [] } if missing/empty/malformed."""
    if not OUTPUTS_FILE.exists():
        return {"outputs": []}
    try:
        text = OUTPUTS_FILE.read_text(encoding="utf-8")
        text = text.strip()
        if not text:
            return {"outputs": []}
        data = json.loads(text)
        if not isinstance(data, dict) or "outputs" not in data:
            return {"outputs": []}
        if not isinstance(data["outputs"], list):
            return {"outputs": []}
        return data
    except (json.JSONDecodeError, OSError):
        return {"outputs": []}


def _save_raw(data: dict[str, Any]) -> None:
    """Write data to JSON file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    sanitized = sanitize_for_json(data)
    OUTPUTS_FILE.write_text(
        # ensure allow_nan=False so we never produce non-standard JSON.
        json.dumps(
            sanitized,
            indent=2,
            ensure_ascii=False,
            allow_nan=False,
        ),
        encoding="utf-8",
    )


def _next_output_id(outputs: list[dict[str, Any]]) -> int:
    """Return max(output_id) + 1."""
    max_id = 0
    for o in outputs:
        oid = o.get("output_id")
        if isinstance(oid, int) and oid > max_id:
            max_id = oid
    return max_id + 1


def load_processed_outputs() -> list[dict[str, Any]]:
    """Load all processed outputs."""
    raw = _load_raw()
    # Sanitize on load too, so old files with NaN become usable immediately.
    return sanitize_for_json(raw["outputs"])


def append_processed_output(request_id: str, final_output: dict[str, Any]) -> dict[str, Any]:
    """
    Append a new processed output. Returns the saved record with output_id and processed_at.
    """
    raw = _load_raw()
    outputs = raw["outputs"]
    output_id = _next_output_id(outputs)

    record = {
        "output_id": output_id,
        "request_id": request_id,
        "processed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "final_output": final_output,
    }
    outputs.append(record)
    _save_raw(raw)
    return record


def get_processed_output_by_request_id(request_id: str) -> dict[str, Any] | None:
    """Return the most recent processed output for the given request_id."""
    outputs = load_processed_outputs()
    for o in reversed(outputs):
        if o.get("request_id") == request_id:
            return o
    return None


def get_processed_output_by_output_id(output_id: int) -> dict[str, Any] | None:
    """Return a processed output by its output_id."""
    outputs = load_processed_outputs()
    for o in outputs:
        if o.get("output_id") == output_id:
            return o
    return None


def _processed_at_sort_key(value: Any) -> datetime:
    if not isinstance(value, str):
        return datetime.min.replace(tzinfo=timezone.utc)
    # stored as e.g. "2026-03-19T12:34:56Z"
    iso = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(iso)
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def list_processed_outputs_sorted_desc() -> list[dict[str, Any]]:
    """Return all outputs sorted by processed_at (desc)."""
    outputs = load_processed_outputs()
    return sorted(outputs, key=lambda o: _processed_at_sort_key(o.get("processed_at")), reverse=True)


def delete_processed_output_by_output_id(output_id: int) -> bool:
    """Delete one processed output. Returns True if it existed and was removed."""
    raw = _load_raw()
    outputs = raw["outputs"]
    before = len(outputs)
    raw["outputs"] = [o for o in outputs if o.get("output_id") != output_id]
    if len(raw["outputs"]) == before:
        return False
    _save_raw(raw)
    return True
