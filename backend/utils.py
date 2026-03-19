from datetime import datetime
import pandas as pd

def compute_days_until_required(request):
    created_at = None
    required_by_date = None

    # Accept both full request objects and partial dicts (text-only input flow).
    if isinstance(request, dict):
        created_at = request.get("created_at")
        required_by_date = request.get("required_by_date")
    else:
        # Defensive: if something unexpected is passed, fail softly.
        return None

    if not created_at or not required_by_date:
        return None

    try:
        created = datetime.fromisoformat(str(created_at).replace("Z", ""))
        required = datetime.fromisoformat(str(required_by_date))
        return (required - created).days
    except Exception:
        return None


def interpret_request(request):
    # Build a normalized request dict, tolerating missing keys.
    # This is needed for "input text only" flows where we extract fields later via LLM.
    created_at = request.get("created_at") if isinstance(request, dict) else None
    delivery_countries_raw = request.get("delivery_countries") if isinstance(request, dict) else None
    delivery_countries = delivery_countries_raw if delivery_countries_raw else []

    return {
        'request_id': request.get('request_id') if isinstance(request, dict) else None,
        'created_at': created_at,
        "category_l1": request.get("category_l1") if isinstance(request, dict) else None,
        "category_l2": request.get("category_l2") if isinstance(request, dict) else None,
        "quantity": request.get("quantity") if isinstance(request, dict) else None,
        "unit_of_measure": request.get("unit_of_measure") if isinstance(request, dict) else None,
        "budget_amount": request.get("budget_amount") if isinstance(request, dict) else None,
        "currency": request.get("currency") if isinstance(request, dict) else None,
        "delivery_countries": delivery_countries,
        "delivery_country": delivery_countries[0] if delivery_countries else None,
        "required_by_date": request.get("required_by_date") if isinstance(request, dict) else None,
        "days_until_required": compute_days_until_required(request if isinstance(request, dict) else {}),
        'data_residency_constraint': request.get('data_residency_constraint') if isinstance(request, dict) else None,
        "esg_requirement": request.get("esg_requirement") if isinstance(request, dict) else None,
        "preferred_supplier_mentioned": request.get("preferred_supplier_mentioned") if isinstance(request, dict) else None,
        "preferred_supplier_stated": request.get("preferred_supplier_mentioned") if isinstance(request, dict) else None,
        "incumbent_supplier": request.get("incumbent_supplier") if isinstance(request, dict) else None,
        "text": (request.get("request_text") or request.get("text") or "") if isinstance(request, dict) else ""
    }

def extract_from_text(text, model, categories, suppliers):
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
 "category_l1": one out of {list(set(categories['category_l1'].values))} or None,
 "category_l2": one out of {list(set(categories['category_l2'].values))} or None,
 "preferred_supplier_mentioned": one out of {list(set(suppliers['supplier_name'].values))} or None,
 "currency": one out of {list(set(suppliers['currency'].values))} or None,
 "unit_of_measure": one out of {list(set(categories['typical_unit'].values))} or None,
 "required_by_date": a date in format YYYY-MM-DD or None,
 "delivery_countries": list of countries or None
}}

