"""
Lightweight JSON storage for processed pipeline outputs.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path("backend/data")
OUTPUTS_FILE = DATA_DIR / "processed_outputs.json"


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
    OUTPUTS_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
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
    return raw["outputs"]


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
