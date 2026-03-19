from fastapi import APIRouter, HTTPException

from backend.schemas.processed_output import ProcessedOutput
from backend.services.processed_outputs_storage import (
    get_processed_output_by_output_id,
    load_processed_outputs,
)

router = APIRouter(tags=["processed-outputs"])


@router.get("/processed-outputs", response_model=list[ProcessedOutput])
def list_processed_outputs() -> list[ProcessedOutput]:
    return load_processed_outputs()


@router.get(
    "/processed-outputs/{output_id:int}",
    response_model=ProcessedOutput,
)
def get_processed_output(output_id: int) -> ProcessedOutput:
    rec = get_processed_output_by_output_id(output_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Output not found")
    return ProcessedOutput(**rec)

