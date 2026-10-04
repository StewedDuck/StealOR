# StealOR — Phase B: National e-GP ZIP-to-PDF Extraction

**Teammate guide | Run from `StealOR/backend` | PowerShell (Windows)**

## 1. What this phase does

Phase A (`enrichGovProjectDocuments.js`) takes existing project IDs, discovers National e-GP references for `priceEstimate`, `invitation`, and `draftEbidding`, and saves normalized document metadata in existing MongoDB `GovProject` records. Phase B (`extractGovProjectDocuments.js`) **reads those stored references only**. For each independently usable category, it calls the existing National e-GP adapter, temporarily downloads a real ZIP, safely extracts every PDF, verifies and retains the PDFs and a manifest, then deletes a successfully processed ZIP. It moves sequentially to the next category and project; failures are reported per category.

Phase B **does not** insert missing projects, refresh stale metadata automatically, write to MongoDB, parse PDF text, perform OCR, call Vertex AI, or run on a schedule. `selectedProcurementDocument` indicates the preferred main procurement document for later stages; it **does not filter** which usable categories Phase B extracts. A stored `downloadUrl` is not guaranteed to be a universally reusable direct link: the existing adapter understands modern File-ID GET, Legacy Price Estimate GET, and Legacy Draft form POST downloads.

```text
Existing project in MongoDB
  → saved documents.priceEstimate / invitation / draftEbidding
  → eligibility and saved-locator validation
  → existing e-GP adapter downloads one archive
  → temp/zips/{projectId}/{category}.zip (.part first)
  → inspect ZIP and safely stage individual PDFs
  → verify hashes, publish files + manifest
  → re-verify published artifacts
  → delete successful ZIP and empty ZIP project folder
  → next category, then next project
```

## 2. Before running anything

1. Open PowerShell in `C:\Users\USER\Downloads\software_collab\StealOR\backend` (adjust if cloned elsewhere), and ensure dependencies are installed (`npm install` if necessary).
2. Configure `backend/.env` with the correct `MONGODB_URI` and any existing e-GP configuration. **Never paste or commit `.env`, keys, or credentials.** Check that you are connecting to the intended database and collection.
3. MongoDB must already contain the project records and their Phase A `documents` metadata. Placeholder IDs alone are not sufficient. Phase B is MongoDB read-only. A project missing from the connected collection produces `outcome: missing`.
4. This machine previously had a Node MongoDB Atlas DNS SRV-resolution issue. The PowerShell commands below use `dns.setServers(['1.1.1.1','8.8.8.8'])` **within the command's Node process only**. They do not change Windows DNS. Use network-approved DNS resolvers where applicable.
5. Always inspect the dry-run, especially before `--source mongo --all`. Actual apply performs network transfers and writes **local** artifacts, even though MongoDB remains read-only.

### Standard npm syntax (when Node DNS works normally)

```powershell
npm run extract:documents -- --project-id 68109235287
npm run extract:documents -- --project-id 68109235287 --apply --confirm EXTRACT_GOV_PROJECT_DOCUMENTS
npm run extract:documents -- --source mongo --limit 5
npm run extract:documents -- --source mongo --all
```

The following longer commands are the **tested process-local DNS workaround style**. All commands should be copied as one PowerShell line from the backend directory. They call the existing exported `run()` function rather than adding any new project script.

## 3. Step 6 — Automated checks

```powershell
npm test
git diff --check
git status --short
git check-ignore temp/pdfs/example.pdf
```

`npm test` runs backend tests; it is not the live e-GP extraction command. The latest attached Codex cleanup report states 35 focused Phase B tests and 169 complete backend tests passed; rerun tests against your current checkout before relying on this count. `temp/` should be excluded by `backend/.gitignore`.

## 4. Step 7 — One project, dry-run (read-only; NO ZIP download)

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--project-id','68109235287']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

Check `source.existing`, `missingProjectIds`, `usableCategories`, and each category's `outcome`/`reason`. `would_download` is **an eligibility plan**, not proof that no verified local PDFs exist; dry-run does not download or verify existing artifacts in the same way apply does. If `missing`, check the connected database and whether the record exists. Never proceed with an unexpected project selection.

## 5. Step 8 — One project, actual ZIP-to-PDF extraction

**Only run after reviewing the dry-run.**

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--project-id','68109235287','--apply','--confirm','EXTRACT_GOV_PROJECT_DOCUMENTS']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

One invocation processes all independently usable categories of **that one project** sequentially. It does not process all MongoDB projects or create a scheduled task. Successful categories report `extracted` (first time) or `skipped_verified` (a valid prior run); ineligible categories report `skipped`, and category failures are reported independently.

## 6. Automated batch: a limited selection of MongoDB projects

These use the same script, **not** a new loop that you must write manually. Records are selected deterministically by the CLI; `--limit 5` means the first five selected MongoDB records, **not** necessarily your earlier nine test IDs.

**Dry-run first five:**

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--source','mongo','--limit','5']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

