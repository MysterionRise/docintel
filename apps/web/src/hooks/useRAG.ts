import { useCallback, useState } from 'react';
import {
  queryRAG,
  shouldUseRAG,
  ContextManager,
  type RAGOptions,
  type RAGResult,
  type SearchResult,
  type Domain,
  type ChatMessage,
} from '@docintel/ai-engine';
import { DexieStorageAdapter } from '../lib/dexie-storage';

const storage = new DexieStorageAdapter();
const contextManager = new ContextManager(3000);

export type RAGMode = 'simple' | 'rag' | 'auto';

export interface RetrievalStats {
  timeMs: number;
  chunksFound: number;
  contextTokens: number;
  mode: 'simple' | 'rag';
}

export function useRAG() {
  const [mode, setMode] = useState<RAGMode>('auto');
  const [lastRetrievalStats, setLastRetrievalStats] = useState<RetrievalStats | null>(null);
  const [lastSources, setLastSources] = useState<SearchResult[]>([]);

  /**
   * Determine effective mode for a given document.
   */
  const getEffectiveMode = useCallback(
    (documentTokens: number): 'simple' | 'rag' => {
      if (mode === 'auto') {
        return shouldUseRAG(documentTokens) ? 'rag' : 'simple';
      }
      return mode;
    },
    [mode],
  );

  /**
   * Execute a RAG query and return the prompt + sources for the inference engine.
   * For simple mode, returns the full document context stuffed into the prompt.
   */
  const executeQuery = useCallback(
    async (
      question: string,
      document: { id?: number; rawText: string; pageCount: number; domain: Domain },
      chatHistory: ChatMessage[],
      ragOptions?: Partial<RAGOptions>,
    ): Promise<RAGResult> => {
      const docTokens = contextManager.estimateTokens(document.rawText);
      const effectiveMode = getEffectiveMode(docTokens);

      if (effectiveMode === 'simple') {
        // Simple mode: stuff full document into context
        const start = performance.now();
        const sections = document.rawText.split(/\n\n+/);
        const pageTexts: string[] = [];
        const targetPageCount = document.pageCount || 1;
        const sectionsPerPage = Math.ceil(sections.length / targetPageCount);
        for (let i = 0; i < sections.length; i += sectionsPerPage) {
          pageTexts.push(sections.slice(i, i + sectionsPerPage).join('\n\n'));
        }
        const { context, totalTokens } = contextManager.fitToContext(document.rawText, pageTexts);
        const timeMs = Math.round(performance.now() - start);

        setLastRetrievalStats({ timeMs, chunksFound: 0, contextTokens: totalTokens, mode: 'simple' });
        setLastSources([]);

        return {
          prompt: context,
          sources: [],
          retrievalTimeMs: timeMs,
          contextTokens: totalTokens,
          mode: 'simple',
        };
      }

      // RAG mode: retrieve relevant chunks
      const result = await queryRAG(
        question,
        document.domain,
        storage,
        document.id,
        ragOptions,
        chatHistory,
      );

      setLastRetrievalStats({
        timeMs: result.retrievalTimeMs,
        chunksFound: result.sources.length,
        contextTokens: result.contextTokens,
        mode: 'rag',
      });
      setLastSources(result.sources);

      return result;
    },
    [getEffectiveMode],
  );

  return {
    mode,
    setMode,
    lastRetrievalStats,
    lastSources,
    executeQuery,
    getEffectiveMode,
  };
}
