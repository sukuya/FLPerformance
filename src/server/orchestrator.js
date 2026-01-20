import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import logger, { createServiceLogger } from './logger.js';
import storage from './storage.js';

const execAsync = promisify(exec);

class FoundryLocalOrchestrator {
  constructor() {
    this.services = new Map(); // modelId -> { process, endpoint, client }
    this.basePort = 5000;
    this.portCounter = 0;
  }

  /**
   * Check if Foundry Local CLI is available
   */
  async checkFoundryLocal() {
    try {
      // Note: Foundry Local may use different command names
      // Try common variants: foundry-local, foundry, fl
      const commands = ['foundry-local --version', 'foundry --version', 'fl --version'];
      
      for (const cmd of commands) {
        try {
          const { stdout } = await execAsync(cmd);
          logger.info('Foundry Local detected', { version: stdout.trim() });
          return true;
        } catch (err) {
          // Continue to next command
        }
      }
      
      throw new Error('Foundry Local not found in PATH');
    } catch (error) {
      logger.error('Foundry Local check failed', { error: error.message });
      throw error;
    }
  }

  /**
   * List available models from Foundry Local catalog
   */
  async listAvailableModels() {
    try {
      // Try to list models using CLI
      const { stdout } = await execAsync('foundry-local models list --json');
      const models = JSON.parse(stdout);
      logger.info('Available models fetched', { count: models.length });
      return models;
    } catch (error) {
      logger.warn('Could not fetch models from CLI, returning defaults', { error: error.message });
      
      // Return common model aliases as fallback
      return [
        { id: 'phi-3-mini-4k-instruct', alias: 'phi-3-mini', description: 'Phi-3 Mini 4K Instruct' },
        { id: 'phi-3-small-8k-instruct', alias: 'phi-3-small', description: 'Phi-3 Small 8K Instruct' },
        { id: 'phi-3-medium-4k-instruct', alias: 'phi-3-medium', description: 'Phi-3 Medium 4K Instruct' },
        { id: 'llama-3.2-1b-instruct', alias: 'llama-3.2-1b', description: 'Llama 3.2 1B Instruct' },
        { id: 'llama-3.2-3b-instruct', alias: 'llama-3.2-3b', description: 'Llama 3.2 3B Instruct' }
      ];
    }
  }

  /**
   * Start a Foundry Local service for a specific model
   * NOTE: Foundry Local's architecture may limit simultaneous services
   * This implementation attempts per-model services with dynamic port assignment
   */
  async startService(modelId, modelAlias) {
    const serviceLogger = createServiceLogger(modelId);
    
    try {
      // Check if service already running
      if (this.services.has(modelId)) {
        const existing = this.services.get(modelId);
        if (existing.process && !existing.process.killed) {
          serviceLogger.info('Service already running');
          return existing;
        }
      }

      // Assign port for this service
      const port = this.basePort + this.portCounter++;
      const endpoint = `http://localhost:${port}`;

      serviceLogger.info('Starting Foundry Local service', { port, modelAlias });

      // Start service using CLI
      // Command structure may vary based on actual Foundry Local CLI
      // This is a placeholder - adjust based on actual Foundry Local documentation
      const process = spawn('foundry-local', [
        'serve',
        '--model', modelAlias || modelId,
        '--port', port.toString(),
        '--api-key', 'local-key' // Placeholder for local auth
      ]);

      // Capture logs
      process.stdout.on('data', (data) => {
        serviceLogger.info('Service stdout', { data: data.toString().trim() });
        storage.saveLog('service', modelId, 'info', data.toString().trim());
      });

      process.stderr.on('data', (data) => {
        serviceLogger.error('Service stderr', { data: data.toString().trim() });
        storage.saveLog('service', modelId, 'error', data.toString().trim());
      });

      process.on('error', (error) => {
        serviceLogger.error('Service process error', { error: error.message });
        storage.updateModelStatus(modelId, 'error', null, error.message);
      });

      process.on('exit', (code) => {
        serviceLogger.info('Service exited', { code });
        storage.updateModelStatus(modelId, 'stopped');
        this.services.delete(modelId);
      });

      // Create OpenAI client for this endpoint
      const client = new OpenAI({
        baseURL: `${endpoint}/v1`,
        apiKey: 'local-key' // Foundry Local may not require actual auth for local use
      });

      const serviceInfo = {
        process,
        endpoint,
        port,
        client,
        modelId,
        modelAlias
      };

      this.services.set(modelId, serviceInfo);

      // Wait for service to be ready (with timeout)
      await this.waitForService(endpoint, 30000);

      // Update status
      storage.updateModelStatus(modelId, 'running', endpoint);
      serviceLogger.info('Service started successfully', { endpoint });

      return serviceInfo;

    } catch (error) {
      serviceLogger.error('Failed to start service', { error: error.message });
      storage.updateModelStatus(modelId, 'error', null, error.message);
      throw error;
    }
  }

