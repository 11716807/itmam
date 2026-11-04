import { useMemo, useRef, useState } from "react";
import { AgentGraph } from "../components/AgentGraph";
import { patientById, resultById } from "../data/seed";
import {
  type AgentEditablePatch,
  type AgentRun,
  rerunAgentWithPatch,
  streamAgentPipeline,
} from "../lib/agents";
import { parseImportCsv, SAMPLE_IMPORT_CSV, type ImportRow } from "../lib/importCsv";
import { hoursOpen, isOpen, slaBreached } from "../lib/loop";
import { rankCases } from "../lib/priority";
import { resetRegistry, upsertPatient, upsertResult } from "../lib/registry";
import { planSlaRecovery } from "../lib/slaAction";
import type { RiskWeights } from "../lib/riskWeights";
import type { CareCase, ScreeningResult } from "../types";
import { STAGE_LABEL } from "../types";

type Props = {
  cases: CareCase[];
  agentRuns: AgentRun[];
  importSource: string | null;
  preparing: boolean;
  riskWeights: RiskWeights;
  onOpen: (caseId: string) => void;
  onReset: () => void;
  onLoadDemo: () => void;
  onPrepareStart: () => void;
  onAgentRun: (run: AgentRun, care: CareCase | null, source: string) => void;
  onPrepareDone: (placed: number, filtered: number, needsFix: number) => void;
  onReplaceAgentRun: (run: AgentRun, care: CareCase | null) => void;
};

