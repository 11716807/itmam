import { resultById } from "../data/seed";
import type { CareCase, LoopStage } from "../types";
import type { LoopAgentSuggestion } from "./loopAgents/types";
import { hoursOpen } from "./loop";
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
  /** One-line why this clinician was ranked first. */
  ownerWhy?: string;
  slotId?: string;
  slotLabel?: string;
  /** One-line why this slot was ranked first. */
  slotWhy?: string;
  /** Recommended pathway when stage is seen. */
  outcome?: "direct_close" | "confirmatory" | "verify";
  outcomeLabel?: string;
  outcomeWhy?: string;
  steps: LoopAssistStep[];
  /** Agent / guardrail status for the active assist step. */
  llmStatus?: LoopAgentSuggestion["status"];
  llmModel?: string;
  llmDetail?: string;
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

/**
 * Sync scaffold for stage labels / step rail. Picks (owner, slot, draft, outcome)
 * come from loop agents via mergeLoopSuggestion — never hardcoded rankings.
 */
export function buildLoopAssist(care: CareCase): LoopAssist {
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
      llmStatus: "ready",
    };
  }
  if (care.stage === "lost") {
    return {
      actionLabel: "Review lost reason",
      boardLine: "Lost · review",
      reason: "Documented gap stays visible — restart only if clinically appropriate.",
      agent: "outcomeGate",
      steps,
      llmStatus: "ready",
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
      llmStatus: "ready",
    };
  }

  if (care.stage === "stratified") {
    return {
      actionLabel: sla.status === "breached" ? "Tell patient now" : "Tell patient",
      boardLine: "Tell · drafting…",
      reason: "Draft tell agent is writing calm Sahhatna copy — you still press Send.",
      agent: "draftTell",
      steps,
      llmStatus: "loading",
    };
  }

  if (care.stage === "told") {
    return {
      actionLabel: "Assign clinician",
      boardLine: "Own · matching…",
      reason: "Match owner agent is ranking the live clinician roster with guardrails.",
      agent: "matchOwner",
      steps,
      llmStatus: "loading",
    };
  }

  if (care.stage === "owned") {
    return {
      actionLabel: "Book visit",
      boardLine: "Book · matching…",
      reason: "Suggest slot agent is choosing among network-safe times with guardrails.",
      agent: "suggestSlot",
      steps,
      llmStatus: "loading",
    };
  }

  if (care.stage === "booked") {
    return {
      actionLabel: "Record visit",
      boardLine: "Visit · attend?",
      reason: "Confirm attendance, reschedule, or mark no-show. Assist never closes alone.",
      agent: "suggestSlot",
      steps,
      llmStatus: "ready",
    };
  }

  return {
    actionLabel: "Choose pathway",
    boardLine: "Outcome · deciding…",
    reason: "Outcome agent is recommending a pathway — confirm to apply.",
    agent: "outcomeGate",
    steps,
    llmStatus: "loading",
  };
}

/** Merge a completed (or failed) loop-agent result into the sync scaffold. */
export function mergeLoopSuggestion(
  base: LoopAssist,
  suggestion: LoopAgentSuggestion | null,
): LoopAssist {
  if (!suggestion) return base;

  const next: LoopAssist = {
    ...base,
    llmStatus: suggestion.status,
    llmModel: suggestion.model,
    llmDetail: suggestion.detail,
    reason: suggestion.detail || base.reason,
  };

  if (suggestion.status !== "ready") {
    if (suggestion.agent === "matchOwner") {
      next.boardLine = suggestion.status === "loading" ? "Own · matching…" : "Own · pick manually";
      next.actionLabel = "Assign clinician";
    } else if (suggestion.agent === "suggestSlot" && base.agent === "suggestSlot") {
      next.boardLine =
        suggestion.status === "loading" ? "Book · matching…" : "Book · pick manually";
    } else if (suggestion.agent === "draftTell") {
      next.boardLine = suggestion.status === "loading" ? "Tell · drafting…" : "Tell · write manually";
    } else if (suggestion.agent === "outcomeGate") {
      next.boardLine =
        suggestion.status === "loading" ? "Outcome · deciding…" : "Outcome · choose";
    }
    return next;
  }

  if (suggestion.agent === "draftTell" && suggestion.draftMessage) {
    next.draftMessage = suggestion.draftMessage;
    next.boardLine = "Tell · draft ready";
    next.reason = suggestion.why
      ? `${suggestion.detail} Why · ${suggestion.why}`
      : suggestion.detail;
  }

  if (suggestion.agent === "matchOwner" && suggestion.pickId) {
    next.ownerId = suggestion.pickId;
    next.ownerLabel = suggestion.pickLabel;
    next.ownerWhy = suggestion.why;
    next.actionLabel = suggestion.pickLabel
      ? `Assign ${suggestion.pickLabel.split(" · ")[0].split(" ")[0]}`
      : "Assign clinician";
    next.boardLine = suggestion.pickLabel
      ? `Own · ${suggestion.pickLabel.split(" · ")[0].split(" ")[0]}`
      : "Assign owner";
    next.reason = suggestion.why
      ? `${suggestion.detail} Why · ${suggestion.why}`
      : suggestion.detail;
  }

  if (suggestion.agent === "suggestSlot" && suggestion.pickId) {
    next.slotId = suggestion.pickId;
    next.slotLabel = suggestion.pickLabel;
    next.slotWhy = suggestion.why;
    next.actionLabel = "Book suggested slot";
    const when = suggestion.pickLabel?.split(" · ")[0] || "";
    next.boardLine = when ? `Book · ${when.slice(5, 16)}` : "Book visit";
    next.reason = suggestion.why
      ? `${suggestion.detail} Why · ${suggestion.why}`
      : suggestion.detail;
  }

  if (suggestion.agent === "outcomeGate" && suggestion.outcome) {
    next.outcome = suggestion.outcome;
    next.outcomeLabel = suggestion.pickLabel;
    next.outcomeWhy = suggestion.why;
    next.actionLabel = suggestion.pickLabel || "Choose pathway";
    next.boardLine = suggestion.pickLabel || "Choose pathway";
    next.reason = suggestion.why
      ? `${suggestion.detail} Why · ${suggestion.why}`
      : suggestion.detail;
  }

  return next;
}

export { AGENT_LABEL, activeAgent };
