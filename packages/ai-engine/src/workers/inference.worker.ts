import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  type PreTrainedTokenizer,
  type PreTrainedModel,
  type Tensor,
} from '@huggingface/transformers';
import type { InferenceWorkerInMessage, InferenceWorkerOutMessage } from '../types';

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let currentModelId: string | null = null;
let abortController: AbortController | null = null;

function post(msg: InferenceWorkerOutMessage) {
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<InferenceWorkerInMessage>) => {
  const msg = e.data;

  if (msg.type === 'load-model') {
    await loadModel(msg.modelId, msg.dtype, msg.device);
  } else if (msg.type === 'generate') {
    await generate(msg.messages, msg.maxTokens, msg.temperature, msg.topP);
  } else if (msg.type === 'abort') {
    abortController?.abort();
  } else if (msg.type === 'unload') {
    await unloadModel();
  }
};

async function loadModel(modelId: string, dtype: string, device: string) {
  // If same model is already loaded, just signal ready
  if (tokenizer && model && currentModelId === modelId) {
    post({ type: 'model-ready', modelId, loadTimeMs: 0 });
    return;
  }

  // Unload existing model first
  if (model) {
    await unloadModel();
  }

  const startTime = performance.now();

  try {
    post({ type: 'status', status: 'loading_tokenizer' });
    tokenizer = await AutoTokenizer.from_pretrained(modelId, {
      progress_callback: (progress: { status: string; file?: string; loaded?: number; total?: number; progress?: number }) => {
        if (progress.status === 'progress' && progress.file && progress.loaded != null && progress.total != null) {
          post({
            type: 'model-progress',
            progress: progress.progress ?? 0,
            status: 'downloading',
            loaded: progress.loaded,
            total: progress.total,
            file: progress.file,
          });
        }
      },
    });

    post({ type: 'status', status: 'loading_model' });
    model = await AutoModelForCausalLM.from_pretrained(modelId, {
      dtype: dtype as 'q4f16' | 'q4' | 'q8' | 'fp32' | 'fp16',
      device: device as 'webgpu' | 'wasm',
      progress_callback: (progress: { status: string; file?: string; loaded?: number; total?: number; progress?: number }) => {
        if (progress.status === 'progress' && progress.file && progress.loaded != null && progress.total != null) {
          post({
            type: 'model-progress',
            progress: progress.progress ?? 0,
            status: 'downloading',
            loaded: progress.loaded,
            total: progress.total,
            file: progress.file,
          });
        }
      },
    });

    currentModelId = modelId;
    const loadTimeMs = Math.round(performance.now() - startTime);
    post({ type: 'model-ready', modelId, loadTimeMs });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Check for OOM-related errors
    if (errorMessage.includes('out of memory') || errorMessage.includes('OOM') || errorMessage.includes('allocation')) {
      post({ type: 'model-error', error: `Out of memory: This model is too large for your device. Try a smaller model or close other tabs. (${errorMessage})` });
    } else {
      post({ type: 'model-error', error: errorMessage });
    }
  }
}

async function generate(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  temperature?: number,
  topP?: number,
) {
  if (!tokenizer || !model) {
    post({ type: 'model-error', error: 'Model not loaded' });
    return;
  }

  abortController = new AbortController();

  try {
    post({ type: 'status', status: 'generating' });

    const startTime = performance.now();
    let tokenCount = 0;

    const inputs = tokenizer.apply_chat_template(messages, {
      add_generation_prompt: true,
      return_dict: true,
    }) as Record<string, Tensor>;

    let fullText = '';

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        fullText += text;
        tokenCount++;
        post({ type: 'token', text });
      },
    });

    await (model.generate as Function)({
      ...inputs,
      generation_config: {
        max_new_tokens: maxTokens,
        do_sample: temperature != null ? temperature > 0 : true,
        temperature: temperature ?? 0.6,
        top_p: topP ?? 0.9,
      },
      streamer,
      signal: abortController.signal,
    });

    const elapsed = performance.now() - startTime;
    post({
      type: 'generation-done',
      fullText,
      tokensGenerated: tokenCount,
      tokensPerSecond: tokenCount / (elapsed / 1000),
    });
    post({ type: 'status', status: 'ready' });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      post({ type: 'generation-done', fullText: '', tokensGenerated: 0, tokensPerSecond: 0 });
      post({ type: 'status', status: 'ready' });
    } else {
      const errorMessage = err instanceof Error ? err.message : String(err);
      post({ type: 'model-error', error: errorMessage });
    }
  } finally {
    abortController = null;
  }
}

async function unloadModel() {
  tokenizer = null;
  model = null;
  currentModelId = null;
  post({ type: 'status', status: 'idle' });
}
