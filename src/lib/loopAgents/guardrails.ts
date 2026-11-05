import type { AgentGuardrailCheck, AgentGuardrailDef } from "../agents/guardrails";
import type { LoopAgentId } from "./types";

export const LOOP_AGENT_GUARDRAILS: Record<LoopAgentId, AgentGuardrailDef[]> = {
  watch: [
    { id: "no_auto_stage", rule: "Never advance the loop stage without a human click" },
    { id: "no_diagnosis", rule: "Do not diagnose or prescribe" },
    { id: "next_action_only", rule: "Only name the next coordinator action" },
  ],
  draftTell: [
    { id: "roster_bound", rule: "Message may use only facts from the case pack" },
    { id: "no_diagnosis", rule: "Do not diagnose, scare, or invent clinical claims" },
    { id: "human_sends", rule: "Draft only — never claim the message was sent" },
  ],
  matchOwner: [
    { id: "roster_only", rule: "Pick only an id from the provided clinician roster" },
    { id: "no_invent", rule: "Do not invent doctors, facilities, or networks" },
    { id: "why_required", rule: "One-line coordination why — not a diagnosis" },
  ],
  suggestSlot: [
    { id: "roster_only", rule: "Pick only an id from the provided slot roster" },
    { id: "no_invent", rule: "Do not invent times or clinicians" },
    { id: "why_required", rule: "One-line why this slot — coordination only" },
  ],
  outcomeGate: [
    { id: "allowed_outcomes", rule: "Outcome must be direct_close, confirmatory, or verify" },
    { id: "no_auto_verify", rule: "Never mark verified — only suggest" },
    { id: "no_diagnosis", rule: "Why must stay coordination-safe" },
  ],
};

const DIAGNOSIS_RE =
  /\b(diagnos|you have|prescribe|medication|cancer confirmed|definitely have|disease confirmed)\b/i;

function check(
  def: AgentGuardrailDef,
  status: AgentGuardrailCheck["status"],
  detail: string,
): AgentGuardrailCheck {
  return { ...def, status, detail };
}

export function evaluateLoopGuardrails(
  agent: LoopAgentId,
  ctx: {
    pickId?: string;
    why?: string;
    draftEn?: string;
    outcome?: string;
    allowedIds: string[];
  },
): { ok: boolean; checks: AgentGuardrailCheck[] } {
  const defs = LOOP_AGENT_GUARDRAILS[agent];
  const checks: AgentGuardrailCheck[] = [];

  if (agent === "matchOwner" || agent === "suggestSlot") {
    const roster = defs.find((d) => d.id === "roster_only")!;
    const invent = defs.find((d) => d.id === "no_invent")!;
    const whyDef = defs.find((d) => d.id === "why_required")!;
    const inRoster = Boolean(ctx.pickId && ctx.allowedIds.includes(ctx.pickId));
    checks.push(
      check(
        roster,
        inRoster ? "applied" : "breached",
        inRoster
          ? `Pick ${ctx.pickId} is on the provided roster`
          : ctx.pickId
            ? `Pick ${ctx.pickId} is not on the roster`
            : "No pickId returned",
      ),
    );
    checks.push(
      check(
        invent,
        inRoster ? "held" : "breached",
        inRoster ? "No invented clinician/slot id" : "Invented or missing id blocked",
      ),
    );
    const whyOk = Boolean(ctx.why?.trim()) && !DIAGNOSIS_RE.test(ctx.why || "");
    checks.push(
      check(
        whyDef,
        whyOk ? "applied" : "breached",
        whyOk ? "Coordination why present" : "Missing or unsafe why text",
      ),
    );
  }

  if (agent === "draftTell") {
    for (const def of defs) {
      if (def.id === "no_diagnosis") {
        const bad = DIAGNOSIS_RE.test(ctx.draftEn || "") || DIAGNOSIS_RE.test(ctx.why || "");
        checks.push(
          check(def, bad ? "breached" : "held", bad ? "Diagnosis language blocked" : "Draft stays non-diagnostic"),
        );
      } else if (def.id === "roster_bound") {
        checks.push(
          check(
            def,
            ctx.draftEn?.trim() ? "applied" : "breached",
            ctx.draftEn?.trim() ? "Draft text returned" : "Empty draft",
          ),
        );
      } else {
        checks.push(check(def, "held", def.rule));
      }
    }
  }

  if (agent === "outcomeGate") {
    const allowed = new Set(["direct_close", "confirmatory", "verify"]);
    for (const def of defs) {
      if (def.id === "allowed_outcomes") {
        const ok = Boolean(ctx.outcome && allowed.has(ctx.outcome));
        checks.push(
          check(def, ok ? "applied" : "breached", ok ? `Outcome ${ctx.outcome}` : "Invalid outcome"),
        );
      } else if (def.id === "no_diagnosis") {
        const bad = DIAGNOSIS_RE.test(ctx.why || "");
        checks.push(check(def, bad ? "breached" : "held", bad ? "Unsafe why" : "Why is coordination-safe"));
      } else {
        checks.push(check(def, "held", def.rule));
      }
    }
  }

  if (agent === "watch") {
    for (const def of defs) {
      checks.push(check(def, "held", def.rule));
    }
  }

  const ok = checks.every((c) => c.status !== "breached");
  return { ok, checks };
}
