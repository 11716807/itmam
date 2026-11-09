import { useMemo, useState } from "react";
import { patientById, resultById } from "../data/seed";
import type { AuditEvent, CareCase } from "../types";
import { STAGE_LABEL } from "../types";

type Props = {
  cases: CareCase[];
  audit: AuditEvent[];
  onOpenCase: (caseId: string) => void;
};

type Actor = AuditEvent["actor"];

const ACTORS: { id: Actor | "all"; label: string }[] = [
  { id: "all", label: "All actors" },
  { id: "coordinator", label: "Coordinator" },
  { id: "ai", label: "AI" },
  { id: "system", label: "System" },
  { id: "clinician", label: "Clinician" },
  { id: "patient", label: "Patient" },
];

function actionLabel(action: string): string {
  switch (action) {
    case "seen":
      return "Visit completed";
    case "prioritized":
      return "Priority set";
    case "patient_told":
      return "Patient told";
    case "no_show":
      return "Patient no-show";
    case "rescheduled":
      return "Rescheduled";
    case "imported":
      return "Imported";
    case "verified":
      return "Outcome verified";
    case "lost":
      return "Marked lost";
    case "owned":
      return "Owner assigned";
    case "booked":
      return "Visit booked";
    default:
      return action.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
  }
}

function formatWhen(at: string): { day: string; time: string } {
  const [day = at, time = ""] = at.split("T");
  return { day, time: time.slice(0, 5) };
}

type TimelineRow = {
  event: AuditEvent;
  care: CareCase;
  patientName: string;
  patientNameAr: string;
  finding: string;
};

export function AuditLog({ cases, audit, onOpenCase }: Props) {
  const [filter, setFilter] = useState("");
  const [actorFilter, setActorFilter] = useState<Actor | "all">("all");
  const [patientFilter, setPatientFilter] = useState<string>("all");

  const caseById = useMemo(() => {
    const map = new Map<string, CareCase>();
    for (const c of cases) map.set(c.id, c);
    return map;
  }, [cases]);

  const timeline = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows: TimelineRow[] = [];

    for (const event of audit) {
      if (actorFilter !== "all" && event.actor !== actorFilter) continue;
      if (patientFilter !== "all" && event.caseId !== patientFilter) continue;

      const care = caseById.get(event.caseId);
      if (!care) continue;

      const patient = patientById(care.patientId);
      const result = resultById(care.resultId);
      const finding = `${result.labelEn} ${result.value}${result.unit ? ` ${result.unit}` : ""}`;

      if (q) {
        const hay =
          `${patient.nameEn} ${patient.nameAr} ${finding} ${event.action} ${event.detail} ${event.actor} ${actionLabel(event.action)}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }

      rows.push({
        event,
        care,
        patientName: patient.nameEn,
        patientNameAr: patient.nameAr,
        finding,
      });
    }

    return rows.sort((a, b) =>
      a.event.at < b.event.at ? 1 : a.event.at > b.event.at ? -1 : 0,
    );
  }, [audit, caseById, filter, actorFilter, patientFilter]);

  const dayGroups = useMemo(() => {
    const groups: { day: string; rows: TimelineRow[] }[] = [];
    for (const row of timeline) {
      const { day } = formatWhen(row.event.at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.rows.push(row);
      else groups.push({ day, rows: [row] });
    }
    return groups;
  }, [timeline]);

  const patientOptions = useMemo(
    () =>
      cases.map((care) => {
        const patient = patientById(care.patientId);
        return { id: care.id, label: patient.nameEn, stage: care.stage };
      }),
    [cases],
  );

  return (
    <section className="panel audit-screen">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Audit</p>
          <h2>Loop timeline</h2>
          <p className="lede">
            One clear trail of who did what — newest first, grouped by day.
          </p>
        </div>
        <p className="audit-summary-line muted">
          {timeline.length} event{timeline.length === 1 ? "" : "s"}
          {cases.length ? ` · ${cases.length} patients` : ""}
        </p>
      </header>

      <div className="panel-body" data-tour-id="tour-audit">
        {!cases.length ? (
          <div className="empty-board">
            <p>No audit yet.</p>
            <p className="muted">Import an extract on the Board to start the trail.</p>
          </div>
        ) : (
          <>
            <div className="audit-controls">
              <label className="field audit-search">
                Search
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Patient, action, detail…"
                />
              </label>

              <label className="field">
                Patient
                <select
                  value={patientFilter}
                  onChange={(e) => setPatientFilter(e.target.value)}
                >
                  <option value="all">All patients</option>
                  {patientOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} · {STAGE_LABEL[p.stage].en}
                    </option>
                  ))}
                </select>
              </label>

              <div className="audit-actor-filters" role="tablist" aria-label="Filter by actor">
                {ACTORS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    role="tab"
                    aria-selected={actorFilter === a.id}
                    className={`audit-filter-chip ${actorFilter === a.id ? "on" : ""}`}
                    onClick={() => setActorFilter(a.id)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {!timeline.length ? (
              <p className="muted audit-empty">No events match these filters.</p>
            ) : (
              <div className="audit-timeline-view">
                {dayGroups.map(({ day, rows }) => (
                  <section key={day} className="audit-day">
                    <h3 className="audit-day-label">
                      <time dateTime={day}>{day}</time>
                      <span>
                        {rows.length} event{rows.length === 1 ? "" : "s"}
                      </span>
                    </h3>

                    <ol className="audit-timeline-clean">
                      {rows.map(({ event, care, patientName, patientNameAr, finding }, idx) => {
                        const { time } = formatWhen(event.at);
                        return (
                          <li
                            key={event.id}
                            className={`audit-tl-item actor-${event.actor}`}
                            style={{ animationDelay: `${Math.min(idx, 10) * 30}ms` }}
                          >
                            <div className="audit-tl-rail" aria-hidden>
                              <span className="audit-tl-dot" />
                            </div>

                            <div className="audit-tl-body">
                              <div className="audit-tl-meta">
                                <time dateTime={event.at}>{time || "—"}</time>
                                <span className={`audit-actor-pill actor-${event.actor}`}>
                                  {event.actor}
                                </span>
                              </div>

                              <h4>{actionLabel(event.action)}</h4>
                              <p className="audit-tl-detail">{event.detail}</p>

                              <div className="audit-tl-foot">
                                <button
                                  type="button"
                                  className="audit-tl-patient"
                                  onClick={() => onOpenCase(care.id)}
                                >
                                  <strong>{patientName}</strong>
                                  <span className="name-ar-inline">{patientNameAr}</span>
                                  <span className="audit-tl-finding">{finding}</span>
                                </button>
                                <span className={`chip stage-chip ${care.stage === "verified" ? "ok" : care.stage === "lost" ? "warn" : ""}`}>
                                  {STAGE_LABEL[care.stage].en}
                                </span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
