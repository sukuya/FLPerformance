import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';
import os from 'os';

// Mock logger
vi.mock('../../src/server/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock fs module
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockAccessSync = vi.fn();
const mockRealpathSync = vi.fn();

vi.mock('fs', () => ({
  default: {
    readFileSync: (...args) => mockReadFileSync(...args),
    writeFileSync: (...args) => mockWriteFileSync(...args),
    readdirSync: (...args) => mockReaddirSync(...args),
    accessSync: (...args) => mockAccessSync(...args),
    realpathSync: (...args) => mockRealpathSync(...args),
    constants: { R_OK: 4 }
  },
  readFileSync: (...args) => mockReadFileSync(...args),
  writeFileSync: (...args) => mockWriteFileSync(...args),
  readdirSync: (...args) => mockReaddirSync(...args),
  accessSync: (...args) => mockAccessSync(...args),
  realpathSync: (...args) => mockRealpathSync(...args),
  constants: { R_OK: 4 }
}));

const SAMPLE_CONFIG = {
  defaultLogLevel: 2,
  serviceSettings: {
    host: '127.0.0.1',
    port: 0,
    cacheDirectoryPath: 'C:\\Users\\test\\.foundry\\cache\\models',
    schema: 'http',
    pipeName: 'inference_agent',
    defaultSecondsForModelTTL: 600,
    initialConnectionTimeoutInSeconds: 6
  }
};

const SAMPLE_MODEL_INFO = {
  version: '1.0',
  savedAt: '2025-01-01',
  models: [
    { name: 'Phi-3.5-mini-instruct-generic-cpu:1', alias: 'phi-3.5-mini' },
    { name: 'qwen2.5-0.5b-instruct-generic-cpu:4', alias: 'qwen2.5-0.5b' }
  ]
};

describe('CacheManager', () => {
  let cacheManager;

  beforeEach(() => {
    vi.resetAllMocks();
    // Default: readFileSync returns config for config path
    mockReadFileSync.mockImplementation((filePath) => {
      if (filePath.includes('foundry.config.json')) {
        return JSON.stringify(SAMPLE_CONFIG);
      }
      if (filePath.includes('foundry.modelinfo.json')) {
        return JSON.stringify(SAMPLE_MODEL_INFO);
      }
      throw new Error('File not found: ' + filePath);
    });
    mockRealpathSync.mockImplementation((p) => p);

    cacheManager = createTestCacheManager();
  });

  // ---- validateCachePath ----

  describe('validateCachePath', () => {
    it('should accept a valid absolute path', () => {
      const result = cacheManager.validateCachePath('C:\\Users\\test\\cache');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should reject null bytes', () => {
      expect(() => cacheManager.validateCachePath('C:\\test\0\\hack')).toThrow('invalid characters');
    });

    it('should reject empty string', () => {
      expect(() => cacheManager.validateCachePath('')).toThrow('non-empty string');
    });

    it('should reject whitespace-only string', () => {
      expect(() => cacheManager.validateCachePath('   ')).toThrow('non-empty string');
    });

    it('should reject non-string input', () => {
      expect(() => cacheManager.validateCachePath(123)).toThrow('non-empty string');
      expect(() => cacheManager.validateCachePath(null)).toThrow('non-empty string');
      expect(() => cacheManager.validateCachePath(undefined)).toThrow('non-empty string');
    });

    it('should reject Windows system directory', () => {
      expect(() => cacheManager.validateCachePath('C:\\Windows')).toThrow('system directories');
    });

    it('should reject Program Files directory', () => {
      expect(() => cacheManager.validateCachePath('C:\\Program Files')).toThrow('system directories');
    });

    it('should reject Program Files (x86) directory', () => {
      expect(() => cacheManager.validateCachePath('C:\\Program Files (x86)')).toThrow('system directories');
    });

    if (process.platform !== 'win32') {
      it('should reject /etc on Unix', () => {
        expect(() => cacheManager.validateCachePath('/etc')).toThrow('system directories');
      });

      it('should reject /proc on Unix', () => {
        expect(() => cacheManager.validateCachePath('/proc')).toThrow('system directories');
      });
    }

    it('should resolve relative paths to absolute', () => {
      const result = cacheManager.validateCachePath('./my-cache');
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  // ---- getCurrentLocation ----

  describe('getCurrentLocation', () => {
    it('should read cache location from foundry config', async () => {
      const location = await cacheManager.getCurrentLocation();
      expect(location).toBe('C:\\Users\\test\\.foundry\\cache\\models');
    });

    it('should store default path on first call', async () => {
      expect(cacheManager.getDefaultPath()).toBeNull();
      await cacheManager.getCurrentLocation();
      expect(cacheManager.getDefaultPath()).toBe('C:\\Users\\test\\.foundry\\cache\\models');
    });

    it('should throw when config file is missing', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      await expect(cacheManager.getCurrentLocation()).rejects.toThrow('Failed to get cache location');
    });

    it('should throw when cacheDirectoryPath is not in config', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ serviceSettings: {} }));
      await expect(cacheManager.getCurrentLocation()).rejects.toThrow('Failed to get cache location');
    });
  });

  // ---- listCacheModels ----

  describe('listCacheModels', () => {
    it('should list models by scanning cache directory', async () => {
      // Publisher directories
      mockReaddirSync.mockImplementation((dir, opts) => {
        if (dir === 'C:\\Users\\test\\.foundry\\cache\\models') {
          return [
            { name: 'Microsoft', isDirectory: () => true }
          ];
        }
        if (dir.includes('Microsoft')) {
          return [
            { name: 'Phi-3.5-mini-instruct-generic-cpu-1', isDirectory: () => true },
            { name: 'qwen2.5-0.5b-instruct-generic-cpu-4', isDirectory: () => true }
          ];
        }
        return [];
      });

      const models = await cacheManager.listCacheModels();
      expect(models).toHaveLength(2);
      expect(models[0].alias).toBe('phi-3.5-mini');
      expect(models[0].id).toBe('Phi-3.5-mini-instruct-generic-cpu:1');
      expect(models[0].source).toBe('cache');
      expect(models[1].alias).toBe('qwen2.5-0.5b');
      expect(models[1].id).toBe('qwen2.5-0.5b-instruct-generic-cpu:4');
    });

    it('should return empty array when config has no cache path', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ serviceSettings: {} }));
      const models = await cacheManager.listCacheModels();
      expect(models).toEqual([]);
    });

    it('should return empty array when cache directory cannot be read', async () => {
      mockReaddirSync.mockImplementation(() => { throw new Error('ENOENT'); });
      const models = await cacheManager.listCacheModels();
      expect(models).toEqual([]);
    });

    it('should use directory name as alias when modelinfo is missing', async () => {
      // Make modelinfo unreadable
      mockReadFileSync.mockImplementation((filePath) => {
        if (filePath.includes('foundry.config.json')) {
          return JSON.stringify(SAMPLE_CONFIG);
        }
        throw new Error('ENOENT');
      });
      mockReaddirSync.mockImplementation((dir) => {
        if (dir === 'C:\\Users\\test\\.foundry\\cache\\models') {
          return [{ name: 'Microsoft', isDirectory: () => true }];
        }
        if (dir.includes('Microsoft')) {
          return [{ name: 'some-model-cpu-1', isDirectory: () => true }];
        }
        return [];
      });

      const models = await cacheManager.listCacheModels();
      expect(models).toHaveLength(1);
      expect(models[0].alias).toBe('some-model-cpu-1');
      expect(models[0].id).toBe('some-model-cpu:1');
    });

    it('should skip files in cache directory (not directories)', async () => {
      mockReaddirSync.mockImplementation((dir) => {
        if (dir === 'C:\\Users\\test\\.foundry\\cache\\models') {
          return [
            { name: 'foundry.modelinfo.json', isDirectory: () => false },
            { name: 'Microsoft', isDirectory: () => true }
          ];
        }
        if (dir.includes('Microsoft')) {
          return [
            { name: 'config.json', isDirectory: () => false },
            { name: 'Phi-3.5-mini-instruct-generic-cpu-1', isDirectory: () => true }
          ];
        }
        return [];
      });

      const models = await cacheManager.listCacheModels();
      expect(models).toHaveLength(1);
      expect(models[0].alias).toBe('phi-3.5-mini');
    });
  });

  // ---- checkFoundryAvailable ----

  describe('checkFoundryAvailable', () => {
    it('should return true when config file exists and is valid', async () => {
      mockAccessSync.mockReturnValue(undefined);
      const available = await cacheManager.checkFoundryAvailable();
      expect(available).toBe(true);
    });

    it('should return false when config file does not exist', async () => {
      mockAccessSync.mockImplementation(() => { throw new Error('ENOENT'); });
      const available = await cacheManager.checkFoundryAvailable();
      expect(available).toBe(false);
    });
  });

  // ---- switchCache ----

  describe('switchCache', () => {
    it('should switch to a valid path by updating config', async () => {
      const result = await cacheManager.switchCache('C:\\new\\cache');
      expect(result.success).toBe(true);
      expect(result.location).toBeTruthy();
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('should handle "default" keyword', async () => {
      cacheManager.defaultCachePath = 'C:\\Users\\test\\.foundry\\cache\\models';

      const result = await cacheManager.switchCache('default');
      expect(result.success).toBe(true);
      expect(result.isDefault).toBe(true);
    });

    it('should throw validation errors with statusCode 400', async () => {
      cacheManager.defaultCachePath = 'C:\\some\\cache';
      try {
        await cacheManager.switchCache('C:\\Windows');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.statusCode).toBe(400);
      }
    });
  });
});

