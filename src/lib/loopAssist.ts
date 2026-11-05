import { clinicianById, patientById, resultById } from "../data/seed";
import type { CareCase, Clinician, LoopStage, ScreeningResult, Slot } from "../types";
import { localBrief } from "./ai";
import { compatibleSlots, hoursOpen, ownerCandidates } from "./loop";
import { confirmatorySpecialty, referralOf } from "./pathway";
import { planSlaRecovery } from "./slaAction";

export type LoopAssistAgentId =
  | "watch"
  | "draftTell"
  | "matchOwner"
  | "suggestSlot"
  | "outcomeGate";

export type LoopAssistStep = {
  id: LoopAssistAgentId;
  label: string;
  status: "done" | "now" | "soon";
};

export type LoopAssist = {
  actionLabel: string;
  reason: string;
  agent: LoopAssistAgentId;
  /** Short board-side line (keeps rows calm). */
  boardLine: string;
  draftMessage?: string;
  ownerId?: string;
  ownerLabel?: string;
  slotId?: string;
  slotLabel?: string;
  /** Recommended pathway when stage is seen. */
  outcome?: "direct_close" | "confirmatory" | "verify";
  outcomeLabel?: string;
  steps: LoopAssistStep[];
};

const AGENT_ORDER: LoopAssistAgentId[] = [
  "watch",
  "draftTell",
  "matchOwner",
  "suggestSlot",
  "outcomeGate",
];

const AGENT_LABEL: Record<LoopAssistAgentId, string> = {
  watch: "Watch",
  draftTell: "Draft tell",
  matchOwner: "Match owner",
  suggestSlot: "Suggest slot",
  outcomeGate: "Outcome",
};

function activeAgent(stage: LoopStage): LoopAssistAgentId {
  switch (stage) {
    case "result_in":
      return "watch";
    case "stratified":
      return "draftTell";
    case "told":
      return "matchOwner";
    case "owned":
    case "booked":
      return "suggestSlot";
    case "seen":
    case "verified":
    case "lost":
      return "outcomeGate";
    default:
      return "watch";
  }
}

function stepsFor(stage: LoopStage): LoopAssistStep[] {
  const now = activeAgent(stage);
  const nowIdx = AGENT_ORDER.indexOf(now);
  const closed = stage === "verified" || stage === "lost";
  return AGENT_ORDER.map((id, i) => ({
    id,
    label: AGENT_LABEL[id],
    status: closed ? "done" : i < nowIdx ? "done" : i === nowIdx ? "now" : "soon",
  }));
}

function pickOwner(care: CareCase): {
  owner?: Clinician;
} {
  const patient = patientById(care.patientId);
  const list = ownerCandidates(care.specialty, patient.network);
  if (!list.length) return {};
  // Prefer exact specialty match, then first on network.
  const exact = list.find((c) => c.specialty === care.specialty);
  return { owner: exact || list[0] };
}

function pickSlot(
  care: CareCase,
  ownerId?: string | null,
): { slot?: Slot; clinician?: Clinician } {
  const patient = patientById(care.patientId);
  const slots = compatibleSlots(care.specialty, patient.network, ownerId || care.ownerId);
  if (!slots.length) return {};
  // Earliest chronologically.
  const sorted = [...slots].sort((a, b) => a.when.localeCompare(b.when));
  const slot = sorted[0];
  return { slot, clinician: clinicianById(slot.clinicianId) };
}

function specialtyWords(value: string) {
  return value.replaceAll("_", " ");
}

function recommendOutcome(
  care: CareCase,
  result: ScreeningResult,
): { outcome: "direct_close" | "confirmatory" | "verify"; label: string; reason: string } {
  const ref = referralOf(care);
  if (ref.branch === "direct_close" || (ref.branch === "confirmatory" && ref.doneAt)) {
    return {
      outcome: "verify",
      label: "Verify outcome",
      reason: "Visit path is complete — assist recommends verify to close the loop.",
    };
  }
  if (ref.branch === "confirmatory" && !ref.bookedAt) {
    return {
      outcome: "confirmatory",
      label: "Book confirmatory",
      reason: "Confirmatory branch already chosen — book the referral slot.",
    };
  }
  // FIT / marked BP / MoCA often need confirmatory; metabolic often direct-close for demo.
  const preferConfirm =
    result.code === "fit" ||
    result.code === "moca" ||
    (result.code === "bp" && care.urgency === "urgent");
  if (preferConfirm) {
    const spec = confirmatorySpecialty(result.code);
    return {
      outcome: "confirmatory",
      label: `Refer · ${specialtyWords(spec)}`,
      reason: `${result.labelEn} often needs a confirmatory path — assist suggests branch, not silent close.`,
    };
  }
  return {
    outcome: "direct_close",
    label: "Close without referral",
    reason: "Screening follow-up can close on the main path after visit — confirm to verify.",
  };
}

