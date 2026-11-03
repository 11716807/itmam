#!/usr/bin/env bash
# Deploy Itmam to Cloud Run (same pattern as google-hackathon / Golden Frame).
# Build happens in Google Cloud Build via --source .
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-asia-south1}"
SERVICE="${CLOUD_RUN_SERVICE:-itmam}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "Set a project first:"
  echo "  gcloud config set project YOUR_PROJECT_ID"
  echo "Or: GCP_PROJECT_ID=your-id ./scripts/deploy-cloudrun.sh"
  exit 1
fi

if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env.local
  set +a
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY is required (export it or put it in .env.local)."
  exit 1
fi

GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.8-flash}"

echo "Project:  ${PROJECT_ID}"
echo "Region:   ${REGION}"
echo "Service:  ${SERVICE}"
echo "Model:    ${GEMINI_MODEL}"
echo "Gemini key: from .env.local only (${#GEMINI_API_KEY} chars)"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="${PROJECT_ID}"

gcloud run deploy "${SERVICE}" \
  --source . \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=60 \
  --min-instances=0 \
  --max-instances=3 \
  --quiet \
  --set-env-vars="GEMINI_API_KEY=${GEMINI_API_KEY},GEMINI_MODEL=${GEMINI_MODEL}"

echo
echo "Deployed. Open the Service URL from the output above."
echo "Health:  GET /api/health"