**Actually extract first five, once:**

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--source','mongo','--limit','5','--apply','--confirm','EXTRACT_GOV_PROJECT_DOCUMENTS']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

## 7. Automated batch: ALL existing MongoDB project IDs

**This is the command you were missing.** `--all` means **every existing project in the connected MongoDB collection**, not only your previous nine test IDs. Phase B still does not discover or insert missing records. Run the dry-run, verify selection and available categories, and consider a limited actual batch before using the full actual batch.

**All projects, dry-run (no downloads/local PDF writes):**

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--source','mongo','--all']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

**All projects, ACTUAL extraction (network + local artifact writes):**

```powershell
node -e "const dns=require('node:dns'); dns.setServers(['1.1.1.1','8.8.8.8']); process.argv=[process.execPath,require('node:path').resolve('./scripts/extractGovProjectDocuments.js'),'--source','mongo','--all','--apply','--confirm','EXTRACT_GOV_PROJECT_DOCUMENTS']; require('./scripts/extractGovProjectDocuments.js').run().catch(e=>{console.error(e);process.exitCode=1})"
```

These are **one-time automatic batch runs once invoked**, not background scheduling. A failed category does not automatically stop the remaining categories/projects; check the summary and exit status. Do not invoke multiple apply batches concurrently against the same local artifact directory.

## 8. CLI options

| Flag | Meaning |
|---|---|
| `--project-id 68109235287` | Select one existing MongoDB project. |
| `--source mongo --limit 5` | Select a bounded batch of existing records. |
| `--source mongo --all` | Explicitly select all existing records. |
| no `--apply` | Dry-run planning by default; no e-GP download or PDF writes. |
| `--apply --confirm EXTRACT_GOV_PROJECT_DOCUMENTS` | Required together for real extraction. |
| `--force` | Reprocess even when matching PDF artifacts and manifest are already verified. Use only intentionally. |
| `--redownload` | Ignore an eligible retained ZIP from a failed attempt and download again; distinct from `--force`. |
| `--json` | Request machine-readable CLI output (the shown run output is already JSON-formatted). |

For the Node `-e` wrapper, place additional flags as quoted entries in `process.argv`, e.g. append `,'--force'` before the closing `]`. Do not use `--force` or `--redownload` routinely.

## 9. Files and module responsibilities

| File | Responsibility |
|---|---|
| `scripts/extractGovProjectDocuments.js` | CLI: validate args, select read-only MongoDB records, plan/apply, report results, disconnect. |
| `services/govProjectDocumentExtractionService.js` | Main orchestrator: decide category order, call adapter/staging/storage, handle errors and ZIP lifecycle. |
| `services/govProjectDocumentExtraction/archiveStaging.js` | Inspect ZIP safely, validate entries/PDF signatures and limits, stage PDFs, calculate hashes. |
| `services/govProjectDocumentExtraction/artifactStore.js` | Publish staged PDFs safely, verify saved artifacts, preserve prior successful output/rollback. |
| `services/govProjectDocumentExtraction/manifestStore.js` | Build/write/read manifests and compare locator/artifact identities. |
| `services/govProjectDocumentExtraction/temporaryZipStore.js` | `.part` writes, completed ZIP/sidecar retention and successful cleanup. |
| `services/govProjectDocumentExtraction/errors.js` | Shared classified Phase B errors. |
| `services/egp/egpClient.js` and `services/egp/client/` | Existing download adapter: knows the different modern/legacy e-GP HTTP contracts. |
| `scripts/enrichGovProjectDocuments.js` | **Phase A**, separate metadata discovery/persistence runner, not called by Phase B. |

The orchestrator is the coordinator, not a replacement for these specialized modules. Phase B reuses `nationalEgpAdapter.downloadDocument(metadata, options)` with *stored metadata*, not the older archive wrappers that can trigger rediscovery.

## 10. Local directory layout and ZIP cleanup

```text
backend/temp/
├── zips/
│   └── {projectId}/
│       ├── {category}.zip            # Exists during processing; retained temporarily on extraction failure
│       └── ...                       # Sidecar / .part while relevant
├── pdfs/
│   ├── .staging/
│   │   └── {runId}/{projectId}/{category}/   # Work area, not final output
│   └── {projectId}/
│       ├── priceEstimate/
│       │   ├── manifest.json
│       │   └── files/...
│       ├── invitation/
│       │   ├── manifest.json
│       │   └── files/...
│       └── draftEbidding/
│           ├── manifest.json
│           └── files/...
└── manifests/
    └── runs/{runId}.json             # Per-run outcome, when emitted by the implementation
```

ZIP data is first downloaded through the existing adapter into a Node.js Buffer, then saved physically as a `.part` file and published as a temporary `.zip`. The saved ZIP is opened for safe extraction. `.staging` is an isolated work area so a corrupt third PDF cannot leave half-published output. On successful verification, the complete staged category (PDFs + manifest) is published, verified again, and the ZIP/sidecar removed. On failure, an already complete ZIP may remain for troubleshooting; failed partial files and current-run staging data are cleaned safely. **Do not delete the retained PDFs or their manifest after Phase B**: Phase C needs them.

