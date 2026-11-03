import { referralOf } from "../lib/pathway";
import type { CareCase, LoopStage } from "../types";
import { STAGE_LABEL, STAGE_ORDER } from "../types";

type Props = {
  care: CareCase;
  compact?: boolean;
};

type Node = {
  id: string;
  label: string;
  at: string | null;
  detail: string;
  status: "done" | "now" | "todo" | "lost" | "skip";
};

function stamp(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace("T", " ").slice(0, 16);
}

function timeFor(care: CareCase, stage: LoopStage): string | null {
  switch (stage) {
    case "result_in":
      return care.openedAt;
    case "stratified":
      return care.stage === "result_in" ? null : care.openedAt;
    case "told":
      return care.toldAt;
    case "owned":
      return care.ownedAt;
    case "booked":
      return care.bookedAt;
    case "seen":
      return care.seenAt;
    case "verified":
      return care.verifiedAt;
    default:
      return null;
  }
}

function statusOf(care: CareCase, stage: LoopStage): "done" | "now" | "todo" | "lost" {
  if (care.stage === "lost") {
    if (timeFor(care, stage) || stage === "result_in") return "done";
    return "lost";
  }
  // Verified: trunk through seen is done; verified may live on a branch.
  if (care.stage === "verified") {
    if (stage === "verified") return "done";
    const idx = STAGE_ORDER.indexOf(stage);
    const seenIdx = STAGE_ORDER.indexOf("seen");
    if (idx <= seenIdx) return "done";
    return "todo";
  }
  const cur = STAGE_ORDER.indexOf(care.stage);
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < cur) return "done";
  if (idx === cur) return "now";
  return "todo";
}

function trunkNodes(care: CareCase): Node[] {
  const noShows = care.noShowCount ?? 0;
  const ref = referralOf(care);
  const atVisit = Boolean(care.seenAt) && care.stage !== "lost";

  // Main line stops before the fork. Verified only appears on trunk when closing without referral.
  const nodes: Node[] = [
    {
      id: "result_in",
      label: STAGE_LABEL.result_in.en,
      at: stamp(care.openedAt),
      detail: "Finding landed from extract",
      status: statusOf(care, "result_in"),
    },
    {
      id: "stratified",
      label: STAGE_LABEL.stratified.en,
      at: care.stage === "result_in" ? null : stamp(care.openedAt),
      detail: care.aiPriorityReason || "Urgency & specialty set",
      status: statusOf(care, "stratified"),
    },
    {
      id: "told",
      label: STAGE_LABEL.told.en,
      at: stamp(care.toldAt),
      detail: "Sahhatna message sent",
      status: statusOf(care, "told"),
    },
    {
      id: "owned",
      label: STAGE_LABEL.owned.en,
      at: stamp(care.ownedAt),
      detail:
        noShows > 0 && care.stage === "owned" && !care.slotId
          ? `Reopened after no-show #${noShows} — rebook`
          : care.ownerId
            ? "Clinician owns the loop"
            : "Awaiting clinician owner",
      status: statusOf(care, "owned"),
    },
    {
      id: "booked",
      label: STAGE_LABEL.booked.en,
      at: stamp(care.bookedAt),
      detail:
        noShows > 0 && care.bookedAt
          ? `Rebooked after ${noShows} miss(es)`
          : care.slotId
            ? "Visit booked on network"
            : "Awaiting visit slot",
      status: statusOf(care, "booked"),
    },
    {
      id: "seen",
      label: STAGE_LABEL.seen.en,
      at: stamp(care.seenAt),
      detail:
        atVisit && ref.branch === "undecided"
          ? "Decision: close or refer"
          : care.visitNote || "Clinic visit not recorded yet",
      status: statusOf(care, "seen"),
    },
  ];

  if (ref.branch !== "confirmatory") {
    nodes.push({
      id: "verified",
      label: STAGE_LABEL.verified.en,
      at: stamp(care.verifiedAt),
      detail: "Outcome closed — loop complete",
      status:
        ref.branch === "direct_close" || care.stage === "verified"
          ? care.verifiedAt
            ? "done"
            : care.stage === "seen"
              ? "now"
              : statusOf(care, "verified")
          : care.stage === "seen" && ref.branch === "undecided"
            ? "todo"
            : statusOf(care, "verified"),
    });
  }

  return nodes;
}

