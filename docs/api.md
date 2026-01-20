# API Documentation

This document describes the REST API endpoints provided by FLPerformance.

**Base URL:** `http://localhost:3001/api`

## Models API

### GET /models/available
List available models from the Foundry Local catalog.

**Response:**
```json
{
  "models": [
    {
      "id": "phi-3-mini-4k-instruct",
      "alias": "phi-3-mini",
      "description": "Phi-3 Mini 4K Instruct"
    }
  ]
}
```

### GET /models
List all configured models in the application.

**Response:**
```json
{
  "models": [
    {
      "id": "model_123",
      "alias": "phi-3-mini",
      "model_id": "phi-3-mini-4k-instruct",
      "endpoint": "http://localhost:5000",
      "status": "running",
      "last_error": null,
      "last_heartbeat": 1705680000,
      "created_at": 1705670000,
      "updated_at": 1705680000
    }
  ]
}
```

### POST /models
Add a new model configuration.

**Request Body:**
```json
{
  "alias": "phi-3-mini",
  "model_id": "phi-3-mini-4k-instruct"
}
```

**Response:**
```json
{
  "model": {
    "id": "model_123",
    "alias": "phi-3-mini",
    "model_id": "phi-3-mini-4k-instruct",
    "status": "stopped"
  }
}
```

### DELETE /models/:id
Remove a model configuration.

**Response:**
```json
{
  "success": true
}
```

### POST /models/:id/start
Start a Foundry Local service for this model.

**Response:**
```json
{
  "success": true,
  "endpoint": "http://localhost:5000",
  "port": 5000
}
```

### POST /models/:id/stop
Stop the Foundry Local service for this model.

**Response:**
```json
{
  "success": true
}
```

### POST /models/:id/load
Load the model (triggers download if needed).

**Response:**
```json
{
  "success": true
}
```

### GET /models/:id/health
Check service health.

**Response:**
```json
{
  "status": "running",
  "healthy": true,
  "endpoint": "http://localhost:5000",
  "lastCheck": 1705680000
}
```

### GET /models/:id/logs
Get service logs.

**Query Parameters:**
- `limit` (optional, default: 100): Number of log entries to return

**Response:**
```json
{
  "logs": [
    {
      "id": 1,
      "entity_type": "service",
      "entity_id": "model_123",
      "level": "info",
      "message": "Service started",
      "metadata": null,
      "created_at": 1705680000
    }
  ]
}
```

## Benchmarks API

### GET /benchmarks/suites
List available benchmark suites.

**Response:**
```json
{
  "suites": [
    {
      "name": "default",
      "description": "Default benchmark suite",
      "scenarios": [...]
    }
  ]
}
```

### POST /benchmarks/run
Start a benchmark run.

**Request Body:**
```json
{
  "modelIds": ["model_123", "model_456"],
  "suiteName": "default",
  "config": {
    "iterations": 5,
    "concurrency": 1,
    "timeout": 30000,
    "temperature": 0.7,
    "streaming": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Benchmark started"
}
```

### GET /benchmarks/runs
List all benchmark runs.

**Response:**
```json
{
  "runs": [
    {
      "id": "run_123",
      "suite_name": "default",
      "model_ids": ["model_123"],
      "config": {...},
      "hardware_info": {...},
      "status": "completed",
      "started_at": 1705680000,
      "completed_at": 1705681000
    }
  ]
}
```

### GET /benchmarks/runs/:id
Get specific benchmark run with results.

**Response:**
```json
{
  "run": {...},
  "results": [
    {
      "id": "result_123",
      "run_id": "run_123",
      "model_id": "model_123",
      "scenario": "Simple Q&A",
      "tps": 45.3,
      "ttft": 120,
      "latency_p50": 890,
      "latency_p95": 1050,
      "latency_p99": 1180,
      "error_rate": 0,
      "timeout_rate": 0,
      "cpu_avg": 35.2,
      "ram_avg": 42.1,
      "gpu_avg": 68.5
    }
  ]
}
```

### GET /benchmarks/results
Get all benchmark results with optional filters.

**Query Parameters:**
- `runId` (optional): Filter by run ID
- `modelId` (optional): Filter by model ID

**Response:**
```json
{
  "results": [...]
}
```

### GET /benchmarks/runs/:id/export/json
Export benchmark results as JSON.

**Response:** JSON file download

### GET /benchmarks/runs/:id/export/csv
Export benchmark results as CSV.

**Response:** CSV file download

### GET /benchmarks/runs/:id/logs
Get logs for a benchmark run.

**Query Parameters:**
- `limit` (optional, default: 100): Number of log entries

**Response:**
```json
{
  "logs": [...]
}
```

## System API

### GET /system/health
Overall system health check.

**Response:**
```json
{
  "status": "healthy",
  "foundryLocal": "available",
  "timestamp": 1705680000
}
```

### GET /system/stats
Get dashboard statistics.

**Response:**
```json
{
  "totalModels": 2,
  "runningServices": 1,
  "totalRuns": 5,
  "lastRun": {...},
  "bestTpsModel": {
    "modelId": "model_123",
    "tps": 62.1
  },
  "bestLatencyModel": {
    "modelId": "model_123",
    "p95": 780
  }
}
```

## Error Responses

All endpoints return errors in the following format:

**Status Code:** 4xx or 5xx

**Body:**
```json
{
  "error": "Error message description"
}
```

Common status codes:
- `400` - Bad request (invalid parameters)
- `404` - Resource not found
- `500` - Internal server error
- `503` - Service unavailable

## Authentication

Currently, no authentication is required. The API is designed for local development only.

## Rate Limiting

No rate limiting is implemented. Use responsibly.

## CORS

CORS is enabled for all origins in development. Configure appropriately for production use.
