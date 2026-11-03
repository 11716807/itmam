export type RiskWeightKey =
  | "fit"
  | "bp"
  | "moca"
  | "hba1c"
  | "noOwner"
  | "toldUnowned"
  | "notInformed"
  | "ownedNotBooked"
  | "slaBreached"
  | "approachingSla"
  | "urgencyUrgent"
  | "urgencySoon";

export type RiskWeights = Record<RiskWeightKey, number>;

export type RiskWeightRow = {
  key: RiskWeightKey;
  signal: string;
  hint: string;
};

export const RISK_WEIGHT_ROWS: RiskWeightRow[] = [
  { key: "fit", signal: "FIT (cancer-path)", hint: "Finding code = fit" },
  { key: "bp", signal: "BP", hint: "Finding code = bp" },
  { key: "moca", signal: "MoCA", hint: "Finding code = moca" },
  { key: "hba1c", signal: "HbA1c", hint: "Finding code = hba1c" },
  { key: "noOwner", signal: "No clinical owner", hint: "ownerId is empty" },
  {
    key: "toldUnowned",
    signal: "Told but still unowned",
    hint: "stage = told and no owner",
  },
  {
    key: "notInformed",
    signal: "Not yet informed",
    hint: "stage = result_in or prioritized",
  },
  {
    key: "ownedNotBooked",
    signal: "Owned but not booked",
    hint: "stage = owned and no slot",
  },
  { key: "slaBreached", signal: "SLA breached", hint: "hours open > SLA" },
  {
    key: "approachingSla",
    signal: "Approaching SLA (>70%)",
    hint: "hours open > 70% of SLA",
  },
  { key: "urgencyUrgent", signal: "Urgency = urgent", hint: "case.urgency" },
  { key: "urgencySoon", signal: "Urgency = soon", hint: "case.urgency" },
];

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  fit: 40,
  bp: 28,
  moca: 22,
  hba1c: 18,
  noOwner: 20,
  toldUnowned: 15,
  notInformed: 12,
  ownedNotBooked: 10,
  slaBreached: 25,
  approachingSla: 10,
  urgencyUrgent: 8,
  urgencySoon: 4,
};

const KEY = "itmam-risk-weights-v1";

export function loadRiskWeights(): RiskWeights {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_RISK_WEIGHTS };
    const parsed = JSON.parse(raw) as Partial<RiskWeights>;
    return { ...DEFAULT_RISK_WEIGHTS, ...sanitize(parsed) };
  } catch {
    return { ...DEFAULT_RISK_WEIGHTS };
  }
}

export function saveRiskWeights(weights: RiskWeights) {
  localStorage.setItem(KEY, JSON.stringify(sanitize(weights)));
}

export function resetRiskWeights(): RiskWeights {
  const next = { ...DEFAULT_RISK_WEIGHTS };
  saveRiskWeights(next);
  return next;
}

function sanitize(input: Partial<RiskWeights>): Partial<RiskWeights> {
  const out: Partial<RiskWeights> = {};
  for (const row of RISK_WEIGHT_ROWS) {
    const value = input[row.key];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[row.key] = Math.max(0, Math.min(200, Math.round(value)));
    }
  }
  return out;
}