Text:
{text}
"""

    response = model.generate_content(prompt)

    import re, json
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

def validate_request(request, model=None, categories=None, suppliers=None):
    parsed = interpret_request(request)

    fields_to_extract = [
        'quantity',
        'budget_amount',
        'category_l1',
        'category_l2',
        'preferred_supplier_mentioned',
        'currency',
        'unit_of_measure',
        'required_by_date',
        'delivery_countries'
    ]

    if model is not None and categories is not None and suppliers is not None:
        extracted = extract_from_text(parsed["text"], model, categories, suppliers)
    else:
        extracted = {k: None for k in fields_to_extract}

    issues = []

    for i in fields_to_extract:
        if parsed.get(i) is None or parsed.get(i) == []:
            if extracted.get(i) is not None:
                parsed[i] = extracted[i]
            else:
                issues.append({'type': 'missing', 'field': i})

        elif extracted.get(i) is not None:
            if parsed[i] != extracted[i]:
                issues.append({
                    'type': 'contradiction',
                    'field': i,
                    'json_value': parsed[i],
                    'text_value': extracted[i]
                })

    # Keep derived fields in sync after extraction.
    parsed["delivery_country"] = (
        parsed.get("delivery_countries")[0]
        if parsed.get("delivery_countries")
        else None
    )
    parsed["preferred_supplier_stated"] = parsed.get("preferred_supplier_mentioned")
    parsed["days_until_required"] = compute_days_until_required(parsed)

    parsed['issues'] = issues
    return parsed





from typing import Any, Dict, List, Optional


# =========================================================
# 2. HELPERS
# =========================================================


# ---------------------------------------------------------
# 1) PRENDO IL VALORE ECONOMICO PRINCIPALE DELLA REQUEST
#
# cosa fa:
# - restituisce request["contract_value"] se esiste
# - altrimenti usa request["budget_amount"]
#
# perché serve:
# - alcune regole guardano il "valore del caso"
# - ma nelle request quel valore può avere nomi diversi
#
# esempio pratico:
# request = {
#     "budget_amount": 25199.55,
#     "currency": "EUR"
# }
#
# regola approval threshold:
# - voglio capire se il valore è >= 25000
#
# uso:
# value = get_contract_value(request)
# compare(value, ">=", 25000)
#
# qui value diventa 25199.55
# ---------------------------------------------------------
def get_contract_value(request: Dict[str, Any]) -> Optional[float]:
    return request.get("contract_value", request.get("budget_amount"))


# ---------------------------------------------------------
# 2) NORMALIZZO TESTO
#
# cosa fa:
# - trasforma in stringa
# - toglie spazi iniziali/finali
# - mette tutto in minuscolo
#
# perché serve:
# - quando confronto testi come requester_instruction,
#   policy_note, restriction_reason, ecc.
#
# esempio pratico:
# request = {
#     "requester_instruction": "  Single Supplier Only "
# }
#
# voglio controllare se la request contiene qualcosa che
# confligge con una rule che richiede 2+ quotes
#
# uso:
# txt = normalize_text(request["requester_instruction"])
#
# txt diventa:
# "single supplier only"
#
# poi posso fare controlli robusti tipo:
# "single supplier" in txt
# ---------------------------------------------------------
def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


# ---------------------------------------------------------
# 3) CONFRONTO BASE
#
# cosa fa:
# - prende due valori + un operatore
# - restituisce True/False
#
# perché serve:
# - è il mattoncino base di tutte le regole
#
# esempio pratico:
# request = {
#     "quantity": 80,
#     "currency": "EUR",
#     "delivery_country": "CH"
# }
#
# controlli possibili:
# compare(request["quantity"], ">", 50)              -> True
# compare(request["currency"], "==", "EUR")          -> True
# compare(request["delivery_country"], "in", ["CH", "DE"]) -> True
#
# quindi è la funzione che fa davvero il check logico minimo
# ---------------------------------------------------------
def compare(actual: Any, operator: str, expected: Any) -> bool:
    if operator == "==":
        return actual == expected
    if operator == "!=":
        return actual != expected
    if operator == ">":
        return actual is not None and expected is not None and actual > expected
    if operator == ">=":
        return actual is not None and expected is not None and actual >= expected
    if operator == "<":
        return actual is not None and expected is not None and actual < expected
    if operator == "<=":
        return actual is not None and expected is not None and actual <= expected
    if operator == "in":
        return actual in expected if expected is not None else False
    if operator == "not_in":
        return actual not in expected if expected is not None else False
    if operator == "contains":
        return expected in actual if actual is not None else False
    if operator == "not_contains":
        return expected not in actual if actual is not None else False

    raise ValueError(f"Unsupported operator: {operator}")

# ---------------------------------------------------------
# 4) VALUTO UNA SOLA CONDIZIONE
#
# cosa fa:
# - prende una condition nel formato:
#   {"field": "...", "operator": "...", "value": ...}
# - legge il campo dalla request/supplier/context
# - usa compare(...) per dire True/False
#
# perché serve:
# - le regole non lavorano con if hardcoded
# - lavorano con condizioni scritte come dati
#
# esempio pratico:
# request = {
#     "quantity": 80
# }
#
# condition = {
#     "field": "quantity",
#     "operator": ">",
#     "value": 50
# }
#
# evaluate_condition(request, condition)
# legge:
# actual = request["quantity"] = 80
# poi fa:
# compare(80, ">", 50) -> True
# ---------------------------------------------------------
def evaluate_condition(source: Dict[str, Any], condition: Dict[str, Any]) -> bool:
    field = condition["field"]
    operator = condition["operator"]
    expected = condition["value"]
    actual = source.get(field)

    return compare(actual, operator, expected)


# ---------------------------------------------------------
# 5) VALUTO UNA LISTA DI CONDIZIONI
#
# cosa fa:
# - prende una lista di condition
# - restituisce True solo se TUTTE sono vere
#
# perché serve:
# - molte regole hanno più trigger insieme
# - tipicamente approval threshold e altre regole multi-campo
#
# esempio pratico:
# request = {
#     "budget_amount": 25199.55,
#     "currency": "EUR"
# }
#
# conditions = [
#     {"field": "budget_amount", "operator": ">=", "value": 25000},
#     {"field": "budget_amount", "operator": "<=", "value": 99999.99},
#     {"field": "currency", "operator": "==", "value": "EUR"},
# ]
#
# evaluate_conditions_all(request, conditions)
#
# controlla:
# 25199.55 >= 25000      -> True
# 25199.55 <= 99999.99   -> True
# "EUR" == "EUR"         -> True
#
# risultato finale -> True
# ---------------------------------------------------------
def evaluate_conditions_all(source: Dict[str, Any], conditions: Optional[List[Dict[str, Any]]]) -> bool:
    if not conditions:
        return True

    return all(evaluate_condition(source, cond) for cond in conditions)


# ---------------------------------------------------------
# 6) CONTROLLO SE LA REGOLA "C'ENTRA" CON QUESTO CASO
#
# cosa fa:
# - verifica se la request/supplier rientra nello scope della regola
# - non controlla ancora se la regola è passata o no
# - controlla solo se la regola è rilevante
#
# perché serve:
# - una regola Mobile Workstations non va testata sui Laptops
# - una regola supplier-specific non va testata su tutti i supplier
#
# esempio pratico:
# request = {
#     "category_l1": "IT",
#     "category_l2": "Laptops"
# }
#
# scope = {
#     "category_l1": "IT",
#     "category_l2": "Mobile Workstations"
# }
#
# scope_matches(request, scope)
#
# controlla:
# request["category_l1"] == "IT"                  -> True
# request["category_l2"] == "Mobile Workstations" -> False
#
# risultato -> False
#
# quindi la regola viene skippata ancora prima del trigger
# ---------------------------------------------------------
def scope_matches(source: Dict[str, Any], scope: Optional[Dict[str, Any]]) -> bool:
    if not scope:
        return True

    for field, expected in scope.items():
        actual = source.get(field)

        # se nel template quel pezzo non è valorizzato, lo ignoro
        if expected is None:
            continue

        # se expected è una lista, verifico membership
        if isinstance(expected, list):
            if actual not in expected:
                return False
        else:
            if actual != expected:
                return False

    return True


# ---------------------------------------------------------
# 7) CHECK GEOGRAFICO COMUNE
#
# cosa fa:
# - controlla se il delivery_country rientra in restriction_scope
# - supporta anche il caso speciale "all"
#
# perché serve:
# - molte restricted rules hanno scope geografico tipo:
#   ["CH"], ["CH","DE"], ["all"]
#
# esempio pratico:
# request = {
#     "delivery_country": "CH"
# }
#
# restriction_scope = ["CH", "DE"]
#
# in_scope_country(request["delivery_country"], restriction_scope)
#
# controlla:
# "CH" in ["CH", "DE"] -> True
#
# altro esempio:
# restriction_scope = ["all"]
# in_scope_country("IT", ["all"]) -> True
# ---------------------------------------------------------
def in_scope_country(delivery_country: Optional[str], scope_list: Optional[List[str]]) -> bool:
    if delivery_country is None or not scope_list:
        return False

    return "all" in scope_list or delivery_country in scope_list


# ---------------------------------------------------------
# 8) COSTRUISCO UNA RIGA DI DEBUG LOG
#
# cosa fa:
# - crea un dict standard che descrive cosa è successo
#   durante la valutazione di una regola
#
# perché serve:
# - per capire dopo:
#   - quale regola è stata testata
#   - se è stata triggerata
#   - se è passata
#   - perché
#   - che azione ha prodotto
#
# esempio pratico:
# request = {
#     "delivery_country": "CH",
#     "category_l2": "Mobile Workstations"
# }
#
# supplier = {
#     "supplier_id": "SUP-0008"
# }
#
# rule: restricted supplier per CH su Mobile Workstations
#
# se la regola fallisce, voglio salvare qualcosa tipo:
# - step = Restrictions
# - triggered = True
# - passed = False
# - reason = "Country restriction in hackathon policy set"
# - action = "exclude"
#
# make_debug_log(...) costruisce proprio quel record
# ---------------------------------------------------------
def make_debug_log(
    step: str,
    rule_family: str,
    rule_type: str,
    triggered: bool,
    passed: bool,
    reason: str,
    action: Optional[str] = None,
    supplier_id: Optional[str] = None,
    rule_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "step": step,
        "rule_id": rule_id,
        "rule_family": rule_family,
        "rule_type": rule_type,
        "supplier_id": supplier_id,
        "triggered": triggered,
        "passed": passed,
        "reason": reason,
        "action": action,
    }


# ---------------------------------------------------------
# 9) COSTRUISCO UN ISSUE STANDARD
#
# cosa fa:
# - crea un dict issue con formato coerente
#
# perché serve:
# - quando una regola fallisce, voglio salvare il problema
#   in una lista issues sempre nello stesso formato
#
# esempio pratico:
# request = {
#     "quantity": 80,
#     "compatibility_review_completed": False
# }
#
# rule category:
# - Mobile Workstations
# - sopra 50 unità serve engineering review
#
# la regola fallisce e voglio un issue tipo:
# - issue_type = engineering_review_missing
# - severity = high
# - description = ...
# - action_required = complete review
#
# make_issue(...) costruisce proprio questo oggetto
# ---------------------------------------------------------
def make_issue(
    issue_type: str,
    severity: str,
    description: str,
    action_required: str,
    supplier_id: Optional[str] = None,
    rule_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "rule_id": rule_id,
        "issue_type": issue_type,
        "severity": severity,
        "description": description,
        "action_required": action_required,
        "supplier_id": supplier_id,
    }


# ---------------------------------------------------------
# 10) COSTRUISCO UNA ESCALATION STANDARD
#
# cosa fa:
# - crea un dict escalation con formato coerente
#
# perché serve:
# - quando una regola o una escalation rule decide che serve
#   intervento umano, voglio salvare chi deve intervenire
#
# esempio pratico:
# request = {
#     "budget_amount": 160000,
#     "currency": "EUR",
#     "compliant_supplier_count": 2
# }
#
# approval threshold:
# - sopra 100000 EUR servono 3 quotes
# - qui ne ho solo 2
#
# quindi voglio escalation tipo:
# - trigger = insufficient_comparison
# - action = escalate
# - target = Head of Category
#
# make_escalation(...) costruisce quell'oggetto
# ---------------------------------------------------------
def make_escalation(
    trigger: str,
    action: str,
    target: str,
    blocking: bool = True,
    supplier_id: Optional[str] = None,
    rule_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "rule_id": rule_id,
        "trigger": trigger,
        "action": action,
        "target": target,
        "blocking": blocking,
        "supplier_id": supplier_id,
    }


# ---------------------------------------------------------
# 11) COSTRUISCO IL RISULTATO FINALE DI UNA REGOLA
#
# cosa fa:
# - crea il dict finale restituito da ogni evaluator
#
# perché serve:
# - voglio che TUTTI gli evaluator abbiano sempre lo stesso output
# - così la pipeline può raccogliere tutto in modo uniforme
#
# esempio pratico:
# request = {
#     "category_l2": "Mobile Workstations",
#     "quantity": 80,
#     "compatibility_review_completed": False
# }
#
# category rule:
# - si applica -> True
# - triggered -> True
# - passed -> False
# - issues -> [engineering_review_missing]
# - escalations -> [Engineering or CAD Lead]
#
# make_rule_result(...) mette tutto insieme in un solo oggetto
# ---------------------------------------------------------
def make_rule_result(
    applies: bool,
    passed: bool,
    debug: Dict[str, Any],
    issues: Optional[List[Dict[str, Any]]] = None,
    escalations: Optional[List[Dict[str, Any]]] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "applies": applies,
        "passed": passed,
        "debug": debug,
        "issues": issues or [],
        "escalations": escalations or [],
        "extra": extra or {},
    }


# applies = is the rule relevant? 
# passed = is the rule respected?
# debug = spiegazione tecnica (log)
# issues = problemi identificati
# escalations = chi deve intervenire
# extra data such as {required_quotes: 3, actual_quotes: 2}

from typing import Any, Dict, List, Optional


# =========================================================
# 4. OPERATIONAL CONSTRAINTS
# =========================================================

# idea:
# questi check non vengono da policies.json
# vengono da suppliers/pricing/request
#
# output:
# - hard_exclude = supplier fuori del tutto
# - award_block = supplier mostrabile ma non awardable ora
# - reasons = motivi
# - debug_log = traccia dettagliata
# THIS IS FOR SUPPLIERS --> SERVICE_REGIONS

# ---------------------------------------------------------
# utility: split service_regions tipo "DE;FR;NL;BE"
# ---------------------------------------------------------
def parse_service_regions(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [x.strip() for x in str(value).split(";") if x.strip()]


# ---------------------------------------------------------
# utility: decide se country appartiene a supplier.service_regions
# ---------------------------------------------------------
def supplier_serves_country(supplier: Dict[str, Any], request: Dict[str, Any]) -> bool:
    delivery_countries = request.get("delivery_countries")
    service_regions = parse_service_regions(supplier.get("service_regions"))

    return all(country in service_regions for country in delivery_countries)

# ---------------------------------------------------------
# utility: category match supplier vs request
# ---------------------------------------------------------
def supplier_matches_category(supplier: Dict[str, Any], request: Dict[str, Any]) -> bool:
    return (
        supplier.get("category_l1") == request.get("category_l1")
        and supplier.get("category_l2") == request.get("category_l2")
    )


# ---------------------------------------------------------
# utility: contract active
# ---------------------------------------------------------
def supplier_contract_active(supplier: Dict[str, Any]) -> bool:
    return normalize_text(supplier.get("contract_status")) == "active"


# ---------------------------------------------------------
# pricing applicability:
# una pricing row è valida se matcha supplier/category + region/currency + quantity tier
# ---------------------------------------------------------

def map_countries_to_region(delivery_countries: List[str]) -> Optional[str]:
    mapping = {
        'DE': 'EU', 'FR': 'EU', 'NL': 'EU', 'BE': 'EU', 'AT': 'EU',
        'IT': 'EU', 'ES': 'EU', 'PL': 'EU', 'UK': 'EU',
        'CH': 'EU',
        'US': 'Americas', 'CA': 'Americas', 'BR': 'Americas', 'MX': 'Americas',
        'SG': 'APAC', 'AU': 'APAC', 'IN': 'APAC', 'JP': 'APAC',
        'UAE': 'MEA', 'ZA': 'MEA'
    }

    regions = set(mapping.get(c) for c in delivery_countries if c in mapping)

    if len(regions) == 1:
        return list(regions)[0]
    elif len(regions) > 1:
        return "multi-region"
    return None

def find_applicable_pricing_rows(
    supplier: Dict[str, Any],
    request: Dict[str, Any],
    pricing_df,
) -> List[Dict[str, Any]]:
    supplier_id = supplier.get("supplier_id")
    category_l1 = request.get("category_l1")
    category_l2 = request.get("category_l2")
    currency = request.get("currency")
    quantity = request.get("quantity")
    region = map_countries_to_region(request.get("delivery_countries", []))

    df = pricing_df.copy()

    df = df[
        (df["supplier_id"] == supplier_id)
        & (df["category_l1"] == category_l1)
        & (df["category_l2"] == category_l2)
    ]

    if "currency" in df.columns and currency is not None:
        df = df[df["currency"] == currency]

    if "region" in df.columns and region is not None:
        df = df[df["region"] == region]

    if quantity is not None:
        if "min_quantity" in df.columns:
            df = df[df["min_quantity"] <= quantity]
        if "max_quantity" in df.columns:
            df = df[df["max_quantity"] >= quantity]

    return df.to_dict(orient="records")


# ---------------------------------------------------------
# MOQ check sulla pricing row selezionata
# ---------------------------------------------------------
def moq_ok(pricing_row: Dict[str, Any], request: Dict[str, Any]) -> bool:
    quantity = request.get("quantity")
    moq = pricing_row.get("moq")
    if quantity is None or moq is None:
        return False
    return quantity >= moq


# ---------------------------------------------------------
# capacity check supplier-level
# ---------------------------------------------------------
def capacity_ok(supplier: Dict[str, Any], request: Dict[str, Any]) -> bool:
    quantity = request.get("quantity")
    capacity = supplier.get("capacity_per_month")

    if quantity is None or capacity is None:
        return False

    try:
        return float(quantity) <= float(capacity)
    except Exception:
        return False


# ---------------------------------------------------------
# lead time check
# qui distinguiamo:
# - feasible at all?
# - standard feasible?
# - expedited feasible?
#
# request dovrebbe avere idealmente:
# - max_lead_time_days
# oppure
# - days_until_required
# ---------------------------------------------------------
def lead_time_status(pricing_row: Dict[str, Any], request: Dict[str, Any]) -> Dict[str, Any]:
    max_days = request.get("max_lead_time_days", request.get("days_until_required"))

    standard_days = pricing_row.get("standard_lead_time_days")
    expedited_days = pricing_row.get("expedited_lead_time_days")

    if max_days is None:
        return {
            "known": False,
            "standard_ok": False,
            "expedited_ok": False,
            "any_ok": False,
        }

    standard_ok = standard_days is not None and standard_days <= max_days
    expedited_ok = expedited_days is not None and expedited_days <= max_days

    return {
        "known": True,
        "standard_ok": standard_ok,
        "expedited_ok": expedited_ok,
        "any_ok": standard_ok or expedited_ok,
    }


# ---------------------------------------------------------
# budget fit check
# usa unit_price * quantity
# se vuoi puoi poi estenderlo con expedited_unit_price
# ---------------------------------------------------------
def budget_fit_status(pricing_row: Dict[str, Any], request: Dict[str, Any]) -> Dict[str, Any]:
    quantity = request.get("quantity")
    budget = request.get("budget_amount")
    unit_price = pricing_row.get("unit_price")
    expedited_unit_price = pricing_row.get("expedited_unit_price")

    if quantity is None or budget is None:
        return {
            "known": False,
            "standard_total": None,
            "expedited_total": None,
            "standard_ok": False,
            "expedited_ok": False,
            "any_ok": False,
        }

    standard_total = unit_price * quantity if unit_price is not None else None
    expedited_total = expedited_unit_price * quantity if expedited_unit_price is not None else None

    standard_ok = standard_total is not None and standard_total <= budget
    expedited_ok = expedited_total is not None and expedited_total <= budget

    return {
        "known": True,
        "standard_total": standard_total,
        "expedited_total": expedited_total,
        "standard_ok": standard_ok,
        "expedited_ok": expedited_ok,
        "any_ok": standard_ok or expedited_ok,
    }


# ---------------------------------------------------------
# scegli la miglior pricing row applicabile
# per ora: la più economica a unit_price
# ---------------------------------------------------------
def select_best_pricing_row(pricing_rows: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not pricing_rows:
        return None

    valid_rows = [r for r in pricing_rows if r.get("unit_price") is not None]
    if not valid_rows:
        return None

    return sorted(valid_rows, key=lambda x: x["unit_price"])[0]

# =========================================================
# 3A. BUILD APPROVAL THRESHOLD RULES
# =========================================================

def build_approval_rules(policies: Dict[str, Any]) -> List[Dict[str, Any]]:
    rules = []

    for row in policies.get("approval_thresholds", []):
        # EUR / CHF usano min_amount/max_amount
        # USD usa min_value/max_value
        min_amount = row.get("min_amount", row.get("min_value"))
        max_amount = row.get("max_amount", row.get("max_value"))

        # EUR / CHF usano min_supplier_quotes
        # USD usa quotes_required
        quotes_required = row.get("min_supplier_quotes", row.get("quotes_required"))

        # EUR / CHF usano managed_by
        # USD usa approvers
        approvers = row.get("managed_by", row.get("approvers", []))

        deviation_targets = row.get("deviation_approval_required_from", [])
        policy_note = row.get("policy_note")

        # Se USD non ha explicit deviation target, provo a inferirlo dalla policy_note
        if not deviation_targets and policy_note:
            txt = normalize_text(policy_note)
            if "procurement manager" in txt:
                deviation_targets = ["Procurement Manager"]
            elif "head of category" in txt:
                deviation_targets = ["Head of Category"]
            elif "head of strategic sourcing" in txt:
                deviation_targets = ["Head of Strategic Sourcing"]
            elif "cpo" in txt:
                deviation_targets = ["CPO"]

        # Regola: assegna la request alla value band corretta
        rules.append({
            "rule_family": "approval_threshold",
            "rule_type": "min_quotes_required",
            "rule_id": row["threshold_id"],
            "scope": {
                "currency": row["currency"]
            },
            "trigger_conditions": [
                {"field": "budget_amount", "operator": ">=", "value": min_amount},
                {"field": "budget_amount", "operator": "<=", "value": max_amount if max_amount is not None else float("inf")},
            ],
            "required_condition": {
                "field": "compliant_supplier_count",
                "operator": ">=",
                "value": quotes_required
            },
            "metadata": {
                "quotes_required": quotes_required,
                "approvers": approvers,
                "deviation_approval_required_from": deviation_targets,
                "raw_policy_note": policy_note,
                "comment": (
                    f"Threshold {row['threshold_id']}: for {row['currency']} value band "
                    f"[{min_amount}, {max_amount}], require at least {quotes_required} compliant quotes."
                )
            },
            "fail_issue_type": "insufficient_comparison",
            "fail_severity": "high",
            "fail_action": "escalate" if deviation_targets else "warning",
            "fail_target": deviation_targets[0] if deviation_targets else None,
            "blocking": True
        })

    return rules


# =========================================================
# 3C. BUILD RESTRICTED SUPPLIER RULES
# =========================================================

def build_restricted_rules(policies: Dict[str, Any]) -> List[Dict[str, Any]]:
    rules = []

    for row in policies.get("restricted_suppliers", []):
        reason = row.get("restriction_reason", "")
        reason_txt = normalize_text(reason)
        supplier_id = row["supplier_id"]
        category_l1 = row["category_l1"]
        category_l2 = row["category_l2"]
        restriction_scope = row.get("restriction_scope", [])

        # -------------------------------------------------
        # interpretazione della restriction_reason
        # -------------------------------------------------
        rule_type = "hard_restriction"
        trigger_conditions = []
        required_condition = None
        fail_action = "exclude"
        fail_target = None
        fail_issue_type = "restricted_supplier"
        comment = f"Restricted supplier rule for {row['supplier_name']}."

        # Caso 1: restriction basata su soglia economica
        # Esempio: "Can be used only below EUR 75000 without exception approval"
        if "only below eur 75000" in reason_txt:
            rule_type = "threshold_based_restriction"
            required_condition = {
                "field": "budget_amount",
                "operator": "<",
                "value": 75000
            }
            fail_action = "escalate"
            fail_target = "Procurement Manager"
            fail_issue_type = "policy_conflict"
            comment = (
                f"{row['supplier_name']} can be used only below EUR 75,000; "
                f"above that threshold exception approval is required."
            )

        # Caso 2: restriction scenario-based su sensitive/regulatory data
        # Esempio Alibaba / AWS data sovereignty
        elif "sensitive/regulated data" in reason_txt or "residency-sensitive" in reason_txt or "data sovereignty" in reason_txt:
            rule_type = "scenario_based_restriction"
            trigger_conditions = [
                {"field": "sensitive_or_regulated_data", "operator": "==", "value": True}
            ]
            # la required_condition qui rappresenta "non devo essere in scenario sensibile"
            # quindi se il trigger si attiva, considero il supplier non auto-compliant
            required_condition = None
            fail_action = "escalate"
            fail_target = "Regional Compliance Lead" if "regional compliance lead" in reason_txt else "Security and Compliance Review"
            fail_issue_type = "data_residency_constraint_conflict"
            comment = (
                f"{row['supplier_name']} is restricted for sensitive/regulated or residency-sensitive "
                f"scenarios in listed countries."
            )

        # Caso 3: hard restriction geografica generica
        # Esempio Computacenter CH / DE
        else:
            rule_type = "hard_restriction"
            required_condition = None
            fail_action = "exclude"
            fail_target = None
            fail_issue_type = "restricted_supplier"
            comment = (
                f"{row['supplier_name']} is hard-restricted for "
                f"{category_l1} > {category_l2} in scope {restriction_scope}."
            )

        rules.append({
            "rule_family": "restricted_supplier",
            "rule_type": rule_type,
            "rule_id": f"RS-{supplier_id}-{category_l2}".replace(" ", "_").replace("/", "_"),
            "scope": {
                "supplier_id": supplier_id,
                "category_l1": category_l1,
                "category_l2": category_l2,
                "restriction_scope": restriction_scope
            },
            "trigger_conditions": trigger_conditions,
            "required_condition": required_condition,
            "metadata": {
                "restriction_reason": reason,
                "comment": comment
            },
            "fail_issue_type": fail_issue_type,
            "fail_severity": "high",
            "fail_action": fail_action,
            "fail_target": fail_target,
            "blocking": True
        })

    return rules

# =========================================================
# 3B. BUILD PREFERRED SUPPLIER RULES
# =========================================================

def build_preferred_rules(policies: Dict[str, Any]) -> List[Dict[str, Any]]:
    rules = []

    for row in policies.get("preferred_suppliers", []):
        region_scope = row.get("region_scope", [])

        # Preferred supplier rule:
        # non è una hard compliance rule
        # serve soprattutto per:
        # - includere il supplier in shortlist/comparison
        # - eventualmente dare un piccolo bonus nel ranking
        rules.append({
            "rule_family": "preferred_supplier",
            "rule_type": "preferred_supplier_should_be_compared",
            "rule_id": f"PS-{row['supplier_id']}-{row['category_l2']}",
            "scope": {
                "supplier_id": row["supplier_id"],
                "category_l1": row["category_l1"],
                "category_l2": row["category_l2"],
                "region_scope": region_scope
            },
            "trigger_conditions": [],
            "required_condition": {
                # questa condizione la userai quando avrai shortlist / comparison table
                "field": "supplier_in_shortlist",
                "operator": "==",
                "value": True
            },
            "metadata": {
                "policy_note": row.get("policy_note"),
                "ranking_bonus": 0.05,
                "comment": (
                    f"Preferred supplier {row['supplier_name']} for "
                    f"{row['category_l1']} > {row['category_l2']} in scope {region_scope or 'unspecified'}."
                )
            },
            "fail_issue_type": "preferred_supplier_omitted",
            "fail_severity": "medium",
            "fail_action": "warning",
            "fail_target": None,
            "blocking": False
        })

    return rules

# =========================================================
# 3D. BUILD CATEGORY RULES
# =========================================================

def build_category_rules(policies: Dict[str, Any]) -> List[Dict[str, Any]]:
    rules = []

    for row in policies.get("category_rules", []):
        rule_type = row["rule_type"]
        category_l1 = row["category_l1"]
        category_l2 = row["category_l2"]
        rule_text = row.get("rule_text", "")

        trigger_conditions = []
        required_condition = None
        fail_issue_type = "category_rule_failed"
        fail_action = "escalate"
        fail_target = None
        fail_severity = "high"
        blocking = True
        comment = rule_text

        # -------------------------------------------------
        # interpreto i rule_type specifici
        # -------------------------------------------------

        # CR-001
        if rule_type == "mandatory_comparison":
            trigger_conditions = [
                {"field": "budget_amount", "operator": ">", "value": 100000}
            ]
            required_condition = {
                "field": "compliant_supplier_count",
                "operator": ">=",
                "value": 3
            }
            fail_issue_type = "insufficient_comparison"
            fail_target = "Head of Category"

        # CR-002
        elif rule_type == "engineering_spec_review":
            trigger_conditions = [
                {"field": "quantity", "operator": ">", "value": 50}
            ]
            required_condition = {
                "field": "compatibility_review_completed",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "engineering_review_missing"
            fail_target = "Engineering or CAD Lead"

        # CR-003
        elif rule_type == "fast_track":
            trigger_conditions = [
                {"field": "budget_amount", "operator": "<", "value": 75000}
            ]
            # qui la regola non blocca: segnala che il fast-track è possibile
            required_condition = None
            fail_issue_type = None
            fail_action = "warning"
            fail_target = None
            fail_severity = "low"
            blocking = False
            comment = (
                rule_text + " Interpreted as a positive route: if triggered, fast-track is allowed."
            )

        # CR-004
        elif rule_type == "residency_check":
            trigger_conditions = [
                {"field": "data_residency_required", "operator": "==", "value": True}
            ]
            required_condition = {
                "field": "supplier_supports_residency",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "data_residency_constraint_conflict"
            fail_target = "Security and Compliance Review"

        # CR-005
        elif rule_type == "security_review":
            trigger_conditions = [
                {"field": "budget_amount", "operator": ">", "value": 250000}
            ]
            required_condition = {
                "field": "security_review_completed",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "security_review_missing"
            fail_target = "Security Architecture Review"

        # CR-006
        elif rule_type == "design_signoff":
            trigger_conditions = []
            required_condition = {
                "field": "design_signoff_completed",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "design_signoff_missing"
            fail_target = "Business Design Sign-off"

        # CR-007
        elif rule_type == "cv_review":
            trigger_conditions = [
                {"field": "quantity", "operator": ">", "value": 60}
            ]
            required_condition = {
                "field": "cv_review_completed",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "cv_review_missing"
            fail_target = "Professional Services Review"

        # CR-008
        elif rule_type == "certification_check":
            trigger_conditions = []
            required_condition = {
                "field": "supplier_certifications_verified",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "certification_check_missing"
            fail_target = "Cybersecurity Compliance Review"

        # CR-009
        elif rule_type == "performance_baseline":
            trigger_conditions = []
            required_condition = {
                "field": "performance_baseline_provided",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "performance_baseline_missing"
            fail_target = "Marketing Performance Review"

        # CR-010
        elif rule_type == "brand_safety":
            trigger_conditions = []
            required_condition = {
                "field": "brand_safety_review_completed",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "brand_safety_review_needed"
            fail_target = "Marketing Governance Lead"

        rules.append({
            "rule_family": "category_rule",
            "rule_type": rule_type,
            "rule_id": row["rule_id"],
            "scope": {
                "category_l1": category_l1,
                "category_l2": category_l2
            },
            "trigger_conditions": trigger_conditions,
            "required_condition": required_condition,
            "metadata": {
                "rule_text": rule_text,
                "comment": comment
            },
            "fail_issue_type": fail_issue_type,
            "fail_severity": fail_severity,
            "fail_action": fail_action,
            "fail_target": fail_target,
            "blocking": blocking
        })

    return rules

# =========================================================
# 3E. BUILD GEOGRAPHY RULES
# =========================================================

def build_geography_rules(policies: Dict[str, Any]) -> List[Dict[str, Any]]:
    rules = []

    for row in policies.get("geography_rules", []):
        rule_id = row["rule_id"]
        rule_type = row.get("rule_type")
        rule_text = row.get("rule_text", row.get("rule", ""))

        country = row.get("country")
        region = row.get("region")
        countries = row.get("countries", [])
        applies_to = row.get("applies_to", [])

        trigger_conditions = []
        required_condition = None
        fail_issue_type = "geography_rule_failed"
        fail_action = "escalate"
        fail_target = None
        fail_severity = "high"
        blocking = True
        comment = rule_text

        # -------------------------------------------------
        # interpretazione dei geography rule types
        # -------------------------------------------------

        if rule_type == "sovereign_preference":
            trigger_conditions = [
                {"field": "data_residency_required", "operator": "==", "value": True}
            ]
            required_condition = {
                "field": "supplier_is_sovereign_or_approved",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "data_residency_constraint_conflict"
            fail_target = "Security and Compliance Review"

        elif rule_type == "lead_time_constraint":
            trigger_conditions = [
                {"field": "is_urgent_request", "operator": "==", "value": True}
            ]
            required_condition = {
                "field": "lead_time_feasible",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "lead_time_infeasible"
            fail_target = "Head of Category"

        elif rule_type == "language_support":
            trigger_conditions = [
                {"field": "business_facing_service", "operator": "==", "value": True}
            ]
            required_condition = {
                "field": "local_language_support_available",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "language_support_missing"
            fail_target = "Regional Delivery Review"

        elif rule_type == "regional_rollout":
            trigger_conditions = [
                {"field": "large_rollout", "operator": "==", "value": True}
            ]
            required_condition = {
                "field": "deployment_support_available",
                "operator": "==",
                "value": True
            }
            fail_issue_type = "deployment_support_missing"
            fail_target = "Regional Operations Review"

        else:
            # Rule narrative per regioni (Americas/APAC/MEA/LATAM)
            txt = normalize_text(rule_text)

            if "data sovereignty" in txt or "data localisation" in txt or "residency" in txt:
                trigger_conditions = [
                    {"field": "sensitive_or_regulated_data", "operator": "==", "value": True}
                ]
                required_condition = {
                    "field": "in_country_residency_available",
                    "operator": "==",
                    "value": True
                }
                fail_issue_type = "data_residency_constraint_conflict"
                fail_target = "Regional Compliance Lead"

            elif "dpa" in txt:
                trigger_conditions = []
                required_condition = {
                    "field": "dpa_in_place",
                    "operator": "==",
                    "value": True
                }
                fail_issue_type = "dpa_missing"
                fail_target = "Regional Compliance Lead"

            else:
                trigger_conditions = []
                required_condition = {
                    "field": "geography_compliance_confirmed",
                    "operator": "==",
                    "value": True
                }
                fail_issue_type = "regional_compliance_missing"
                fail_target = "Regional Compliance Lead"

        rules.append({
            "rule_family": "geography_rule",
            "rule_type": rule_type if rule_type else "regional_compliance_check",
            "rule_id": rule_id,
            "scope": {
                "country": country,
                "region": region,
                "countries": countries,
                "applies_to": applies_to
            },
            "trigger_conditions": trigger_conditions,
            "required_condition": required_condition,
            "metadata": {
                "rule_text": rule_text,
                "comment": comment
            },
            "fail_issue_type": fail_issue_type,
            "fail_severity": fail_severity,
            "fail_action": fail_action,
            "fail_target": fail_target,
            "blocking": blocking
        })

    return rules

# =========================================================
# 3F. BUILD ESCALATION RULES
# =========================================================

def build_escalation_rules(policies: Dict[str, Any]) -> List[Dict[str, Any]]:
    rules = []

    for row in policies.get("escalation_rules", []):
        target = row.get("escalate_to", row.get("escalation_target"))

        # Escalation rules leggono un context / issue già prodotto
        rules.append({
            "rule_family": "escalation_rule",
            "rule_type": "trigger_to_action",
            "rule_id": row["rule_id"],
            "scope": {
                "applies_to_currencies": row.get("applies_to_currencies", [])
            },
            "trigger_conditions": [
                {"field": "issue_type", "operator": "==", "value": row["trigger"]}
            ],
            "required_condition": None,
            "metadata": {
                "trigger": row["trigger"],
                "action": row["action"],
                "escalate_to": target,
                "comment": (
                    f"When issue/trigger '{row['trigger']}' is present, "
                    f"workflow should escalate to '{target}'."
                )
            },
            "fail_issue_type": None,
            "fail_severity": "high",
            "fail_action": "escalate",
            "fail_target": target,
            "blocking": True
        })

    return rules

# =========================================================
# 5. BUILD ALL POLICY RULES
# =========================================================

def build_all_policy_rules(policies: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Prende policies.json già caricato e costruisce tutte le famiglie
    di regole compilate.

    Output:
    {
        "restricted_rules": [...],
        "preferred_rules": [...],
        "approval_rules": [...],
        "category_rules": [...],
        "geography_rules": [...],
        "escalation_rules": [...]
    }
    """

    all_rules = {
        "restricted_rules": build_restricted_rules(policies),
        "preferred_rules": build_preferred_rules(policies),
        "approval_rules": build_approval_rules(policies),
        "category_rules": build_category_rules(policies),
        "geography_rules": build_geography_rules(policies),
        "escalation_rules": build_escalation_rules(policies),
    }

    return all_rules


