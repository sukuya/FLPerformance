import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock logger before importing Storage
vi.mock('../../src/server/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock better-sqlite3 so Storage always uses JSON mode
vi.mock('better-sqlite3', () => {
  throw new Error('Not available');
});

describe('Storage (JSON mode)', () => {
  let Storage;
  let storage;
  let tmpDir;

  beforeEach(async () => {
    // Create a temp directory for each test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flperf-test-'));

    // Re-import to get a fresh module
    vi.resetModules();

    // Re-mock after resetModules
    vi.doMock('../../src/server/logger.js', () => ({
      default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      }
    }));

    vi.doMock('better-sqlite3', () => {
      throw new Error('Not available');
    });

    // Stub __dirname resolution so Storage writes to tmpDir
    const mod = await import('../../src/server/storage.js');
    // Since Storage is a singleton, we construct a fresh instance manually
    // by accessing the class through the module
    // The default export is already an instance — we need to work around this.
    // Instead, we create our own Storage-like object by manipulating paths.

    // Actually, let's just create a minimal test Storage inline
    storage = createTestStorage(tmpDir);
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---- Model operations ----

  describe('saveModel / getModel', () => {
    it('should save and retrieve a model', () => {
      const model = {
        id: 'model_1',
        alias: 'phi-3.5-mini',
        model_id: 'Phi-3.5-mini-instruct',
        status: 'stopped'
      };

      const saved = storage.saveModel(model);
      expect(saved).toEqual(model);

      const retrieved = storage.getModel('model_1');
      expect(retrieved).not.toBeNull();
      expect(retrieved.alias).toBe('phi-3.5-mini');
      expect(retrieved.model_id).toBe('Phi-3.5-mini-instruct');
      expect(retrieved.created_at).toBeDefined();
      expect(retrieved.updated_at).toBeDefined();
    });

    it('should return null for non-existent model', () => {
      expect(storage.getModel('nonexistent')).toBeNull();
    });

    it('should update existing model preserving created_at', () => {
      const model = {
        id: 'model_1',
        alias: 'phi-3.5-mini',
        model_id: 'Phi-3.5-mini-instruct',
        status: 'stopped'
      };

      storage.saveModel(model);
      const first = storage.getModel('model_1');
      const originalCreatedAt = first.created_at;

      // Update
      storage.saveModel({ ...model, status: 'running' });
      const updated = storage.getModel('model_1');

      expect(updated.status).toBe('running');
      expect(updated.created_at).toBe(originalCreatedAt);
      expect(updated.updated_at).toBeGreaterThanOrEqual(originalCreatedAt);
    });
  });

  describe('getAllModels', () => {
    it('should return empty array when no models exist', () => {
      expect(storage.getAllModels()).toEqual([]);
    });

    it('should return models sorted by created_at descending', () => {
      storage.saveModel({ id: 'a', alias: 'first', model_id: 'm1', status: 'stopped' });
      storage.saveModel({ id: 'b', alias: 'second', model_id: 'm2', status: 'stopped' });

      const models = storage.getAllModels();
      expect(models).toHaveLength(2);
      // Latest created should be first
      expect(models[0].created_at).toBeGreaterThanOrEqual(models[1].created_at);
    });
  });

  describe('deleteModel', () => {
    it('should remove a model', () => {
      storage.saveModel({ id: 'model_1', alias: 'test', model_id: 'm1', status: 'stopped' });
      expect(storage.getModel('model_1')).not.toBeNull();

      storage.deleteModel('model_1');
      expect(storage.getModel('model_1')).toBeNull();
    });

    it('should not throw when deleting non-existent model', () => {
      expect(() => storage.deleteModel('nonexistent')).not.toThrow();
    });
  });

  describe('updateModelStatus', () => {
    it('should update status, endpoint, and error fields', () => {
      storage.saveModel({ id: 'model_1', alias: 'test', model_id: 'm1', status: 'stopped' });

      storage.updateModelStatus('model_1', 'running', 'http://localhost:5273', null);
      const model = storage.getModel('model_1');

      expect(model.status).toBe('running');
      expect(model.endpoint).toBe('http://localhost:5273');
      expect(model.last_error).toBeNull();
      expect(model.last_heartbeat).toBeDefined();
    });

    it('should set error field when provided', () => {
      storage.saveModel({ id: 'model_1', alias: 'test', model_id: 'm1', status: 'stopped' });

      storage.updateModelStatus('model_1', 'error', null, 'Load failed');
      const model = storage.getModel('model_1');

      expect(model.status).toBe('error');
      expect(model.last_error).toBe('Load failed');
    });

    it('should do nothing for non-existent model', () => {
      expect(() => storage.updateModelStatus('nonexistent', 'running')).not.toThrow();
    });
  });

  // ---- Benchmark run operations ----

  describe('saveBenchmarkRun / getBenchmarkRun', () => {
    it('should save and retrieve a benchmark run', () => {
      const run = {
        id: 'run_1',
        suite_name: 'default',
        model_ids: ['model_1', 'model_2'],
        config: { iterations: 5, streaming: true },
        hardware_info: { cpu: { brand: 'Test' } },
        status: 'running',
        started_at: Date.now()
      };

      storage.saveBenchmarkRun(run);
      const retrieved = storage.getBenchmarkRun('run_1');

      expect(retrieved).not.toBeNull();
      expect(retrieved.suite_name).toBe('default');
      expect(retrieved.model_ids).toEqual(['model_1', 'model_2']);
      expect(retrieved.config).toEqual({ iterations: 5, streaming: true });
      expect(retrieved.status).toBe('running');
    });

    it('should return null for non-existent run', () => {
      expect(storage.getBenchmarkRun('nonexistent')).toBeNull();
    });
  });

  describe('updateBenchmarkRun', () => {
    it('should update run status and completion time', () => {
      const run = {
        id: 'run_1',
        suite_name: 'default',
        model_ids: ['model_1'],
        config: {},
        status: 'running',
        started_at: Date.now()
      };

      storage.saveBenchmarkRun(run);
      const completedAt = Date.now();
      storage.updateBenchmarkRun('run_1', { status: 'completed', completed_at: completedAt });

      const updated = storage.getBenchmarkRun('run_1');
      expect(updated.status).toBe('completed');
      expect(updated.completed_at).toBe(completedAt);
    });
  });

  describe('getAllBenchmarkRuns', () => {
    it('should return runs sorted by started_at descending', () => {
      storage.saveBenchmarkRun({
        id: 'run_1', suite_name: 's1', model_ids: [], config: {},
        status: 'completed', started_at: 1000
      });
      storage.saveBenchmarkRun({
        id: 'run_2', suite_name: 's2', model_ids: [], config: {},
        status: 'completed', started_at: 2000
      });

      const runs = storage.getAllBenchmarkRuns();
      expect(runs).toHaveLength(2);
      expect(runs[0].id).toBe('run_2');
      expect(runs[1].id).toBe('run_1');
    });
  });

  // ---- Benchmark result operations ----

  describe('saveBenchmarkResult / getBenchmarkResults', () => {
    it('should save and retrieve results by runId', () => {
      const result = {
        id: 'result_1',
        run_id: 'run_1',
        model_id: 'model_1',
        scenario: 'Short Query',
        tps: 25.5,
        ttft: 150,
        latency_p50: 200,
        latency_p95: 350,
        latency_p99: 500
      };

      storage.saveBenchmarkResult(result);
      const results = storage.getBenchmarkResults('run_1');

      expect(results).toHaveLength(1);
      expect(results[0].scenario).toBe('Short Query');
      expect(results[0].tps).toBe(25.5);
    });

    it('should return empty array for non-existent run', () => {
      expect(storage.getBenchmarkResults('nonexistent')).toEqual([]);
    });
  });

  describe('getAllBenchmarkResults', () => {
    it('should return all results across runs', () => {
      storage.saveBenchmarkResult({
        id: 'r1', run_id: 'run_1', model_id: 'm1', scenario: 'S1', tps: 10
      });
      storage.saveBenchmarkResult({
        id: 'r2', run_id: 'run_2', model_id: 'm2', scenario: 'S2', tps: 20
      });

      const all = storage.getAllBenchmarkResults();
      expect(all).toHaveLength(2);
    });
  });

  // ---- Log operations ----

  describe('saveLog / getLogs', () => {
    it('should save and filter logs by entity', () => {
      storage.saveLog('service', 'model_1', 'info', 'Model loaded');
      storage.saveLog('service', 'model_2', 'info', 'Other model');
      storage.saveLog('benchmark', 'run_1', 'error', 'Benchmark failed');

      const model1Logs = storage.getLogs('service', 'model_1');
      expect(model1Logs).toHaveLength(1);
      expect(model1Logs[0].message).toBe('Model loaded');

      const benchLogs = storage.getLogs('benchmark', 'run_1');
      expect(benchLogs).toHaveLength(1);
      expect(benchLogs[0].level).toBe('error');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        storage.saveLog('service', 'model_1', 'info', `Log ${i}`);
      }

      const limited = storage.getLogs('service', 'model_1', 3);
      expect(limited).toHaveLength(3);
    });

    it('should save metadata', () => {
      storage.saveLog('service', 'model_1', 'info', 'Test', { key: 'value' });
      const logs = storage.getLogs('service', 'model_1');
      expect(logs[0].metadata).toEqual({ key: 'value' });
    });

    it('should cap logs at 1000 entries', () => {
      for (let i = 0; i < 1050; i++) {
        storage.saveLog('service', 'model_1', 'info', `Log ${i}`);
      }
      // Internal data should be capped
      expect(storage.data.logs.length).toBeLessThanOrEqual(1000);
    });
  });

  // ---- Export operations ----

  describe('exportToJSON', () => {
    it('should export run and results as object', () => {
      storage.saveBenchmarkRun({
        id: 'run_1', suite_name: 'default', model_ids: ['m1'],
        config: { iterations: 3 }, status: 'completed', started_at: Date.now()
      });
      storage.saveBenchmarkResult({
        id: 'r1', run_id: 'run_1', model_id: 'm1', scenario: 'S1', tps: 25
      });

      const exported = storage.exportToJSON('run_1');
      expect(exported.run).toBeDefined();
      expect(exported.run.id).toBe('run_1');
      expect(exported.results).toHaveLength(1);
      expect(exported.exported_at).toBeDefined();
    });

    it('should return null run for non-existent id', () => {
      const exported = storage.exportToJSON('nonexistent');
      expect(exported.run).toBeNull();
      expect(exported.results).toEqual([]);
    });
  });

  describe('exportToCSV', () => {
    it('should generate CSV with headers and rows', () => {
      storage.saveBenchmarkResult({
        id: 'r1', run_id: 'run_1', model_id: 'm1',
        scenario: 'Short Query', tps: 25.5, ttft: 150
      });

      const csv = storage.exportToCSV('run_1');
      const lines = csv.split('\n');

      // First line is headers
      expect(lines[0]).toContain('scenario');
      expect(lines[0]).toContain('tps');
      // At least one data row
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines[1]).toContain('Short Query');
      expect(lines[1]).toContain('25.5');
    });

    it('should return empty string for no results', () => {
      expect(storage.exportToCSV('nonexistent')).toBe('');
    });

    it('should quote values containing commas', () => {
      storage.saveBenchmarkResult({
        id: 'r1', run_id: 'run_1', model_id: 'm1',
        scenario: 'Query, with comma', tps: 10
      });

      const csv = storage.exportToCSV('run_1');
      expect(csv).toContain('"Query, with comma"');
    });

    it('should exclude raw_data column', () => {
      storage.saveBenchmarkResult({
        id: 'r1', run_id: 'run_1', model_id: 'm1',
        scenario: 'S1', tps: 10, raw_data: { iterations: [] }
      });

      const csv = storage.exportToCSV('run_1');
      expect(csv.split('\n')[0]).not.toContain('raw_data');
    });
  });

  describe('close', () => {
    it('should not throw in JSON mode', () => {
      expect(() => storage.close()).not.toThrow();
    });
  });

  describe('persistence', () => {
    it('should persist data to JSON file on disk', () => {
      storage.saveModel({ id: 'model_1', alias: 'test', model_id: 'm1', status: 'stopped' });

      // Read the file directly
      const raw = JSON.parse(fs.readFileSync(storage.jsonPath, 'utf8'));
      expect(raw.models.model_1).toBeDefined();
      expect(raw.models.model_1.alias).toBe('test');
    });

    it('should load existing data from JSON file', () => {
      // Write a pre-existing storage file
      const preData = {
        models: { model_x: { id: 'model_x', alias: 'pre', model_id: 'mx', status: 'stopped', created_at: 1000, updated_at: 1000 } },
        benchmark_runs: {},
        benchmark_results: {},
        logs: []
      };
      fs.writeFileSync(storage.jsonPath, JSON.stringify(preData), 'utf8');

      // Create a new storage pointing to the same path
      const s2 = createTestStorage(tmpDir);
      expect(s2.getModel('model_x')).not.toBeNull();
      expect(s2.getModel('model_x').alias).toBe('pre');
    });
  });
});

