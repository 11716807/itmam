import { useEffect, useRef, useState } from "react";
import { AGENT_LABEL, type LoopAssist } from "../lib/loopAssist";

type Props = {
  assist: LoopAssist;
  /** Optional one-click apply for the current stage suggestion. */
  applyLabel?: string;
  onApply?: () => void;
  applyDisabled?: boolean;
  /** Strong pick callout (owner / slot name). */
  pickLabel?: string;
  pickWhy?: string;
  pickSelected?: boolean;
};

/**
 * Loop-assist strip with agent status + suggested pick.
 */
export function LoopAssistBar({
  assist,
  applyLabel,
  onApply,
  applyDisabled,
  pickLabel,
  pickWhy,
  pickSelected,
}: Props) {
  const loading = assist.llmStatus === "loading";
  const blocked = assist.llmStatus === "blocked" || assist.llmStatus === "error";
  const applied = Boolean(pickSelected || applyDisabled);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  useEffect(() => {
    // Clear click flash when the suggestion changes stage/agent.
    setFlash(false);
  }, [assist.agent, assist.ownerId, assist.slotId, assist.draftMessage]);

  function handleApply() {
    if (!onApply || loading || applyDisabled) return;
    setFlash(true);
    if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 450);
    onApply();
  }

  return (
    <div
      className={`loop-assist ${pickLabel ? "has-pick" : ""} ${loading ? "is-loading" : ""} ${blocked ? "is-blocked" : ""} ${applied ? "is-applied" : ""}`}
    >
      <div className="loop-assist-main">
        <p className="eyebrow">
          Assist · {AGENT_LABEL[assist.agent]}
          {loading ? " · working" : applied ? " · applied" : ""}
        </p>
        <p className="loop-assist-reason">{assist.reason}</p>
        {loading ? (
          <div className="assist-pick assist-pick-loading" aria-live="polite">
            <span className="assist-pick-badge">Agent</span>
            <div className="assist-pick-copy">
              <strong>Agent ranking roster with guardrails…</strong>
              <p className="assist-pick-why">Suggestions stay confirm-first — nothing auto-applies.</p>
            </div>
          </div>
        ) : null}
        {!loading && pickLabel ? (
          <div className={`assist-pick ${applied ? "on" : ""}`} aria-live="polite">
            <span className={`assist-pick-badge ${applied ? "applied" : ""}`}>
              {applied ? "Applied" : "Suggested"}
            </span>
            <div className="assist-pick-copy">
              <strong>{pickLabel}</strong>
              {pickWhy ? <p className="assist-pick-why">Why · {pickWhy}</p> : null}
            </div>
          </div>
        ) : null}
        {!loading && blocked ? (
          <p className="assist-guardrail-note muted">
            Guardrails held the agent suggestion — choose manually from the list below.
          </p>
        ) : null}
        <ol className="loop-assist-steps" aria-label="Loop assist path">
          {assist.steps.map((step) => (
            <li key={step.id} className={step.status}>
              {step.label}
            </li>
          ))}
        </ol>
      </div>
      {onApply && applyLabel ? (
        <button
          type="button"
          className={`btn loop-assist-apply ${applied ? "is-applied" : "primary"} ${flash ? "just-clicked" : ""}`}
          disabled={applyDisabled || loading}
          aria-pressed={applied}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleApply();
          }}
        >
          {loading ? "Waiting…" : applied ? (
            <>
              <span className="btn-check" aria-hidden>
                ✓
              </span>
              {applyLabel}
            </>
          ) : (
            applyLabel
          )}
        </button>
      ) : null}
    </div>
  );
}
