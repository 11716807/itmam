import type { Enrichment } from "../enrich";
import type { ImportRow } from "../importCsv";
import type { AgentIssue, AgentNodeId, AgentRunStatus } from "./types";

export type AgentGuardrailDef = {
  id: string;
  rule: string;
};

export type AgentGuardrailCheck = AgentGuardrailDef & {
  status: "held" | "applied" | "breached";
  detail: string;
};

/** Standing rules each harness agent must obey. */
export const AGENT_GUARDRAILS: Record<AgentNodeId, AgentGuardrailDef[]> = {
  ingest: [
    { id: "no_invent", rule: "Do not invent patient or finding values" },
    { id: "preserve_raw", rule: "Keep the raw extract value for audit" },
    { id: "require_keys", rule: "Require patient id and finding code before continuing" },
  ],
  validate: [
    { id: "hard_fail_blocks", rule: "Hard errors block enrichment and board place" },
    { id: "no_auto_fix", rule: "Never silently rewrite bad values" },
    { id: "tag_fields", rule: "Every issue must name field + code for re-run" },
  ],
  enrich: [
    { id: "rules_only", rule: "Classify with deterministic rules only" },
    { id: "no_diagnosis", rule: "Do not diagnose or prescribe from a screening value" },
    { id: "signal_bound", rule: "Signals come only from extract metrics + finding code" },
  ],
  gate: [
    { id: "actionable_only", rule: "Only actionable findings open a closed loop" },
    { id: "no_silent_drop", rule: "Filtered rows stay visible — never silent drop" },
    { id: "reason_required", rule: "Every filter must carry an explicit gate reason" },
  ],
  priority: [
    { id: "rules_only_rank", rule: "Urgency / SLA / specialty come from rules only" },
    { id: "no_diagnosis", rule: "Priority language is coordination, not diagnosis" },
    { id: "sla_bounded", rule: "SLA hours must be a positive finite number" },
  ],
  route: [
    { id: "gate_required", rule: "Place on board only after gate pass" },
    { id: "no_place_bad_data", rule: "Never place needs_fix or filtered rows" },
    { id: "destination_clear", rule: "Destination must be placed, filtered, or needs_fix" },
  ],
  explain: [
    { id: "narrate_only", rule: "Narrate decisions — never change rank or stage" },
    { id: "no_diagnosis", rule: "Do not diagnose, prescribe, or invent clinical advice" },
    { id: "rules_first", rule: "State that rules decided; explain agent only narrates" },
  ],
};

export type GuardrailContext = {
  row?: ImportRow;
  issues?: AgentIssue[];
  hardFail?: boolean;
  enrichment?: Enrichment;
  gateInclude?: boolean;
  gateReason?: string;
  urgency?: string;
  slaHours?: number;
  specialty?: string;
  runStatus?: AgentRunStatus;
  careId?: string | null;
  explainEn?: string;
  destination?: string;
};

const DIAGNOSIS_RE =
  /\b(diagnos|you have|prescribe|medication|cancer confirmed|definitely have)\b/i;

function check(
  def: AgentGuardrailDef,
  status: AgentGuardrailCheck["status"],
  detail: string,
): AgentGuardrailCheck {
  return { ...def, status, detail };
}

function defs(id: AgentNodeId): AgentGuardrailDef[] {
  return AGENT_GUARDRAILS[id];
}

