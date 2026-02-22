import type {
  InferenceStatus,
  InferenceWorkerInMessage,
  InferenceWorkerOutMessage,
  ModelStatus,
  ModelDownloadProgress,
  GenerationStats,
} from './types';

export interface ModelManagerCallbacks {
  onStatusChange?: (status: InferenceStatus) => void;
  onDownloadProgress?: (progress: ModelDownloadProgress) => void;
  onToken?: (text: string) => void;
  onGenerationDone?: (stats: GenerationStats) => void;
  onError?: (error: string) => void;
}

export class ModelManager {
  private worker: Worker | null = null;
  private workerFactory: () => Worker;
  private callbacks: ModelManagerCallbacks = {};
  private _status: InferenceStatus = 'idle';
  private _modelStatus: ModelStatus = { loaded: false, modelId: null, device: null, loadTimeMs: null };

  constructor(workerFactory: () => Worker) {
    this.workerFactory = workerFactory;
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.worker.onmessage = (e: MessageEvent<InferenceWorkerOutMessage>) => this.handleMessage(e.data);
      this.worker.onerror = (e) => {
        this._status = 'error';
        this.callbacks.onError?.(e.message ?? 'Worker error');
        this.callbacks.onStatusChange?.('error');
      };
    }
    return this.worker;
  }

  private handleMessage(msg: InferenceWorkerOutMessage) {
    switch (msg.type) {
      case 'status':
        this._status = msg.status;
        this.callbacks.onStatusChange?.(msg.status);
        break;

      case 'model-progress':
        this._status = 'downloading';
        this.callbacks.onStatusChange?.('downloading');
        this.callbacks.onDownloadProgress?.({
          loaded: msg.loaded,
          total: msg.total,
          name: msg.file,
        });
        break;

      case 'model-ready':
        this._status = 'ready';
        this._modelStatus = {
          loaded: true,
          modelId: msg.modelId,
          device: null, // Set by loadModel caller
          loadTimeMs: msg.loadTimeMs,
        };
        this.callbacks.onStatusChange?.('ready');
        break;

      case 'model-error':
        this._status = 'error';
        this._modelStatus = { loaded: false, modelId: null, device: null, loadTimeMs: null };
        this.callbacks.onError?.(msg.error);
        this.callbacks.onStatusChange?.('error');
        break;

      case 'token':
        this.callbacks.onToken?.(msg.text);
        break;

      case 'generation-done':
        this.callbacks.onGenerationDone?.({
          tokensGenerated: msg.tokensGenerated,
          tokensPerSecond: msg.tokensPerSecond,
          totalTimeMs: msg.tokensGenerated > 0 ? (msg.tokensGenerated / msg.tokensPerSecond) * 1000 : 0,
        });
        break;
    }
  }

  setCallbacks(callbacks: ModelManagerCallbacks) {
    this.callbacks = callbacks;
  }

  loadModel(modelId: string, dtype: string, device: 'webgpu' | 'wasm') {
    this._modelStatus = { ...this._modelStatus, device };
    const msg: InferenceWorkerInMessage = { type: 'load-model', modelId, dtype, device };
    this.getWorker().postMessage(msg);
  }

  generate(
    messages: Array<{ role: string; content: string }>,
    options?: { maxTokens?: number; temperature?: number; topP?: number },
  ) {
    const msg: InferenceWorkerInMessage = {
      type: 'generate',
      messages,
      maxTokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature,
      topP: options?.topP,
    };
    this.getWorker().postMessage(msg);
  }

  abort() {
    const msg: InferenceWorkerInMessage = { type: 'abort' };
    this.getWorker().postMessage(msg);
  }

  async unloadModel() {
    if (this.worker) {
      const msg: InferenceWorkerInMessage = { type: 'unload' };
      this.worker.postMessage(msg);
      this._modelStatus = { loaded: false, modelId: null, device: null, loadTimeMs: null };
    }
  }

  get status(): InferenceStatus {
    return this._status;
  }

  get modelStatus(): ModelStatus {
    return this._modelStatus;
  }

  isLoaded(): boolean {
    return this._modelStatus.loaded;
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this._status = 'idle';
      this._modelStatus = { loaded: false, modelId: null, device: null, loadTimeMs: null };
    }
  }
}
