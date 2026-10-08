import { evaluate } from "./matcher.js";

export const STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];

const FIELD_LABELS = {
  age_years: "Age in years",
  ssa_fully_insured_for_retirement: "Whether Social Security work credits are enough for retirement",
  relationship_to_worker: "Relationship to the worker",
  marriage_duration_years: "Length of the marriage in years",
  marriage_duration_months: "Length of the marriage in months",
  worker_entitled_to_retirement_or_disability: "Whether the worker is getting Social Security retirement or disability",
  ssa_current_spouse_relationship_verified: "Whether Social Security has verified the current marriage",
  ssa_divorced_spouse_relationship_verified: "Whether Social Security has verified the former marriage",
  ssa_own_pia_below_half_worker_pia: "Whether your own Social Security benefit is below half of the worker's benefit",
  claimant_currently_unmarried_for_divorced_spouse: "Whether you are unmarried now",
  deceased_worker_insured_for_survivors: "Whether the person who died was insured for survivor benefits",
  deceased_worker_fully_or_transitionally_insured_for_widow: "Whether the person who died was insured for a widow or widower benefit",
  deceased_worker_fully_insured_for_divorced_survivor: "Whether the person who died was insured for a surviving divorced spouse",
  relationship_to_decedent: "Relationship to the person who died",
  remarriage_rule_met: "Whether Social Security's remarriage rule is met",
  ssa_survivor_own_rib_below_decedent_pia: "Whether your own benefit is below the benefit on the deceased person's record",
  social_security_disability_benefit_months: "Months of Social Security disability benefits",
  als_with_social_security_disability_benefits: "ALS with Social Security disability benefits",
  medicare_citizenship_or_residency_requirement_met: "Whether Medicare's citizenship or residency requirement is met",
  medicare_drug_coverage_eligible: "Whether you can get Medicare drug coverage",
  extra_help_geography_supported: "Whether your state uses the published Extra Help limits in this screener",
  extra_help_household: "Household size for Extra Help",
  extra_help_region: "Extra Help region",
  full_benefit_medicaid: "Whether you have full-benefit Medicaid",
  state_pays_part_b_premium_msp: "Whether a Medicare Savings Program pays the Part B premium",
  receives_ssi_payment: "Whether you receive an SSI payment",
  ssi_countable_resources_cents: "SSI countable resources",
  ssi_resource_household: "SSI resource household",
  ssi_citizenship_or_noncitizen_eligibility_met: "Whether SSI citizenship or noncitizen eligibility is met",
  ssi_residency_requirement_met: "Whether the SSI residency requirement is met",
  ssi_absence_rule_met_for_month: "Whether the SSI absence rule is met this month",
  ssi_institution_rule_met_for_month: "Whether the SSI institution rule is met this month",
  ssi_resource_transfer_penalty_not_in_effect: "Whether an SSI resource-transfer penalty is in effect",
  ssi_no_fugitive_felon_or_probation_parole_bar: "Whether an SSI fugitive-felon or probation bar applies",
  va_discharge_qualifies: "Whether the discharge qualifies for Veterans Pension",
  wartime_active_service_days: "Days of wartime active service",
  va_pension_wartime_service_requirement_met: "Whether the wartime-service requirement is met",
  service_entry_route: "When and how you entered military service",
  active_service_days: "Days of active service",
  continuous_active_service_months: "Months of continuous active service",
  served_full_call_period: "Whether you served the full period you were called for",
  prior_24_month_active_service: "Whether you already had 24 months of active service",
  va_minimum_duty_or_service_exception_verified: "Whether VA has verified a minimum-duty exception",
  va_net_worth_for_pension_cents: "VA pension net worth",
  va_mapr_case_and_tier_verified: "Whether VA has verified the pension case and tier",
  va_asset_transfer_penalty_not_in_effect: "Whether a VA asset-transfer penalty is in effect",
  deceased_veteran_discharge_qualifies: "Whether the deceased veteran's discharge qualifies",
  deceased_veteran_wartime_service_days: "The deceased veteran's wartime service",
  deceased_veteran_service_route_confirmed: "Whether the deceased veteran's service route is confirmed",
  va_survivor_net_worth_cents: "VA survivor net worth",
  va_survivor_mapr_case_and_tier_verified: "Whether VA has verified the survivor pension case and tier",
  va_survivor_asset_transfer_penalty_not_in_effect: "Whether a survivor asset-transfer penalty is in effect",
  relationship_to_veteran: "Relationship to the veteran",
  va_survivor_case: "VA survivor case",
  remarried_after_veteran_death: "Whether you remarried after the veteran's death",
  continuous_cohabitation_met: "Whether the continuous-cohabitation requirement is met",
};

