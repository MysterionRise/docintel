import * as pdfjsLib from 'pdfjs-dist';

export async function parsePDFToImages(file: File): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const blobs: Blob[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvas: null, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    blobs.push(blob);
  }

  return blobs;
}
