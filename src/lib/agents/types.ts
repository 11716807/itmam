import type { CareCase, Specialty, Urgency } from "../../types";
import type { ImportRow } from "../importCsv";
import type { Enrichment } from "../enrich";

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
};

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

export const AGENT_LABELS: Record<AgentNodeId, string> = {
  ingest: "Ingest",
  validate: "Validate",
  enrich: "Enrich",
  gate: "Gate",
  priority: "Priority",
  route: "Route",
  explain: "Explain",
};
