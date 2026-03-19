from fastapi import APIRouter, HTTPException

from backend.schemas.request import CreateRequestPayload
from backend.services.storage_service import (
    create_request,
    delete_request,
    get_all_requests,
    get_request_by_id,
    update_request,
)

router = APIRouter(prefix="/requests", tags=["requests"])


@router.post("")
def create_request_endpoint(payload: CreateRequestPayload):
    """Create a new request from validated form data."""
    data = {
        "request_text": payload.request_text,
        "extracted": payload.extracted,
        "parsed": payload.parsed,
        "issues": payload.issues,
    }
    return create_request(data)


@router.get("")
def list_requests():
    """List all requests."""
    return get_all_requests()


@router.get("/{request_id:int}")
def get_request(request_id: int):
    """Get a single request by id."""
    req = get_request_by_id(request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found")
    return req


@router.put("/{request_id:int}")
def update_request_endpoint(request_id: int, payload: CreateRequestPayload):
    """Update an existing request."""
    data = {
        "request_text": payload.request_text,
        "extracted": payload.extracted,
        "parsed": payload.parsed,
        "issues": payload.issues,
    }
    updated = update_request(request_id, data)
    if updated is None:
        raise HTTPException(status_code=404, detail="Request not found")
    return updated


@router.delete("/{request_id:int}")
def delete_request_endpoint(request_id: int):
    """Delete a request."""
    if not delete_request(request_id):
        raise HTTPException(status_code=404, detail="Request not found")
    return {"deleted": request_id}
