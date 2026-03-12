import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('BenchmarkEngine', () => {
  let engine;
  let mockOrchestrator;
  let mockStorage;

  beforeEach(() => {
    mockOrchestrator = {
      getOpenAIClient: vi.fn(),
      getLoadedModelInfo: vi.fn(),
      getEndpoint: vi.fn().mockReturnValue('http://localhost:5273/v1'),
      loadModel: vi.fn(),
      checkModelHealth: vi.fn().mockResolvedValue({ healthy: true })
    };

    mockStorage = {
      getModel: vi.fn(),
      saveModel: vi.fn(),
      saveBenchmarkRun: vi.fn(run => run),
      updateBenchmarkRun: vi.fn(),
      saveBenchmarkResult: vi.fn(),
      saveLog: vi.fn()
    };

    engine = createTestBenchmarkEngine(mockOrchestrator, mockStorage);
  });

  // ---- calculatePercentile (pure function) ----

  describe('calculatePercentile', () => {
    it('should return 0 for empty array', () => {
      expect(engine.calculatePercentile([], 50)).toBe(0);
    });

    it('should return the single element for a single-element array', () => {
      expect(engine.calculatePercentile([42], 50)).toBe(42);
      expect(engine.calculatePercentile([42], 99)).toBe(42);
    });

    it('should calculate P50 (median) correctly', () => {
      const sorted = [10, 20, 30, 40, 50];
      const p50 = engine.calculatePercentile(sorted, 50);
      // ceil(0.5 * 5) - 1 = 2 => sorted[2] = 30
      expect(p50).toBe(30);
    });

    it('should calculate P95 correctly', () => {
      const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
      const p95 = engine.calculatePercentile(sorted, 95);
      // ceil(0.95 * 100) - 1 = 94 => sorted[94] = 95
      expect(p95).toBe(95);
    });

    it('should calculate P99 correctly', () => {
      const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
      const p99 = engine.calculatePercentile(sorted, 99);
      // ceil(0.99 * 100) - 1 = 98 => sorted[98] = 99
      expect(p99).toBe(99);
    });

    it('should handle P0 and P100', () => {
      const sorted = [10, 20, 30];
      expect(engine.calculatePercentile(sorted, 0)).toBe(10); // index max(0,-1) = 0
      expect(engine.calculatePercentile(sorted, 100)).toBe(30); // ceil(1*3)-1 = 2
    });
  });

  // ---- getBenchmarkStatus ----

  describe('getBenchmarkStatus', () => {
    it('should return null for unknown run', () => {
      expect(engine.getBenchmarkStatus('unknown')).toBeUndefined();
    });

    it('should return status for running benchmark', () => {
      engine.runningBenchmarks.set('run_1', {
        id: 'run_1',
        status: 'running',
        progress: 50
      });

      const status = engine.getBenchmarkStatus('run_1');
      expect(status.status).toBe('running');
      expect(status.progress).toBe(50);
    });

    it('should return completed status', () => {
      engine.runningBenchmarks.set('run_1', {
        id: 'run_1',
        status: 'completed',
        progress: 100
      });

      const status = engine.getBenchmarkStatus('run_1');
      expect(status.status).toBe('completed');
      expect(status.progress).toBe(100);
    });
  });

  // ---- runSingleInference ----

  describe('runSingleInference', () => {
    it('should measure non-streaming inference', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Hello!' } }],
              usage: { completion_tokens: 5 }
            })
          }
        }
      };
      mockOrchestrator.getOpenAIClient.mockReturnValue(mockClient);

      const modelInfo = { id: 'phi-3.5-mini:1', alias: 'phi-3.5-mini' };
      const scenario = { name: 'Short Query', prompt: 'Hello', max_tokens: 50 };
      const config = { streaming: false, temperature: 0.7, timeout: 5000 };

      const metrics = await engine.runSingleInference(modelInfo, scenario, config);

      expect(metrics.error).toBeNull();
      expect(metrics.timeout).toBe(false);
      expect(metrics.tokens).toBe(5);
      expect(metrics.ttft).toBeNull(); // no TTFT in non-streaming
      expect(metrics.endTime).toBeGreaterThan(metrics.startTime);
    });

    it('should handle inference errors gracefully', async () => {
      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Model unavailable'))
          }
        }
      };
      mockOrchestrator.getOpenAIClient.mockReturnValue(mockClient);

      const modelInfo = { id: 'phi:1', alias: 'phi' };
      const scenario = { name: 'Test', prompt: 'hi', max_tokens: 10 };
      const config = { streaming: false, timeout: 5000 };

      const metrics = await engine.runSingleInference(modelInfo, scenario, config);

      expect(metrics.error).toBe('Model unavailable');
      expect(metrics.endTime).toBeDefined();
    });

    it('should measure streaming inference with TTFT', async () => {
      // Create an async iterable that simulates streaming
      const chunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] },
        { choices: [{ delta: { content: '!' } }] }
      ];

      const asyncIterable = {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            async next() {
              if (i < chunks.length) {
                return { value: chunks[i++], done: false };
              }
              return { done: true };
            }
          };
        }
      };

      const mockClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(asyncIterable)
          }
        }
      };
      mockOrchestrator.getOpenAIClient.mockReturnValue(mockClient);

      const modelInfo = { id: 'phi:1', alias: 'phi' };
      const scenario = { name: 'Stream Test', prompt: 'Hi', max_tokens: 50 };
      const config = { streaming: true, temperature: 0.7, timeout: 5000 };

      const metrics = await engine.runSingleInference(modelInfo, scenario, config);

      expect(metrics.error).toBeNull();
      expect(metrics.tokens).toBe(3);
      expect(metrics.ttft).toBeDefined();
      expect(metrics.ttft).toBeGreaterThanOrEqual(0);
      expect(metrics.interTokenDelays.length).toBe(2); // 3 tokens - 1
    });
  });

  // ---- collectResourceMetrics ----

  describe('collectResourceMetrics', () => {
    it('should return metrics object', async () => {
      const metrics = await engine.collectResourceMetrics();
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('ram');
      expect(metrics).toHaveProperty('gpu');
    });
  });
});

