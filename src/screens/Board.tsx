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
import { buildLoopAssist } from "../lib/loopAssist";
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
  const [rerunFocus, setRerunFocus] = useState(0);
  const [revealThrough, setRevealThrough] = useState<AgentRun["nodes"][number]["id"] | null>(
    null,
  );
  const [liveRerun, setLiveRerun] = useState<AgentRun | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [closedOpen, setClosedOpen] = useState(true);

  const resultsById = Object.fromEntries(
    cases.map((c) => [c.resultId, resultById(c.resultId)]),
  ) as Record<string, ScreeningResult>;

  const open = cases.filter((c) => isOpen(c.stage));
  const closed = useMemo(
    () =>
      cases
        .filter((c) => c.stage === "verified" || c.stage === "lost")
        .sort((a, b) => {
          const aAt = a.verifiedAt || a.lostAt || a.openedAt;
          const bAt = b.verifiedAt || b.lostAt || b.openedAt;
          return bAt.localeCompare(aAt);
        }),
    [cases],
  );
  const verified = closed.filter((c) => c.stage === "verified").length;
  const lost = closed.filter((c) => c.stage === "lost").length;
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

  function runForCase(care: CareCase): AgentRun | undefined {
    return agentRuns.find((r) => r.id === care.agentRunId || r.careId === care.id);
  }

  function toggleAgents(run: AgentRun) {
    if (graphRunId === run.id) {
      setGraphRunId(null);
      return;
    }
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

  function scrollToRun(runId: string) {
    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-agent-run="${runId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function submitRerun(run: AgentRun) {
    setError(null);
    setHeldOpen(true);
    setGraphRunId(run.id);
    setFixDraft((current) => ({
      value: current.value ?? run.editablePatch?.value ?? run.rawRow.result.value,
      name_en: current.name_en ?? run.editablePatch?.name_en ?? run.rawRow.patient.nameEn,
      age: current.age ?? run.editablePatch?.age ?? String(run.rawRow.patient.age),
      days_waiting: current.days_waiting ?? (run.rawRow.metrics.days_waiting || ""),
      notes: current.notes ?? (run.rawRow.metrics.notes || ""),
    }));
    setRevealThrough(null);
    setLiveRerun(null);
    setRerunning(true);
    setRerunFocus((n) => n + 1);
    scrollToRun(run.id);

    try {
      upsertPatient(run.rawRow.patient);
      upsertResult(run.rawRow.result);
      const result = await rerunAgentWithPatch(run, fixDraft);
      upsertPatient(result.run.rawRow.patient);
      upsertResult(result.run.rawRow.result);

      // Show the new harness path node-by-node before swapping board state.
      setLiveRerun(result.run);
      for (const node of result.run.nodes) {
        setRevealThrough(node.id);
        await new Promise((r) => window.setTimeout(r, 120));
      }

      onReplaceAgentRun(result.run, result.care);
      setGraphRunId(result.run.id);
      setRevealThrough(null);
      setLiveRerun(null);
      setRerunning(false);
      setRerunFocus((n) => n + 1);
      window.setTimeout(() => scrollToRun(result.run.id), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-run failed");
      setRevealThrough(null);
      setLiveRerun(null);
      setRerunning(false);
    }
  }

  function graphFor(run: AgentRun): AgentRun {
    return liveRerun && liveRerun.id === run.id ? liveRerun : run;
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
              Import a screening extract. Agents validate and prioritize each row — expand{" "}
              <strong>How decided</strong> on any person to see the path.
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
              like <code>days_waiting</code> feed priority. Expand <strong>How decided</strong> on
              any row to inspect the agent path.
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
            <div className="stat-strip" aria-label="Board summary">
              <div className="stat">
                <span>Open</span>
                <strong>{open.length}</strong>
              </div>
              <div className={`stat ${breached ? "hot" : ""}`}>
                <span>SLA breach</span>
                <strong>{breached}</strong>
              </div>
              <div className="stat ok">
                <span>Verified</span>
                <strong>{verified}</strong>
              </div>
              <div className={`stat ${lost ? "warn" : ""}`}>
                <span>Lost</span>
                <strong>{lost}</strong>
              </div>
            </div>

            {escalatePool.length && top ? (
              <div className="escalate-bar" role="alert">
                <div>
                  <strong>
                    {urgentOpen.length} urgent · {breached} SLA breach
                  </strong>
                  <span>Start with {patientById(top.patientId).nameEn}</span>
                </div>
                <button type="button" className="btn primary" onClick={() => onOpen(top.id)}>
                  Open {patientById(top.patientId).nameEn.split(" ")[0]} →
                </button>
              </div>
            ) : null}

            {ranked.length ? (
              <div className="case-grid">
                {ranked.map(({ case: row, score, reasons }) => {
                  const patient = patientById(row.patientId);
                  const result = resultById(row.resultId);
                  const sla = planSlaRecovery(row, result);
                  const assist = buildLoopAssist(row);
                  const run = runForCase(row);
                  const expanded = Boolean(run && graphRunId === run.id);
                  return (
                    <article
                      key={row.id}
                      className={`case-block ${expanded ? "expanded" : ""}`}
                    >
                      <button
                        type="button"
                        className={`case-row ${sla.status === "breached" ? "breach" : ""} enter-case`}
                        onClick={() => onOpen(row.id)}
                      >
                        <div className="case-row-main">
                          <h3>
                            {patient.nameEn}
                            <span className="name-ar">{patient.nameAr}</span>
                          </h3>
                          <p>
                            {result.labelEn} {result.value}
                            {result.unit ? ` ${result.unit}` : ""} · {result.program} ·{" "}
                            {hoursOpen(row).toFixed(0)}h open
                          </p>
                          <div className="case-row-tags">
                            <span className={`chip ${row.urgency}`}>{row.urgency}</span>
                            {sla.status === "breached" ? (
                              <span className="chip sla-tag breached">
                                SLA +{sla.hoursOver.toFixed(0)}h
                              </span>
                            ) : sla.status === "approaching" ? (
                              <span className="chip sla-tag approaching">SLA soon</span>
                            ) : null}
                            <span className="chip stage-chip">{STAGE_LABEL[row.stage].en}</span>
                          </div>
                        </div>
                        <div className="case-row-side">
                          <div className="score-pill">
                            <strong>{score}</strong>
                            <span className="muted">risk</span>
                          </div>
                          <p className="case-row-why">{reasons[0] || row.aiPriorityReason}</p>
                          {sla.status !== "ok" ? (
                            <p className="sla-row-action">{sla.actionLabel}</p>
                          ) : (
                            <p className="case-cta">{assist.boardLine} →</p>
                          )}
                        </div>
                      </button>
                      {run ? (
                        <div className="case-row-tools">
                          <button
                            type="button"
                            className={`how-decided ${expanded ? "on" : ""}`}
                            onClick={() => toggleAgents(run)}
                            aria-expanded={expanded}
                          >
                            {expanded ? "Hide agent harness" : "How decided · agent harness"}
                          </button>
                        </div>
                      ) : null}
                      {expanded && run ? (
                        <AgentGraph
                          run={graphFor(run)}
                          fixDraft={fixDraft}
                          onFixChange={setFixDraft}
                          onRerun={() => void submitRerun(run)}
                          rerunning={rerunning && graphRunId === run.id}
                          focusToken={graphRunId === run.id ? rerunFocus : 0}
                          revealThrough={
                            rerunning && graphRunId === run.id ? revealThrough : null
                          }
                        />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="muted board-empty-open">No open loops — closed cases are below.</p>
            )}

            {closed.length ? (
              <div className="held-list closed-list">
                <button
                  type="button"
                  className="held-toggle"
                  onClick={() => setClosedOpen((v) => !v)}
                  aria-expanded={closedOpen}
                >
                  <span className="eyebrow">Closed</span>
                  <strong>
                    {verified} verified · {lost} lost
                  </strong>
                  <span className="held-chevron">{closedOpen ? "Hide" : "Show"}</span>
                </button>
                {closedOpen ? (
                  <div className="case-grid">
                    {closed.map((row) => {
                      const patient = patientById(row.patientId);
                      const result = resultById(row.resultId);
                      const assist = buildLoopAssist(row);
                      return (
                        <article key={row.id} className="case-block closed">
                          <button
                            type="button"
                            className={`case-row enter-case ${row.stage === "lost" ? "closed-lost" : "closed-verified"}`}
                            onClick={() => onOpen(row.id)}
                          >
                            <div className="case-row-main">
                              <h3>
                                {patient.nameEn}
                                <span className="name-ar">{patient.nameAr}</span>
                              </h3>
                              <p>
                                {result.labelEn} {result.value}
                                {result.unit ? ` ${result.unit}` : ""} · {result.program}
                              </p>
                              <div className="case-row-tags">
                                <span
                                  className={`chip stage-chip ${row.stage === "verified" ? "ok" : "warn"}`}
                                >
                                  {STAGE_LABEL[row.stage].en}
                                </span>
                                {row.stage === "lost" && row.lostReason ? (
                                  <span className="chip warn">
                                    {row.lostReason.replaceAll("_", " ")}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="case-row-side">
                              <p className="case-cta">{assist.boardLine} →</p>
                            </div>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {heldRuns.length && !preparing ? (
          <div className="held-list">
            <button
              type="button"
              className="held-toggle"
              onClick={() => setHeldOpen((v) => !v)}
              aria-expanded={heldOpen}
            >
              <span className="eyebrow">Not on board</span>
              <strong>
                {heldRuns.filter((r) => r.status === "needs_fix").length} need fix ·{" "}
                {heldRuns.filter((r) => r.status === "filtered").length} filtered
              </strong>
              <span className="held-chevron">{heldOpen ? "Hide" : "Show"}</span>
            </button>
            {heldOpen ? (
              <div className="case-grid">
                {heldRuns.map((run) => {
                  const expanded = graphRunId === run.id;
                  return (
                    <article
                      key={run.id}
                      className={`case-block held ${run.status} ${expanded ? "expanded" : ""}`}
                    >
                      <div className={`case-row held-row ${run.status === "needs_fix" ? "breach" : ""}`}>
                        <div className="case-row-main">
                          <h3>{run.patientName}</h3>
                          <p>{run.finding}</p>
                          <div className="case-row-tags">
                            <span className={`chip ${run.status === "needs_fix" ? "urgent" : "soon"}`}>
                              {run.status.replaceAll("_", " ")}
                            </span>
                          </div>
                        </div>
                        <div className="case-row-side">
                          <p className="held-reason">
                            {run.status === "needs_fix"
                              ? run.issues
                                  .filter((i) => i.severity === "error")
                                  .map((i) => i.message)
                                  .join(" · ") || "Fix data and re-run"
                              : run.gateReason || "Filtered — no closed loop"}
                          </p>
                        </div>
                      </div>
                      <div className="case-row-tools">
                        <button
                          type="button"
                          className={`how-decided ${expanded ? "on" : ""}`}
                          onClick={() => toggleAgents(run)}
                          aria-expanded={expanded}
                        >
                          {expanded ? "Hide agent harness" : "How decided · agent harness"}
                        </button>
                      </div>
                      {expanded ? (
                        <AgentGraph
                          run={graphFor(run)}
                          fixDraft={fixDraft}
                          onFixChange={setFixDraft}
                          onRerun={() => void submitRerun(run)}
                          rerunning={rerunning && graphRunId === run.id}
                          focusToken={graphRunId === run.id ? rerunFocus : 0}
                          revealThrough={
                            rerunning && graphRunId === run.id ? revealThrough : null
                          }
                        />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
