"""
Service that runs the procurement pipeline for a request and persists the output.

Note: imports `run_single_request` lazily to avoid circular imports between
backend.main and backend.app.
"""

from backend.services.processed_outputs_storage import append_processed_output


def process_request(request_id: str) -> dict:
    """
    Run the pipeline for the given request_id, persist the output, and return the result.
    """
    # Lazy import to avoid circular import when FastAPI app is loaded.
    from backend.main import run_single_request

    final_output = run_single_request(request_id=request_id, model=None)
    record = append_processed_output(request_id=request_id, final_output=final_output)
    return {
        "request_id": request_id,
        "output_id": record["output_id"],
        "result": final_output,
    }
