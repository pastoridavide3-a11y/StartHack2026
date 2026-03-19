from fastapi import APIRouter

from backend.schemas.extract import ExtractRequest, ExtractResponse
from backend.services.extraction_service import extract_from_text

router = APIRouter()


@router.post("/extract", response_model=ExtractResponse)
def extract_endpoint(payload: ExtractRequest) -> ExtractResponse:
  extracted = extract_from_text(
    text=payload.text,
    language=payload.language,
  )

  return ExtractResponse(extracted=extracted)

