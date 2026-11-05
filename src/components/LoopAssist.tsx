import { AGENT_LABEL, type LoopAssist } from "../lib/loopAssist";

type Props = {
  assist: LoopAssist;
  /** Optional one-click apply for the current stage suggestion. */
  applyLabel?: string;
  onApply?: () => void;
  applyDisabled?: boolean;
};

/**
 * Quiet loop-assist strip — one reason line + optional apply.
 * Details stay collapsed so Case does not feel like a second dashboard.
 */
export function LoopAssistBar({ assist, applyLabel, onApply, applyDisabled }: Props) {
  return (
    <div className="loop-assist">
      <div className="loop-assist-main">
        <p className="eyebrow">Assist · {AGENT_LABEL[assist.agent]}</p>
        <p className="loop-assist-reason">{assist.reason}</p>
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
          className="btn ghost loop-assist-apply"
          disabled={applyDisabled}
          onClick={onApply}
        >
          {applyLabel}
        </button>
      ) : null}
    </div>
  );
}
