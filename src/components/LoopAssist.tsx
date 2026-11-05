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
 * Loop-assist strip with LLM agent status + suggested pick.
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

  return (
    <div
      className={`loop-assist ${pickLabel ? "has-pick" : ""} ${loading ? "is-loading" : ""} ${blocked ? "is-blocked" : ""}`}
    >
      <div className="loop-assist-main">
        <p className="eyebrow">
          Assist · {AGENT_LABEL[assist.agent]}
          {loading ? " · thinking" : ""}
        </p>
        <p className="loop-assist-reason">{assist.reason}</p>
        {loading ? (
          <div className="assist-pick assist-pick-loading" aria-live="polite">
            <span className="assist-pick-badge">Agent</span>
            <div className="assist-pick-copy">
              <strong>Ranking roster with guardrails…</strong>
              <p className="assist-pick-why">Suggestions stay confirm-first — nothing auto-applies.</p>
            </div>
          </div>
        ) : null}
        {!loading && pickLabel ? (
          <div className={`assist-pick ${pickSelected ? "on" : ""}`}>
            <span className="assist-pick-badge">Suggested</span>
            <div className="assist-pick-copy">
              <strong>{pickLabel}</strong>
              {pickWhy ? <p className="assist-pick-why">Why · {pickWhy}</p> : null}
            </div>
          </div>
        ) : null}
        {!loading && blocked ? (
          <p className="assist-guardrail-note muted">
            Guardrails held the model pick — choose manually from the list below.
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
          className={`btn loop-assist-apply ${pickSelected || applyDisabled ? "is-applied" : "primary"}`}
          disabled={applyDisabled || loading}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onApply();
          }}
        >
          {loading ? "Waiting…" : applyLabel}
        </button>
      ) : null}
    </div>
  );
}
