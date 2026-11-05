/**
 * Production server for Cloud Run: static dist + Gemini API + shared board state.
 * Mirrors the google-hackathon Cloud Run pattern (port 8080, GEMINI_API_KEY, Firestore).
 */
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Firestore } from "@google-cloud/firestore";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(__dirname, "dist");
const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const PROJECT_ID =
  process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "";
const MODELS = [MODEL, "gemini-2.5-flash"].filter(
  (name, index, all) => name && all.indexOf(name) === index,
);

const STATE_COLLECTION = "itmam";
const STATE_DOC = "board";

let firestore = undefined;
function getDb() {
  if (firestore !== undefined) return firestore;
  if (!PROJECT_ID) {
    firestore = null;
    return firestore;
  }
  firestore = new Firestore({
    projectId: PROJECT_ID,
    ignoreUndefinedProperties: true,
  });
  return firestore;
}

async function readEnvelope() {
  const db = getDb();
  if (!db) return null;
  const snap = await db.collection(STATE_COLLECTION).doc(STATE_DOC).get();
  if (!snap.exists) return null;
  return snap.data() ?? null;
}

async function writeEnvelope(envelope) {
  const db = getDb();
  if (!db) throw new Error("Firestore is not configured (set GCP_PROJECT_ID)");
  await db.collection(STATE_COLLECTION).doc(STATE_DOC).set(envelope, { merge: false });
}

async function deleteEnvelope() {
  const db = getDb();
  if (!db) return;
  await db.collection(STATE_COLLECTION).doc(STATE_DOC).delete();
}

const BRIEF_PROMPT = `You are Itmam, a closed-loop screening-to-care assistant for Abu Dhabi IFHAS/EAS follow-up.
You receive a JSON evidence pack only. Return JSON only:
{"headlineEn":"","headlineAr":"","explainEn":"","explainAr":"","priorityReason":"","nextSteps":["",""],"patientMessageEn":"","patientMessageAr":"","caveats":["",""]}

Rules:
- Do not diagnose, confirm disease names as fact, or prescribe.
- Speak as routing/follow-up help: clinician must review.
- Patient messages: calm, short, actionable; no scary labels; mention Sahhatna-style confirm.
- Arabic must be natural Gulf-friendly Modern Standard, not transliteration.
- priorityReason: one sentence on loop risk (owner, SLA, pathway).
- nextSteps: 3-5 concrete coordinator actions.
- Use only facts in the pack.`;

const PREPARE_PROMPT = `You are Itmam board prep for Abu Dhabi IFHAS/EAS extracts.
Given one screening row + extra metrics (days_waiting, prior_no_shows, wearable_flag, family_risk, notes), decide if it belongs on the care coordination board.

Return JSON only:
{"include":true,"urgency":"routine|soon|urgent","specialty":"family_medicine|endocrinology|cardiology|gastroenterology|neurology|ophthalmology","slaHours":48,"priorityReason":"one sentence","boardNote":"short note"}

Rules:
- include=false for normal/borderline findings that do not need a closed loop.
- include=true for actionable findings that need told→owned→booked→seen→verified.
- FIT / cancer-path and severe BP lean urgent with shorter SLA.
- Higher days_waiting, prior_no_shows, wearable_flag=yes, family_risk=yes increase urgency / lower slaHours.
- Do not diagnose. priorityReason is routing risk only.
- specialty: fit→gastroenterology, moca→neurology, hba1c/bmi→family_medicine, bp/ldl→cardiology unless notes say otherwise.`;

const TRANSLATE_PROMPT = `You translate patient outreach messages for Abu Dhabi screening follow-up (Sahhatna).
Input JSON: { text, from, to, fromCode, toCode }.
Return JSON only: {"text":"translated message"}

Rules:
- Preserve meaning: calm, no diagnosis, no prescriptions, invite clinic review / Sahhatna confirm.
- Natural target language (Gulf-friendly Arabic when to is Arabic).
- Do not add new clinical claims.
- Keep names and product word Sahhatna / صحةنا as appropriate.`;

const LOOP_PROMPT = `You are an Itmam loop-assist agent for Abu Dhabi IFHAS/EAS care coordination.
You receive a JSON pack with agent, case, patient, finding, and a live roster.
Return JSON only in this shape:
{"pickId":"","why":"one coordination sentence","draftEn":"","outcome":"","confidence":0.0}

Agent rules by pack.agent:
- draftTell: fill draftEn (calm Sahhatna patient message, English). leave pickId/outcome empty. why = why this tone/content.
- matchOwner: pickId MUST be one id from roster.clinicians. why = one line why that clinician fits coordination (specialty/network/SLA) — not a diagnosis.
- suggestSlot: pickId MUST be one id from roster.slots. why = one line why that slot (timing/clinician fit) — not a diagnosis.
- outcomeGate: outcome MUST be one of allowedOutcomes (direct_close|confirmatory|verify). leave pickId empty. why = coordination rationale.
- watch: return empty pickId/draftEn/outcome with a short why on next human action.

Hard rules:
- Never invent clinician ids, slot ids, facilities, or times outside the roster.
- Never diagnose, confirm disease, or prescribe.
- Never claim a message was sent or a stage advanced — suggest only.
- Prefer urgency/SLA risk and specialty/network fit when ranking.
- Use only facts in the pack.`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".csv": "text/csv; charset=utf-8",
  ".woff2": "font/woff2",
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function callModel(apiKey, model, system, pack) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(pack) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`${model} ${response.status} ${detail}`);
  }
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return JSON.parse(raw);
}

