import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tesseract.js
const mockRecognize = vi.fn().mockResolvedValue({ data: { text: 'Recognized text from image' } });
const mockTerminate = vi.fn().mockResolvedValue(undefined);
const mockWorker = { recognize: mockRecognize, terminate: mockTerminate };
const mockCreateWorker = vi.fn().mockResolvedValue(mockWorker);

vi.mock('tesseract.js', () => ({
  createWorker: (...args: unknown[]) => mockCreateWorker(...args),
}));

// Mock pdf-to-images to avoid pdfjs-dist dependency
const mockParsePDFToImages = vi.fn().mockResolvedValue([
  new Blob(['image1']),
  new Blob(['image2']),
]);

vi.mock('../pdf-to-images', () => ({
  parsePDFToImages: (...args: unknown[]) => mockParsePDFToImages(...args),
}));

// Dynamic import after mocks
const { initOCR, ocrImage, ocrPDFPages, terminateOCR } = await import('../ocr-engine');

describe('initOCR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module-level worker by terminating first
  });

  it('creates a Tesseract worker with English language', async () => {
    // Force a fresh module to test initOCR worker creation
    // Since the worker is cached at module level, we need to terminate first
    await terminateOCR();

    const worker = await initOCR();
    expect(mockCreateWorker).toHaveBeenCalledWith('eng', undefined, expect.objectContaining({
      logger: expect.any(Function),
    }));
    expect(worker).toBe(mockWorker);
  });

  it('reuses existing worker on subsequent calls', async () => {
    await terminateOCR();
    mockCreateWorker.mockClear();

    await initOCR();
    await initOCR();

    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
  });
});

describe('ocrImage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await terminateOCR();
  });

  it('recognizes text from a File', async () => {
    const file = new File(['fake-image-data'], 'scan.png', { type: 'image/png' });
    const text = await ocrImage(file);

    expect(text).toBe('Recognized text from image');
    expect(mockRecognize).toHaveBeenCalledWith(file);
  });

  it('recognizes text from a Blob', async () => {
    const blob = new Blob(['image-data'], { type: 'image/png' });
    const text = await ocrImage(blob);

    expect(text).toBe('Recognized text from image');
    expect(mockRecognize).toHaveBeenCalledWith(blob);
  });

  it('recognizes text from a URL string', async () => {
    const text = await ocrImage('https://example.com/image.png');

    expect(text).toBe('Recognized text from image');
    expect(mockRecognize).toHaveBeenCalledWith('https://example.com/image.png');
  });

  it('initializes worker if not yet initialized', async () => {
    mockCreateWorker.mockClear();

    const file = new File(['data'], 'test.png', { type: 'image/png' });
    await ocrImage(file);

    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
  });
});

describe('ocrPDFPages', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await terminateOCR();
    mockRecognize.mockResolvedValue({ data: { text: 'Page text' } });
  });

  it('converts PDF pages to images and OCRs each', async () => {
    const file = new File(['pdf-data'], 'document.pdf', { type: 'application/pdf' });
    const result = await ocrPDFPages(file);

    expect(mockParsePDFToImages).toHaveBeenCalledWith(file);
    expect(mockRecognize).toHaveBeenCalledTimes(2); // 2 mock images
    expect(result).toBe('Page text\n\nPage text');
  });

  it('calls progress callback for each page', async () => {
    const progress = vi.fn();
    const file = new File(['pdf-data'], 'doc.pdf', { type: 'application/pdf' });
    await ocrPDFPages(file, progress);

    expect(progress).toHaveBeenCalledWith(1, 2);
    expect(progress).toHaveBeenCalledWith(2, 2);
  });

  it('joins OCR results with double newlines', async () => {
    mockRecognize
      .mockResolvedValueOnce({ data: { text: 'First page' } })
      .mockResolvedValueOnce({ data: { text: 'Second page' } });

    const file = new File(['pdf-data'], 'multi.pdf', { type: 'application/pdf' });
    const result = await ocrPDFPages(file);

    expect(result).toBe('First page\n\nSecond page');
  });
});

describe('terminateOCR', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await terminateOCR();
  });

  it('terminates the worker', async () => {
    await initOCR(); // create worker
    mockTerminate.mockClear();

    await terminateOCR();
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });

  it('is safe to call when no worker exists', async () => {
    // No worker initialized, should not throw
    await expect(terminateOCR()).resolves.toBeUndefined();
  });

  it('allows re-initialization after termination', async () => {
    await initOCR();
    await terminateOCR();
    mockCreateWorker.mockClear();

    await initOCR();
    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
  });
});
