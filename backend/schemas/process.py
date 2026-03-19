from typing import Any

from pydantic import BaseModel, Field


class ProcessRequestInput(BaseModel):
    request_id: str = Field(..., min_length=1)


class ProcessRequestResponse(BaseModel):
    request_id: str
    output_id: int
    result: dict[str, Any]