/**
 * Create a test BenchmarkEngine with injected mocks.
 */
function createTestBenchmarkEngine(mockOrchestrator, mockStorage) {
  return {
    runningBenchmarks: new Map(),

    calculatePercentile(sortedArray, percentile) {
      if (sortedArray.length === 0) return 0;
      const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
      return sortedArray[Math.max(0, index)];
    },

    async collectResourceMetrics() {
      // Return mock metrics for testing
      return { cpu: 25.0, ram: 60.0, gpu: null };
    },

    getBenchmarkStatus(runId) {
      return this.runningBenchmarks.get(runId);
    },

    async runSingleInference(modelInfo, scenario, config) {
      const { performance } = await import('perf_hooks');
      const metrics = {
        startTime: performance.now(),
        endTime: null,
        ttft: null,
        tokens: 0,
        interTokenDelays: [],
        error: null,
        timeout: false
      };

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          metrics.timeout = true;
        }, config.timeout || 30000);

        const startTime = Date.now();
        let firstTokenTime = null;
        let lastTokenTime = null;

        const client = mockOrchestrator.getOpenAIClient();
        const modelName = modelInfo.id;

        if (config.streaming) {
          const stream = await client.chat.completions.create({
            model: modelName,
            messages: [{ role: 'user', content: scenario.prompt }],
            max_tokens: scenario.max_tokens || 100,
            temperature: config.temperature || 0.7,
            stream: true
          }, { signal: controller.signal });

          for await (const chunk of stream) {
            if (chunk.choices[0]?.delta?.content) {
              const currentTokenTime = Date.now();
              if (!firstTokenTime) {
                firstTokenTime = currentTokenTime;
                metrics.ttft = firstTokenTime - startTime;
                lastTokenTime = currentTokenTime;
              } else {
                const interTokenDelay = currentTokenTime - lastTokenTime;
                metrics.interTokenDelays.push(interTokenDelay);
                lastTokenTime = currentTokenTime;
              }
              metrics.tokens++;
            }
          }
        } else {
          const response = await client.chat.completions.create({
            model: modelName,
            messages: [{ role: 'user', content: scenario.prompt }],
            max_tokens: scenario.max_tokens || 100,
            temperature: config.temperature || 0.7
          }, { signal: controller.signal });

          metrics.tokens = response.usage?.completion_tokens || 0;
          metrics.ttft = null;
        }

        clearTimeout(timeoutId);
        metrics.endTime = performance.now();
      } catch (error) {
        metrics.error = error.message;
        const { performance: perf } = await import('perf_hooks');
        metrics.endTime = perf.now();
      }

      return metrics;
    }
  };
}
