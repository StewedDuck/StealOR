# Vertex AI Setup for StealOR

This guide explains only how to set up Vertex AI for the StealOR backend.

## 1. Google Cloud setup

In the StealOR Google Cloud project:

1. Link an active billing account.
2. Enable the **Vertex AI API** (`aiplatform.googleapis.com`).
3. Go to **IAM & Admin → Service Accounts**.
4. Create a service account, for example:

```text
stealor-vertex-ai
```

5. Grant it:

```text
Agent Platform User
roles/aiplatform.user
```

6. Open the service account → **Keys** → **Add key** → **Create new key** → **JSON**.

## 2. Store the service-account key

Move the downloaded JSON file to:

```text
backend/keys/sa-key.json
```

Do **not** commit this file.

The repository should ignore:

```text
backend/keys/
```

The JSON file contains a private key, so do not paste it into GitHub, chat, email, or documentation.

## 3. Configure `backend/.env`

Add:

```env
VERTEX_AI_PROJECT_ID=YOUR_PROJECT_ID
VERTEX_AI_LOCATION=global
VERTEX_AI_MODEL=gemini-2.5-flash
GOOGLE_APPLICATION_CREDENTIALS=./keys/sa-key.json
```

Example:

```env
VERTEX_AI_PROJECT_ID=stealor-507314
VERTEX_AI_LOCATION=global
VERTEX_AI_MODEL=gemini-2.5-flash
GOOGLE_APPLICATION_CREDENTIALS=./keys/sa-key.json
```

This project uses a **service-account JSON key**.

It does not require:

```text
API key
gcloud auth application-default login
```

## 4. Install dependencies

From the backend directory:

```powershell
npm install
```

The project uses:

```text
@google/genai
```

## 5. Test the connection

Run from the backend directory:

```powershell
npm run smoke:vertex
```

Expected output:

```text
Vertex connection successful
```

This confirms:

```text
StealOR backend
→ service-account JSON
→ Google Cloud
→ Vertex AI
→ Gemini
```

## 6. Setup for teammates

Each teammate needs:

```env
VERTEX_AI_PROJECT_ID=YOUR_PROJECT_ID
VERTEX_AI_LOCATION=global
VERTEX_AI_MODEL=gemini-2.5-flash
GOOGLE_APPLICATION_CREDENTIALS=./keys/sa-key.json
```

and a valid service-account JSON key stored at:

```text
backend/keys/sa-key.json
```

Then run:

```powershell
npm install
npm run smoke:vertex
```

Do not commit the JSON key to Git.

## 7. Procurement analysis

Analyze one locally extracted project from the backend directory:

```powershell
npm run analyze:procurement -- --project-id 67049068372
```

Use `--all-local` for discovered local project folders and `--limit N` to bound
a test batch. Existing results are reused only when their fingerprint matches;
use `--force` only when intentionally regenerating and overwriting the generated
`analysis.json` and `summary.md` files.

Selection still comes from each category's existing `manifest.json`: supported
labels are eligible and `JUNK` or unsupported labels are excluded. Every
selected TXT is read in full and sent in exactly one Gemini request. There is no
character-based splitting, overlap, fallback split, or same-document retry. A
request failure is recorded against that document and does not stop later
documents from being processed.

Whole-document extraction has no fixed TOR candidate-count ceiling (and keeps
the same seven section codes) with a 16,384-token response budget. This removes
the old ten-candidate ceiling without changing field eligibility or evidence
rules. Every returned quote must still verify against the original full TXT.

The analyzer records lightweight performance diagnostics in `analysis.json`.
Project-level processing includes start/end timestamps, elapsed milliseconds,
planned/attempted/completed request counts, and aggregate token usage when
Vertex supplies it. Each document records its filename, archive category,
Gemini request start/end timestamps, API latency, and input/output/total token
counts. The CLI prints the same per-document latency and token counts while it
runs. Token fields remain `null` when Vertex omits usage metadata.

The structured `analysis.json` contract is schema version 3. It contains the two
validated price fields, Thai TOR summary arrays, the final bid-submission closing
date, document assessment, coverage, and evidence. Missing scalar values are
`null`, missing collections are empty arrays, and coverage/status fields explain
whether a source was unavailable or an available source did not contain a value.
The human-readable `summary.md` displays `ไม่พบข้อมูล` for missing scalar values.

Only the final bid-submission closing date is extracted. A draft public-comment
deadline is intentionally not part of the schema because there is no reliable
source for it. Dates must not be substituted for one another.

`summary.md` is a report for people; future MongoDB persistence must store the
structured analysis object rather than the Markdown text or raw Gemini responses.

## 8. Important

Enabling Vertex AI does not consume model usage by itself.

Usage starts when the backend actually sends a request to Vertex AI, for example:

```powershell
npm run smoke:vertex
```

Generated analysis should be reviewed together with its evidence and coverage
status before production use.
