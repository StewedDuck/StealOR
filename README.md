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

> 📖 **Looking for detailed feature specifications?** Check out the [System Wiki](./WIKI.md).

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