# =========================================================
# BUILD RULES ONCE
# =========================================================


# =========================================================
# QUICK SANITY CHECK
# =========================================================


# ---------------------------------------------------------
# main operational evaluator for one supplier
# ---------------------------------------------------------
def evaluate_operational_constraints_for_supplier(
    supplier: Dict[str, Any],
    request: Dict[str, Any],
    pricing_df,
) -> Dict[str, Any]:
    supplier_id = supplier.get("supplier_id")
    debug_log = []
    hard_exclude = False
    award_block = False
    exclusion_reasons = []
    award_block_reasons = []

    # 1) category match -> hard exclude
    cat_ok = supplier_matches_category(supplier, request)
    debug_log.append(make_debug_log(
        step="Operational Constraints",
        rule_family="operational_constraint",
        rule_type="category_match",
        triggered=True,
        passed=cat_ok,
        reason=f"supplier category=({supplier.get('category_l1')}, {supplier.get('category_l2')}), request category=({request.get('category_l1')}, {request.get('category_l2')})",
        action=None if cat_ok else "exclude",
        supplier_id=supplier_id,
        rule_id="OP-001"
    ))
    if not cat_ok:
        hard_exclude = True
        exclusion_reasons.append("category_mismatch")

    # 2) geography coverage -> hard exclude
    geo_ok = supplier_serves_country(supplier, request)
    debug_log.append(make_debug_log(
        step="Operational Constraints",
        rule_family="operational_constraint",
        rule_type="country_coverage",
        triggered=True,
        passed=geo_ok,
        reason=f"delivery_country={request.get('delivery_country')}, service_regions={supplier.get('service_regions')}",
        action=None if geo_ok else "exclude",
        supplier_id=supplier_id,
        rule_id="OP-002"
    ))
    if not geo_ok:
        hard_exclude = True
        exclusion_reasons.append("country_coverage_mismatch")

    # 3) active contract -> hard exclude
    contract_ok = supplier_contract_active(supplier)
    debug_log.append(make_debug_log(
        step="Operational Constraints",
        rule_family="operational_constraint",
        rule_type="contract_active",
        triggered=True,
        passed=contract_ok,
        reason=f"contract_status={supplier.get('contract_status')}",
        action=None if contract_ok else "exclude",
        supplier_id=supplier_id,
        rule_id="OP-003"
    ))
    if not contract_ok:
        hard_exclude = True
        exclusion_reasons.append("inactive_contract")

    # se già hard excluded, posso fermarmi presto
    if hard_exclude:
        return {
            "supplier_id": supplier_id,
            "hard_exclude": True,
            "award_block": True,
            "is_feasible": False,
            "selected_pricing_row": None,
            "exclusion_reasons": exclusion_reasons,
            "award_block_reasons": award_block_reasons,
            "debug_log": debug_log,
        }

    # 4) pricing applicability -> hard exclude
    pricing_rows = find_applicable_pricing_rows(supplier, request, pricing_df)
    pricing_exists = len(pricing_rows) > 0

    debug_log.append(make_debug_log(
        step="Operational Constraints",
        rule_family="operational_constraint",
        rule_type="pricing_applicability",
        triggered=True,
        passed=pricing_exists,
        reason=f"matching pricing rows found={len(pricing_rows)}",
        action=None if pricing_exists else "exclude",
        supplier_id=supplier_id,
        rule_id="OP-004"
    ))

    if not pricing_exists:
        hard_exclude = True
        exclusion_reasons.append("no_applicable_pricing")

        return {
            "supplier_id": supplier_id,
            "hard_exclude": True,
            "award_block": True,
            "is_feasible": False,
            "selected_pricing_row": None,
            "exclusion_reasons": exclusion_reasons,
            "award_block_reasons": award_block_reasons,
            "debug_log": debug_log,
        }

    selected_pricing_row = select_best_pricing_row(pricing_rows)

    # 5) MOQ -> hard exclude
    moq_pass = moq_ok(selected_pricing_row, request)
    debug_log.append(make_debug_log(
        step="Operational Constraints",
        rule_family="operational_constraint",
        rule_type="moq_check",
        triggered=True,
        passed=moq_pass,
        reason=f"quantity={request.get('quantity')}, moq={selected_pricing_row.get('moq')}",
        action=None if moq_pass else "exclude",
        supplier_id=supplier_id,
        rule_id="OP-005"
    ))
    if not moq_pass:
        hard_exclude = True
        exclusion_reasons.append("moq_fail")

    # 6) capacity -> NOT necessarily hard exclude, but award block
    cap_pass = capacity_ok(supplier, request)
    debug_log.append(make_debug_log(
        step="Operational Constraints",
        rule_family="operational_constraint",
        rule_type="capacity_check",
        triggered=True,
        passed=cap_pass,
        reason=f"quantity={request.get('quantity')}, capacity_per_month={supplier.get('capacity_per_month')}",
        action=None if cap_pass else "flag",
        supplier_id=supplier_id,
        rule_id="OP-006"
    ))
    if not cap_pass:
        award_block = True
        award_block_reasons.append("capacity_risk")

    # 7) lead time -> not hard exclude, but award block
    lt = lead_time_status(selected_pricing_row, request)
    debug_log.append(make_debug_log(
        step="Operational Constraints",
        rule_family="operational_constraint",
        rule_type="lead_time_check",
        triggered=True,
        passed=lt["any_ok"],
        reason=(
            f"max_days={request.get('max_lead_time_days', request.get('days_until_required'))}, "
            f"standard={selected_pricing_row.get('standard_lead_time_days')}, "
            f"expedited={selected_pricing_row.get('expedited_lead_time_days')}"
        ),
        action=None if lt["any_ok"] else "flag",
        supplier_id=supplier_id,
        rule_id="OP-007"
    ))
    if not lt["any_ok"]:
        award_block = True
        award_block_reasons.append("lead_time_infeasible")

    # 8) budget fit -> not hard exclude, but award block
    bf = budget_fit_status(selected_pricing_row, request)
    debug_log.append(make_debug_log(
        step="Operational Constraints",
        rule_family="operational_constraint",
        rule_type="budget_fit",
        triggered=True,
        passed=bf["any_ok"],
        reason=(
            f"budget={request.get('budget_amount')}, "
            f"standard_total={bf['standard_total']}, expedited_total={bf['expedited_total']}"
        ),
        action=None if bf["any_ok"] else "flag",
        supplier_id=supplier_id,
        rule_id="OP-008"
    ))
    if not bf["any_ok"]:
        award_block = True
        award_block_reasons.append("budget_insufficient")

    return {
        "supplier_id": supplier_id,
        "hard_exclude": hard_exclude,
        "award_block": award_block,
        "is_feasible": not hard_exclude,
        "selected_pricing_row": selected_pricing_row,
        "exclusion_reasons": exclusion_reasons,
        "award_block_reasons": award_block_reasons,
        "debug_log": debug_log,
        "lead_time_status": lt,
        "budget_fit_status": bf,
    }

