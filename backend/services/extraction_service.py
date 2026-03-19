from typing import Any, Optional

from backend.llm_extraction import extract_from_text as llm_extract_from_text
from backend.llm_extraction import model as llm_model
from backend.utils.case import keys_to_snake_case


def extract_from_text(text: str, language: Optional[str] = None) -> dict[str, Any]:
  """
  Business logic for extraction.

  Must reuse backend/llm_extraction.py as the source of truth.
  """

  # llm_extraction.py returns a dict with snake_case keys already in most cases,
  # but we normalize anyway to be defensive.
  raw_extracted = llm_extract_from_text(text, llm_model)
  extracted = keys_to_snake_case(raw_extracted)
  return extracted

