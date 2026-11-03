import { hoursOpen, slaBreached } from "./loop";
import type { CareCase, LoopStage, ScreeningResult, Urgency } from "../types";
import { STAGE_LABEL } from "../types";

export type SlaStatus = "ok" | "approaching" | "breached";

export type SlaRecovery = {
  status: SlaStatus;
  hoursOpen: number;
  slaHours: number;
  hoursOver: number;
  /** Plain-language AI judgment for coordinators / judges. */
  verdict: string;
  /** Concrete next move — not just “look at it”. */
  actionLabel: string;
  /** Why AI chose this recovery step. */
  why: string;
  /** Stage the recovery is trying to unlock. */
  unlocks: string;
  /** Suggested urgency after breach (AI may escalate). */
  suggestedUrgency: Urgency;
};

function recoveryForStage(stage: LoopStage): Pick<SlaRecovery, "actionLabel" | "why" | "unlocks"> {
  switch (stage) {
    case "result_in":
      return {
        actionLabel: "Confirm priority now",
        why: "SLA clock started at result-in. AI routes this to the top of the board until priority is locked.",
        unlocks: "Prioritized",
      };
    case "stratified":
      return {
        actionLabel: "Tell patient via Sahhatna now",
        why: "Breach with patient still uninformed is the highest drop-off risk — AI forces outreach before booking.",
        unlocks: "Patient told",
      };
    case "told":
      return {
        actionLabel: "Assign visit clinician now",
        why: "Told but unowned past SLA — AI treats this as an accountability gap, not a messaging gap.",
        unlocks: "Owned",
      };
    case "owned":
      return {
        actionLabel: "Book network-safe slot now",
        why: "Owner exists but no visit time — AI recovers by booking on the patient’s insurance network.",
        unlocks: "Booked",
      };
    case "booked":
      return {
        actionLabel: "Confirm attendance or reschedule",
        why: "Slot is held past SLA — AI pushes confirm / reschedule / no-show loop so the visit does not silently expire.",
        unlocks: "Visit completed",
      };
    case "seen":
      return {
        actionLabel: "Verify outcome now",
        why: "Visit happened but loop still open past SLA — AI closes with verification, not another booking.",
        unlocks: "Verified",
      };
    case "verified":
      return {
        actionLabel: "No action",
        why: "Loop already closed.",
        unlocks: "Done",
      };
    case "lost":
      return {
        actionLabel: "Review lost reason",
        why: "Documented gap — restart only if clinically appropriate.",
        unlocks: "Restart",
      };
  }
}

/**
 * AI SLA recovery: breach is not a badge — it picks the stage-aware action
 * that restarts closed-loop progress.
 */
export function planSlaRecovery(
  care: CareCase,
  result: ScreeningResult,
  asOf?: string,
): SlaRecovery {
  const openH = hoursOpen(care, asOf);
  const breached = slaBreached(care, asOf);
  const approaching = !breached && openH > care.slaHours * 0.7;
  const status: SlaStatus = breached ? "breached" : approaching ? "approaching" : "ok";
  const hoursOver = breached ? Math.max(0, openH - care.slaHours) : 0;
  const step = recoveryForStage(care.stage);
  const finding = `${result.labelEn} ${result.value}${result.unit ? ` ${result.unit}` : ""}`;

  if (status === "ok") {
    return {
      status,
      hoursOpen: openH,
      slaHours: care.slaHours,
      hoursOver: 0,
      verdict: `Within SLA (${openH.toFixed(0)}h of ${care.slaHours}h) at “${STAGE_LABEL[care.stage].en}”.`,
      actionLabel: "Continue current step",
      why: "No escalation needed — keep the loop moving.",
      unlocks: STAGE_LABEL[care.stage].en,
      suggestedUrgency: care.urgency,
    };
  }

  if (status === "approaching") {
    return {
      status,
      hoursOpen: openH,
      slaHours: care.slaHours,
      hoursOver: 0,
      verdict: `Approaching SLA for ${finding} — ${openH.toFixed(0)}h open / ${care.slaHours}h limit.`,
      actionLabel: step.actionLabel,
      why: `AI pre-empts breach: at “${STAGE_LABEL[care.stage].en}”, the fastest recovery is “${step.actionLabel}”.`,
      unlocks: step.unlocks,
      suggestedUrgency: care.urgency === "routine" ? "soon" : care.urgency,
    };
  }

  return {
    status,
    hoursOpen: openH,
    slaHours: care.slaHours,
    hoursOver,
    verdict: `SLA breached for ${finding}: ${openH.toFixed(0)}h open (limit ${care.slaHours}h, +${hoursOver.toFixed(0)}h over). Stuck at “${STAGE_LABEL[care.stage].en}”.`,
    actionLabel: step.actionLabel,
    why: step.why,
    unlocks: step.unlocks,
    suggestedUrgency: "urgent",
  };
}
