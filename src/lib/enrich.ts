import { preferredSpecialty, urgencyFor } from "./loop";
import type { CareCase, Specialty, Urgency } from "../types";
import type { ImportRow } from "./importCsv";

export type Enrichment = {
  include: boolean;
  urgency: Urgency;
  specialty: Specialty;
  slaHours: number;
  priorityReason: string;
  boardNote: string;
  /** Enrichment decides this — not the CSV author. */
  classifiedFlag: "actionable" | "borderline" | "normal";
  /** Normalized signals taken from any extra CSV columns. */
  signals: Record<string, string | number | boolean>;
};

const YES = /^(y|yes|true|1|on)$/i;

function metric(row: ImportRow, ...keys: string[]): string {
  for (const key of keys) {
    const hit = row.metrics[key] ?? row.metrics[key.toLowerCase()];
    if (hit != null && String(hit).trim() !== "") return String(hit).trim();
  }
  return "";
}

function num(row: ImportRow, ...keys: string[]): number {
  const raw = metric(row, ...keys);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function flag(row: ImportRow, ...keys: string[]): boolean {
  return YES.test(metric(row, ...keys));
}

function parseNumber(value: string): number | null {
  const m = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Enrichment classifies the finding from value + code.
 * No CSV flag column — decision is made here.
 */
export function classifyFinding(row: ImportRow): {
  flag: Enrichment["classifiedFlag"];
  reason: string;
} {
  const { result } = row;
  const raw = result.value.trim();
  const lower = raw.toLowerCase();

  switch (result.code) {
    case "fit": {
      if (/pos|abnormal|positive|detect| occult|blood/.test(lower)) {
        return { flag: "actionable", reason: "FIT positive — cancer-path follow-up needed" };
      }
      if (/neg|normal|clear/.test(lower)) {
        return { flag: "normal", reason: "FIT negative — no closed loop" };
      }
      break;
    }
    case "bp": {
      const parts = raw.split(/[\/\s]+/).map((p) => parseNumber(p)).filter((n): n is number => n != null);
      const sys = parts[0];
      const dia = parts[1];
      if (sys != null) {
        if (sys >= 140 || (dia != null && dia >= 90)) {
          return {
            flag: "actionable",
            reason: `BP ${raw} meets high-pressure follow-up threshold`,
          };
        }
        if (sys >= 130 || (dia != null && dia >= 80)) {
          return {
            flag: "borderline",
            reason: `BP ${raw} is elevated but below closed-loop threshold`,
          };
        }
        return { flag: "normal", reason: `BP ${raw} within routine range` };
      }
      break;
    }
    case "hba1c": {
      const n = parseNumber(raw);
      if (n != null) {
        if (n >= 6.5) return { flag: "actionable", reason: `HbA1c ${n}% is in actionable range` };
        if (n >= 5.7) return { flag: "borderline", reason: `HbA1c ${n}% is prediabetes-range — monitor, no loop` };
        return { flag: "normal", reason: `HbA1c ${n}% within routine range` };
      }
      break;
    }
    case "ldl": {
      const n = parseNumber(raw);
      if (n != null) {
        // Treat as mmol/L (Abu Dhabi labs); also allow mg/dL-style highs
        if (n >= 4.1 || n >= 160) {
          return { flag: "actionable", reason: `LDL ${raw} needs clinical follow-up` };
        }
        if (n >= 3.4 || (n >= 130 && n < 160)) {
          return { flag: "borderline", reason: `LDL ${raw} borderline — no closed loop` };
        }
        return { flag: "normal", reason: `LDL ${raw} within routine range` };
      }
      break;
    }
    case "bmi": {
      const n = parseNumber(raw);
      if (n != null) {
        if (n >= 30) return { flag: "actionable", reason: `BMI ${n} obesity-range — loop for lifestyle care` };
        if (n >= 25) return { flag: "borderline", reason: `BMI ${n} overweight — no closed loop` };
        return { flag: "normal", reason: `BMI ${n} within routine range` };
      }
      break;
    }
    case "moca": {
      const n = parseNumber(raw);
      if (n != null) {
        if (n <= 25) return { flag: "actionable", reason: `MoCA ${n} needs timed brain-health review` };
        if (n <= 27) return { flag: "borderline", reason: `MoCA ${n} borderline — no closed loop` };
        return { flag: "normal", reason: `MoCA ${n} within routine range` };
      }
      break;
    }
    case "vision": {
      if (/fail|refer|abnormal|poor|unsatisfactory/.test(lower)) {
        return { flag: "actionable", reason: "Vision screen failed — specialty follow-up" };
      }
      if (/pass|normal|ok|clear/.test(lower)) {
        return { flag: "normal", reason: "Vision screen passed — no closed loop" };
      }
      break;
    }
  }

  // Unknown value → open a loop so nothing actionable is dropped silently
  return {
    flag: "actionable",
    reason: `${result.labelEn} ${raw} needs coordinator review (value not auto-classified)`,
  };
}

/**
 * Enrich one imported finding into board routing fields.
 * Classification + urgency are decided here from the data — not pre-labeled by the CSV.
 */
export function enrichRow(row: ImportRow): Enrichment {
  const { result, patient } = row;

  const days = num(row, "days_waiting", "wait_days", "waiting_days", "days_open", "sla_age_days");
  const noShows = num(row, "prior_no_shows", "no_shows", "noshows", "missed_visits");
  const wearable = flag(row, "wearable_flag", "wearable", "device_alert", "cgm_alert");
  const family = flag(row, "family_risk", "family_history", "fhx", "family_hx");
  const social = flag(row, "social_risk", "transport_barrier", "hard_to_reach");
  const notes = metric(row, "notes", "note", "comment", "reason");

  const classified = classifyFinding(row);

  const signals: Enrichment["signals"] = {
    days_waiting: days,
    prior_no_shows: noShows,
    wearable,
    family_risk: family,
    social_risk: social,
    network: patient.network,
    program: result.program,
    classified_flag: classified.flag,
  };
  if (notes) signals.notes = notes;

  for (const [key, value] of Object.entries(row.metrics)) {
    if (key in signals || !value) continue;
    if (YES.test(value)) signals[key] = true;
    else if (value !== "" && Number.isFinite(Number(value))) signals[key] = Number(value);
    else signals[key] = value;
  }

  // Apply enrichment decision onto the result object used by the board
  result.flag = classified.flag;

  if (classified.flag !== "actionable") {
    return {
      include: false,
      urgency: "routine",
      specialty: preferredSpecialty(result),
      slaHours: 168,
      priorityReason: classified.reason,
      boardNote: `Skipped — enrichment classified ${classified.flag}`,
      classifiedFlag: classified.flag,
      signals,
    };
  }

  const draft: CareCase = {
    id: `case-${result.id}`,
    patientId: patient.id,
    resultId: result.id,
    stage: "result_in",
    urgency: "routine",
    specialty: preferredSpecialty(result),
    ownerId: null,
    slotId: null,
    slaHours: 96,
    openedAt: `${result.recordedAt}T09:00`,
    toldAt: null,
    ownedAt: null,
    bookedAt: null,
    seenAt: null,
    verifiedAt: null,
    lostAt: null,
    lostReason: null,
    visitNote: null,
    aiPriorityReason: null,
    consentShare: true,
  };

  let urgency = urgencyFor(result, draft);
  let slaHours = urgency === "urgent" ? 48 : urgency === "soon" ? 72 : 120;
  const reasons: string[] = [classified.reason];

  if (result.code === "fit") reasons.push("Cancer-path FIT needs timed diagnostic follow-up");
  if (result.code === "bp") reasons.push("Marked blood-pressure finding");
  if (result.code === "moca") reasons.push("Brain-health screen needs timed clinical review");
  if (result.code === "vision") reasons.push("Vision screen needs timed specialty review");

  if (days >= 14) {
    reasons.push(`${days} days waiting since result`);
    if (urgency === "routine") urgency = "soon";
    slaHours = Math.min(slaHours, 48);
  } else if (days >= 7 && urgency === "routine") {
    urgency = "soon";
    reasons.push(`${days} days waiting`);
  }

  if (noShows >= 1) reasons.push(`${noShows} prior no-show(s) — retention risk`);
  if (wearable) reasons.push("Wearable / device context supports earlier outreach");
  if (family) reasons.push("Family risk flag in extract");
  if (social) {
    reasons.push("Social / access barrier flagged");
    slaHours = Math.min(slaHours, 72);
  }

  if (result.code === "fit" || (result.code === "bp" && days >= 10)) urgency = "urgent";
  if (urgency === "urgent") slaHours = Math.min(slaHours, 48);

  return {
    include: true,
    urgency,
    specialty: preferredSpecialty(result),
    slaHours,
    priorityReason: [...new Set(reasons)].join("; "),
    boardNote: `Place on board as ${urgency}`,
    classifiedFlag: "actionable",
    signals,
  };
}

export function enrichmentToCase(row: ImportRow, enrichment: Enrichment): CareCase {
  return {
    id: `case-${row.result.id}`,
    patientId: row.patient.id,
    resultId: row.result.id,
    stage: "result_in",
    urgency: enrichment.urgency,
    specialty: enrichment.specialty,
    ownerId: null,
    slotId: null,
    slaHours: enrichment.slaHours,
    openedAt: `${row.result.recordedAt}T09:00`,
    toldAt: null,
    ownedAt: null,
    bookedAt: null,
    seenAt: null,
    verifiedAt: null,
    lostAt: null,
    lostReason: null,
    visitNote: null,
    aiPriorityReason: enrichment.priorityReason,
    consentShare: true,
    noShowCount: 0,
    referral: {
      branch: "undecided",
      specialty: null,
      slotId: null,
      bookedAt: null,
      doneAt: null,
      note: null,
    },
  };
}