# =========================================================
# 7. OPERATIONAL STAGE RUNNER
# =========================================================

# Valuta tutti i supplier e gli mette la targhetta

# idea:
# - gira evaluate_operational_constraints_for_supplier(...) su tutti i supplier
# - separa subito:
#   1) hard excluded
#   2) feasible suppliers
#   3) feasible ma award-blocked
# - prepara l'input pulito per il policy evaluator


def run_operational_stage(
    request: Dict[str, Any],
    suppliers_df,
    pricing_df,
) -> Dict[str, Any]:
    """
    Input:
    - request: dict request strutturata
    - suppliers_df: dataframe suppliers
    - pricing_df: dataframe pricing

    Output:
    {
        "operational_results": [...],
        "excluded_suppliers": [...],
        "feasible_suppliers": [...],
        "awardable_suppliers": [...],
        "showable_suppliers": [...],
        "all_debug_log": [...]
    }
    """

    operational_results = []
    all_debug_log = []

    supplier_records = suppliers_df[
    (suppliers_df["category_l1"] == request["category_l1"]) &
    (suppliers_df["category_l2"] == request["category_l2"])
    ].to_dict(orient="records")

    for supplier in supplier_records:
        res = evaluate_operational_constraints_for_supplier(
            supplier=supplier,
            request=request,
            pricing_df=pricing_df,
        )

        # salvo anche il supplier intero dentro il risultato,
        # così dopo è più facile ricostruire i gruppi
        res["supplier"] = supplier

        operational_results.append(res)
        all_debug_log.extend(res.get("debug_log", []))

    # -----------------------------------------------------
    # 1) HARD EXCLUDED
    # supplier che non passano i feasibility hard checks
    # -----------------------------------------------------
    excluded_results = [r for r in operational_results if r["hard_exclude"] is True]

    excluded_suppliers = []
    for r in excluded_results:
        excluded_suppliers.append({
            "supplier_id": r["supplier"].get("supplier_id"),
            "supplier_name": r["supplier"].get("supplier_name"),
            "reason": ", ".join(r.get("exclusion_reasons", [])) if r.get("exclusion_reasons") else "hard_exclude",
            "supplier": r["supplier"],
            "selected_pricing_row": r.get("selected_pricing_row"),
        })

    # -----------------------------------------------------
    # 2) FEASIBLE
    # tutti quelli che restano vivi dopo gli hard filters
    # -----------------------------------------------------
    feasible_results = [r for r in operational_results if r["is_feasible"] is True]

    feasible_suppliers = []
    for r in feasible_results:
        supplier_copy = dict(r["supplier"])
        supplier_copy["selected_pricing_row"] = r.get("selected_pricing_row")
        supplier_copy["is_feasible"] = True
        supplier_copy["award_block"] = r.get("award_block", False)
        supplier_copy["award_block_reasons"] = r.get("award_block_reasons", [])
        supplier_copy["lead_time_status"] = r.get("lead_time_status")
        supplier_copy["budget_fit_status"] = r.get("budget_fit_status")
        feasible_suppliers.append(supplier_copy)

    # -----------------------------------------------------
    # 3) AWARDABLE
    # feasible + non award-blocked
    # questi sono i candidati più puliti a livello operational
    # -----------------------------------------------------
    awardable_results = [
        r for r in feasible_results
        if r.get("award_block") is False
    ]

    awardable_suppliers = []
    for r in awardable_results:
        supplier_copy = dict(r["supplier"])
        supplier_copy["selected_pricing_row"] = r.get("selected_pricing_row")
        supplier_copy["is_feasible"] = True
        supplier_copy["award_block"] = False
        supplier_copy["award_block_reasons"] = []
        supplier_copy["lead_time_status"] = r.get("lead_time_status")
        supplier_copy["budget_fit_status"] = r.get("budget_fit_status")
        awardable_suppliers.append(supplier_copy)

    # -----------------------------------------------------
    # 4) SHOWABLE
    # io consiglio di mostrarli tutti i feasible
    # anche se award_blocked, perché possono ancora essere:
    # - best commercial option
    # - useful shortlist option pending escalation / budget / timing shift
    # -----------------------------------------------------
    showable_suppliers = feasible_suppliers.copy()

    # -----------------------------------------------------
    # 5) optional dedup debug log
    # -----------------------------------------------------
    all_debug_log = deduplicate_dict_list(
        all_debug_log,
        keys=["rule_id", "rule_family", "rule_type", "supplier_id", "reason"]
    )

    return {
        "operational_results": operational_results,
        "excluded_suppliers": excluded_suppliers,
        "feasible_suppliers": feasible_suppliers,
        "awardable_suppliers": awardable_suppliers,
        "showable_suppliers": showable_suppliers,
        "all_debug_log": all_debug_log,
    }

