import type { CareCase, Specialty, Urgency } from "../../types";
import type { ImportRow } from "../importCsv";
import type { Enrichment } from "../enrich";
import type { AgentGuardrailCheck } from "./guardrails";

export type AgentNodeId =
  | "ingest"
  | "validate"
  | "enrich"
  | "gate"
  | "priority"
  | "route"
  | "explain";

export type AgentNodeStatus = "pending" | "running" | "ok" | "warn" | "blocked" | "filtered" | "skipped";

export type AgentIssueSeverity = "error" | "warn";

export type AgentIssue = {
  code: string;
  field: string;
  message: string;
  severity: AgentIssueSeverity;
};

export type AgentRunStatus = "placed" | "filtered" | "needs_fix";

export type AgentNodeTrace = {
  id: AgentNodeId;
  label: string;
  status: AgentNodeStatus;
  input: unknown;
  output: unknown;
  notes: string;
  startedAt: string;
  finishedAt: string;
  /** Standing rules this agent checked on this hop. */
  guardrails?: AgentGuardrailCheck[];
};

export type { AgentGuardrailCheck, AgentGuardrailDef } from "./guardrails";
export { AGENT_GUARDRAILS } from "./guardrails";

/** Editable fields for needs_fix re-run. */
export type AgentEditablePatch = {
  value?: string;
  name_en?: string;
  age?: string;
  code?: string;
  days_waiting?: string;
  notes?: string;
};

export type AgentRun = {
  id: string;
  rowKey: string;
  patientName: string;
  finding: string;
  status: AgentRunStatus;
  nodes: AgentNodeTrace[];
  careId: string | null;
  issues: AgentIssue[];
  /** Snapshot of ImportRow used for this run (JSON-safe). */
  rawRow: ImportRow;
  editablePatch?: AgentEditablePatch;
  gateReason?: string;
  priorityReason?: string;
  urgency?: Urgency;
  specialty?: Specialty;
  slaHours?: number;
  classifiedFlag?: Enrichment["classifiedFlag"];
  explainEn?: string;
  finishedAt: string;
};

export type PipelineResult = {
  run: AgentRun;
  care: CareCase | null;
};

export const AGENT_NODE_ORDER: AgentNodeId[] = [
  "ingest",
  "validate",
  "enrich",
  "gate",
  "priority",
  "route",
  "explain",
];

/** Display name for each harness agent. */
export const AGENT_LABELS: Record<AgentNodeId, string> = {
  ingest: "Ingest Agent",
  validate: "Validate Agent",
  enrich: "Enrich Agent",
  gate: "Gate Agent",
  priority: "Priority Agent",
  route: "Route Agent",
  explain: "Explain Agent",
};

/** One-line role shown on the harness tile. */
export const AGENT_ROLES: Record<AgentNodeId, string> = {
  ingest: "Normalize · no invent",
  validate: "Hard-fail · no silent fix",
  enrich: "Rules classify · no diagnosis",
  gate: "Actionable only · no silent drop",
  priority: "Rules beat model · SLA bound",
  route: "Gate required · clear destination",
  explain: "Narrate only · never re-rank",
};

/** Grid positions for the harness graph (col 0–3, row 0–1). */
export const AGENT_GRID: Record<AgentNodeId, { col: number; row: number }> = {
  ingest: { col: 0, row: 0 },
  validate: { col: 1, row: 0 },
  enrich: { col: 2, row: 0 },
  gate: { col: 3, row: 0 },
  priority: { col: 1, row: 1 },
  route: { col: 2, row: 1 },
  explain: { col: 3, row: 1 },
};

/** Directed edges in the harness graph. */
export const AGENT_EDGES: Array<[AgentNodeId, AgentNodeId]> = [
  ["ingest", "validate"],
  ["validate", "enrich"],
  ["enrich", "gate"],
  ["gate", "priority"],
  ["priority", "route"],
  ["route", "explain"],
];
