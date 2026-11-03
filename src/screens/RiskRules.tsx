import { useEffect, useState } from "react";
import {
  DEFAULT_RISK_WEIGHTS,
  loadRiskWeights,
  resetRiskWeights,
  RISK_WEIGHT_ROWS,
  saveRiskWeights,
  type RiskWeightKey,
  type RiskWeights,
} from "../lib/riskWeights";

type Props = {
  weights: RiskWeights;
  onChange: (next: RiskWeights) => void;
};

export function RiskRules({ weights, onChange }: Props) {
  const [draft, setDraft] = useState<RiskWeights>(weights);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(weights);
  }, [weights]);

  function setPoint(key: RiskWeightKey, value: string) {
    const n = Number(value);
    setDraft((current) => ({
      ...current,
      [key]: Number.isFinite(n) ? Math.max(0, Math.min(200, n)) : 0,
    }));
    setSaved(false);
  }

  function save() {
    saveRiskWeights(draft);
    onChange(draft);
    setSaved(true);
  }

  function restoreDefaults() {
    const next = resetRiskWeights();
    setDraft(next);
    onChange(next);
    setSaved(true);
  }

  const dirty = RISK_WEIGHT_ROWS.some((row) => draft[row.key] !== weights[row.key]);

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Ingestion control</p>
          <h2>Board risk weights</h2>
          <p className="lede">
            Edit how open loops are ranked after import. Higher points rise first on the board.
            Changes apply as soon as you save — no re-import needed for already placed cases.
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn ghost" onClick={restoreDefaults}>
            Restore defaults
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={!dirty && saved}>
            {saved && !dirty ? "Saved" : "Save weights"}
          </button>
        </div>
      </header>

      <div className="panel-body">
        <p className="banner">
          Score = sum of matching signals. FIT / BP / MoCA / HbA1c are finding boosts; owner, stage,
          and SLA gaps push unfinished loops up. Urgency from enrichment adds a small final bump.
        </p>

        <div className="risk-table-wrap">
          <table className="risk-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>When it applies</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {RISK_WEIGHT_ROWS.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.signal}</strong>
                  </td>
                  <td className="muted">{row.hint}</td>
                  <td>
                    <label className="risk-point">
                      <span className="sr-only">Points for {row.signal}</span>
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step={1}
                        value={draft[row.key]}
                        onChange={(e) => setPoint(row.key, e.target.value)}
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="risk-defaults">
          <p className="section-label">Default reference</p>
          <p className="muted">
            {RISK_WEIGHT_ROWS.map((row) => `${row.signal} +${DEFAULT_RISK_WEIGHTS[row.key]}`).join(
              " · ",
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Hydrate once for App boot. */
export function initialRiskWeights(): RiskWeights {
  return loadRiskWeights();
}