/** Evaluate standing guardrails for one agent against its run context. */
export function evaluateGuardrails(
  id: AgentNodeId,
  ctx: GuardrailContext,
): AgentGuardrailCheck[] {
  const list = defs(id);

  switch (id) {
    case "ingest": {
      const row = ctx.row;
      const hasKeys = Boolean(row?.patient.id && row?.result.code);
      const rawKept = row?.result.value != null;
      return [
        check(
          list[0],
          "held",
          "Ingest only normalizes the extract row — no generated fields",
        ),
        check(
          list[1],
          rawKept ? "held" : "breached",
          rawKept ? "Raw value retained on the run snapshot" : "Raw value missing",
        ),
        check(
          list[2],
          hasKeys ? "held" : "breached",
          hasKeys
            ? `Keys present · ${row?.patient.id} / ${row?.result.code}`
            : "Missing patient id or finding code",
        ),
      ];
    }
    case "validate": {
      const issues = ctx.issues || [];
      const tagged = issues.every((i) => i.field && i.code);
      const hard = Boolean(ctx.hardFail);
      return [
        check(
          list[0],
          hard ? "applied" : "held",
          hard
            ? "Hard fail — downstream agents skipped until fix"
            : "No hard fail — pipeline may continue",
        ),
        check(
          list[1],
          "held",
          "Bad values stay tagged for coordinator fix · no silent rewrite",
        ),
        check(
          list[2],
          issues.length === 0 || tagged ? "held" : "breached",
          issues.length
            ? tagged
              ? `${issues.length} issue(s) tagged for re-run`
              : "An issue is missing field or code"
            : "No issues — nothing to tag",
        ),
      ];
    }
    case "enrich": {
      const flag = ctx.enrichment?.classifiedFlag;
      return [
        check(list[0], "held", "Enrichment used deterministic classify rules"),
        check(
          list[1],
          "held",
          "Output is actionable / borderline / normal — not a diagnosis",
        ),
        check(
          list[2],
          flag ? "applied" : "breached",
          flag
            ? `Classified ${flag} from code + extract metrics only`
            : "Missing classification flag",
        ),
      ];
    }
    case "gate": {
      const include = Boolean(ctx.gateInclude);
      const reason = (ctx.gateReason || "").trim();
      return [
        check(
          list[0],
          include ? "applied" : "held",
          include
            ? "Actionable — loop may open"
            : "Not actionable — loop will not open",
        ),
        check(
          list[1],
          include ? "held" : "applied",
          include
            ? "Passing rows continue to priority"
            : "Filtered row stays on Not on board tray",
        ),
        check(
          list[2],
          reason ? "held" : "breached",
          reason || "Gate reason missing",
        ),
      ];
    }
    case "priority": {
      const sla = ctx.slaHours;
      const slaOk = typeof sla === "number" && Number.isFinite(sla) && sla > 0;
      const reason = ctx.enrichment?.priorityReason || ctx.urgency || "";
      const looksDx = DIAGNOSIS_RE.test(reason);
      return [
        check(
          list[0],
          ctx.urgency && ctx.specialty ? "applied" : "breached",
          ctx.urgency
            ? `${ctx.urgency} · ${String(ctx.specialty || "").replaceAll("_", " ")} from rules`
            : "Priority fields missing",
        ),
        check(
          list[1],
          looksDx ? "breached" : "held",
          looksDx
            ? "Priority text looks clinical — strip diagnosis language"
            : "Priority text is coordination-only",
        ),
        check(
          list[2],
          slaOk ? "held" : "breached",
          slaOk ? `SLA ${sla}h` : "SLA hours invalid",
        ),
      ];
    }
    case "route": {
      const dest = ctx.destination || ctx.runStatus || "";
      const placed = dest === "placed" || ctx.runStatus === "placed";
      const badPlace =
        placed && (ctx.runStatus === "needs_fix" || ctx.runStatus === "filtered");
      const gateOk = ctx.gateInclude !== false || !placed;
      return [
        check(
          list[0],
          placed ? (ctx.gateInclude ? "applied" : "breached") : "held",
          placed
            ? ctx.gateInclude
              ? "Gate passed before place"
              : "Placed without gate pass"
            : "Not placing on board",
        ),
        check(
          list[1],
          badPlace ? "breached" : "held",
          badPlace
            ? "Attempted to place a filtered / needs_fix row"
            : "Needs-fix and filtered rows stay off the board",
        ),
        check(
          list[2],
          dest ? "applied" : "breached",
          dest ? `Destination · ${dest}` : "Destination unset",
        ),
        ...(gateOk ? [] : []),
      ];
    }
    case "explain": {
      const text = ctx.explainEn || "";
      const looksDx = DIAGNOSIS_RE.test(text);
      return [
        check(list[0], "held", "Explain does not mutate urgency, specialty, or stage"),
        check(
          list[1],
          looksDx ? "breached" : "held",
          looksDx
            ? "Narration contained diagnosis-like language — prefer local safe copy"
            : "Narration stays non-diagnostic",
        ),
        check(
          list[2],
          "held",
          "Rules decided placement; explain only narrates",
        ),
      ];
    }
    default:
      return list.map((d) => check(d, "held", d.rule));
  }
}

/** True when any guardrail was breached for a node. */
export function guardrailsBreached(checks: AgentGuardrailCheck[]): boolean {
  return checks.some((c) => c.status === "breached");
}
