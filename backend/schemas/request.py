from typing import Any

from pydantic import BaseModel, Field


class CreateRequestPayload(BaseModel):
    request_text: str = Field(default="")
    extracted: dict[str, Any] = Field(default_factory=dict)
    parsed: dict[str, Any] = Field(default_factory=dict)
    issues: list[Any] = Field(default_factory=list)