/**
 * Rules-first loop assist. Proposes next human action — never auto-tells,
 * auto-books, or auto-verifies.
 */
export function buildLoopAssist(care: CareCase): LoopAssist {
  const patient = patientById(care.patientId);
  const result = resultById(care.resultId);
  const sla = planSlaRecovery(care, result);
  const steps = stepsFor(care.stage);
  const openHours = hoursOpen(care);

  if (care.stage === "verified") {
    return {
      actionLabel: "Loop closed",
      boardLine: "Verified",
      reason: "Assist has nothing left — visit outcome is verified.",
      agent: "outcomeGate",
      steps,
    };
  }
  if (care.stage === "lost") {
    return {
      actionLabel: "Review lost reason",
      boardLine: "Lost · review",
      reason: "Documented gap stays visible — restart only if clinically appropriate.",
      agent: "outcomeGate",
      steps,
    };
  }

  if (care.stage === "result_in") {
    const label =
      sla.status === "breached" ? "Confirm priority now" : "Confirm priority";
    return {
      actionLabel: label,
      boardLine: label,
      reason:
        sla.status !== "ok"
          ? "Watch: lock priority first — then tell / own / book."
          : `Watch: ${result.labelEn} · ${openHours.toFixed(0)}h open · lock urgency before outreach.`,
      agent: "watch",
      steps,
    };
  }

  if (care.stage === "stratified") {
    const brief = localBrief(patient, result, care);
    return {
      actionLabel: sla.status === "breached" ? "Tell patient now" : "Tell patient",
      boardLine: "Tell · draft ready",
      reason:
        sla.status !== "ok"
          ? "Draft tell ready — send via Sahhatna; assist never auto-messages."
          : "Draft tell: calm Sahhatna copy ready — you still press Send.",
      agent: "draftTell",
      draftMessage: brief.patientMessageEn,
      steps,
    };
  }

  if (care.stage === "told") {
    const { owner } = pickOwner(care);
    return {
      actionLabel: owner ? `Assign ${owner.nameEn.split(" ")[0]}` : "Assign clinician",
      boardLine: owner ? `Own · ${owner.nameEn.split(" ")[0]}` : "Assign owner",
      reason: owner
        ? `Match owner: ${owner.nameEn} · ${specialtyWords(owner.specialty)} · ${owner.facility} (network-safe).`
        : "No clinician matches this specialty and network.",
      agent: "matchOwner",
      ownerId: owner?.id,
      ownerLabel: owner ? `${owner.nameEn} · ${specialtyWords(owner.specialty)}` : undefined,
      steps,
    };
  }

  if (care.stage === "owned") {
    const { slot, clinician } = pickSlot(care, care.ownerId);
    const when = slot ? slot.when.replace("T", " ") : "";
    return {
      actionLabel: slot ? "Book suggested slot" : "Book visit",
      boardLine: slot ? `Book · ${when.slice(5, 16)}` : "Book visit",
      reason: slot
        ? `Suggest slot: ${when} with ${clinician?.nameEn || "clinician"} on ${patient.network.replaceAll("_", " ")}.`
        : "No network-safe slot available for this pathway.",
      agent: "suggestSlot",
      slotId: slot?.id,
      slotLabel: slot
        ? `${when} · ${clinician?.nameEn || "clinician"}`
        : undefined,
      steps,
    };
  }

  if (care.stage === "booked") {
    return {
      actionLabel: "Record visit",
      boardLine: "Visit · attend?",
      reason: "Suggest slot held — confirm attendance, reschedule, or mark no-show. Assist never closes alone.",
      agent: "suggestSlot",
      steps,
    };
  }

  // seen
  const rec = recommendOutcome(care, result);
  return {
    actionLabel: rec.label,
    boardLine: rec.label,
    reason: rec.reason,
    agent: "outcomeGate",
    outcome: rec.outcome,
    outcomeLabel: rec.label,
    steps,
  };
}

export { AGENT_LABEL };
