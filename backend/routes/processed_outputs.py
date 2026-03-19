from fastapi import APIRouter, HTTPException
from typing import Any

from backend.schemas.processed_output import ProcessedOutput
from backend.services.processed_outputs_storage import (
    delete_processed_output_by_output_id,
    get_processed_output_by_output_id,
    list_processed_outputs_sorted_desc,
)

router = APIRouter(tags=["processed-outputs"])


@router.get("/processed-outputs", response_model=list[ProcessedOutput])
def list_processed_outputs() -> list[ProcessedOutput]:
    return list_processed_outputs_sorted_desc()


@router.get(
    "/processed-outputs/{output_id:int}",
    response_model=ProcessedOutput,
)
def get_processed_output(output_id: int) -> ProcessedOutput:
    rec = get_processed_output_by_output_id(output_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Output not found")
    return ProcessedOutput(**rec)


@router.delete("/processed-outputs/{output_id:int}")
def delete_processed_output(output_id: int) -> dict[str, Any]:
    deleted = delete_processed_output_by_output_id(output_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Output not found")
    return {"deleted": True, "output_id": output_id}

