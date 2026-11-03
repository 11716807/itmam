import { patientById, resultById } from "../data/seed";
import { hoursOpen, isOpen } from "../lib/loop";
import type { CareCase } from "../types";

type Props = {
  cases: CareCase[];
};

export function Outcomes({ cases }: Props) {
  const open = cases.filter((c) => isOpen(c.stage));
  const verified = cases.filter((c) => c.stage === "verified");
  const lost = cases.filter((c) => c.stage === "lost");
  const ownedFast = cases.filter((c) => c.ownedAt && hoursOpen({ ...c, openedAt: c.openedAt }, c.ownedAt) <= 24);
  const told = cases.filter((c) => c.toldAt).length;
  const booked = cases.filter((c) => c.bookedAt).length;
  const seen = cases.filter((c) => c.seenAt).length;

  const completion =
    cases.length === 0 ? 0 : Math.round((verified.length / cases.length) * 100);

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Outcomes</p>
          <h2>Did care actually happen?</h2>
          <p className="lede">
            Proof the loop worked — ownership speed, completion, and lost-to-follow-up with reasons.
          </p>
        </div>
      </header>
      <div className="panel-body">
        <div className="kpi-row">
          <div className="kpi ok">
            <span>Loop completion</span>
            <strong>{completion}%</strong>
          </div>
          <div className="kpi">
            <span>Told → booked → seen</span>
            <strong>
              {told}/{booked}/{seen}
            </strong>
          </div>
          <div className="kpi">
            <span>Owned ≤ 24h</span>
            <strong>
              {ownedFast.length}/{cases.length}
            </strong>
          </div>
          <div className={`kpi ${lost.length ? "warn" : ""}`}>
            <span>Lost</span>
            <strong>{lost.length}</strong>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Finding</th>
              <th>Stage</th>
              <th>Hours open</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => {
              const p = patientById(c.patientId);
              const r = resultById(c.resultId);
              return (
                <tr key={c.id}>
                  <td>{p.nameEn}</td>
                  <td>
                    {r.labelEn} {r.value}
                  </td>
                  <td>{c.stage}</td>
                  <td>{hoursOpen(c).toFixed(0)}</td>
                  <td>
                    {c.stage === "verified"
                      ? c.visitNote || "Verified"
                      : c.stage === "lost"
                        ? `Lost: ${c.lostReason}`
                        : open.includes(c)
                          ? "In loop"
                          : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
