"""
Simple JSON file storage for requests. Demo / hackathon only.
Uses root array format with request_id "REQ-000001", "REQ-000002", etc.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Path relative to project root (when running uvicorn backend.app:app)
DATA_DIR = Path("backend/data")
REQUESTS_FILE = DATA_DIR / "requests.json"

REQ_ID_PATTERN = re.compile(r"^REQ-(\d+)$", re.IGNORECASE)


def _load_requests() -> list[dict[str, Any]]:
    """Load requests from JSON file. Returns [] if missing/empty/malformed."""
    if not REQUESTS_FILE.exists():
        return []
    try:
        text = REQUESTS_FILE.read_text(encoding="utf-8")
        text = text.strip()
        if not text:
            return []
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and "requests" in data and isinstance(data["requests"], list):
            return data["requests"]
        return []
    except (json.JSONDecodeError, OSError):
        return []


def _save_requests(requests: list[dict[str, Any]]) -> None:
    """Write requests array to JSON file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    REQUESTS_FILE.write_text(json.dumps(requests, indent=2, ensure_ascii=False), encoding="utf-8")


def _next_request_id(requests: list[dict[str, Any]]) -> str:
    """Parse REQ-000XXX from existing items, return next id e.g. REQ-000305."""
    max_num = 0
    for r in requests:
        rid = r.get("request_id") or r.get("id")
        if isinstance(rid, str):
            m = REQ_ID_PATTERN.match(rid.strip())
            if m:
                max_num = max(max_num, int(m.group(1)))
        elif isinstance(rid, int) and rid > max_num:
            max_num = rid
    return f"REQ-{max_num + 1:06d}"


def _build_record(request_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Build a record matching the existing schema from parsed/extracted."""
    parsed = data.get("parsed") or {}
    created = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    delivery = parsed.get("delivery_countries")
    country = delivery[0] if isinstance(delivery, list) and delivery else ""

    return {
        "request_id": request_id,
        "created_at": created,
        "request_channel": "portal",
        "request_language": "en",
        "business_unit": parsed.get("business_unit") or "",
        "country": country,
        "site": "",
        "requester_id": "",
        "requester_role": "",
        "submitted_for_id": "",
        "category_l1": parsed.get("category_l1") or "",
        "category_l2": parsed.get("category_l2") or "",
        "title": "",
        "request_text": data.get("request_text", ""),
        "currency": parsed.get("currency") or "",
        "budget_amount": parsed.get("budget_amount"),
        "quantity": parsed.get("quantity"),
        "unit_of_measure": parsed.get("unit_of_measure") or "",
        "required_by_date": parsed.get("required_by_date") or "",
        "preferred_supplier_mentioned": parsed.get("preferred_supplier_mentioned"),
        "incumbent_supplier": None,
        "contract_type_requested": None,
        "delivery_countries": parsed.get("delivery_countries") or [],
        "data_residency_constraint": parsed.get("data_residency_constraint", False),
        "esg_requirement": parsed.get("esg_requirement", False),
        "status": "new",
        "scenario_tags": [],
    }


def create_request(data: dict[str, Any]) -> dict[str, Any]:
    """
    Create a new request. Expects: request_text, extracted, parsed, issues.
    Appends to existing array with next request_id (REQ-000XXX).
    """
    requests = _load_requests()
    new_id = _next_request_id(requests)
    record = _build_record(new_id, data)
    requests.append(record)
    _save_requests(requests)
    return record


def get_all_requests() -> list[dict[str, Any]]:
    """Return all requests."""
    return _load_requests()


def get_request_by_id(request_id: str | int) -> dict[str, Any] | None:
    """Return request by request_id string (REQ-000001) or numeric id."""
    requests = _load_requests()
    for r in requests:
        rid = r.get("request_id") or r.get("id")
        if rid == request_id:
            return r
        if isinstance(rid, str) and isinstance(request_id, int):
            m = REQ_ID_PATTERN.match(rid)
            if m and int(m.group(1)) == request_id:
                return r
    return None


def update_request(request_id: str | int, data: dict[str, Any]) -> dict[str, Any] | None:
    """Update request by request_id. Returns updated record or None."""
    requests = _load_requests()
    for i, r in enumerate(requests):
        rid = r.get("request_id") or r.get("id")
        if rid == request_id:
            updated = {**r, **data}
            updated["request_id"] = r.get("request_id", request_id)
            requests[i] = updated
            _save_requests(requests)
            return updated
        if isinstance(rid, str) and isinstance(request_id, int):
            m = REQ_ID_PATTERN.match(rid)
            if m and int(m.group(1)) == request_id:
                updated = {**r, **data}
                updated["request_id"] = rid
                requests[i] = updated
                _save_requests(requests)
                return updated
    return None


def delete_request(request_id: str | int) -> bool:
    """Delete request by request_id. Returns True if deleted."""
    requests = _load_requests()
    for i, r in enumerate(requests):
        rid = r.get("request_id") or r.get("id")
        if rid == request_id:
            requests.pop(i)
            _save_requests(requests)
            return True
        if isinstance(rid, str) and isinstance(request_id, int):
            m = REQ_ID_PATTERN.match(rid)
            if m and int(m.group(1)) == request_id:
                requests.pop(i)
                _save_requests(requests)
                return True
    return False
