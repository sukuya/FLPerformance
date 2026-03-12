# AGENTS.md: Coding Conventions for FLPerformance

This file documents project conventions for AI coding agents (GitHub Copilot, Copilot Chat, and similar tools) working in this repository.

## Project Overview

FLPerformance is a full-stack web application that benchmarks local language models via Microsoft Foundry Local. It comprises:

- **Backend**: Node.js 22+ with Express, ESM modules (`"type": "module"` in package.json)
- **Frontend**: React 18 with Vite, single-page application
- **SDK**: `foundry-local-sdk` for Foundry Local service management
- **Inference**: OpenAI-compatible client for model inference via streaming

## Language and Style

- All documentation and user-facing text must use **UK English** (for example, "visualisation" not "visualization", "colour" not "color", "utilisation" not "utilization", "analyse" not "analyze", "initialise" not "initialize").
- Do not use em dashes. Use colons, commas, or full stops instead.
- Write in full grammatical English. Avoid informal contractions in documentation (use "does not" rather than "doesn't").

## Code Conventions

### JavaScript (Backend)

- ESM imports only (`import ... from ...`). No `require()`.
- `const` by default; `let` when reassignment is needed; never `var`.
- Express route handlers use `async (req, res) => {}`.
- Error handling: try/catch in every route handler; log with `logger.error()` and return a JSON error response.
- No shell commands (`exec`, `execFile`). All Foundry Local operations go through the SDK or the filesystem.
- Validate all user-supplied input (model aliases, file paths) before use.

### JavaScript (Frontend)

- React functional components with hooks.
- State management via `useState` and `useEffect`.
- API calls via the centralised `src/client/src/utils/api.js` module (axios).
- No class components.

### File Layout

```
src/server/          # Express API server
  index.js           # HTTP endpoints
  orchestrator.js    # Foundry Local SDK integration
  benchmark.js       # Benchmark engine
  cacheManager.js    # Model cache management (filesystem-based)
  storage.js         # JSON/SQLite storage
  logger.js          # Winston logging

src/client/src/      # React SPA
  pages/             # Page components (Dashboard, Models, Benchmarks, Results, Cache, Settings)
  utils/api.js       # Axios API client
```

## API Design

- REST API on port 3001; all endpoints prefixed with `/api/`.
- Model loading is non-blocking: `/api/models/:id/load` returns immediately and triggers download (if needed) then load in the background. Poll `/api/models/:id/status` for progress, which includes `download_progress` (0 to 100) and `download_status` fields.
- Benchmark runs are also non-blocking: `/api/benchmarks/run` returns a `runId` immediately; poll `/api/benchmarks/runs/:id/status` for progress.

## SDK Usage (foundry-local-sdk v0.9.0)

The SDK v0.9.0 API differs significantly from earlier versions. Key conventions:

- **Factory method**: Use `FoundryLocalManager.create({ appName: 'FLPerformance' })` to create the manager. Do NOT call `new FoundryLocalManager()` directly: it requires a `Configuration` object that the factory builds internally.
- **A single manager instance** is shared across all operations.
- **Catalog access**: `manager.catalog.getModels()` returns all models; `manager.catalog.getModel(alias)` returns one. Do NOT call `manager.listCatalogModels()` (does not exist in v0.9.0).
- **Model metadata**: Access via `model.selectedVariant.modelInfo`. Fields include `fileSizeMb`, `runtime.deviceType`, `runtime.executionProvider`, `publisher`, `license`, `task`, `displayName`, and `version`.
- **Model status**: `model.isCached` (boolean), `model.isLoaded()` (async boolean).
- **Download**: `model.download(progressCallback)` where the callback receives a numeric percentage (0 to 100). Download progress is tracked per model in orchestrator's `_downloadProgress` Map.
- **Load/Unload**: `model.load()` to load into the web service; `model.selectedVariant.unload()` to remove.
- **Web service**: `manager.startWebService()` (not `startService()`). URLs available at `manager.urls` (array), not `manager.endpoint`.
- **OpenAI client**: Created with `baseURL: '${manager.urls[0]}/v1'` and `apiKey: 'foundry-local'`. Do NOT use `manager.apiKey` (does not exist).
- **Loaded models**: `manager._modelLoadManager.listLoaded()` returns an array of loaded model IDs. There is no `manager.listLoadedModels()`.
- **Health check**: Use an HTTP fetch to `${serviceUrl}/v1/models` to verify the SDK web service is running. The SDK web service does not expose `/health` or `/openai/status` endpoints. The system-level Foundry Local service (a separate process) uses `/openai/status`, but the orchestrator checks the SDK service.
- **Cache management**: The SDK v0.9.0 `getCachedModels()` is non-functional (returns empty). Cache operations instead read the filesystem directly: `~/.foundry/foundry.config.json` for the cache directory path, `foundry.modelinfo.json` for model metadata, and directory scanning under the cache path for installed models.

## Security

- Path validation in `cacheManager.js`: directory traversal prevention, null byte checks, symlink resolution.
- Alias validation in `orchestrator.js`: regex pattern to prevent command injection.
- No shell commands anywhere in the codebase. All external interaction is via the SDK or filesystem reads.
- No secrets or credentials in source code.

## Testing

- **Test runner**: vitest v4.0.18 with `@vitest/coverage-v8`.
- **Unit tests**: `tests/unit/` covers orchestrator, benchmark, cacheManager, and storage. Tests use a `createTestOrchestrator()` helper that injects mock dependencies matching the SDK v0.9.0 API surface.
- **Integration tests**: `tests/integration/routes.test.js` creates a minimal Express app via `createTestApp()` with mocked storage, orchestrator, benchmark, and cacheManager.
- **Running tests**: `npx vitest run` (all 129 tests). `npx vitest run --coverage` for coverage.
- Test a model with the `/api/models/:id/test` endpoint before benchmarking.
- Benchmark results are stored as JSON in the `results/` directory.
- Use `npm run dev` to start both the server and client in development mode.

## Dependencies

| Package | Purpose |
|---------|---------|
| `foundry-local-sdk` | Foundry Local service and model management |
| `openai` | OpenAI-compatible inference client |
| `express` | REST API server |
| `cors` | Cross-origin resource sharing |
| `systeminformation` | Hardware metrics |
| `winston` | Structured logging |
| `uuid` | Benchmark run ID generation |
| `better-sqlite3` | Optional persistent storage |
| `concurrently` | Parallel dev server startup |
