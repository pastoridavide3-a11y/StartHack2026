import re
from typing import Any


_FIRST_CAP_RE = re.compile("(.)([A-Z][a-z]+)")
_ALL_CAP_RE = re.compile("([a-z0-9])([A-Z])")


def to_snake_case(name: str) -> str:
  """
  Convert camelCase/PascalCase to snake_case.
  Example: categoryL2 -> category_l2
  """
  s1 = _FIRST_CAP_RE.sub(r"\1_\2", name)
  s2 = _ALL_CAP_RE.sub(r"\1_\2", s1)
  s2 = s2.replace(" ", "_")
  return s2.lower()


def to_camel_case(name: str) -> str:
  """
  Convert snake_case to camelCase.
  Example: category_l2 -> categoryL2
  """
  parts = name.strip().split("_")
  if not parts:
    return name
  first = parts[0].lower()
  rest = [p[:1].upper() + p[1:].lower() if p else "" for p in parts[1:]]
  return "".join([first] + rest)


def keys_to_snake_case(obj: Any) -> Any:
  """
  Recursively convert dict keys from camelCase to snake_case.
  Leaves values intact.
  """
  if isinstance(obj, dict):
    return {to_snake_case(str(k)): keys_to_snake_case(v) for k, v in obj.items()}
  if isinstance(obj, list):
    return [keys_to_snake_case(v) for v in obj]
  return obj


def keys_to_camel_case(obj: Any) -> Any:
  """
  Recursively convert dict keys from snake_case to camelCase.
  """
  if isinstance(obj, dict):
    return {to_camel_case(str(k)): keys_to_camel_case(v) for k, v in obj.items()}
  if isinstance(obj, list):
    return [keys_to_camel_case(v) for v in obj]
  return obj

