from fastapi import APIRouter

from backend.schemas.validate import ValidateRequest, ValidateResponse
from backend.services.validation_service import validate_extracted_vs_parsed

router = APIRouter()


@router.post("/validate", response_model=ValidateResponse)
def validate_endpoint(payload: ValidateRequest) -> ValidateResponse:
  return validate_extracted_vs_parsed(
    text=payload.text,
    parsed=payload.parsed,
    comparison_fields=payload.comparison_fields,
  )

