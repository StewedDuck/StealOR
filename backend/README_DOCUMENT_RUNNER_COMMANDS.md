# Document Enrichment Runner — Command Guide (PowerShell)

This guide is for running the **metadata-only** National e-GP document enrichment process. For ZIP downloads and PDF extraction, see `backend/README_DOCUMENT_DOWNLOADS.md`.

The runner discovers Price Estimate, Invitation, and Draft e-Bidding ZIP references and compares them with existing `GovProject.documents` metadata. It **does not download or store ZIPs, extract PDFs, run OCR/AI, or create missing projects**.

## Before running

Open PowerShell and switch to the repository's backend directory:

```powershell
Set-Location 'C:\Users\USER\Downloads\software_collab\StealOR\backend'
```

Make sure dependencies and the backend's MongoDB configuration are set up. These commands use the MongoDB configured by the backend; confirm it is the **intended database**, especially before any apply command. The backend HTTP server does not need to be started merely to run this CLI.

### Windows DNS workaround (`querySrv ECONNREFUSED`)

On our development PC, the normal npm command could not resolve the MongoDB Atlas SRV address. The examples below use the **tested, directly executable `node -e` format**. Each command sets DNS servers to `1.1.1.1` and `8.8.8.8` for that **Node.js process only**, then starts the runner explicitly. No PowerShell helper needs to be defined. Run each command from `backend`.

If DNS works normally on your PC, you can instead run `npm run enrich:documents --` followed by the same runner arguments. Do not change system-wide DNS or disable TLS verification just for this script.

## Invitation category verification (corrected discovery)

Invitation discovery no longer treats a successful ZIP-reference response as proof that an Invitation package exists. The adapter compares the Invitation candidate with the initial Draft Temp locator (`zipId`, `buildName1`, and `buildName2`) and corroborates the category against the public e-GP `greenBook` related-document list (`data.greenBookAnnouncementTypeLinkDto`). A `D0` entry identifies the Invitation/ประกาศเชิญชวน category; `B0` and `B3` are Draft categories. Matching or differing filenames/locators alone do not establish a document's category.

The Invitation result now distinguishes:

| Status | Meaning for this runner |
| --- | --- |
| `available` | Authoritative category evidence confirms Invitation and the candidate is consistent. |
| `not_found` | A successful, complete public document list confirms no `D0` Invitation entry. |
| `error` | Verification failed or evidence is incomplete, unavailable, or contradictory; this is **not** confirmed absence. |

Category evidence is accepted as complete only after successful token generation, project-detail lookup, `greenBook` response and valid token state, with an array-valued document list. A timeout, malformed response, or failed Draft Temp correlation must not become `not_found`. Existing selection logic prefers a confirmed Invitation; when Invitation is confirmed `not_found` and Draft is available, it selects `draftEbidding`; when Invitation is `error`, selection remains `null` even if Draft is available. Price Estimate remains independent. Selection indicates priority, not exclusive extraction eligibility.

**Persistence caution:** The runner compares new observations with existing `GovProject.documents` using a conservative merge. An existing usable `available` reference is preserved when refresh returns `not_found`, `error`, `ambiguous`, or incomplete availability; the discrepancy should be reviewed rather than assuming the new result automatically repairs previously stored false-positive Invitation metadata. Dry-run displays proposed changes and makes no writes. Review the target records and the report before approving any `--apply`; this bug fix did not run a migration or rewrite MongoDB data.

## A. Dry-run commands — no MongoDB writes

Dry-run is the default. It **does connect to MongoDB and make live e-GP metadata requests**, but does not save document changes.

### Case 1 — Discover one known project

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--project-id','68059426756']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Checks whether that existing MongoDB project has document references and prints the proposed metadata changes. Start here.

### Case 2 — Read one project ID from Local JSON

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','local','--limit','1']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Takes one project ID from the configured local provider (`software_tor_5.json` in the current setup). If it is not in MongoDB, skips it; does not import it.

