# TOR Platform

A web-based platform for collecting, discovering, and matching software-related Terms of Reference (TOR) projects.

The platform gathers TOR information from multiple government and public-sector sources into one place, making it easier for software contractors to discover suitable projects.

The system also compares contractor qualifications with TOR requirements and provides matching results to help contractors identify relevant opportunities.

---

# Tech Stack

## Frontend

* Next.js
* TypeScript
* React

## Backend

* Node.js
* Next.js API / Server-side services

## Database

* MongoDB Atlas

## AI

* Google Vertex AI

## Authentication

* Google Authentication

## Other Tools

* Git
* GitHub
* REST APIs
* External Government / TOR Data Sources

---

# Main Features

* [ ] Google authentication
* [ ] Role-based access
* [ ] Contractor profile management
* [ ] Project Owner profile management
* [ ] Admin management
* [ ] TOR collection from multiple external sources
* [ ] TOR information extraction
* [ ] TOR marketplace
* [ ] TOR search and filtering
* [ ] TOR detail page
* [ ] Original TOR source linking
* [ ] TOR PDF download
* [ ] Contractor qualification management
* [ ] Automatic TOR qualification matching
* [ ] Match percentage calculation
* [ ] Matched and unmatched qualification breakdown
* [ ] Matching threshold configuration
* [ ] Partial-match TOR recommendations
* [ ] TOR bookmarking
* [ ] TOR deadline notifications
* [ ] Draft TOR creation
* [ ] Draft TOR review and comments
* [ ] Project Owner TOR publishing
* [ ] TOR verification
* [ ] Project status tracking
* [ ] Contractor dashboard
* [ ] Project Owner dashboard
* [ ] Admin dashboard
* [ ] Email notifications
* [ ] Thai language support

---

# System Roles

The system contains three main user roles.

## Contractor

Contractors use the platform to discover TOR projects that match their qualifications.

Main functions include:

* Browse TOR projects
* Search and filter TORs
* Create and update company qualifications
* View automatic TOR matches
* View match percentages
* View matched and unmatched requirements
* Adjust matching thresholds
* Bookmark TORs
* Receive notifications
* Review Draft TORs
* Provide feedback to Project Owners

---

## Project Owner

Project Owners represent organizations or government agencies that want to publish TOR projects.

Main functions include:

* Create TORs
* Save TORs as Draft
* Edit Draft TORs
* Upload TOR documents
* Configure project requirements
* Configure requirement weights
* Mark mandatory requirements
* Review contractor feedback
* Reply to comments
* Submit TORs for verification
* Publish verified TORs
* Track project status
* View matching contractors

---

## Admin

Admins manage and monitor the platform.

Main functions include:

* Manage user accounts
* Suspend or reactivate users
* Review TOR verification requests
* Monitor TOR data sources
* Monitor project status
* Review reports and complaints
* Monitor platform activity
* Maintain audit records

---

# TOR Collection

The platform collects TOR information from multiple external sources.

The general pipeline is:

```text
External TOR Sources
        ↓
Data Collection
        ↓
TOR Document / Data Processing
        ↓
Information Extraction
        ↓
MongoDB Atlas
        ↓
TOR Marketplace
        ↓
Qualification Matching
```

External sources may include:

* Government procurement websites
* Government Open Data APIs
* Public agency websites
* Other configured TOR sources

The original TOR source should always be stored so users can access the official project information.

---

# AI Integration

Google Vertex AI is used to support intelligent processing of TOR information.

Possible responsibilities include:

* Extracting important information from TOR documents
* Identifying TOR requirements
* Structuring unstructured TOR text
* Comparing TOR requirements with contractor qualifications
* Supporting qualification matching

Example extracted TOR information:

```json
{
  "projectName": "Government Software Development Project",
  "budget": 5000000,
  "closingDate": "2026-10-30",
  "requirements": [
    "Minimum 3 years software development experience",
    "ISO 27001 certification",
    "Experience with government systems"
  ]
}
```

---

# Qualification Matching

The system compares contractor qualifications against TOR requirements.

Example:

```text
TOR Requirements
        ↓
Vertex AI / Matching Engine
        ↑
Contractor Qualifications
        ↓
Matching Result
```

Example result:

```json
{
  "matchPercentage": 80,
  "matched": [
    "Software development experience",
    "Government project experience"
  ],
  "unmatched": [
    "ISO 27001 certification"
  ]
}
```

Project Owners can also assign different weights to requirements and mark important requirements as mandatory.

---

# Installation Guide

## Prerequisites

Install:

* Node.js
* npm
* Git

You will also need access to:

* MongoDB Atlas
* Google Cloud
* Vertex AI
* Google Authentication credentials

---

# Project Setup

Clone the repository:

```bash
git clone <repository-url>
```

Navigate to the project:

```bash
cd <project-folder>
```

Install dependencies:

```bash
npm install
```

Create an environment file:

```bash
.env.local
```

Example:

```env
MONGODB_URI=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=
VERTEX_AI_MODEL=
```

Do not commit this file to GitHub.

---

# Running the Application

Run the development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

---

# Running the Application frontend

```bash
cd frontend
npm run dev
```

# Access admin page
open DevTools Console then run
```bash
localStorage.setItem("stealors_auth_user", JSON.stringify({
  email: "admin@gmail.com",
  name: "Admin",
  initials: "AD",
  accountRole: "admin"
}))
location.href = "/"
```

# Team Development Guidelines

## 1. Main Branch Protection

❌ Direct commits or pushes to the `main` branch are strictly prohibited.

All changes must go through:

1. Feature branch
2. Pull Request
3. Code Review
4. Approval
5. Merge

---

# 2. Branch Naming Convention

Every branch should follow:

```bash
<main-category>/<sub-problem>
```

