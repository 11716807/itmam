# Itmam

Closes the **IFHAS/EAS** screening-to-care loop for Abu Dhabi: every actionable result gets **told → owned → booked → visit completed → verified** (with an optional confirmatory referral branch).

Deploy pattern mirrors **[google-hackathon / Golden Frame](https://github.com/11716807/hackathon)** — Cloud Run + `GEMINI_API_KEY` from `.env.local`.

**Live demo:** https://itmam-216812516383.asia-south1.run.app

---

## Local

```bash
npm install
cp .env.example .env.local   # set GEMINI_API_KEY
npm run dev
```

Open http://127.0.0.1:5173/

---

## Google Cloud (Cloud Run)

Same flow as Golden Frame:

```bash
# gcloud config set project YOUR_PROJECT_ID
npm run deploy:cloudrun
```

Uses `scripts/deploy-cloudrun.sh`:

- Enables Run + Cloud Build + Artifact Registry
- Deploys with `--source .` (Cloud Build builds the Dockerfile)
- Injects `GEMINI_API_KEY` / `GEMINI_MODEL` from `.env.local`
- Region default: `asia-south1`, service: `itmam`

Health: `GET /api/health`

---

## Stack

| Piece | Role |
|---|---|
| Cloud Run | Hosts Vite build + `/api/itmam*` |
| Gemini | Brief / prepare / translate (key from env) |
| Local enrichment | Works without Gemini (demo-safe fallback) |
