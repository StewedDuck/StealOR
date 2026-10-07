# National e-GP Document Downloads & Pipeline Architecture

**Teammate Guide | StealOR Backend**

This document explains the end-to-end document processing pipeline, how e-GP downloads work under the hood, and how frontend and backend services download procurement ZIP archives.

---

## 1. End-to-End Pipeline Overview

The project processes government procurement documents in sequential, decoupled phases:

```text
 ┌────────────────────────────────────────────────────────┐
 │           Phase A: Metadata Enrichment (Runner)        │
 │  - Queries e-GP metadata APIs                          │
 │  - Saves ZIP references into MongoDB `GovProject`      │
 │  - Fast, metadata-only (no ZIP files downloaded)       │
 └───────────────────────────┬────────────────────────────┘
                             │
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │           Phase B: ZIP-to-PDF Extraction (Runner)      │
 │  - Reads stored metadata from MongoDB                  │
 │  - Downloads ZIP archives into memory via e-GP adapter │
 │  - Validates '%PDF-' and extracts PDFs into temp/pdfs/ │
 │  - Writes verified `manifest.json` and deletes ZIP     │
 └───────────────────────────┬────────────────────────────┘
                             │
                             ▼
 ┌────────────────────────────────────────────────────────┐
 │           Phase C: PDF Text Extraction & OCR (Future)  │
 │  - Reads retained per-PDF files from temp/pdfs/        │
 │  - Extracts selectable text; applies OCR to scans      │
 └────────────────────────────────────────────────────────┘
```

---

## 2. Key Rule: Metadata is NOT the ZIP File

MongoDB only stores **locator metadata** (file ID, filename, or Legacy form fields) that tells the backend how to retrieve the file from National e-GP.

- ❌ `documents.*.downloadUrl` is **upstream metadata**, not a public direct link you can paste into a browser.
- ✅ Always download through our **backend download API** or use `nationalEgpAdapter.downloadDocument(metadata)` in backend code.

---

## 3. The 3 Document Categories & Selection Priority

Every project can have up to 3 independent document categories:

| Category | Thai Name | Description | Selection Priority |
|---|---|---|---|
| **`priceEstimate`** | ราคากลาง | Government budget / median price estimation | Independent (always kept) |
| **`invitation`** | ประกวดราคา | Official bidding notice / terms package | **1st Priority** for procurement |
| **`draftEbidding`** | ร่าง e-Bidding | Draft procurement document | **Fallback** when Invitation is absent |

### Invitation Verification Safeguard:
e-GP sometimes returns a valid ZIP ID from `infoProcureDocAnnounZip` that is actually just the initial Draft Temp file. StealOR verifies Invitation archives against the official public e-GP GreenBook document list (`D0` code). Only confirmed Invitation archives receive status `available`.

---

## 4. The 3 e-GP Download Methods

The National e-GP platform has evolved across several generations. StealOR handles all three methods transparently:

| `downloadMethod` | Upstream Protocol | How StealOR Handles It |
|---|---|---|
| `file_id` | Modern HTTP GET with `fileId` parameter | `nationalEgpAdapter` issues authenticated GET |
| `legacy_filename` | Older HTTP GET with `projectId` and `fileName` | `nationalEgpAdapter` issues legacy GET |
| `legacy_draft_transfer` | Legacy HTTP POST with multi-field locator body | `nationalEgpAdapter` constructs the required POST form |

> **Note on Legacy Drafts:** A legacy draft record requires `legacyItemNo`, `legacyTypeId`, `legacyDocType`, and `legacyMethodId`. Opening the URL directly in a browser **will fail**. Our backend adapter handles the POST automatically.

---

## 5. Downloading via Backend HTTP API (Frontend / Browser)

The backend provides clean, sanitized GET endpoints for browsers and client applications. The backend looks up the stored metadata in MongoDB, executes the appropriate e-GP download, and streams the ZIP file to the user:

