import { useCallback, useEffect, useMemo } from 'react';
import {
  ContextManager,
  DOCUMENT_QA,
  DOCUMENT_SUMMARIZE,
  DOCUMENT_EXTRACT,
  DOCUMENT_RISKS,
  type PromptTemplate,
} from '@docintel/ai-engine';
import { useInferenceStore } from '../stores/useInferenceStore';
import { useDocumentStore } from '../stores/useDocumentStore';
import { useModelStore } from './useModel';
import { useRAG } from './useRAG';

export type QuickAction = 'summarize' | 'extract' | 'risks';

const QUICK_ACTION_TEMPLATES: Record<QuickAction, PromptTemplate> = {
  summarize: DOCUMENT_SUMMARIZE,
  extract: DOCUMENT_EXTRACT,
  risks: DOCUMENT_RISKS,
};

const contextManager = new ContextManager(3000);

export function useDocumentChat() {
  const selectedDocumentId = useDocumentStore((s) => s.selectedDocumentId);
  const documents = useDocumentStore((s) => s.documents);
  const messages = useInferenceStore((s) => s.messages);
  const currentStreamText = useInferenceStore((s) => s.currentStreamText);
  const sendMessageRaw = useInferenceStore((s) => s.sendMessage);
  const abortGeneration = useInferenceStore((s) => s.abortGeneration);
  const clearMessages = useInferenceStore((s) => s.clearMessages);
  const loadMessages = useInferenceStore((s) => s.loadMessages);
  const status = useModelStore((s) => s.status);

  const {
    mode: ragMode,
    setMode: setRagMode,
    lastRetrievalStats,
    lastSources,
    executeQuery,
    getEffectiveMode,
  } = useRAG();

  // Load persisted messages when the selected document changes
  useEffect(() => {
    loadMessages(selectedDocumentId);
  }, [selectedDocumentId, loadMessages]);

  const activeDocument = useMemo(
    () => documents.find((d) => d.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );

  // Context info for the active document
  const contextInfo = useMemo(() => {
    if (!activeDocument?.rawText) return null;

    const sections = activeDocument.rawText.split(/\n\n+/);
    const pageTexts: string[] = [];
    const targetPageCount = activeDocument.pageCount || 1;
    const sectionsPerPage = Math.ceil(sections.length / targetPageCount);

    for (let i = 0; i < sections.length; i += sectionsPerPage) {
      pageTexts.push(sections.slice(i, i + sectionsPerPage).join('\n\n'));
    }

    const result = contextManager.fitToContext(activeDocument.rawText, pageTexts);
    const docTokens = contextManager.estimateTokens(activeDocument.rawText);
    const effectiveMode = getEffectiveMode(docTokens);

    return {
      includedPages: result.includedPages,
      totalPages: activeDocument.pageCount,
      truncated: result.truncated,
      totalTokens: result.totalTokens,
      effectiveMode,
    };
  }, [activeDocument, getEffectiveMode]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeDocument) {
        sendMessageRaw(content, {
          systemPrompt: DOCUMENT_QA.system,
        });
        return;
      }

      // Use RAG pipeline to build the prompt
      const ragResult = await executeQuery(
        content,
        activeDocument,
        messages,
      );

      if (ragResult.mode === 'simple') {
        // Simple mode: stuff document context into system prompt
        sendMessageRaw(content, {
          systemPrompt: `${DOCUMENT_QA.system}\n\n<context>\n${ragResult.prompt}\n</context>`,
        });
      } else {
        // RAG mode: use the RAG-constructed prompt as system prompt
        sendMessageRaw(content, {
          systemPrompt: ragResult.prompt,
          domain: activeDocument.domain,
          documentId: selectedDocumentId ?? undefined,
        });
      }
    },
    [sendMessageRaw, activeDocument, selectedDocumentId, executeQuery, messages],
  );

  const sendQuickAction = useCallback(
    async (action: QuickAction) => {
      if (!activeDocument) return;

      const template = QUICK_ACTION_TEMPLATES[action];

      const sections = activeDocument.rawText.split(/\n\n+/);
      const pageTexts: string[] = [];
      const targetPageCount = activeDocument.pageCount || 1;
      const sectionsPerPage = Math.ceil(sections.length / targetPageCount);

      for (let i = 0; i < sections.length; i += sectionsPerPage) {
        pageTexts.push(sections.slice(i, i + sectionsPerPage).join('\n\n'));
      }

      const { context } = contextManager.fitToContext(activeDocument.rawText, pageTexts);
      const userPrompt = template.buildUserPrompt(context, '');

      sendMessageRaw(userPrompt, {
        systemPrompt: template.system,
      });
    },
    [activeDocument, sendMessageRaw],
  );

  return {
    messages,
    currentStreamText,
    activeDocument,
    contextInfo,
    isGenerating: status === 'generating',
    isReady: status === 'ready',
    ragMode,
    setRagMode,
    lastRetrievalStats,
    lastSources,
    sendMessage,
    sendQuickAction,
    abortGeneration,
    clearMessages,
  };
}
