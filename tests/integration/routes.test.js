import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * Integration tests for Express API routes.
 *
 * These tests create a minimal Express app that mirrors the real routes
 * but with all dependencies (storage, orchestrator, benchmark, cacheManager)
 * replaced by mocks. This verifies request validation, status codes,
 * and response shapes without needing Foundry Local.
 */

describe('API Routes', () => {
  let app;
  let mockStorage;
  let mockOrchestrator;
  let mockBenchmark;
  let mockCacheManager;

  beforeEach(() => {
    mockStorage = {
      getAllModels: vi.fn().mockReturnValue([]),
      getModel: vi.fn(),
      saveModel: vi.fn(m => m),
      deleteModel: vi.fn(),
      getAllBenchmarkRuns: vi.fn().mockReturnValue([]),
      getBenchmarkRun: vi.fn(),
      getBenchmarkResults: vi.fn().mockReturnValue([]),
      getAllBenchmarkResults: vi.fn().mockReturnValue([]),
      exportToJSON: vi.fn().mockReturnValue({ run: null, results: [], exported_at: Date.now() }),
      exportToCSV: vi.fn().mockReturnValue(''),
      getLogs: vi.fn().mockReturnValue([]),
      updateModelStatus: vi.fn()
    };

    mockOrchestrator = {
      initialize: vi.fn().mockResolvedValue({ endpoint: 'http://localhost:5273' }),
      listAvailableModels: vi.fn().mockResolvedValue([]),
      listLoadedModels: vi.fn().mockResolvedValue([]),
      loadModel: vi.fn().mockResolvedValue({ id: 'phi:1', alias: 'phi' }),
      unloadModel: vi.fn().mockResolvedValue(undefined),
      getLoadedModelInfo: vi.fn(),
      getOpenAIClient: vi.fn(),
      checkModelHealth: vi.fn().mockResolvedValue({ healthy: true }),
      checkServiceHealth: vi.fn().mockResolvedValue({ healthy: true, endpoint: 'http://localhost:5273' }),
      getEndpoint: vi.fn().mockReturnValue('http://localhost:5273'),
      getDownloadProgress: vi.fn().mockReturnValue(null)
    };

    mockBenchmark = {
      runBenchmark: vi.fn().mockResolvedValue({ runId: 'run_123' }),
      getBenchmarkStatus: vi.fn()
    };

    mockCacheManager = {
      getCurrentLocation: vi.fn().mockResolvedValue('/home/user/.foundry/cache'),
      switchCache: vi.fn().mockResolvedValue({ success: true, location: '/new/cache' }),
      listCacheModels: vi.fn().mockResolvedValue([])
    };

    app = createTestApp(mockStorage, mockOrchestrator, mockBenchmark, mockCacheManager);
  });

  // ---- Models API ----

  describe('GET /api/models', () => {
    it('should return all configured models', async () => {
      mockStorage.getAllModels.mockReturnValue([
        { id: 'model_1', alias: 'phi', model_id: 'phi-3.5-mini', status: 'stopped' }
      ]);

      const res = await request(app).get('/api/models');
      expect(res.status).toBe(200);
      expect(res.body.models).toHaveLength(1);
      expect(res.body.models[0].alias).toBe('phi');
    });

    it('should return empty array when no models', async () => {
      const res = await request(app).get('/api/models');
      expect(res.status).toBe(200);
      expect(res.body.models).toEqual([]);
    });
  });

  describe('GET /api/models/available', () => {
    it('should return available models from orchestrator', async () => {
      mockOrchestrator.listAvailableModels.mockResolvedValue([
        { id: 'phi:1', alias: 'phi-3.5-mini', description: 'Phi', isCustom: false }
      ]);

      const res = await request(app).get('/api/models/available');
      expect(res.status).toBe(200);
      expect(res.body.models).toHaveLength(1);
    });
  });

  describe('GET /api/models/loaded', () => {
    it('should return loaded models', async () => {
      mockOrchestrator.listLoadedModels.mockResolvedValue([
        { alias: 'phi-3.5-mini' }
      ]);

      const res = await request(app).get('/api/models/loaded');
      expect(res.status).toBe(200);
      expect(res.body.models).toHaveLength(1);
    });
  });

  describe('POST /api/models', () => {
    it('should create a new model', async () => {
      const res = await request(app)
        .post('/api/models')
        .send({ alias: 'phi-3.5-mini', model_id: 'Phi-3.5-mini-instruct' });

      expect(res.status).toBe(201);
      expect(res.body.model).toBeDefined();
      expect(res.body.model.alias).toBe('phi-3.5-mini');
      expect(res.body.model.id).toMatch(/^model_/);
      expect(mockStorage.saveModel).toHaveBeenCalled();
    });

    it('should return 400 when alias is missing', async () => {
      const res = await request(app)
        .post('/api/models')
        .send({ model_id: 'Phi-3.5-mini-instruct' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('alias');
    });

    it('should return 400 when model_id is missing', async () => {
      const res = await request(app)
        .post('/api/models')
        .send({ alias: 'phi' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('model_id');
    });

    it('should return 400 when body is empty', async () => {
      const res = await request(app)
        .post('/api/models')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/models/:id', () => {
    it('should delete an existing model', async () => {
      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi', model_id: 'phi-3.5-mini', status: 'stopped'
      });

      const res = await request(app).delete('/api/models/model_1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockStorage.deleteModel).toHaveBeenCalledWith('model_1');
    });

    it('should return 404 for non-existent model', async () => {
      mockStorage.getModel.mockReturnValue(null);

      const res = await request(app).delete('/api/models/nonexistent');
      expect(res.status).toBe(404);
    });

    it('should unload model before deletion if loaded', async () => {
      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi', model_id: 'phi-3.5-mini', status: 'running'
      });
      mockOrchestrator.getLoadedModelInfo.mockReturnValue({ alias: 'phi-3.5-mini' });

      const res = await request(app).delete('/api/models/model_1');
      expect(res.status).toBe(200);
      expect(mockOrchestrator.unloadModel).toHaveBeenCalled();
    });
  });

  describe('POST /api/models/:id/start', () => {
    it('should start loading a model (non-blocking)', async () => {
      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi', model_id: 'phi-3.5-mini', status: 'stopped'
      });

      const res = await request(app).post('/api/models/model_1/start');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('loading started');
    });

    it('should return 404 for non-existent model', async () => {
      mockStorage.getModel.mockReturnValue(null);

      const res = await request(app).post('/api/models/model_1/start');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/models/:id/status', () => {
    it('should return model status with download progress', async () => {
      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi', status: 'running',
        endpoint: 'http://localhost:5273', updated_at: Date.now()
      });
      mockOrchestrator.getDownloadProgress.mockReturnValue({ progress: 75, status: 'downloading' });

      const res = await request(app).get('/api/models/model_1/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('running');
      expect(res.body.alias).toBe('phi');
      expect(res.body.download_progress).toBe(75);
      expect(res.body.download_status).toBe('downloading');
    });

    it('should return 404 for non-existent model', async () => {
      mockStorage.getModel.mockReturnValue(null);

      const res = await request(app).get('/api/models/model_1/status');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/models/:id/stop', () => {
    it('should unload a model', async () => {
      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi', model_id: 'phi-3.5-mini', status: 'running'
      });

      const res = await request(app).post('/api/models/model_1/stop');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockOrchestrator.unloadModel).toHaveBeenCalled();
    });

    it('should return 404 for non-existent model', async () => {
      mockStorage.getModel.mockReturnValue(null);

      const res = await request(app).post('/api/models/model_1/stop');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/models/:id/health', () => {
    it('should return health status', async () => {
      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi', model_id: 'phi-3.5-mini', status: 'running'
      });
      mockOrchestrator.checkModelHealth.mockResolvedValue({ healthy: true, status: 'loaded' });

      const res = await request(app).get('/api/models/model_1/health');
      expect(res.status).toBe(200);
      expect(res.body.healthy).toBe(true);
    });
  });

  // ---- Benchmarks API ----

  describe('POST /api/benchmarks/run', () => {
    it('should return 400 when modelIds is missing', async () => {
      const res = await request(app)
        .post('/api/benchmarks/run')
        .send({ suiteName: 'default' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('modelIds');
    });

    it('should return 400 when modelIds is empty', async () => {
      const res = await request(app)
        .post('/api/benchmarks/run')
        .send({ modelIds: [], suiteName: 'default' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when suiteName is missing', async () => {
      const res = await request(app)
        .post('/api/benchmarks/run')
        .send({ modelIds: ['model_1'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('suiteName');
    });
  });

  describe('GET /api/benchmarks/runs', () => {
    it('should return all benchmark runs', async () => {
      mockStorage.getAllBenchmarkRuns.mockReturnValue([
        { id: 'run_1', suite_name: 'default', model_ids: ['model_1'], status: 'completed' }
      ]);
      mockStorage.getAllModels.mockReturnValue([
        { id: 'model_1', alias: 'phi-3.5-mini' }
      ]);

      const res = await request(app).get('/api/benchmarks/runs');
      expect(res.status).toBe(200);
      expect(res.body.runs).toHaveLength(1);
      expect(res.body.runs[0].model_aliases).toContain('phi-3.5-mini');
    });
  });

  describe('GET /api/benchmarks/runs/:id', () => {
    it('should return run with results', async () => {
      mockStorage.getBenchmarkRun.mockReturnValue({
        id: 'run_1', suite_name: 'default', model_ids: ['m1'], status: 'completed'
      });
      mockStorage.getBenchmarkResults.mockReturnValue([
        { id: 'r1', run_id: 'run_1', model_id: 'm1', scenario: 'S1', tps: 25 }
      ]);
      mockStorage.getModel.mockReturnValue({ id: 'm1', alias: 'phi' });

      const res = await request(app).get('/api/benchmarks/runs/run_1');
      expect(res.status).toBe(200);
      expect(res.body.run).toBeDefined();
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].model_alias).toBe('phi');
    });

    it('should return 404 for non-existent run', async () => {
      mockStorage.getBenchmarkRun.mockReturnValue(null);

      const res = await request(app).get('/api/benchmarks/runs/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/benchmarks/runs/:id/status', () => {
    it('should return benchmark status', async () => {
      mockBenchmark.getBenchmarkStatus.mockReturnValue({ status: 'running', progress: 50 });
      mockStorage.getBenchmarkRun.mockReturnValue({ id: 'run_1', status: 'running' });

      const res = await request(app).get('/api/benchmarks/runs/run_1/status');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('running');
      expect(res.body.progress).toBe(50);
    });
  });

  describe('GET /api/benchmarks/results', () => {
    it('should return all results', async () => {
      mockStorage.getAllBenchmarkResults.mockReturnValue([
        { id: 'r1', run_id: 'run_1', model_id: 'm1', tps: 25 }
      ]);

      const res = await request(app).get('/api/benchmarks/results');
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
    });

    it('should filter by runId', async () => {
      mockStorage.getBenchmarkResults.mockReturnValue([{ id: 'r1', run_id: 'run_1' }]);

      const res = await request(app).get('/api/benchmarks/results?runId=run_1');
      expect(res.status).toBe(200);
      expect(mockStorage.getBenchmarkResults).toHaveBeenCalledWith('run_1');
    });
  });

  describe('GET /api/benchmarks/runs/:id/export/json', () => {
    it('should set Content-Disposition header', async () => {
      const res = await request(app).get('/api/benchmarks/runs/run_1/export/json');
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('benchmark-run_1.json');
    });
  });

  describe('GET /api/benchmarks/runs/:id/export/csv', () => {
    it('should set Content-Type to text/csv', async () => {
      mockStorage.exportToCSV.mockReturnValue('header1,header2\nval1,val2');

      const res = await request(app).get('/api/benchmarks/runs/run_1/export/csv');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });
  });

  // ---- System API ----

  describe('GET /api/system/health', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/api/system/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.foundryLocal).toBe('available');
    });

    it('should return unhealthy when service is down', async () => {
      mockOrchestrator.checkServiceHealth.mockResolvedValue({ healthy: false });

      const res = await request(app).get('/api/system/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('unhealthy');
    });
  });

  // ---- Cache API ----

  describe('GET /api/cache/location', () => {
    it('should return cache location', async () => {
      const res = await request(app).get('/api/cache/location');
      expect(res.status).toBe(200);
      expect(res.body.location).toBe('/home/user/.foundry/cache');
    });
  });

  describe('POST /api/cache/switch', () => {
    it('should switch cache directory', async () => {
      const res = await request(app)
        .post('/api/cache/switch')
        .send({ cachePath: '/new/cache/path' });

      expect(res.status).toBe(200);
      expect(mockCacheManager.switchCache).toHaveBeenCalledWith('/new/cache/path');
    });
  });

  describe('GET /api/cache/models', () => {
    it('should return cached models', async () => {
      mockCacheManager.listCacheModels.mockResolvedValue([
        { alias: 'phi', id: 'phi:1', source: 'cache' }
      ]);

      const res = await request(app).get('/api/cache/models');
      expect(res.status).toBe(200);
      expect(res.body.models).toHaveLength(1);
    });
  });
});

/**
 * Create a test Express app with mocked dependencies.
 * This mirrors the routes in src/server/index.js without requiring
 * the real modules.
 */
function createTestApp(storage, orchestrator, benchmark, cacheManager) {
  const app = express();
  app.use(express.json());

  // ---- Models ----

  app.get('/api/models/available', async (req, res) => {
    try {
      const models = await orchestrator.listAvailableModels();
      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/models/loaded', async (req, res) => {
    try {
      const models = await orchestrator.listLoadedModels();
      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/models', async (req, res) => {
    try {
      const models = storage.getAllModels();
      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/models', async (req, res) => {
    try {
      const { alias, model_id } = req.body;
      if (!alias || !model_id) {
        return res.status(400).json({ error: 'alias and model_id are required' });
      }
      const id = `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const model = { id, alias, model_id, status: 'stopped' };
      storage.saveModel(model);
      res.status(201).json({ model });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/models/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const model = storage.getModel(id);
      if (!model) return res.status(404).json({ error: 'Model not found' });
      const loadedModelInfo = orchestrator.getLoadedModelInfo(id);
      if (loadedModelInfo) {
        try { await orchestrator.unloadModel(id, model.model_id || model.alias); } catch {}
      }
      storage.deleteModel(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/models/:id/start', async (req, res) => {
    try {
      const { id } = req.params;
      const model = storage.getModel(id);
      if (!model) return res.status(404).json({ error: 'Model not found' });
      storage.saveModel({ ...model, status: 'loading', updated_at: Date.now() });
      res.json({ success: true, message: 'Model loading started. Poll /api/models/:id/status for progress.' });
      orchestrator.loadModel(id, model.model_id || model.alias).catch(() => {});
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/models/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const model = storage.getModel(id);
      if (!model) return res.status(404).json({ error: 'Model not found' });
      const downloadInfo = orchestrator.getDownloadProgress(model.alias || model.model_id);
      res.json({
        id: model.id, alias: model.alias, status: model.status,
        download_progress: downloadInfo?.progress ?? null,
        download_status: downloadInfo?.status ?? null,
        last_error: model.last_error || null,
        endpoint: model.endpoint || null, updated_at: model.updated_at
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/models/:id/stop', async (req, res) => {
    try {
      const { id } = req.params;
      const model = storage.getModel(id);
      if (!model) return res.status(404).json({ error: 'Model not found' });
      await orchestrator.unloadModel(id, model.model_id || model.alias);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/models/:id/health', async (req, res) => {
    try {
      const { id } = req.params;
      const model = storage.getModel(id);
      if (!model) return res.status(404).json({ error: 'Model not found' });
      const health = await orchestrator.checkModelHealth(model.alias || id);
      res.json(health);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/models/:id/logs', async (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit) || 100;
      const logs = storage.getLogs('service', id, limit);
      res.json({ logs });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Benchmarks ----

  app.post('/api/benchmarks/run', async (req, res) => {
    try {
      const { modelIds, suiteName } = req.body;
      if (!modelIds || !Array.isArray(modelIds) || modelIds.length === 0) {
        return res.status(400).json({ error: 'modelIds array is required' });
      }
      if (!suiteName) {
        return res.status(400).json({ error: 'suiteName is required' });
      }
      const { runId } = await benchmark.runBenchmark(modelIds, suiteName, {}, {}, null, { returnImmediately: true });
      res.json({ success: true, runId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/benchmarks/runs', async (req, res) => {
    try {
      const runs = storage.getAllBenchmarkRuns();
      const allModels = storage.getAllModels();
      const modelMap = new Map(allModels.map(m => [m.id, m]));
      const enrichedRuns = runs.map(run => {
        const modelAliases = [];
        if (run.model_ids && Array.isArray(run.model_ids)) {
          run.model_ids.forEach(modelId => {
            const model = modelMap.get(modelId);
            modelAliases.push(model ? (model.alias || model.model_id || modelId) : modelId);
          });
        }
        return { ...run, model_aliases: modelAliases };
      });
      res.json({ runs: enrichedRuns });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/benchmarks/runs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const run = storage.getBenchmarkRun(id);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      const results = storage.getBenchmarkResults(id);
      const enrichedResults = results.map(result => {
        const model = storage.getModel(result.model_id);
        return { ...result, model_alias: model?.alias || result.model_id, model_name: model?.alias || 'Unknown Model' };
      });
      res.json({ run, results: enrichedResults });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/benchmarks/runs/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const status = benchmark.getBenchmarkStatus(id);
      const run = storage.getBenchmarkRun(id);
      res.json({ status: status?.status || run?.status || 'unknown', progress: status?.progress ?? null, run });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/benchmarks/results', async (req, res) => {
    try {
      const { runId, modelId } = req.query;
      let results = runId
        ? storage.getBenchmarkResults(runId)
        : storage.getAllBenchmarkResults();
      if (modelId) results = results.filter(r => r.model_id === modelId);
      res.json({ results });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/benchmarks/runs/:id/export/json', async (req, res) => {
    try {
      const { id } = req.params;
      const data = storage.exportToJSON(id);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="benchmark-${id}.json"`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/benchmarks/runs/:id/export/csv', async (req, res) => {
    try {
      const { id } = req.params;
      const csv = storage.exportToCSV(id);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="benchmark-${id}.csv"`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/benchmarks/runs/:id/logs', async (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit) || 100;
      const logs = storage.getLogs('benchmark', id, limit);
      res.json({ logs });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- System ----

  app.get('/api/system/health', async (req, res) => {
    try {
      const serviceHealth = await orchestrator.checkServiceHealth();
      res.json({
        status: serviceHealth.healthy ? 'healthy' : 'unhealthy',
        foundryLocal: serviceHealth.healthy ? 'available' : 'unavailable',
        endpoint: serviceHealth.endpoint,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Cache ----

  app.get('/api/cache/location', async (req, res) => {
    try {
      const location = await cacheManager.getCurrentLocation();
      res.json({ location });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/cache/switch', async (req, res) => {
    try {
      const { cachePath } = req.body;
      const result = await cacheManager.switchCache(cachePath);
      res.json(result);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  app.get('/api/cache/models', async (req, res) => {
    try {
      const models = await cacheManager.listCacheModels();
      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}
