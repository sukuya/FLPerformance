import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('FoundryLocalOrchestrator', () => {
  let orchestrator;
  let mockManager;
  let mockStorage;
  let mockModel;

  beforeEach(() => {
    mockModel = {
      id: 'phi-3.5-mini-instruct-cpu:1',
      alias: 'phi-3.5-mini',
      isCached: true,
      isLoaded: vi.fn().mockResolvedValue(false),
      load: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(undefined),
      selectedVariant: {
        modelInfo: {
          displayName: 'Phi 3.5 Mini',
          version: '1.0',
          fileSizeMb: 2590,
          publisher: 'Microsoft',
          license: 'MIT',
          task: 'chat-completion',
          runtime: { deviceType: 'CPU', executionProvider: 'CPUExecutionProvider' }
        },
        unload: vi.fn().mockResolvedValue(undefined)
      }
    };

    mockManager = {
      urls: ['http://localhost:5273'],
      startWebService: vi.fn(),
      catalog: {
        getModels: vi.fn().mockResolvedValue([mockModel]),
        getModel: vi.fn().mockResolvedValue(mockModel)
      },
      _modelLoadManager: {
        listLoaded: vi.fn().mockResolvedValue([])
      }
    };

    mockStorage = {
      getModel: vi.fn(),
      saveModel: vi.fn()
    };

    orchestrator = createTestOrchestrator(mockManager, mockStorage);
  });

  // ---- initialize ----

  describe('initialize', () => {
    it('should start web service and create OpenAI client', async () => {
      const result = await orchestrator.initialize();

      expect(mockManager.startWebService).toHaveBeenCalled();
      expect(result.endpoint).toBe('http://localhost:5273');
      expect(orchestrator.initialized).toBe(true);
    });

    it('should return cached result if already initialised', async () => {
      await orchestrator.initialize();
      mockManager.startWebService.mockClear();

      const result = await orchestrator.initialize();
      expect(mockManager.startWebService).not.toHaveBeenCalled();
      expect(result.endpoint).toBe('http://localhost:5273');
    });

    it('should set initialized to false on failure', async () => {
      mockManager.startWebService.mockImplementation(() => { throw new Error('Service failed'); });

      await expect(orchestrator.initialize()).rejects.toThrow('Service failed');
      expect(orchestrator.initialized).toBe(false);
    });
  });

  // ---- isServiceRunning ----

  describe('isServiceRunning', () => {
    it('should return true when health endpoint responds', async () => {
      await orchestrator.initialize();
      expect(await orchestrator.isServiceRunning()).toBe(true);
    });

    it('should return false when manager is null', async () => {
      expect(await orchestrator.isServiceRunning()).toBe(false);
    });

    it('should return false on error', async () => {
      await orchestrator.initialize();
      orchestrator._healthFetch = vi.fn().mockRejectedValue(new Error('failed'));
      expect(await orchestrator.isServiceRunning()).toBe(false);
    });
  });

  // ---- sync accessors ----

  describe('sync accessors', () => {
    it('getLoadedModelInfo should return null for unknown model', () => {
      expect(orchestrator.getLoadedModelInfo('unknown')).toBeNull();
    });

    it('getLoadedModelInfo should return stored model info', async () => {
      await orchestrator.initialize();

      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi-3.5-mini', model_id: 'phi-3.5-mini', status: 'stopped'
      });

      await orchestrator.loadModel('model_1', 'phi-3.5-mini');
      const info = orchestrator.getLoadedModelInfo('model_1');

      expect(info).toBeDefined();
      expect(info.alias).toBe('phi-3.5-mini');
    });

    it('getAllLoadedModels should return all loaded models', async () => {
      await orchestrator.initialize();
      mockStorage.getModel.mockReturnValue({ id: 'x', alias: 'x', model_id: 'x', status: 'stopped' });

      const modelB = { ...mockModel, id: 'b:1', alias: 'b' };
      mockManager.catalog.getModel
        .mockResolvedValueOnce(mockModel)
        .mockResolvedValueOnce(modelB);

      await orchestrator.loadModel('m1', 'phi-3.5-mini');
      await orchestrator.loadModel('m2', 'b');

      const all = orchestrator.getAllLoadedModels();
      expect(all).toHaveLength(2);
    });

    it('getOpenAIClient should return client after init', async () => {
      await orchestrator.initialize();
      expect(orchestrator.getOpenAIClient()).toBeDefined();
    });

    it('getEndpoint should return service URL after init', async () => {
      await orchestrator.initialize();
      expect(orchestrator.getEndpoint()).toBe('http://localhost:5273');
    });
  });

  // ---- listAvailableModels ----

  describe('listAvailableModels', () => {
    it('should return transformed catalog models', async () => {
      const models = await orchestrator.listAvailableModels();

      expect(models).toHaveLength(1);
      expect(models[0].alias).toBe('phi-3.5-mini');
      expect(models[0].deviceType).toBe('CPU');
      expect(models[0].fileSizeMb).toBe(2590);
      expect(models[0].isCached).toBe(true);
      expect(models[0].isCustom).toBe(false);
    });

    it('should cache results for 60 seconds', async () => {
      await orchestrator.listAvailableModels();
      await orchestrator.listAvailableModels();

      expect(mockManager.catalog.getModels).toHaveBeenCalledTimes(1);
    });

    it('should return empty array on error with no cache', async () => {
      mockManager.catalog.getModels.mockRejectedValue(new Error('SDK error'));

      const models = await orchestrator.listAvailableModels();
      expect(models).toEqual([]);
    });
  });

  // ---- listLoadedModels ----

  describe('listLoadedModels', () => {
    it('should return models from the load manager', async () => {
      await orchestrator.initialize();
      mockManager._modelLoadManager.listLoaded.mockResolvedValue(['phi-3.5-mini']);

      const loaded = await orchestrator.listLoadedModels();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('phi-3.5-mini');
    });
  });

  // ---- downloadModel ----

  describe('downloadModel', () => {
    it('should skip download if model is cached', async () => {
      await orchestrator.downloadModel('phi-3.5-mini');

      expect(mockModel.download).not.toHaveBeenCalled();
      const progress = orchestrator.getDownloadProgress('phi-3.5-mini');
      expect(progress.progress).toBe(100);
      expect(progress.status).toBe('complete');
    });

    it('should download and track progress for uncached model', async () => {
      const uncachedModel = { ...mockModel, isCached: false };
      mockManager.catalog.getModel.mockResolvedValue(uncachedModel);

      await orchestrator.downloadModel('phi-3.5-mini');

      expect(uncachedModel.download).toHaveBeenCalled();
      const progress = orchestrator.getDownloadProgress('phi-3.5-mini');
      expect(progress.progress).toBe(100);
      expect(progress.status).toBe('complete');
    });

    it('should record error on download failure', async () => {
      const uncachedModel = { ...mockModel, isCached: false };
      uncachedModel.download = vi.fn().mockRejectedValue(new Error('network error'));
      mockManager.catalog.getModel.mockResolvedValue(uncachedModel);

      await expect(orchestrator.downloadModel('phi-3.5-mini')).rejects.toThrow('network error');
      const progress = orchestrator.getDownloadProgress('phi-3.5-mini');
      expect(progress.status).toBe('error');
      expect(progress.error).toBe('network error');
    });
  });

  // ---- loadModel ----

  describe('loadModel', () => {
    it('should load a cached model and update storage', async () => {
      await orchestrator.initialize();

      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi-3.5-mini', model_id: 'phi-3.5-mini', status: 'stopped'
      });

      const result = await orchestrator.loadModel('model_1', 'phi-3.5-mini');
      expect(result.alias).toBe('phi-3.5-mini');
      expect(result.deviceType).toBe('CPU');
      expect(mockModel.load).toHaveBeenCalled();
      expect(mockStorage.saveModel).toHaveBeenCalled();

      const savedModel = mockStorage.saveModel.mock.calls[0][0];
      expect(savedModel.status).toBe('running');
      expect(savedModel.endpoint).toBe('http://localhost:5273');
    });

    it('should download then load an uncached model', async () => {
      await orchestrator.initialize();

      const uncachedModel = {
        ...mockModel,
        isCached: false,
        download: vi.fn().mockResolvedValue(undefined),
        load: vi.fn().mockResolvedValue(undefined)
      };
      mockManager.catalog.getModel.mockResolvedValue(uncachedModel);
      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi-3.5-mini', model_id: 'phi-3.5-mini', status: 'stopped'
      });

      await orchestrator.loadModel('model_1', 'phi-3.5-mini');

      expect(uncachedModel.download).toHaveBeenCalled();
      expect(uncachedModel.load).toHaveBeenCalled();
    });

    it('should set error status on failure', async () => {
      await orchestrator.initialize();

      mockModel.load.mockRejectedValue(new Error('Load failed'));
      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi-3.5-mini', model_id: 'phi-3.5-mini', status: 'stopped'
      });

      await expect(orchestrator.loadModel('model_1', 'phi-3.5-mini'))
        .rejects.toThrow('Load failed');

      const lastSave = mockStorage.saveModel.mock.calls.at(-1)[0];
      expect(lastSave.status).toBe('error');
      expect(lastSave.last_error).toBe('Load failed');
    });
  });

  // ---- unloadModel ----

  describe('unloadModel', () => {
    it('should unload a model and update storage', async () => {
      await orchestrator.initialize();

      mockStorage.getModel.mockReturnValue({
        id: 'model_1', alias: 'phi-3.5-mini', model_id: 'phi-3.5-mini', status: 'stopped'
      });
      await orchestrator.loadModel('model_1', 'phi-3.5-mini');

      await orchestrator.unloadModel('model_1', 'phi-3.5-mini');

      expect(mockModel.selectedVariant.unload).toHaveBeenCalled();
      expect(orchestrator.getLoadedModelInfo('model_1')).toBeNull();
    });
  });

  // ---- checkModelHealth ----

  describe('checkModelHealth', () => {
    it('should report healthy when model is loaded', async () => {
      mockModel.isLoaded.mockResolvedValue(true);

      const health = await orchestrator.checkModelHealth('phi-3.5-mini');
      expect(health.healthy).toBe(true);
      expect(health.status).toBe('running');
    });

    it('should report unhealthy when model is not loaded', async () => {
      mockModel.isLoaded.mockResolvedValue(false);

      const health = await orchestrator.checkModelHealth('phi-3.5-mini');
      expect(health.healthy).toBe(false);
      expect(health.status).toBe('stopped');
    });

    it('should report error for unknown model', async () => {
      mockManager.catalog.getModel.mockRejectedValue(new Error('Not found'));

      const health = await orchestrator.checkModelHealth('unknown');
      expect(health.healthy).toBe(false);
      expect(health.status).toBe('error');
    });
  });

  // ---- checkServiceHealth ----

  describe('checkServiceHealth', () => {
    it('should return healthy when service is running', async () => {
      await orchestrator.initialize();

      const health = await orchestrator.checkServiceHealth();
      expect(health.healthy).toBe(true);
      expect(health.endpoint).toBe('http://localhost:5273');
    });

    it('should return unhealthy before initialisation', async () => {
      const health = await orchestrator.checkServiceHealth();
      expect(health.healthy).toBe(false);
      expect(health.status).toBe('not_initialized');
    });
  });

  // ---- getDownloadProgress ----

  describe('getDownloadProgress', () => {
    it('should return null for unknown model', () => {
      expect(orchestrator.getDownloadProgress('nonexistent')).toBeNull();
    });

    it('should return progress after download starts', async () => {
      await orchestrator.downloadModel('phi-3.5-mini');
      const progress = orchestrator.getDownloadProgress('phi-3.5-mini');
      expect(progress).toBeDefined();
      expect(progress.progress).toBe(100);
    });
  });
});

