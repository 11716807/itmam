import { useState } from "react";
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
          { label: "Code", value: str(input.code) },
          { label: "Value", value: str(input.value) },
        ],
        outputs: [{ label: "Normalized", value: output.normalized ? "yes" : "—" }],
      };
    case "validate": {
      const issues = Array.isArray(output.issues)
        ? (output.issues as { code?: string; message?: string }[])
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
              ? issues.map((i) => i.code || i.message || "issue").join(", ")
              : "none",
          },
        ],
      };
    }
    case "enrich":
      return {
        decision,
        inputs: [
          { label: "Code", value: str(input.code) },
          { label: "Value", value: str(input.value) },
        ],
        outputs: [
          { label: "Classified", value: str(output.classifiedFlag) },
          { label: "Include", value: output.include ? "yes" : "no" },
        ],
      };
    case "gate":
      return {
        decision,
        inputs: [{ label: "Classified", value: str(input.classifiedFlag) }],
        outputs: [
          { label: "Pass", value: output.include ? "yes" : "no" },
          { label: "Reason", value: str(output.gateReason) },
        ],
      };
    case "priority":
      return {
        decision,
        inputs: [{ label: "Classified", value: str(input.classifiedFlag) }],
        outputs: [
          { label: "Urgency", value: str(output.urgency) },
          { label: "SLA", value: output.slaHours != null ? `${output.slaHours}h` : "—" },
          { label: "Specialty", value: str(output.specialty).replaceAll("_", " ") },
        ],
      };
    case "route":
      return {
        decision,
        inputs: [
          { label: "Urgency", value: str(input.urgency) },
          { label: "Gate", value: str(input.gate) },
        ],
        outputs: [
          { label: "Destination", value: str(output.destination) },
          { label: "Next", value: str(output.next) },
        ],
      };
    case "explain":
      return {
        decision,
        inputs: [{ label: "Status", value: str(input.status) }],
        outputs: [{ label: "Summary", value: str(output.explainEn) }],
      };
    default:
      return {
        decision,
        inputs: Object.entries(input)
          .slice(0, 4)
          .map(([label, value]) => ({ label, value: str(value) })),
        outputs: Object.entries(output)
          .slice(0, 4)
          .map(([label, value]) => ({ label, value: str(value) })),
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

export function AgentGraph({
  run,
  onClose,
  fixDraft,
  onFixChange,
  onRerun,
  rerunning,
}: Props) {
  const firstLive =
    (AGENT_NODE_ORDER.find((id) => {
      const n = run.nodes.find((x) => x.id === id);
      return n && n.status !== "skipped" && n.status !== "pending";
    }) as AgentNodeId | undefined) || "ingest";
  const [selectedId, setSelectedId] = useState<AgentNodeId>(firstLive);
  const byId = Object.fromEntries(run.nodes.map((n) => [n.id, n])) as Partial<
    Record<AgentNodeId, AgentNodeTrace>
  >;
  const selected = byId[selectedId];
  const facts = selected ? nodeFacts(selected) : null;
  const selectedName = AGENT_LABELS[selectedId];
  const rails: AgentGuardrailCheck[] =
    selected?.guardrails?.length
      ? selected.guardrails
      : AGENT_GUARDRAILS[selectedId].map((g) => ({
          ...g,
          status: "held" as const,
          detail: g.rule,
        }));
  const railHeld = rails.filter((r) => r.status !== "breached").length;

  return (
    <div className="agent-flow">
      <div className="agent-flow-top">
        <div>
          <p className="eyebrow">Agent harness</p>
          <p className="agent-flow-outcome">
            <span className={`agent-pill ${run.status}`}>
              {run.status.replaceAll("_", " ")}
            </span>
            {run.priorityReason || run.gateReason || run.explainEn ? (
              <span className="muted">
                {run.priorityReason || run.gateReason || run.explainEn}
              </span>
            ) : null}
          </p>
        </div>
        {onClose ? (
          <button type="button" className="text-link" onClick={onClose}>
            Hide
          </button>
        ) : null}
      </div>

      {run.issues.length ? (
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

      <div className="agent-harness" aria-label="Agent harness graph">
        <svg className="agent-harness-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <marker
              id="agent-arrow-live"
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
              id="agent-arrow-cut"
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
              id="agent-arrow-blocked"
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
              id="agent-arrow-filtered"
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
              id="agent-arrow-pending"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" />
            </marker>
          </defs>
          {AGENT_EDGES.map(([fromId, toId]) => {
            const cls = edgeClass(byId[fromId], byId[toId]);
            return (
              <path
                key={`${fromId}-${toId}`}
                className={`agent-harness-edge ${cls}`}
                d={edgePath(fromId, toId)}
                markerEnd={`url(#agent-arrow-${cls === "live" ? "live" : cls})`}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        <div className="agent-harness-grid">
          {AGENT_NODE_ORDER.map((id, index) => {
            const node = byId[id];
            const status = node?.status || "pending";
            const pos = AGENT_GRID[id];
            const name = AGENT_LABELS[id];
            const role = AGENT_ROLES[id];
            return (
              <button
                key={id}
                type="button"
                className={`agent-tile ${statusClass(status)} ${selectedId === id ? "on" : ""}`}
                style={{ gridColumn: pos.col + 1, gridRow: pos.row + 1 }}
                onClick={() => setSelectedId(id)}
                aria-pressed={selectedId === id}
              >
                <span className="agent-tile-kicker">
                  Agent {index + 1}
                  <span className={`agent-tile-status ${statusClass(status)}`}>
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

      {facts && selected ? (
        <div className="agent-flow-detail">
          <div className="agent-flow-decision">
            <p className="eyebrow">
              {selectedName} · {statusWord(selected.status)}
            </p>
            <p>{facts.decision}</p>
          </div>
          <div className="agent-guardrails">
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
          </div>
          <div className="agent-flow-cols">
            <div>
              <p className="eyebrow">Input</p>
              <dl>
                {facts.inputs.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <p className="eyebrow">Output</p>
              <dl>
                {facts.outputs.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      ) : null}

      {run.status === "needs_fix" && fixDraft && onFixChange && onRerun ? (
        <div className="agent-fix-panel">
          <p className="eyebrow">Fix · re-run harness</p>
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
                onChange={(e) => onFixChange({ ...fixDraft, days_waiting: e.target.value })}
              />
            </label>
          </div>
          <button type="button" className="btn primary" disabled={rerunning} onClick={onRerun}>
            {rerunning ? "Re-running…" : "Re-run agents"}
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
