import { create } from 'zustand';
import type { InferenceStatus, ChatMessage, ModelDownloadProgress, Domain, SearchResult } from '@docintel/ai-engine';
import { DexieStorageAdapter } from '../lib/dexie-storage';

const storage = new DexieStorageAdapter();

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('@docintel/ai-engine/workers/inference', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (e) => {
      useInferenceStore.setState({ error: String(e.message), status: 'error' });
    };
  }
  return worker;
}

interface InferenceState {
  status: InferenceStatus;
  downloadProgress: ModelDownloadProgress | null;
  messages: ChatMessage[];
  currentStreamText: string;
  error: string | null;
  loadModel: () => void;
  sendMessage: (content: string, options?: { systemPrompt?: string; domain?: Domain; documentId?: number }) => void;
  abortGeneration: () => void;
  clearMessages: () => void;
}

export const useInferenceStore = create<InferenceState>()((set, get) => ({
  status: 'idle',
  downloadProgress: null,
  messages: [],
  currentStreamText: '',
  error: null,

  loadModel: () => {
    set({ status: 'loading_tokenizer', error: null });
    getWorker().postMessage({ type: 'load' });
  },

  sendMessage: async (content: string, options) => {
    const state = get();
    if (state.status !== 'ready') return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set((s) => ({ messages: [...s.messages, userMsg], currentStreamText: '' }));

    // Build the messages array for the worker
    const chatMessages: Array<{ role: string; content: string }> = [];
    let citations: SearchResult[] | undefined;

    // If domain is provided, use RAG to augment the prompt
    if (options?.domain) {
      try {
        const { queryRAG } = await import('@docintel/ai-engine');
        const result = await queryRAG(content, options.domain, storage, options.documentId);
        chatMessages.push({ role: 'system', content: result.prompt });
        citations = result.sources;
      } catch {
        // Fallback to plain system prompt if RAG fails
        if (options.systemPrompt) {
          chatMessages.push({ role: 'system', content: options.systemPrompt });
        }
      }
    } else if (options?.systemPrompt) {
      chatMessages.push({ role: 'system', content: options.systemPrompt });
    }

    // Add conversation history (exclude the just-added user message since RAG prompt already contains the question)
    for (const m of get().messages.slice(0, -1)) {
      chatMessages.push({ role: m.role, content: m.content });
    }
    chatMessages.push({ role: 'user', content });

    // Store citations on the user message for later display on the assistant response
    if (citations?.length) {
      set((s) => {
        const msgs = [...s.messages];
        const lastUser = msgs[msgs.length - 1];
        if (lastUser.role === 'user') {
          msgs[msgs.length - 1] = {
            ...lastUser,
            citations: citations!.map((c) => ({
              chunkId: c.chunk.id ?? 0,
              text: c.chunk.text.slice(0, 200),
              score: c.score,
              startPage: c.chunk.startPage,
              endPage: c.chunk.endPage,
            })),
          };
        }
        return { messages: msgs };
      });
    }

    getWorker().postMessage({ type: 'generate', messages: chatMessages });
  },

  abortGeneration: () => {
    getWorker().postMessage({ type: 'abort' });
  },

  clearMessages: () => set({ messages: [], currentStreamText: '' }),
}));

function handleWorkerMessage(e: MessageEvent) {
  const { type } = e.data;
  if (type === 'status') {
    useInferenceStore.setState({ status: e.data.status, error: null });
  } else if (type === 'download_progress') {
    useInferenceStore.setState({
      status: 'downloading',
      downloadProgress: { name: e.data.name, loaded: e.data.loaded, total: e.data.total },
    });
  } else if (type === 'token') {
    useInferenceStore.setState((s) => ({ currentStreamText: s.currentStreamText + e.data.text }));
  } else if (type === 'done') {
    const state = useInferenceStore.getState();
    const streamText = state.currentStreamText;
    if (streamText) {
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: streamText,
        timestamp: Date.now(),
      };
      useInferenceStore.setState((s) => ({
        messages: [...s.messages, assistantMsg],
        currentStreamText: '',
      }));
    }
  } else if (type === 'error') {
    useInferenceStore.setState({ error: e.data.error, status: 'error' });
  }
}
