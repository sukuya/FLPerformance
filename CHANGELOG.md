# Changelog

All notable changes to **FLPerformance** are documented in this file.

## [2.0.0] - 2026-03-12

### SDK v0.9.0 Complete Migration

Full migration to `foundry-local-sdk` v0.9.0 with all CLI usage removed from server code.

#### Added

- **Download progress indicators**: animated progress bars with percentage display during model downloads
- **Running status indicators**: spinners and pulsing progress bars across Dashboard, Benchmarks, and Results pages
- **Cache management via filesystem**: direct filesystem reads replace non-functional SDK `getCachedModels()`
- **Comprehensive test suite**: 129 unit and integration tests with vitest

#### Changed

- **SDK v0.9.0 API**: factory method `FoundryLocalManager.create()`, `manager.catalog.getModels()`, `model.download(callback)`, `model.load()`, `model.selectedVariant.unload()`
- **No CLI commands in server**: all `exec`/`execFile` calls removed from orchestrator and cacheManager; operations use SDK or filesystem
- **Model alias resolution**: load/unload endpoints use `model.alias` (short name) instead of full variant ID
- **Health check endpoint**: uses `/v1/models` instead of non-existent `/health` endpoint
- **OpenAI client**: uses `manager.urls[0]` (not `manager.endpoint`) and `'foundry-local'` API key

#### Fixed

- Model loading failures caused by passing full variant IDs instead of short aliases
- System health incorrectly reported as "unhealthy" due to wrong health check endpoint
- Cache management using non-functional SDK methods, now uses filesystem reads

---

## [1.0.0] - 2026-03-12

### Migration: CLI to Foundry Local JavaScript SDK

The core architecture has been migrated from spawning `foundry` CLI commands to using the official **`foundry-local-sdk`** npm package. This provides a more reliable, type-safe, and maintainable integration with Microsoft Foundry Local.

#### Added

- **SDK-based service management**: `FoundryLocalManager` from `foundry-local-sdk` now handles service lifecycle (`startService()`, `isServiceRunning()`) in `src/server/orchestrator.js`
- **SDK model catalogue**: `listCatalogModels()`, `getModelInfo()`, `downloadModel()`, `loadModel()`, `unloadModel()` SDK methods replace CLI equivalents
- **SDK-driven OpenAI client**: a single `OpenAI` client created from `manager.endpoint` and `manager.apiKey` for all model inference
- **Merged model discovery**: catalogue models from SDK are merged with cache-resident models for a unified model list
- **Non-blocking model loading**: the `/api/models/:id/start` and `/api/models/:id/load` endpoints return immediately while loading proceeds in the background; a new `/api/models/:id/status` endpoint enables progress polling
- **AGENTS.md**: Copilot coding conventions file for consistent development patterns
- **CHANGELOG.md**: this file, tracking project changes
- **Benchmark metrics**: TTFT, tokens per second, latency percentiles (p50/p95/p99), TPOT, TPS, GenTPS, and resource utilisation (CPU, RAM, GPU)
- **Hardware detection**: comprehensive system information capture via `systeminformation` for benchmark metadata
- **Results export**: JSON and CSV export from the Results page
- **Custom cache support**: Cache tab for switching model cache directories
- **Multi-model comparison**: side-by-side performance analysis with radar charts and comparison visualisations
- **Pre-test validation**: Test button to verify model inference before running full benchmarks
- **Real-time progress**: polling-based benchmark status updates every two seconds
- **Startup scripts**: `START_APP.ps1` (Windows) and `START_APP.sh` (Linux/macOS) for one-command launch

#### Changed

- **Orchestrator (`src/server/orchestrator.js`)**: replaced CLI `exec('foundry model list')`, `exec('foundry model load ...')`, and similar calls with SDK method calls through `FoundryLocalManager`
- **Model loading**: SDK `loadModel()` with automatic download fallback; CLI `execFile('foundry', ['model', 'load', ...])` retained only as a fallback for custom or non-catalogue models
- **Service health checks**: switched from `exec('foundry service status')` to `manager.isServiceRunning()`
- **Model listing**: switched from parsing CLI text output to structured SDK `listCatalogModels()` and `listLoadedModels()` responses
- **Dependency**: added `foundry-local-sdk: latest` to `package.json`; retained `openai` for OpenAI-compatible inference calls

#### Remaining CLI Usage

The following operations still use the `foundry` CLI as the SDK does not yet provide equivalent methods:

| Component | CLI Command | Reason |
|-----------|-------------|--------|
| `src/server/cacheManager.js` | `foundry cache location` | Get current cache directory |
| `src/server/cacheManager.js` | `foundry cache cd <path>` | Switch cache directory |
| `src/server/cacheManager.js` | `foundry cache ls` | List cached models |
| `src/server/orchestrator.js` | `foundry model load <alias>` | Fallback for custom/non-catalog models |
| `scripts/check-foundry.js` | `foundry --version` | Installation diagnostic check |
| `scripts/setup.js` | `foundry --version` | Setup wizard validation |

#### Security

- **Path validation** in `cacheManager.js`: directory traversal prevention, null byte checks, symlink resolution, and blocked sensitive directories
- **Alias validation** in `orchestrator.js`: prevents command injection via model alias sanitisation
- **`execFile` over `exec`**: argument array prevented shell injection (no shell interpolation; removed in v2.0.0)

### Architecture

```
Client (React/Vite :3000)
  └─► Express API Server (:3001)
        ├─► orchestrator.js ── FoundryLocalManager SDK ── Foundry Local Service
        ├─► benchmark.js ── OpenAI client (streaming) ── Foundry Local Service
        ├─► cacheManager.js ── foundry CLI (cache ops)
        └─► storage.js ── JSON / SQLite
```

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `foundry-local-sdk` | latest | Foundry Local service & model management |
| `openai` | ^4.24.1 | OpenAI-compatible inference client |
| `express` | ^4.18.2 | REST API server |
| `cors` | ^2.8.5 | Cross-origin resource sharing |
| `systeminformation` | ^5.21.20 | Hardware metrics collection |
| `winston` | ^3.11.0 | Structured logging |
| `uuid` | ^9.0.1 | Benchmark run ID generation |
| `better-sqlite3` | ^9.2.2 | Optional persistent storage |
| `concurrently` | ^8.2.2 | Dev: parallel server + client |

---

## [0.1.0] - Initial Release

### Added

- Initial CLI-based integration with Foundry Local
- Express REST API server with model management endpoints
- React/Vite client with Dashboard, Models, Benchmarks, Results, Cache, and Settings pages
- Benchmark engine with streaming token measurement
- JSON-based results storage
- Basic benchmark suites (`benchmarks/suites/default.json`)