# =========================================================
# 5B. POLICY RULE EVALUATORS + DISPATCHER
# =========================================================

def evaluate_approval_threshold_rule(
    rule: Dict[str, Any],
    request: Dict[str, Any],
) -> Dict[str, Any]:
    applies = scope_matches(request, rule.get("scope"))
    if not applies:
        return make_rule_result(
            applies=False,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="Rule scope does not match request.",
                action="skip",
                rule_id=rule.get("rule_id"),
            ),
        )

    triggered = evaluate_conditions_all(request, rule.get("trigger_conditions"))
    if not triggered:
        return make_rule_result(
            applies=True,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="Threshold band not triggered by request value.",
                action="skip",
                rule_id=rule.get("rule_id"),
            ),
            extra={"rule_applied": False},
        )

    required_condition = rule.get("required_condition")
    passed = evaluate_condition(request, required_condition) if required_condition else True

    metadata = rule.get("metadata", {})
    quotes_required = metadata.get("quotes_required")
    approvers = metadata.get("approvers")
    deviation_targets = metadata.get("deviation_approval_required_from", [])

    issues = []
    escalations = []

    if not passed:
        issues.append(
            make_issue(
                issue_type=rule.get("fail_issue_type", "insufficient_comparison"),
                severity=rule.get("fail_severity", "high"),
                description=(
                    f"Approval threshold {rule.get('rule_id')} triggered: "
                    f"at least {quotes_required} compliant quotes are required, "
                    f"but request has only {request.get('compliant_supplier_count')}."
                ),
                action_required=(
                    f"Provide at least {quotes_required} compliant supplier quotes."
                ),
                rule_id=rule.get("rule_id"),
            )
        )

        if rule.get("fail_action") == "escalate" and rule.get("fail_target"):
            escalations.append(
                make_escalation(
                    trigger=rule.get("fail_issue_type", "insufficient_comparison"),
                    action="escalate",
                    target=rule.get("fail_target"),
                    blocking=rule.get("blocking", True),
                    rule_id=rule.get("rule_id"),
                )
            )

    debug = make_debug_log(
        step="Policy Evaluation",
        rule_family=rule["rule_family"],
        rule_type=rule["rule_type"],
        triggered=True,
        passed=passed,
        reason=(
            f"Threshold {rule.get('rule_id')} matched. "
            f"quotes_required={quotes_required}, "
            f"available={request.get('compliant_supplier_count')}."
        ),
        action=None if passed else rule.get("fail_action"),
        rule_id=rule.get("rule_id"),
    )

    return make_rule_result(
        applies=True,
        passed=passed,
        debug=debug,
        issues=issues,
        escalations=escalations,
        extra={
            "rule_applied": True,
            "quotes_required": quotes_required,
            "approvers": approvers,
            "deviation_approval_required_from": deviation_targets,
        },
    )


def evaluate_restricted_supplier_rule(
    rule: Dict[str, Any],
    request: Dict[str, Any],
    supplier: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if supplier is None:
        return make_rule_result(
            applies=False,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="No supplier provided.",
                action="skip",
                rule_id=rule.get("rule_id"),
            ),
        )

    scope = rule.get("scope", {})
    scope_base = {
        "supplier_id": scope.get("supplier_id"),
        "category_l1": scope.get("category_l1"),
        "category_l2": scope.get("category_l2"),
    }

    applies = scope_matches(supplier, scope_base)
    if not applies:
        return make_rule_result(
            applies=False,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="Supplier/category scope does not match this restriction rule.",
                action="skip",
                supplier_id=supplier.get("supplier_id"),
                rule_id=rule.get("rule_id"),
            ),
        )

    restriction_scope = scope.get("restriction_scope", [])
    country_trigger = in_scope_country(request.get("delivery_country"), restriction_scope)

    trigger_conditions = rule.get("trigger_conditions", [])
    other_trigger = evaluate_conditions_all(request, trigger_conditions) if trigger_conditions else True

    triggered = country_trigger and other_trigger

    if not triggered:
        return make_rule_result(
            applies=True,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason=(
                    f"Restriction not triggered. delivery_country={request.get('delivery_country')}, "
                    f"restriction_scope={restriction_scope}."
                ),
                action="skip",
                supplier_id=supplier.get("supplier_id"),
                rule_id=rule.get("rule_id"),
            ),
            extra={"restricted": False},
        )

    required_condition = rule.get("required_condition")
    passed = evaluate_condition(request, required_condition) if required_condition else False

    issues = []
    escalations = []
    if not passed:
        issues.append(
            make_issue(
                issue_type=rule.get("fail_issue_type", "restricted_supplier"),
                severity=rule.get("fail_severity", "high"),
                description=rule.get("metadata", {}).get(
                    "restriction_reason",
                    f"Supplier {supplier.get('supplier_name')} is restricted for this scenario."
                ),
                action_required=(
                    "Supplier cannot be used under current policy conditions."
                    if rule.get("fail_action") == "exclude"
                    else f"Escalation required to {rule.get('fail_target')}."
                ),
                supplier_id=supplier.get("supplier_id"),
                rule_id=rule.get("rule_id"),
            )
        )

        if rule.get("fail_action") == "escalate" and rule.get("fail_target"):
            escalations.append(
                make_escalation(
                    trigger=rule.get("fail_issue_type", "restricted_supplier"),
                    action="escalate",
                    target=rule.get("fail_target"),
                    blocking=rule.get("blocking", True),
                    supplier_id=supplier.get("supplier_id"),
                    rule_id=rule.get("rule_id"),
                )
            )

    debug = make_debug_log(
        step="Policy Evaluation",
        rule_family=rule["rule_family"],
        rule_type=rule["rule_type"],
        triggered=True,
        passed=passed,
        reason=rule.get("metadata", {}).get(
            "restriction_reason",
            f"Restricted supplier rule triggered for {supplier.get('supplier_name')}."
        ),
        action=None if passed else rule.get("fail_action"),
        supplier_id=supplier.get("supplier_id"),
        rule_id=rule.get("rule_id"),
    )

    return make_rule_result(
        applies=True,
        passed=passed,
        debug=debug,
        issues=issues,
        escalations=escalations,
        extra={"restricted": not passed},
    )


def evaluate_preferred_supplier_rule(
    rule: Dict[str, Any],
    request: Dict[str, Any],
    supplier: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if supplier is None:
        return make_rule_result(
            applies=False,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="No supplier provided.",
                action="skip",
                rule_id=rule.get("rule_id"),
            ),
        )

    scope = rule.get("scope", {})
    scope_base = {
        "supplier_id": scope.get("supplier_id"),
        "category_l1": scope.get("category_l1"),
        "category_l2": scope.get("category_l2"),
    }

    applies = scope_matches(supplier, scope_base)
    if not applies:
        return make_rule_result(
            applies=False,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="Supplier/category scope does not match preferred rule.",
                action="skip",
                supplier_id=supplier.get("supplier_id"),
                rule_id=rule.get("rule_id"),
            ),
        )

    delivery_country = request.get("delivery_country")
    service_regions = parse_service_regions(supplier.get("service_regions"))
    covers_country = delivery_country in service_regions if delivery_country else False

    supplier_in_shortlist = True
    passed = supplier_in_shortlist

    debug = make_debug_log(
        step="Policy Evaluation",
        rule_family=rule["rule_family"],
        rule_type=rule["rule_type"],
        triggered=True,
        passed=passed,
        reason=(
            f"Preferred supplier rule applies. "
            f"delivery_country={delivery_country}, covers_country={covers_country}."
        ),
        action=None,
        supplier_id=supplier.get("supplier_id"),
        rule_id=rule.get("rule_id"),
    )

    return make_rule_result(
        applies=True,
        passed=passed,
        debug=debug,
        issues=[],
        escalations=[],
        extra={
            "is_preferred": True,
            "covers_delivery_country": covers_country,
            "policy_note": rule.get("metadata", {}).get("policy_note"),
        },
    )