| Category | Backend Endpoint |
|---|---|
| Price Estimate | `GET /api/gov-projects/:projectId/document/download` |
| Invitation | `GET /api/gov-projects/:projectId/documents/invitation/download` |
| Draft e-Bidding | `GET /api/gov-projects/:projectId/documents/draft-ebidding/download` |

### Testing Endpoints in PowerShell:

```powershell
# Price Estimate
Invoke-WebRequest -UseBasicParsing `
  -Uri "http://localhost:5000/api/gov-projects/68059426756/document/download" `
  -OutFile "price-estimate.zip"

# Invitation
Invoke-WebRequest -UseBasicParsing `
  -Uri "http://localhost:5000/api/gov-projects/68059426756/documents/invitation/download" `
  -OutFile "invitation.zip"

# Draft e-Bidding (works automatically even for Legacy POST drafts!)
Invoke-WebRequest -UseBasicParsing `
  -Uri "http://localhost:5000/api/gov-projects/64117010720/documents/draft-ebidding/download" `
  -OutFile "draft-ebidding.zip"
```

### Frontend TypeScript Helper (`frontend/lib/torApi.ts`):
```ts
import {
  getGovProjectDocumentDownloadUrl,
  getGovProjectInvitationDownloadUrl,
  getGovProjectDraftEbiddingDownloadUrl,
} from "@/lib/torApi";

// Trigger download in browser:
window.location.assign(getGovProjectInvitationDownloadUrl(projectId));
```

---

## 6. How to Run Phase A (Automated Command)

To discover and save document metadata into MongoDB for all projects, use this direct PowerShell one-liner (includes the built-in DNS fix):

```powershell
Set-Location 'C:\Users\USER\Downloads\software_collab\StealOR\backend'

node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','mongo','--all','--apply','--confirm','APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

👉 *For dry-run options and single-project testing, see [README_DOCUMENT_RUNNER_COMMANDS.md](./README_DOCUMENT_RUNNER_COMMANDS.md).*

---

## 7. How to Run Phase B (Automated Extraction)

After Phase A has populated MongoDB, extract all ZIPs and save verified PDFs to disk with this command:

```powershell
Set-Location 'C:\Users\USER\Downloads\software_collab\StealOR\backend'

node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--source','mongo','--all','--apply','--confirm','EXTRACT_GOV_PROJECT_DOCUMENTS']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

👉 *For detailed Phase B commands, verification steps, and output structure, see [README_DOCUMENT_EXTRACTION_COMMANDS.md](./README_DOCUMENT_EXTRACTION_COMMANDS.md).*

---

## 8. Backend Developer Usage (Internal Code)

Backend services and workers should use `nationalEgpAdapter.downloadDocument` directly:

```javascript
const GovProject = require("./src/models/GovProject");
const { nationalEgpAdapter } = require("./src/services/egp/egpClient");

async function downloadDocumentBuffer(projectId, category) {
  const project = await GovProject.findOne(
    { project_id: projectId },
    { [`documents.${category}`]: 1 }
  ).lean();

  if (!project) throw new Error("Project not found");

  const stored = project.documents?.[category];
  if (stored?.status !== "available") {
    throw new Error(`${category} document is not available`);
  }

  // Adapter automatically handles file_id GET, legacy GET, or legacy draft POST
  const metadata = { projectId, ...stored };
  const zipBuffer = await nationalEgpAdapter.downloadDocument(metadata);

  return { metadata, zipBuffer }; // In-memory Buffer
}
```

---

## 9. Security & Safety Checklist

- 🔒 **Never expose e-GP credentials or API keys** to frontend or browser clients.
- 🔒 **Never construct legacy POST forms in frontend code**; always let the backend handle it.
- 🛡️ **Archives are validated before extraction**: zip traversal checks, max file limits (50 PDFs, 100 MiB total uncompressed PDF data), and `%PDF-` signature checks are enforced.
- 🧹 **Zero leftovers**: Phase B removes temporary `.zip` files once PDFs are verified.
