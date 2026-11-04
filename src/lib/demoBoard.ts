import { enrichmentToCase } from "./enrich";
import { enrichAgent } from "./agents/enrichAgent";
import { localExplain } from "./agents/explainAgent";
import { gateAgent } from "./agents/gateAgent";
import { priorityAgent } from "./agents/priorityAgent";
import {
  AGENT_LABELS,
  type AgentNodeId,
  type AgentNodeTrace,
  type AgentRun,
} from "./agents/types";
import { validateAgent } from "./agents/validateAgent";
import { parseImportCsv, SAMPLE_IMPORT_CSV, type ImportRow } from "./importCsv";
import { resetRegistry, upsertPatient, upsertResult } from "./registry";
import type { Persisted } from "../store";
import type { AuditEvent, CareCase } from "../types";

/** Build a judge-ready board via the same agent graph as import. */
export function buildDemoState(): Persisted {
  const rows = parseImportCsv(SAMPLE_IMPORT_CSV);
  resetRegistry();
  for (const row of rows) {
    upsertPatient(row.patient);
    upsertResult(row.result);
  }

  const cases: CareCase[] = [];
  const agentRuns: AgentRun[] = [];
  const audit: AuditEvent[] = [];
  const at = new Date().toISOString().slice(0, 16);

  for (const row of rows) {
    const { run, care } = syncRunAgentPipeline(row);
    agentRuns.push(run);
    if (care) {
      cases.push(care);
      audit.push({
        id: `aud-import-${care.id}`,
        caseId: care.id,
        at,
        actor: "system",
        action: "imported",
        detail: care.aiPriorityReason || "Agent pipeline placed finding",
      });
    }
  }

  return {
    version: 3,
    savedAt: new Date().toISOString(),
    cases,
    messages: [],
    audit,
    selectedCaseId: cases[0]?.id ?? "",
    role: "coordinator",
    importSource: "demo-ifhas-extract.csv",
    patients: rows.map((r) => r.patient),
    results: rows.map((r) => r.result),
    agentRuns,
  };
}

function syncRunAgentPipeline(row: ImportRow): { run: AgentRun; care: CareCase | null } {
  const working: ImportRow = {
    patient: { ...row.patient },
    result: { ...row.result },
    metrics: { ...row.metrics },
  };
  const runId = `agent-${working.result.id}-demo`;
  const now = new Date().toISOString();
  const nodes: AgentNodeTrace[] = [];
  const patientName = working.patient.nameEn || working.patient.id;
  const finding = `${working.result.labelEn} ${working.result.value}`.trim();

  const node = (
    id: AgentNodeId,
    status: AgentNodeTrace["status"],
    input: unknown,
    output: unknown,
    notes: string,
  ): AgentNodeTrace => ({
    id,
    label: AGENT_LABELS[id],
    status,
    input,
    output,
    notes,
    startedAt: now,
    finishedAt: now,
  });

  nodes.push(
    node(
      "ingest",
      "ok",
      { patient_id: working.patient.id, value: working.result.value },
      { normalized: true },
      "Raw extract row captured",
    ),
  );

  const validation = validateAgent(working);
  nodes.push(
    node(
      "validate",
      validation.hardFail ? "blocked" : validation.issues.length ? "warn" : "ok",
      { value: working.result.value },
      { issues: validation.issues, hardFail: validation.hardFail },
      validation.notes,
    ),
  );

  if (validation.hardFail) {
    for (const id of ["enrich", "gate", "priority", "route"] as AgentNodeId[]) {
      nodes.push(node(id, "skipped", null, null, "Skipped — fix validation errors first"));
    }
    const run: AgentRun = {
      id: runId,
      rowKey: working.result.id,
      patientName,
      finding,
      status: "needs_fix",
      nodes: [...nodes],
      careId: null,
      issues: validation.issues,
      rawRow: working,
      editablePatch: {
        value: working.result.value,
        name_en: working.patient.nameEn,
        age: String(working.patient.age),
      },
      finishedAt: now,
    };
    run.explainEn = localExplain(run);
    run.nodes.push(
      node("explain", "ok", { status: run.status }, { explainEn: run.explainEn }, "Local narration"),
    );
    return { run, care: null };
  }

  const { enrichment, notes: enrichNotes } = enrichAgent(working);
  nodes.push(
    node(
      "enrich",
      "ok",
      { code: working.result.code, value: working.result.value },
      { classifiedFlag: enrichment.classifiedFlag, signals: enrichment.signals },
      enrichNotes,
    ),
  );

  const gate = gateAgent(enrichment);
  nodes.push(
    node(
      "gate",
      gate.status === "filtered" ? "filtered" : "ok",
      { classifiedFlag: enrichment.classifiedFlag },
      { include: gate.include, gateReason: gate.gateReason },
      gate.notes,
    ),
  );

  if (!gate.include) {
    nodes.push(node("priority", "skipped", null, null, "Skipped — filtered at gate"));
    nodes.push(
      node(
        "route",
        "filtered",
        { gate: gate.gateReason },
        { destination: "filtered" },
        "Routed to Filtered / low priority",
      ),
    );
    const run: AgentRun = {
      id: runId,
      rowKey: working.result.id,
      patientName,
      finding,
      status: "filtered",
      nodes: [...nodes],
      careId: null,
      issues: validation.issues,
      rawRow: working,
      gateReason: gate.gateReason,
      priorityReason: enrichment.priorityReason,
      classifiedFlag: enrichment.classifiedFlag,
      finishedAt: now,
    };
    run.explainEn = localExplain(run);
    run.nodes.push(
      node("explain", "ok", { status: run.status }, { explainEn: run.explainEn }, "Local narration"),
    );
    return { run, care: null };
  }

  const priority = priorityAgent(enrichment);
  nodes.push(
    node(
      "priority",
      "ok",
      { signals: enrichment.signals },
      {
        urgency: priority.urgency,
        slaHours: priority.slaHours,
        specialty: priority.specialty,
        priorityReason: priority.priorityReason,
      },
      priority.notes,
    ),
  );

  const care: CareCase = {
    ...enrichmentToCase(working, enrichment),
    agentRunId: runId,
  };
  nodes.push(
    node(
      "route",
      "ok",
      { urgency: priority.urgency },
      { destination: "placed", careId: care.id },
      `Placed on board as ${priority.urgency}`,
    ),
  );

  const run: AgentRun = {
    id: runId,
    rowKey: working.result.id,
    patientName,
    finding,
    status: "placed",
    nodes: [...nodes],
    careId: care.id,
    issues: validation.issues,
    rawRow: working,
    gateReason: gate.gateReason,
    priorityReason: priority.priorityReason,
    urgency: priority.urgency,
    specialty: priority.specialty,
    slaHours: priority.slaHours,
    classifiedFlag: enrichment.classifiedFlag,
    finishedAt: now,
  };
  run.explainEn = localExplain(run);
  run.nodes.push(
    node("explain", "ok", { status: run.status }, { explainEn: run.explainEn }, "Local narration"),
  );
  return { run, care };
}