  /**
   * Wait for service to become ready
   */
  async waitForService(endpoint, timeout = 30000) {
    const startTime = Date.now();
    const client = new OpenAI({
      baseURL: `${endpoint}/v1`,
      apiKey: 'local-key'
    });

    while (Date.now() - startTime < timeout) {
      try {
        // Try to list models as health check
        await client.models.list();
        logger.info('Service is ready', { endpoint });
        return true;
      } catch (error) {
        // Service not ready yet, wait and retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error(`Service did not become ready within ${timeout}ms`);
  }

  /**
   * Load/download model (Foundry Local handles this automatically on first use)
   */
  async loadModel(modelId) {
    const serviceLogger = createServiceLogger(modelId);
    
    try {
      serviceLogger.info('Loading model (Foundry Local handles download/cache)');
      
      // Foundry Local automatically downloads and caches models on first inference
      // We can verify by making a test inference request
      const service = this.services.get(modelId);
      if (!service) {
        throw new Error('Service not started for this model');
      }

      // Test inference to trigger download if needed
      const response = await service.client.chat.completions.create({
        model: service.modelAlias || modelId,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });

      serviceLogger.info('Model loaded successfully', { 
        modelId,
        testResponse: response.choices[0]?.message?.content 
      });
      
      storage.updateModelStatus(modelId, 'running', service.endpoint);
      return true;

    } catch (error) {
      serviceLogger.error('Failed to load model', { error: error.message });
      storage.updateModelStatus(modelId, 'error', null, error.message);
      throw error;
    }
  }

  /**
   * Stop a service
   */
  async stopService(modelId) {
    const serviceLogger = createServiceLogger(modelId);
    
    try {
      const service = this.services.get(modelId);
      if (!service || !service.process) {
        serviceLogger.warn('No service to stop');
        return;
      }

      serviceLogger.info('Stopping service');
      
      // Kill the process
      service.process.kill('SIGTERM');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Force kill if still running
      if (!service.process.killed) {
        service.process.kill('SIGKILL');
      }

      this.services.delete(modelId);
      storage.updateModelStatus(modelId, 'stopped');
      
      serviceLogger.info('Service stopped');

    } catch (error) {
      serviceLogger.error('Failed to stop service', { error: error.message });
      throw error;
    }
  }

  /**
   * Get service info
   */
  getService(modelId) {
    return this.services.get(modelId);
  }

  /**
   * Check service health
   */
  async checkServiceHealth(modelId) {
    try {
      const service = this.services.get(modelId);
      if (!service || !service.client) {
        return { status: 'stopped', healthy: false };
      }

      // Try a health check request
      await service.client.models.list();
      
      storage.updateModelStatus(modelId, 'running', service.endpoint);
      
      return { 
        status: 'running', 
        healthy: true,
        endpoint: service.endpoint,
        lastCheck: Date.now()
      };

    } catch (error) {
      storage.updateModelStatus(modelId, 'error', null, error.message);
      return { 
        status: 'error', 
        healthy: false,
        error: error.message 
      };
    }
  }

  /**
   * Stop all services (cleanup)
   */
  async stopAllServices() {
    const promises = Array.from(this.services.keys()).map(modelId => 
      this.stopService(modelId).catch(err => 
        logger.error('Error stopping service', { modelId, error: err.message })
      )
    );
    await Promise.all(promises);
    logger.info('All services stopped');
  }
}

export default new FoundryLocalOrchestrator();
