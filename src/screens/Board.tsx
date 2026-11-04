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
  const [liveRun, setLiveRun] = useState<AgentRun | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
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

  const placedRuns = useMemo(() => agentRuns.filter((r) => r.status === "placed"), [agentRuns]);
  const filteredRuns = useMemo(() => agentRuns.filter((r) => r.status === "filtered"), [agentRuns]);
  const needsFixRuns = useMemo(() => agentRuns.filter((r) => r.status === "needs_fix"), [agentRuns]);

  const selectedRun =
    (selectedRunId && agentRuns.find((r) => r.id === selectedRunId)) ||
    liveRun ||
    agentRuns[0] ||
    null;

  async function runPrepare(rows: ImportRow[], source: string) {
    setError(null);
    setReading(null);
    setLiveRun(null);
    setActiveNodeId(null);
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
          setLiveRun({
            id: event.runId,
            rowKey: "",
            patientName: event.name,
            finding: event.finding,
            status: "needs_fix",
            nodes: [],
            careId: null,
            issues: [],
            rawRow: rows[event.index - 1],
            finishedAt: new Date().toISOString(),
          });
          setActiveNodeId("ingest");
        } else if (event.type === "node") {
          setActiveNodeId(event.node.id);
          setLiveRun((prev) =>
            prev && prev.id === event.runId
              ? {
                  ...prev,
                  nodes: [
                    ...prev.nodes.filter((n) => n.id !== event.node.id),
                    event.node,
                  ],
                }
              : prev,
          );
        } else if (event.type === "row_done") {
          onAgentRun(event.result.run, event.result.care, source);
          setLiveRun(event.result.run);
          setSelectedRunId(event.result.run.id);
          setActiveNodeId(null);
        } else if (event.type === "batch_done") {
          onPrepareDone(event.placed, event.filtered, event.needsFix);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent pipeline failed");
      onPrepareDone(0, 0, 0);
    } finally {
      setReading(null);
      setActiveNodeId(null);
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

  function openFix(run: AgentRun) {
    setSelectedRunId(run.id);
    setFixDraft({
      value: run.editablePatch?.value ?? run.rawRow.result.value,
      name_en: run.editablePatch?.name_en ?? run.rawRow.patient.nameEn,
      age: run.editablePatch?.age ?? String(run.rawRow.patient.age),
      days_waiting: run.rawRow.metrics.days_waiting || "",
      notes: run.rawRow.metrics.notes || "",
    });
  }

  async function submitRerun(run: AgentRun) {
    setRerunning(true);
    setError(null);
    try {
      upsertPatient(run.rawRow.patient);
      upsertResult(run.rawRow.result);
      const result = await rerunAgentWithPatch(run, fixDraft);
      // Ensure registry has patched patient/result
      upsertPatient(result.run.rawRow.patient);
      upsertResult(result.run.rawRow.result);
      onReplaceAgentRun(result.run, result.care);
      setSelectedRunId(result.run.id);
      setLiveRun(result.run);
      if (result.run.status !== "needs_fix") {
        setFixDraft({});
      }
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
              Each finding runs a visible agent graph — validate, enrich, gate, prioritize, route.
              Filtered and bad-data rows stay visible so nothing is silently dropped.
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
                setLiveRun(null);
                setSelectedRunId(null);
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
              <span className="eyebrow">Import · agents</span>
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
              <strong>Agent pipeline…</strong>
              <p>
                Ingest → validate → enrich → gate → priority → route. Every decision is recorded on
                the graph.
              </p>
              {reading ? <p className="working-meta">Now: {reading}</p> : null}
            </div>
          </div>
        ) : null}

        {liveRun || (preparing && selectedRun) ? (
          <div className="agent-live-panel">
            <AgentGraph
              run={liveRun || selectedRun!}
              activeNodeId={activeNodeId}
              compact
            />
          </div>
        ) : null}

        {firstImport && !preparing ? (
          <div className="import-hero">
            {fileInput}
            <p className="eyebrow">First step</p>
            <h3>Run the agent pipeline on a screening extract</h3>
            <p>
              Agents classify actionable vs borderline, tag bad data for fix-and-re-run, and keep
              filtered rows visible. Extra metrics like <code>days_waiting</code> feed priority.
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

        {agentRuns.length && !preparing ? (
          <div className="agent-trays">
            <div className="agent-tray">
              <header>
                <p className="eyebrow">Placed</p>
                <strong>{placedRuns.length}</strong>
              </header>
              <ul>
                {placedRuns.map((run) => (
                  <li key={run.id}>
                    <button type="button" className="agent-tray-row" onClick={() => setSelectedRunId(run.id)}>
                      <span>
                        <strong>{run.patientName}</strong>
                        <em>{run.finding}</em>
                      </span>
                      <span className={`chip ${run.urgency || "routine"}`}>{run.urgency}</span>
                    </button>
                    {run.careId ? (
                      <button type="button" className="text-link" onClick={() => onOpen(run.careId!)}>
                        Open case →
                      </button>
                    ) : null}
                  </li>
                ))}
                {!placedRuns.length ? <li className="muted">None placed yet</li> : null}
              </ul>
            </div>

            <div className="agent-tray filtered">
              <header>
                <p className="eyebrow">Filtered / low priority</p>
                <strong>{filteredRuns.length}</strong>
              </header>
              <ul>
                {filteredRuns.map((run) => (
                  <li key={run.id}>
                    <button type="button" className="agent-tray-row" onClick={() => setSelectedRunId(run.id)}>
                      <span>
                        <strong>{run.patientName}</strong>
                        <em>{run.gateReason || run.priorityReason}</em>
                      </span>
                      <span className="chip">{run.classifiedFlag || "filtered"}</span>
                    </button>
                  </li>
                ))}
                {!filteredRuns.length ? <li className="muted">No filtered rows</li> : null}
              </ul>
            </div>

            <div className="agent-tray needs-fix">
              <header>
                <p className="eyebrow">Needs fix</p>
                <strong>{needsFixRuns.length}</strong>
              </header>
              <ul>
                {needsFixRuns.map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      className="agent-tray-row"
                      onClick={() => openFix(run)}
                    >
                      <span>
                        <strong>{run.patientName}</strong>
                        <em>
                          {run.issues
                            .filter((i) => i.severity === "error")
                            .map((i) => i.code)
                            .join(", ") || "Fix data"}
                        </em>
                      </span>
                      <span className="chip warn">fix</span>
                    </button>
                  </li>
                ))}
                {!needsFixRuns.length ? <li className="muted">No data errors</li> : null}
              </ul>
            </div>
          </div>
        ) : null}

        {selectedRun && !preparing ? (
          <div className="agent-detail">
            <AgentGraph run={selectedRun} />
            {selectedRun.status === "needs_fix" ? (
              <div className="agent-fix-panel">
                <p className="eyebrow">Fix tagged fields · re-run agents</p>
                <div className="agent-fix-grid">
                  <label className="field">
                    Value
                    <input
                      value={fixDraft.value ?? ""}
                      onChange={(e) => setFixDraft((d) => ({ ...d, value: e.target.value }))}
                      placeholder="e.g. 168/102"
                    />
                  </label>
                  <label className="field">
                    Name
                    <input
                      value={fixDraft.name_en ?? ""}
                      onChange={(e) => setFixDraft((d) => ({ ...d, name_en: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    Age
                    <input
                      value={fixDraft.age ?? ""}
                      onChange={(e) => setFixDraft((d) => ({ ...d, age: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    Days waiting
                    <input
                      value={fixDraft.days_waiting ?? ""}
                      onChange={(e) =>
                        setFixDraft((d) => ({ ...d, days_waiting: e.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="action-card-footer">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={rerunning}
                    onClick={() => void submitRerun(selectedRun)}
                  >
                    {rerunning ? "Re-running…" : "Re-run agents"}
                  </button>
                </div>
              </div>
            ) : null}
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
              Tap a person to open their full loop. Agent trays above show placed / filtered /
              needs-fix.
            </p>

            <div className="case-list">
              {ranked.map(({ case: row, score, reasons }) => {
                const patient = patientById(row.patientId);
                const result = resultById(row.resultId);
                const openRow = isOpen(row.stage);
                const hours = hoursOpen(row);
                const sla = planSlaRecovery(row, result);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`case-card ${row.urgency} ${sla.status !== "ok" ? "sla-hot" : ""}`}
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
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
