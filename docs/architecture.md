# FLPerformance Architecture

## Overview

FLPerformance is a full-stack application designed to benchmark multiple Large Language Models (LLMs) running via Microsoft Foundry Local. The application follows a clean separation of concerns with distinct layers for UI, API, orchestration, benchmarking, and storage.

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Frontend (React)                      │
│  - Dashboard                                                  │
│  - Models Management                                          │
│  - Benchmarks Configuration                                   │
│  - Results Visualization                                      │
│  - Settings                                                   │
└──────────────────┬───────────────────────────────────────────┘
                   │ HTTP/REST API
┌──────────────────▼───────────────────────────────────────────┐
│                    Backend API (Express.js)                   │
│  - RESTful endpoints for models, benchmarks, results         │
│  - Request validation and error handling                     │
│  - Static file serving (production)                          │
└──────┬────────────────────────┬──────────────────────────────┘
       │                        │
┌──────▼────────────┐    ┌─────▼──────────────┐
│  Foundry Local    │    │  Benchmark Engine  │
│   Orchestrator    │    │                    │
│                   │    │  - Run scenarios   │
│  - Start/stop     │    │  - Collect metrics │
│    services       │    │  - Calculate stats │
│  - Load models    │    │  - Resource mon.   │
│  - Health checks  │    └─────┬──────────────┘
│  - OpenAI client  │          │
└──────┬────────────┘          │
       │                        │
       │    ┌───────────────────▼─────────┐
       │    │   Storage Layer             │
       │    │   - SQLite database         │
       └────►   - JSON file exports       │
            │   - Structured logging      │
            └─────────────────────────────┘
                     │
       ┌─────────────▼────────────────┐
       │   Foundry Local Services     │
       │   (One per model)            │
       │   - Model inference          │
       │   - OpenAI-compatible API    │
       └──────────────────────────────┘
```

## Component Details

### 1. Frontend (React + Vite)

**Location:** `/src/client`

**Responsibilities:**
- User interface for all application features
- Real-time status updates
- Interactive charts and data visualization
- Form handling and validation

**Key Pages:**
- **Dashboard:** Overview statistics and quick actions
- **Models:** Add/remove models, start/stop services, view logs
- **Benchmarks:** Configure and run benchmark suites
- **Results:** View, filter, compare, and export benchmark results
- **Settings:** Application configuration and information

**Technology Stack:**
- React 18 for UI components
- React Router for navigation
- Recharts for data visualization
- Axios for API communication
- Vite for development and build tooling

### 2. Backend API (Express.js)

**Location:** `/src/server/index.js`

**Responsibilities:**
- Expose RESTful API endpoints
- Route requests to appropriate services
- Handle errors and return consistent responses
- Serve static frontend in production

**API Endpoints:**

**Models:**
- `GET /api/models/available` - List available models from Foundry Local
- `GET /api/models` - List configured models
- `POST /api/models` - Add new model
- `DELETE /api/models/:id` - Remove model
- `POST /api/models/:id/start` - Start service
- `POST /api/models/:id/stop` - Stop service
- `POST /api/models/:id/load` - Load model
- `GET /api/models/:id/health` - Health check
- `GET /api/models/:id/logs` - Get service logs

**Benchmarks:**
- `GET /api/benchmarks/suites` - List benchmark suites
- `POST /api/benchmarks/run` - Run benchmark
- `GET /api/benchmarks/runs` - List all runs
- `GET /api/benchmarks/runs/:id` - Get run details
- `GET /api/benchmarks/results` - Get results (with filters)
- `GET /api/benchmarks/runs/:id/export/json` - Export as JSON
- `GET /api/benchmarks/runs/:id/export/csv` - Export as CSV
- `GET /api/benchmarks/runs/:id/logs` - Get run logs

**System:**
- `GET /api/system/health` - System health check
- `GET /api/system/stats` - Dashboard statistics

### 3. Foundry Local Orchestrator

**Location:** `/src/server/orchestrator.js`

**Responsibilities:**
- Interface with Foundry Local CLI and services
- Manage lifecycle of model services (start, stop, load)
- Maintain OpenAI-compatible clients for each service
- Perform health checks and service discovery
- Handle dynamic port assignment

**Key Operations:**
- `checkFoundryLocal()` - Verify Foundry Local installation
- `listAvailableModels()` - Query available models
- `startService(modelId, alias)` - Start service on dynamic port
- `stopService(modelId)` - Stop service and cleanup
- `loadModel(modelId)` - Trigger model download/load
- `checkServiceHealth(modelId)` - Health check
- `waitForService(endpoint, timeout)` - Wait for service readiness

**Service Architecture:**
- Each model gets its own service instance
- Dynamic port assignment (base port 5000+)
- OpenAI-compatible API clients
- Process management with stdout/stderr capture
- Graceful shutdown handling

### 4. Benchmark Engine

**Location:** `/src/server/benchmark.js`

**Responsibilities:**
- Execute benchmark scenarios
- Measure performance metrics
- Collect system resource data
- Calculate aggregate statistics
- Persist results to storage

**Key Metrics:**
- **Throughput (TPS):** Tokens per second
- **Latency:** TTFT (streaming), P50/P95/P99 end-to-end
- **Stability:** Error rate, timeout rate
- **Resources:** CPU, RAM, GPU utilization (best-effort)

**Benchmark Flow:**
1. Load benchmark suite definition
2. For each model:
   - Check service health
   - For each scenario:
     - Run N iterations
     - Collect resource metrics before/after
     - Measure latency and token output
     - Record errors and timeouts
   - Calculate aggregate statistics
   - Persist results
3. Mark run as completed

**Resource Monitoring:**
- Uses `systeminformation` library
- Captures CPU load percentage
- Captures RAM usage percentage
- Captures GPU utilization (if available)
- Cross-platform support with graceful degradation

### 5. Storage Layer

**Location:** `/src/server/storage.js`

**Responsibilities:**
- Persist application data
- Provide query interface
- Export results in multiple formats
- Maintain audit logs

**Database Schema (SQLite):**

**models**
- id, alias, model_id, endpoint, status, last_error, last_heartbeat, created_at, updated_at

**benchmark_runs**
- id, suite_name, model_ids (JSON), config (JSON), hardware_info (JSON), status, started_at, completed_at

**benchmark_results**
- id, run_id, model_id, scenario, tps, ttft, latency_p50, latency_p95, latency_p99, error_rate, timeout_rate, cpu_avg, ram_avg, gpu_avg, raw_data (JSON)

**logs**
- id, entity_type, entity_id, level, message, metadata (JSON), created_at

**Export Formats:**
- JSON: Full run + results with metadata
- CSV: Flattened results table

### 6. Logging System

**Location:** `/src/server/logger.js`

**Responsibilities:**
- Structured logging with Winston
- Service-specific and benchmark-specific loggers
- Console output with formatting
- Log level management

**Log Levels:**
- error: Critical failures
- warn: Recoverable issues
- info: General information
- debug: Detailed diagnostics

## Data Flow

### Starting a Model Service

```
User → Frontend → POST /api/models/:id/start
  → Orchestrator.startService()
    → Spawn Foundry Local process with dynamic port
    → Wait for service readiness
    → Create OpenAI client
    → Update database status
  → Return endpoint to frontend
