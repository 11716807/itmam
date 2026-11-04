import { useState } from "react";
import {
  AGENT_NODE_ORDER,
  type AgentEditablePatch,
  type AgentNodeId,
  type AgentNodeTrace,
  type AgentRun,
} from "../lib/agents/types";

type Props = {
  run: AgentRun;
  onClose?: () => void;
  /** Optional fix form for needs_fix runs */
  fixDraft?: AgentEditablePatch;
  onFixChange?: (patch: AgentEditablePatch) => void;
  onRerun?: () => void;
  rerunning?: boolean;
};

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
    case "running":
      return "running";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

function pretty(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function decisionText(node: AgentNodeTrace): string {
  if (node.notes) return node.notes;
  const out = node.output;
  if (out && typeof out === "object" && "gateReason" in (out as object)) {
    return String((out as { gateReason?: string }).gateReason);
  }
  if (out && typeof out === "object" && "priorityReason" in (out as object)) {
    return String((out as { priorityReason?: string }).priorityReason);
  }
  return statusClass(node.status);
}

function pathEdgeClass(
  from: AgentNodeTrace | undefined,
  to: AgentNodeTrace | undefined,
): string {
  if (!from || !to) return "pending";
  if (from.status === "ok" || from.status === "warn") {
    if (to.status === "skipped") return "cut";
    if (to.status === "blocked" || to.status === "filtered") return to.status;
    if (to.status === "ok" || to.status === "warn") return "green";
  }
  return "pending";
}

export function AgentGraph({
  run,
  onClose,
  fixDraft,
  onFixChange,
  onRerun,
  rerunning,
}: Props) {
  const [selectedId, setSelectedId] = useState<AgentNodeId | null>("ingest");
  const byId = Object.fromEntries(run.nodes.map((n) => [n.id, n])) as Partial<
    Record<AgentNodeId, AgentNodeTrace>
  >;
  const selected = selectedId ? byId[selectedId] : undefined;

  return (
    <div className="agent-modal" role="dialog" aria-modal="true" aria-label="Agent graph">
      <div className="agent-modal-card">
        <header className="agent-modal-head">
          <div>
            <p className="eyebrow">Agent graph</p>
            <h3>
              {run.patientName} · {run.finding}
            </h3>
            <p className="muted">
              Outcome:{" "}
              <span className={`agent-pill ${run.status}`}>
                {run.status.replaceAll("_", " ")}
              </span>
              {" · "}
              Click a node to inspect input, decision, and output. Green path = successful flow.
            </p>
          </div>
          {onClose ? (
            <button type="button" className="btn ghost" onClick={onClose}>
              Close
            </button>
          ) : null}
        </header>

        {run.issues.length ? (
          <ul className="agent-issue-list">
            {run.issues.map((issue) => (
              <li key={`${issue.code}-${issue.field}`} className={issue.severity}>
                <span className="agent-tag">{issue.code}</span>
                <span>
                  <strong>{issue.field}</strong>: {issue.message}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="agent-path" aria-label="Agent data flow">
          {AGENT_NODE_ORDER.map((id, index) => {
            const node = byId[id];
            const status = node?.status || "pending";
            const nextId = AGENT_NODE_ORDER[index + 1];
            const next = nextId ? byId[nextId] : undefined;
            const edge = nextId ? pathEdgeClass(node, next) : null;
            return (
              <div key={id} className="agent-path-item">
                <button
                  type="button"
                  className={`agent-path-node ${statusClass(status)} ${selectedId === id ? "selected" : ""}`}
                  onClick={() => setSelectedId(id)}
                >
                  <span className="agent-path-dot" aria-hidden />
                  <span className="agent-path-label">{node?.label || id}</span>
                  <span className="agent-path-state">{status}</span>
                </button>
                {edge ? (
                  <div className={`agent-path-edge ${edge}`} aria-hidden>
                    <span />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="agent-inspect">
          {selected ? (
            <>
              <div className="agent-inspect-head">
                <p className="eyebrow">{selected.label} · {selected.status}</p>
                <strong>Decision</strong>
                <p>{decisionText(selected)}</p>
              </div>
              <div className="agent-inspect-grid">
                <section>
                  <p className="eyebrow">Input</p>
                  <pre>{pretty(selected.input)}</pre>
                </section>
                <section>
                  <p className="eyebrow">Output</p>
                  <pre>{pretty(selected.output)}</pre>
                </section>
              </div>
            </>
          ) : (
            <p className="muted">Select a node on the green path to inspect data flow.</p>
          )}
        </div>

        {run.status === "needs_fix" && fixDraft && onFixChange && onRerun ? (
          <div className="agent-fix-panel">
            <p className="eyebrow">Fix tagged fields · re-run agents</p>
            <div className="agent-fix-grid">
              <label className="field">
                Value
                <input
                  value={fixDraft.value ?? ""}
                  onChange={(e) => onFixChange({ ...fixDraft, value: e.target.value })}
                  placeholder="e.g. 168/102"
                />
              </label>
              <label className="field">
                Name
                <input
                  value={fixDraft.name_en ?? ""}
                  onChange={(e) => onFixChange({ ...fixDraft, name_en: e.target.value })}
                />
              </label>
              <label className="field">
                Age
                <input
                  value={fixDraft.age ?? ""}
                  onChange={(e) => onFixChange({ ...fixDraft, age: e.target.value })}
                />
              </label>
              <label className="field">
                Days waiting
                <input
                  value={fixDraft.days_waiting ?? ""}
                  onChange={(e) =>
                    onFixChange({ ...fixDraft, days_waiting: e.target.value })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="btn primary"
              disabled={rerunning}
              onClick={onRerun}
            >
              {rerunning ? "Re-running…" : "Re-run agents"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Case screen opener — opens the same modal graph. */
export function AgentGraphStrip({
  run,
  onOpen,
}: {
  run: AgentRun;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="agent-strip" onClick={onOpen}>
      <span className="eyebrow">Agents</span>
      <strong>View agent graph</strong>
      <span className="muted">
        {run.status.replaceAll("_", " ")} · green path · click nodes for I/O
      </span>
    </button>
  );
}
