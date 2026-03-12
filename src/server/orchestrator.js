import { FoundryLocalManager } from 'foundry-local-sdk';
import OpenAI from 'openai';
import logger, { createServiceLogger } from './logger.js';
import storage from './storage.js';
import cacheManager from './cacheManager.js';

/** Run a promise with a timeout (ms). Rejects with a TimeoutError if exceeded. */
function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

class FoundryLocalOrchestrator {
  constructor() {
    this.manager = null;
    this.openaiClient = null;
    this.loadedModels = new Map(); // modelId -> model info
    this.initialized = false;
    this._healthCache = null;
    this._healthCacheTime = 0;
    this._catalogCache = null;
    this._catalogCacheTime = 0;
    this._serviceUrl = null;
    // Track download progress per model alias
    this._downloadProgress = new Map();
  }

  /**
   * Initialise the SDK and start the web service
   */
  async initialize() {
    if (this.initialized && this.manager) {
      logger.info('Orchestrator already initialised');
      return { endpoint: this._serviceUrl };
    }

    logger.info('Initialising Foundry Local SDK v0.9');

    try {
      // Create manager via the factory method (SDK v0.9 API)
      this.manager = FoundryLocalManager.create({ appName: 'FLPerformance' });

      // Start the embedded web service
      this.manager.startWebService();

      this._serviceUrl = this.manager.urls?.[0] || null;
      logger.info('Foundry Local web service started', { urls: this.manager.urls });

      // Create OpenAI-compatible client pointing at the local service
      if (this._serviceUrl) {
        this.openaiClient = new OpenAI({
          baseURL: `${this._serviceUrl}/v1`,
          apiKey: 'foundry-local'
        });
      }

      this.initialized = true;
      return { endpoint: this._serviceUrl };
    } catch (error) {
      logger.error('Failed to initialise Foundry Local', { error: error.message });
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Ensure the manager exists (for catalog-only operations that do not need the web service)
   */
  _ensureManager() {
    if (!this.manager) {
      this.manager = FoundryLocalManager.create({ appName: 'FLPerformance' });
    }
  }

  /**
   * Check if the web service is running
   */
  async isServiceRunning() {
    if (!this.manager || !this._serviceUrl) {
      return false;
    }
    try {
      const res = await fetch(`${this._serviceUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models from the SDK catalog (cached for 60 seconds)
   */
  async listAvailableModels() {
    const now = Date.now();
    if (this._catalogCache && (now - this._catalogCacheTime) < 60000) {
      logger.info('Returning cached model list', { count: this._catalogCache.length });
      return this._catalogCache;
    }

    try {
      this._ensureManager();

      const models = await this.manager.catalog.getModels();
      logger.info('Catalog models fetched', { count: models.length });

      const transformed = models.map(m => {
        const info = m.selectedVariant.modelInfo;
        return {
          id: m.id,
          alias: m.alias,
          description: `${m.alias} (${info.runtime?.deviceType || 'CPU'})`,
          displayName: info.displayName || m.alias,
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
    } catch (error) {
      logger.error('Failed to list catalog models', { error: error.message });
      // Return cached data if available, otherwise empty
      return this._catalogCache || [];
    }
  }

  /**
   * List currently loaded models via the web service
   */
  async listLoadedModels() {
    try {
      this._ensureManager();
      const loadedIds = await this.manager._modelLoadManager.listLoaded();
      logger.info('Loaded models fetched', { count: loadedIds.length });
      return loadedIds.map(id => ({ id, alias: id }));
    } catch (error) {
      logger.error('Failed to list loaded models', { error: error.message });
      return Array.from(this.loadedModels.values());
    }
  }

  /**
   * Get model info by alias
   */
  async getModelInfo(alias) {
    this._ensureManager();
    try {
      const model = await this.manager.catalog.getModel(alias);
      const info = model.selectedVariant.modelInfo;
      return {
        id: model.id,
        alias: model.alias,
        displayName: info.displayName || model.alias,
        deviceType: info.runtime?.deviceType || 'CPU',
        executionProvider: info.runtime?.executionProvider || 'CPUExecutionProvider',
        fileSizeMb: info.fileSizeMb || null,
        isCached: model.isCached,
        version: info.version
      };
    } catch (error) {
      logger.error('Failed to get model info', { alias, error: error.message });
      throw error;
    }
  }

  /**
   * Download a model with progress tracking.
   * Progress is stored in this._downloadProgress so the API can poll it.
   */
  async downloadModel(alias) {
    this._ensureManager();
    const serviceLogger = createServiceLogger(alias);

    try {
      const model = await this.manager.catalog.getModel(alias);

      if (model.isCached) {
        serviceLogger.info('Model already cached, skipping download', { alias });
        this._downloadProgress.set(alias, { progress: 100, status: 'complete' });
        return true;
      }

      serviceLogger.info('Starting model download', { alias, id: model.id });
      this._downloadProgress.set(alias, { progress: 0, status: 'downloading' });

      await model.download((progress) => {
        this._downloadProgress.set(alias, { progress, status: 'downloading' });
        serviceLogger.info('Download progress', { alias, progress: progress.toFixed(1) });
      });

      this._downloadProgress.set(alias, { progress: 100, status: 'complete' });
      serviceLogger.info('Model downloaded', { alias });
      return true;
    } catch (error) {
      this._downloadProgress.set(alias, { progress: 0, status: 'error', error: error.message });
      serviceLogger.error('Download failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get download progress for a model alias
   */
  getDownloadProgress(alias) {
    return this._downloadProgress.get(alias) || null;
  }

  /**
   * Load a model into the web service (downloads first if needed)
   */
  async loadModel(modelId, alias) {
    await this.initialize();
    const serviceLogger = createServiceLogger(alias);

    try {
      serviceLogger.info('Loading model', { modelId, alias });

      const model = await this.manager.catalog.getModel(alias);

      // Download if not cached
      if (!model.isCached) {
        serviceLogger.info('Model not cached, downloading first', { alias });
        const storageModel = storage.getModel(modelId);
        if (storageModel) {
          storage.saveModel({ ...storageModel, status: 'downloading', last_error: null, updated_at: Date.now() });
        }
        await this.downloadModel(alias);
      }

      // Load into the web service
      await model.load();
      serviceLogger.info('Model loaded into service', { alias, id: model.id });

      const info = model.selectedVariant.modelInfo;
      const modelInfo = {
        id: model.id,
        alias: model.alias,
        version: info.version,
        deviceType: info.runtime?.deviceType || 'CPU',
        executionProvider: info.runtime?.executionProvider || 'CPUExecutionProvider',
        fileSizeMb: info.fileSizeMb
      };

      this.loadedModels.set(modelId, modelInfo);

      // Update storage
      const storageModel = storage.getModel(modelId);
      if (storageModel) {
        storage.saveModel({
          ...storageModel,
          status: 'running',
          endpoint: this._serviceUrl,
          foundry_id: modelInfo.id,
          foundry_alias: modelInfo.alias,
          version: modelInfo.version,
          deviceType: modelInfo.deviceType,
          executionProvider: modelInfo.executionProvider,
          last_error: null,
          last_heartbeat: Date.now(),
          updated_at: Date.now()
        });
      }

      return modelInfo;
    } catch (error) {
      serviceLogger.error('Load failed', { error: error.message });

      const storageModel = storage.getModel(modelId);
      if (storageModel) {
        storage.saveModel({
          ...storageModel,
          status: 'error',
          last_error: error.message,
          updated_at: Date.now()
        });
      }
      throw error;
    }
  }

  /**
   * Unload a model from the web service
   */
  async unloadModel(modelId, alias) {
    this._ensureManager();
    const serviceLogger = createServiceLogger(alias);

    try {
      serviceLogger.info('Unloading model', { modelId, alias });

      const model = await this.manager.catalog.getModel(alias);
      await model.selectedVariant.unload();

      this.loadedModels.delete(modelId);

      const storageModel = storage.getModel(modelId);
      if (storageModel) {
        storage.saveModel({
          ...storageModel,
          status: 'stopped',
          endpoint: null,
          last_heartbeat: Date.now(),
          updated_at: Date.now()
        });
      }

      serviceLogger.info('Model unloaded', { modelId, alias });
    } catch (error) {
      serviceLogger.error('Unload failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Check health for a specific model
   */
  async checkModelHealth(aliasOrId) {
    try {
      this._ensureManager();
      const model = await this.manager.catalog.getModel(aliasOrId);
      const loaded = await model.isLoaded();

      if (!loaded) {
        return { status: 'stopped', healthy: false, endpoint: this._serviceUrl };
      }
      return { status: 'running', healthy: true, endpoint: this._serviceUrl, lastCheck: Date.now() };
    } catch {
      return { status: 'error', healthy: false, error: 'Model not found in catalog' };
    }
  }

  /**
   * Check overall service health (cached for 5 seconds)
   */
  async checkServiceHealth() {
    const now = Date.now();
    if (this._healthCache && (now - this._healthCacheTime) < 5000) {
      return this._healthCache;
    }

    if (!this.initialized || !this._serviceUrl) {
      return { status: 'not_initialized', healthy: false };
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
  }

  /**
   * Get OpenAI client for inference
   */
  getOpenAIClient() {
    if (!this.openaiClient) {
      throw new Error('Orchestrator not initialised. Call initialize() first.');
    }
    return this.openaiClient;
  }

  /**
   * Get service endpoint URL
   */
  getEndpoint() {
    return this._serviceUrl || null;
  }

  /**
   * Get loaded model info from local cache
   */
  getLoadedModelInfo(modelId) {
    return this.loadedModels.get(modelId) || null;
  }

  /**
   * Get all loaded models from local cache
   */
  getAllLoadedModels() {
    return Array.from(this.loadedModels.values());
  }

  /**
   * Cleanup: unload all models
   */
  async cleanup() {
    if (!this.initialized || !this.manager) {
      logger.info('Nothing to clean up');
      return;
    }

    try {
      logger.info('Cleaning up: unloading all models');
      const loaded = await this.listLoadedModels();

      for (const model of loaded) {
        try {
          await this.manager.catalog.getModel(model.alias).then(m => m.selectedVariant.unload());
          logger.info('Unloaded model', { id: model.id });
        } catch (error) {
          logger.error('Error unloading model', { id: model.id, error: error.message });
        }
      }

      this.loadedModels.clear();
      logger.info('Cleanup complete');
    } catch (error) {
      logger.error('Cleanup error', { error: error.message });
    }
  }
}

export default new FoundryLocalOrchestrator();
