import json
from pathlib import Path
from typing import Optional

import re

import pandas as pd

# IMPORTANT:
# This repo has both `backend/utils.py` (module) and `backend/utils/` (package).
# `from backend import utils` may therefore resolve to the *package*,
# which doesn't expose functions like `interpret_request`.
# We load `backend/utils.py` explicitly to ensure we get the right module.
import importlib.util as _importlib_util

_UTILS_PY_PATH = Path(__file__).resolve().parent / "utils.py"
_utils_spec = _importlib_util.spec_from_file_location("backend_utils_module", _UTILS_PY_PATH)
if _utils_spec is None or _utils_spec.loader is None:
    raise RuntimeError(f"Unable to load utils.py from {_UTILS_PY_PATH}")
utils = _importlib_util.module_from_spec(_utils_spec)
_utils_spec.loader.exec_module(utils)


BASE_DIR = Path(__file__).resolve().parent


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_data(base_dir: Path = BASE_DIR):
    requests = load_json(base_dir / "data/requests.json")
    policies = load_json(base_dir / "data/policies.json")

    suppliers_df = pd.read_csv(base_dir / "data/suppliers.csv")
    pricing_df = pd.read_csv(base_dir / "data/pricing.csv")
    categories_df = pd.read_csv(base_dir / "data/categories.csv")

    historical_awards_path = base_dir / "data/historical_awards.csv"
    historical_awards_df = (
        pd.read_csv(historical_awards_path)
        if historical_awards_path.exists()
        else pd.DataFrame()
    )

    return {
        "requests": requests,
        "policies": policies,
        "suppliers_df": suppliers_df,
        "pricing_df": pricing_df,
        "categories_df": categories_df,
        "historical_awards_df": historical_awards_df,
    }


def get_request_by_id(requests, request_id: str):
    for r in requests:
        if r.get("request_id") == request_id:
            return r
    raise ValueError(f"Request not found: {request_id}")


def preprocess_request(
    raw_request: dict,
    model: Optional[object],
    categories_df: pd.DataFrame,
    suppliers_df: pd.DataFrame,
) -> dict:
    """
    Usa validate_request se vuoi anche enrichment/contradiction detection da testo.
    Altrimenti cade su interpret_request.
    """
    try:
        return utils.validate_request(
            raw_request,
            model=model,
            categories=categories_df,
            suppliers=suppliers_df,
        )
    except Exception:
        return utils.interpret_request(raw_request)


def run_single_request(
    request_id: str,
    model: Optional[object] = None,
    base_dir: Path = BASE_DIR,
):
    data = load_data(base_dir)

    raw_request = get_request_by_id(data["requests"], request_id)

    request = preprocess_request(
        raw_request=raw_request,
        model=model,
        categories_df=data["categories_df"],
        suppliers_df=data["suppliers_df"],
    )

    all_policy_rules = utils.build_all_policy_rules(data["policies"])

    pipeline_out = utils.run_procurement_pipeline(
        request=request,
        suppliers_df=data["suppliers_df"],
        pricing_df=data["pricing_df"],
        all_policy_rules=all_policy_rules,
    )

    final_output = utils.build_final_output(pipeline_out)
    return final_output


def save_output(output: dict, output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)


model = None

if __name__ == "__main__":
    REQUEST_ID = "REQ-000002"
    OUTPUT_DIR = BASE_DIR / "outputs"
    OUTPUT_PATH = OUTPUT_DIR / f"{REQUEST_ID}_output.json"

    # Se vuoi usare un LLM per extract_from_text, sostituisci None con il tuo model
    model = None

    final_output = run_single_request(
        request_id=REQUEST_ID,
        model=model,
        base_dir=BASE_DIR,
    )

    save_output(final_output, OUTPUT_PATH)

    print(f"Saved output to: {OUTPUT_PATH}")
    print(json.dumps(final_output["recommendation"], indent=2, ensure_ascii=False))


# Expose FastAPI app for compatibility with `uvicorn backend.main:app`.
# We import it lazily at the end to avoid circular imports.
try:
    from backend.app import app  # type: ignore
except Exception:
    app = None  # type: ignore