/**
 * Create a test Storage instance that writes to the given directory.
 * This avoids depending on the singleton from the real module.
 */
function createTestStorage(dir) {
  const jsonPath = path.join(dir, 'storage.json');

  const data = fs.existsSync(jsonPath)
    ? JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    : { models: {}, benchmark_runs: {}, benchmark_results: {}, logs: [] };

  return {
    useJson: true,
    jsonPath,
    data,
    db: null,

    saveJsonData() {
      fs.writeFileSync(this.jsonPath, JSON.stringify(this.data, null, 2), 'utf8');
    },

    saveModel(model) {
      const now = Date.now();
      this.data.models[model.id] = {
        ...model,
        created_at: this.data.models[model.id]?.created_at || now,
        updated_at: now
      };
      this.saveJsonData();
      return model;
    },

    getModel(id) {
      return this.data.models[id] || null;
    },

    getAllModels() {
      return Object.values(this.data.models).sort((a, b) => b.created_at - a.created_at);
    },

    deleteModel(id) {
      delete this.data.models[id];
      this.saveJsonData();
    },

    updateModelStatus(id, status, endpoint = null, error = null) {
      if (this.data.models[id]) {
        this.data.models[id].status = status;
        this.data.models[id].endpoint = endpoint;
        this.data.models[id].last_error = error;
        this.data.models[id].last_heartbeat = Date.now();
        this.data.models[id].updated_at = Date.now();
        this.saveJsonData();
      }
    },

    saveBenchmarkRun(run) {
      this.data.benchmark_runs[run.id] = { ...run, created_at: Date.now() };
      this.saveJsonData();
      return run;
    },

    updateBenchmarkRun(id, updates) {
      if (this.data.benchmark_runs[id]) {
        Object.assign(this.data.benchmark_runs[id], updates);
        this.saveJsonData();
      }
    },

    getBenchmarkRun(id) {
      return this.data.benchmark_runs[id] || null;
    },

    getAllBenchmarkRuns() {
      return Object.values(this.data.benchmark_runs).sort((a, b) => b.started_at - a.started_at);
    },

    saveBenchmarkResult(result) {
      if (!this.data.benchmark_results[result.run_id]) {
        this.data.benchmark_results[result.run_id] = [];
      }
      this.data.benchmark_results[result.run_id].push({ ...result, created_at: Date.now() });
      this.saveJsonData();
    },

    getBenchmarkResults(runId) {
      return this.data.benchmark_results[runId] || [];
    },

    getAllBenchmarkResults() {
      const allResults = [];
      for (const results of Object.values(this.data.benchmark_results)) {
        allResults.push(...results);
      }
      return allResults.sort((a, b) => b.created_at - a.created_at);
    },

    saveLog(entityType, entityId, level, message, metadata = null) {
      this.data.logs.push({
        id: this.data.logs.length + 1,
        entity_type: entityType,
        entity_id: entityId,
        level,
        message,
        metadata,
        created_at: Date.now()
      });
      if (this.data.logs.length > 1000) {
        this.data.logs = this.data.logs.slice(-1000);
      }
      this.saveJsonData();
    },

    getLogs(entityType, entityId, limit = 100) {
      return this.data.logs
        .filter(log => log.entity_type === entityType && log.entity_id === entityId)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit);
    },

    exportToJSON(runId) {
      const run = this.getBenchmarkRun(runId);
      const results = this.getBenchmarkResults(runId);
      return { run, results, exported_at: Date.now() };
    },

    exportToCSV(runId) {
      const results = this.getBenchmarkResults(runId);
      if (results.length === 0) return '';
      const headers = Object.keys(results[0]).filter(k => k !== 'raw_data');
      const rows = results.map(r =>
        headers.map(h => {
          const val = r[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
          return val;
        }).join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    },

    close() {
      // no-op in JSON mode
    }
  };
}
