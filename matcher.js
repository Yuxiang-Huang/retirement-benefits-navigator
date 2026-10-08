/**
 * Browser port of pipeline/definitions.py evaluate() and _compare().
 * A positive result is a discovery screen, not an entitlement decision.
 */

const CALCULATION_NAMES = {
  ssi_applicable_monthly_federal_rate_cents: "SSI federal rate for this category and living arrangement",
  ssi_countable_monthly_income_cents: "SSI monthly countable income after exclusions and deeming",
  ssi_countable_resources_cents: "SSI countable resources after exclusions and deeming",
  extra_help_countable_annual_income_cents: "Extra Help countable annual income",
  extra_help_countable_resources_cents: "Extra Help countable resources",
  extra_help_geography_supported: "whether the person's region is covered by the modeled Extra Help limits",
  va_applicable_mapr_cents: "Veterans Pension MAPR including tier and dependents",
  va_applicable_survivor_mapr_cents: "Survivors Pension MAPR including tier, children, and custody",
  va_income_for_purposes_annual_cents: "VA-purpose annual income after allowed deductions",
  va_survivor_income_for_purposes_annual_cents: "VA-purpose survivor annual income after allowed deductions",
  va_net_worth_for_pension_cents: "VA pension net worth after exclusions",
  va_survivor_net_worth_cents: "VA survivor net worth after exclusions",
};

const AGENCY_FIELDS = new Set([
  "worker_entitled_to_retirement_or_disability",
  "worker_fully_insured_for_independent_divorced_spouse",
  "medicare_drug_coverage_eligible",
  "esrd_medicare_pathway_confirmed",
  "medicare_citizenship_or_residency_requirement_met",
  "remarriage_rule_met",
  "continuous_cohabitation_met",
  "full_benefit_medicaid",
  "state_pays_part_b_premium_msp",
  "receives_ssi_payment",
]);

function isAgencyCheck(field) {
  return (
    field.startsWith("ssa_") ||
    field.startsWith("va_") ||
    field.startsWith("ssi_") ||
    field.startsWith("deceased_worker_") ||
    field.startsWith("deceased_veteran_") ||
    AGENCY_FIELDS.has(field)
  );
}

function checkName(field) {
  if (Object.prototype.hasOwnProperty.call(CALCULATION_NAMES, field)) {
    return `unsupported calculation: ${CALCULATION_NAMES[field]} (${field})`;
  }
  if (isAgencyCheck(field)) return `agency determination needed: ${field}`;
  return `profile input needed: ${field}`;
}

function pyInEqual(left, right) {
  if (typeof left === "boolean" && typeof right === "number") {
    return (left === true && right === 1) || (left === false && right === 0);
  }
  if (typeof right === "boolean" && typeof left === "number") {
    return (right === true && left === 1) || (right === false && left === 0);
  }
  return left === right;
}

function sameType(left, right) {
  const leftBool = typeof left === "boolean";
  const rightBool = typeof right === "boolean";
  if (leftBool !== rightBool) return false;
  return typeof left === typeof right;
}

export function compare(left, op, right) {
  if (op === "in") {
    if (!Array.isArray(right)) return null;
    return right.some((item) => pyInEqual(left, item));
  }
  if (!sameType(left, right)) return null;
  if ((op === "<" || op === "<=" || op === ">" || op === ">=") && (typeof left === "boolean" || typeof left !== "number")) {
    return null;
  }
  if (op === "==") return left === right;
  if (op === "!=") return left !== right;
  if (op === "<") return left < right;
  if (op === "<=") return left <= right;
  if (op === ">") return left > right;
  if (op === ">=") return left >= right;
  return null;
}

function missing(profile, field) {
  return !Object.prototype.hasOwnProperty.call(profile, field) || profile[field] === null || profile[field] === undefined;
}

function pyRepr(value) {
  if (typeof value === "string") return `'${value}'`;
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === null) return "None";
  return String(value);
}

function pyDict(obj) {
  const body = Object.keys(obj).map((key) => `'${key}': ${pyRepr(obj[key])}`).join(", ");
  return `{${body}}`;
}

