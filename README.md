# TOR Platform

A web-based platform for collecting, discovering, and matching software-related Terms of Reference (TOR) projects.

The platform aggregates TOR data from multiple public-sector sources into a unified marketplace, leveraging AI to automatically evaluate contractor qualifications against project requirements.

---

## 🛠️ Tech Stack

* **Frontend:** Next.js, React, TypeScript
* **Backend:** Node.js, Next.js API Routes
* **Database:** MongoDB Atlas
* **AI Engine:** Google Vertex AI
* **Auth:** Google OAuth

---

## ✨ Core Features

* **TOR Aggregation & Marketplace:** Centralized source for public sector software contracts.
* **AI-Powered Matching:** Intelligent extraction of TOR requirements and automated qualification match scoring.
* **Role-Based Workflows:** Tailored dashboards for Contractors, Project Owners, and Admins.

---

## 🚀 Quick Start

### Prerequisites
* **Node.js** (v18+) & **npm**
* Access to **MongoDB Atlas** and **Google Cloud (Vertex AI / OAuth)**

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd <project-folder>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file in the root directory:
   ```env
   MONGODB_URI=your_mongodb_uri
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret

   GOOGLE_CLOUD_PROJECT=your_project_id
   GOOGLE_CLOUD_LOCATION=your_location
   VERTEX_AI_MODEL=your_model
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 👥 Contributing Guidelines

To keep our codebase clean, please follow these basic rules:

* **Branching:** Use category prefixes (e.g., `feat/`, `fix/`, `frontend/`, `backend/`). Direct pushes to `main` are strictly prohibited.
* **Commits:** Follow Conventional Commits (e.g., `feat: add matching engine`, `fix: tor filter bug`).
* **Pull Requests:** All PRs require at least 1 approval before merging.

> 📄 **See the full [Developer Guidelines & Code Standards in the Wiki](./WIKI.md#developer-guide--standards)** for PR templates, naming conventions, and API standards.

---

## 👥 Contributors

* Sorasit Kateratorn
* Jongchana Khachatrokphai
* Patthiaon Panitanont

---

## 📜 License

This project is intended for educational and research purposes.

---

# Docker Setup

This repository contains one Git repository with two separate applications:

* `frontend/` — Next.js 15 application (port 3000)
* `backend/` — Node.js + Express application (port 5000)

Docker Compose runs both applications together for local development.

External services are **not** containerized:

* MongoDB Atlas — cloud-hosted, connected via `MONGODB_URI`
* Google Vertex AI — cloud-hosted, connected via GCP credentials

---

## Prerequisites

* [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
* MongoDB Atlas cluster configured with a valid connection string
* Google Cloud OAuth 2.0 credentials (for NextAuth Google login)
* `frontend/.env.local` file created from `frontend/.env.example` with real credentials filled in

### Google OAuth Setup

In Google Cloud Console, open **APIs & Services → Credentials**, select the
OAuth 2.0 Client ID used by the frontend, and configure both sections below.

#### Authorized JavaScript origins

For local development (including Docker when the browser opens the application
through `localhost`), add:

```text
http://localhost:3000
```

If a developer opens the application through `127.0.0.1` instead, that origin
must be registered separately:

```text
http://127.0.0.1:3000
```

#### Authorized redirect URIs

Add the Auth.js/NextAuth Google callback URL for every base URL that the team
actually uses. For local development and Docker through `localhost`, add:

```text
http://localhost:3000/api/auth/callback/google
```

If the application is also opened through `127.0.0.1`, add this as a second
redirect URI:

```text
http://127.0.0.1:3000/api/auth/callback/google
```

When the application is deployed, add its production origin and callback as
additional entries, replacing the placeholder with the real HTTPS domain:

```text
https://your-domain.example
https://your-domain.example/api/auth/callback/google
```

Google requires an exact match, including protocol, hostname, port, path, and
trailing slash. Do not add the Express backend (`http://localhost:5000`) as an
OAuth redirect URI because Google returns to the Next.js authentication route.

### Frontend Environment

Copy the example file and fill in your credentials:

```bash
cp frontend/.env.example frontend/.env.local
```

Then edit `frontend/.env.local`:

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
AUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

Each developer should keep real values in `frontend/.env.local`; never commit
or send that file through Git. The team may use the same development Google
OAuth client, but an exposed `GOOGLE_CLIENT_SECRET` must be rotated in Google
Cloud before it is used again. Restart the frontend after changing environment
variables.

### Backend Environment

The `backend/.env` file already exists. Verify it contains a valid `MONGODB_URI`.

---

## Google Cloud Credentials (Vertex AI)

If you are testing Vertex AI features:

1. Download your GCP service account JSON key from Google Cloud Console
2. Place it at:

```
backend/config/gcp-service-account.json
```

3. Uncomment the volume mount in `docker-compose.yml`:

```yaml
- ./backend/config/gcp-service-account.json:/app/config/gcp-service-account.json:ro
```

4. Update `GOOGLE_APPLICATION_CREDENTIALS` in `backend/.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS=/app/config/gcp-service-account.json
```

The JSON key file is excluded from Git by `.gitignore`.

---

## Docker Commands

Build both images:

```bash
docker compose build
```

Start both services:

```bash
docker compose up
```

Build and start in one command:

```bash
docker compose up --build
```

Start in the background:

```bash
docker compose up -d
```

Stop and remove containers:

```bash
docker compose down
```

View live logs:

```bash
docker compose logs -f
```

View logs for a specific service:

```bash
docker compose logs -f frontend
docker compose logs -f backend
```

---

## Access the Application

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Backend Health | http://localhost:5000/health |

---

## Development Workflow

Source code is bind-mounted into the containers, so changes are reflected without rebuilding:

* Frontend — Next.js Turbopack hot reload is active
* Backend — Node.js `--watch` mode restarts on file changes

To rebuild after changing `package.json` or `Dockerfile`:

```bash
docker compose up --build
```
