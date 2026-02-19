import { createWorker, type Worker as TesseractWorker } from 'tesseract.js';

let worker: TesseractWorker | null = null;

export async function initOCR(): Promise<TesseractWorker> {
  if (!worker) {
    worker = await createWorker('eng', undefined, {
      logger: (m: { progress: number }) => {
        // Logger fires during recognition with progress info
        void m;
      },
    });
  }
  return worker;
}

export async function ocrImage(
  imageData: File | Blob | string,
): Promise<string> {
  const w = await initOCR();
  const result = await w.recognize(imageData);
  return result.data.text;
}

export async function ocrPDFPages(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  const { parsePDFToImages } = await import('./pdf-to-images');
  const images = await parsePDFToImages(file);
  const texts: string[] = [];

  for (let i = 0; i < images.length; i++) {
    onProgress?.(i + 1, images.length);
    const text = await ocrImage(images[i]);
    texts.push(text);
  }

  return texts.join('\n\n');
}

export async function terminateOCR(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
