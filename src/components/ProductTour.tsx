import { useEffect, useLayoutEffect, useState } from "react";
import {
  clearTourDone,
  loadTourDone,
  saveTourDone,
  TOUR_STEPS,
  type TourStep,
} from "../lib/productTour";
import type { AppScreen } from "../types";

type Props = {
  screen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  /** Soft-open first urgent/open case when the tour reaches the case step. */
  onOpenSuggestedCase?: () => void;
};

type Spot = { top: number; left: number; width: number; height: number };

function spotFor(targetId?: string): Spot | null {
  if (!targetId || typeof document === "undefined") return null;
  const el = document.querySelector(`[data-tour-id="${targetId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return null;
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
}

export function ProductTour({ screen, onNavigate, onOpenSuggestedCase }: Props) {
  const [active, setActive] = useState(() => !loadTourDone());
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);

  const step: TourStep | undefined = TOUR_STEPS[index];
  const total = TOUR_STEPS.length;
  const isLast = index >= total - 1;

  useEffect(() => {
    if (!active || !step) return;
    if (step.screen !== screen) {
      onNavigate(step.screen);
    }
    if (step.id === "assist") {
      onOpenSuggestedCase?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, step?.id, step?.screen]);

  useLayoutEffect(() => {
    if (!active || !step) {
      setSpot(null);
      return;
    }

    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      const next = spotFor(step.target);
      setSpot(next);
      if (step.target) {
        document
          .querySelector(`[data-tour-id="${step.target}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };

    refresh();
    const t1 = window.setTimeout(refresh, 280);
    const t2 = window.setTimeout(refresh, 700);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [active, index, step, screen]);

  function finish() {
    saveTourDone();
    setActive(false);
    setIndex(0);
    setSpot(null);
  }

  function start() {
    clearTourDone();
    setIndex(0);
    setActive(true);
    onNavigate("board");
  }

  function next() {
    if (isLast) {
      finish();
      return;
    }
    setIndex((i) => Math.min(i + 1, total - 1));
  }

  function back() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  if (!active || !step) {
    return (
      <button type="button" className="tour-launcher" onClick={start}>
        Guide
      </button>
    );
  }

  return (
    <>
      <div className="tour-dim" aria-hidden />
      {spot ? (
        <div
          className="tour-spotlight"
          style={{
            top: spot.top - 6,
            left: spot.left - 6,
            width: spot.width + 12,
            height: spot.height + 12,
          }}
          aria-hidden
        />
      ) : null}

      <div
        className="tour-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
      >
        <div className="tour-card-top">
          <p className="eyebrow">Guide · {index + 1}/{total}</p>
          <button type="button" className="tour-skip" onClick={finish}>
            Skip
          </button>
        </div>
        <h3 id="tour-title">{step.title}</h3>

        <div className="tour-block do">
          <span>Do</span>
          <p>{step.doThis}</p>
        </div>
        <div className="tour-block check">
          <span>Check</span>
          <p>{step.checkThis}</p>
        </div>
        {step.tip ? <p className="tour-tip muted">{step.tip}</p> : null}

        <div className="tour-actions">
          <button type="button" className="btn ghost" onClick={back} disabled={index === 0}>
            Back
          </button>
          <button type="button" className="btn primary" onClick={next}>
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
