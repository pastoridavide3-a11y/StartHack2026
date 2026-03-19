from typing import Any

from pydantic import BaseModel, Field


class ProcessedOutput(BaseModel):
    output_id: int
    request_id: str
    processed_at: str
    final_output: dict[str, Any] = Field(default_factory=dict)

