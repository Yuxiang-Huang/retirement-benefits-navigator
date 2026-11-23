import { humanizeCheck, humanizeReason, matchPrograms, STATES, todayIso } from "./profile.js";

const STORAGE_KEY = "rbn-navigator-v1";
const PROGRAM_IDS = [
  "social_security_retirement",
  "social_security_spouse",
  "social_security_survivor",
  "ssi_federal",
  "medicare_eligibility",
  "medicare_part_d_extra_help",
  "va_veterans_pension",
  "va_survivors_pension",
];

const GROUPS = [
  ["potential_match", "Possible matches", "Possible match", "match"],
  ["unknown", "Not enough information", "Not enough information", "unknown"],
  ["fails_documented_condition", "Does not meet a documented condition", "Does not meet a documented condition", "fail"],
];

const FILTERS = [
  ["all", "All programs"],
  ["social_security", "Social Security"],
  ["medicare", "Medicare"],
  ["ssi", "SSI"],
  ["va_pension", "VA pension"],
];

const state = {
  answers: {},
  programs: [],
  filter: "all",
  textSize: "100",
  contrast: false,
  loadError: "",
};

const STEPS = [
  { id: "age", label: "Age", title: "What is your age?", kind: "number", key: "ageYears", min: 0, max: 130, suffix: "years old", hint: "Retirement benefits can start at 62. Medicare and SSI use age 65. A widow or widower benefit can start at 60." },
  { id: "state", label: "State", title: "Where do you live?", kind: "state", key: "state", hint: "Contiguous states and Washington, D.C. use the published Extra Help limits. Alaska and Hawaii leave that geography check unresolved." },
  { id: "household", label: "Household", title: "Who is in your household?", kind: "choice", key: "household", hint: "This chooses the individual or couple amount in the published SSI and Extra Help limits.", options: [["individual", "Just me"], ["couple", "Me and a spouse"]] },
  { id: "income", label: "Monthly income", title: "What is your monthly income, before taxes?", kind: "money", key: "incomeMonthly", known: "incomeKnown" },
  { id: "savings", label: "Savings", title: "About how much do you have in savings and other countable resources?", kind: "money", key: "savings", known: "savingsKnown" },
  { id: "credits", label: "Work credits", title: "Do you have enough Social Security work credits for retirement benefits?", kind: "yesno", key: "workCredits", hint: "Social Security decides whether your work record is fully insured. I'm not sure leaves this unresolved." },
  { id: "disability", label: "Disability benefits", title: "How many months have you received Social Security disability benefits?", kind: "months", hint: "Medicare can start after 24 months of disability benefits. Enter 0 if you have not received them." },
  { id: "als", label: "ALS", title: "Do you have ALS and receive Social Security disability benefits?", kind: "yesno", key: "als" },
  { id: "military", label: "Military service", title: "Have you served in the U.S. military?", kind: "yesno", key: "military" },
  { id: "discharge", label: "Discharge", title: "Was your discharge anything other than dishonorable?", kind: "yesno", key: "discharge", show: (answers) => answers.military === true },
  { id: "wartime", label: "Wartime service", title: "Did you serve on active duty during a wartime period?", kind: "yesno", key: "wartime", show: (answers) => answers.military === true },
  { id: "entry", label: "When you entered", title: "When did you enter military service?", kind: "choice", key: "serviceRoute", show: (answers) => answers.military === true, options: [["before_1980_09_08", "Before September 8, 1980"], ["after_1980_enlisted", "Enlisted on or after September 8, 1980"], ["after_1981_officer", "Officer who entered after 1981"], [null, "I'm not sure"]] },
  { id: "length", label: "Length of service", title: "How long did you serve on active duty?", kind: "choice", key: "serviceLength", show: (answers) => answers.military === true && (answers.serviceRoute === "before_1980_09_08" || answers.serviceRoute === "after_1980_enlisted"), options: (answers) => answers.serviceRoute === "before_1980_09_08" ? [["met", "At least 90 days"], ["not_met", "Less than 90 days"], [null, "I'm not sure"]] : [["met", "At least 24 continuous months"], ["full_call", "The full period I was called for"], ["not_met", "Neither of those"], [null, "I'm not sure"]] },
  { id: "officer-prior", label: "Earlier active service", title: "Did you already have 24 months of active service before this commission?", kind: "yesno", key: "officerPrior24", show: (answers) => answers.military === true && answers.serviceRoute === "after_1981_officer" },
  { id: "officer-length", label: "Service after commission", title: "After your commission, how long did you serve?", kind: "choice", key: "officerLength", show: (answers) => answers.military === true && answers.serviceRoute === "after_1981_officer" && answers.officerPrior24 === false, options: [["met", "At least 24 continuous months"], ["full_call", "The full period I was called for"], ["not_met", "Neither of those"], [null, "I'm not sure"]] },
  { id: "spouse", label: "Spouse", title: "Do you have a current spouse, a former spouse, or both?", kind: "choice", key: "spouseStatus", options: [["current", "A current spouse"], ["former", "A former spouse"], ["both", "Both"], ["neither", "Neither"]] },
  { id: "current-died", label: "Current spouse", title: "Has your current spouse died?", kind: "yesno", key: "currentDied", show: (answers) => answers.spouseStatus === "current" || answers.spouseStatus === "both" },
  { id: "former-died", label: "Former spouse", title: "Has your former spouse died?", kind: "yesno", key: "formerDied", show: (answers) => answers.spouseStatus === "former" || answers.spouseStatus === "both" },
  { id: "current-years", label: "Years married", title: "How many years have you been married to your current spouse?", kind: "number", key: "currentMarriageYears", min: 0, max: 100, suffix: "years", show: (answers) => (answers.spouseStatus === "current" || answers.spouseStatus === "both") && answers.currentDied === false, hint: "A current spouse benefit ordinarily needs a marriage of at least 1 year." },
  { id: "current-entitled", label: "Spouse's benefits", title: "Is your current spouse getting Social Security retirement or disability benefits?", kind: "yesno", key: "currentWorkerEntitled", show: (answers) => (answers.spouseStatus === "current" || answers.spouseStatus === "both") && answers.currentDied === false },
  { id: "current-verified", label: "Marriage verified", title: "Has Social Security verified your current marriage?", kind: "yesno", key: "currentRelationshipVerified", show: (answers) => (answers.spouseStatus === "current" || answers.spouseStatus === "both") && answers.currentDied === false },
  { id: "current-lower", label: "Your own benefit", title: "Is your own Social Security benefit lower than half of your spouse's benefit?", kind: "yesno", key: "currentOwnBenefitLower", show: (answers) => (answers.spouseStatus === "current" || answers.spouseStatus === "both") && answers.currentDied === false },
  { id: "former-years", label: "Former marriage", title: "How many years were you married to your former spouse?", kind: "number", key: "formerMarriageYears", min: 0, max: 100, suffix: "years", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === false, hint: "A divorced-spouse benefit ordinarily needs a marriage of at least 10 years." },
  { id: "former-entitled", label: "Former spouse's benefits", title: "Is your former spouse getting Social Security retirement or disability benefits?", kind: "yesno", key: "formerWorkerEntitled", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === false, hint: "If they are not getting benefits yet, the independent divorced-spouse checks stay unresolved." },
  { id: "former-verified", label: "Former marriage verified", title: "Has Social Security verified that former marriage?", kind: "yesno", key: "formerRelationshipVerified", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === false },
  { id: "former-unmarried", label: "Unmarried now", title: "Are you unmarried now?", kind: "yesno", key: "formerCurrentlyUnmarried", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === false },
  { id: "former-lower", label: "Benefit comparison", title: "Is your own Social Security benefit lower than half of your former spouse's benefit?", kind: "yesno", key: "formerOwnBenefitLower", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === false },
  { id: "widow-months", label: "Marriage before death", title: "How many months were you married before your spouse died?", kind: "number", key: "currentDeathMarriageMonths", min: 0, max: 1200, suffix: "months", show: (answers) => (answers.spouseStatus === "current" || answers.spouseStatus === "both") && answers.currentDied === true, hint: "A widow or widower benefit ordinarily needs a marriage of at least 9 months." },
  { id: "widow-insured", label: "Insured for survivors", title: "Was your spouse insured for Social Security survivor benefits?", kind: "yesno", key: "currentDeathInsured", show: (answers) => (answers.spouseStatus === "current" || answers.spouseStatus === "both") && answers.currentDied === true },
  { id: "widow-status", label: "Widow insured status", title: "Was your spouse fully or transitionally insured for a widow or widower benefit?", kind: "yesno", key: "currentDeathWidowInsured", show: (answers) => (answers.spouseStatus === "current" || answers.spouseStatus === "both") && answers.currentDied === true },
  { id: "widow-remarriage", label: "Remarriage rule", title: "Do you meet Social Security's remarriage rule for a widow or widower benefit?", kind: "yesno", key: "currentDeathRemarriage", show: (answers) => (answers.spouseStatus === "current" || answers.spouseStatus === "both") && answers.currentDied === true },
  { id: "widow-lower", label: "Benefit on their record", title: "Is your own Social Security benefit lower than the benefit on your spouse's record?", kind: "yesno", key: "currentDeathOwnLower", show: (answers) => (answers.spouseStatus === "current" || answers.spouseStatus === "both") && answers.currentDied === true },
  { id: "widow-veteran", label: "Spouse's service", title: "Did your spouse serve in the U.S. military?", kind: "yesno", key: "currentDeathVeteran", show: (answers) => (answers.spouseStatus === "current" || answers.spouseStatus === "both") && answers.currentDied === true },
  { id: "ex-years", label: "Marriage before death", title: "How many years were you married to your former spouse?", kind: "number", key: "formerDeathMarriageYears", min: 0, max: 100, suffix: "years", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === true, hint: "A surviving divorced-spouse benefit ordinarily needs a marriage of at least 10 years." },
  { id: "ex-insured", label: "Insured for survivors", title: "Was your former spouse insured for Social Security survivor benefits?", kind: "yesno", key: "formerDeathInsured", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === true },
  { id: "ex-divorced-insured", label: "Divorced survivor status", title: "Was your former spouse fully insured for a surviving divorced-spouse benefit?", kind: "yesno", key: "formerDeathDivorcedInsured", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === true },
  { id: "ex-remarriage", label: "Remarriage rule", title: "Do you meet Social Security's remarriage rule for a surviving divorced spouse?", kind: "yesno", key: "formerDeathRemarriage", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === true },
  { id: "ex-lower", label: "Benefit on their record", title: "Is your own Social Security benefit lower than the benefit on your former spouse's record?", kind: "yesno", key: "formerDeathOwnLower", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === true },
  { id: "ex-veteran", label: "Former spouse's service", title: "Did your former spouse serve in the U.S. military?", kind: "yesno", key: "formerDeathVeteran", show: (answers) => (answers.spouseStatus === "former" || answers.spouseStatus === "both") && answers.formerDied === true },
];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "on") {
      for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    } else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, String(value));
  }
  for (const child of children) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}

