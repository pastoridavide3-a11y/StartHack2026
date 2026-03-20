from datetime import datetime

import re
import os
import json
from urllib import request as urllib_request
from urllib import error as urllib_error
from concurrent.futures import ThreadPoolExecutor, TimeoutError

from backend.utils.data_loaders import load_categories_suppliers

class _GroqResponse:
    def __init__(self, text: str):
        self.text = text


class GroqModel:
    """
    Minimal adapter with Gemini-like shape:
      model.generate_content(prompt) -> object with `.text`
    """

    def __init__(self, api_key: str, model_name: str, timeout_seconds: int = 45):
        self.api_key = api_key
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds
        self.url = "https://api.groq.com/openai/v1/chat/completions"

    def generate_content(self, prompt: str) -> _GroqResponse:
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
        }
        body = json.dumps(payload).encode("utf-8")
        req = urllib_request.Request(
            self.url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib_request.urlopen(req, timeout=self.timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
        except urllib_error.HTTPError as e:
            details = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Groq HTTP {e.code}: {details}") from e
        except urllib_error.URLError as e:
            raise RuntimeError(f"Groq connection failed: {e}") from e

        parsed = json.loads(raw)
        text = (
            parsed.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        return _GroqResponse(str(text))


def build_groq_model_from_env() -> GroqModel:
    api_key = os.getenv("GROQ_API_KEY")
    model_name = os.getenv("GROQ_MODEL_NAME", "llama-3.1-8b-instant")
    timeout_seconds = int(os.getenv("LLM_TIMEOUT_SECONDS", "45"))
    if not api_key:
        raise RuntimeError("Missing GROQ_API_KEY.")
    return GroqModel(api_key=api_key, model_name=model_name, timeout_seconds=timeout_seconds)


model = build_groq_model_from_env()

# categories/suppliers are needed to build the extraction prompt.
# They are loaded from real CSVs under `backend/data/` when present.
categories, suppliers = load_categories_suppliers(data_dir="backend/data")

def compute_days_until_required(request):
    created = datetime.fromisoformat(request["created_at"].replace("Z", ""))
    required = datetime.fromisoformat(request["required_by_date"])
    return (required - created).days


def interpret_request(request):
    return {
        'request_id': request['request_id'],
        'created_at': request['created_at'],
        "category_l1": request["category_l1"],
        "category_l2": request["category_l2"],
        "quantity": request["quantity"],
        "unit_of_measure": request["unit_of_measure"],
        "budget_amount": request["budget_amount"],
        "currency": request["currency"],
        "delivery_countries": request["delivery_countries"] if request["delivery_countries"] else None,
        "required_by_date": request["required_by_date"],
        "days_until_required": compute_days_until_required(request),
        'data_residency_constraint': request['data_residency_constraint'],
        "esg_requirement": request["esg_requirement"],
        "preferred_supplier_mentioned": request["preferred_supplier_mentioned"],
        "incumbent_supplier": request["incumbent_supplier"],
        "text": request["request_text"]
    }

def extract_from_text(text, model):
    timeout_seconds = int(os.getenv("LLM_TIMEOUT_SECONDS", "45"))
    prompt = f"""
Extract the following fields:

- quantity
- budget_amount
- category_l1
- category_l2
- preferred_supplier_stated
- currency
- unit_of_measure
- required_by_date
- delivery_countries

Return ONLY JSON:
{{
 "quantity": number or None,
 "budget_amount": number or None,
 "category_l1": one out of {list(set(categories['category_l1'].values()))} or None,
 "category_l2": one out of {list(set(categories['category_l2'].values()))} or None,
 "preferred_supplier_mentioned": one out of {list(set(suppliers['supplier_name'].values()))} or None,
 "currency": one out of {list(set(suppliers['currency'].values()))} or None,
 "unit_of_measure": one out of {list(set(categories['typical_unit'].values()))} or None,
 "required_by_date": a date in format YYYY-MM-DD or None,
 "delivery_countries": list of countries or None
}}

Text:
{text}
"""

    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(model.generate_content, prompt)
            response = future.result(timeout=timeout_seconds)
    except Exception:
        return {
            "quantity": None,
            "budget_amount": None,
            "category_l1": None,
            "category_l2": None,
            "preferred_supplier_mentioned": None,
            "currency": None,
            "unit_of_measure": None,
            "required_by_date": None,
            "delivery_countries": None,
        }

    content = response.text.strip()
    match = re.search(r"\{[^{}]*\}", content)
    if match:
        content = match.group(0)

    try:
        return json.loads(content)
    except:
        return {
            "quantity": None,
            "budget_amount": None,
            "category_l1": None,
            'category_l2': None,
            'preferred_supplier_mentioned': None,
            'currency': None,
            'unit_of_measure': None,
            'required_by_date': None,
            'delivery_countries': None}

def validate_request(request):
    parsed = interpret_request(request)
    extracted = extract_from_text(parsed["text"], model)

    issues = []
    extract = ['quantity', 'budget_amount', 'category_l1', 'category_l2', 'preferred_supplier_mentioned', 'currency', 'unit_of_measure', 'required_by_date', 'delivery_countries']

    for i in extract:

        if parsed[i] is None:
            if extracted[i]:
                parsed[i] = extracted[i]
            else:
                parsed[i] = None
                issues.append({'type': 'missing', 'field': i})

        elif parsed[i] and extracted[i]:
            if parsed[i] != extracted[i]:
                issues.append({
                    'type': 'contradiction',
                    'field': i,
                    'json_value': parsed[i],
                    'text_value': extracted[i]
                })
    
    parsed['issues'] = issues
        
    return parsed