def evaluate_category_rule(
    rule: Dict[str, Any],
    request: Dict[str, Any],
) -> Dict[str, Any]:
    applies = scope_matches(request, rule.get("scope"))
    if not applies:
        return make_rule_result(
            applies=False,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="Category rule scope does not match request.",
                action="skip",
                rule_id=rule.get("rule_id"),
            ),
        )

    trigger_conditions = rule.get("trigger_conditions", [])
    triggered = evaluate_conditions_all(request, trigger_conditions) if trigger_conditions else True

    if not triggered:
        return make_rule_result(
            applies=True,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="Category rule not triggered by request values.",
                action="skip",
                rule_id=rule.get("rule_id"),
            ),
            extra={"rule_applied": False},
        )

    required_condition = rule.get("required_condition")
    passed = evaluate_condition(request, required_condition) if required_condition else True

    issues = []
    escalations = []

    if not passed and rule.get("fail_issue_type"):
        issues.append(
            make_issue(
                issue_type=rule.get("fail_issue_type"),
                severity=rule.get("fail_severity", "high"),
                description=rule.get("metadata", {}).get(
                    "rule_text",
                    f"Category rule {rule.get('rule_id')} failed."
                ),
                action_required=(
                    f"Resolve category rule requirement for {rule.get('rule_id')}."
                ),
                rule_id=rule.get("rule_id"),
            )
        )

    if not passed and rule.get("fail_action") == "escalate" and rule.get("fail_target"):
        escalations.append(
            make_escalation(
                trigger=rule.get("fail_issue_type", "category_rule_failed"),
                action="escalate",
                target=rule.get("fail_target"),
                blocking=rule.get("blocking", True),
                rule_id=rule.get("rule_id"),
            )
        )

    debug = make_debug_log(
        step="Policy Evaluation",
        rule_family=rule["rule_family"],
        rule_type=rule["rule_type"],
        triggered=True,
        passed=passed,
        reason=rule.get("metadata", {}).get("rule_text", "Category rule evaluated."),
        action=None if passed else rule.get("fail_action"),
        rule_id=rule.get("rule_id"),
    )

    return make_rule_result(
        applies=True,
        passed=passed,
        debug=debug,
        issues=issues,
        escalations=escalations,
        extra={"rule_applied": True},
    )


def evaluate_geography_rule(
    rule: Dict[str, Any],
    request: Dict[str, Any],
    supplier: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    scope = rule.get("scope", {})
    delivery_country = request.get("delivery_country")
    request_category_l1 = request.get("category_l1")

    country_match = True
    if scope.get("country") is not None:
        country_match = delivery_country == scope.get("country")

    countries_match = True
    if scope.get("countries"):
        countries_match = delivery_country in scope.get("countries")

    applies_to_match = True
    if scope.get("applies_to"):
        applies_to_match = request_category_l1 in scope.get("applies_to")

    region_match = True
    if scope.get("region"):
        region_match = request.get("delivery_region") == scope.get("region")

    applies = country_match and countries_match and applies_to_match and region_match

    if not applies:
        return make_rule_result(
            applies=False,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="Geography rule scope does not match request geography/category.",
                action="skip",
                supplier_id=supplier.get("supplier_id") if supplier else None,
                rule_id=rule.get("rule_id"),
            ),
        )

    trigger_conditions = rule.get("trigger_conditions", [])
    triggered = evaluate_conditions_all(request, trigger_conditions) if trigger_conditions else True

    if not triggered:
        return make_rule_result(
            applies=True,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="Geography rule not triggered by request values.",
                action="skip",
                supplier_id=supplier.get("supplier_id") if supplier else None,
                rule_id=rule.get("rule_id"),
            ),
            extra={"rule_applied": False},
        )

    source = request.copy()
    if supplier:
        source.update({
            "supplier_supports_residency": supplier.get("data_residency_supported"),
            "supplier_is_sovereign_or_approved": supplier.get("data_residency_supported"),
            "local_language_support_available": True,
            "deployment_support_available": True,
            "in_country_residency_available": supplier.get("data_residency_supported"),
            "geography_compliance_confirmed": True,
        })

    required_condition = rule.get("required_condition")
    passed = evaluate_condition(source, required_condition) if required_condition else True

    issues = []
    escalations = []

    if not passed and rule.get("fail_issue_type"):
        issues.append(
            make_issue(
                issue_type=rule.get("fail_issue_type"),
                severity=rule.get("fail_severity", "high"),
                description=rule.get("metadata", {}).get(
                    "rule_text",
                    f"Geography rule {rule.get('rule_id')} failed."
                ),
                action_required=f"Resolve geography rule requirement for {rule.get('rule_id')}.",
                supplier_id=supplier.get("supplier_id") if supplier else None,
                rule_id=rule.get("rule_id"),
            )
        )

    if not passed and rule.get("fail_action") == "escalate" and rule.get("fail_target"):
        escalations.append(
            make_escalation(
                trigger=rule.get("fail_issue_type", "geography_rule_failed"),
                action="escalate",
                target=rule.get("fail_target"),
                blocking=rule.get("blocking", True),
                supplier_id=supplier.get("supplier_id") if supplier else None,
                rule_id=rule.get("rule_id"),
            )
        )

    debug = make_debug_log(
        step="Policy Evaluation",
        rule_family=rule["rule_family"],
        rule_type=rule["rule_type"],
        triggered=True,
        passed=passed,
        reason=rule.get("metadata", {}).get("rule_text", "Geography rule evaluated."),
        action=None if passed else rule.get("fail_action"),
        supplier_id=supplier.get("supplier_id") if supplier else None,
        rule_id=rule.get("rule_id"),
    )

    return make_rule_result(
        applies=True,
        passed=passed,
        debug=debug,
        issues=issues,
        escalations=escalations,
        extra={"rule_applied": True},
    )


