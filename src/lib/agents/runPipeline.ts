import { enrichmentToCase } from "../enrich";
import type { ImportRow } from "../importCsv";
import type { CareCase } from "../../types";
import { enrichAgent } from "./enrichAgent";
import { explainAgent, localExplain } from "./explainAgent";
import { evaluateGuardrails, type GuardrailContext } from "./guardrails";
import { gateAgent } from "./gateAgent";
import { priorityAgent } from "./priorityAgent";
import { applyPatchToRow } from "./rerunFromPatch";
import {
  AGENT_LABELS,
  type AgentEditablePatch,
  type AgentNodeId,
  type AgentNodeStatus,
  type AgentNodeTrace,
  type AgentRun,
  type PipelineResult,
} from "./types";
import { validateAgent } from "./validateAgent";

export type AgentStreamEvent =
  | { type: "batch_start"; total: number }
  | {
      type: "row_start";
      index: number;
      total: number;
      name: string;
      finding: string;
      runId: string;
    }
  | {
      type: "node";
      index: number;
      total: number;
      runId: string;
      node: AgentNodeTrace;
    }
  | {
      type: "row_done";
      index: number;
      total: number;
      result: PipelineResult;
    }
  | {
      type: "batch_done";
      placed: number;
      filtered: number;
      needsFix: number;
    };

