from fastapi import APIRouter, HTTPException

from backend.schemas.process import ProcessRequestInput, ProcessRequestResponse
from backend.services.process_service import process_request

router = APIRouter(tags=["process"])


@router.post("/process-request", response_model=ProcessRequestResponse)
def process_request_endpoint(payload: ProcessRequestInput):
    """Run the procurement pipeline for the given request and persist the output."""
    try:
        result = process_request(request_id=payload.request_id)
        return ProcessRequestResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
