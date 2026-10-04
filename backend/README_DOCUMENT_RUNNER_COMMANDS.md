# StealOR — Phase A: Document Enrichment Runner Guide

**Teammate Guide | Run from `StealOR/backend` | PowerShell (Windows)**

This guide explains how to run **Phase A**: discovering National e-GP document metadata and saving it into MongoDB.

---

## 1. What Phase A Does

Phase A (`enrichGovProjectDocuments.js`) queries public e-GP APIs for existing MongoDB projects, finds their bidding documents, and saves normalized reference metadata into `GovProject.documents`.

```text
MongoDB Project (project_id)
  │
  ├──> 1. Price Estimate Discovery   (price_primary -> fallback -> legacy)
  ├──> 2. Invitation Discovery        (infoProcureDocAnnounZip + GreenBook D0 verification)
  └──> 3. Draft e-Bidding Discovery   (temp revision 0 -> adjusted revisions -> legacy fallback)
  │
  ▼
Determine `selectedProcurementDocument` priority:
  - If Invitation is confirmed present: 'invitation'
  - If Invitation is confirmed absent:   'draftEbidding'
  - If Invitation check fails/error:    null (safe fallback)
  │
  ▼
Update MongoDB `documents` field (Guarded $set, never overwrites other project fields)
```

### What Phase A DOES NOT do:
- ❌ Does **not** download ZIP files to disk.
- ❌ Does **not** extract PDFs, parse text, run OCR, or call AI.
- ❌ Does **not** create missing projects in MongoDB (projects must exist).
- ❌ Does **not** write to MongoDB during **dry-run** mode.

---

## 2. Quick Command Reference

All commands run directly in **PowerShell** from the `backend/` directory. They include the process-local DNS fix (`1.1.1.1`, `8.8.8.8`) to avoid Windows `querySrv ECONNREFUSED` errors automatically.

| Scenario | Mode | Command Type |
|---|---|---|
| **Single Project** | Dry-Run (Safe) | [Case 1](#case-1--single-project-dry-run) |
| **Single Project** | Apply (Writes Mongo) | [Case 2](#case-2--single-project-apply-first-write) |
| **Batch (5 projects)** | Dry-Run (Safe) | [Case 3](#case-3--batch-dry-run-first-5-projects) |
| **Batch (5 projects)** | Apply (Writes Mongo) | [Case 4](#case-4--batch-apply-first-5-projects) |
| **All Projects** | Dry-Run (Safe) | [Case 5](#case-5--all-projects-dry-run) |
| **All Projects** | Apply (Full Refresh) | [Case 6](#case-6--all-projects-apply-full-database-enrichment) |

---

## 3. Ready-to-Run PowerShell Commands

Open PowerShell and navigate to the backend folder:
```powershell
Set-Location 'C:\Users\USER\Downloads\software_collab\StealOR\backend'
```

### Case 1 — Single Project Dry-Run
> **Checks what documents exist without modifying MongoDB.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--project-id','68059426756']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

### Case 2 — Single Project Apply (First Write)
> **Saves document metadata for one project into MongoDB after dry-run review.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--project-id','68059426756','--apply','--confirm','APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

### Case 3 — Batch Dry-Run (First 5 Projects)
> **Simulates enrichment for the first 5 records in MongoDB.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','mongo','--limit','5']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

### Case 4 — Batch Apply (First 5 Projects)
> **Saves document metadata for the first 5 records into MongoDB.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','mongo','--limit','5','--apply','--confirm','APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

### Case 5 — All Projects Dry-Run
> **Scans entire MongoDB collection and plans metadata updates without writing.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','mongo','--all']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

### Case 6 — All Projects Apply (Full Database Enrichment)
> **Automates metadata discovery and saves references for all existing projects in MongoDB.**
```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','mongo','--all','--apply','--confirm','APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

*(Optional: add `--delay-ms 1500` to increase delay between projects if you experience rate limits.)*

---

## 4. CLI Flags Reference

| Flag | Description |
|---|---|
| `--project-id <id>` | Target exactly one 11-digit project ID. |
| `--source mongo` | Read project IDs from MongoDB. |
| `--limit <n>` | Limit batch to the first `n` projects (required with `--source mongo` unless `--all`). |
| `--all` | Process all projects in the collection (only with `--source mongo`). |
| `--delay-ms <n>` | Delay between projects in milliseconds (default: `750`, range: `0–5000`). |
| `--apply` | Enables database writes. If omitted, the runner is in read-only **dry-run** mode. |
| `--confirm APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT` | Exact confirmation token required when `--apply` is set. |
| `--json` | Outputs machine-readable JSON summary. |

---

## 5. Understanding the Discovery Results

Each project's `documents` field in MongoDB will contain:

| Status | Meaning |
|---|---|
| `available` | A valid document ZIP reference was discovered and verified. |
| `not_found` | Upstream confirmed that this document category does not exist for this project. |
| `error` | Upstream request timed out, failed, or returned inconclusive data (safe retryable state). |
| `ambiguous` | Multiple conflicting revisions exist that cannot be safely chosen automatically. |

### Document Categories:
1. **`priceEstimate`**: ราคากลาง (Budget / Price estimation). Independent category.
2. **`invitation`**: เอกสารประกวดราคา (Official invitation bidding package). Primary priority.
3. **`draftEbidding`**: ร่างเอกสารประกวดราคา (Draft TOR / e-Bidding). Fallback when Invitation is absent.

---

## 6. What's Next? (Transition to Phase B)

Once Phase A populates `documents` metadata in MongoDB, proceed to **Phase B** to actually download ZIPs and extract their PDFs to disk:

👉 **See [README_DOCUMENT_EXTRACTION_COMMANDS.md](./README_DOCUMENT_EXTRACTION_COMMANDS.md) for Phase B commands.**
