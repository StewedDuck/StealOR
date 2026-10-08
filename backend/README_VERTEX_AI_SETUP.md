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

## 7. Important

Enabling Vertex AI does not consume model usage by itself.

Usage starts when the backend actually sends a request to Vertex AI, for example:

```powershell
npm run smoke:vertex
```

For now, Vertex AI is only configured and tested. PDF/TOR processing should be connected later.