export function Board({
  cases,
  agentRuns,
  importSource,
  preparing,
  riskWeights,
  onOpen,
  onReset,
  onLoadDemo,
  onPrepareStart,
  onAgentRun,
  onPrepareDone,
  onReplaceAgentRun,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graphRunId, setGraphRunId] = useState<string | null>(null);
  const [fixDraft, setFixDraft] = useState<AgentEditablePatch>({});
  const [rerunning, setRerunning] = useState(false);

  const resultsById = Object.fromEntries(
    cases.map((c) => [c.resultId, resultById(c.resultId)]),
  ) as Record<string, ScreeningResult>;

  const open = cases.filter((c) => isOpen(c.stage));
  const verified = cases.filter((c) => c.stage === "verified").length;
  const lost = cases.filter((c) => c.stage === "lost").length;
  const breached = open.filter((c) => slaBreached(c)).length;
  const urgentOpen = open.filter((c) => c.urgency === "urgent");
  const escalatePool = open.filter((c) => c.urgency === "urgent" || slaBreached(c));
  const ranked = rankCases(cases, resultsById, riskWeights);
  const top = ranked[0]?.case;
  const hasBoard = cases.length > 0;
  const firstImport = !hasBoard && agentRuns.length === 0;

  const heldRuns = useMemo(
    () => agentRuns.filter((r) => r.status === "filtered" || r.status === "needs_fix"),
    [agentRuns],
  );

  const graphRun = graphRunId
    ? agentRuns.find((r) => r.id === graphRunId) ?? null
    : null;

  function runForCase(care: CareCase): AgentRun | undefined {
    return agentRuns.find((r) => r.id === care.agentRunId || r.careId === care.id);
  }

  function openAgents(run: AgentRun) {
    setGraphRunId(run.id);
    setFixDraft({
      value: run.editablePatch?.value ?? run.rawRow.result.value,
      name_en: run.editablePatch?.name_en ?? run.rawRow.patient.nameEn,
      age: run.editablePatch?.age ?? String(run.rawRow.patient.age),
      days_waiting: run.rawRow.metrics.days_waiting || "",
      notes: run.rawRow.metrics.notes || "",
    });
  }

  async function runPrepare(rows: ImportRow[], source: string) {
    setError(null);
    setReading(null);
    setGraphRunId(null);
    onPrepareStart();
    resetRegistry();
    for (const row of rows) {
      upsertPatient(row.patient);
      upsertResult(row.result);
    }

    try {
      for await (const event of streamAgentPipeline(rows, { explain: false })) {
        if (event.type === "row_start") {
          setReading(`${event.name} · ${event.finding}`);
        } else if (event.type === "row_done") {
          onAgentRun(event.result.run, event.result.care, source);
        } else if (event.type === "batch_done") {
          onPrepareDone(event.placed, event.filtered, event.needsFix);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent pipeline failed");
      onPrepareDone(0, 0, 0);
    } finally {
      setReading(null);
    }
  }

  async function onFile(file: File | null) {
    if (!file || preparing) return;
    try {
      const text = await file.text();
      const rows = parseImportCsv(text);
      await runPrepare(rows, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse CSV");
    }
  }

  async function onSample() {
    if (preparing) return;
    const rows = parseImportCsv(SAMPLE_IMPORT_CSV);
    await runPrepare(rows, "sample-ifhas-extract.csv");
  }

  async function submitRerun(run: AgentRun) {
    setRerunning(true);
    setError(null);
    try {
      upsertPatient(run.rawRow.patient);
      upsertResult(run.rawRow.result);
      const result = await rerunAgentWithPatch(run, fixDraft);
      upsertPatient(result.run.rawRow.patient);
      upsertResult(result.run.rawRow.result);
      onReplaceAgentRun(result.run, result.care);
      setGraphRunId(result.run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-run failed");
    } finally {
      setRerunning(false);
    }
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".csv,text/csv"
      hidden
      onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
    />
  );

  return (
    <section className="panel">
      <header className={`panel-head ${hasBoard || agentRuns.length ? "panel-head-tight" : ""}`}>
        <div>
          <p className="eyebrow">Care coordination</p>
          <h2>Close every actionable result</h2>
          {firstImport && !preparing ? (
            <p className="lede">
              Import a screening extract. Agents validate and prioritize each row — use{" "}
              <strong>Agents</strong> on a person to open the green decision path.
            </p>
          ) : null}
        </div>
        {hasBoard || agentRuns.length ? (
          <div className="head-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={preparing}
              onClick={() => {
                setGraphRunId(null);
                onReset();
              }}
            >
              Clear board
            </button>
          </div>
        ) : null}
      </header>

      <div className="panel-body">
        {hasBoard || preparing || agentRuns.length ? (
          <div className={`import-bar ${preparing ? "busy" : ""}`}>
            {fileInput}
            <div className="import-bar-meta">
              <span className="eyebrow">Import</span>
              <strong>
                {preparing ? "Agents running…" : importSource || "Extract loaded"}
              </strong>
              {error ? <span className="import-error">{error}</span> : null}
            </div>
            <div className="import-bar-actions">
              <button
                type="button"
                className="btn primary"
                disabled={preparing}
                onClick={() => fileRef.current?.click()}
              >
                {preparing ? "Working…" : "Re-import"}
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={preparing}
                onClick={() => void onSample()}
              >
                Example file
              </button>
            </div>
          </div>
        ) : null}

        {preparing ? (
          <div className="working-banner" aria-live="polite">
            <div className="working-spinner" aria-hidden />
            <div className="working-copy">
              <strong>Running agents on extract…</strong>
              <p>Validate → enrich → gate → priority → route for each finding.</p>
              {reading ? <p className="working-meta">Now: {reading}</p> : null}
            </div>
          </div>
        ) : null}

        {firstImport && !preparing ? (
          <div className="import-hero">
            {fileInput}
            <p className="eyebrow">First step</p>
            <h3>Import screening data</h3>
            <p>
              Drop an IFHAS/EAS CSV — or any extract with patient + finding columns. Extra metrics
              like <code>days_waiting</code> feed priority. Open <strong>Agents</strong> on any row
              to see the decision path.
            </p>
            {error ? <p className="import-error">{error}</p> : null}
            <div className="import-hero-actions">
              <button type="button" className="btn primary" onClick={onLoadDemo}>
                Restore demo board
              </button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                Import CSV
              </button>
              <button type="button" className="btn ghost" onClick={() => void onSample()}>
                Use example extract
              </button>
            </div>
          </div>
        ) : null}

        {hasBoard ? (
          <>
            <div className="kpi-row">
              <div className="kpi">
                <span>Open loops</span>
                <strong>{open.length}</strong>
              </div>
              <div className={`kpi ${breached ? "hot" : ""}`}>
                <span>SLA breach</span>
                <strong>{breached}</strong>
              </div>
              <div className="kpi ok">
                <span>Verified</span>
                <strong>{verified}</strong>
              </div>
              <div className={`kpi ${lost ? "warn" : ""}`}>
                <span>Lost</span>
                <strong>{lost}</strong>
              </div>
            </div>

            {escalatePool.length ? (
              <p className="banner bad" role="alert">
                Escalation: {urgentOpen.length} urgent · {breached} SLA breach
                {top ? ` — start with ${patientById(top.patientId).nameEn}.` : "."}
              </p>
            ) : null}

            <p className="muted board-hint">
              Tap a person to open their loop. Use <strong>Agents</strong> on a row for the green
              decision path (input → decision → output per node).
            </p>

            <div className="case-list">
              {ranked.map(({ case: row, score, reasons }) => {
                const patient = patientById(row.patientId);
                const result = resultById(row.resultId);
                const openRow = isOpen(row.stage);
                const hours = hoursOpen(row);
                const sla = planSlaRecovery(row, result);
                const run = runForCase(row);
                return (
                  <div
                    key={row.id}
                    className={`case-card-row ${row.urgency} ${sla.status !== "ok" ? "sla-hot" : ""}`}
                  >
                    <button
                      type="button"
                      className={`case-card ${row.urgency}`}
                      onClick={() => onOpen(row.id)}
                    >
                      <div className="case-card-top">
                        <div>
                          <h3>
                            {patient.nameEn}{" "}
                            <span className="ar">{patient.nameAr}</span>
                          </h3>
                          <p>
                            {result.labelEn} {result.value}
                            {result.unit ? ` ${result.unit}` : ""} · {result.program} ·{" "}
                            {Math.round(hours)} h open
                          </p>
                        </div>
                        <div className="case-card-tags">
                          <span className={`chip ${row.urgency}`}>{row.urgency}</span>
                          {sla.status === "breached" ? (
                            <span className="chip hot">SLA +{Math.round(sla.hoursOver)}h</span>
                          ) : sla.status === "approaching" ? (
                            <span className="chip warn">SLA soon</span>
                          ) : null}
                          <span className="chip">{STAGE_LABEL[row.stage].en}</span>
                        </div>
                      </div>
                      <div className="case-card-foot">
                        <span>{openRow ? sla.actionLabel : STAGE_LABEL[row.stage].en}</span>
                        <span className="risk-score">{score} risk</span>
                        <span className="muted">{reasons[0] || row.aiPriorityReason}</span>
                        <span className="open-cue">Open case →</span>
                      </div>
                    </button>
                    {run ? (
                      <button
                        type="button"
                        className="btn agents-row-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAgents(run);
                        }}
                      >
                        Agents
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {heldRuns.length && !preparing ? (
          <div className="held-list">
            <p className="eyebrow">Held by agents · not on board</p>
            <ul>
              {heldRuns.map((run) => (
                <li key={run.id}>
                  <div>
                    <strong>{run.patientName}</strong>
                    <span className="muted">
                      {run.status === "needs_fix"
                        ? run.issues
                            .filter((i) => i.severity === "error")
                            .map((i) => i.code)
                            .join(", ") || "needs fix"
                        : run.gateReason || run.classifiedFlag || "filtered"}
                    </span>
                  </div>
                  <span className={`chip ${run.status === "needs_fix" ? "warn" : ""}`}>
                    {run.status.replaceAll("_", " ")}
                  </span>
                  <button type="button" className="btn ghost" onClick={() => openAgents(run)}>
                    Agents
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {graphRun ? (
        <AgentGraph
          run={graphRun}
          onClose={() => setGraphRunId(null)}
          fixDraft={fixDraft}
          onFixChange={setFixDraft}
          onRerun={() => void submitRerun(graphRun)}
          rerunning={rerunning}
        />
      ) : null}
    </section>
  );
}