function visibleSteps() {
  return STEPS.filter((step) => !step.show || step.show(state.answers));
}

function hasKey(key) {
  return Object.prototype.hasOwnProperty.call(state.answers, key);
}

function stepAnswered(step) {
  const answers = state.answers;
  if (step.kind === "number") {
    const value = answers[step.key];
    return Number.isInteger(value) && value >= step.min && value <= step.max;
  }
  if (step.kind === "money") {
    if (answers[step.known] === false) return true;
    return answers[step.known] === true && Number.isFinite(answers[step.key]) && answers[step.key] >= 0;
  }
  if (step.kind === "months") {
    if (answers.disabilityKnown === false) return true;
    return answers.disabilityKnown === true && Number.isInteger(answers.disabilityMonths) && answers.disabilityMonths >= 0 && answers.disabilityMonths <= 600;
  }
  if (step.kind === "yesno") return hasKey(step.key);
  if (step.kind === "state") return STATES.some(([code]) => code === answers.state);
  if (step.kind === "choice") return hasKey(step.key);
  return false;
}

function programById(id) {
  return state.programs.find((item) => item.program_id === id);
}

function centsLabel(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function thresholdValue(programId, thresholdId, selectors) {
  const program = programById(programId);
  const row = program?.thresholds[thresholdId].rows.find((item) => JSON.stringify(item.selectors) === JSON.stringify(selectors));
  return row ? row.value : null;
}

function stepHint(step) {
  if (step.hint) return step.hint;
  if (step.id === "income") {
    if (state.answers.state === "AK" || state.answers.state === "HI") {
      return "Alaska and Hawaii are outside the Extra Help limits in this screener, so this amount is not compared with those limits. Social Security and the VA calculate their own income amounts.";
    }
    const household = state.answers.household === "couple" ? "married_couple" : "individual";
    const who = household === "married_couple" ? "a married couple" : "one person";
    const limit = thresholdValue("medicare_part_d_extra_help", "income_limit_2026", { household, region: "contiguous_us_dc" });
    return `We multiply this by 12 and compare it only with the published Extra Help income limit for ${who} in the contiguous U.S. and D.C.${limit ? `, ${centsLabel(limit)} a year` : ""}. Social Security and the VA calculate their own income amounts.`;
  }
  if (step.id === "savings") {
    const household = state.answers.household === "couple" ? "couple" : "individual";
    const extraHousehold = household === "couple" ? "married_couple" : "individual";
    const ssi = thresholdValue("ssi_federal", "resource_limit", { household });
    const extra = thresholdValue("medicare_part_d_extra_help", "resource_limit_2026", { household: extraHousehold, region: "contiguous_us_dc" });
    const va = thresholdValue("va_veterans_pension", "net_worth_limit", {});
    return `We compare this amount with the published SSI resource limit${ssi ? ` (${centsLabel(ssi)})` : ""}, the Extra Help resource limit${extra ? ` (${centsLabel(extra)})` : ""}, and the VA pension net-worth limit${va ? ` (${centsLabel(va)})` : ""}.`;
  }
  return "Choose I'm not sure if you do not know. That leaves the check unresolved.";
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    answers: state.answers,
    textSize: state.textSize,
    contrast: state.contrast,
  }));
}