async function handleApi(req, res, path) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only" });
    return;
  }
  if (!API_KEY) {
    sendJson(res, 503, { error: "GEMINI_API_KEY is not set" });
    return;
  }
  try {
    const payload = JSON.parse(await readBody(req));
    if (!payload.pack) {
      sendJson(res, 400, { error: "Missing pack" });
      return;
    }
    const system =
      path === "/api/itmam-prepare"
        ? PREPARE_PROMPT
        : path === "/api/itmam-translate"
          ? TRANSLATE_PROMPT
          : path === "/api/itmam-loop"
            ? LOOP_PROMPT
            : BRIEF_PROMPT;
    let last = "Request failed";
    for (const name of MODELS) {
      try {
        const out = await callModel(API_KEY, name, system, payload.pack);
        if (path === "/api/itmam-prepare") {
          sendJson(res, 200, { model: name, decision: out });
        } else if (path === "/api/itmam-translate") {
          const text =
            typeof out === "object" && out && "text" in out ? String(out.text) : "";
          sendJson(res, 200, { text });
        } else if (path === "/api/itmam-loop") {
          const pick =
            typeof out === "object" && out
              ? {
                  pickId: out.pickId != null ? String(out.pickId) : undefined,
                  why: out.why != null ? String(out.why) : undefined,
                  draftEn: out.draftEn != null ? String(out.draftEn) : undefined,
                  outcome: out.outcome != null ? String(out.outcome) : undefined,
                  confidence: typeof out.confidence === "number" ? out.confidence : undefined,
                }
              : {};
          sendJson(res, 200, { model: name, pick });
        } else {
          sendJson(res, 200, { model: name, brief: out });
        }
        return;
      } catch (error) {
        last = error instanceof Error ? error.message : "Request failed";
      }
    }
    sendJson(res, 502, { error: last.slice(0, 300) });
  } catch {
    sendJson(res, 400, { error: "Bad request" });
  }
}

function safePath(urlPath) {
  const cleaned = decodeURIComponent(urlPath.split("?")[0] || "/");
  const relative = cleaned === "/" ? "index.html" : cleaned.replace(/^\//, "");
  const full = normalize(join(DIST, relative));
  if (!full.startsWith(DIST)) return null;
  return full;
}

function serveStatic(req, res) {
  const path = safePath(req.url || "/");
  if (!path) {
    res.writeHead(400).end("Bad path");
    return;
  }
  const file = existsSync(path) ? path : join(DIST, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404).end("Not found");
    return;
  }
  const type = MIME[extname(file)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(file).pipe(res);
}

async function handleState(req, res) {
  try {
    if (req.method === "GET") {
      const envelope = await readEnvelope();
      sendJson(res, 200, { envelope: envelope ?? null, store: PROJECT_ID ? "firestore" : "none" });
      return;
    }
    if (req.method === "PUT") {
      if (!PROJECT_ID) {
        sendJson(res, 503, { error: "Firestore not configured" });
        return;
      }
      const body = JSON.parse(await readBody(req));
      if (!body.envelope) {
        sendJson(res, 400, { error: "Missing envelope" });
        return;
      }
      await writeEnvelope(body.envelope);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "DELETE") {
      await deleteEnvelope();
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 405, { error: "GET, PUT, or DELETE" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message.slice(0, 300) : "State store failed",
    });
  }
}

const server = createServer(async (req, res) => {
  const path = (req.url || "/").split("?")[0];
  if (path === "/api/health") {
    let firestoreOk = false;
    if (PROJECT_ID) {
      try {
        await readEnvelope();
        firestoreOk = true;
      } catch {
        firestoreOk = false;
      }
    }
    sendJson(res, 200, {
      ok: true,
      service: "itmam",
      gemini: Boolean(API_KEY),
      model: MODEL,
      firestore: firestoreOk,
      project: PROJECT_ID || null,
    });
    return;
  }
  if (path === "/api/state") {
    await handleState(req, res);
    return;
  }
  if (
    path === "/api/itmam" ||
    path === "/api/itmam-prepare" ||
    path === "/api/itmam-translate" ||
    path === "/api/itmam-loop"
  ) {
    await handleApi(req, res, path);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405).end("Method not allowed");
});

if (!existsSync(DIST)) {
  console.error("Missing dist/. Run npm run build first.");
  process.exit(1);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Itmam listening on :${PORT} (gemini=${Boolean(API_KEY)})`);
});
