import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  type PreTrainedTokenizer,
  type PreTrainedModel,
  type Tensor,
} from '@huggingface/transformers';

const MODEL_ID = 'HuggingFaceTB/SmolLM3-3B-ONNX';

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let abortController: AbortController | null = null;

type WorkerMessage =
  | { type: 'load' }
  | { type: 'generate'; messages: Array<{ role: string; content: string }>; maxTokens?: number }
  | { type: 'abort' };

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type } = e.data;

  if (type === 'load') {
    await loadModel();
  } else if (type === 'generate') {
    await generate(e.data.messages, e.data.maxTokens ?? 1024);
  } else if (type === 'abort') {
    abortController?.abort();
  }
};

async function loadModel() {
  try {
    self.postMessage({ type: 'status', status: 'loading_tokenizer' });
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
      progress_callback: progressCallback,
    });

    self.postMessage({ type: 'status', status: 'loading_model' });
    model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
      dtype: 'q4f16',
      device: 'webgpu',
      progress_callback: progressCallback,
    });

    self.postMessage({ type: 'status', status: 'ready' });
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
}

function progressCallback(progress: { status: string; file?: string; loaded?: number; total?: number }) {
  if (progress.status === 'progress' && progress.file && progress.loaded != null && progress.total != null) {
    self.postMessage({
      type: 'download_progress',
      name: progress.file,
      loaded: progress.loaded,
      total: progress.total,
    });
  }
}

async function generate(messages: Array<{ role: string; content: string }>, maxTokens: number) {
  if (!tokenizer || !model) {
    self.postMessage({ type: 'error', error: 'Model not loaded' });
    return;
  }

  abortController = new AbortController();

  try {
    self.postMessage({ type: 'status', status: 'generating' });

    const inputs = tokenizer.apply_chat_template(messages, {
      add_generation_prompt: true,
      return_dict: true,
    }) as Record<string, Tensor>;

    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (text: string) => {
        self.postMessage({ type: 'token', text });
      },
    });

    await (model.generate as Function)({
      ...inputs,
      generation_config: {
        max_new_tokens: maxTokens,
        do_sample: true,
        temperature: 0.6,
        top_p: 0.9,
      },
      streamer,
      signal: abortController.signal,
    });

    self.postMessage({ type: 'done' });
    self.postMessage({ type: 'status', status: 'ready' });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      self.postMessage({ type: 'done' });
      self.postMessage({ type: 'status', status: 'ready' });
    } else {
      self.postMessage({ type: 'error', error: String(err) });
    }
  } finally {
    abortController = null;
  }
}
