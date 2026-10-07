# StealOR — Phase B: National e-GP ZIP-to-PDF Extraction Guide

**Teammate Guide | Run from `StealOR/backend` | PowerShell (Windows)**

This guide explains how to run **Phase B**: reading stored document metadata from MongoDB, downloading procurement ZIP archives, and safely extracting individual PDFs to disk.

---

## 1. What Phase B Does

Phase B (`extractGovProjectDocuments.js`) connects to MongoDB in **read-only** mode. For each project and each available document category (`priceEstimate`, `invitation`, `draftEbidding`):

```text
MongoDB Project (Phase A metadata)
  │
  ▼
Validate stored locator (file_id, legacy_filename, or legacy_draft_transfer)
  │
  ▼
Download ZIP buffer via e-GP Adapter -> temp/zips/{projectId}/{category}.zip (.part first)
  │
  ▼
Inspect ZIP Central Directory (Path traversal check, max 50 PDFs, 100 MiB limit)
  │
  ▼
Stage PDFs in temp/pdfs/.staging/{runId}/ & validate '%PDF-' signature + SHA-256
  │
  ▼
Publish PDFs & write `manifest.json` -> temp/pdfs/{projectId}/{category}/
  │
  ▼
Re-verify published artifacts -> Delete temporary ZIP & clean staging folder
```

### What Phase B DOES NOT do:
- ❌ Does **not** modify or write to MongoDB (MongoDB is 100% read-only).
- ❌ Does **not** insert missing projects (projects must already exist in MongoDB).
- ❌ Does **not** perform text parsing, OCR, or AI model calls (Phase C / D).
- ❌ Does **not** re-download files if already verified (`skipped_verified`).

---

## 2. Quick Command Reference

All commands run directly in **PowerShell** from the `backend/` directory. They include the process-local DNS fix (`1.1.1.1`, `8.8.8.8`) to avoid Windows `querySrv ECONNREFUSED` errors automatically.

| Scenario | Mode | Purpose |
|---|---|---|
| **Single Project** | Dry-Run | Preview what categories would be downloaded |
| **Single Project** | Apply | Download ZIP & extract PDFs for 1 project |
| **Batch (5 projects)** | Dry-Run | Preview the first 5 records |
| **Batch (5 projects)** | Apply | Extract PDFs for first 5 records |
| **All Projects** | Dry-Run | Preview extraction plan for all records |
| **All Projects** | Apply | **Full automated batch extraction** |

---

## 3. Ready-to-Run PowerShell Commands

Open PowerShell and navigate to the backend folder:
```powershell
Set-Location 'C:\Users\USER\Downloads\software_collab\StealOR\backend'
```

### Case 1 — Single Project Dry-Run
> **Checks what categories would be downloaded without making network requests or writing files.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--project-id','68109235287']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

### Case 2 — Single Project Apply (Actual Extraction)
> **Downloads ZIP and extracts PDFs for one project.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--project-id','68109235287','--apply','--confirm','EXTRACT_GOV_PROJECT_DOCUMENTS']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

### Case 3 — Batch Dry-Run (First 5 Projects)
> **Plans extraction for the first 5 records in MongoDB.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--source','mongo','--limit','5']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

### Case 4 — Batch Apply (First 5 Projects)
> **Downloads and extracts PDFs for the first 5 records in MongoDB.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--source','mongo','--limit','5','--apply','--confirm','EXTRACT_GOV_PROJECT_DOCUMENTS']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

### Case 5 — All Projects Dry-Run
> **Scans entire MongoDB collection and plans extraction without writing files.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--source','mongo','--all']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

### Case 6 — All Projects Apply (Full Automated Batch Extraction)
> **Automates downloading ZIPs and extracting PDFs for every project in MongoDB.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--source','mongo','--all','--apply','--confirm','EXTRACT_GOV_PROJECT_DOCUMENTS']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

---

## 4. Local File Structure & Manifests

All files are created locally under `backend/temp/` (automatically ignored by Git):

```text
backend/temp/
├── pdfs/
│   └── {projectId}/
│       ├── priceEstimate/
│       │   ├── manifest.json       <-- Verification manifest with SHA-256 hashes
│       │   └── files/
│       │       └── pB0.pdf
│       ├── invitation/
│       │   ├── manifest.json
│       │   └── files/
│       │       ├── Tor.pdf
│       │       └── notice.pdf
│       └── draftEbidding/
│           ├── manifest.json
│           └── files/...
└── zips/
    └── {projectId}/                <-- Cleaned up after successful extraction!
```

### Sample `manifest.json`:
```json
{
  "schemaVersion": 1,
  "projectId": "68109235287",
  "category": "draftEbidding",
  "status": "verified",
  "processedAt": "2026-10-04T00:00:00.000Z",
  "zip": {
    "sha256": "73684a9fcb...",
    "sizeBytes": 19712779
  },
  "pdfs": [
    {
      "originalFileName": "Attach_TOR_1.pdf",
      "artifactPath": "pdfs/68109235287/draftEbidding/files/Attach_TOR_1.pdf",
      "sha256": "4b92...",
      "sizeBytes": 104523,
      "status": "verified"
    }
  ]
}
```

---

## 5. Safe Reruns & Duplicate Prevention

- **Subsequent Runs are Fast & Safe**: If you rerun the command on already extracted projects, the extractor inspects existing `manifest.json` files and verifies all PDF SHA-256 hashes.
- If everything matches, it outputs `skipped_verified` and **skips downloading the ZIP again**.
- If a file is missing or corrupt, it automatically re-stages and updates the folder cleanly.
- If you explicitly want to reprocess everything, append `'--force'` to the command arguments.

---

## 6. How to Inspect Output in PowerShell

```powershell
# 1. View extracted PDFs and files for a project
Get-ChildItem .\temp\pdfs\68109235287 -Recurse

# 2. View the verification manifest
Get-Content .\temp\pdfs\68109235287\draftEbidding\manifest.json | ConvertFrom-Json

# 3. Confirm temporary ZIPs were cleaned up (empty/absent is normal after success)
Get-ChildItem .\temp\zips -Recurse -File -ErrorAction SilentlyContinue

# 4. Confirm temp directory is ignored by Git
git check-ignore temp/pdfs/example.pdf
```

---

## 7. Troubleshooting & Status Codes

| Status / Message | What It Means | Recommended Action |
|---|---|---|
| `extracted` | Successful extraction. Manifest and PDFs saved. | None, ready for Phase C. |
| `skipped_verified` | Manifest and PDFs already verified from a prior run. | Skipped automatically to save bandwidth. |
| `skipped`, `status_not_found` | Category does not exist for this project. | Normal, not an error. |
| `would_download` | Dry-run eligibility plan. | Run with `--apply` to actually extract. |
| `outcome: missing` | Project ID is not found in MongoDB. | Run Phase A or import the project first. |
| `metadata_refresh_required` | The stored file ID is stale or expired. | Rerun Phase A runner to refresh metadata. |
| `querySrv ECONNREFUSED` | Node.js DNS resolver issue on Windows. | The `node -e` commands already have DNS fix built in. |
