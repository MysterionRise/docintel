import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelManager } from '../model-manager';
import type { InferenceWorkerOutMessage } from '../types';

function createMockWorker() {
  const posted: unknown[] = [];
  const worker = {
    postMessage: vi.fn((msg: unknown) => posted.push(msg)),
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: ErrorEvent) => void) | null,
    terminate: vi.fn(),
  };

  function simulateMessage(msg: InferenceWorkerOutMessage) {
    worker.onmessage?.({ data: msg } as MessageEvent);
  }

  function simulateError(message: string) {
    worker.onerror?.({ message } as ErrorEvent);
  }

  return { worker: worker as unknown as Worker, posted, simulateMessage, simulateError };
}

describe('ModelManager', () => {
  let mock: ReturnType<typeof createMockWorker>;
  let manager: ModelManager;

  beforeEach(() => {
    mock = createMockWorker();
    manager = new ModelManager(() => mock.worker);
  });

  describe('initial state', () => {
    it('starts with idle status', () => {
      expect(manager.status).toBe('idle');
    });

    it('starts with model not loaded', () => {
      expect(manager.isLoaded()).toBe(false);
      expect(manager.modelStatus).toEqual({
        loaded: false,
        modelId: null,
        device: null,
        loadTimeMs: null,
      });
    });
  });

  describe('loadModel', () => {
    it('posts load-model message to worker', () => {
      manager.loadModel('test-model', 'q4', 'webgpu');

      expect(mock.worker.postMessage).toHaveBeenCalledWith({
        type: 'load-model',
        modelId: 'test-model',
        dtype: 'q4',
        device: 'webgpu',
      });
    });

    it('sets device on modelStatus immediately', () => {
      manager.loadModel('test-model', 'q4', 'wasm');

      expect(manager.modelStatus.device).toBe('wasm');
    });

    it('lazily creates worker on first call', () => {
      const factory = vi.fn(() => mock.worker);
      const mgr = new ModelManager(factory);

      expect(factory).not.toHaveBeenCalled();
      mgr.loadModel('m', 'q4', 'webgpu');
      expect(factory).toHaveBeenCalledOnce();
    });

    it('reuses the same worker on subsequent calls', () => {
      const factory = vi.fn(() => mock.worker);
      const mgr = new ModelManager(factory);

      mgr.loadModel('m1', 'q4', 'webgpu');
      mgr.loadModel('m2', 'q4', 'webgpu');
      expect(factory).toHaveBeenCalledOnce();
    });
  });

  describe('generate', () => {
    it('posts generate message with default maxTokens', () => {
      manager.generate([{ role: 'user', content: 'Hello' }]);

      expect(mock.worker.postMessage).toHaveBeenCalledWith({
        type: 'generate',
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 1024,
        temperature: undefined,
        topP: undefined,
      });
    });

    it('posts generate message with custom options', () => {
      manager.generate(
        [{ role: 'user', content: 'Hi' }],
        { maxTokens: 512, temperature: 0.8, topP: 0.95 },
      );

      expect(mock.worker.postMessage).toHaveBeenCalledWith({
        type: 'generate',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 512,
        temperature: 0.8,
        topP: 0.95,
      });
    });
  });

  describe('abort', () => {
    it('posts abort message to worker', () => {
      manager.abort();

      expect(mock.worker.postMessage).toHaveBeenCalledWith({ type: 'abort' });
    });
  });

  describe('unloadModel', () => {
    it('posts unload message and resets model status', async () => {
      manager.loadModel('test-model', 'q4', 'webgpu');
      mock.simulateMessage({ type: 'model-ready', modelId: 'test-model', loadTimeMs: 500 });

      await manager.unloadModel();

      expect(mock.worker.postMessage).toHaveBeenCalledWith({ type: 'unload' });
      expect(manager.modelStatus.loaded).toBe(false);
      expect(manager.modelStatus.modelId).toBeNull();
    });

    it('does nothing when no worker exists', async () => {
      // No loadModel call → no worker created
      await manager.unloadModel();
      expect(mock.worker.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('terminate', () => {
    it('terminates the worker and resets state', () => {
      manager.loadModel('m', 'q4', 'webgpu');
      manager.terminate();

      expect(mock.worker.terminate).toHaveBeenCalled();
      expect(manager.status).toBe('idle');
      expect(manager.isLoaded()).toBe(false);
    });

    it('does nothing when no worker exists', () => {
      manager.terminate(); // should not throw
      expect(manager.status).toBe('idle');
    });
  });

  describe('worker message handling', () => {
    it('updates status on status message', () => {
      const onStatusChange = vi.fn();
      manager.setCallbacks({ onStatusChange });
      manager.loadModel('m', 'q4', 'webgpu');

      mock.simulateMessage({ type: 'status', status: 'generating' });

      expect(manager.status).toBe('generating');
      expect(onStatusChange).toHaveBeenCalledWith('generating');
    });

    it('handles model-progress messages', () => {
      const onDownloadProgress = vi.fn();
      const onStatusChange = vi.fn();
      manager.setCallbacks({ onDownloadProgress, onStatusChange });
      manager.loadModel('m', 'q4', 'webgpu');

      mock.simulateMessage({
        type: 'model-progress',
        progress: 0.5,
        status: 'downloading',
        loaded: 500,
        total: 1000,
        file: 'model.bin',
      });

      expect(manager.status).toBe('downloading');
      expect(onDownloadProgress).toHaveBeenCalledWith({
        loaded: 500,
        total: 1000,
        name: 'model.bin',
      });
    });

    it('handles model-ready messages', () => {
      const onStatusChange = vi.fn();
      manager.setCallbacks({ onStatusChange });
      manager.loadModel('test-model', 'q4', 'webgpu');

      mock.simulateMessage({ type: 'model-ready', modelId: 'test-model', loadTimeMs: 1234 });

      expect(manager.status).toBe('ready');
      expect(manager.isLoaded()).toBe(true);
      expect(manager.modelStatus.modelId).toBe('test-model');
      expect(manager.modelStatus.loadTimeMs).toBe(1234);
    });

    it('handles model-error messages', () => {
      const onError = vi.fn();
      const onStatusChange = vi.fn();
      manager.setCallbacks({ onError, onStatusChange });
      manager.loadModel('m', 'q4', 'webgpu');

      mock.simulateMessage({ type: 'model-error', error: 'Out of memory' });

      expect(manager.status).toBe('error');
      expect(manager.isLoaded()).toBe(false);
      expect(onError).toHaveBeenCalledWith('Out of memory');
    });

    it('handles token messages', () => {
      const onToken = vi.fn();
      manager.setCallbacks({ onToken });
      manager.loadModel('m', 'q4', 'webgpu');

      mock.simulateMessage({ type: 'token', text: 'Hello' });

      expect(onToken).toHaveBeenCalledWith('Hello');
    });

    it('handles generation-done messages', () => {
      const onGenerationDone = vi.fn();
      manager.setCallbacks({ onGenerationDone });
      manager.loadModel('m', 'q4', 'webgpu');

      mock.simulateMessage({
        type: 'generation-done',
        fullText: 'Full output',
        tokensGenerated: 100,
        tokensPerSecond: 25,
      });

      expect(onGenerationDone).toHaveBeenCalledWith({
        tokensGenerated: 100,
        tokensPerSecond: 25,
        totalTimeMs: 4000, // 100/25 * 1000
      });
    });

    it('calculates totalTimeMs=0 when tokensGenerated is 0', () => {
      const onGenerationDone = vi.fn();
      manager.setCallbacks({ onGenerationDone });
      manager.loadModel('m', 'q4', 'webgpu');

      mock.simulateMessage({
        type: 'generation-done',
        fullText: '',
        tokensGenerated: 0,
        tokensPerSecond: 0,
      });

      expect(onGenerationDone).toHaveBeenCalledWith({
        tokensGenerated: 0,
        tokensPerSecond: 0,
        totalTimeMs: 0,
      });
    });
  });

  describe('worker error handling', () => {
    it('sets error status and calls onError on worker error', () => {
      const onError = vi.fn();
      const onStatusChange = vi.fn();
      manager.setCallbacks({ onError, onStatusChange });
      manager.loadModel('m', 'q4', 'webgpu');

      mock.simulateError('Script error');

      expect(manager.status).toBe('error');
      expect(onError).toHaveBeenCalledWith('Script error');
      expect(onStatusChange).toHaveBeenCalledWith('error');
    });
  });
});
