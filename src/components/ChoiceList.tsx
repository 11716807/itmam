type Choice = {
  id: string;
  title: string;
  meta: string;
  suggested?: boolean;
  /** One-line reason shown on the suggested card. */
  why?: string;
};

type Props = {
  label: string;
  options: Choice[];
  value: string;
  onChange: (id: string) => void;
  emptyText: string;
};

/** Visible multi-choice list — one may be suggested, all stay selectable. */
export function ChoiceList({ label, options, value, onChange, emptyText }: Props) {
  if (!options.length) {
    return <p className="banner bad">{emptyText}</p>;
  }

  return (
    <div className="choice-list" role="radiogroup" aria-label={label}>
      <div className="choice-list-head">
        <p className="eyebrow">{label}</p>
        <span className="choice-list-count">{options.length} options</span>
      </div>
      <div className="choice-list-grid">
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`choice-card ${selected ? "on" : ""} ${opt.suggested ? "suggested" : ""}`}
              onClick={() => onChange(opt.id)}
            >
              <span className="choice-card-top">
                {opt.suggested ? <span className="assist-pick-badge">Suggested</span> : null}
                {selected ? <span className="choice-selected-tag">Selected</span> : null}
              </span>
              <strong>{opt.title}</strong>
              <span className="choice-meta">{opt.meta}</span>
              {opt.suggested && opt.why ? (
                <span className="choice-why">Why · {opt.why}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