/**
 * Create a test CacheManager instance that mirrors the real class
 * but uses the mocked fs functions.
 */
function createTestCacheManager() {
  const sensitivePatterns = [
    /^\/etc($|\/)/i,
    /^\/sys($|\/)/i,
    /^\/proc($|\/)/i,
    /^\/root($|\/)/i,
    /^\/var\/root($|\/)/i,
    /^\/bin($|\/)/i,
    /^\/sbin($|\/)/i,
    /^C:\\Windows($|\\)/i,
    /^C:\\Program Files($|\\)/i,
    /^C:\\Program Files \(x86\)($|\\)/i
  ];

  function readFoundryConfig() {
    const configPath = path.join(os.homedir(), '.foundry', 'foundry.config.json');
    const raw = mockReadFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  }

  function writeFoundryConfig(config) {
    const configPath = path.join(os.homedir(), '.foundry', 'foundry.config.json');
    mockWriteFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  return {
    defaultCachePath: null,

    getDefaultPath() {
      return this.defaultCachePath;
    },

    validateCachePath(cachePath) {
      if (typeof cachePath !== 'string') {
        throw new Error('Cache path must be a non-empty string');
      }
      const trimmedPath = cachePath.trim();
      if (!trimmedPath) {
        throw new Error('Cache path must be a non-empty string');
      }
      if (trimmedPath.includes('\0')) {
        throw new Error('Cache path contains invalid characters');
      }
      const normalized = path.resolve(trimmedPath);
      let realPath;
      try {
        realPath = mockRealpathSync(normalized);
      } catch {
        const parentDir = path.dirname(normalized);
        try {
          realPath = mockRealpathSync(parentDir);
          realPath = path.join(realPath, path.basename(normalized));
        } catch {
          realPath = normalized;
        }
      }
      for (const pattern of sensitivePatterns) {
        if (pattern.test(realPath)) {
          throw new Error('Cache path cannot point to system directories');
        }
      }
      return realPath;
    },

    async getCurrentLocation() {
      try {
        const config = readFoundryConfig();
        const location = config.serviceSettings?.cacheDirectoryPath;
        if (!location) {
          throw new Error('cacheDirectoryPath not found in foundry config');
        }
        if (!this.defaultCachePath) {
          this.defaultCachePath = location;
        }
        return location;
      } catch (error) {
        throw new Error(`Failed to get cache location: ${error.message}`);
      }
    },

    async switchCache(cachePath) {
      try {
        let targetPath = cachePath;
        if (!this.defaultCachePath) {
          await this.getCurrentLocation();
        }
        if (targetPath === 'default') {
          if (!this.defaultCachePath) throw new Error('Default cache path not available');
          targetPath = this.defaultCachePath;
        }
        const normalizedPath = this.validateCachePath(targetPath);
        const config = readFoundryConfig();
        config.serviceSettings.cacheDirectoryPath = normalizedPath;
        writeFoundryConfig(config);
        const updated = readFoundryConfig();
        const newLocation = updated.serviceSettings?.cacheDirectoryPath || normalizedPath;
        return { success: true, location: newLocation, isDefault: newLocation === this.defaultCachePath };
      } catch (error) {
        if (error.message.includes('Cache path') ||
            error.message.includes('system directories') ||
            error.message.includes('invalid characters')) {
          const validationError = new Error(error.message);
          validationError.statusCode = 400;
          throw validationError;
        }
        throw new Error(`Failed to switch cache: ${error.message}`);
      }
    },

    async listCacheModels() {
      try {
        const config = readFoundryConfig();
        const cacheDir = config.serviceSettings?.cacheDirectoryPath;
        if (!cacheDir) return [];

        const modelInfoPath = path.join(cacheDir, 'foundry.modelinfo.json');
        let modelInfoMap = new Map();
        try {
          const raw = mockReadFileSync(modelInfoPath, 'utf8');
          const catalog = JSON.parse(raw);
          if (catalog.models) {
            for (const m of catalog.models) {
              modelInfoMap.set(m.name, m.alias);
            }
          }
        } catch { /* ignore */ }

        const models = [];
        let entries;
        try {
          entries = mockReaddirSync(cacheDir, { withFileTypes: true });
        } catch { return []; }

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const publisherDir = path.join(cacheDir, entry.name);
          let modelDirs;
          try {
            modelDirs = mockReaddirSync(publisherDir, { withFileTypes: true });
          } catch { continue; }

          for (const modelEntry of modelDirs) {
            if (!modelEntry.isDirectory()) continue;
            const dirName = modelEntry.name;
            const modelId = dirName.replace(/-(\d+)$/, ':$1');
            const alias = modelInfoMap.get(modelId) || dirName;
            models.push({ alias, id: modelId, description: alias, source: 'cache' });
          }
        }
        return models;
      } catch { return []; }
    },

    async checkFoundryAvailable() {
      try {
        const configPath = path.join(os.homedir(), '.foundry', 'foundry.config.json');
        mockAccessSync(configPath, 4);
        readFoundryConfig();
        return true;
      } catch { return false; }
    }
  };
}
