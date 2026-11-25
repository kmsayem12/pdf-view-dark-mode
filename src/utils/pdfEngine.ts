import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import type { PdfColorConfig } from '../types/pdf';

// Configure PDF.js worker using Vite asset URL resolution
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export { pdfjsLib };

/**
 * Parses a 6-digit hex color string into RGB [0..255]
 */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return [r, g, b];
  }
  const num = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(num)) {
    return [255, 255, 255];
  }
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Computes relative luminance (0..1) of a hex color to decide whether
 * the background is dark or light and automatically pick high-contrast ink.
 */
export function getHexLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Returns an optimal high-contrast text/ink color for any chosen background hex color.
 */
export function getAutoContrastInkColor(bgHex: string): string {
  const lum = getHexLuminance(bgHex);
  return lum < 0.5 ? '#E2E8F0' : '#0F172A';
}

/**
 * Transforms a source ImageData (rendered by PDF.js on a white paper canvas)
 * into a new ImageData recolored with the chosen background and ink colors.
 */
export function transformPdfImageData(
  sourceData: ImageData,
  colorConfig: PdfColorConfig
): ImageData {
  const { bgColor, textColor, smartContrast } = colorConfig;
  const [bgR, bgG, bgB] = hexToRgb(bgColor);
  const [fgR, fgG, fgB] = hexToRgb(textColor);

  // Fast path: if original white background and near-black text without custom tint
  const isDefaultWhite =
    bgR === 255 && bgG === 255 && bgB === 255 && fgR <= 20 && fgG <= 30 && fgB <= 45;

  const src = sourceData.data;
  const output = new ImageData(sourceData.width, sourceData.height);
  const dst = output.data;

  if (isDefaultWhite) {
    dst.set(src);
    return output;
  }

  const dR = bgR - fgR;
  const dG = bgG - fgG;
  const dB = bgB - fgB;

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const a = src[i + 3];

    // Normalized luminance of the source pixel (1.0 = white paper, 0.0 = black ink)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Linear interpolation between foreground ink (lum=0) and page background (lum=1)
    let outR = fgR + lum * dR;
    let outG = fgG + lum * dG;
    let outB = fgB + lum * dB;

    // When smartContrast is active, preserve subtle chroma on colored diagrams/callouts
    if (smartContrast) {
      const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
      const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
      const chroma = maxC - minC;

      if (chroma > 38) {
        const gray = lum * 255;
        const chromaWeight = 0.42;
        outR = Math.min(255, Math.max(0, outR + (r - gray) * chromaWeight));
        outG = Math.min(255, Math.max(0, outG + (g - gray) * chromaWeight));
        outB = Math.min(255, Math.max(0, outB + (b - gray) * chromaWeight));
      }
    }

    dst[i] = outR;
    dst[i + 1] = outG;
    dst[i + 2] = outB;
    dst[i + 3] = a;
  }

  return output;
}

/**
 * Exports all pages of the currently loaded PDFDocumentProxy with the active
 * background and ink color transformation baked into each page.
 * Releases canvas and page memory after every single page to prevent OOM on large files.
 */
export async function exportRecoloredPdf(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  colorConfig: PdfColorConfig,
  originalFilename: string,
  onProgress: (current: number, total: number) => void
): Promise<void> {
  const totalPages = pdfDoc.numPages;
  let exportDoc: jsPDF | null = null;
  // Adaptive export scale so large multi-hundred-page PDFs do not exceed browser memory limits
  const exportScale = totalPages > 60 ? 1.35 : 1.75;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1.0 });
    const exportViewport = page.getViewport({ scale: exportScale });

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = Math.floor(exportViewport.width);
    offscreenCanvas.height = Math.floor(exportViewport.height);
    const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

      await page.render({
        canvasContext: ctx,
        viewport: exportViewport,
        canvas: offscreenCanvas,
      }).promise;

      const rawImageData = ctx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      const coloredImageData = transformPdfImageData(rawImageData, colorConfig);
      ctx.putImageData(coloredImageData, 0, 0);

      const imgDataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.88);
      const orientation = baseViewport.width > baseViewport.height ? 'landscape' : 'portrait';

      if (!exportDoc) {
        exportDoc = new jsPDF({
          orientation,
          unit: 'pt',
          format: [baseViewport.width, baseViewport.height],
          compress: true,
        });
      } else {
        exportDoc.addPage([baseViewport.width, baseViewport.height], orientation);
      }

      exportDoc.addImage(
        imgDataUrl,
        'JPEG',
        0,
        0,
        baseViewport.width,
        baseViewport.height,
        undefined,
        'FAST'
      );
    }

    // Immediate memory cleanup after each page
    offscreenCanvas.width = 0;
    offscreenCanvas.height = 0;
    page.cleanup();

    // Yield to browser GC & UI thread
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (exportDoc) {
    const cleanBase = originalFilename.replace(/\.pdf$/i, '');
    const suffix =
      colorConfig.presetId === 'custom'
        ? colorConfig.bgColor.replace('#', '')
        : colorConfig.presetId;
    exportDoc.save(`${cleanBase}-${suffix}.pdf`);
  }
}
