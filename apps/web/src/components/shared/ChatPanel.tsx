import { useState, useRef, useEffect } from 'react';
import { Send, Square, Download, AlertCircle, Trash2, Database, FileText } from 'lucide-react';
import { useModel } from '../../hooks/useModel';
import { useDocumentChat } from '../../hooks/useDocumentChat';
import type { RAGMode } from '../../hooks/useRAG';
import { MessageBubble } from './MessageBubble';
import { exportChatToDocx, downloadBlob } from '../../lib/exporters/docxExporter';
import { exportChatToPdf } from '../../lib/exporters/pdfExporter';
import { exportChatToXlsx } from '../../lib/exporters/xlsxExporter';
import { ModelLoader } from '../model/ModelLoader';
import { ContextIndicator } from '../chat/ContextIndicator';
import { QuickActions } from '../chat/QuickActions';
import { RetrievedContext } from '../chat/RetrievedContext';
import { CitationPanel } from '../chat/CitationPanel';

interface ChatPanelProps {
  placeholder?: string;
}

const MODE_LABELS: Record<RAGMode, string> = {
  auto: 'Auto',
  simple: 'Simple',
  rag: 'RAG',
};

export function ChatPanel({ placeholder = 'Ask about your documents...' }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { status, error, loadModel } = useModel();
  const {
    messages,
    currentStreamText,
    activeDocument,
    contextInfo,
    isGenerating,
    isReady,
    ragMode,
    setRagMode,
    lastRetrievalStats,
    lastSources,
    sendMessage,
    sendQuickAction,
    abortGeneration,
    clearMessages,
  } = useDocumentChat();

  const isError = status === 'error';

  const title = activeDocument?.domain ? `DocIntel ${activeDocument.domain} Analysis` : 'DocIntel Chat';

  const handleExport = async (format: 'docx' | 'pdf' | 'xlsx') => {
    setShowExportMenu(false);
    if (messages.length === 0) return;
    if (format === 'docx') {
      const blob = await exportChatToDocx(messages, title);
      downloadBlob(blob, `${title}.docx`);
    } else if (format === 'pdf') {
      const blob = exportChatToPdf(messages, title);
      downloadBlob(blob, `${title}.pdf`);
    } else {
      const blob = exportChatToXlsx(messages, title);
      downloadBlob(blob, `${title}.xlsx`);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, currentStreamText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isReady) return;
    setSelectedSourceIndex(null);
    sendMessage(input.trim());
    setInput('');
  };

  const cycleMode = () => {
    const modes: RAGMode[] = ['auto', 'simple', 'rag'];
    const idx = modes.indexOf(ragMode);
    setRagMode(modes[(idx + 1) % modes.length]);
  };

  return (
    <div className="relative flex h-full flex-col">
      {/* Context indicator + toolbar */}
      <div className="space-y-0 border-b border-[var(--color-border)]">
        {/* Context indicator */}
        {activeDocument && contextInfo && (
          <div className="px-3 pt-2">
            <ContextIndicator
              includedPages={contextInfo.includedPages}
              totalPages={contextInfo.totalPages}
              truncated={contextInfo.truncated}
              documentName={activeDocument.name}
            />
          </div>
        )}

        {/* Mode + export + clear toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* RAG mode toggle */}
            {activeDocument && (
              <button
                onClick={cycleMode}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                title={`Mode: ${MODE_LABELS[ragMode]}${contextInfo?.effectiveMode ? ` (using ${contextInfo.effectiveMode})` : ''}`}
              >
                {contextInfo?.effectiveMode === 'rag' ? (
                  <Database size={12} className="text-[var(--color-primary)]" />
                ) : (
                  <FileText size={12} />
                )}
                {MODE_LABELS[ragMode]}
              </button>
            )}
            {messages.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                >
                  <Download size={14} /> Export
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 top-full z-10 mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-1 shadow-lg">
                    <button onClick={() => handleExport('docx')} className="block w-full px-4 py-1.5 text-left text-xs hover:bg-[var(--color-surface)]">DOCX</button>
                    <button onClick={() => handleExport('pdf')} className="block w-full px-4 py-1.5 text-left text-xs hover:bg-[var(--color-surface)]">PDF</button>
                    <button onClick={() => handleExport('xlsx')} className="block w-full px-4 py-1.5 text-left text-xs hover:bg-[var(--color-surface)]">XLSX</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto p-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            sources={lastSources}
            onSourceClick={setSelectedSourceIndex}
          />
        ))}

        {/* Retrieved context after the last assistant message */}
        {lastSources.length > 0 && lastRetrievalStats && messages.length > 0 && !isGenerating && !currentStreamText && (
          <RetrievedContext
            sources={lastSources}
            retrievalTimeMs={lastRetrievalStats.timeMs}
          />
        )}

        {currentStreamText && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: currentStreamText,
              timestamp: Date.now(),
            }}
            sources={lastSources}
            onSourceClick={setSelectedSourceIndex}
          />
        )}
        {messages.length === 0 && !currentStreamText && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-sm text-[var(--color-text-muted)]">
            {!isReady && !isGenerating ? (
              <div className="w-full max-w-sm">
                <ModelLoader />
              </div>
            ) : activeDocument ? (
              <div className="w-full space-y-3 text-center">
                <p>Ask a question about <span className="font-medium text-[var(--color-text)]">{activeDocument.name}</span></p>
                {contextInfo?.effectiveMode === 'rag' && (
                  <p className="text-xs text-[var(--color-primary)]">
                    <Database size={10} className="mr-1 inline" />
                    RAG mode — semantic search across chunks
                  </p>
                )}
                <QuickActions onAction={sendQuickAction} disabled={!isReady} />
              </div>
            ) : (
              <p>Upload a document and start asking questions</p>
            )}
          </div>
        )}
        {/* Inline error */}
        {isError && messages.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertCircle size={14} />
            <span>{error}</span>
            <button onClick={() => loadModel()} className="ml-auto underline">Retry</button>
          </div>
        )}
      </div>

      {/* Quick actions above input when messages exist and document is active */}
      {messages.length > 0 && activeDocument && isReady && !isGenerating && (
        <div className="border-t border-[var(--color-border)] px-3 pt-2">
          <QuickActions onAction={sendQuickAction} />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-[var(--color-border)] p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isReady ? placeholder : 'Load model first...'}
            disabled={!isReady}
            className="flex-1 rounded-lg bg-[var(--color-surface)] px-4 py-2 text-sm outline-none placeholder:text-[var(--color-text-muted)] disabled:opacity-50"
          />
          {isGenerating ? (
            <button
              type="button"
              onClick={abortGeneration}
              className="rounded-lg bg-red-500/20 p-2 text-red-400 transition-colors hover:bg-red-500/30"
            >
              <Square size={18} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !isReady}
              className="rounded-lg bg-[var(--color-primary)] p-2 text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-30"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </form>

      {/* Citation side panel */}
      {selectedSourceIndex != null && lastSources.length > 0 && (
        <CitationPanel
          sources={lastSources}
          selectedSourceIndex={selectedSourceIndex}
          onClose={() => setSelectedSourceIndex(null)}
        />
      )}
    </div>
  );
}
