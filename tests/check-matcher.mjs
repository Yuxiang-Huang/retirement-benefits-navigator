import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { evaluate } from "../matcher.js";
import { matchPrograms, profilesFor } from "../profile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const programs = Object.fromEntries(
  ["medicare_eligibility", "medicare_part_d_extra_help", "social_security_retirement", "social_security_spouse", "social_security_survivor", "ssi_federal", "va_survivors_pension", "va_veterans_pension"].map((id) => [
    id,
    JSON.parse(readFileSync(join(dataDir, `${id}.json`), "utf8")),
  ]),
);

const profile = (name) => JSON.parse(readFileSync(join(root, "tests/profiles", name), "utf8"));

const cases = [
  { program_id: "social_security_spouse", profile: {} },
  { program_id: "social_security_spouse", profile: profile("spouse_profile.json") },
  { program_id: "social_security_spouse", profile: { ...profile("spouse_profile.json"), age_years: 61 } },
  { program_id: "social_security_retirement", profile: profile("retirement_profile.json") },
  { program_id: "social_security_retirement", profile: { age_years: 61, ssa_fully_insured_for_retirement: true } },
  { program_id: "social_security_retirement", profile: { age_years: 62, ssa_fully_insured_for_retirement: true } },
  { program_id: "social_security_retirement", profile: { age_years: 63 } },
  { program_id: "social_security_retirement", profile: { age_years: 63, ssa_fully_insured_for_retirement: false } },
  { program_id: "medicare_eligibility", profile: profile("medicare_profile.json") },
  { program_id: "medicare_part_d_extra_help", profile: profile("extra_help_profile.json") },
  {
    program_id: "medicare_eligibility",
    profile: {
      medicare_citizenship_or_residency_requirement_met: true,
      age_years: 40,
      social_security_disability_benefit_months: 0,
      als_with_social_security_disability_benefits: true,
      esrd_medicare_pathway_confirmed: false,
    },
  },
  { program_id: "social_security_survivor", profile: { deceased_worker_insured_for_survivors: false } },
  {
    program_id: "social_security_spouse",
    profile: {
      relationship_to_worker: "ex_spouse",
      marriage_duration_years: 10,
      ssa_divorced_spouse_relationship_verified: true,
      worker_entitled_to_retirement_or_disability: false,
      worker_fully_insured_for_independent_divorced_spouse: true,
      worker_age_62_throughout_entitlement_month: true,
      continuous_divorce_months: 24,
      age_years: 62,
      claimant_currently_unmarried_for_divorced_spouse: true,
      ssa_own_pia_below_half_worker_pia: true,
    },
  },
  {
    program_id: "social_security_spouse",
    profile: {
      relationship_to_worker: "ex_spouse",
      marriage_duration_years: 10,
      age_years: 62,
      worker_entitled_to_retirement_or_disability: false,
    },
  },
  {
    program_id: "va_veterans_pension",
    profile: {
      service_entry_route: "after_1981_officer",
      prior_24_month_active_service: false,
      continuous_active_service_months: 23,
      served_full_call_period: false,
    },
    eligibility: programs.va_veterans_pension.eligibility.all[3].any[2],
  },
  {
    program_id: "medicare_part_d_extra_help",
    profile: {
      extra_help_countable_annual_income_cents: 2393999,
      extra_help_household: "individual",
      extra_help_region: "contiguous_us_dc",
    },
    on_date: "2026-01-01",
    eligibility: {
      field: "extra_help_countable_annual_income_cents",
      operator: "<",
      threshold: "income_limit_2026",
      selectors: { household: "extra_help_household", region: "extra_help_region" },
      evidence: programs.medicare_part_d_extra_help.thresholds.income_limit_2026.evidence,
    },
  },
  {
    program_id: "medicare_part_d_extra_help",
    profile: {
      extra_help_countable_annual_income_cents: 2394000,
      extra_help_household: "individual",
      extra_help_region: "alaska",
    },
    on_date: "2026-06-01",
    eligibility: {
      field: "extra_help_countable_annual_income_cents",
      operator: "<",
      threshold: "income_limit_2026",
      selectors: { household: "extra_help_household", region: "extra_help_region" },
      evidence: programs.medicare_part_d_extra_help.thresholds.income_limit_2026.evidence,
    },
  },
  {
    program_id: "ssi_federal",
    profile: { ssi_countable_monthly_income_cents: 99400, ssi_applicable_monthly_federal_rate_cents: "99400" },
    eligibility: programs.ssi_federal.eligibility.all.find((node) => node.threshold === "applicable_monthly_federal_rate"),
  },
];

const python = spawnSync("python3", [join(root, "tests/oracle.py"), dataDir], {
  input: JSON.stringify(cases),
  encoding: "utf8",
});
if (python.status !== 0) {
  console.error(python.stderr);
  process.exit(python.status || 1);
}
const expected = JSON.parse(python.stdout);

cases.forEach((testCase, index) => {
  const document = structuredClone(programs[testCase.program_id]);
  if (testCase.eligibility) document.eligibility = testCase.eligibility;
  const actual = evaluate(document, testCase.profile, testCase.on_date || null);
  assert.deepEqual(actual, expected[index], `case ${index} ${testCase.program_id}`);
});

for (const [programId, file] of [
  ["social_security_retirement", "retirement_profile.json"],
  ["medicare_eligibility", "medicare_profile.json"],
  ["medicare_part_d_extra_help", "extra_help_profile.json"],
  ["social_security_spouse", "spouse_profile.json"],
]) {
  const result = evaluate(programs[programId], profile(file));
  assert.equal(result.result, "potential_match", file);
  assert.ok(result.evidence.length > 0, file);
}

const answers = {
  ageYears: 67,
  state: "PA",
  household: "individual",
  incomeKnown: false,
  savingsKnown: true,
  savings: 50000,
  workCredits: true,
  disabilityKnown: true,
  disabilityMonths: 0,
  als: false,
  military: false,
  spouseStatus: "neither",
};
const matched = matchPrograms(Object.values(programs), answers, "2026-10-08");
const byId = Object.fromEntries(matched.map((item) => [item.program_id, item.result]));
assert.equal(byId.social_security_retirement, "potential_match");
assert.equal(byId.social_security_spouse, "fails_documented_condition");
assert.equal(byId.social_security_survivor, "fails_documented_condition");
assert.equal(byId.va_veterans_pension, "fails_documented_condition");
assert.equal(byId.va_survivors_pension, "fails_documented_condition");
assert.equal(byId.ssi_federal, "fails_documented_condition");
assert.equal(byId.medicare_eligibility, "unknown");
assert.equal(byId.medicare_part_d_extra_help, "unknown");

const alaska = profilesFor("medicare_part_d_extra_help", { ...answers, state: "AK" })[0];
assert.equal(alaska.extra_help_geography_supported, undefined);
assert.equal(alaska.extra_help_region, undefined);

const couple = profilesFor("ssi_federal", { ...answers, household: "couple", savingsKnown: false })[0];
assert.equal(couple.ssi_resource_household, "couple");
assert.equal(couple.extra_help_household, "married_couple");

console.log(`matcher checks passed (${cases.length} oracle cases)`);
