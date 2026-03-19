from typing import Any, Optional

from pydantic import BaseModel, Field


class ExtractRequest(BaseModel):
  text: str = Field(..., min_length=1)
  language: Optional[str] = None


class ExtractResponse(BaseModel):
  extracted: dict[str, Any]


