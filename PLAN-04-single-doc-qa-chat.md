# Plan: Single-Document Q&A Chat Interface

## Goal
Build a chat interface where users can ask questions about a loaded document and receive streaming AI answers. First end-to-end feature: upload PDF → ask question → get answer.

## Packages
`packages/ai-engine` (prompt templates, context manager) + `apps/web` (UI components, hooks, stores)

## Dependencies
- Plan 02 (WebGPU Model Inference) must be complete
- Plan 03 (PDF Parsing) must be complete

## Tasks

### 1. Build prompt template system (`packages/ai-engine/src/prompt-templates.ts`)
```typescript
export interface PromptTemplate {
  system: string;
  buildUserPrompt: (context: string, question: string) => string;
}

export const DOCUMENT_QA: PromptTemplate = {
  system: `You are DocIntel, an AI document analysis assistant running entirely on the user's device. You analyze documents and answer questions accurately based only on the provided context. If the answer is not in the context, say so. Always cite the relevant page number when available. Be concise and precise.`,
  buildUserPrompt: (context: string, question: string) =>
    `<context>\n${context}\n</context>\n\nQuestion: ${question}\n\nAnswer based only on the context above. Cite page numbers where relevant.`,
};

export const DOCUMENT_SUMMARIZE: PromptTemplate = { /* ... */ };
export const DOCUMENT_EXTRACT: PromptTemplate = { /* ... */ };
```

### 2. Build context window manager (`packages/ai-engine/src/context-manager.ts`)
Manages fitting document text into the model's context window:

```typescript
export class ContextManager {
  constructor(private maxContextTokens: number = 3000) {}

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }

  fitToContext(fullText: string, pageTexts: string[]): {
    context: string;
    includedPages: number[];
    truncated: boolean;
  };
}
```

Strategy: prioritize first pages (usually most important), then trim from the middle.

### 3. Update ai-engine exports (`packages/ai-engine/src/index.ts`)
Add new exports:
```typescript
export { ContextManager } from './context-manager';
export { DOCUMENT_QA, DOCUMENT_SUMMARIZE, DOCUMENT_EXTRACT } from './prompt-templates';
export type { PromptTemplate } from './prompt-templates';
```

### 4. Build ChatInterface component (`apps/web/src/components/chat/ChatInterface.tsx`)
Full chat UI with:
- Message list (user right-aligned, assistant left-aligned)
- Text input at bottom with send button and Enter key
- Streaming text display (tokens appear as generated)
- Loading indicator while model generates
- "Stop generating" button during generation
- Auto-scroll to latest message
- Quick action buttons above input:
  - "Summarize this document"
  - "Extract key information"
  - "Find risks and issues"

### 5. Build MessageBubble component (`apps/web/src/components/chat/MessageBubble.tsx`)
Individual message display:
- User messages: right-aligned, blue background
- Assistant messages: markdown-rendered, left-aligned, gray background
- Support: bold, italic, lists, code blocks
- Page citations rendered as clickable badges: [Page 3]
- Copy button, token count + generation speed (small text)

### 6. Build StreamingText component (`apps/web/src/components/chat/StreamingText.tsx`)
Animated text display during generation:
- Tokens appear incrementally
- Blinking cursor at end
- Smooth rendering without flicker
- Buffer markdown formatting mid-stream

### 7. Build Zustand stores (`apps/web/src/store/`)
`chat-store.ts`:
```typescript
interface ChatStore {
  messagesByDocument: Record<string, ChatMessage[]>;
  activeDocumentId: string | null;
  isGenerating: boolean;
  streamingText: string;
  addMessage: (docId: string, message: ChatMessage) => void;
  setStreaming: (text: string) => void;
  clearChat: (docId: string) => void;
}
```

### 8. Wire up the full Q&A flow (`apps/web/src/hooks/useDocumentChat.ts`)
Custom hook that orchestrates the entire flow:
```typescript
import { ContextManager, DOCUMENT_QA } from '@docintel/ai-engine';
import { type ParsedDocument } from '@docintel/document-parser';

export function useDocumentChat() {
  // 1. Get active document from document store
  // 2. Fit document into context using ContextManager
  // 3. Build prompt using DOCUMENT_QA template
  // 4. Send to inference worker via useInference hook
  // 5. Stream response into chat store
  // Returns: { sendMessage, streamingText, isGenerating, abort }
}
```

### 9. Build document context indicator (`apps/web/src/components/chat/ContextIndicator.tsx`)
Show users what context the model is using:
- "Using pages 1-12 of 47" badge above chat
- Highlight the pages being used in the document viewer
- "Document too large for single-pass" warning

### 10. Build the App layout shell (`apps/web/src/components/layout/AppShell.tsx`)
Main application layout:
- Top bar: app name, model status badge, settings gear
- Left sidebar: document library (collapsible)
- Center: document viewer OR welcome screen
- Right panel: chat interface (collapsible)
- Responsive: on mobile, use tabs instead of side-by-side

### 11. Chat history persistence
Store chat history per document in Zustand + IndexedDB:
- Each document has its own chat thread
- Persists across page refreshes
- User can clear chat
- Messages include metadata (tokens used, generation speed, pages referenced)

## Acceptance Criteria
- [ ] User can upload PDF and immediately ask questions about it
- [ ] Streaming responses appear token by token
- [ ] Generation can be stopped mid-stream
- [ ] Context window fitting works (large docs truncated with warning)
- [ ] Quick actions (Summarize, Extract, Find Risks) work
- [ ] Chat history persists across page refreshes
- [ ] Page citations in responses are clickable
- [ ] Entire flow works offline after model is cached
- [ ] UI remains responsive during generation
- [ ] `@docintel/ai-engine` and `@docintel/document-parser` imports work correctly