### Case 3 — Read one existing project ID from MongoDB

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','mongo','--limit','1']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Checks the MongoDB-source workflow with a small batch.

### Case 4 — Discover all project IDs from Local JSON

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','local']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Dynamically reads the provider's actual entries. The current local file contains 27 unique project IDs, but the runner must not hard-code that count. Missing MongoDB records are skipped.

### Case 5 — Discover all existing MongoDB projects

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','mongo','--all']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Explicitly opts in to a database-wide dry-run. This can send **multiple e-GP requests per project**. For a larger data set, consider a smaller `--limit` first and a higher delay (see below).

## B. Apply commands — these WRITE metadata to MongoDB

**Warning:** Do not run these until you have reviewed the corresponding dry-run output, checked the target database, and decided to update existing project records. Apply mode requires the exact confirmation token, makes a pre-write backup, performs narrow document-metadata updates, and verifies writes according to the runner implementation. It does **not** create missing projects.

### Case 6 — Apply one approved project (recommended first write)

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--project-id','68059426756','--apply','--confirm','APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Updates only the targeted existing project's document-reference fields, if there is an eligible change. Inspect the report and backup information afterwards.

### Case 7 — Apply all matching Local JSON projects

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','local','--apply','--confirm','APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Resolves IDs from Local JSON and applies metadata changes only to matching existing MongoDB projects. **This is not an importer**.

### Case 8 — Apply all existing MongoDB projects

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','mongo','--all','--apply','--confirm','APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Explicitly opts in to a full-database metadata refresh and write. Run only after validating smaller batches and confirming the intended scope.

## C. Smaller batches and request delay

The implementation processes projects sequentially with a default **750 ms delay between projects**. The supported `--delay-ms` range is **0–5000 ms**. A delay reduces request pressure but **does not guarantee protection from Cloudflare/rate limiting**; each project can require multiple e-GP requests.

Example: dry-run 5 existing MongoDB projects with a 2-second inter-project delay:

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','mongo','--limit','5','--delay-ms','2000']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Example: apply those 5 projects only after inspecting the matching dry-run:

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/enrichGovProjectDocuments.js'),'--source','mongo','--limit','5','--delay-ms','2000','--apply','--confirm','APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT']; require('./scripts/enrichGovProjectDocuments.js').run().catch(e=>{console.error(e.message);process.exitCode=1})"
```

Note: If the database contents or sort order change between separate executions, `--limit 5` is not necessarily an immutable set of the same five IDs. For a critical single-project update, prefer `--project-id`.

## D. Recommended testing order

| Order | Case | Goal |
| --- | --- | --- |
| 1 | Case 1 | Verify one known project in dry-run mode |
| 2 | Case 2 | Verify Local JSON source |
| 3 | Case 3 | Verify MongoDB source |
| 4 | Case 4 | Review the complete local-data dry-run |
| 5 | Case 6 | Perform and verify the first controlled write |
| 6 | Case 7 | Apply matching Local JSON projects, if intended |
| 7 | Case 5, then Case 8 | Review and optionally apply the full MongoDB scope |

For a new delivery of approximately 200 TOR projects, begin with a dry-run `--limit 5`, then a larger limited run, and use a longer delay if appropriate. Do not assume the runner imports newly supplied records: the projects must already exist in MongoDB to be updated.

## E. How this differs from downloading ZIPs

- **This runner:** discovers and persists ZIP **references/metadata** only.
- **Browser/frontend ZIP download:** call the backend's category-specific `GET /api/gov-projects/.../download` routes.
- **Future backend PDF extraction:** read saved category metadata and call `nationalEgpAdapter.downloadDocument(metadata)`; the adapter knows whether the upstream request is GET or Legacy Draft POST.
- A stored `documents.*.downloadUrl` is **not guaranteed to be a clickable URL**.

See `backend/README_DOCUMENT_DOWNLOADS.md` for download endpoint examples and the extraction integration boundary.