/**
 * Create a testable orchestrator that mirrors the real SDK v0.9.0 API surface
 * but uses injected mocks.
 */
function createTestOrchestrator(mockManager, mockStorage) {
  const openaiClient = {
    chat: { completions: { create: vi.fn() } },
    models: { list: vi.fn().mockResolvedValue({ data: [] }) }
  };

  const orch = {
    manager: null,
    openaiClient: null,
    loadedModels: new Map(),
    initialized: false,
    _serviceUrl: null,
    _catalogCache: null,
    _catalogCacheTime: 0,
    _healthCache: null,
    _healthCacheTime: 0,
    _downloadProgress: new Map(),
    _healthFetch: vi.fn().mockResolvedValue({ ok: true }),

    async initialize() {
      if (this.initialized && this.manager) {
        return { endpoint: this._serviceUrl };
      }
      this.manager = mockManager;
      this.manager.startWebService();
      this._serviceUrl = this.manager.urls?.[0] || null;
      this.openaiClient = openaiClient;
      this.initialized = true;
      return { endpoint: this._serviceUrl };
    },

    async isServiceRunning() {
      if (!this.manager || !this._serviceUrl) return false;
      try {
        const res = await this._healthFetch(`${this._serviceUrl}/v1/models`);
        return res.ok;
      } catch {
        return false;
      }
    },

    _ensureManager() {
      if (!this.manager) {
        this.manager = mockManager;
      }
    },

    async listAvailableModels() {
      const now = Date.now();
      if (this._catalogCache && (now - this._catalogCacheTime) < 60000) {
        return this._catalogCache;
      }
      try {
        this._ensureManager();
        const models = await this.manager.catalog.getModels();
        const transformed = models.map(m => {
          const info = m.selectedVariant.modelInfo;
          return {
            id: m.id, alias: m.alias,
            description: `${m.alias} (${info.runtime?.deviceType || 'CPU'})`,
            deviceType: info.runtime?.deviceType || 'CPU',
            fileSizeMb: info.fileSizeMb || null,
            isCached: m.isCached,
            task: info.task || 'chat-completion',
            publisher: info.publisher || '',
            license: info.license || '',
            isCustom: false
          };
        });
        this._catalogCache = transformed;
        this._catalogCacheTime = now;
        return transformed;
      } catch {
        return this._catalogCache || [];
      }
    },

    async listLoadedModels() {
      try {
        this._ensureManager();
        const ids = await this.manager._modelLoadManager.listLoaded();
        return ids.map(id => ({ id, alias: id }));
      } catch {
        return Array.from(this.loadedModels.values());
      }
    },

    async downloadModel(alias) {
      this._ensureManager();
      const model = await this.manager.catalog.getModel(alias);
      if (model.isCached) {
        this._downloadProgress.set(alias, { progress: 100, status: 'complete' });
        return true;
      }
      this._downloadProgress.set(alias, { progress: 0, status: 'downloading' });
      try {
        await model.download((progress) => {
          this._downloadProgress.set(alias, { progress, status: 'downloading' });
        });
        this._downloadProgress.set(alias, { progress: 100, status: 'complete' });
        return true;
      } catch (error) {
        this._downloadProgress.set(alias, { progress: 0, status: 'error', error: error.message });
        throw error;
      }
    },

    getDownloadProgress(alias) {
      return this._downloadProgress.get(alias) || null;
    },

    async loadModel(modelId, alias) {
      await this.initialize();
      try {
        const model = await this.manager.catalog.getModel(alias);

        // Download if not cached
        if (!model.isCached) {
          const storageModel = mockStorage.getModel(modelId);
          if (storageModel) {
            mockStorage.saveModel({ ...storageModel, status: 'downloading', last_error: null, updated_at: Date.now() });
          }
          await this.downloadModel(alias);
        }

        await model.load();

        const info = model.selectedVariant.modelInfo;
        const modelInfo = {
          id: model.id, alias: model.alias,
          version: info.version,
          deviceType: info.runtime?.deviceType || 'CPU',
          executionProvider: info.runtime?.executionProvider || 'CPUExecutionProvider',
          fileSizeMb: info.fileSizeMb
        };
        this.loadedModels.set(modelId, modelInfo);

        const storageModel = mockStorage.getModel(modelId);
        if (storageModel) {
          mockStorage.saveModel({
            ...storageModel, status: 'running', endpoint: this._serviceUrl,
            foundry_id: modelInfo.id, foundry_alias: modelInfo.alias,
            version: modelInfo.version, deviceType: modelInfo.deviceType,
            executionProvider: modelInfo.executionProvider,
            last_error: null, last_heartbeat: Date.now(), updated_at: Date.now()
          });
        }
        return modelInfo;
      } catch (error) {
        const storageModel = mockStorage.getModel(modelId);
        if (storageModel) {
          mockStorage.saveModel({
            ...storageModel, status: 'error', last_error: error.message, updated_at: Date.now()
          });
        }
        throw error;
      }
    },

    async unloadModel(modelId, alias) {
      this._ensureManager();
      const model = await this.manager.catalog.getModel(alias);
      await model.selectedVariant.unload();
      this.loadedModels.delete(modelId);
      const storageModel = mockStorage.getModel(modelId);
      if (storageModel) {
        mockStorage.saveModel({
          ...storageModel, status: 'stopped', endpoint: null,
          last_heartbeat: Date.now(), updated_at: Date.now()
        });
      }
    },

    async checkModelHealth(aliasOrId) {
      try {
        this._ensureManager();
        const model = await this.manager.catalog.getModel(aliasOrId);
        const loaded = await model.isLoaded();
        return loaded
          ? { status: 'running', healthy: true, endpoint: this._serviceUrl }
          : { status: 'stopped', healthy: false, endpoint: this._serviceUrl };
      } catch {
        return { status: 'error', healthy: false, error: 'Model not found in catalog' };
      }
    },

    async checkServiceHealth() {
      if (!this.initialized || !this._serviceUrl) {
        return { status: 'not_initialized', healthy: false };
      }
      const now = Date.now();
      if (this._healthCache && (now - this._healthCacheTime) < 5000) {
        return this._healthCache;
      }
      try {
        const running = await this.isServiceRunning();
        const result = running
          ? { status: 'running', healthy: true, endpoint: this._serviceUrl, lastCheck: now }
          : { status: 'stopped', healthy: false };
        this._healthCache = result;
        this._healthCacheTime = now;
        return result;
      } catch (error) {
        const result = { status: 'error', healthy: false, error: error.message };
        this._healthCache = result;
        this._healthCacheTime = now;
        return result;
      }
    },

    getOpenAIClient() {
      return this.openaiClient;
    },

    getEndpoint() {
      return this._serviceUrl || null;
    },

    getLoadedModelInfo(modelId) {
      return this.loadedModels.get(modelId) || null;
    },

    getAllLoadedModels() {
      return Array.from(this.loadedModels.values());
    }
  };

  return orch;
}
