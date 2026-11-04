import { useState } from "react";
import {
  AGENT_NODE_ORDER,
  type AgentNodeTrace,
  type AgentRun,
} from "../lib/agents/types";

type Props = {
  run: AgentRun;
  /** Highlight the live node during streaming (optional). */
  activeNodeId?: string | null;
  compact?: boolean;
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

function preview(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  try {
    const s = JSON.stringify(value);
    return s.length > 160 ? `${s.slice(0, 160)}…` : s;
  } catch {
    return String(value);
  }
}

export function AgentGraph({ run, activeNodeId, compact }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const byId = Object.fromEntries(run.nodes.map((n) => [n.id, n]));

  return (
    <div className={`agent-graph ${compact ? "compact" : ""}`}>
      <div className="agent-graph-head">
        <div>
          <p className="eyebrow">Agent pipeline</p>
          <strong>
            {run.patientName} · {run.finding}
          </strong>
          <p className="muted agent-graph-status">
            Outcome: <span className={`agent-pill ${run.status}`}>{run.status.replace("_", " ")}</span>
            {run.explainEn ? ` — ${run.explainEn}` : null}
          </p>
        </div>
      </div>

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

      <ol className="agent-node-rail" aria-label="Agent nodes">
        {AGENT_NODE_ORDER.map((id) => {
          const node = byId[id];
          const status = node?.status || (activeNodeId === id ? "running" : "pending");
          const isOpen = openId === id;
          return (
            <li
              key={id}
              className={`agent-node ${statusClass(status)} ${activeNodeId === id ? "live" : ""}`}
            >
              <button
                type="button"
                className="agent-node-btn"
                onClick={() => setOpenId(isOpen ? null : id)}
              >
                <span className="agent-node-label">{node?.label || id}</span>
                <span className="agent-node-state">{status}</span>
              </button>
              {node?.notes ? <p className="agent-node-notes">{node.notes}</p> : null}
              {isOpen && node ? (
                <div className="agent-node-io">
                  <p>
                    <span className="eyebrow">Input</span>
                    <code>{preview(node.input)}</code>
                  </p>
                  <p>
                    <span className="eyebrow">Output</span>
                    <code>{preview(node.output)}</code>
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Compact strip used on Case — opens full graph via callback. */
export function AgentGraphStrip({
  run,
  onOpen,
}: {
  run: AgentRun;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="agent-strip" onClick={onOpen}>
      <span className="eyebrow">How agents decided</span>
      <strong>
        {run.nodes.filter((n) => n.status === "ok" || n.status === "warn").length}/
        {run.nodes.length} nodes · {run.status.replace("_", " ")}
      </strong>
      <span className="muted">{run.priorityReason || run.gateReason || run.explainEn || "View graph"}</span>
    </button>
  );
}