function branchNodes(care: CareCase): Node[] {
  const ref = referralOf(care);
  if (ref.branch !== "confirmatory" && !(care.stage === "seen" && ref.branch === "undecided")) {
    // Show a light preview branch only when at visit undecided, or full when on referral.
    if (!(care.stage === "seen" && ref.branch === "undecided") && care.stage !== "verified") {
      return [];
    }
  }

  const onReferral = ref.branch === "confirmatory";
  const preview = care.stage === "seen" && ref.branch === "undecided";

  return [
    {
      id: "refer",
      label: "Refer",
      at: onReferral ? stamp(care.seenAt) : null,
      detail: ref.specialty
        ? ref.specialty.replaceAll("_", " ")
        : "Confirmatory specialty",
      status: preview ? "todo" : onReferral ? "done" : "skip",
    },
    {
      id: "ref-book",
      label: "Confirmatory book",
      at: stamp(ref.bookedAt),
      detail: ref.slotId ? "Slot held" : "Awaiting confirmatory slot",
      status: preview
        ? "todo"
        : !onReferral
          ? "skip"
          : ref.bookedAt
            ? "done"
            : "now",
    },
    {
      id: "ref-done",
      label: "Confirmatory done",
      at: stamp(ref.doneAt),
      detail: ref.note || "Diagnostic step",
      status: preview
        ? "todo"
        : !onReferral
          ? "skip"
          : ref.doneAt
            ? "done"
            : ref.bookedAt
              ? "now"
              : "todo",
    },
    {
      id: "ref-verified",
      label: STAGE_LABEL.verified.en,
      at: onReferral ? stamp(care.verifiedAt) : null,
      detail: "Outcome closed after referral",
      status: preview
        ? "todo"
        : !onReferral
          ? "skip"
          : care.verifiedAt
            ? "done"
            : ref.doneAt
              ? "now"
              : "todo",
    },
  ];
}

function Track({
  nodes,
  compact,
  className,
}: {
  nodes: Node[];
  compact?: boolean;
  className?: string;
}) {
  return (
    <ol className={`timeline-track ${className || ""}`}>
      {nodes.map((node, i) => (
        <li key={node.id} className={`timeline-node ${node.status}`}>
          {i < nodes.length - 1 ? <span className="timeline-connector" aria-hidden /> : null}
          <span className="timeline-dot" aria-hidden>
            {node.status === "done"
              ? "✓"
              : node.status === "now"
                ? "●"
                : node.status === "lost"
                  ? "!"
                  : node.status === "skip"
                    ? "–"
                    : i + 1}
          </span>
          <div className="timeline-copy">
            <strong>{node.label}</strong>
            <span className="timeline-when">{node.at || "Pending"}</span>
            {!compact ? <p>{node.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CareTimeline({ care, compact }: Props) {
  const trunk = trunkNodes(care);
  const branch = branchNodes(care);
  const ref = referralOf(care);
  const noShows = care.noShowCount ?? 0;
  const showBranch =
    branch.length > 0 &&
    (ref.branch === "confirmatory" || (care.stage === "seen" && ref.branch === "undecided"));

  const progressNodes =
    ref.branch === "confirmatory" ? [...trunk, ...branch] : trunk;
  const doneCount = progressNodes.filter((n) => n.status === "done").length;
  const progress =
    care.stage === "verified"
      ? 100
      : care.stage === "lost"
        ? Math.min(90, Math.round((doneCount / Math.max(progressNodes.length, 1)) * 100))
        : Math.min(100, Math.round((doneCount / Math.max(progressNodes.length, 1)) * 100));

  return (
    <section className={`care-timeline ${compact ? "compact" : ""}`} aria-label="Care loop timeline">
      <div className="care-timeline-head">
        <div>
          <p className="eyebrow">Patient path</p>
          <h3>
            {care.stage === "lost"
              ? "Loop interrupted"
              : care.stage === "verified"
                ? "Loop closed"
                : noShows > 0
                  ? "Path with rebook loop"
                  : "Screening → care path"}
          </h3>
        </div>
        <div className="timeline-meter" aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </div>
        <strong className="timeline-pct">{progress}%</strong>
      </div>

      <Track nodes={trunk} compact={compact} />

      {showBranch ? (
        <div className="timeline-branch">
          <div className="timeline-branch-join" aria-hidden>
            <span className="timeline-branch-elbow" />
          </div>
          <div className="timeline-branch-track">
            <p className="timeline-branch-label">
              {ref.branch === "confirmatory"
                ? "Referral branch"
                : "Optional branch from visit"}
            </p>
            <Track nodes={branch} compact={compact} className="branch" />
          </div>
        </div>
      ) : null}

      {noShows > 0 ? (
        <p className="path-loop-note">
          No-show ×{noShows}: booked → missed → Owned → rebook (loop, not an end).
        </p>
      ) : null}

      {care.stage === "lost" ? (
        <p className="timeline-lost-note">
          Lost to follow-up{care.lostReason ? ` · ${care.lostReason.replaceAll("_", " ")}` : ""}
          {care.lostAt ? ` · ${stamp(care.lostAt)}` : ""}
        </p>
      ) : null}
    </section>
  );
}

/** Compact stage chips — kept for dense surfaces. */
export function LoopRail({ stage }: { stage: LoopStage }) {
  if (stage === "lost") {
    return (
      <div className="loop-rail" aria-label="Loop lost">
        {STAGE_ORDER.map((s) => (
          <div key={s} className="loop-step lost">
            {STAGE_LABEL[s].en}
          </div>
        ))}
      </div>
    );
  }
  const idx = STAGE_ORDER.indexOf(stage);
  return (
    <div className="loop-rail" aria-label="Care loop progress">
      {STAGE_ORDER.map((s, i) => {
        const cls = i < idx ? "done" : i === idx ? "now" : "";
        return (
          <div key={s} className={`loop-step ${cls}`}>
            {STAGE_LABEL[s].en}
          </div>
        );
      })}
    </div>
  );
}
