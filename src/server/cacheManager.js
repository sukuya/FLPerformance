import path from 'path';
import fs from 'fs';
import os from 'os';
import logger from './logger.js';

/**
 * Foundry Local configuration file path.
 * Located at ~/.foundry/foundry.config.json on all platforms.
 */
function getConfigPath() {
  return path.join(os.homedir(), '.foundry', 'foundry.config.json');
}

/**
 * Read the Foundry Local configuration file.
 * @returns {object} Parsed configuration object
 */
function readFoundryConfig() {
  const configPath = getConfigPath();
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Write the Foundry Local configuration file.
 * @param {object} config - Configuration object to write
 */
function writeFoundryConfig(config) {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

class CacheManager {
  constructor() {
    this.defaultCachePath = null;
  }

  /**
   * Get current cache directory location from foundry.config.json
   */
  async getCurrentLocation() {
    try {
      logger.info('Getting current cache location from config');
      const config = readFoundryConfig();
      const location = config.serviceSettings?.cacheDirectoryPath;

      if (!location) {
        throw new Error('cacheDirectoryPath not found in foundry config');
      }

      // Store default cache path on first call
      if (!this.defaultCachePath) {
        this.defaultCachePath = location;
        logger.info('Stored default cache path', { path: this.defaultCachePath });
      }

      return location;
    } catch (error) {
      logger.error('Failed to get cache location', { error: error.message });
      throw new Error(`Failed to get cache location: ${error.message}`);
    }
  }

  /**
   * Get default cache path (stored on first read)
   */
  getDefaultPath() {
    return this.defaultCachePath;
  }

  /**
   * Validate cache path to prevent path traversal and access to sensitive directories
   */
  validateCachePath(cachePath) {
    if (typeof cachePath !== 'string') {
      throw new Error('Cache path must be a non-empty string');
    }

    const trimmedPath = cachePath.trim();

    if (!trimmedPath) {
      throw new Error('Cache path must be a non-empty string');
    }

    // Check for null bytes which can be used for injection
    if (trimmedPath.includes('\0')) {
      throw new Error('Cache path contains invalid characters');
    }

    // Normalize and resolve to absolute path
    const normalized = path.resolve(trimmedPath);

    // Resolve symlinks to get the real path
    let realPath;
    try {
      realPath = fs.realpathSync(normalized);
    } catch (error) {
      // If path doesn't exist yet, use the normalized path
      // but verify parent directories
      const parentDir = path.dirname(normalized);
      try {
        realPath = fs.realpathSync(parentDir);
        realPath = path.join(realPath, path.basename(normalized));
      } catch (parentError) {
        // Parent doesn't exist either, use normalized
        realPath = normalized;
      }
    }

    // Additional security: prevent access to sensitive system directories
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

    for (const pattern of sensitivePatterns) {
      if (pattern.test(realPath)) {
        throw new Error('Cache path cannot point to system directories');
      }
    }

    return realPath;
  }

  /**
   * Switch to a different cache directory by updating foundry.config.json
   * @param {string} cachePath - Path to cache directory, or "default" to restore original
   */
  async switchCache(cachePath) {
    try {
      let targetPath = cachePath;

      // Capture default cache path BEFORE switching (if not already captured)
      if (!this.defaultCachePath) {
        await this.getCurrentLocation();
      }

      // Handle "default" keyword
      if (targetPath === 'default') {
        if (!this.defaultCachePath) {
          throw new Error('Default cache path not available');
        }
        targetPath = this.defaultCachePath;
      }

      // Validate and normalize path for cross-platform compatibility
      const normalizedPath = this.validateCachePath(targetPath);

      logger.info('Switching cache directory', { targetPath, normalizedPath });

      // Update foundry.config.json with new cache path
      const config = readFoundryConfig();
      config.serviceSettings.cacheDirectoryPath = normalizedPath;
      writeFoundryConfig(config);

      // Verify by re-reading the config
      const updated = readFoundryConfig();
      const newLocation = updated.serviceSettings?.cacheDirectoryPath || normalizedPath;

      logger.info('Cache directory switched', {
        requested: normalizedPath,
        actual: newLocation
      });

      return {
        success: true,
        location: newLocation,
        isDefault: newLocation === this.defaultCachePath
      };

    } catch (error) {
      logger.error('Failed to switch cache', { cachePath, error: error.message });

      // Mark validation errors with statusCode for proper HTTP response
      if (error.message.includes('Cache path') ||
          error.message.includes('system directories') ||
          error.message.includes('invalid characters')) {
        const validationError = new Error(error.message);
        validationError.statusCode = 400;
        throw validationError;
      }

      throw new Error(`Failed to switch cache: ${error.message}`);
    }
  }

  /**
   * List models in current cache by scanning the cache directory
   * and cross-referencing with the model info catalogue.
   */
  async listCacheModels() {
    try {
      logger.info('Listing models in cache');

      const config = readFoundryConfig();
      const cacheDir = config.serviceSettings?.cacheDirectoryPath;
      if (!cacheDir) {
        logger.warn('No cache directory configured');
        return [];
      }

      // Read the model info catalogue for ID-to-alias mapping
      const modelInfoPath = path.join(cacheDir, 'foundry.modelinfo.json');
      let modelInfoMap = new Map();
      try {
        const raw = fs.readFileSync(modelInfoPath, 'utf8');
        const catalog = JSON.parse(raw);
        if (catalog.models) {
          for (const m of catalog.models) {
            modelInfoMap.set(m.name, m.alias);
          }
        }
      } catch {
        logger.warn('Could not read model info catalogue; aliases will be derived from directory names');
      }

      // Scan publisher subdirectories in the cache (e.g. Microsoft/)
      const models = [];
      let entries;
      try {
        entries = fs.readdirSync(cacheDir, { withFileTypes: true });
      } catch {
        logger.warn('Cannot read cache directory', { cacheDir });
        return [];
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // Skip non-publisher directories (foundry.modelinfo.json is a file, not a dir)
        const publisherDir = path.join(cacheDir, entry.name);
        let modelDirs;
        try {
          modelDirs = fs.readdirSync(publisherDir, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const modelEntry of modelDirs) {
          if (!modelEntry.isDirectory()) continue;
          // Directory names look like "qwen2.5-0.5b-instruct-generic-cpu-4"
          // Model IDs look like "qwen2.5-0.5b-instruct-generic-cpu:4"
          // Convert: replace the last "-N" (version) with ":N"
          const dirName = modelEntry.name;
          const modelId = dirName.replace(/-(\d+)$/, ':$1');
          const alias = modelInfoMap.get(modelId) || dirName;

          models.push({
            alias,
            id: modelId,
            description: alias,
            source: 'cache'
          });
        }
      }

      logger.info('Cache models listed', { count: models.length });
      return models;

    } catch (error) {
      logger.error('Failed to list cache models', { error: error.message });
      logger.warn('Returning empty cache models list');
      return [];
    }
  }

  /**
   * Check if Foundry Local is available by verifying the config file exists
   */
  async checkFoundryAvailable() {
    try {
      const configPath = getConfigPath();
      fs.accessSync(configPath, fs.constants.R_OK);
      readFoundryConfig();
      return true;
    } catch (error) {
      logger.error('Foundry Local config not found', { error: error.message });
      return false;
    }
  }
}

export default new CacheManager();
