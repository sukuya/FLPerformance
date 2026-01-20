import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import storage from './storage.js';
import orchestrator from './orchestrator.js';
import benchmark from './benchmark.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ============================================================================
// Models API
// ============================================================================

/**
 * GET /api/models/available
 * List available models from Foundry Local catalog
 */
app.get('/api/models/available', async (req, res) => {
  try {
    const models = await orchestrator.listAvailableModels();
    res.json({ models });
  } catch (error) {
    logger.error('Failed to list available models', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models
 * List all configured models
 */
app.get('/api/models', async (req, res) => {
  try {
    const models = storage.getAllModels();
    res.json({ models });
  } catch (error) {
    logger.error('Failed to get models', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/models
 * Add a new model
 */
app.post('/api/models', async (req, res) => {
  try {
    const { alias, model_id } = req.body;
    
    if (!alias || !model_id) {
      return res.status(400).json({ error: 'alias and model_id are required' });
    }

    const id = `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const model = {
      id,
      alias,
      model_id,
      status: 'stopped'
    };

    storage.saveModel(model);
    logger.info('Model added', { id, alias, model_id });
    
    res.status(201).json({ model });
  } catch (error) {
    logger.error('Failed to add model', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/models/:id
 * Remove a model
 */
app.delete('/api/models/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Stop service if running
    const service = orchestrator.getService(id);
    if (service) {
      await orchestrator.stopService(id);
    }
    
    storage.deleteModel(id);
    logger.info('Model deleted', { id });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete model', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/models/:id/start
 * Start service for a model
 */
app.post('/api/models/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const model = storage.getModel(id);
    
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const service = await orchestrator.startService(id, model.alias);
    logger.info('Service started', { id, endpoint: service.endpoint });
    
    res.json({ 
      success: true,
      endpoint: service.endpoint,
      port: service.port
    });
  } catch (error) {
    logger.error('Failed to start service', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/models/:id/stop
 * Stop service for a model
 */
app.post('/api/models/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    await orchestrator.stopService(id);
    logger.info('Service stopped', { id });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to stop service', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/models/:id/load
 * Load model (download if needed)
 */
app.post('/api/models/:id/load', async (req, res) => {
  try {
    const { id } = req.params;
    await orchestrator.loadModel(id);
    logger.info('Model loaded', { id });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to load model', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/:id/health
 * Check service health
 */
app.get('/api/models/:id/health', async (req, res) => {
  try {
    const { id } = req.params;
    const health = await orchestrator.checkServiceHealth(id);
    res.json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/:id/logs
 * Get logs for a model service
 */
app.get('/api/models/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const logs = storage.getLogs('service', id, limit);
    res.json({ logs });
  } catch (error) {
    logger.error('Failed to get logs', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Benchmarks API
// ============================================================================

/**
 * GET /api/benchmarks/suites
 * List available benchmark suites
 */
app.get('/api/benchmarks/suites', async (req, res) => {
  try {
    const suitesDir = path.join(__dirname, '../../benchmarks/suites');
    const files = fs.readdirSync(suitesDir).filter(f => f.endsWith('.json'));
    
    const suites = files.map(file => {
      const content = JSON.parse(fs.readFileSync(path.join(suitesDir, file), 'utf8'));
      return {
        name: file.replace('.json', ''),
        ...content
      };
    });
    
    res.json({ suites });
  } catch (error) {
    logger.error('Failed to list benchmark suites', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/benchmarks/run
 * Run a benchmark
 */
app.post('/api/benchmarks/run', async (req, res) => {
  try {
    const { modelIds, suiteName, config } = req.body;
    
    if (!modelIds || !Array.isArray(modelIds) || modelIds.length === 0) {
      return res.status(400).json({ error: 'modelIds array is required' });
    }
    
    if (!suiteName) {
      return res.status(400).json({ error: 'suiteName is required' });
    }

    // Load suite
    const suitePath = path.join(__dirname, '../../benchmarks/suites', `${suiteName}.json`);
    if (!fs.existsSync(suitePath)) {
      return res.status(404).json({ error: 'Suite not found' });
    }
    
    const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));

    // Start benchmark (async)
    benchmark.runBenchmark(modelIds, suiteName, suite, config || {}, (progress) => {
      // Progress callback - could emit via WebSocket for real-time updates
      logger.info('Benchmark progress', progress);
    }).catch(error => {
      logger.error('Benchmark failed', { error: error.message });
    });

    res.json({ 
      success: true,
      message: 'Benchmark started'
    });
  } catch (error) {
    logger.error('Failed to start benchmark', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/benchmarks/runs
 * List all benchmark runs
 */
app.get('/api/benchmarks/runs', async (req, res) => {
  try {
    const runs = storage.getAllBenchmarkRuns();
    res.json({ runs });
  } catch (error) {
    logger.error('Failed to get benchmark runs', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/benchmarks/runs/:id
 * Get specific benchmark run with results
 */
app.get('/api/benchmarks/runs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const run = storage.getBenchmarkRun(id);
    
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    
    const results = storage.getBenchmarkResults(id);
    res.json({ run, results });
  } catch (error) {
    logger.error('Failed to get benchmark run', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/benchmarks/results
 * Get all benchmark results with optional filters
 */
app.get('/api/benchmarks/results', async (req, res) => {
  try {
    const { runId, modelId } = req.query;
    
    let results;
    if (runId) {
      results = storage.getBenchmarkResults(runId);
    } else {
      results = storage.getAllBenchmarkResults();
    }
    
    if (modelId) {
      results = results.filter(r => r.model_id === modelId);
    }
    
    res.json({ results });
  } catch (error) {
    logger.error('Failed to get results', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/benchmarks/runs/:id/export/json
 * Export results as JSON
 */
app.get('/api/benchmarks/runs/:id/export/json', async (req, res) => {
  try {
    const { id } = req.params;
    const data = storage.exportToJSON(id);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="benchmark-${id}.json"`);
    res.json(data);
  } catch (error) {
    logger.error('Failed to export JSON', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/benchmarks/runs/:id/export/csv
 * Export results as CSV
 */
app.get('/api/benchmarks/runs/:id/export/csv', async (req, res) => {
  try {
    const { id } = req.params;
    const csv = storage.exportToCSV(id);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="benchmark-${id}.csv"`);
    res.send(csv);
  } catch (error) {
    logger.error('Failed to export CSV', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/benchmarks/runs/:id/logs
 * Get logs for a benchmark run
 */
app.get('/api/benchmarks/runs/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const logs = storage.getLogs('benchmark', id, limit);
    res.json({ logs });
  } catch (error) {
    logger.error('Failed to get logs', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// System API
// ============================================================================

/**
 * GET /api/system/health
 * Overall system health check
 */
app.get('/api/system/health', async (req, res) => {
  try {
    await orchestrator.checkFoundryLocal();
    res.json({ 
      status: 'healthy',
      foundryLocal: 'available',
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message,
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/system/stats
 * Get dashboard statistics
 */
app.get('/api/system/stats', async (req, res) => {
  try {
    const models = storage.getAllModels();
    const runs = storage.getAllBenchmarkRuns();
    const results = storage.getAllBenchmarkResults();

    // Calculate best model metrics
    const tpsResults = results.filter(r => r.tps > 0).sort((a, b) => b.tps - a.tps);
    const latencyResults = results.filter(r => r.latency_p95 > 0).sort((a, b) => a.latency_p95 - b.latency_p95);

    const stats = {
      totalModels: models.length,
      runningServices: models.filter(m => m.status === 'running').length,
      totalRuns: runs.length,
      lastRun: runs.length > 0 ? runs[0] : null,
      bestTpsModel: tpsResults.length > 0 ? {
        modelId: tpsResults[0].model_id,
        tps: tpsResults[0].tps
      } : null,
      bestLatencyModel: latencyResults.length > 0 ? {
        modelId: latencyResults[0].model_id,
        p95: latencyResults[0].latency_p95
      } : null
    };

    res.json(stats);
  } catch (error) {
    logger.error('Failed to get stats', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Serve static client files in production
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuildPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`FLPerformance API server running on port ${PORT}`);
  logger.info('Checking Foundry Local availability...');
  
  orchestrator.checkFoundryLocal()
    .then(() => logger.info('Foundry Local is available'))
    .catch(err => logger.error('Foundry Local check failed', { error: err.message }));
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close();
  await orchestrator.stopAllServices();
  storage.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close();
  await orchestrator.stopAllServices();
  storage.close();
  process.exit(0);
});

export default app;
