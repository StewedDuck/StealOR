# StealOR — TOR Aggregation & AI Matching Platform

A full-stack web platform for collecting, discovering, and matching software-related Terms of Reference (TOR) projects. StealOR aggregates public-sector procurement data (e-GP / GovSpending) alongside internal organization TORs into a unified marketplace, leveraging Google Vertex AI / Gemini to extract requirements and automatically score contractor qualifications.

---

##  Architecture & Tech Stack

This repository is structured as a single Git repository containing two applications:

* **`frontend/`** — Next.js 15, React, TypeScript, NextAuth (Google OAuth) running on port `3000`
* **`backend/`** — Node.js + Express REST API & document pipeline running on port `5000`
* **Database:** MongoDB Atlas (cloud-hosted)
* **AI Engine:** Google Vertex AI / Gemini (TOR classification, extraction, and matching analysis)

> 📚 **Full Documentation:** Detailed architecture diagrams, role workflows, coding standards, and complete API specs live in the **[GitHub Wiki](../../wiki)**:
> * **[Wiki Home](../../wiki)** — System roles, sequence diagrams, Scrum workflow, and developer standards
> * **[Backend API Reference](../../wiki/API-document)** — Express endpoints, proxy headers, and payloads
> * **[Frontend API Reference](../../wiki/API-document)** — Next.js proxy routes, client helpers, and caching
> * **[Vertex AI Setup](../../wiki/Vertex-AI-Setup)** — Google Cloud setup, service-account credentials, and a Gemini smoke test
> * **[MongoDB Atlas Setup](../../wiki/MongoDB-Atlas-Setup)** — MongoDB Atlas Setup, Configure network access for database 
> * **[Environment Configuration](../../wiki/Environment-Configuration)** — Setup .env for frontend/backend
> * **[SRS Document](../../wiki/Software-Requirements-Specification)** — Software Requirements Specification
> * **[Software Maintenance Document](../../wiki/Software-Maintenance)** — Service Level Agreement
---

##  Core Features

* **Unified TOR Marketplace:** Aggregates filtered government e-GP software projects with verified internal organization TORs.
* **Automated Document & AI Pipeline:** Downloads e-GP archives, extracts PDF text, and parses structured requirements, budgets, and deadlines via Gemini.
* **AI Qualification Matching:** Evaluates contractor profiles against mandatory and weighted TOR criteria with detailed match breakdowns and dashboard analytics.
* **Role-Based Workflows:** Dedicated interfaces and access controls for **Contractors**, **Project Owners** (drafting, review, KYC verification, publishing), and **Admins**.

---

##  Prerequisites

* [Docker Desktop](https://www.docker.com/products/docker-desktop/) *(recommended)* **or** Node.js `20.19+` (Node.js 24 recommended) and `npm`
* **MongoDB Atlas** cluster with a valid connection string (`MONGODB_URI`)
* **Google Cloud Console** project with:
  * **OAuth 2.0 Client ID** (for NextAuth Google sign-in)
  * **Vertex AI / Gemini** enabled with a service account JSON key

---

## Installation Guideline

Follow the setup steps below

1. **Google OAuth Setup:** Create an OAuth 2.0 Client ID and configure callback URLs — see [Google OAuth Setup](../../wiki/Google-Sign-In-Setup-Guide) or watch the **[OAuth Setup Video](https://youtu.be/qvvXBzdTTwE?si=tfnRrG7pHchbtqlU)**.
2. **MongoDB Atlas Setup:** Provision a cluster, database user, and IP access list — see [MongoDB Atlas Setup](../../wiki/MongoDB-Atlas-Setup) or watch the **[MongoDB Setup Video)](https://youtu.be/jHJ_nUYFxpc)**.
3. **Vertex AI / Gemini Setup:** Enable Vertex AI and place your service account key under `backend/keys/` — see [Vertex AI Setup](../../wiki/Vertex-AI-Setup) or watch the **[AI Setup Video](https://youtu.be/tOHYyQhqm3k)**.
4. **Environment Variables:** Copy `.env.example` / `.env.local` templates and fill in secrets — see [Environment Configuration](../../wiki/Environment-Configuration)
5. **Start the App:** Run with [Docker Compose](#Running-with-Docker-Compose)

---

## How Each Role Works

* **Contractor & Project Owner** *(Walkthrough: **[User Usage Video](https://youtu.be/V99CVdXb8Bo?si=kUzFpMaGxoUmaQCT)**)*
  * **Contractors** complete their profile, skills, budget range, and qualifications to browse TORs, inspect AI match scores/breakdowns, bookmark projects, and comment.
  * **Project Owners** submit identity verification (KYC), create and edit draft TORs, submit drafts for admin review, and publish approved TORs to the marketplace.
* **Admin** *(Walkthrough: **[Admin Usage Video](https://www.youtube.com/watch?v=DUwN77QWzpU)**)*
  * **Admins** monitor platform metrics on the admin dashboard, approve or reject KYC verifications, review and approve/request changes on submitted TORs, manage user accounts/suspensions, configure monitored e-GP RSS departments, and review system activity logs.
  * **SET EMAIL AS ADMIN** [Admin Access](#Admin-Access)
---

## ⚙️ Environment Configuration

Before running the app, copy the environment templates from the repository root and fill in your credentials:

* **`frontend/.env.local`** — Google OAuth credentials, `AUTH_SECRET`, `TOR_PROXY_SECRET`, and API URLs.
* **`backend/.env`** — MongoDB Atlas URI, Vertex AI settings (with service-account key at `backend/keys/sa-key.json`), e-GP API key, email notification credentials, and the matching `TOR_PROXY_SECRET`.

> 📖 **Full Setup & Variable Reference:** See the **[Environment Configuration Wiki](../../wiki/Environment-Configuration)** for step-by-step instructions, secret generation commands, screenshots, and links to the OAuth, MongoDB, and Vertex AI setup guides.
>
> ⚠️ **Security:** Never commit `.env`, `.env.local`, or `backend/keys/sa-key.json` to Git.

## Running with Docker Compose

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

---

## Admin Access

After configuring Google OAuth, add the same lowercase Google account email to the `ADMIN_GMAILS` array in both files:

- [`frontend/lib/auth.ts`](frontend/lib/auth.ts) routes the account to the admin dashboard.
- [`backend/src/controllers/userController.js`](backend/src/controllers/userController.js) assigns the account the `admin` role when it signs in.

For Docker Compose, run `docker compose restart backend frontend` after editing the lists. Then sign in with that Google account at [http://localhost:3000/login](http://localhost:3000/login). If you're already signed in, sign out first so the backend can sync your role at the next sign-in. After sign-in, the app opens `/admin/dashboard`.

---

## Procurement Document Pipeline

* **Single-Project Price Document Enrichment:**
  `POST /api/gov-projects/:projectId/enrich` downloads the official e-GP price-estimate archive for an existing MongoDB `GovProject`, extracts PDF text, and stores metadata under `documentExtraction` (`sourceDocumentType: "price_estimate"`). Scanned image-only PDFs are flagged with a clear no-text status (OCR is deferred to a future milestone).
* **Batch AI Procurement Analysis:**
  Run `npm run analyze:procurement` inside `backend/` to process non-`JUNK` extracted TXT files through Gemini in a single pass per document (16,384-token output budget, schema v3), verifying exact source quotations before generating `analysis.json` and `summary.md`.

---

## Contributing & Workflow

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
