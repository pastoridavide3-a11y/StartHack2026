from __future__ import annotations

import os
from typing import Any


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

  api_key = os.getenv("GOOGLE_API_KEY")
  if not api_key:
    # Minimal fallback: reuse the hardcoded model from backend/llm_extraction.py.
    # This keeps /extract working even without env configuration.
    try:
      from backend.llm_extraction import model as llm_model  # type: ignore

      return llm_model
    except Exception:
      raise RuntimeError(
        "Missing GOOGLE_API_KEY and unable to import backend.llm_extraction.model."
      )

  model_name = os.getenv("GOOGLE_MODEL_NAME", "gemini-1.5-flash")

  try:
    import google.generativeai as genai  # type: ignore
  except Exception as e:
    raise RuntimeError(
      "Missing dependency 'google-generativeai'. Install backend requirements."
    ) from e

  genai.configure(api_key=api_key)
  _MODEL = genai.GenerativeModel(model_name)
  return _MODEL

