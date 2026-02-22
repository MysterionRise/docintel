import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock crypto.randomUUID
if (!globalThis.crypto?.randomUUID) {
  let counter = 0;
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      randomUUID: () => `test-uuid-${++counter}`,
    },
  });
}

// Mock Worker
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();
  onerror = null;
  onmessageerror = null;
}

vi.stubGlobal('Worker', MockWorker);

// Mock import.meta.url for workers
vi.stubGlobal('URL', globalThis.URL);

// Mock performance.now if not present
if (!globalThis.performance?.now) {
  Object.defineProperty(globalThis, 'performance', {
    value: { now: () => Date.now() },
  });
}
