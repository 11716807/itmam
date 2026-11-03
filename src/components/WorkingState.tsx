type Props = {
  title: string;
  detail?: string;
  compact?: boolean;
};

export function WorkingState({ title, detail, compact }: Props) {
  return (
    <div className={`working-state ${compact ? "compact" : ""}`} role="status" aria-live="polite">
      <div className="working-spinner" aria-hidden />
      <div className="working-copy">
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
      <div className="working-skeleton" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