function stamp(): string {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeNode(
  id: AgentNodeId,
  status: AgentNodeStatus,
  input: unknown,
  output: unknown,
  notes: string,
  startedAt: string,
  guardCtx: GuardrailContext = {},
): AgentNodeTrace {
  return {
    id,
    label: AGENT_LABELS[id],
    status,
    input,
    output,
    notes,
    startedAt,
    finishedAt: stamp(),
    guardrails: evaluateGuardrails(id, guardCtx),
  };
}

function findingLine(row: ImportRow): string {
  const { result } = row;
  return `${result.labelEn} ${result.value}${result.unit ? ` ${result.unit}` : ""}`.trim();
}

function cloneRow(row: ImportRow): ImportRow {
  return {
    patient: { ...row.patient },
    result: { ...row.result },
    metrics: { ...row.metrics },
  };
}

/**
 * Run the full deterministic agent graph for one import row.
 * Optional Gemini explain narrates decisions only.
 */
export async function runAgentPipeline(
  row: ImportRow,
  opts: { explain?: boolean; runId?: string; patch?: AgentEditablePatch; fast?: boolean } = {},
): Promise<PipelineResult> {
  const working = opts.patch ? applyPatchToRow(row, opts.patch) : cloneRow(row);
  const runId = opts.runId || `agent-${working.result.id}-${Date.now()}`;
  const nodes: AgentNodeTrace[] = [];
  const patientName = working.patient.nameEn || working.patient.id;
  const finding = findingLine(working);
  const pause = async (ms: number) => {
    if (!opts.fast) await sleep(ms);
  };

  // 1. Ingest
  let t0 = stamp();
  await pause(40);
  nodes.push(
    makeNode(
      "ingest",
      "ok",
      {
        patient_id: working.patient.id,
        name: working.patient.nameEn,
        code: working.result.code,
        value: working.result.value,
        metrics: working.metrics,
      },
      { normalized: true, rowKey: working.result.id },
      "Raw extract row captured · guardrails held",
      t0,
      { row: working },
    ),
  );

  // 2. Validate
  t0 = stamp();
  await pause(60);
  const validation = validateAgent(working);
  nodes.push(
    makeNode(
      "validate",
      validation.hardFail ? "blocked" : validation.issues.length ? "warn" : "ok",
      { value: working.result.value, age: working.patient.age, code: working.result.code },
      { issues: validation.issues, hardFail: validation.hardFail },
      validation.notes,
      t0,
      { row: working, issues: validation.issues, hardFail: validation.hardFail },
    ),
  );

  if (validation.hardFail) {
    // Skip remaining decision agents — mark as skipped for graph visibility
    for (const id of ["enrich", "gate", "priority", "route"] as AgentNodeId[]) {
      nodes.push(
        makeNode(
          id,
          "skipped",
          null,
          null,
          "Skipped — validate hard-fail guardrail",
          stamp(),
          { hardFail: true, issues: validation.issues, runStatus: "needs_fix" },
        ),
      );
    }
    const run: AgentRun = {
      id: runId,
      rowKey: working.result.id,
      patientName,
      finding,
      status: "needs_fix",
      nodes,
      careId: null,
      issues: validation.issues,
      rawRow: working,
      editablePatch: opts.patch || {
        value: working.result.value,
        name_en: working.patient.nameEn,
        age: String(working.patient.age),
      },
      finishedAt: stamp(),
    };
    const explainEn =
      opts.explain !== false ? await explainAgent(run) : localExplain(run);
    t0 = stamp();
    run.explainEn = explainEn;
    run.nodes.push(
      makeNode(
        "explain",
        "ok",
        { status: run.status },
        { explainEn },
        opts.explain !== false ? "Narration only · guardrails held" : "Local narration · guardrails held",
        t0,
        { runStatus: run.status, explainEn },
      ),
    );
    return { run, care: null };
  }

  // 3. Enrich
  t0 = stamp();
  await pause(80);
  const { enrichment, notes: enrichNotes } = enrichAgent(working);
  nodes.push(
    makeNode(
      "enrich",
      "ok",
      { code: working.result.code, value: working.result.value, metrics: working.metrics },
      {
        classifiedFlag: enrichment.classifiedFlag,
        signals: enrichment.signals,
        include: enrichment.include,
      },
      enrichNotes,
      t0,
      { enrichment },
    ),
  );

  // 4. Gate
  t0 = stamp();
  await pause(50);
  const gate = gateAgent(enrichment);
  nodes.push(
    makeNode(
      "gate",
      gate.status === "filtered" ? "filtered" : "ok",
      { classifiedFlag: enrichment.classifiedFlag, include: enrichment.include },
      { include: gate.include, gateReason: gate.gateReason },
      gate.notes,
      t0,
      { enrichment, gateInclude: gate.include, gateReason: gate.gateReason },
    ),
  );

  if (!gate.include) {
    nodes.push(
      makeNode(
        "priority",
        "skipped",
        null,
        null,
        "Skipped — gate filter guardrail",
        stamp(),
        { gateInclude: false, gateReason: gate.gateReason, enrichment },
      ),
    );
    nodes.push(
      makeNode(
        "route",
        "filtered",
        { gate: gate.gateReason },
        { destination: "filtered", next: "Visible on Not on board tray" },
        "Routed to filtered tray · no silent drop",
        stamp(),
        {
          gateInclude: false,
          gateReason: gate.gateReason,
          runStatus: "filtered",
          destination: "filtered",
          careId: null,
        },
      ),
    );
    const run: AgentRun = {
      id: runId,
      rowKey: working.result.id,
      patientName,
      finding,
      status: "filtered",
      nodes,
      careId: null,
      issues: validation.issues,
      rawRow: working,
      gateReason: gate.gateReason,
      priorityReason: enrichment.priorityReason,
      classifiedFlag: enrichment.classifiedFlag,
      finishedAt: stamp(),
    };
    const explainEn =
      opts.explain !== false ? await explainAgent(run) : localExplain(run);
    t0 = stamp();
    run.explainEn = explainEn;
    run.nodes.push(
      makeNode(
        "explain",
        "ok",
        { status: run.status },
        { explainEn },
        opts.explain !== false ? "Narration only · guardrails held" : "Local narration · guardrails held",
        t0,
        { runStatus: run.status, explainEn },
      ),
    );
    return { run, care: null };
  }

  // 5. Priority
  t0 = stamp();
  await pause(70);
  const priority = priorityAgent(enrichment);
  nodes.push(
    makeNode(
      "priority",
      "ok",
      { signals: enrichment.signals, classifiedFlag: enrichment.classifiedFlag },
      {
        urgency: priority.urgency,
        slaHours: priority.slaHours,
        specialty: priority.specialty,
        priorityReason: priority.priorityReason,
      },
      priority.notes,
      t0,
      {
        enrichment,
        urgency: priority.urgency,
        slaHours: priority.slaHours,
        specialty: priority.specialty,
      },
    ),
  );

  // 6. Route → board
  t0 = stamp();
  await pause(40);
  const care: CareCase = {
    ...enrichmentToCase(working, enrichment),
    agentRunId: runId,
  };
  nodes.push(
    makeNode(
      "route",
      "ok",
      { urgency: priority.urgency, specialty: priority.specialty },
      { destination: "placed", careId: care.id, next: "Confirm priority on Case" },
      `Placed on board as ${priority.urgency}`,
      t0,
      {
        gateInclude: true,
        gateReason: gate.gateReason,
        runStatus: "placed",
        destination: "placed",
        careId: care.id,
      },
    ),
  );

  const run: AgentRun = {
    id: runId,
    rowKey: working.result.id,
    patientName,
    finding,
    status: "placed",
    nodes,
    careId: care.id,
    issues: validation.issues,
    rawRow: working,
    gateReason: gate.gateReason,
    priorityReason: priority.priorityReason,
    urgency: priority.urgency,
    specialty: priority.specialty,
    slaHours: priority.slaHours,
    classifiedFlag: enrichment.classifiedFlag,
    finishedAt: stamp(),
  };

  const explainEn =
    opts.explain !== false ? await explainAgent(run) : localExplain(run);
  t0 = stamp();
  run.explainEn = explainEn;
  run.nodes.push(
    makeNode(
      "explain",
      "ok",
      { status: run.status },
      { explainEn },
      opts.explain !== false ? "Narration only · guardrails held" : "Local narration · guardrails held",
      t0,
      { runStatus: run.status, explainEn },
    ),
  );

  return { run, care };
}

/**
 * Stream agent pipeline across extract rows (replaces streamPrepareBoard).
 * Explain uses local summary during batch for speed; optional live Gemini later.
 */
export async function* streamAgentPipeline(
  rows: ImportRow[],
  opts: { explain?: boolean } = {},
): AsyncGenerator<AgentStreamEvent> {
  const ordered = [...rows];
  yield { type: "batch_start", total: ordered.length };

  let placed = 0;
  let filtered = 0;
  let needsFix = 0;

  for (let i = 0; i < ordered.length; i++) {
    const row = ordered[i];
    const runId = `agent-${row.result.id}-${Date.now()}-${i}`;
    yield {
      type: "row_start",
      index: i + 1,
      total: ordered.length,
      name: row.patient.nameEn,
      finding: findingLine(row),
      runId,
    };

    // Run with local explain during batch (fast); Board can request Gemini later
    const result = await runAgentPipeline(row, {
      runId,
      explain: opts.explain === true,
    });

    // Emit nodes one-by-one for live stepper (already finished — replay briefly)
    for (const node of result.run.nodes) {
      yield {
        type: "node",
        index: i + 1,
        total: ordered.length,
        runId,
        node,
      };
      await sleep(35);
    }

    if (result.run.status === "placed") placed += 1;
    else if (result.run.status === "filtered") filtered += 1;
    else needsFix += 1;

    yield {
      type: "row_done",
      index: i + 1,
      total: ordered.length,
      result,
    };
  }

  yield { type: "batch_done", placed, filtered, needsFix };
}

export async function rerunAgentWithPatch(
  previous: AgentRun,
  patch: AgentEditablePatch,
): Promise<PipelineResult> {
  return runAgentPipeline(previous.rawRow, {
    runId: previous.id,
    patch,
    explain: true,
  });
}