function selectorsEqual(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

function evidenceKey(item) {
  return JSON.stringify([
    item.source_ref,
    item.url,
    item.locator,
    item.snapshot_source_id ?? null,
    item.sidecar_path ?? null,
  ]);
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function evaluate(document, profile, onDate = null) {
  const day = onDate || document.as_of;
  if (!isIsoDate(day)) throw new Error(`bad on_date: ${day}`);
  const evidenceUsed = [];
  const evidenceSeen = new Set();

  function recordEvidence(node) {
    for (const item of node.evidence || []) {
      const source = document.sources[item.source_ref];
      const resolved = {
        source_ref: item.source_ref,
        url: source.url,
        locator: item.locator,
      };
      if (Object.prototype.hasOwnProperty.call(source, "snapshot_source_id")) {
        resolved.snapshot_source_id = source.snapshot_source_id;
        resolved.sidecar_path = source.sidecar_path;
      }
      const key = evidenceKey(resolved);
      if (!evidenceSeen.has(key)) {
        evidenceSeen.add(key);
        evidenceUsed.push(resolved);
      }
    }
  }

  function nodeResult(node) {
    recordEvidence(node);
    if (Object.prototype.hasOwnProperty.call(node, "unknown")) {
      return [null, [], [node.unknown], []];
    }
    if (node.all) {
      const values = node.all.map((child) => nodeResult(child));
      const supported = values.flatMap(([value, good]) => (value === true ? good : []));
      if (values.some(([value]) => value === false)) {
        const failed = values.flatMap(([value, , , bad]) => (value === false ? bad : []));
        return [false, supported, [], failed];
      }
      if (values.some(([value]) => value === null)) {
        const unresolved = values.flatMap(([value, , checks]) => (value === null ? checks : []));
        return [null, supported, unresolved, []];
      }
      return [true, supported, [], []];
    }
    if (node.any) {
      const values = node.any.map((child) => nodeResult(child));
      const winner = values.find(([value]) => value === true);
      if (winner) return winner;
      if (values.some(([value]) => value === null)) {
        const unresolved = values.flatMap(([value, , checks]) => (value === null ? checks : []));
        return [null, [], unresolved, []];
      }
      const failed = values.flatMap(([, , , bad]) => bad);
      return [false, [], [], failed];
    }

    const field = node.field;
    if (missing(profile, field)) return [null, [], [checkName(field)], []];
    let target = node.value;
    if (node.threshold) {
      const threshold = document.thresholds[node.threshold];
      const start = threshold.effective_from;
      const end = threshold.effective_to;
      if ((start && day < start) || (end && day >= end)) {
        return [null, [], [`threshold outside effective period: ${node.threshold}`], []];
      }
      const selectorValues = {};
      for (const [key, fieldName] of Object.entries(node.selectors || {})) {
        if (missing(profile, fieldName)) return [null, [], [checkName(fieldName)], []];
        selectorValues[key] = profile[fieldName];
      }
      const rows = threshold.rows.filter((row) => selectorsEqual(row.selectors, selectorValues));
      if (rows.length !== 1) {
        return [null, [], [`unsupported threshold selection: ${node.threshold} (${pyDict(selectorValues)})`], []];
      }
      const row = rows[0];
      if (Object.prototype.hasOwnProperty.call(row, "input_field")) {
        const thresholdField = row.input_field;
        if (missing(profile, thresholdField)) return [null, [], [checkName(thresholdField)], []];
        target = profile[thresholdField];
        if (!Number.isInteger(target) || target < 0) {
          return [null, [], [`invalid threshold input: ${thresholdField}`], []];
        }
      } else {
        target = row.value;
      }
    }

    const result = compare(profile[field], node.operator, target);
    if (result === null) return [null, [], [`incompatible input: ${field}`], []];
    const category = Object.prototype.hasOwnProperty.call(CALCULATION_NAMES, field)
      ? "calculated input"
      : isAgencyCheck(field)
        ? "agency determination"
        : "profile fact";
    const shown = typeof target === "boolean" ? (target ? "True" : "False") : target;
    const detail = `${category}: ${field} ${node.operator} ${shown}`;
    return [result, result ? [detail] : [], [], result ? [] : [detail]];
  }

  const [result, supported, unresolved, failed] = nodeResult(document.eligibility);
  return {
    program_id: document.program_id,
    result: result === null ? "unknown" : result ? "potential_match" : "fails_documented_condition",
    supported_reasons: dedupe(supported),
    unresolved_checks: dedupe(unresolved),
    failed_reasons: dedupe(failed),
    application_url: document.application_url,
    follow_up: document.follow_up || [],
    evidence: evidenceUsed,
  };
}
