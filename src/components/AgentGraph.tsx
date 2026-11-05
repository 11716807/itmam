import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AGENT_GUARDRAILS } from "../lib/agents/guardrails";
import {
  AGENT_EDGES,
  AGENT_GRID,
  AGENT_LABELS,
  AGENT_NODE_ORDER,
  AGENT_ROLES,
  type AgentEditablePatch,
  type AgentGuardrailCheck,
  type AgentNodeId,
  type AgentNodeStatus,
  type AgentNodeTrace,
  type AgentRun,
} from "../lib/agents/types";

type Props = {
  run: AgentRun;
  onClose?: () => void;
  fixDraft?: AgentEditablePatch;
  onFixChange?: (patch: AgentEditablePatch) => void;
  onRerun?: () => void;
  rerunning?: boolean;
  /** Bumps after re-run so the graph scrolls into view and re-animates. */
  focusToken?: number;
  /** Progressive reveal during re-run (node ids completed so far). */
  revealThrough?: AgentNodeId | null;
};

type Fact = { label: string; value: string };

function statusClass(status: AgentNodeTrace["status"]): string {
  switch (status) {
    case "ok":
      return "ok";
    case "warn":
      return "warn";
    case "blocked":
      return "blocked";
    case "filtered":
      return "filtered";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

function statusWord(status: AgentNodeTrace["status"]): string {
  switch (status) {
    case "ok":
      return "passed";
    case "warn":
      return "warn";
    case "blocked":
      return "blocked";
    case "filtered":
      return "filtered";
    case "skipped":
      return "skipped";
    case "running":
      return "running";
    default:
      return "pending";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function entriesFrom(value: unknown, limit = 12): Fact[] {
  const rec = asRecord(value);
  return Object.entries(rec)
    .slice(0, limit)
    .map(([label, v]) => ({ label: label.replaceAll("_", " "), value: str(v) }));
}

/** Human facts for the selected agent — never dump raw JSON at judges. */
function nodeFacts(node: AgentNodeTrace): { decision: string; inputs: Fact[]; outputs: Fact[] } {
  const input = asRecord(node.input);
  const output = asRecord(node.output);
  const decision = node.notes || "—";

  switch (node.id) {
    case "ingest":
      return {
        decision,
        inputs: [
          { label: "Patient", value: str(input.name || input.patient_id) },
          { label: "Patient id", value: str(input.patient_id) },
          { label: "Code", value: str(input.code) },
          { label: "Value", value: str(input.value) },
          ...entriesFrom(input.metrics, 6).map((f) => ({
            label: `Metric · ${f.label}`,
            value: f.value,
          })),
        ],
        outputs: [
          { label: "Normalized", value: output.normalized ? "yes" : "—" },
          { label: "Row key", value: str(output.rowKey) },
        ],
      };
    case "validate": {
      const issues = Array.isArray(output.issues)
        ? (output.issues as { code?: string; field?: string; message?: string; severity?: string }[])
        : [];
      return {
        decision,
        inputs: [
          { label: "Value", value: str(input.value) },
          { label: "Age", value: str(input.age) },
          { label: "Code", value: str(input.code) },
        ],
        outputs: [
          { label: "Hard fail", value: output.hardFail ? "yes" : "no" },
          {
            label: "Issues",
            value: issues.length
              ? issues
                  .map(
                    (i) =>
                      `${i.code || "issue"}${i.field ? ` · ${i.field}` : ""}${i.message ? ` — ${i.message}` : ""}`,
                  )
                  .join("\n")
              : "none",
          },
        ],
      };
    }
    case "enrich": {
      const signals = asRecord(output.signals);
      return {
        decision,
        inputs: [
          { label: "Code", value: str(input.code) },
          { label: "Value", value: str(input.value) },
          ...entriesFrom(input.metrics, 6).map((f) => ({
            label: `Metric · ${f.label}`,
            value: f.value,
          })),
        ],
        outputs: [
          { label: "Classified", value: str(output.classifiedFlag) },
          { label: "Include", value: output.include ? "yes" : "no" },
          ...Object.entries(signals).map(([label, value]) => ({
            label: `Signal · ${label.replaceAll("_", " ")}`,
            value: str(value),
          })),
        ],
      };
    }
    case "gate":
      return {
        decision,
        inputs: [
          { label: "Classified", value: str(input.classifiedFlag) },
          ...entriesFrom(input, 8).filter((f) => f.label !== "classifiedFlag"),
        ],
        outputs: [
          { label: "Pass", value: output.include ? "yes" : "no" },
          { label: "Reason", value: str(output.gateReason) },
        ],
      };
    case "priority":
      return {
        decision,
        inputs: [
          { label: "Classified", value: str(input.classifiedFlag) },
          ...entriesFrom(input, 8).filter((f) => f.label !== "classifiedFlag"),
        ],
        outputs: [
          { label: "Urgency", value: str(output.urgency) },
          { label: "SLA", value: output.slaHours != null ? `${output.slaHours}h` : "—" },
          { label: "Specialty", value: str(output.specialty).replaceAll("_", " ") },
          { label: "Priority reason", value: str(output.priorityReason) },
        ],
      };
    case "route":
      return {
        decision,
        inputs: [
          { label: "Urgency", value: str(input.urgency) },
          { label: "Gate", value: str(input.gate) },
          ...entriesFrom(input, 8).filter(
            (f) => f.label !== "urgency" && f.label !== "gate",
          ),
        ],
        outputs: [
          { label: "Destination", value: str(output.destination) },
          { label: "Next", value: str(output.next) },
          { label: "Care id", value: str(output.careId) },
        ],
      };
    case "explain":
      return {
        decision,
        inputs: [{ label: "Status", value: str(input.status) }, ...entriesFrom(input, 6)],
        outputs: [{ label: "Summary", value: str(output.explainEn) }],
      };
    default:
      return {
        decision,
        inputs: entriesFrom(input),
        outputs: entriesFrom(output),
      };
  }
}

function edgeClass(
  from: AgentNodeTrace | undefined,
  to: AgentNodeTrace | undefined,
): string {
  if (!from || !to) return "pending";
  if (from.status === "ok" || from.status === "warn") {
    if (to.status === "skipped") return "cut";
    if (to.status === "blocked" || to.status === "filtered") return to.status;
    if (to.status === "ok" || to.status === "warn") return "live";
  }
  return "pending";
}

/** SVG path between two grid cells (4 cols × 2 rows). */
function edgePath(
  from: AgentNodeId,
  to: AgentNodeId,
): string {
  const a = AGENT_GRID[from];
  const b = AGENT_GRID[to];
  const cellW = 100 / 4;
  const cellH = 100 / 2;
  const x1 = a.col * cellW + cellW * 0.5;
  const y1 = a.row * cellH + cellH * 0.72;
  const x2 = b.col * cellW + cellW * 0.5;
  const y2 = b.row * cellH + cellH * 0.28;

  if (a.row === b.row) {
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  }
  if (a.col === b.col) {
    const mid = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
  }
  // gate (3,0) → priority (1,1): drop then left
  const dropY = a.row * cellH + cellH * 0.92;
  const riseY = b.row * cellH + cellH * 0.08;
  return `M ${x1} ${y1} L ${x1} ${dropY} L ${x2} ${riseY} L ${x2} ${y2}`;
}

function displayStatus(
  id: AgentNodeId,
  real: AgentNodeStatus | undefined,
  rerunning: boolean,
  revealThrough: AgentNodeId | null | undefined,
  pulseId: AgentNodeId | null,
): AgentNodeStatus {
  if (!rerunning) return real || "pending";
  const order = AGENT_NODE_ORDER;
  const revealIdx = revealThrough ? order.indexOf(revealThrough) : -1;
  const myIdx = order.indexOf(id);
  if (revealIdx >= 0) {
    if (myIdx < revealIdx) return real || "ok";
    if (myIdx === revealIdx) return real || "running";
    return "pending";
  }
  if (pulseId === id) return "running";
  const pulseIdx = pulseId ? order.indexOf(pulseId) : -1;
  if (pulseIdx >= 0 && myIdx < pulseIdx) return "pending";
  return "pending";
}

export function AgentGraph({
  run,
  onClose,
  fixDraft,
  onFixChange,
  onRerun,
  rerunning = false,
  focusToken = 0,
  revealThrough = null,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const firstLive =
    (AGENT_NODE_ORDER.find((id) => {
      const n = run.nodes.find((x) => x.id === id);
      return n && n.status !== "skipped" && n.status !== "pending";
    }) as AgentNodeId | undefined) || "ingest";
  const [selectedId, setSelectedId] = useState<AgentNodeId>(firstLive);
  const [popupOpen, setPopupOpen] = useState(false);
  const [pulseId, setPulseId] = useState<AgentNodeId | null>(null);
  const titleId = useId();
  const byId = Object.fromEntries(run.nodes.map((n) => [n.id, n])) as Partial<
    Record<AgentNodeId, AgentNodeTrace>
  >;

  useEffect(() => {
    if (!rerunning) {
      setPulseId(null);
      return;
    }
    setPopupOpen(false);
    if (revealThrough) {
      setPulseId(revealThrough);
      setSelectedId(revealThrough);
      return;
    }
    let i = 0;
    setPulseId(AGENT_NODE_ORDER[0]);
    setSelectedId(AGENT_NODE_ORDER[0]);
    const timer = window.setInterval(() => {
      i = (i + 1) % AGENT_NODE_ORDER.length;
      const next = AGENT_NODE_ORDER[i];
      setPulseId(next);
      setSelectedId(next);
    }, 320);
    return () => window.clearInterval(timer);
  }, [rerunning, revealThrough]);

  useEffect(() => {
    if (!focusToken) return;
    const el = rootRef.current;
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusToken]);

  useEffect(() => {
    if (rerunning) return;
    setSelectedId(firstLive);
    setPopupOpen(false);
  }, [run.finishedAt, firstLive, rerunning]);

  useEffect(() => {
    if (!popupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopupOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [popupOpen]);

  function openAgent(id: AgentNodeId) {
    if (rerunning) return;
    setSelectedId(id);
    setPopupOpen(true);
  }

  const selected = byId[selectedId];
  const selectedStatus = selected?.status || "pending";
  const facts =
    popupOpen && !rerunning
      ? selected
        ? nodeFacts(selected)
        : {
            decision: "This agent has not run yet on this row.",
            inputs: [] as Fact[],
            outputs: [] as Fact[],
          }
      : null;
  const selectedName = AGENT_LABELS[selectedId];
  const selectedRole = AGENT_ROLES[selectedId];
  const rails: AgentGuardrailCheck[] =
    selected?.guardrails?.length
      ? selected.guardrails
      : AGENT_GUARDRAILS[selectedId].map((g) => ({
          ...g,
          status: "held" as const,
          detail: g.rule,
        }));
  const railHeld = rails.filter((r) => r.status !== "breached").length;
  const showFix = run.status === "needs_fix" && fixDraft && onFixChange && onRerun;
  const agentIndex = AGENT_NODE_ORDER.indexOf(selectedId) + 1;

  return (
    <div
      ref={rootRef}
      className={`agent-flow ${rerunning ? "is-rerunning" : ""}`}
      data-agent-run={run.id}
    >
      <div className="agent-flow-top">
        <div>
          <p className="eyebrow">Agent harness</p>
          <p className="agent-flow-outcome">
            {rerunning ? (
              <span className="agent-pill running">re-running</span>
            ) : (
              <span className={`agent-pill ${run.status}`}>
                {run.status.replaceAll("_", " ")}
              </span>
            )}
            {rerunning ? (
              <span className="muted">Walking Ingest → Explain with your fix…</span>
            ) : run.priorityReason || run.gateReason || run.explainEn ? (
              <span className="muted">
                {run.priorityReason || run.gateReason || run.explainEn}
              </span>
            ) : null}
          </p>
        </div>
        {onClose && !rerunning ? (
          <button type="button" className="text-link" onClick={onClose}>
            Hide
          </button>
        ) : null}
      </div>

      {!rerunning && run.issues.length ? (
        <ul className="agent-issue-list">
          {run.issues.map((issue) => (
            <li key={`${issue.code}-${issue.field}`} className={issue.severity}>
              <span className="agent-tag">{issue.code}</span>
              <span>
                <strong>{issue.field}</strong> — {issue.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="agent-harness" aria-label="Agent harness graph" aria-busy={rerunning}>
        {rerunning ? (
          <div className="agent-rerun-banner" aria-live="polite">
            <div className="working-spinner" aria-hidden />
            <div>
              <strong>Re-running agents</strong>
              <p>
                {revealThrough
                  ? `${AGENT_LABELS[revealThrough]}…`
                  : pulseId
                    ? `${AGENT_LABELS[pulseId]}…`
                    : "Starting harness…"}
              </p>
            </div>
          </div>
        ) : null}
        <svg className="agent-harness-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <marker
              id={`agent-arrow-live-${run.id}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#059669" />
            </marker>
            <marker
              id={`agent-arrow-cut-${run.id}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
            <marker
              id={`agent-arrow-blocked-${run.id}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
            </marker>
            <marker
              id={`agent-arrow-filtered-${run.id}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#4f46e5" />
            </marker>
            <marker
              id={`agent-arrow-pending-${run.id}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" />
            </marker>
            <marker
              id={`agent-arrow-running-${run.id}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#0d5c63" />
            </marker>
          </defs>
          {AGENT_EDGES.map(([fromId, toId]) => {
            const fromStatus = displayStatus(
              fromId,
              byId[fromId]?.status,
              rerunning,
              revealThrough,
              pulseId,
            );
            const toStatus = displayStatus(
              toId,
              byId[toId]?.status,
              rerunning,
              revealThrough,
              pulseId,
            );
            const fromNode = byId[fromId]
              ? { ...byId[fromId]!, status: fromStatus }
              : ({ status: fromStatus } as AgentNodeTrace);
            const toNode = byId[toId]
              ? { ...byId[toId]!, status: toStatus }
              : ({ status: toStatus } as AgentNodeTrace);
            const cls = rerunning
              ? fromStatus === "running" || toStatus === "running"
                ? "running"
                : fromStatus === "pending" || toStatus === "pending"
                  ? "pending"
                  : edgeClass(fromNode, toNode)
              : edgeClass(byId[fromId], byId[toId]);
            const marker =
              cls === "live"
                ? "live"
                : cls === "running"
                  ? "running"
                  : cls;
            return (
              <path
                key={`${fromId}-${toId}`}
                className={`agent-harness-edge ${cls}`}
                d={edgePath(fromId, toId)}
                markerEnd={`url(#agent-arrow-${marker}-${run.id})`}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        <div className="agent-harness-grid">
          {AGENT_NODE_ORDER.map((id, index) => {
            const node = byId[id];
            const status = displayStatus(
              id,
              node?.status,
              rerunning,
              revealThrough,
              pulseId,
            );
            const pos = AGENT_GRID[id];
            const name = AGENT_LABELS[id];
            const role = AGENT_ROLES[id];
            return (
              <button
                key={id}
                type="button"
                className={`agent-tile ${statusClass(status)} ${selectedId === id ? "on" : ""}`}
                style={{
                  gridColumn: pos.col + 1,
                  gridRow: pos.row + 1,
                  animationDelay: rerunning ? "0ms" : `${index * 45}ms`,
                }}
                onClick={() => openAgent(id)}
                aria-pressed={selectedId === id && popupOpen}
                aria-haspopup="dialog"
                disabled={rerunning}
              >
                <span className="agent-tile-kicker">
                  Agent {index + 1}
                  <span className={`agent-tile-status ${statusClass(status)}`}>
                    {status === "running" ? (
                      <span className="agent-tile-spin" aria-hidden />
                    ) : null}
                    {statusWord(status)}
                  </span>
                </span>
                <strong className="agent-tile-name">{name}</strong>
                <span className="agent-tile-role">{role}</span>
                <span className="agent-tile-rails">
                  {(node?.guardrails || AGENT_GUARDRAILS[id]).length} guardrails
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!rerunning ? (
        <p className="agent-click-hint muted">Click any agent tile to open input · output · guardrails</p>
      ) : (
        <div className="agent-rerun-detail" aria-hidden>
          <div className="working-skeleton">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}

      {popupOpen && facts
        ? createPortal(
            <div
              className="agent-pop-backdrop"
              role="presentation"
              onClick={() => setPopupOpen(false)}
            >
              <div
                className="agent-pop"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(e) => e.stopPropagation()}
              >
                <header className="agent-pop-head">
                  <div>
                    <p className="eyebrow">
                      Agent {agentIndex} · {statusWord(selectedStatus)}
                    </p>
                    <h3 id={titleId}>{selectedName}</h3>
                    <p className="muted">{selectedRole}</p>
                  </div>
                  <button
                    type="button"
                    className="btn ghost agent-pop-close"
                    onClick={() => setPopupOpen(false)}
                  >
                    Close
                  </button>
                </header>

                <div className="agent-pop-decision">
                  <p className="eyebrow">Decision</p>
                  <p>{facts.decision}</p>
                  {selected ? (
                    <p className="agent-pop-meta muted">
                      {selected.startedAt
                        ? `Started ${selected.startedAt.slice(11, 19)}`
                        : null}
                      {selected.finishedAt
                        ? ` · Finished ${selected.finishedAt.slice(11, 19)}`
                        : null}
                    </p>
                  ) : null}
                </div>

                <div className="agent-pop-cols">
                  <section>
                    <p className="eyebrow">Input</p>
                    <dl>
                      {facts.inputs.length ? (
                        facts.inputs.map((f) => (
                          <div key={`in-${f.label}`}>
                            <dt>{f.label}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        ))
                      ) : (
                        <div>
                          <dd className="muted">No input captured</dd>
                        </div>
                      )}
                    </dl>
                  </section>
                  <section>
                    <p className="eyebrow">Output</p>
                    <dl>
                      {facts.outputs.length ? (
                        facts.outputs.map((f) => (
                          <div key={`out-${f.label}`}>
                            <dt>{f.label}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        ))
                      ) : (
                        <div>
                          <dd className="muted">No output captured</dd>
                        </div>
                      )}
                    </dl>
                  </section>
                </div>

                <section className="agent-pop-rails">
                  <p className="eyebrow">
                    Guardrails · {railHeld}/{rails.length} held
                  </p>
                  <ul>
                    {rails.map((rail) => (
                      <li key={rail.id} className={`guardrail ${rail.status}`}>
                        <span className="guardrail-status">{rail.status}</span>
                        <div>
                          <strong>{rail.rule}</strong>
                          <p>{rail.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <nav className="agent-pop-nav" aria-label="Other agents">
                  {AGENT_NODE_ORDER.map((id, index) => {
                    const node = byId[id];
                    const status = node?.status || "pending";
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`agent-pop-chip ${statusClass(status)} ${id === selectedId ? "on" : ""}`}
                        onClick={() => openAgent(id)}
                      >
                        <span>{index + 1}</span>
                        {AGENT_LABELS[id].replace(" Agent", "")}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>,
            document.body,
          )
        : null}

      {showFix ? (
        <div className={`agent-fix-panel ${rerunning ? "is-busy" : ""}`}>
          <p className="eyebrow">Fix · re-run harness</p>
          <div className="agent-fix-grid">
            <label className="field">
              Value
              <input
                value={fixDraft.value ?? ""}
                onChange={(e) => onFixChange({ ...fixDraft, value: e.target.value })}
                placeholder="e.g. 168/102"
                disabled={rerunning}
              />
            </label>
            <label className="field">
              Name
              <input
                value={fixDraft.name_en ?? ""}
                onChange={(e) => onFixChange({ ...fixDraft, name_en: e.target.value })}
                disabled={rerunning}
              />
            </label>
            <label className="field">
              Age
              <input
                value={fixDraft.age ?? ""}
                onChange={(e) => onFixChange({ ...fixDraft, age: e.target.value })}
                disabled={rerunning}
              />
            </label>
            <label className="field">
              Days waiting
              <input
                value={fixDraft.days_waiting ?? ""}
                onChange={(e) => onFixChange({ ...fixDraft, days_waiting: e.target.value })}
                disabled={rerunning}
              />
            </label>
          </div>
          <button type="button" className="btn primary" disabled={rerunning} onClick={onRerun}>
            {rerunning ? (
              <>
                <span className="btn-spinner" aria-hidden />
                Re-running…
              </>
            ) : (
              "Re-run agents"
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AgentGraphStrip({
  run,
  onOpen,
}: {
  run: AgentRun;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="agent-strip" onClick={onOpen}>
      <span className="eyebrow">Agent harness</span>
      <strong>Show named agents · Ingest → Explain</strong>
      <span className="muted">{run.status.replaceAll("_", " ")}</span>
    </button>
  );
}
