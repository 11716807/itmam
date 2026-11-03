import { useRef, useState } from "react";
import { patientById, resultById } from "../data/seed";
import { parseImportCsv, SAMPLE_IMPORT_CSV, type ImportRow } from "../lib/importCsv";
import { hoursOpen, isOpen, slaBreached } from "../lib/loop";
import { streamPrepareBoard, type PrepareEvent } from "../lib/prepareBoard";
import { rankCases } from "../lib/priority";
import { resetRegistry, upsertPatient, upsertResult } from "../lib/registry";
import { planSlaRecovery } from "../lib/slaAction";
import type { RiskWeights } from "../lib/riskWeights";
import type { CareCase, ScreeningResult } from "../types";
import { STAGE_LABEL } from "../types";

type StreamLine = {
  id: string;
  tone: "info" | "ok" | "skip" | "warn";
  text: string;
};

type Props = {
  cases: CareCase[];
  importSource: string | null;
  preparing: boolean;
  riskWeights: RiskWeights;
  onOpen: (caseId: string) => void;
  onReset: () => void;
  onPrepareStart: () => void;
  onPrepareCase: (care: CareCase, source: string) => void;
  onPrepareDone: (placed: number, skipped: number) => void;
};

export function Board({
  cases,
  importSource,
  preparing,
  riskWeights,
  onOpen,
  onReset,
  onPrepareStart,
  onPrepareCase,
  onPrepareDone,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<StreamLine[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function clearStream() {
    setStream([]);
    setReading(null);
    setError(null);
  }

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
  const top = ranked[0];
  const hasBoard = cases.length > 0;
  const firstImport = !hasBoard;

  function pushLine(line: StreamLine) {
    setStream((prev) => [...prev.slice(-40), line]);
  }

  async function runPrepare(rows: ImportRow[], source: string) {
    setError(null);
    setStream([]);
    setReading(null);
    onPrepareStart();
    resetRegistry();
    for (const row of rows) {
      upsertPatient(row.patient);
      upsertResult(row.result);
    }

    try {
      for await (const event of streamPrepareBoard(rows)) {
        handleEvent(event, source);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      onPrepareDone(0, 0);
    } finally {
      setReading(null);
    }
  }

  function handleEvent(event: PrepareEvent, source: string) {
    if (event.type === "start") {
      pushLine({
        id: `start-${Date.now()}`,
        tone: "info",
        text: `Enriching ${event.total} findings — classifying actionable vs borderline…`,
      });
      return;
    }
    if (event.type === "reading") {
      setReading(`${event.name} · ${event.finding}`);
      pushLine({
        id: `read-${event.index}`,
        tone: "info",
        text: `${event.index}/${event.total} Enriching ${event.name} — ${event.finding}`,
      });
      return;
    }
    if (event.type === "decided") {
      if (event.skipped || !event.care) {
        pushLine({
          id: `skip-${event.index}`,
          tone: "skip",
          text: `Skip ${event.name} (${event.decision.classifiedFlag}): ${event.decision.priorityReason}`,
        });
        return;
      }
      onPrepareCase(event.care, source);
      pushLine({
        id: `place-${event.index}`,
        tone: "ok",
        text: `Board ← ${event.name} · ${event.decision.urgency} · ${event.decision.priorityReason}`,
      });
      return;
    }
    if (event.type === "done") {
      pushLine({
        id: `done-${Date.now()}`,
        tone: event.placed ? "ok" : "warn",
        text: `Done — ${event.placed} placed, ${event.skipped} skipped.`,
      });
      onPrepareDone(event.placed, event.skipped);
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
      <header className={`panel-head ${hasBoard ? "panel-head-tight" : ""}`}>
        <div>
          <p className="eyebrow">Care coordination</p>
          <h2>Close every actionable result</h2>
          {firstImport && !preparing ? (
            <p className="lede">
              Import a screening extract. Extra metric columns are enriched into urgency, specialty,
              and SLA — then only actionable loops land on this board.
            </p>
          ) : null}
        </div>
        {hasBoard ? (
          <div className="head-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={preparing}
              onClick={() => {
                clearStream();
                onReset();
              }}
            >
              Clear board
            </button>
          </div>
        ) : null}
      </header>

      <div className="panel-body">
        {/* After first import: slim strip at top — not a big dock */}
        {hasBoard || preparing ? (
          <div className={`import-bar ${preparing ? "busy" : ""}`}>
            {fileInput}
            <div className="import-bar-meta">
              <span className="eyebrow">Import</span>
              <strong>{preparing ? "Working on your file…" : importSource || "Extract loaded"}</strong>
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
              <button type="button" className="btn ghost" disabled={preparing} onClick={() => void onSample()}>
                Example file
              </button>
            </div>
          </div>
        ) : null}

        {preparing ? (
          <>
            <div className="working-banner" aria-live="polite">
              <div className="working-spinner" aria-hidden />
              <div className="working-copy">
                <strong>Working on your file…</strong>
                <p>
                  Reading each finding, enriching metrics, and placing only actionable loops on the
                  board.
                </p>
                {reading ? <p className="working-meta">Now: {reading}</p> : null}
              </div>
            </div>
            <div className={`stream-panel ${hasBoard ? "stream-panel-mini" : ""}`}>
              <div className="stream-head">
                <p className="eyebrow">Enrich stream</p>
                {reading ? <p className="stream-now">{reading}</p> : null}
              </div>
              {stream.length ? (
                <ol className="stream-log">
                  {(hasBoard ? stream.slice(-4) : stream).map((line) => (
                    <li key={line.id} className={`stream-line ${line.tone}`}>
                      {line.text}
                    </li>
                  ))}
                </ol>
              ) : null}
              <div className="stream-pulse" aria-hidden />
            </div>
          </>
        ) : null}

        {/* First visit: large import hero only */}
        {firstImport && !preparing ? (
          <div className="import-hero">
            {fileInput}
            <p className="eyebrow">First step</p>
            <h3>Import screening data</h3>
            <p>
              Drop an IFHAS/EAS CSV — or any extract with patient + finding columns. Extra metrics
              like <code>days_waiting</code> and <code>wearable_flag</code> enrich each row before
              it hits the board.
            </p>
            {error ? <p className="import-error">{error}</p> : null}
            <div className="import-hero-actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => fileRef.current?.click()}
              >
                Import CSV
              </button>
              <button type="button" className="btn" onClick={() => void onSample()}>
                Use example extract
              </button>
              <a className="btn ghost" href="/sample-ifhas-extract.csv" download>
                Download example
              </a>
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
              <p className="banner escalate" role="alert">
                Escalation: {urgentOpen.length} urgent
                {breached ? ` · ${breached} SLA breach` : ""} — start with{" "}
                <strong>
                  {patientById(
                    (escalatePool.find((c) => c.urgency === "urgent") ?? escalatePool[0]).patientId,
                  ).nameEn}
                </strong>
                {top ? ` (${top.reasons[0]})` : ""}.
              </p>
            ) : top ? (
              <p className="banner">
                Start here: <strong>{patientById(top.case.patientId).nameEn}</strong> —{" "}
                {top.reasons[0]}. Score {top.score}.
              </p>
            ) : (
              <p className="banner ok">All open loops are clear.</p>
            )}

            <p className="hint">
              Tap a person to open their full loop. SLA tags show breach / approaching on each row.
            </p>

            <div className="case-grid">
              {ranked.map(({ case: row, result, score, reasons }) => {
                const patient = patientById(row.patientId);
                const sla = planSlaRecovery(row, result);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`case-row ${sla.status === "breached" ? "breach" : ""} enter-case`}
                    onClick={() => onOpen(row.id)}
                  >
                    <div>
                      <h3>
                        {patient.nameEn}
                        <span className="name-ar">{patient.nameAr}</span>
                      </h3>
                      <p>
                        {result.labelEn} {result.value}
                        {result.unit ? ` ${result.unit}` : ""} · {result.program} ·{" "}
                        {hoursOpen(row).toFixed(0)}h open
                      </p>
                    </div>
                    <div>
                      <div className="case-row-tags">
                        <span className={`chip ${row.urgency}`}>{row.urgency}</span>
                        {sla.status === "breached" ? (
                          <span className="chip sla-tag breached">
                            SLA +{sla.hoursOver.toFixed(0)}h
                          </span>
                        ) : sla.status === "approaching" ? (
                          <span className="chip sla-tag approaching">SLA soon</span>
                        ) : null}
                      </div>
                      <p>{STAGE_LABEL[row.stage].en}</p>
                      {sla.status !== "ok" ? (
                        <p className="sla-row-action">{sla.actionLabel}</p>
                      ) : null}
                    </div>
                    <div>
                      <div className="score-pill">
                        <strong>{score}</strong>
                        <span className="muted">risk</span>
                      </div>
                      <p>{reasons[0]}</p>
                    </div>
                    <span className="case-cta">Open case →</span>
                  </button>
                );
              })}
            </div>

            {verified ? (
              <>
                <p className="section-label">Closed with verified outcome</p>
                <div className="case-grid">
                  {cases
                    .filter((c) => c.stage === "verified")
                    .map((row) => {
                      const patient = patientById(row.patientId);
                      const result = resultById(row.resultId);
                      return (
                        <button
                          key={row.id}
                          type="button"
                          className="case-row"
                          onClick={() => onOpen(row.id)}
                        >
                          <div>
                            <h3>
                              {patient.nameEn}
                              <span className="name-ar">{patient.nameAr}</span>
                            </h3>
                            <p>
                              {result.labelEn} · {row.visitNote || "Loop completed"}
                            </p>
                          </div>
                          <span className="chip ok">verified</span>
                          <div />
                          <span className="case-cta">View →</span>
                        </button>
                      );
                    })}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
