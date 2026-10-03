# National e-GP document downloads

This document explains how persisted National e-GP document metadata should be
used to download ZIP archives and feed later extraction stages.

## The important distinction: metadata is not the ZIP

MongoDB stores a reference that tells the application how to obtain a ZIP. It
does not store the ZIP itself. Depending on the e-GP document generation, that
reference may be one file ID, a project-and-filename pair, or a group of Legacy
Draft fields that must be submitted together.

The `documents.*.downloadUrl` value is **upstream metadata**. It is not a
guaranteed clickable link. Always use either:

- this application's backend download API; or
- `nationalEgpAdapter.downloadDocument(metadata)` inside trusted backend code.

## Invitation ZIP category verification

A successful response from `infoProcureDocAnnounZip`, a `zipId`, a `.zip` filename, HTTP 200, or a valid ZIP signature proves neither that the archive belongs to the Invitation category nor that a public Invitation package exists. In some projects the apparent Invitation reference is exactly the initial Draft Temp reference. The corrected discovery compares `zipId`, `buildName1`, and `buildName2` against initial Draft Temp and verifies the category using the public e-GP related-document list:

```text
GET /egp-oann10-service/pb/a-egp-allt-project/announcement/greenBook
mode=LINK or LINK_SECTION
methodId=<project method>
tempProjectId=<project ID>
pageAnnounceType=<current announcement type>
```

The returned `data.greenBookAnnouncementTypeLinkDto` list has machine category code `D0` for Invitation/ประกาศเชิญชวน, and `B0`/`B3` for Draft e-Bidding. The public frontend also routes `T0`/`T3` through draft/tender handling. A shared locator is a warning of category conflict, **not**, by itself, proof of absence; different locators alone are not proof of availability either. Only a successful, complete category list after valid token and project-detail lookup can establish confirmed Invitation absence.

| Invitation discovery status | Meaning | Selection when Draft is `available` |
| --- | --- | --- |
| `available` | Public category evidence confirms an Invitation and its reference is consistent. | `invitation` |
| `not_found` | Complete authoritative list confirms no `D0` Invitation entry. | `draftEbidding` |
| `error` | Evidence is incomplete, unavailable, malformed, or contradictory (including temporary correlation failure). | `null`; do not treat as absence. |

This correction changes **new discovery results**; it does not automatically repair previous false-positive Invitation metadata stored in MongoDB. The metadata runner's conservative merge preserves a usable stored `available` reference when a refresh yields `not_found` or `error` and reports the discrepancy for review. Review stored references before using an Invitation download route for affected historical records. No MongoDB migration or cleanup was part of this fix.

In the reported live metadata-only regression, six affected projects (`69059292256`, `69109005145`, `69099683466`, `68109235287`, `68049412254`, `67119566073`) changed to Invitation `not_found` with Draft selected. Positive control `68059426756` retained verified Invitation `available`. The reported complete backend test suite passed 134/134 tests. These checks did not download ZIPs or write to MongoDB.

## The three download methods

| `downloadMethod` | What it means | Can the stored URL work directly? |
| --- | --- | --- |
| `file_id` | e-GP accepts a GET request containing the file ID. | It may work directly, but use our backend API or adapter. |
| `legacy_filename` | e-GP accepts a GET request containing the project ID and ZIP filename. | It may work directly, but use our backend API or adapter. |
| `legacy_draft_transfer` | e-GP requires a POST request containing the complete Legacy Draft locator. | No. Opening the stored URL directly will not download the ZIP. |

A Legacy Draft record such as:

```json
{
  "downloadMethod": "legacy_draft_transfer",
  "fileName": "64117010720_25641104130520_2.zip",
  "downloadUrl": "https://file.gprocurement.go.th/EGPTransService/control.download",
  "legacyItemNo": 0,
  "legacyTypeId": "03",
  "legacyDocType": "temp",
  "legacyMethodId": "16"
}
```

cannot be downloaded by opening `downloadUrl`. The endpoint also needs an HTTP
POST body containing the filename and all Legacy locator fields. The e-GP
adapter constructs that POST body internally.

Treat `downloadUrl` as upstream metadata or a diagnostic endpoint. Do not use
it as an application-facing link. The name is retained for schema
compatibility; for a Legacy Draft, `upstreamEndpoint` would be more precise.

## Browser and frontend downloads