export function dollarsToCents(dollars) {
  const cents = Math.round(Number(dollars) * 100);
  if (!Number.isFinite(cents)) return null;
  return cents;
}

export function todayIso(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function setBool(profile, field, value) {
  if (value === true || value === false) profile[field] = value;
}

function baseProfile(answers) {
  const profile = {};
  if (Number.isInteger(answers.ageYears) && answers.ageYears >= 0) profile.age_years = answers.ageYears;
  if (answers.state && answers.state !== "AK" && answers.state !== "HI") {
    profile.extra_help_region = "contiguous_us_dc";
    profile.extra_help_geography_supported = true;
  }
  if (answers.household === "individual") {
    profile.extra_help_household = "individual";
    profile.ssi_resource_household = "individual";
  } else if (answers.household === "couple") {
    profile.extra_help_household = "married_couple";
    profile.ssi_resource_household = "couple";
  }
  if (answers.incomeKnown && answers.incomeMonthly != null) {
    const annual = dollarsToCents(Number(answers.incomeMonthly) * 12);
    if (annual != null && annual >= 0) profile.extra_help_countable_annual_income_cents = annual;
  }
  if (answers.savingsKnown && answers.savings != null) {
    const cents = dollarsToCents(answers.savings);
    if (cents != null && cents >= 0) {
      profile.ssi_countable_resources_cents = cents;
      profile.extra_help_countable_resources_cents = cents;
      profile.va_net_worth_for_pension_cents = cents;
      profile.va_survivor_net_worth_cents = cents;
    }
  }
  setBool(profile, "ssa_fully_insured_for_retirement", answers.workCredits);
  if (answers.disabilityKnown && Number.isInteger(answers.disabilityMonths) && answers.disabilityMonths >= 0) {
    profile.social_security_disability_benefit_months = answers.disabilityMonths;
  }
  setBool(profile, "als_with_social_security_disability_benefits", answers.als);
  return profile;
}

function applyMilitary(profile, answers) {
  if (answers.military === false) {
    profile.va_discharge_qualifies = false;
    return;
  }
  if (answers.military !== true) return;
  setBool(profile, "va_discharge_qualifies", answers.discharge);
  if (answers.wartime === true) {
    profile.wartime_active_service_days = 1;
    profile.va_pension_wartime_service_requirement_met = true;
  } else if (answers.wartime === false) {
    profile.wartime_active_service_days = 0;
    profile.va_pension_wartime_service_requirement_met = false;
  }
  if (!answers.serviceRoute) return;
  profile.service_entry_route = answers.serviceRoute;
  if (answers.serviceRoute === "before_1980_09_08") {
    if (answers.serviceLength === "met") profile.active_service_days = 90;
    else if (answers.serviceLength === "not_met") {
      profile.active_service_days = 0;
      profile.va_minimum_duty_or_service_exception_verified = false;
    }
  } else if (answers.serviceRoute === "after_1980_enlisted") {
    if (answers.serviceLength === "met") profile.continuous_active_service_months = 24;
    else if (answers.serviceLength === "full_call") {
      profile.continuous_active_service_months = 0;
      profile.served_full_call_period = true;
    } else if (answers.serviceLength === "not_met") {
      profile.continuous_active_service_months = 0;
      profile.served_full_call_period = false;
      profile.va_minimum_duty_or_service_exception_verified = false;
    }
  } else if (answers.serviceRoute === "after_1981_officer") {
    if (answers.officerPrior24 === true) profile.prior_24_month_active_service = true;
    else if (answers.officerPrior24 === false) {
      profile.prior_24_month_active_service = false;
      if (answers.officerLength === "met") profile.continuous_active_service_months = 24;
      else if (answers.officerLength === "full_call") profile.served_full_call_period = true;
      else if (answers.officerLength === "not_met") {
        profile.continuous_active_service_months = 0;
        profile.served_full_call_period = false;
        profile.va_minimum_duty_or_service_exception_verified = false;
      }
    }
  }
}

function wantsCurrent(answers) {
  return answers.spouseStatus === "current" || answers.spouseStatus === "both";
}

function wantsFormer(answers) {
  return answers.spouseStatus === "former" || answers.spouseStatus === "both";
}

function currentSpouseFields(answers) {
  const profile = { relationship_to_worker: "spouse" };
  if (Number.isInteger(answers.currentMarriageYears) && answers.currentMarriageYears >= 0) {
    profile.marriage_duration_years = answers.currentMarriageYears;
  }
  setBool(profile, "worker_entitled_to_retirement_or_disability", answers.currentWorkerEntitled);
  setBool(profile, "ssa_current_spouse_relationship_verified", answers.currentRelationshipVerified);
  setBool(profile, "ssa_own_pia_below_half_worker_pia", answers.currentOwnBenefitLower);
  return profile;
}

function formerSpouseFields(answers) {
  const profile = { relationship_to_worker: "ex_spouse" };
  if (Number.isInteger(answers.formerMarriageYears) && answers.formerMarriageYears >= 0) {
    profile.marriage_duration_years = answers.formerMarriageYears;
  }
  setBool(profile, "worker_entitled_to_retirement_or_disability", answers.formerWorkerEntitled);
  setBool(profile, "ssa_divorced_spouse_relationship_verified", answers.formerRelationshipVerified);
  setBool(profile, "claimant_currently_unmarried_for_divorced_spouse", answers.formerCurrentlyUnmarried);
  setBool(profile, "ssa_own_pia_below_half_worker_pia", answers.formerOwnBenefitLower);
  return profile;
}

function deceasedCurrentFields(answers) {
  const profile = { relationship_to_decedent: "spouse" };
  if (Number.isInteger(answers.currentDeathMarriageMonths) && answers.currentDeathMarriageMonths >= 0) {
    profile.marriage_duration_months = answers.currentDeathMarriageMonths;
  }
  setBool(profile, "deceased_worker_insured_for_survivors", answers.currentDeathInsured);
  setBool(profile, "deceased_worker_fully_or_transitionally_insured_for_widow", answers.currentDeathWidowInsured);
  setBool(profile, "remarriage_rule_met", answers.currentDeathRemarriage);
  setBool(profile, "ssa_survivor_own_rib_below_decedent_pia", answers.currentDeathOwnLower);
  return profile;
}

function deceasedFormerFields(answers) {
  const profile = { relationship_to_decedent: "ex_spouse" };
  if (Number.isInteger(answers.formerDeathMarriageYears) && answers.formerDeathMarriageYears >= 0) {
    profile.marriage_duration_years = answers.formerDeathMarriageYears;
  }
  setBool(profile, "deceased_worker_insured_for_survivors", answers.formerDeathInsured);
  setBool(profile, "deceased_worker_fully_insured_for_divorced_survivor", answers.formerDeathDivorcedInsured);
  setBool(profile, "remarriage_rule_met", answers.formerDeathRemarriage);
  setBool(profile, "ssa_survivor_own_rib_below_decedent_pia", answers.formerDeathOwnLower);
  return profile;
}

function deathAnswered(answers) {
  const currentReady = !wantsCurrent(answers) || answers.currentDied === true || answers.currentDied === false;
  const formerReady = !wantsFormer(answers) || answers.formerDied === true || answers.formerDied === false;
  return currentReady && formerReady;
}

export function profilesFor(programId, answers) {
  const base = baseProfile(answers);
  if (programId === "va_veterans_pension") {
    applyMilitary(base, answers);
    return [base];
  }
  if (programId === "social_security_spouse") {
    if (answers.spouseStatus === "neither") return [{ ...base, relationship_to_worker: "none" }];
    const profiles = [];
    if (wantsCurrent(answers) && answers.currentDied === false) profiles.push({ ...base, ...currentSpouseFields(answers) });
    if (wantsFormer(answers) && answers.formerDied === false) profiles.push({ ...base, ...formerSpouseFields(answers) });
    if (profiles.length) return profiles;
    if (answers.spouseStatus && deathAnswered(answers)) return [{ ...base, relationship_to_worker: "none" }];
    return [base];
  }
  if (programId === "social_security_survivor") {
    if (answers.spouseStatus === "neither") return [{ ...base, deceased_worker_insured_for_survivors: false }];
    const profiles = [];
    if (wantsCurrent(answers) && answers.currentDied === true) profiles.push({ ...base, ...deceasedCurrentFields(answers) });
    if (wantsFormer(answers) && answers.formerDied === true) profiles.push({ ...base, ...deceasedFormerFields(answers) });
    if (profiles.length) return profiles;
    if (answers.spouseStatus && deathAnswered(answers)) return [{ ...base, deceased_worker_insured_for_survivors: false }];
    return [base];
  }
  if (programId === "va_survivors_pension") {
    const veteranAnswers = [];
    if (wantsCurrent(answers) && answers.currentDied === true) veteranAnswers.push(answers.currentDeathVeteran);
    if (wantsFormer(answers) && answers.formerDied === true) veteranAnswers.push(answers.formerDeathVeteran);
    const noDeath = answers.spouseStatus === "neither" || (answers.spouseStatus && deathAnswered(answers) && veteranAnswers.length === 0);
    if (noDeath || (veteranAnswers.length && veteranAnswers.every((value) => value === false))) {
      base.deceased_veteran_discharge_qualifies = false;
    }
    return [base];
  }
  return [base];
}

const RANK = { potential_match: 2, unknown: 1, fails_documented_condition: 0 };

function dedupe(items) {
  return [...new Set(items)];
}

function combine(results) {
  const best = results.slice().sort((a, b) => RANK[b.result] - RANK[a.result])[0];
  if (results.length === 1 || best.result === "potential_match") return best;
  if (best.result === "unknown") {
    return {
      ...best,
      supported_reasons: dedupe(results.flatMap((item) => item.supported_reasons)),
      unresolved_checks: dedupe(results.filter((item) => item.result !== "fails_documented_condition").flatMap((item) => item.unresolved_checks)),
      failed_reasons: [],
      evidence: best.evidence,
    };
  }
  return {
    ...best,
    failed_reasons: dedupe(results.flatMap((item) => item.failed_reasons)),
  };
}

export function matchPrograms(programs, answers, onDate) {
  return programs.map((program) => {
    const profiles = profilesFor(program.program_id, answers);
    const results = profiles.map((profile) => evaluate(program, profile, onDate));
    const combined = combine(results);
    return {
      ...combined,
      name: program.name,
      summary: program.summary,
      family: program.family,
      agency: program.agency,
    };
  });
}

export function humanizeCheck(check) {
  if (check.startsWith("unsupported calculation:")) {
    const label = check.slice("unsupported calculation:".length).replace(/\s*\([^)]*\)\s*$/, "").trim();
    return `${label}. SSA or VA has to calculate this. The dollar amount entered here is not used for this check.`;
  }
  const needed = check.match(/^(?:agency determination needed|profile input needed): (.+)$/);
  if (needed) {
    const field = needed[1];
    const label = FIELD_LABELS[field] || field.replaceAll("_", " ");
    if (field === "ssi_countable_monthly_income_cents" || field.includes("income_for_purposes") || field.includes("mapr")) {
      return `${label}. SSA or VA has to calculate this. The dollar amount entered here is not used for this check.`;
    }
    return label;
  }
  if (check.startsWith("threshold outside effective period")) return "A published limit is outside its effective dates for today's screening date.";
  if (check.startsWith("unsupported threshold selection")) return "The published limit table has no row for this combination of answers.";
  return check;
}

function displayValue(field, raw) {
  if (raw === "True") return "yes";
  if (raw === "False") return "no";
  if (field.endsWith("_cents") && /^-?\d+$/.test(raw)) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(raw) / 100);
  }
  return raw.replaceAll("_", " ");
}

function phrase(operator, value) {
  if (operator === "==") return `is ${value}`;
  if (operator === "!=") return `is not ${value}`;
  if (operator === ">=") return `is at least ${value}`;
  if (operator === ">") return `is greater than ${value}`;
  if (operator === "<=") return `is at most ${value}`;
  if (operator === "<") return `is under ${value}`;
  if (operator === "in") return `is one of ${value}`;
  return `${operator} ${value}`;
}

export function humanizeReason(reason, failed = false) {
  const match = reason.match(/^(profile fact|agency determination|calculated input): (\S+) (\S+) (.+)$/);
  if (!match) return reason;
  const [, category, field, operator, raw] = match;
  const label = FIELD_LABELS[field] || field.replaceAll("_", " ");
  const text = `${label} ${phrase(operator, displayValue(field, raw))}`;
  const usingAmount = category === "calculated input" ? "Using the amount entered, " : "";
  return failed ? `Not met: ${usingAmount}${text}` : `${usingAmount}${text}`;
}
