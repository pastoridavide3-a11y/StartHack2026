from typing import Any, Optional

from pydantic import BaseModel, Field


class ValidationIssue(BaseModel):
  # missing_in_extraction | contradiction | warning
  type: str
  field: str
  message: str = Field(description="Human-readable issue message")
  severity: str = Field(default="warning", description="warning | error | info")
  extracted_value: Optional[Any] = None
  parsed_value: Optional[Any] = None


class ValidateRequest(BaseModel):
  text: str = Field(..., min_length=1)
  parsed: dict[str, Any]
  comparison_fields: Optional[list[str]] = None


class ValidateResponse(BaseModel):
  parsed: dict[str, Any]
  extracted: dict[str, Any]
  issues: list[ValidationIssue] = []
  is_valid: bool = True

