import { useMemo, useState } from "react";
import { patientById, resultById } from "../data/seed";
import type { AuditEvent, CareCase } from "../types";
import { STAGE_LABEL } from "../types";

type Props = {
  cases: CareCase[];
  audit: AuditEvent[];
  onOpenCase: (caseId: string) => void;
};

function actionLabel(action: string): string {
  switch (action) {
    case "seen":
      return "visit completed";
    case "prioritized":
      return "priority set";
    case "patient_told":
      return "patient told";
    case "no_show":
      return "patient no-show";
    case "rescheduled":
      return "rescheduled";
    case "imported":
      return "imported";
    default:
      return action.replaceAll("_", " ");
  }
}

export function AuditLog({ cases, audit, onOpenCase }: Props) {
  const [filter, setFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(cases[0]?.id ?? null);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return cases
      .map((care) => {
        const patient = patientById(care.patientId);
        const result = resultById(care.resultId);
        const events = audit
          .filter((e) => e.caseId === care.id)
          .slice()
          .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
        return { care, patient, result, events };
      })
      .filter(({ patient, result, events }) => {
        if (!q) return true;
        const hay = `${patient.nameEn} ${patient.nameAr} ${result.labelEn} ${events.map((e) => `${e.action} ${e.detail}`).join(" ")}`.toLowerCase();
        return hay.includes(q);
      });
  }, [cases, audit, filter]);

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Audit</p>
          <h2>Who did what — by patient</h2>
          <p className="lede">
            Full loop trail per person: import, priority, told, owned, booked, visit, verified.
          </p>
        </div>
      </header>

      <div className="panel-body">
        <div className="audit-toolbar">
          <label className="field">
            Search patients or events
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="e.g. Yusuf, no-show, Sahhatna…"
            />
          </label>
          <p className="muted">
            {groups.length} patient{groups.length === 1 ? "" : "s"} · {audit.length} events
          </p>
        </div>

        {!cases.length ? (
          <div className="empty-board">
            <p>No audit yet.</p>
            <p className="muted">Import an extract on the Board to start the trail.</p>
          </div>
        ) : !groups.length ? (
          <p className="muted">No patients match that search.</p>
        ) : (
          <ul className="audit-by-patient">
            {groups.map(({ care, patient, result, events }) => {
              const expanded = openId === care.id;
              return (
                <li key={care.id} className={`audit-patient-card ${expanded ? "open" : ""}`}>
                  <button
                    type="button"
                    className="audit-patient-head"
                    onClick={() => setOpenId(expanded ? null : care.id)}
                    aria-expanded={expanded}
                  >
                    <span>
                      <strong>{patient.nameEn}</strong>
                      <em>{patient.nameAr}</em>
                    </span>
                    <span>
                      {result.labelEn} {result.value}
                      {result.unit ? ` ${result.unit}` : ""}
                    </span>
                    <span className={`chip ${care.urgency}`}>
                      {STAGE_LABEL[care.stage].en}
                    </span>
                    <span className="audit-count">{events.length} events</span>
                    <span className="audit-chevron" aria-hidden>
                      {expanded ? "▾" : "▸"}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="audit-patient-body">
                      {!events.length ? (
                        <p className="muted">No events recorded for this patient yet.</p>
                      ) : (
                        <ul className="audit audit-full">
                          {events.map((e) => (
                            <li key={e.id}>
                              <strong>{actionLabel(e.action)}</strong> · {e.actor}
                              <span className="audit-at">{e.at.replace("T", " ")}</span>
                              <br />
                              {e.detail}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        className="btn"
                        onClick={() => onOpenCase(care.id)}
                      >
                        Open case
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
