"""
Service that runs the procurement pipeline for a request and persists the output.

Note: imports `run_single_request` lazily to avoid circular imports between
backend.main and backend.app.
"""

from typing import Any

from backend.services.llm_client import get_llm_model
from backend.services.processed_outputs_storage import append_processed_output
from backend.services.storage_service import get_request_by_id
from backend.services.validation_service import validate_extracted_vs_parsed


def _has_meaningful_extraction(extracted: dict[str, Any]) -> bool:
    """True when at least one extracted field contains a non-empty value."""

    def _is_meaningful(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return value.strip() != ""
        if isinstance(value, (list, tuple, set)):
            return any(_is_meaningful(v) for v in value)
        if isinstance(value, dict):
            return any(_is_meaningful(v) for v in value.values())
        return True

    return any(_is_meaningful(v) for v in extracted.values())


def process_request(request_id: str) -> dict:
    """
    Run the pipeline for the given request_id, persist the output, and return the result.
    """
    request_record = get_request_by_id(request_id)
    if request_record is None:
        raise ValueError(f"Request not found: {request_id}")

    # Reuse the same extraction/validation service used by the Add Request flow.
    validation = validate_extracted_vs_parsed(
        text=str(request_record.get("request_text") or ""),
        parsed=request_record,
    )
    if not _has_meaningful_extraction(validation.extracted):
        raise RuntimeError(
            "LLM extraction failed or returned empty output during process-from-list validation."
        )

    # Lazy import to avoid circular import when FastAPI app is loaded.
    from backend.main import run_single_request

    llm_model = get_llm_model()
    final_output = run_single_request(request_id=request_id, model=llm_model)
    record = append_processed_output(request_id=request_id, final_output=final_output)
    return {
        "request_id": request_id,
        "output_id": record["output_id"],
        "result": final_output,
    }