def evaluate_escalation_rule(
    rule: Dict[str, Any],
    request: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    context = context or {}

    applies = True
    trigger_conditions = rule.get("trigger_conditions", [])
    triggered = evaluate_conditions_all(context, trigger_conditions) if trigger_conditions else False

    if not triggered:
        return make_rule_result(
            applies=applies,
            passed=True,
            debug=make_debug_log(
                step="Policy Evaluation",
                rule_family=rule["rule_family"],
                rule_type=rule["rule_type"],
                triggered=False,
                passed=True,
                reason="Escalation trigger not matched.",
                action="skip",
                rule_id=rule.get("rule_id"),
            ),
            extra={"rule_applied": False},
        )

    target = rule.get("metadata", {}).get("escalate_to") or rule.get("fail_target")

    escalation = make_escalation(
        trigger=rule.get("metadata", {}).get("trigger", context.get("issue_type")),
        action="escalate",
        target=target,
        blocking=rule.get("blocking", True),
        rule_id=rule.get("rule_id"),
    )

    debug = make_debug_log(
        step="Policy Evaluation",
        rule_family=rule["rule_family"],
        rule_type=rule["rule_type"],
        triggered=True,
        passed=False,
        reason=f"Escalation rule triggered for issue_type={context.get('issue_type')}.",
        action="escalate",
        rule_id=rule.get("rule_id"),
    )

    return make_rule_result(
        applies=True,
        passed=False,
        debug=debug,
        issues=[],
        escalations=[escalation],
        extra={"rule_applied": True},
    )


def evaluate_rule(
    rule: Dict[str, Any],
    request: Dict[str, Any],
    supplier: Optional[Dict[str, Any]] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    rule_family = rule.get("rule_family")

    if rule_family == "approval_threshold":
        return evaluate_approval_threshold_rule(rule, request)

    if rule_family == "restricted_supplier":
        return evaluate_restricted_supplier_rule(rule, request, supplier)

    if rule_family == "preferred_supplier":
        return evaluate_preferred_supplier_rule(rule, request, supplier)

    if rule_family == "category_rule":
        return evaluate_category_rule(rule, request)

    if rule_family == "geography_rule":
        return evaluate_geography_rule(rule, request, supplier)

    if rule_family == "escalation_rule":
        return evaluate_escalation_rule(rule, request, context)

    return make_rule_result(
        applies=False,
        passed=True,
        debug=make_debug_log(
            step="Policy Evaluation",
            rule_family="unknown_rule_family",
            rule_type=str(rule_family),
            triggered=False,
            passed=True,
            reason=f"Unknown rule family: {rule_family}",
            action="skip",
            rule_id=rule.get("rule_id"),
            supplier_id=supplier.get("supplier_id") if supplier else None,
        ),
        issues=[],
        escalations=[],
        extra={},
    )

# =========================================================
# 6. POLICY CONSTRAINT EVALUATOR
# =========================================================

# idea:
# - prende request + supplier già passato dagli operational hard checks
# - applica tutte le policy rule families rilevanti
# - raccoglie debug log / issues / escalations
# - restituisce uno stato aggregato per supplier e per case-level rules

# QUA CI PASSI SOLO GLI AWARDABLE O I NON COMPLIANT MA NON HARD PASS

# ---------------------------------------------------------
# helper: applica una lista di regole supplier-level
# ---------------------------------------------------------
def run_supplier_policy_rules(
    request: Dict[str, Any],
    supplier: Dict[str, Any],
    rules: List[Dict[str, Any]],
) -> Dict[str, Any]:
    debug_log = []
    issues = []
    escalations = []
    extra = []

    for rule in rules:
        res = evaluate_rule(rule, request, supplier=supplier)

        debug_log.append(res["debug"])
        issues.extend(res["issues"])
        escalations.extend(res["escalations"])
        extra.append(res.get("extra", {}))

    return {
        "debug_log": debug_log,
        "issues": issues,
        "escalations": escalations,
        "extra": extra,
    }


# ---------------------------------------------------------
# helper: applica una lista di regole case-level
# ---------------------------------------------------------
def run_case_policy_rules(
    request: Dict[str, Any],
    rules: List[Dict[str, Any]],
) -> Dict[str, Any]:
    debug_log = []
    issues = []
    escalations = []
    extra = []

    for rule in rules:
        res = evaluate_rule(rule, request)

        debug_log.append(res["debug"])
        issues.extend(res["issues"])
        escalations.extend(res["escalations"])
        extra.append(res.get("extra", {}))

    return {
        "debug_log": debug_log,
        "issues": issues,
        "escalations": escalations,
        "extra": extra,
    }


# ---------------------------------------------------------
# helper: escalation rules leggono context/issue_type già emerso
# ---------------------------------------------------------
def run_escalation_rules_from_issues(
    issues: List[Dict[str, Any]],
    escalation_rules: List[Dict[str, Any]],
    request: Dict[str, Any],
) -> Dict[str, Any]:
    debug_log = []
    escalations = []

    for issue in issues:
        context = {
            "issue_type": issue.get("issue_type"),
            "currency": request.get("currency"),
        }

        for rule in escalation_rules:
            # scope currency opzionale
            scope = rule.get("scope", {})
            applies_to_currencies = scope.get("applies_to_currencies", [])

            if applies_to_currencies:
                if request.get("currency") not in applies_to_currencies:
                    continue

            res = evaluate_rule(rule, request, context=context)
            debug_log.append(res["debug"])
            escalations.extend(res["escalations"])

    return {
        "debug_log": debug_log,
        "escalations": escalations,
    }


# ---------------------------------------------------------
# helper: dedup simple per escalations/issues/debug
# ---------------------------------------------------------
def deduplicate_dict_list(items: List[Dict[str, Any]], keys: List[str]) -> List[Dict[str, Any]]:
    seen = set()
    out = []

    for item in items:
        sig = tuple(item.get(k) for k in keys)
        if sig not in seen:
            seen.add(sig)
            out.append(item)

    return out


# ---------------------------------------------------------
# MAIN POLICY EVALUATOR
#
# INPUT:
# - request
# - feasible_suppliers: supplier già vivi dopo operational hard filters
# - all_policy_rules: dict con tutte le family buildate
#
# OUTPUT:
# - supplier_policy_results
# - case_policy_results
# - merged issues/escalations/debug
# ---------------------------------------------------------
def evaluate_policy_constraints(
    request: Dict[str, Any],
    feasible_suppliers: List[Dict[str, Any]],
    all_policy_rules: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:

    restricted_rules = all_policy_rules.get("restricted_rules", [])
    preferred_rules = all_policy_rules.get("preferred_rules", [])
    approval_rules = all_policy_rules.get("approval_rules", [])
    category_rules = all_policy_rules.get("category_rules", [])
    geography_rules = all_policy_rules.get("geography_rules", [])
    escalation_rules = all_policy_rules.get("escalation_rules", [])

    all_debug_log = []
    all_issues = []
    all_escalations = []

    supplier_policy_results = []

    # =====================================================
    # 1) SUPPLIER-LEVEL POLICY RULES
    #    - restricted
    #    - preferred
    #    - geography (supplier-sensitive)
    # =====================================================
    for supplier in feasible_suppliers:
        supplier_id = supplier.get("supplier_id")

        supplier_debug = []
        supplier_issues = []
        supplier_escalations = []

        # restricted rules
        restricted_out = run_supplier_policy_rules(request, supplier, restricted_rules)
        supplier_debug.extend(restricted_out["debug_log"])
        supplier_issues.extend(restricted_out["issues"])
        supplier_escalations.extend(restricted_out["escalations"])

        # preferred rules
        preferred_out = run_supplier_policy_rules(request, supplier, preferred_rules)
        supplier_debug.extend(preferred_out["debug_log"])
        supplier_issues.extend(preferred_out["issues"])
        supplier_escalations.extend(preferred_out["escalations"])

        # geography rules
        # evaluate_rule per geography_rule accetta anche supplier
        geo_debug = []
        geo_issues = []
        geo_escalations = []

        for rule in geography_rules:
            res = evaluate_rule(rule, request, supplier=supplier)
            geo_debug.append(res["debug"])
            geo_issues.extend(res["issues"])
            geo_escalations.extend(res["escalations"])

        supplier_debug.extend(geo_debug)
        supplier_issues.extend(geo_issues)
        supplier_escalations.extend(geo_escalations)

        # aggregazione status supplier-level
        blocking_issues = [x for x in supplier_issues if x.get("severity") in ["high", "critical"]]
        blocking_escalations = [x for x in supplier_escalations if x.get("blocking") is True]

        # restricted hard policy fail = non fully compliant
        is_policy_compliant = (len(blocking_issues) == 0 and len(blocking_escalations) == 0)

        supplier_result = {
            "supplier_id": supplier_id,
            "supplier_name": supplier.get("supplier_name"),
            "supplier": supplier,
            "is_policy_compliant": is_policy_compliant,
            "issues": supplier_issues,
            "escalations": supplier_escalations,
            "debug_log": supplier_debug,
        }

        supplier_policy_results.append(supplier_result)

        all_debug_log.extend(supplier_debug)
        all_issues.extend(supplier_issues)
        all_escalations.extend(supplier_escalations)

    # =====================================================
    # 2) CASE-LEVEL POLICY RULES
    #    - approval thresholds
    #    - category rules
    # =====================================================
    # importantissimo:
    # il compliant_supplier_count per approval threshold dovrebbe basarsi
    # sui supplier ancora feasible dopo operational
    # e idealmente anche non restricted hard.
    #
    # per ora usiamo il count dei feasible suppliers in ingresso
    request_for_case_rules = request.copy()
    request_for_case_rules["compliant_supplier_count"] = len(feasible_suppliers)

    approval_out = run_case_policy_rules(request_for_case_rules, approval_rules)
    category_out = run_case_policy_rules(request_for_case_rules, category_rules)

    case_debug_log = []
    case_issues = []
    case_escalations = []

    case_debug_log.extend(approval_out["debug_log"])
    case_debug_log.extend(category_out["debug_log"])

    case_issues.extend(approval_out["issues"])
    case_issues.extend(category_out["issues"])

    case_escalations.extend(approval_out["escalations"])
    case_escalations.extend(category_out["escalations"])

    all_debug_log.extend(case_debug_log)
    all_issues.extend(case_issues)
    all_escalations.extend(case_escalations)

    # =====================================================
    # 3) ESCALATION RULES
    #    leggono le issue già prodotte
    # =====================================================
    escalation_map_out = run_escalation_rules_from_issues(
        issues=all_issues,
        escalation_rules=escalation_rules,
        request=request_for_case_rules,
    )

    all_debug_log.extend(escalation_map_out["debug_log"])
    all_escalations.extend(escalation_map_out["escalations"])

    # =====================================================
    # 4) DEDUP
    # =====================================================
    all_issues = deduplicate_dict_list(
        all_issues,
        keys=["rule_id", "issue_type", "supplier_id"]
    )

    all_escalations = deduplicate_dict_list(
        all_escalations,
        keys=["rule_id", "trigger", "target", "supplier_id"]
    )

    all_debug_log = deduplicate_dict_list(
        all_debug_log,
        keys=["rule_id", "rule_family", "rule_type", "supplier_id", "reason"]
    )

    # =====================================================
    # 5) CASE STATUS
    # =====================================================
    case_blocking_issues = [x for x in all_issues if x.get("severity") in ["high", "critical"]]
    case_blocking_escalations = [x for x in all_escalations if x.get("blocking") is True]

    case_is_policy_compliant = (len(case_blocking_issues) == 0 and len(case_blocking_escalations) == 0)

    return {
        "supplier_policy_results": supplier_policy_results,
        "case_policy_results": {
            "is_policy_compliant": case_is_policy_compliant,
            "issues": case_issues,
            "escalations": case_escalations,
            "debug_log": case_debug_log,
        },
        "all_issues": all_issues,
        "all_escalations": all_escalations,
        "all_debug_log": all_debug_log,
    }

# =========================================================
# 9. REQUEST VALIDATION
# =========================================================

def validate_request_completeness(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Controlla se i campi minimi ci sono.
    Qui separo:
    - missing critical -> blocking
    - missing optional -> non blocking
    """

    issues = []
    debug_log = []

    critical_fields = [
        "category_l1",
        "category_l2",
        "quantity",
        "budget_amount",
        "currency",
        "delivery_country",
    ]

    # lead time: accetto o max_lead_time_days o days_until_required
    lead_time_present = (
        request.get("max_lead_time_days") is not None
        or request.get("days_until_required") is not None
    )

    missing_critical = [f for f in critical_fields if request.get(f) is None]
    if not lead_time_present:
        missing_critical.append("lead_time")

    for field in missing_critical:
        issues.append(
            make_issue(
                issue_type="missing_required_information",
                severity="critical",
                description=f"Missing required request field: {field}",
                action_required=f"Provide a valid value for {field}.",
                rule_id="REQ-VAL-001",
            )
        )
        debug_log.append(
            make_debug_log(
                step="Request Validation",
                rule_family="request_validation",
                rule_type="missing_critical_field",
                triggered=True,
                passed=False,
                reason=f"Missing required field: {field}",
                action="clarify",
                rule_id="REQ-VAL-001",
            )
        )

    # optional / contextual
    optional_fields = [
        "preferred_supplier_stated",
        "incumbent_supplier",
        "data_residency_required",
        "business_facing_service",
        "large_rollout",
        "sensitive_or_regulated_data",
    ]

    for field in optional_fields:
        if field not in request:
            debug_log.append(
                make_debug_log(
                    step="Request Validation",
                    rule_family="request_validation",
                    rule_type="missing_optional_field",
                    triggered=True,
                    passed=True,
                    reason=f"Optional field missing: {field}",
                    action="warning",
                    rule_id="REQ-VAL-002",
                )
            )

    completeness = "pass" if len(missing_critical) == 0 else "fail"

    return {
        "completeness": completeness,
        "issues_detected": issues,
        "debug_log": debug_log,
    }

# =========================================================
# 10. MAIN PIPELINE / ORCHESTRATOR
# =========================================================

def run_policy_stage(
    request: Dict[str, Any],
    operational_stage: Dict[str, Any],
    all_policy_rules: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    feasible_suppliers = operational_stage.get("feasible_suppliers", [])

    return evaluate_policy_constraints(
        request=request,
        feasible_suppliers=feasible_suppliers,
        all_policy_rules=all_policy_rules,
    )


def aggregate_pipeline_results(
    request: Dict[str, Any],
    request_validation: Dict[str, Any],
    operational_stage: Dict[str, Any],
    policy_stage: Dict[str, Any],
) -> Dict[str, Any]:
    operational_results = operational_stage.get("operational_results", [])
    excluded_suppliers = operational_stage.get("excluded_suppliers", [])
    feasible_suppliers = operational_stage.get("feasible_suppliers", [])
    awardable_suppliers = operational_stage.get("awardable_suppliers", [])
    showable_suppliers = operational_stage.get("showable_suppliers", [])

    supplier_policy_results = policy_stage.get("supplier_policy_results", [])
    case_policy_results = policy_stage.get("case_policy_results", {})
    policy_issues = policy_stage.get("all_issues", [])
    policy_escalations = policy_stage.get("all_escalations", [])
    policy_debug_log = policy_stage.get("all_debug_log", [])

    operational_debug_log = operational_stage.get("all_debug_log", [])
    validation_debug_log = request_validation.get("debug_log", [])
    validation_issues = request_validation.get("issues_detected", [])

    policy_by_supplier_id = {x["supplier_id"]: x for x in supplier_policy_results}

    fully_compliant_suppliers = []
    feasible_but_not_fully_compliant = []

    for supplier in showable_suppliers:
        supplier_id = supplier.get("supplier_id")
        policy_res = policy_by_supplier_id.get(supplier_id, {})

        supplier_is_policy_compliant = policy_res.get("is_policy_compliant", True)
        supplier_award_block = supplier.get("award_block", False)

        supplier_record = {
            "supplier_id": supplier_id,
            "supplier_name": supplier.get("supplier_name"),
            "supplier": supplier,
            "selected_pricing_row": supplier.get("selected_pricing_row"),
            "is_feasible": supplier.get("is_feasible", False),
            "award_block": supplier_award_block,
            "award_block_reasons": supplier.get("award_block_reasons", []),
            "is_policy_compliant": supplier_is_policy_compliant,
            "policy_issues": policy_res.get("issues", []),
            "policy_escalations": policy_res.get("escalations", []),
            "policy_debug_log": policy_res.get("debug_log", []),
            "lead_time_status": supplier.get("lead_time_status"),
            "budget_fit_status": supplier.get("budget_fit_status"),
        }

        if supplier_record["is_feasible"] and (not supplier_award_block) and supplier_is_policy_compliant:
            fully_compliant_suppliers.append(supplier_record)
        else:
            feasible_but_not_fully_compliant.append(supplier_record)

    case_has_fully_compliant = len(fully_compliant_suppliers) > 0
    case_has_feasible_options = len(showable_suppliers) > 0
    case_policy_compliant = case_policy_results.get("is_policy_compliant", True)
    validation_ok = request_validation.get("completeness") == "pass"

    if validation_ok and case_has_fully_compliant and case_policy_compliant:
        overall_status = "can_proceed"
    elif case_has_feasible_options:
        overall_status = "cannot_auto_award_but_options_exist"
    else:
        overall_status = "no_viable_supplier"

    all_issues = validation_issues + policy_issues
    all_issues = deduplicate_dict_list(
        all_issues,
        keys=["rule_id", "issue_type", "supplier_id"]
    )

    all_debug_log = validation_debug_log + operational_debug_log + policy_debug_log
    all_debug_log = deduplicate_dict_list(
        all_debug_log,
        keys=["rule_id", "rule_family", "rule_type", "supplier_id", "reason"]
    )

    return {
        "request": request,
        "request_validation": request_validation,
        "overall_status": overall_status,
        "excluded_suppliers": excluded_suppliers,
        "feasible_suppliers": feasible_suppliers,
        "awardable_suppliers": awardable_suppliers,
        "showable_suppliers": showable_suppliers,
        "fully_compliant_suppliers": fully_compliant_suppliers,
        "feasible_but_not_fully_compliant": feasible_but_not_fully_compliant,
        "all_issues": all_issues,
        "policy_escalations": policy_escalations,
        "case_policy_results": case_policy_results,
        "operational_results": operational_results,
        "supplier_policy_results": supplier_policy_results,
        "all_debug_log": all_debug_log,
    }


def run_procurement_pipeline(
    request: Dict[str, Any],
    suppliers_df,
    pricing_df,
    all_policy_rules: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:

    request_validation = validate_request_completeness(request)

    operational_stage = run_operational_stage(
        request=request,
        suppliers_df=suppliers_df,
        pricing_df=pricing_df,
    )

    policy_stage = run_policy_stage(
        request=request,
        operational_stage=operational_stage,
        all_policy_rules=all_policy_rules,
    )

    pipeline_results = aggregate_pipeline_results(
        request=request,
        request_validation=request_validation,
        operational_stage=operational_stage,
        policy_stage=policy_stage,
    )

    return {
        "request_validation": request_validation,
        "operational_stage": operational_stage,
        "policy_stage": policy_stage,
        "pipeline_results": pipeline_results,
    }

# =========================================================
# 11. DATASET BUILDERS
# =========================================================

def build_scoring_input_df(pipeline_out: Dict[str, Any]) -> pd.DataFrame:
    rows = []

    results = pipeline_out["pipeline_results"]

    candidates = results["fully_compliant_suppliers"] + results["feasible_but_not_fully_compliant"]

    for x in candidates:
        supplier = x["supplier"]
        pricing = x.get("selected_pricing_row") or {}

        row = {
            "supplier_id": x["supplier_id"],
            "supplier_name": x["supplier_name"],
            "status_color": "green" if x in results["fully_compliant_suppliers"] else "yellow",
            "is_feasible": x["is_feasible"],
            "is_policy_compliant": x["is_policy_compliant"],
            "award_block": x["award_block"],
            "quality_score": supplier.get("quality_score"),
            "risk_score": supplier.get("risk_score"),
            "esg_score": supplier.get("esg_score"),
            "unit_price": pricing.get("unit_price"),
            "expedited_unit_price": pricing.get("expedited_unit_price"),
            "standard_lead_time_days": pricing.get("standard_lead_time_days"),
            "expedited_lead_time_days": pricing.get("expedited_lead_time_days"),
            "pricing_region": pricing.get("region"),
            "pricing_currency": pricing.get("currency"),
        }
        rows.append(row)

    return pd.DataFrame(rows)


def build_supplier_diagnostics_df(pipeline_out: Dict[str, Any]) -> pd.DataFrame:
    results = pipeline_out["pipeline_results"]

    rows = []

    # rossi
    for x in results["excluded_suppliers"]:
        rows.append({
            "supplier_id": x["supplier_id"],
            "supplier_name": x["supplier_name"],
            "status_color": "red",
            "is_feasible": False,
            "is_policy_compliant": False,
            "award_block": True,
            "reason_summary": x.get("reason"),
            "exclusion_reasons": x.get("reason"),
            "award_block_reasons": None,
            "policy_issue_types": None,
            "policy_escalation_targets": None,
            "checked_rule_ids": None,
        })

    # gialli e verdi
    for bucket, color in [
        (results["feasible_but_not_fully_compliant"], "yellow"),
        (results["fully_compliant_suppliers"], "green"),
    ]:
        for x in bucket:
            issue_types = sorted(list({
                i.get("issue_type") for i in x.get("policy_issues", []) if i.get("issue_type")
            }))
            escalation_targets = sorted(list({
                e.get("target") for e in x.get("policy_escalations", []) if e.get("target")
            }))
            checked_rule_ids = sorted(list({
                d.get("rule_id")
                for d in x.get("policy_debug_log", [])
                if d.get("rule_id")
                and d.get("triggered") is True
                and str(d.get("rule_id")).startswith(("AT-", "RS-", "PS-", "CR-", "GR-", "ER-"))
            }))

            reason_parts = []
            if x.get("award_block_reasons"):
                reason_parts.extend(x.get("award_block_reasons", []))
            if issue_types:
                reason_parts.extend(issue_types)

            rows.append({
                "supplier_id": x["supplier_id"],
                "supplier_name": x["supplier_name"],
                "status_color": color,
                "is_feasible": x["is_feasible"],
                "is_policy_compliant": x["is_policy_compliant"],
                "award_block": x["award_block"],
                "reason_summary": ", ".join(sorted(set(reason_parts))) if reason_parts else "compliant",
                "exclusion_reasons": None,
                "award_block_reasons": ", ".join(x.get("award_block_reasons", [])) if x.get("award_block_reasons") else None,
                "policy_issue_types": ", ".join(issue_types) if issue_types else None,
                "policy_escalation_targets": ", ".join(escalation_targets) if escalation_targets else None,
                "checked_rule_ids": ", ".join(checked_rule_ids) if checked_rule_ids else None,
            })

    df = pd.DataFrame(rows)

    # dedup finale per supplier_id
    df = df.drop_duplicates(subset=["supplier_id"], keep="first").reset_index(drop=True)

    return df


def build_request_summary_dict(pipeline_out: Dict[str, Any]) -> Dict[str, Any]:
    results = pipeline_out["pipeline_results"]

    return {
        "overall_status": results["overall_status"],
        "n_excluded_suppliers": len(results["excluded_suppliers"]),
        "n_showable_suppliers": len(results["showable_suppliers"]),
        "n_fully_compliant_suppliers": len(results["fully_compliant_suppliers"]),
        "n_yellow_suppliers": len(results["feasible_but_not_fully_compliant"]),
        "n_issues": len(results["all_issues"]),
        "n_escalations": len(results["policy_escalations"]),
    }

# =========================================================
# 12. FINAL OUTPUT BLOCKS BUILDER
# =========================================================

def build_validation_block(pipeline_out: Dict[str, Any]) -> Dict[str, Any]:
    results = pipeline_out["pipeline_results"]
    request_validation = pipeline_out["request_validation"]

    issues_detected = []
    idx = 1

    # issue request-level da validation
    for issue in request_validation.get("issues_detected", []):
        issues_detected.append({
            "issue_id": f"V-{idx:03d}",
            "severity": issue.get("severity"),
            "type": issue.get("issue_type"),
            "description": issue.get("description"),
            "action_required": issue.get("action_required"),
        })
        idx += 1

    # issue aggregate dai supplier gialli/verdi: solo tipi unici rilevanti
    seen_types = set(x["type"] for x in issues_detected)

    for supplier in results["feasible_but_not_fully_compliant"]:
        # award-block reasons operational
        for reason in supplier.get("award_block_reasons", []):
            if reason not in seen_types:
                issues_detected.append({
                    "issue_id": f"V-{idx:03d}",
                    "severity": "high",
                    "type": reason,
                    "description": f"Supplier set contains blocking operational issue: {reason}.",
                    "action_required": f"Resolve or override issue: {reason}.",
                })
                seen_types.add(reason)
                idx += 1

        # policy issues
        for issue in supplier.get("policy_issues", []):
            issue_type = issue.get("issue_type")
            if issue_type and issue_type not in seen_types:
                issues_detected.append({
                    "issue_id": f"V-{idx:03d}",
                    "severity": issue.get("severity"),
                    "type": issue_type,
                    "description": issue.get("description"),
                    "action_required": issue.get("action_required"),
                })
                seen_types.add(issue_type)
                idx += 1

    return {
        "completeness": request_validation.get("completeness"),
        "issues_detected": issues_detected,
    }


def build_policy_evaluation_block(pipeline_out: Dict[str, Any]) -> Dict[str, Any]:
    results = pipeline_out["pipeline_results"]
    request = results["request"]

    all_debug = results["all_debug_log"]
    all_policy_rules = pipeline_out["policy_stage"]

    # approval threshold applicata
    approval_debugs = [
        d for d in all_debug
        if d.get("rule_family") == "approval_threshold" and d.get("triggered") is True
    ]
    approval_rule_applied = approval_debugs[0]["rule_id"] if approval_debugs else None

    approval_block = {
        "rule_applied": approval_rule_applied,
        "basis": None,
        "quotes_required": None,
        "approvers": None,
        "deviation_approval": None,
        "note": None,
    }

    # preferred supplier
    preferred_supplier_name = request.get("preferred_supplier_stated")
    preferred_supplier_block = {
        "supplier": preferred_supplier_name,
        "status": "eligible" if preferred_supplier_name else None,
        "is_preferred": bool(preferred_supplier_name),
        "covers_delivery_country": True if preferred_supplier_name else None,
        "is_restricted": False if preferred_supplier_name else None,
        "policy_note": None,
    }

    # restricted suppliers among showable
    restricted_notes = {}
    for s in results["showable_suppliers"]:
        supplier_id = s.get("supplier_id")
        supplier_name = s.get("supplier_name")
        supplier_policy = next(
            (x for x in results["supplier_policy_results"] if x["supplier_id"] == supplier_id),
            None
        )
        restricted_issue = False
        if supplier_policy:
            restricted_issue = any(
                i.get("issue_type") == "restricted_supplier"
                for i in supplier_policy.get("issues", [])
            )

        restricted_notes[f"{supplier_id}_{supplier_name.replace(' ', '_')}"] = {
            "restricted": restricted_issue,
            "note": "Supplier evaluated in final candidate set."
        }

    category_rules_applied = sorted(list({
        d.get("rule_id")
        for d in all_debug
        if d.get("rule_family") == "category_rule" and d.get("triggered") is True
    }))

    geography_rules_applied = sorted(list({
        d.get("rule_id")
        for d in all_debug
        if d.get("rule_family") == "geography_rule" and d.get("triggered") is True
    }))

    return {
        "approval_threshold": approval_block,
        "preferred_supplier": preferred_supplier_block,
        "restricted_suppliers": restricted_notes,
        "category_rules_applied": category_rules_applied,
        "geography_rules_applied": geography_rules_applied,
    }


def build_audit_trail_block(pipeline_out: Dict[str, Any]) -> Dict[str, Any]:
    results = pipeline_out["pipeline_results"]

    # solo policy vere triggerate
    policies_checked = sorted(list({
        d.get("rule_id")
        for d in results["all_debug_log"]
        if d.get("rule_id")
        and d.get("triggered") is True
        and str(d.get("rule_id")).startswith(("AT-", "RS-", "PS-", "CR-", "GR-", "ER-"))
    }))

    # supplier davvero valutati sulla request
    supplier_ids_evaluated = sorted(list({
        s.get("supplier_id")
        for s in results["excluded_suppliers"]
    } | {
        s.get("supplier_id")
        for s in results["showable_suppliers"]
    }))

    pricing_rows = [
        s.get("selected_pricing_row")
        for s in results["showable_suppliers"]
        if s.get("selected_pricing_row") is not None
    ]

    pricing_tiers_applied = None
    if pricing_rows:
        p = pricing_rows[0]
        pricing_tiers_applied = (
            f"{p.get('min_quantity')}–{p.get('max_quantity')} units "
            f"({p.get('region')} region, {p.get('currency')} currency)"
        )

    return {
        "policies_checked": policies_checked,
        "supplier_ids_evaluated": supplier_ids_evaluated,
        "pricing_tiers_applied": pricing_tiers_applied,
        "data_sources_used": ["suppliers.csv", "pricing.csv", "policies.json"],
        "historical_awards_consulted": False,
        "historical_award_note": None,
    }

def rank_suppliers(pipeline_out: Dict[str, Any]) -> List[Dict[str, Any]]:
    results = pipeline_out["pipeline_results"]

    candidates = (
        results["fully_compliant_suppliers"] +
        results["feasible_but_not_fully_compliant"]
    )

    ranked = []

    for x in candidates:
        supplier = x["supplier"]
        pricing = x.get("selected_pricing_row") or {}

        price = pricing.get("unit_price") or 999999

        score = (
            0.4 * (1 / price if price else 0) +
            0.3 * (supplier.get("quality_score", 0) / 100) -
            0.2 * (supplier.get("risk_score", 100) / 100) +
            0.1 * (supplier.get("esg_score", 0) / 100)
        )

        ranked.append({
            **x,
            "score": score
        })

    ranked = sorted(ranked, key=lambda x: x["score"], reverse=True)

    # assegna rank
    for i, r in enumerate(ranked, start=1):
        r["rank"] = i

    return ranked

def build_final_output(pipeline_out: Dict[str, Any]) -> Dict[str, Any]:
    results = pipeline_out["pipeline_results"]
    request = results["request"]

    ranked_suppliers = rank_suppliers(pipeline_out)

    return {
        "request_id": request.get("request_id"),

        "request_interpretation": {
            "category_l1": request.get("category_l1"),
            "category_l2": request.get("category_l2"),
            "quantity": request.get("quantity"),
            "budget_amount": request.get("budget_amount"),
            "currency": request.get("currency"),
            "delivery_country": request.get("delivery_country"),
            "required_by_date": request.get("required_by_date"),
            "days_until_required": request.get("days_until_required"),
            "preferred_supplier_stated": request.get("preferred_supplier_mentioned"),
            "incumbent_supplier": request.get("incumbent_supplier"),
        },

        "validation": build_validation_block(pipeline_out),

        "policy_evaluation": build_policy_evaluation_block(pipeline_out),

        "supplier_shortlist": [
            {
                "rank": s["rank"],
                "supplier_id": s["supplier_id"],
                "supplier_name": s["supplier_name"],
                "score": round(s["score"], 4),
                "unit_price": s.get("selected_pricing_row", {}).get("unit_price"),
                "quality_score": s["supplier"].get("quality_score"),
                "risk_score": s["supplier"].get("risk_score"),
                "esg_score": s["supplier"].get("esg_score"),
                "award_block": s.get("award_block"),
            }
            for s in ranked_suppliers[:3]
        ],

        "suppliers_excluded": results.get("excluded_suppliers"),

        "escalations": results.get("policy_escalations"),

        "recommendation": {
            "status": results.get("overall_status"),
            "recommended_supplier": ranked_suppliers[0]["supplier_name"] if ranked_suppliers else None,
        },

        "audit_trail": build_audit_trail_block(pipeline_out),
    }