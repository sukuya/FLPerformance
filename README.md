# FLPerformance - Foundry Local LLM Benchmark Tool

A local application with UI for benchmarking multiple Large Language Models (LLMs) running via **Microsoft Foundry Local**.

## Overview

FLPerformance enables you to:
- Start and manage multiple Foundry Local services (one per model)
- Load different models from the Foundry model catalog
- Run standardized benchmark tests across models
- Display clear performance statistics with tables and charts
- Export results for analysis

## Prerequisites

### Required Software

1. **Microsoft Foundry Local**
   - Install Foundry Local on your machine
   - Ensure the Foundry Local CLI is available in your PATH
   - Verify installation: `foundry-local --version`

2. **Node.js & NPM**
   - Node.js v18 or higher
   - NPM v9 or higher
   - Verify: `node --version` and `npm --version`

3. **System Requirements**
   - Windows 10/11, macOS, or Linux
   - Minimum 16GB RAM (32GB+ recommended for multiple models)
   - GPU with CUDA support (optional but recommended)
   - Adequate disk space for model storage (varies by model, typically 5-50GB per model)

### Environment Setup

Foundry Local should be properly configured on your system. Check that you can:
- List available models: `foundry-local models list`
- Start the management service: `foundry-local service start`

## First Run Guide

### 1. Install Dependencies

```bash
# Navigate to the FLPerformance directory
cd FLPerformance

# Install all dependencies (backend and frontend)
npm run setup
```

### 2. Start the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

The application will be available at:
- **Frontend UI**: http://localhost:3000
- **Backend API**: http://localhost:3001

### 3. Add Your First Model

1. Open the UI at http://localhost:3000
2. Navigate to the **Models** tab
3. Click **"Add Model"**
4. Select a model from the available Foundry Local catalog (e.g., `phi-3-mini-4k-instruct`)
5. Click **"Start Service"** to launch a Foundry Local service for this model
6. Click **"Load Model"** to download (if needed) and load the model into memory

### 4. Run Your First Benchmark

1. Navigate to the **Benchmarks** tab
2. Select the **"default"** benchmark suite
3. Choose one or more models to benchmark
4. Configure settings (iterations, concurrency, etc.)
5. Click **"Run Benchmark"**
6. Watch live progress as tests execute

### 5. View Results

1. Navigate to the **Results** tab
2. View comparison tables and charts
3. Filter by run, model, or benchmark type
4. Export results as JSON or CSV

## Project Structure

```
FLPerformance/
├── src/
│   ├── server/              # Backend API
│   │   ├── index.js         # Express server entry point
│   │   ├── orchestrator.js  # Foundry Local service orchestration
│   │   ├── benchmark.js     # Benchmark engine
│   │   ├── storage.js       # Results storage (JSON + SQLite)
│   │   └── logger.js        # Structured logging
│   └── client/              # Frontend UI (React/Vue)
│       ├── public/
│       └── src/
│           ├── components/  # UI components
│           ├── pages/       # Page views
│           └── utils/       # Client utilities
├── benchmarks/
│   └── suites/
│       └── default.json     # Default benchmark suite definition
├── docs/
│   ├── architecture.md      # System architecture
│   ├── limitations.md       # Known limitations
│   └── api.md              # API documentation
├── scripts/
│   └── helpers/            # Utility scripts
├── results/
│   └── example/            # Example benchmark results
├── package.json
└── README.md
```

## Key Features

### Model & Service Management
- Add/remove models from Foundry Local catalog
- Start/stop isolated service instances per model
- Load models with automatic download and caching
- Monitor service health and status in real-time

### Benchmark Suite
- **Throughput (TPS)**: Tokens generated per second
- **Latency**: Time to first token (TTFT) and end-to-end completion time
- **Stability**: Error rate and timeout tracking
- **Resource Usage**: CPU, RAM, and GPU utilization (platform-dependent)

### Results & Comparison
- Side-by-side model comparison tables
- Interactive charts for TPS, latency distributions (p50/p95/p99), error rates
- "Best model for..." recommendations based on metrics
- Export results as JSON or CSV

## Configuration

Default settings can be modified in the **Settings** tab:
- Default iterations per benchmark
- Concurrency level
- Request timeout values
- Results storage path
- Streaming mode (if supported)

## Troubleshooting

### Service fails to start
- Ensure Foundry Local is installed and in PATH
- Check that no other service is using the required port
- View logs in the **Models** tab for specific error messages

### Model fails to load
- Verify sufficient disk space for model download
- Check network connectivity for first-time downloads
- Ensure adequate RAM for model size

### Benchmark timeouts
- Increase timeout values in Settings
- Reduce concurrency level
- Check system resource availability

## Documentation

For more detailed information, see:
- [Architecture Documentation](docs/architecture.md)
- [Known Limitations](docs/limitations.md)
- [API Reference](docs/api.md)

## Support

For issues or questions:
1. Check the documentation in `/docs`
2. Review logs in the UI under each service
3. Examine results in `/results` directory

## License

MIT License