```

### Running a Benchmark

```
User → Frontend → POST /api/benchmarks/run
  → Backend validates request
  → Benchmark Engine starts async execution
    → Collect hardware info
    → For each model:
      → Check health
      → For each scenario:
        → Run iterations
        → Measure metrics
        → Collect resources
        → Save results
    → Mark run complete
  → Frontend polls for results via GET /api/benchmarks/runs/:id
```

### Viewing Results

```
User → Frontend → GET /api/benchmarks/runs/:id
  → Storage retrieves run + results
  → Frontend renders:
    - Comparison table
    - TPS chart
    - Latency chart
    - Best model cards
```

## Scalability Considerations

### Current Limitations

1. **Sequential Benchmarking:** Models are benchmarked one at a time to avoid resource contention
2. **Single Machine:** All services run on the same machine
3. **Memory Constraints:** Limited by available RAM for model loading
4. **Port Availability:** Limited by available local ports (base 5000+)

### Future Enhancements

1. **Parallel Benchmarking:** Run benchmarks on multiple models simultaneously (if resources allow)
2. **Distributed Services:** Support remote Foundry Local services
3. **Result Aggregation:** Combine results from multiple benchmark runs
4. **Real-time Updates:** WebSocket integration for live progress
5. **Advanced Metrics:** Memory profiling, network I/O, disk usage

## Security Considerations

1. **Local-Only:** Designed for local development/testing
2. **No Authentication:** Assumes trusted local environment
3. **API Keys:** Placeholder keys for Foundry Local (adjust as needed)
4. **Process Isolation:** Each model service runs in separate process
5. **Resource Limits:** No enforced limits (rely on OS/hardware)

## Error Handling

**Frontend:**
- Try-catch on all API calls
- User-friendly error messages
- Success notifications

**Backend:**
- Global error handler middleware
- Structured error responses
- Error logging with context

**Orchestrator:**
- Process error event handlers
- Timeout handling
- Service restart capability (future)

**Benchmark Engine:**
- Per-scenario error isolation
- Timeout detection
- Graceful degradation

## Configuration

**Environment Variables:**
- `PORT` - API server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging level (default: info)

**Runtime Configuration:**
- Benchmark iterations
- Timeout values
- Temperature
- Streaming mode

## Deployment

**Development:**
```bash
npm run dev  # Start both frontend and backend
```

**Production:**
```bash
npm run build  # Build frontend
npm start      # Start production server
```

**Prerequisites:**
- Node.js 18+
- Foundry Local installed and in PATH
- Adequate system resources for models

## Monitoring & Debugging

**Health Checks:**
- `/api/system/health` - Overall system status
- `/api/models/:id/health` - Per-model service health

**Logs:**
- Service logs: `/api/models/:id/logs`
- Benchmark logs: `/api/benchmarks/runs/:id/logs`
- Console output: Winston formatted logs

**Database:**
- SQLite at `/results/benchmarks.db`
- Query directly for troubleshooting

## Technology Stack Summary

**Frontend:**
- React 18.2
- React Router 6.20
- Recharts 2.10
- Axios 1.6
- Vite 5.0

**Backend:**
- Node.js (ES modules)
- Express 4.18
- Better-SQLite3 9.2
- Winston 3.11
- OpenAI SDK 4.24
- Systeminformation 5.21

**Development:**
- Concurrently for parallel processes
- Vite dev server with HMR
- Express middleware for CORS
