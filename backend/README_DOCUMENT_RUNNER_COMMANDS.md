# Document Enrichment Runner — Command Guide (PowerShell)

This guide is for running the **metadata-only** National e-GP document enrichment process. For ZIP downloads and PDF extraction, see `backend/README_DOCUMENT_DOWNLOADS.md`.

The runner discovers Price Estimate, Invitation, and Draft e-Bidding ZIP references and compares them with existing `GovProject.documents` metadata. It **does not download or store ZIPs, extract PDFs, run OCR/AI, or create missing projects**.

## Before running

Open PowerShell and switch to the repository's backend directory:

```powershell
Set-Location 'C:\Users\USER\Downloads\software_collab\StealOR\backend'
```

Make sure dependencies and the backend's MongoDB configuration are set up. These commands use the MongoDB configured by the backend; confirm it is the **intended database**, especially before any apply command. The backend HTTP server does not need to be started merely to run this CLI.

### Windows DNS workaround (if you receive `querySrv ECONNREFUSED`)

On the Windows setup used during development, the normal npm command encountered a MongoDB Atlas SRV DNS error. This helper changes DNS servers **only for the launched Node.js process**, and calls the runner's exported `run(argv)` entry point. Paste the full function **once in your current PowerShell session**:

```powershell
function Invoke-EgpDocumentRunnerWithDns {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$RunnerArgs
  )

  $previousArgs = $env:EGP_DOCUMENT_RUNNER_ARGS

  try {
    $env:EGP_DOCUMENT_RUNNER_ARGS = ConvertTo-Json -InputObject @($RunnerArgs) -Compress

    node -e 'const dns = require("node:dns"); dns.setServers(["1.1.1.1", "8.8.8.8"]); const { run } = require("./scripts/enrichGovProjectDocuments"); const args = JSON.parse(process.env.EGP_DOCUMENT_RUNNER_ARGS); run(args).catch((error) => { console.error(error.message); process.exitCode = 1; });'

    if ($LASTEXITCODE -ne 0) {
      throw "Document Runner exited with code $LASTEXITCODE"
    }
  }
  finally {
    if ($null -eq $previousArgs) {
      Remove-Item Env:\EGP_DOCUMENT_RUNNER_ARGS -ErrorAction SilentlyContinue
    }
    else {
      $env:EGP_DOCUMENT_RUNNER_ARGS = $previousArgs
    }
  }
}
```

All eight cases below use this helper, so the commands are short and consistent. After opening a **new** PowerShell session, paste the helper again. If DNS works normally on another computer, replace each helper invocation with `npm run enrich:documents --` followed by its listed arguments. Do not disable TLS verification or change Windows-wide DNS settings merely for this script.

## A. Dry-run commands — no MongoDB writes

Dry-run is the default. It **does connect to MongoDB and make live e-GP metadata requests**, but does not save document changes.

### Case 1 — Discover one known project

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @('--project-id', '68059426756')
```

Checks whether that existing MongoDB project has document references and prints the proposed metadata changes. Start here.

### Case 2 — Read one project ID from Local JSON

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @('--source', 'local', '--limit', '1')
```

Takes one project ID from the configured local provider (`software_tor_5.json` in the current setup). If it is not in MongoDB, skips it; does not import it.

### Case 3 — Read one existing project ID from MongoDB

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @('--source', 'mongo', '--limit', '1')
```

Checks the MongoDB-source workflow with a small batch.

### Case 4 — Discover all project IDs from Local JSON

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @('--source', 'local')
```

Dynamically reads the provider's actual entries. The current local file contains 27 unique project IDs, but the runner must not hard-code that count. Missing MongoDB records are skipped.

### Case 5 — Discover all existing MongoDB projects

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @('--source', 'mongo', '--all')
```

Explicitly opts in to a database-wide dry-run. This can send **multiple e-GP requests per project**. For a larger data set, consider a smaller `--limit` first and a higher delay (see below).

## B. Apply commands — these WRITE metadata to MongoDB

**Warning:** Do not run these until you have reviewed the corresponding dry-run output, checked the target database, and decided to update existing project records. Apply mode requires the exact confirmation token, makes a pre-write backup, performs narrow document-metadata updates, and verifies writes according to the runner implementation. It does **not** create missing projects.

### Case 6 — Apply one approved project (recommended first write)

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @('--project-id', '68059426756', '--apply', '--confirm', 'APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT')
```

Updates only the targeted existing project's document-reference fields, if there is an eligible change. Inspect the report and backup information afterwards.

### Case 7 — Apply all matching Local JSON projects

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @('--source', 'local', '--apply', '--confirm', 'APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT')
```

Resolves IDs from Local JSON and applies metadata changes only to matching existing MongoDB projects. **This is not an importer**.

### Case 8 — Apply all existing MongoDB projects

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @('--source', 'mongo', '--all', '--apply', '--confirm', 'APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT')
```

Explicitly opts in to a full-database metadata refresh and write. Run only after validating smaller batches and confirming the intended scope.

## C. Smaller batches and request delay

The implementation processes projects sequentially with a default **750 ms delay between projects**. The supported `--delay-ms` range is **0–5000 ms**. A delay reduces request pressure but **does not guarantee protection from Cloudflare/rate limiting**; each project can require multiple e-GP requests.

Example: dry-run 5 existing MongoDB projects with a 2-second inter-project delay:

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @('--source', 'mongo', '--limit', '5', '--delay-ms', '2000')
```

Example: apply those 5 projects only after inspecting the matching dry-run:

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @('--source', 'mongo', '--limit', '5', '--delay-ms', '2000', '--apply', '--confirm', 'APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT')
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
