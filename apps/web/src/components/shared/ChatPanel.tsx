import { useState, useRef, useEffect } from 'react';
import { Send, Square, Loader2, AlertCircle, Download } from 'lucide-react';
import { useInferenceStore } from '../../stores/useInferenceStore';
import { MessageBubble } from './MessageBubble';
import { exportChatToDocx, downloadBlob } from '../../lib/exporters/docxExporter';
import { exportChatToPdf } from '../../lib/exporters/pdfExporter';
import { exportChatToXlsx } from '../../lib/exporters/xlsxExporter';
import type { Domain } from '@docintel/ai-engine';

interface ChatPanelProps {
  systemPrompt?: string;
  placeholder?: string;
  domain?: Domain;
  documentId?: number | null;
}

export function ChatPanel({ systemPrompt, placeholder = 'Ask about your documents...', domain, documentId }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const status = useInferenceStore((s) => s.status);
  const messages = useInferenceStore((s) => s.messages);
  const currentStreamText = useInferenceStore((s) => s.currentStreamText);
  const error = useInferenceStore((s) => s.error);
  const sendMessage = useInferenceStore((s) => s.sendMessage);
  const abortGeneration = useInferenceStore((s) => s.abortGeneration);
  const loadModel = useInferenceStore((s) => s.loadModel);

  const isGenerating = status === 'generating';
  const isReady = status === 'ready';
  const isLoading = ['loading_tokenizer', 'loading_model', 'downloading'].includes(status);
  const isError = status === 'error';

  const title = domain ? `DocIntel ${domain} Analysis` : 'DocIntel Chat';

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
    sendMessage(input.trim(), {
      systemPrompt,
      domain,
      documentId: documentId ?? undefined,
    });
    setInput('');
  };

  return (
    <div className="flex h-full flex-col">
      {messages.length > 0 && (
        <div className="flex items-center justify-end border-b border-[var(--color-border)] px-3 py-1.5">
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
        </div>
      )}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto p-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {currentStreamText && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: currentStreamText,
              timestamp: Date.now(),
            }}
          />
        )}
        {messages.length === 0 && !currentStreamText && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-[var(--color-text-muted)]">
            {status === 'idle' ? (
              <button
                onClick={loadModel}
                className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-white transition-colors hover:bg-[var(--color-primary-dark)]"
              >
                Load AI Model
              </button>
            ) : isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Loading model...
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center gap-2 text-red-400">
                <AlertCircle size={24} />
                <p className="text-center text-xs">{error}</p>
                <button
                  onClick={loadModel}
                  className="mt-1 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs hover:bg-red-500/30"
                >
                  Retry
                </button>
              </div>
            ) : (
              'Send a message to start analyzing'
            )}
          </div>
        )}
        {/* Show error inline if it occurs during generation */}
        {isError && messages.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <AlertCircle size={14} />
            <span>{error}</span>
            <button onClick={loadModel} className="ml-auto underline">Retry</button>
          </div>
        )}
      </div>

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
    </div>
  );
}