function applySettings() {
  document.documentElement.dataset.text = state.textSize;
  document.documentElement.dataset.contrast = state.contrast ? "high" : "default";
  document.querySelectorAll("[data-text-size]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.textSize === state.textSize));
  });
  document.getElementById("contrast").checked = state.contrast;
}

function show(screen) {
  for (const id of ["landing", "intake", "results", "detail", "checklist"]) {
    document.getElementById(id).hidden = id !== screen;
  }
  document.body.dataset.screen = screen;
  document.getElementById("main").focus({ preventScroll: true });
}

function route() {
  const [screen = "landing", id = ""] = location.hash.replace(/^#\/?/, "").split("/");
  const known = ["landing", "intake", "results", "detail", "checklist"];
  const next = known.includes(screen) ? screen : "landing";
  if ((next === "results" || next === "detail" || next === "checklist") && !state.programs.length) {
    show("landing");
    return;
  }
  show(next);
  if (next === "intake") renderIntake(id);
  if (next === "results") renderResults();
  if (next === "detail") renderDetail(id);
  if (next === "checklist") renderChecklist();
}

function go(screen, id = "") {
  location.hash = id ? `#/${screen}/${id}` : `#/${screen}`;
}

function results() {
  return matchPrograms(state.programs, state.answers, todayIso());
}

function choiceOptions(step) {
  const options = typeof step.options === "function" ? step.options(state.answers) : step.options;
  return options;
}

function renderIntake(requestedId) {
  const steps = visibleSteps();
  const step = steps.find((item) => item.id === requestedId) || steps[0];
  const index = Math.max(0, steps.findIndex((item) => item.id === step.id));
  document.getElementById("step-count").textContent = `Step ${index + 1} of ${steps.length}: Basic profile`;
  document.getElementById("progress-bar").style.width = `${Math.round(((index + 1) / steps.length) * 100)}%`;

  const list = el("ol", { class: "step-list" });
  steps.forEach((item, itemIndex) => {
    const marker = itemIndex < index ? "✓" : String(itemIndex + 1);
    list.append(el("li", { class: item.id === step.id ? "current" : itemIndex < index ? "done" : "" }, [
      el("span", { class: "step-num" }, [marker]),
      item.label,
    ]));
  });
  const aside = document.getElementById("step-list");
  aside.replaceChildren(el("h2", {}, ["Intake checklist"]), list);

  const question = document.getElementById("question");
  const error = el("p", { class: "error", id: "step-error" });
  const body = [el("h2", {}, [step.title]), el("p", { class: "hint" }, [stepHint(step)])];
  body.push(fieldFor(step));
  body.push(error);
  const isLast = index === steps.length - 1;
  body.push(el("div", { class: "actions" }, [
    el("button", { class: "btn btn-secondary", type: "button", on: { click: () => index === 0 ? go("landing") : go("intake", steps[index - 1].id) } }, ["Back"]),
    el("button", { class: "btn btn-primary", type: "button", on: { click: () => continueFrom(step, steps, index) } }, [isLast ? "See results" : "Continue"]),
  ]));
  question.replaceChildren(...body);
  question.querySelector("input, select, button.choice")?.focus();
}

function fieldFor(step) {
  if (step.kind === "number" || step.kind === "months") {
    const key = step.kind === "months" ? "disabilityMonths" : step.key;
    const input = el("input", { id: key, inputmode: "numeric", min: String(step.min ?? 0), max: String(step.max ?? 600), type: "number", value: state.answers[key] ?? "" });
    input.addEventListener("input", () => {
      const raw = input.value.trim();
      if (step.kind === "months") {
        if (raw === "") delete state.answers.disabilityMonths;
        else {
          state.answers.disabilityKnown = true;
          state.answers.disabilityMonths = Number(raw);
        }
      } else if (raw === "") delete state.answers[key];
      else state.answers[key] = Number(raw);
      save();
    });
    const wrap = el("div", { class: "field" }, [input, el("span", {}, [step.suffix || "months"])]);
    if (step.kind !== "months") return wrap;
    return el("div", { class: "stack" }, [wrap, unsureButton("disabilityKnown", "I have not received them, or I'm not sure", () => {
      state.answers.disabilityKnown = false;
      delete state.answers.disabilityMonths;
    })]);
  }
  if (step.kind === "money") {
    const input = el("input", { id: step.key, inputmode: "decimal", min: "0", step: "0.01", type: "number", value: state.answers[step.known] === true ? state.answers[step.key] : "" });
    input.addEventListener("input", () => {
      const raw = input.value.trim();
      if (raw === "") {
        delete state.answers[step.key];
        delete state.answers[step.known];
      } else {
        state.answers[step.known] = true;
        state.answers[step.key] = Number(raw);
      }
      save();
    });
    return el("div", { class: "stack" }, [
      el("div", { class: "field" }, [el("span", {}, ["$"]), input]),
      unsureButton(step.known, "I'm not sure", () => {
        state.answers[step.known] = false;
        delete state.answers[step.key];
      }),
    ]);
  }
  if (step.kind === "state") {
    const select = el("select", { class: "field", id: "state" }, [el("option", { value: "" }, ["Select a state"])]);
    for (const [code, name] of STATES) {
      const option = el("option", { value: code }, [name]);
      if (state.answers.state === code) option.selected = true;
      select.append(option);
    }
    select.addEventListener("change", () => {
      if (select.value) state.answers.state = select.value;
      else delete state.answers.state;
      save();
    });
    return select;
  }
  if (step.kind === "yesno") {
    return el("div", { class: "choices", role: "group" }, [
      ["Yes", true],
      ["No", false],
      ["I'm not sure", null],
    ].map(([label, value]) => choiceButton(step.key, value, label)));
  }
  return el("div", { class: "choices", role: "group" }, choiceOptions(step).map(([value, label]) => choiceButton(step.key, value, label)));
}

function choiceButton(key, value, label) {
  const pressed = hasKey(key) && state.answers[key] === value;
  return el("button", {
    class: "choice",
    type: "button",
    "aria-pressed": String(pressed),
    on: { click: () => { state.answers[key] = value; save(); route(); } },
  }, [label]);
}

function unsureButton(knownKey, label, apply) {
  const pressed = state.answers[knownKey] === false;
  return el("button", {
    class: "choice",
    type: "button",
    "aria-pressed": String(pressed),
    on: { click: () => { apply(); save(); route(); } },
  }, [label]);
}

function continueFrom(step, steps, index) {
  if (!stepAnswered(step)) {
    document.getElementById("step-error").textContent = "Choose an answer to continue.";
    return;
  }
  save();
  if (index === steps.length - 1) go("results");
  else go("intake", steps[index + 1].id);
}

function reasonLine(item) {
  if (item.result === "potential_match") return humanizeReason(item.supported_reasons[0] || "The documented conditions in this screen were met.");
  if (item.result === "fails_documented_condition") return humanizeReason(item.failed_reasons[0] || "A documented condition was not met.", true);
  return humanizeCheck(item.unresolved_checks[0] || "More information is needed.");
}

function inFilter(result) {
  if (state.filter === "all") return true;
  if (state.filter === "medicare") return result.family === "medicare" || result.family === "extra_help";
  return result.family === state.filter;
}

function renderResults() {
  const matched = results();
  const root = document.getElementById("results");
  const intro = [
    el("h1", {}, ["Your results"]),
    el("p", { class: "lede" }, ["Eight federal programs were checked with the answers saved in this browser. A possible match is worth a closer look. It is not an agency decision."]),
    el("div", { class: "toolbar no-print" }, [
      el("button", { class: "btn btn-primary", type: "button", on: { click: () => go("checklist") } }, ["Open checklist"]),
      el("button", { class: "btn btn-secondary", type: "button", on: { click: () => go("intake", visibleSteps()[0].id) } }, ["Edit answers"]),
      el("button", { class: "btn btn-secondary", type: "button", on: { click: resetAnswers } }, ["Start over"]),
    ]),
    el("div", { class: "filters", role: "group", "aria-label": "Filter programs" }, FILTERS.map(([id, label]) => el("button", {
      class: "choice",
      type: "button",
      "aria-pressed": String(state.filter === id),
      on: { click: () => { state.filter = id; renderResults(); } },
    }, [label]))),
  ];
  const groups = GROUPS.map(([resultName, heading, badgeText, badge]) => {
    const items = matched.filter((item) => item.result === resultName && inFilter(item));
    const section = el("section", { class: "group" }, [el("h2", {}, [`${heading} (${items.length})`])]);
    if (!items.length) section.append(el("p", { class: "hint" }, ["None in this group."]));
    for (const item of items) {
      section.append(el("article", { class: "card result-card" }, [
        el("span", { class: `badge ${badge}` }, [badgeText]),
        el("h3", {}, [item.name]),
        el("p", {}, [reasonLine(item)]),
        el("a", { href: `#/detail/${item.program_id}` }, ["See full details"]),
      ]));
    }
    return section;
  });
  root.replaceChildren(...intro, ...groups);
}

function renderDetail(programId) {
  const item = results().find((entry) => entry.program_id === programId);
  const root = document.getElementById("detail");
  if (!item) {
    root.replaceChildren(el("p", {}, ["That program is not in this screening."]), el("a", { href: "#/results" }, ["Back to results"]));
    return;
  }
  const badge = GROUPS.find(([name]) => name === item.result);
  const badgeClass = badge[3];
  const badgeText = badge[2];
  const blocks = [
    el("p", { class: "no-print" }, [el("a", { href: "#/results" }, ["Back to results"])]),
    el("span", { class: `badge ${badgeClass}` }, [badgeText]),
    el("h1", {}, [item.name]),
    el("p", { class: "lede" }, [item.summary]),
  ];
  if (item.supported_reasons.length) {
    blocks.push(el("section", { class: "stack" }, [el("h2", {}, ["What the screen could check"]), ...item.supported_reasons.map((reason) => el("p", {}, [humanizeReason(reason)]))]));
  }
  if (item.failed_reasons.length) {
    blocks.push(el("section", { class: "stack" }, [el("h2", {}, ["Documented condition not met"]), ...item.failed_reasons.map((reason) => el("p", {}, [humanizeReason(reason, true)]))]));
  }
  if (item.unresolved_checks.length) {
    blocks.push(el("section", { class: "stack" }, [el("h2", {}, ["Still needs an answer"]), ...item.unresolved_checks.map((check) => el("p", {}, [humanizeCheck(check)]))]));
  }
  if (item.follow_up.length) {
    blocks.push(el("section", { class: "stack" }, [el("h2", {}, ["Follow-up"]), ...item.follow_up.map((step) => el("p", {}, [step.description]))]));
  }
  if (item.evidence.length) {
    const links = item.evidence.map((piece) => el("li", {}, [el("a", { href: piece.url, target: "_blank", rel: "noreferrer" }, [piece.locator])]));
    blocks.push(el("section", {}, [el("h2", {}, ["Sources"]), el("ul", {}, links)]));
  }
  blocks.push(el("p", {}, [el("a", { class: "btn btn-primary", href: item.application_url, target: "_blank", rel: "noreferrer" }, ["Official application or program page"])]));
  root.replaceChildren(...blocks);
}

function renderChecklist() {
  const matched = state.programs.length ? results() : [];
  const root = document.getElementById("checklist");
  const blocks = [
    el("h1", {}, ["Your checklist"]),
    el("p", { class: "lede" }, ["Follow-up for possible matches, and the missing facts for programs that are still unknown. Programs that fail a documented condition are left off this list."]),
    el("button", { class: "btn btn-primary no-print", type: "button", on: { click: () => window.print() } }, ["Print or save PDF"]),
    el("p", { class: "no-print" }, [el("a", { href: "#/results" }, ["Back to results"])]),
  ];
  const matches = matched.filter((item) => item.result === "potential_match");
  const unknowns = matched.filter((item) => item.result === "unknown");
  blocks.push(sectionList("Possible matches", matches, (item) => {
    const lines = item.follow_up.length ? item.follow_up.map((step) => step.description) : ["Review the official page and ask the agency to confirm this screen."];
    return [...lines.map((line) => el("li", {}, [line])), el("li", {}, [el("a", { href: item.application_url, target: "_blank", rel: "noreferrer" }, [item.application_url])])];
  }));
  blocks.push(sectionList("Still needs an answer", unknowns, (item) => item.unresolved_checks.map((check) => el("li", {}, [humanizeCheck(check)]))));
  if (!matches.length && !unknowns.length) blocks.push(el("p", {}, ["Nothing to list."]));
  root.replaceChildren(...blocks);
}

function sectionList(title, items, lines) {
  const section = el("section", {}, [el("h2", {}, [title])]);
  if (!items.length) {
    section.append(el("p", { class: "hint" }, ["None."]));
    return section;
  }
  for (const item of items) {
    section.append(el("div", { class: "check-block" }, [el("h3", {}, [item.name]), el("ul", {}, lines(item))]));
  }
  return section;
}

function resetAnswers() {
  if (!window.confirm("Clear the answers saved in this browser?")) return;
  state.answers = {};
  save();
  go("landing");
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.answers = saved.answers || {};
    state.textSize = saved.textSize || "100";
    state.contrast = Boolean(saved.contrast);
  } catch {
    state.answers = {};
  }
  applySettings();
}