Browsers should always download through this application's backend. The
backend reads the stored metadata, chooses the correct e-GP protocol, downloads
the ZIP into memory, and streams it back with a safe filename.

These are **our backend routes**, served by this project. They are not external
e-GP URLs:

| Category | Backend route |
| --- | --- |
| Price Estimate | `GET /api/gov-projects/:projectId/document/download` |
| Invitation | `GET /api/gov-projects/:projectId/documents/invitation/download` |
| Draft e-Bidding | `GET /api/gov-projects/:projectId/documents/draft-ebidding/download` |

The backend must be running, and the project must already exist in MongoDB.

### PowerShell: Price Estimate

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:5000/api/gov-projects/64117010720/document/download" `
  -OutFile "64117010720-price-estimate.zip"
```

### PowerShell: Invitation

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:5000/api/gov-projects/68059426756/documents/invitation/download" `
  -OutFile "68059426756-invitation.zip"
```

### PowerShell: Draft e-Bidding

Project `64117010720` uses a Legacy Draft locator. Call our backend route:

```text
http://localhost:5000/api/gov-projects/64117010720/documents/draft-ebidding/download
```

```powershell
Invoke-WebRequest `
  -Uri "http://localhost:5000/api/gov-projects/64117010720/documents/draft-ebidding/download" `
  -OutFile "64117010720-draft-ebidding.zip"
```

The browser sends a normal GET request to our backend. The backend then uses
the stored metadata to make the correct external e-GP request. For a Legacy
Draft, that external request is a POST containing the full locator.

The frontend already provides category URL helpers in `frontend/lib/torApi.ts`:

```ts
import {
  getGovProjectDocumentDownloadUrl,
  getGovProjectInvitationDownloadUrl,
  getGovProjectDraftEbiddingDownloadUrl,
} from "@/lib/torApi";

const priceUrl = getGovProjectDocumentDownloadUrl(projectId);
const invitationUrl = getGovProjectInvitationDownloadUrl(projectId);
const draftUrl = getGovProjectDraftEbiddingDownloadUrl(projectId);

