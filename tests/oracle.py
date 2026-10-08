"""Standalone copy of pipeline/definitions.py evaluate(), for checking the JS port."""
import json
import operator
import sys
from datetime import date
from pathlib import Path

CALCULATION_NAMES = {
    "ssi_applicable_monthly_federal_rate_cents": "SSI federal rate for this category and living arrangement",
    "ssi_countable_monthly_income_cents": "SSI monthly countable income after exclusions and deeming",
    "ssi_countable_resources_cents": "SSI countable resources after exclusions and deeming",
    "extra_help_countable_annual_income_cents": "Extra Help countable annual income",
    "extra_help_countable_resources_cents": "Extra Help countable resources",
    "extra_help_geography_supported": "whether the person's region is covered by the modeled Extra Help limits",
    "va_applicable_mapr_cents": "Veterans Pension MAPR including tier and dependents",
    "va_applicable_survivor_mapr_cents": "Survivors Pension MAPR including tier, children, and custody",
    "va_income_for_purposes_annual_cents": "VA-purpose annual income after allowed deductions",
    "va_survivor_income_for_purposes_annual_cents": "VA-purpose survivor annual income after allowed deductions",
    "va_net_worth_for_pension_cents": "VA pension net worth after exclusions",
    "va_survivor_net_worth_cents": "VA survivor net worth after exclusions",
}


def _compare(left, op, right):
    if op == "in":
        return left in right if isinstance(right, list) else None
    if isinstance(left, bool) != isinstance(right, bool) or type(left) is not type(right):
        return None
    if op in ("<", "<=", ">", ">=") and (isinstance(left, bool) or not isinstance(left, (int, float))):
        return None
    comparisons = {"==": operator.eq, "!=": operator.ne,
                   "<": operator.lt, "<=": operator.le,
                   ">": operator.gt, ">=": operator.ge}
    return comparisons[op](left, right)


def evaluate(document, profile, on_date=None):
    day = date.fromisoformat(on_date or document["as_of"])
    evidence_used = []

    def is_agency_check(field):
        return (field.startswith(("ssa_", "va_", "ssi_", "deceased_worker_", "deceased_veteran_")) or field in {
            "worker_entitled_to_retirement_or_disability", "worker_fully_insured_for_independent_divorced_spouse",
            "medicare_drug_coverage_eligible", "esrd_medicare_pathway_confirmed",
            "medicare_citizenship_or_residency_requirement_met",
            "remarriage_rule_met", "continuous_cohabitation_met",
            "full_benefit_medicaid", "state_pays_part_b_premium_msp", "receives_ssi_payment",
        })

    def check_name(field):
        if field in CALCULATION_NAMES:
            return f"unsupported calculation: {CALCULATION_NAMES[field]} ({field})"
        if is_agency_check(field):
            return f"agency determination needed: {field}"
        return f"profile input needed: {field}"

    def record_evidence(node):
        for item in node.get("evidence", []):
            source = document["sources"][item["source_ref"]]
            resolved = {"source_ref": item["source_ref"], "url": source["url"], "locator": item["locator"]}
            if "snapshot_source_id" in source:
                resolved["snapshot_source_id"] = source["snapshot_source_id"]
                resolved["sidecar_path"] = source["sidecar_path"]
            if resolved not in evidence_used:
                evidence_used.append(resolved)

    def node_result(node):
        record_evidence(node)
        if "unknown" in node:
            return None, [], [node["unknown"]], []
        if "all" in node:
            values = [node_result(child) for child in node["all"]]
            supported = [reason for value, good, _, _ in values if value is True for reason in good]
            if any(value is False for value, *_ in values):
                failed = [reason for value, _, _, bad in values if value is False for reason in bad]
                return False, supported, [], failed
            if any(value is None for value, *_ in values):
                unresolved = [reason for value, _, checks, _ in values if value is None for reason in checks]
                return None, supported, unresolved, []
            return True, supported, [], []
        if "any" in node:
            values = [node_result(child) for child in node["any"]]
            winner = next((item for item in values if item[0] is True), None)
            if winner:
                return winner
            if any(value is None for value, *_ in values):
                unresolved = [reason for value, _, checks, _ in values if value is None for reason in checks]
                return None, [], unresolved, []
            failed = [reason for _, _, _, bad in values for reason in bad]
            return False, [], [], failed
        field = node["field"]
        if field not in profile or profile[field] is None:
            return None, [], [check_name(field)], []
        target = node.get("value")
        if "threshold" in node:
            threshold = document["thresholds"][node["threshold"]]
            start, end = threshold.get("effective_from"), threshold.get("effective_to")
            if (start and day < date.fromisoformat(start)) or (end and day >= date.fromisoformat(end)):
                return None, [], [f"threshold outside effective period: {node['threshold']}"], []
            selector_values = {}
            for key, field_name in node.get("selectors", {}).items():
                if field_name not in profile or profile[field_name] is None:
                    return None, [], [check_name(field_name)], []
                selector_values[key] = profile[field_name]
            rows = [row for row in threshold["rows"] if row["selectors"] == selector_values]
            if len(rows) != 1:
                return None, [], [f"unsupported threshold selection: {node['threshold']} ({selector_values})"], []
            row = rows[0]
            if "input_field" in row:
                threshold_field = row["input_field"]
                if threshold_field not in profile or profile[threshold_field] is None:
                    return None, [], [check_name(threshold_field)], []
                target = profile[threshold_field]
                if type(target) is not int or target < 0:
                    return None, [], [f"invalid threshold input: {threshold_field}"], []
            else:
                target = row["value"]
        result = _compare(profile[field], node["operator"], target)
        if result is None:
            return None, [], [f"incompatible input: {field}"], []
        category = "calculated input" if field in CALCULATION_NAMES else "agency determination" if is_agency_check(field) else "profile fact"
        detail = f"{category}: {field} {node['operator']} {target}"
        return result, [detail] if result else [], [], [] if result else [detail]

    result, supported, unresolved, failed = node_result(document["eligibility"])
    return {"program_id": document["program_id"],
            "result": "unknown" if result is None else "potential_match" if result else "fails_documented_condition",
            "supported_reasons": list(dict.fromkeys(supported)),
            "unresolved_checks": list(dict.fromkeys(unresolved)),
            "failed_reasons": list(dict.fromkeys(failed)),
            "application_url": document["application_url"],
            "follow_up": document.get("follow_up", []),
            "evidence": evidence_used}


def main():
    data = Path(sys.argv[1])
    cases = json.load(sys.stdin)
    documents = {}
    out = []
    for case in cases:
        program_id = case["program_id"]
        if program_id not in documents:
            documents[program_id] = json.loads((data / f"{program_id}.json").read_text())
        document = documents[program_id]
        if "eligibility" in case:
            document = json.loads(json.dumps(document))
            document["eligibility"] = case["eligibility"]
        out.append(evaluate(document, case["profile"], case.get("on_date")))
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