async function loadPrograms() {
  const documents = await Promise.all(PROGRAM_IDS.map(async (id) => {
    const response = await fetch(`data/${id}.json`);
    if (!response.ok) throw new Error(id);
    return response.json();
  }));
  state.programs = documents;
  renderProgramSummaries();
}

function renderProgramSummaries() {
  const list = document.getElementById("program-summaries");
  list.replaceChildren(...state.programs.map((program) => el("li", {}, [
    el("h3", {}, [program.name]),
    el("p", {}, [program.summary]),
  ])));
}

document.getElementById("start").addEventListener("click", () => {
  if (!state.programs.length) {
    window.alert(state.loadError || "The program files are still loading.");
    return;
  }
  go("intake", visibleSteps()[0].id);
});

document.querySelectorAll("[data-text-size]").forEach((button) => {
  button.addEventListener("click", () => {
    state.textSize = button.dataset.textSize;
    applySettings();
    save();
  });
});

document.getElementById("contrast").addEventListener("change", (event) => {
  state.contrast = event.target.checked;
  applySettings();
  save();
});

window.addEventListener("hashchange", route);
window.addEventListener("beforeprint", () => {
  if (state.programs.length) renderChecklist();
  document.getElementById("checklist").hidden = false;
});
window.addEventListener("afterprint", route);

loadSettings();
loadPrograms().then(route).catch(() => {
  state.loadError = "The program files could not be loaded.";
  const list = document.getElementById("program-summaries");
  if (list && !list.childElementCount) list.textContent = state.loadError;
});
document.getElementById("main").tabIndex = -1;