Examples:

```bash
frontend/tor_market
frontend/contractor_dashboard
backend/tor_api
backend/matching_api
database/tor_schema
ai/tor_extraction
ai/qualification_matching
security/google_auth
test/matching_engine
docs/readme_update
```

### Allowed Main Categories

* frontend
* backend
* database
* security
* test
* ai
* docs
* devops
* refactor
* fix
* feature

---

# 3. Pull Request Review Rules

Every Pull Request must:

* Be reviewed by at least one team member
* Receive approval before merging
* Include comments when issues are found

If everything is correct:

```text
Everything looks good and ready to merge.
```

If issues are found:

```text
- Missing validation for TOR input
- Matching API response is inconsistent
- Authentication middleware is missing
```

The PR creator should fix the issues and reply with an update.

Example:

```text
Fixed:
- Added TOR input validation
- Standardized matching API response
- Added authentication middleware
```

---

# 4. Pull Request Template

```md
## Description

Short description of the pull request.

## Relates to issue

#issue_number

## Changes

### Subproblem 1

-
-
-

### Subproblem 2

-
-
-

## Screenshots

## Checklist

- [ ] Code runs successfully
- [ ] No merge conflicts
- [ ] Reviewed locally
- [ ] Documentation updated
- [ ] Naming conventions followed
- [ ] No sensitive data exposed
```

---

# 5. Commit Message Convention

Use:

```bash
<type>: <short description>
```

Examples:

```bash
feat: add tor marketplace
feat: add qualification matching api
fix: resolve tor filtering bug
refactor: simplify matching service
docs: update installation guide
test: add matching engine tests
```

### Allowed Commit Types

* feat
* fix
* chore
* docs
* refactor
* test
* style
* perf
* build

---

# Coding Standards

## General Rules

* Write clean and readable code
* Prioritize maintainability over cleverness
* Avoid unnecessary complexity
* Keep functions small and focused
* Use meaningful variable and function names
* Avoid duplicated logic
* Remove unused imports and dead code
* Avoid hardcoded values
* Use environment variables for configuration
* Prefer reusable components and functions
* Keep business logic separate from UI logic

---

# Naming Conventions

## Variables

Use `camelCase`.

```ts
contractorProfile
torRequirements
matchPercentage
projectStatus
```

## Functions

Use `camelCase`.

```ts
fetchTorData()
calculateMatch()
extractTorRequirements()
fetchContractorProfile()
```

## Classes

Use `PascalCase`.

```ts
TorService
MatchingEngine
ContractorService
```

## Constants

Use `UPPER_SNAKE_CASE`.

```ts
MAX_UPLOAD_SIZE
DEFAULT_MATCH_THRESHOLD
TOR_SYNC_INTERVAL
```

## TypeScript / React Files

Use consistent component naming.

```text
TorCard.tsx
ContractorDashboard.tsx
MatchingResult.tsx
QualificationForm.tsx
```

Utility files:

```text
torService.ts
matchingService.ts
database.ts
vertexAi.ts
```

---

# Frontend Standards

* Keep React components small and reusable
* Separate UI components from business logic
* Use TypeScript types/interfaces
* Use Next.js routing conventions
* Keep shared components in dedicated folders
* Validate API responses before rendering
* Handle loading and error states
* Avoid deeply nested component structures
* Use Server Components where appropriate
* Use Client Components only when client-side interaction is required

---

# Backend Standards

* Separate API routes, services, models, and utilities
* Validate request bodies before processing
* Avoid business logic directly inside API handlers
* Use proper HTTP status codes
* Return consistent API responses
* Add error handling for endpoints
* Protect role-specific endpoints
* Validate data received from external TOR sources
* Keep Vertex AI logic separated from API routes

---

# AI Standards

* Keep AI prompts versioned
* Store model configuration
* Document extraction rules
* Validate AI-generated TOR information
* Do not automatically trust generated values
* Keep AI processing separate from core application logic
* Record failures when TOR extraction cannot be completed
* Keep original TOR information for verification
* Test matching results using known examples

---

# API Standards

## Success Response

```json
{
  "success": true,
  "data": {},
  "message": "Request successful"
}
```

## Error Response

```json
{
  "success": false,
  "error": "Invalid input"
}
```

---

# Security Guidelines

* Never commit `.env` files
* Never expose API keys
* Use environment variables for secrets
* Validate all user inputs
* Validate uploaded TOR documents
* Use HTTPS in production
* Implement role-based authorization
* Protect Admin endpoints
* Avoid storing sensitive information in frontend code
* Follow PDPA requirements
* Review dependencies for vulnerabilities
* Validate authentication tokens server-side
* Restrict Project Owner publishing until verification is completed

---

# Testing Guidelines

* Test features locally before creating Pull Requests
* Write unit tests for important business logic
* Test qualification matching
* Test TOR extraction
* Test API endpoints
* Test role-based authorization
* Test TOR filtering and searching
* Test Google authentication
* Test MongoDB operations
* Test error handling
* Test responsive layouts
* Avoid merging untested code

---

# Recommended `.gitignore`

```gitignore
node_modules/
.env
.env.local
.env.development
.env.production
.next/
out/
dist/
build/
coverage/
*.log
.DS_Store
```

---

# Future Improvements

* Improved AI-based TOR requirement extraction
* Semantic TOR search
* AI-assisted TOR recommendations
* Improved contractor-to-TOR matching
* Automatic TOR source synchronization
* Additional government TOR sources
* TOR change detection
* Advanced notification settings
* TOR analytics
* Contractor recommendation for Project Owners
* Multilingual TOR processing

---

# Contributors

* Sorasit Kateratorn
* Jongchana Khachatrokphai
* Patthiaon Panitanont

---

# License

This project is intended for educational and research purposes.