The latest cleanup patch also removes an **empty** `zips/{projectId}` parent and the **current run's** empty staging project/UUID ancestors, using non-recursive directory removal. It preserves main `zips/` and `.staging/` roots, nonempty/active directories, retained failed ZIPs, and all verified PDFs/manifests. Historical empty staging folders are **not automatically swept**. Never delete arbitrary `.staging` UUID folders while an extraction may still be active. Exclude all `backend/temp/` files from Git.

## 11. Duplicate prevention, manifests and safe reruns

Each successful category has its own `manifest.json`, recording source locator identity (`canonicalLocatorIdentity`), ZIP hash, the original ZIP-entry paths, each PDF's safe artifact path, size and SHA-256, and processing metadata. On a normal subsequent **apply** run, matching identity plus verified file existence, size and hashes yields `skipped_verified`: no second ZIP download, duplicate files, or unnecessary extraction. If a source reference changes or a PDF is missing/corrupt, a new output can be staged and published safely. If replacement fails, the prior successful category output is protected. The full category is published together; a rejected PDF cannot silently produce a partial successful category.

**Actual controlled example (`68109235287`):** first apply extracted Price Estimate (1 PDF) and Draft e-Bidding (3 PDFs), skipped Invitation (`status_not_found`), reported zero failures and `zipDeleted: true` for both successes. The second **apply** reported `skipped_verified` for Price Estimate and Draft, skipped Invitation, extracted zero new categories and ended with `exitCode: 0`. A later **dry-run** can still say `would_download`, because it plans from MongoDB references instead of promising an apply-level manifest verification.

## 12. How to inspect results in PowerShell

```powershell
# Show retained PDFs and category manifests for the verified test project
Get-ChildItem .\temp\pdfs\68109235287 -Recurse

# Show manifests with their original content
Get-ChildItem .\temp\pdfs\68109235287 -Filter manifest.json -Recurse |
  ForEach-Object { Get-Content $_.FullName -Raw }

# Show whether any project ZIP remains; empty/nonexistent after success is normal
Get-ChildItem .\temp\zips\68109235287 -Recurse -ErrorAction SilentlyContinue

# See ZIPs retained after failed attempts (inspect before removing anything)
Get-ChildItem .\temp\zips -Recurse -File -ErrorAction SilentlyContinue

# Confirm local artifacts are ignored by Git
git check-ignore temp/pdfs/68109235287/priceEstimate/manifest.json
```

Review the run's `summary`, per-category `outcome`, `zipDeleted`, `pdfCount`, `cleanupWarnings`, `failedCategories`, and `exitCode`. Do not infer success from an empty ZIP directory alone: also verify the PDFs and manifests. An exit code of 0 on a dry-run with `missingProjectIds` can still mean the chosen test project was absent.

## 13. Common outcomes and troubleshooting

| Result / issue | What it means / next action |
|---|---|
| `would_download` in dry-run | Eligible based on metadata; no actual download occurred. |
| `extracted` | Category PDF artifacts were published. Check `pdfCount`, manifest, cleanup. |
| `skipped_verified` | Matching saved identity and all retained PDF artifacts verified; no re-download needed. |
| `skipped`, `status_not_found` | Category not found; not a download failure. |
| `outcome: missing` | Project record absent from connected MongoDB; verify DB/collection/project ID. |
| No usable category | Existing project may lack usable Phase A metadata; inspect and run Phase A separately if appropriate. |
| `metadata_refresh_required` | Stored reference may be stale; handle with separate Phase A metadata refresh, not automatic Phase B rediscovery. |
| Invalid ZIP/PDF or unsafe path | Category fails safely; inspect report and any retained failed ZIP. Do not disable validation to force success. |
| Cleanup warning | PDF publication can succeed even if ZIP removal fails; inspect the leftover file and warning. |
| MongoDB `querySrv ECONNREFUSED` | Node DNS resolver issue on this machine; use the process-local DNS command above if permitted. |
| Nonzero apply exit status | Some requested work failed; inspect per-project/category details and rerun selectively. |

## 14. Boundaries and next work

Phase B has a verified controlled project run and rerun check; that is **not** a claim that every project in MongoDB has been live-extracted or that all categories are present in every project. The latest attached Codex report for the empty-directory cleanup states 35 focused Phase B tests and 169 complete backend tests passed; the five older empty UUID staging directories and two older empty ZIP project directories were intentionally not removed. Verify current checkout/test status independently.

**Phase C (future):** read retained per-PDF artifacts, extract selectable text with per-page provenance, flag scanned PDFs for OCR, and save processing results/references. **Phase D (future):** structured TOR analysis with Vertex AI or another configured model. Neither is triggered by the commands in this guide.
