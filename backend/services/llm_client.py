from __future__ import annotations

import os
from typing import Any

from backend.llm_extraction import build_groq_model_from_env


_MODEL: Any | None = None


def get_llm_model() -> Any:
  """
  Returns an initialized LLM model compatible with backend/llm_extraction.py.

  backend/llm_extraction.py expects a `model` object with:
    - model.generate_content(prompt) -> response with response.text
  """
  global _MODEL
  if _MODEL is not None:
    return _MODEL

  try:
    # Prefer explicit env-backed Groq model.
    _MODEL = build_groq_model_from_env()
    return _MODEL
  except Exception as e:
    # Fallback to module-level model (already initialized in llm_extraction.py).
    try:
      from backend.llm_extraction import model as llm_model  # type: ignore
      _MODEL = llm_model
      return _MODEL
    except Exception:
      raise RuntimeError("Unable to initialize Groq LLM model.") from e

