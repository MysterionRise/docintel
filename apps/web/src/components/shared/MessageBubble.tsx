import { useState } from 'react';
import { User, Bot, Copy, Check } from 'lucide-react';
import type { ChatMessage, SearchResult } from '@docintel/ai-engine';
import { renderContentWithCitations } from '../chat/citation-utils';

interface MessageBubbleProps {
  message: ChatMessage;
  onPageClick?: (page: number) => void;
  sources?: SearchResult[];
  onSourceClick?: (index: number) => void;
}

export function MessageBubble({ message, onPageClick, sources, onSourceClick }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine if we should render inline citations
  const hasInlineCitations = !isUser && sources && sources.length > 0 && message.content.includes('[Source');

  return (
    <div className={`group flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-[var(--color-primary)]' : 'bg-emerald-600'
        }`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="max-w-[80%]">
        <div
          className={`rounded-xl px-4 py-2 text-sm leading-relaxed ${
            isUser
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-surface)] text-[var(--color-text)]'
          }`}
        >
          <div className="whitespace-pre-wrap">
            {hasInlineCitations
              ? renderContentWithCitations(message.content, sources!, onSourceClick ?? (() => {}))
              : message.content}
          </div>

          {/* Legacy citations (from earlier versions) */}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <p className="mb-1 text-xs font-semibold opacity-70">Sources:</p>
              <div className="flex flex-wrap gap-1">
                {message.citations.map((c) => (
                  <button
                    key={c.chunkId}
                    onClick={() => c.startPage && onPageClick?.(c.startPage)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      onPageClick
                        ? 'bg-white/10 hover:bg-white/20 cursor-pointer'
                        : 'bg-white/10 cursor-default'
                    }`}
                  >
                    p.{c.startPage}–{c.endPage}
                    <span className="ml-1 opacity-60">({c.score.toFixed(2)})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions row (visible on hover) */}
        {!isUser && message.id !== 'streaming' && (
          <div className="mt-0.5 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text)]"
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
