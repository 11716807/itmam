import type { AppScreen } from "../types";

export const TOUR_STORAGE_KEY = "itmam-tour-v1";

export type TourStep = {
  id: string;
  /** Screen to show before highlighting. */
  screen: AppScreen;
  /** Optional DOM target via data-tour-id. */
  target?: string;
  title: string;
  /** What the user should click / do. */
  doThis: string;
  /** What they should look for / verify. */
  checkThis: string;
  /** Optional note under the card. */
  tip?: string;
};

/** First-visit walkthrough — mirrors the judge demo path. */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    screen: "board",
    title: "Welcome to Itmam",
    doThis: "Follow this short guide — about 2 minutes.",
    checkThis:
      "Itmam helps care coordinators close actionable screening results: told → owned → booked → seen → verified. Agents assist; you confirm.",
    tip: "You can restart anytime from Guide in the sidebar.",
  },
  {
    id: "import",
    screen: "board",
    target: "tour-import",
    title: "1 · Load screening data",
    doThis: "Click Use example extract (or Import CSV / Restore demo board).",
    checkThis:
      "Agents run on each row: Validate → Enrich → Gate → Priority → Route. Wait until the board fills.",
    tip: "Sample CSV is also on GitHub if you want to import a file yourself.",
  },
  {
    id: "board-rank",
    screen: "board",
    target: "tour-board-list",
    title: "2 · Ranked open loops",
    doThis: "Scan the board list — start at the top.",
    checkThis:
      "Urgent cases (e.g. Yusuf FIT, Fatima BP) rise first. Risk score and Assist next-step sit on the right.",
  },
  {
    id: "how-decided",
    screen: "board",
    target: "tour-how-decided",
    title: "3 · How decided",
    doThis: "On any open row, click How decided · agent harness.",
    checkThis:
      "See input → decision → output and guardrails. No silent invent or drop — rules decide rank.",
  },
  {
    id: "not-on-board",
    screen: "board",
    target: "tour-not-on-board",
    title: "4 · Not on board",
    doThis: "Expand Not on board below the open cases.",
    checkThis:
      "Filtered (borderline/normal) and needs-fix (bad data) stay visible. We never quietly rewrite the extract.",
  },
  {
    id: "open-case",
    screen: "board",
    target: "tour-board-list",
    title: "5 · Open a case",
    doThis: "Click a high-priority person (Fatima or Yusuf) to open Case.",
    checkThis:
      "The care path shows where they are in the loop. Next action is always clear.",
  },
  {
    id: "assist",
    screen: "case",
    target: "tour-assist",
    title: "6 · Assist on the case",
    doThis: "Use the Assist strip: Use draft → assign owner → book slot (confirm each).",
    checkThis:
      "Suggestions are confirm-first with guardrails. Nothing sends or books without you.",
    tip: "If Assist is still working, wait for Suggested — then tap Apply.",
  },
  {
    id: "audit",
    screen: "audit",
    target: "tour-audit",
    title: "7 · Audit trail",
    doThis: "Open Audit in the sidebar (we’ll take you there).",
    checkThis:
      "A clean timeline of who did what — proof the loop is accountable.",
  },
  {
    id: "done",
    screen: "board",
    title: "You’re ready",
    doThis: "Explore Outcomes or Risk rules anytime from the sidebar.",
    checkThis:
      "Remember: end-to-end visibility, clear ownership, human-confirmed closure. Restart Guide if you get stuck.",
  },
];

export function loadTourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === "done";
  } catch {
    return false;
  }
}

export function saveTourDone() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, "done");
  } catch {
    /* ignore */
  }
}

export function clearTourDone() {
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
