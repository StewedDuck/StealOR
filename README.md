# StealOR — TOR Aggregation & AI Matching Platform

A full-stack web platform for collecting, discovering, and matching software-related Terms of Reference (TOR) projects. StealOR aggregates public-sector procurement data (e-GP / GovSpending) alongside internal organization TORs into a unified marketplace, leveraging Google Vertex AI / Gemini to extract requirements and automatically score contractor qualifications.

---

## 🏗️ Architecture & Tech Stack

This repository is structured as a single Git repository containing two applications:

* **`frontend/`** — Next.js 15, React, TypeScript, NextAuth (Google OAuth) running on port `3000`
* **`backend/`** — Node.js + Express REST API & document pipeline running on port `5000`
* **Database:** MongoDB Atlas (cloud-hosted)
* **AI Engine:** Google Vertex AI / Gemini (TOR classification, extraction, and matching analysis)

> 📚 **Full Documentation:** Detailed architecture diagrams, role workflows, coding standards, and complete API specs live in the **[GitHub Wiki](../../wiki)**:
> * **[Wiki Home](../../wiki)** — System roles, sequence diagrams, Scrum workflow, and developer standards
> * **[Backend API Reference](../../wiki/Backend-API-Documentation)** — Express endpoints, proxy headers, and payloads
> * **[Frontend API Reference](../../wiki/Frontend-API-Documentation)** — Next.js proxy routes, client helpers, and caching
> * **[Vertex AI Setup](backend/README_VERTEX_AI_SETUP.md)** — Google Cloud setup, service-account credentials, and a Gemini smoke test

---

## ✨ Core Features

* **Unified TOR Marketplace:** Aggregates filtered government e-GP software projects with verified internal organization TORs.
* **Automated Document & AI Pipeline:** Downloads e-GP archives, extracts PDF text, and parses structured requirements, budgets, and deadlines via Gemini.
* **AI Qualification Matching:** Evaluates contractor profiles against mandatory and weighted TOR criteria with detailed match breakdowns and dashboard analytics.
* **Role-Based Workflows:** Dedicated interfaces and access controls for **Contractors**, **Project Owners** (drafting, review, KYC verification, publishing), and **Admins**.

---

## 🚀 Prerequisites

