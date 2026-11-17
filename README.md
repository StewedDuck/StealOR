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

---

## ✨ Core Features

* **Unified TOR Marketplace:** Aggregates filtered government e-GP software projects with verified internal organization TORs.
* **Automated Document & AI Pipeline:** Downloads e-GP archives, extracts PDF text, and parses structured requirements, budgets, and deadlines via Gemini.
* **AI Qualification Matching:** Evaluates contractor profiles against mandatory and weighted TOR criteria with detailed match breakdowns and dashboard analytics.
* **Role-Based Workflows:** Dedicated interfaces and access controls for **Contractors**, **Project Owners** (drafting, review, KYC verification, publishing), and **Admins**.

---

## 🚀 Prerequisites

* [Docker Desktop](https://www.docker.com/products/docker-desktop/) *(recommended)* **or** Node.js `v18+` & `npm`
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
  *(If you access the app via `127.0.0.1`, register `http://127.0.0.1:3000` separately.)*

* **Authorized redirect URIs:**
  ```text
  http://localhost:3000/api/auth/callback/google
  ```
  *(Do not add port `5000` — OAuth callbacks route through Next.js on port `3000`.)*

### 2. Frontend Environment (`frontend/.env.local`)
Copy the example file and populate your credentials:

```bash
cp frontend/.env.example frontend/.env.local
```

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
AUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

INTERNAL_API_URL=http://backend:5000
NEXT_PUBLIC_API_URL=http://localhost:5000
TOR_PROXY_SECRET=your-shared-proxy-secret
```

Generate `AUTH_SECRET` and `TOR_PROXY_SECRET`:
```bash
openssl rand -base64 32
```

### 3. Backend Environment (`backend/.env` & GCP Credentials)
Ensure `backend/.env` contains your MongoDB connection string and matching proxy secret:

```env
PORT=5000
MONGODB_URI=your_mongodb_atlas_uri
TOR_PROXY_SECRET=your-shared-proxy-secret
GOOGLE_APPLICATION_CREDENTIALS=/app/config/gcp-service-account.json
```

To enable Vertex AI / Gemini features:
1. Place your GCP service account key at `backend/config/gcp-service-account.json` *(excluded from Git via `.gitignore`)*.
2. Uncomment the volume mount in `docker-compose.yml`:
   ```yaml
   - ./backend/config/gcp-service-account.json:/app/config/gcp-service-account.json:ro
   ```

> ⚠️ **Security:** Never commit `.env`, `.env.local`, or `gcp-service-account.json` to Git. If any secret is exposed, rotate it immediately.

---

## 🐳 Running with Docker Compose (Recommended)

Source code is bind-mounted into both containers with hot-reload enabled (Next.js Turbopack on frontend, `node --watch` on backend).

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

## 🛠️ Running Without Docker (Manual Local Setup)

If running services directly on your host machine, set `INTERNAL_API_URL=http://localhost:5000` in `frontend/.env.local`, then run each app in a separate terminal:

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

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
