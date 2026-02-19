import { User, Bot } from 'lucide-react';
import type { ChatMessage } from '@docintel/ai-engine';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-[var(--color-primary)]' : 'bg-emerald-600'
        }`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-[var(--color-primary)] text-white'
            : 'bg-[var(--color-surface)] text-[var(--color-text)]'
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 border-t border-white/10 pt-2">
            <p className="mb-1 text-xs font-semibold opacity-70">Sources:</p>
            {message.citations.map((c) => (
              <p key={c.chunkId} className="text-xs opacity-60">
                p.{c.startPage}–{c.endPage} (score: {c.score.toFixed(2)})
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