* [Docker Desktop](https://www.docker.com/products/docker-desktop/) *(recommended)* **or** Node.js `20.19+` (Node.js 24 recommended) and `npm`
* **MongoDB Atlas** cluster with a valid connection string (`MONGODB_URI`)
* **Google Cloud Console** project with:
  * **OAuth 2.0 Client ID** (for NextAuth Google sign-in)
  * **Vertex AI / Gemini** enabled with a service account JSON key

---

## ⚙️ Environment Configuration

### 1. Google OAuth Setup
In **Google Cloud Console → APIs & Services → Credentials**, configure your OAuth 2.0 Client ID:

* **Authorized JavaScript origins:**
  ```text
  http://localhost:3000
  ```

* **Authorized redirect URIs:**
  ```text
  http://localhost:3000/api/auth/callback/google
  ```
  If you use `127.0.0.1` for manual development, register the same origin and callback with that hostname and update `NEXTAUTH_URL` to match.

### 2. Frontend Environment (`frontend/.env.local`)
For a fresh setup, run the copy commands from the repository root. If you already have an environment file, add missing values from the corresponding example to your existing file.

```bash
cp frontend/.env.example frontend/.env.local
```

Use [`frontend/.env.example`](frontend/.env.example) as the template.

```env
# NextAuth v5 - Google OAuth Provider
# Get these from: Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Auth.js v5 secret — generate with: openssl rand -base64 32
AUTH_SECRET=your-auth-secret

# NextAuth URL — base URL of the Next.js app
# For local development: http://localhost:3000
# For Docker:            http://localhost:3000
NEXTAUTH_URL=http://localhost:3000

# Express backend URL used by client-side TOR CRUD requests
NEXT_PUBLIC_API_URL=http://localhost:5000

TOR_PROXY_SECRET=YOUR_EXISTING_BACKEND_SECRET
INTERNAL_API_URL=http://localhost:5000
```

Run `openssl rand -base64 32` twice to generate separate values for `AUTH_SECRET` and `TOR_PROXY_SECRET`. Use the same `TOR_PROXY_SECRET` in both apps. Docker Compose sets `INTERNAL_API_URL=http://backend:5000` inside the frontend container.

### 3. Backend Environment (`backend/.env`)

```bash
cp backend/.env.example backend/.env
```

Use [`backend/.env.example`](backend/.env.example) as the template.

```env
# Server Configuration
PORT=5000

# MongoDB Atlas Connection
# Replace <username>, <password>, and <cluster-url> with your actual MongoDB Atlas details
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>.mongodb.net/stealor_db?retryWrites=true&w=majority

# Google Cloud / Vertex AI (TOR analysis, contractor matching, and smoke test)
# Store the downloaded service-account key under backend/keys/; never commit it.
VERTEX_AI_PROJECT_ID=YOUR_PROJECT_ID
VERTEX_AI_LOCATION=global
VERTEX_AI_MODEL=gemini-2.5-flash
GOOGLE_APPLICATION_CREDENTIALS=./keys/sa-key.json

# Public e-GP project-service fallback used when the primary price ZIP lookup is empty
EGP_PROJECT_SERVICE_API_KEY=replace-with-current-egp-project-service-key

# email notification
EMAIL_USER=
EMAIL_APP_PASSWORD=
APP_URL=http://localhost:3000
# Automatic in-system TOR analysis and contractor matching (default: enabled).
# Scans every 60 seconds, analyzes at most 2 TORs per tick, shares the AI concurrency limit.
# Set false to pause automatic analysis; opening Matching can still refresh existing analyses.
MATCHING_AUTOMATION_ENABLED=true
TOR_PROXY_SECRET=YOUR_BACKEND_SECRET
```

Follow the [MongoDB Atlas setup](#mongodb-atlas-setup) to set `MONGODB_URI`. Set `EGP_PROJECT_SERVICE_API_KEY` for the e-GP document fallback and `EMAIL_USER` and `EMAIL_APP_PASSWORD` for email delivery. `APP_URL` is the frontend URL used in email links.

For TOR analysis and matching, follow the [Vertex AI setup guide](backend/README_VERTEX_AI_SETUP.md). Save the service-account key at `backend/keys/sa-key.json`. Docker Compose already mounts the keys directory at `/app/keys`, so `GOOGLE_APPLICATION_CREDENTIALS=./keys/sa-key.json` works with both launch methods. Set `MATCHING_AUTOMATION_ENABLED=false` if you want to pause background AI requests during local testing.

After installing backend dependencies, check the Vertex AI connection with `cd backend && npm run smoke:vertex` from the repository root. The smoke test sends a small request to Gemini.

> ⚠️ **Security:** Never commit `.env`, `.env.local`, or the service-account JSON key to Git. If any secret is exposed, rotate it immediately.

---

## MongoDB Atlas Setup

The backend uses MongoDB Atlas for both Docker and manual development. Docker Compose starts the frontend and backend, and the backend connects to Atlas.

1. Create an Atlas cluster or use an existing one. Give the application's database user read and write access to the database you plan to use.
2. Add the public IP your backend connects from to the Atlas project's IP access list. For local development, use your network's public IP.
3. Copy the cluster's driver connection string into `MONGODB_URI` in `backend/.env`. Fill in the database user's credentials and put the database name in the URI path before the query parameters. The example uses `stealor_db`. Use your existing database name if you want to access existing records. [MongoDB Atlas connection guide](https://www.mongodb.com/docs/atlas/driver-connection/)
4. After starting the backend, run `curl http://localhost:5000/health` and check for `"mongoState":1`.

To inspect matching results in Atlas, open the `precomputed_matching` collection in the database named in your URI. Filter by `contractorId` and `torId` to find a specific match. Check `computedAt` for when it was saved and `result.matchingPercentage` for its score.

---

## 🐳 Running with Docker Compose (Recommended)

Source code is bind-mounted into both containers. The frontend uses Next.js Turbopack for hot reload. After editing backend source, run `docker compose restart backend`.

```bash
# Build and start both frontend and backend
docker compose up --build

# Run in background (detached mode)
docker compose up -d

# View live logs (all services or specific service)
docker compose logs -f
docker compose logs -f frontend
docker compose logs -f backend

# Stop and remove containers
docker compose down
```

### Local Service URLs

| Service | URL |
| :--- | :--- |
| **Frontend App** | [http://localhost:3000](http://localhost:3000) |
| **Backend API** | [http://localhost:5000](http://localhost:5000) |
| **Backend Health Check** | [http://localhost:5000/health](http://localhost:5000/health) |

---

The backend health endpoint returns HTTP 200 when Express is running. Check for `mongoState: 1` in the response to confirm MongoDB is connected.

## 🛠️ Running Without Docker (Manual Local Setup)

Set `INTERNAL_API_URL=http://localhost:5000` in `frontend/.env.local`, then run each set of commands from the repository root in a separate terminal.

```bash
# Terminal 1 — Backend
cd backend
npm ci
npm run dev

# Terminal 2 — Frontend
cd frontend
npm ci
npm run dev
```

---

## Admin Access

After configuring Google OAuth, add the same lowercase Google account email to the `ADMIN_GMAILS` array in both files:

- [`frontend/lib/auth.ts`](frontend/lib/auth.ts) routes the account to the admin dashboard.
- [`backend/src/controllers/userController.js`](backend/src/controllers/userController.js) assigns the account the `admin` role when it signs in.

For Docker Compose, run `docker compose restart backend frontend` after editing the lists. Then sign in with that Google account at [http://localhost:3000/login](http://localhost:3000/login). If you're already signed in, sign out first so the backend can sync your role at the next sign-in. After sign-in, the app opens `/admin/dashboard`.

---

## 📄 Procurement Document Pipeline

* **Single-Project Price Document Enrichment:**
  `POST /api/gov-projects/:projectId/enrich` downloads the official e-GP price-estimate archive for an existing MongoDB `GovProject`, extracts PDF text, and stores metadata under `documentExtraction` (`sourceDocumentType: "price_estimate"`). Scanned image-only PDFs are flagged with a clear no-text status (OCR is deferred to a future milestone).
* **Batch AI Procurement Analysis:**
  Run `npm run analyze:procurement` inside `backend/` to process non-`JUNK` extracted TXT files through Gemini in a single pass per document (16,384-token output budget, schema v3), verifying exact source quotations before generating `analysis.json` and `summary.md`.

---

## 👥 Contributing & Workflow

* **Branching:** Direct pushes to `main` are prohibited. Create feature branches using `<category>/<sub-issue>` (e.g., `frontend/tor_market`, `backend/matching_api`, `ai/tor_extraction`).
* **Commits:** Follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
* **Pull Requests:** All PRs require at least **1 team approval** before merging.

See the **[Developer Guide & Standards](../../wiki#developer-guide--standards)** in the Wiki for full PR templates and naming rules.

---

## 👥 Contributors

* **Sorasit Kateratorn**
* **Jongchana Khachatrokphai**
* **Patthiaon Panitanont**

---

## 📜 License

This project is developed for educational and research purposes.