window.location.assign(draftUrl);
```

The current market and saved-project download buttons still call the Price
Estimate helper. Selecting Invitation or Draft based on persisted document
metadata requires those API responses and UI components to expose and consume
`documents.selectedProcurementDocument`. That UI wiring is separate from the
metadata runner.

## One-command Document Enrichment Runner

Run these commands from the `backend` directory.

The Runner discovers and stores ZIP **metadata only**. It does not store ZIP
files, download ZIP binaries, extract PDF text, run OCR, or call an AI model.

Normal commands:

```bash
npm run enrich:documents -- --project-id 68059426756
npm run enrich:documents -- --source local --limit 1
npm run enrich:documents -- --source mongo --limit 1
npm run enrich:documents -- --source local
npm run enrich:documents -- --source mongo --all
```

All commands above default to **dry-run**. A dry-run reads existing MongoDB
metadata and performs e-GP metadata discovery, but it does not modify MongoDB.
The output shows what would change.

Apply one approved project with:

```bash
npm run enrich:documents -- --project-id 68059426756 --apply --confirm APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT
```

Warning: `--apply` writes document metadata into the existing MongoDB project.
It does not create a missing project, and it does not write ZIP or extracted
PDF content. Apply mode also creates a backup before its first database write.

## Windows `querySrv ECONNREFUSED` DNS workaround

On some Windows setups, Node.js may fail to resolve a `mongodb+srv` hostname
with:

```text
querySrv ECONNREFUSED
```

The tested workaround is to configure DNS only inside the temporary Node.js
Runner process:

```js
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
```

The Runner script exports `run(argv)`. The PowerShell helper below sets the
Node-process DNS servers before importing the actual CLI entry point, then
passes the same CLI argument array into `run()`.

Run this from the `backend` directory:

```powershell
function Invoke-EgpDocumentRunnerWithDns {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$RunnerArgs
  )

  $previousArgs = $env:EGP_DOCUMENT_RUNNER_ARGS

  try {
    $env:EGP_DOCUMENT_RUNNER_ARGS = ConvertTo-Json `
      -InputObject @($RunnerArgs) `
      -Compress

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

Dry-run one project with temporary DNS:

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @(
  "--project-id",
  "68059426756"
)
```

Dry-run one local project:

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @(
  "--source",
  "local",
  "--limit",
  "1"
)
```

Apply one approved project with temporary DNS:

```powershell
Invoke-EgpDocumentRunnerWithDns -RunnerArgs @(
  "--project-id",
  "68059426756",
  "--apply",
  "--confirm",
  "APPLY_GOV_PROJECT_DOCUMENT_ENRICHMENT"
)
```

This helper does not modify Windows DNS settings. It does not disable or
change TLS certificate verification. The DNS override exists only for that
Node.js process.

## Downloading inside backend code

Backend workers do not need to call their own HTTP routes. They can pass a
persisted document reference directly to the National e-GP adapter.

This is the preferred boundary for a future extraction worker because it keeps
discovery and extraction independently executable.

### Download one stored reference into memory

```js
const GovProject = require("./src/models/GovProject");
const {
  nationalEgpAdapter,
} = require("./src/services/egp/egpClient");

async function downloadStoredCategory(projectId, category) {
  const project = await GovProject.findOne(
    { project_id: projectId },
    { [`documents.${category}`]: 1 }
  ).lean();

  if (!project) throw new Error("Project not found");

  const stored = project.documents?.[category];
  if (stored?.status !== "available") {
    throw new Error(`${category} is not available`);
  }

  // projectId is stored at project level, so add it to the adapter input.
  const metadata = { projectId, ...stored };
  const zipBuffer = await nationalEgpAdapter.downloadDocument(metadata);

  // zipBuffer is a Buffer. Nothing has been written to disk.
  return { metadata, zipBuffer };
}
```

Examples:

```js
const price = await downloadStoredCategory(projectId, "priceEstimate");
const invitation = await downloadStoredCategory(projectId, "invitation");
const draft = await downloadStoredCategory(projectId, "draftEbidding");
```

Only call the categories required by the extraction policy. Do not use
`selectedProcurementDocument` as proof that other categories are unavailable.
It represents procurement-document priority:

1. Invitation is first priority when available.
2. Draft is the fallback when Invitation is confirmed absent.
3. Price Estimate remains an independently available category.

## Passing the ZIP to the current text extractor

The existing `extractPdfTextFromZip()` utility accepts an in-memory ZIP buffer:

```js
const {
  extractPdfTextFromZip,
} = require("./src/services/egp/egpDocumentService");

const { metadata, zipBuffer } = await downloadStoredCategory(
  "64117010720",
  "draftEbidding"
);

const extraction = await extractPdfTextFromZip(zipBuffer);

console.log({
  category: "draftEbidding",
  zipFileName: metadata.fileName,
  pdfFileNames: extraction.pdfFileNames,
  textLength: extraction.textLength,
});
```

The current utility:

- checks archive paths for traversal;
- limits the number and total size of PDFs;
- checks each PDF signature;
- extracts text with `pdf-parse`;
- returns one combined text result.

It does not yet provide independent per-PDF results, OCR, or AI processing.
Those belong to the future extraction phase.

## Future extraction workflow

The metadata runner performs only discovery and safe metadata persistence. It
does not download ZIPs.

A future extraction worker should:

1. Read the ZIP reference and locator metadata from MongoDB.
2. Choose a category according to the processing policy.
3. Download that ZIP through `nationalEgpAdapter.downloadDocument(metadata)`.
4. Inspect the PDF filenames and apply the filename-based extraction priority.
5. Extract text only from the relevant PDFs.
6. Use OCR when ordinary PDF text extraction is insufficient.
7. Record results against the category and canonical locator identity.

For procurement documents, Invitation remains first priority. Draft is the
fallback when Invitation is confirmed absent. Price Estimate remains an
independent category. Availability does not mean that every ZIP or every PDF
must automatically be processed.

If a stored locator is stale, the future worker should report
`metadata_refresh_required`. It should not silently update MongoDB or invoke
metadata discovery.

The existing higher-level functions (`getPriceEstimateArchive()`,
`getInvitationArchive()`, and `getDraftEbiddingArchive()`) can rediscover stale
references. They are appropriate for the current interactive download routes,
but a strict future extraction worker should call the adapter directly when it
must not mutate or refresh metadata implicitly.

## Important cautions

- Never construct the Legacy Draft POST form in frontend code.
- Never expose credentials or e-GP API keys to the browser.
- Never assume `downloadUrl` is directly clickable.
- Never download every category or every PDF merely because it is available.
- Never create a missing project while processing document metadata.
- Keep ZIPs in memory unless a separately approved workflow requires storage.
