import { create } from 'zustand';
import type { ChatMessage, Domain, SearchResult } from '@docintel/ai-engine';
import { DexieStorageAdapter } from '../lib/dexie-storage';
import { getModelManager, useModelStore } from '../hooks/useModel';
import { db } from '../lib/db';

const storage = new DexieStorageAdapter();

interface InferenceState {
  messages: ChatMessage[];
  currentStreamText: string;
  currentDocumentId: number | null;
  sendMessage: (content: string, options?: { systemPrompt?: string; domain?: Domain; documentId?: number }) => void;
  abortGeneration: () => void;
  clearMessages: () => void;
  loadMessages: (documentId: number | null) => Promise<void>;
}

// Install callbacks on the model manager for token streaming
let callbacksInstalled = false;

function ensureCallbacks() {
  if (callbacksInstalled) return;
  callbacksInstalled = true;

  const manager = getModelManager();
  manager.setCallbacks({
    onStatusChange: (status) => {
      useModelStore.getState().setStatus(status);
    },
    onDownloadProgress: (progress) => {
      useModelStore.getState().setDownloadProgress(progress);
    },
    onToken: (text) => {
      useInferenceStore.setState((s) => ({ currentStreamText: s.currentStreamText + text }));
    },
    onGenerationDone: (stats) => {
      useModelStore.getState().setGenerationStats(stats);
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
        // Persist the assistant message
        const docId = state.currentDocumentId;
        db.chatMessages.add({ ...assistantMsg, documentId: docId });
      }
    },
    onError: (error) => {
      useModelStore.getState().setError(error);
    },
  });
}

export const useInferenceStore = create<InferenceState>()((set, get) => ({
  messages: [],
  currentStreamText: '',
  currentDocumentId: null,

  loadMessages: async (documentId: number | null) => {
    if (documentId === get().currentDocumentId && get().messages.length > 0) return;
    set({ currentDocumentId: documentId, currentStreamText: '' });
    if (documentId == null) {
      set({ messages: [] });
      return;
    }
    const stored = await db.chatMessages
      .where('documentId')
      .equals(documentId)
      .sortBy('timestamp');
    const messages: ChatMessage[] = stored.map(({ id, role, content, timestamp, citations }) => ({
      id, role, content, timestamp, ...(citations && { citations }),
    }));
    set({ messages });
  },

  sendMessage: async (content: string, options) => {
    ensureCallbacks();

    const status = useModelStore.getState().status;
    if (status !== 'ready') return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set((s) => ({ messages: [...s.messages, userMsg], currentStreamText: '' }));

    // Persist user message
    const docId = get().currentDocumentId;
    db.chatMessages.add({ ...userMsg, documentId: docId });

    const chatMessages: Array<{ role: string; content: string }> = [];
    let citations: SearchResult[] | undefined;

    if (options?.domain) {
      try {
        const { queryRAG } = await import('@docintel/ai-engine');
        const result = await queryRAG(content, options.domain, storage, options.documentId);
        chatMessages.push({ role: 'system', content: result.prompt });
        citations = result.sources;
      } catch {
        if (options.systemPrompt) {
          chatMessages.push({ role: 'system', content: options.systemPrompt });
        }
      }
    } else if (options?.systemPrompt) {
      chatMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const m of get().messages.slice(0, -1)) {
      chatMessages.push({ role: m.role, content: m.content });
    }
    chatMessages.push({ role: 'user', content });

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

    getModelManager().generate(chatMessages);
  },

  abortGeneration: () => {
    ensureCallbacks();
    getModelManager().abort();
  },

  clearMessages: async () => {
    const docId = get().currentDocumentId;
    set({ messages: [], currentStreamText: '' });
    if (docId != null) {
      await db.chatMessages.where('documentId').equals(docId).delete();
    }
  },
}));
