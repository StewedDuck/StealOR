# e-GP RSS ingestion guide

**Teammate Guide | Run from `StealOR/backend`**

RSS discovers project IDs and titles from e-GP announcements. This repository has two scripts: a historical Bangkok importer and an automatic IT-project poller. They have different settings and behavior; choose the one you need.

## 1. Before you start

From the repository root:

```powershell
cd backend
npm install
```

If `.env` does not exist, copy `.env.example` to `.env` and fill in `MONGODB_URI`. Keep an existing `.env`.

For the automatic poller, also complete the [Vertex AI setup](./README_VERTEX_AI_SETUP.md). Its IT filter and subsequent document processing make billable AI requests.

Both RSS scripts **write to MongoDB immediately**. Neither has a dry-run mode or an `--apply` flag. The backend HTTP server and frontend do not need to be running.

## 2. Historical import: Bangkok projects

Script: `scripts/fetchAndSyncRssProjects.js`

### What it does

1. Scans RSS announcements backward one day at a time.
2. Requests draft and invitation announcements using `Bo` and `Do`.
3. Looks up project details through the GovSpending service.
4. Selects Bangkok projects using province, department name, or announcement title.
5. Imports the collected projects into MongoDB through `enrichAndSaveProjects`.

The import service also attempts price-estimate PDF text extraction and stores its result in `documentExtraction`. A failed document extraction is recorded, and the project can still be saved. This does not replace the separate Phase A/B document workflow.

### Check the current settings first

These values are inside the script, not command-line flags:

| Setting | Current value |
| --- | --- |
| `TARGET_COUNT` | 100 Bangkok projects |
| `currentDate` | October 4, 2026 (`2026-10-04T00:00:00`) |
| Cutoff | Four years before the date you run the script |
| Department filter | None in the RSS request |

Change `currentDate` if you want to start from a different day. The existing comment above it mentions June, but the executable value is October 4, 2026.

### Run

```powershell
node scripts/fetchAndSyncRssProjects.js
```

The script exits after reaching the target count or cutoff and saving the collected projects. It retries HTTP 429 responses with a 30-second wait, up to three attempts per lookup. Other RSS failures are logged and treated as empty results.

Project IDs are deduplicated within the run. Database imports use upserts, so rerunning can update existing project fields and repeat document extraction; it does not simply skip existing projects.

### Next step

Continue with [Phase A: document metadata enrichment](./README_DOCUMENT_RUNNER_COMMANDS.md), then [Phase B: ZIP-to-PDF extraction](./README_DOCUMENT_EXTRACTION_COMMANDS.md).

## 3. Automatic poller: IT projects

Script: `scripts/autoSyncRssPipeline.js`

### What it does

1. Fetches draft and invitation RSS announcements for the configured department.
2. Asks Gemini whether each announcement title describes an IT project.
3. Creates a placeholder MongoDB project if an accepted project does not exist.
4. Calls `runSafePipeline.js` for each accepted project, including existing ones.
5. Remains running for scheduled polls.

The wrapper runs:

```text
Metadata enrichment
  → ZIP/PDF extraction
  → AI classification and text extraction
  → Procurement analysis
  → Analysis import into MongoDB
```

### Check the current settings first

| Setting | Current behavior |
| --- | --- |
| Department | `deptId: "0706"` in both RSS requests |
| Announcement types | `B0` and `D0` (digit zero) |
| Announcement date | Not supplied; results are not restricted to today's date |
| First run | Immediately when the script starts |
| Later runs | 08:00 and 20:00 in the process's local timezone |
| Model | `VERTEX_AI_MODEL`, defaulting to `gemini-2.5-flash` |

Department and schedule values are hardcoded in this script. The cron call does not explicitly set `Asia/Bangkok`; configure the process timezone if you need those times to mean Bangkok time.

The historical importer uses `Bo`/`Do` (letter o), while this poller uses `B0`/`D0` (digit zero). The RSS service passes these values through unchanged. These are the current code settings, not a guarantee that upstream returns announcements for either spelling.

### Run

```powershell
node scripts/autoSyncRssPipeline.js
```

Keep the terminal/process running for scheduled polls. Use **Ctrl+C** to stop it. `npm run dev` does not start this RSS poller automatically.

### Important current behavior

- The Gemini IT filter runs before checking whether a project already exists. Repeated polls can make AI requests and invoke the pipeline again for existing projects.
- `classifyPdfs.js` scans **all local project folders**, even when `runSafePipeline.js` passes one project ID. Its classification step can process pending files from other projects.
- AI filter errors return `false`, so an AI error can produce an `AI REJECT` message rather than a successful non-IT decision.
- Check individual step logs and the saved analysis. The wrapper catches errors, so its process exit status alone does not prove every step succeeded.

For manual classification, analysis, and import commands, see [the document pipeline guide](./README_DOCUMENT_DOWNLOADS.md#10-after-phase-b-classify-analyze-and-import).

## 4. Checking results and troubleshooting

- **MongoDB:** look for the announcement's `project_id` in `govprojects`. Historical imports also write `documentExtraction`; the automatic pipeline imports completed structured results into `procurementAnalysis`.
- **Local output:** the automatic pipeline writes PDFs/TXT under `temp/pdfs/` and analysis under `temp/procurement-analysis/{projectId}/`.
- **No announcements:** inspect the RSS debug URL, response preview, and parsed item count. Check the department, date, and announcement-type settings above before assuming there are no projects.
- **MongoDB connection failure:** check `MONGODB_URI` and Atlas network access. The historical importer sets custom DNS resolvers; the automatic poller does not.
- **AI errors:** check the project, credentials, model, and location. The poller's IT filter uses `@google-cloud/vertexai`, while the smoke test and downstream AI services use `@google/genai`; a successful smoke test does not verify the poller's separate client.

Optional: `EGP_RSS_BASE_URL` overrides the feed URL used by `src/services/egp/egpRssService.js`. Leave it unset to use the existing e-GP RSS endpoint.
