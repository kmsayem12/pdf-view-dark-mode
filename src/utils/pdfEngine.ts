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
 * Generates a 3-page sample PDF in memory so users can test background recoloring
 * and Light/Dark toggles immediately, or upload their own PDF.
 */
export function createSamplePdfArrayBuffer(): ArrayBuffer {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 52;
  const contentWidth = pageWidth - margin * 2;

  // --- PAGE 1 ---
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229);
  doc.text('FOLIOTONE TECHNICAL SPECIFICATION  ·  DOCUMENT 01', margin, 56);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(15, 23, 42);
  doc.text('Optical Contrast & Dynamic PDF Surfaces', margin, 90);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Authors: Optical Ergonomics Working Group   ·   Published: November 2026   ·   Pages: 3',
    margin,
    112
  );

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(1);
  doc.line(margin, 126, pageWidth - margin, 126);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Executive Summary', margin, 154);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  const p1 = doc.splitTextToSize(
    'Traditional Portable Document Format (PDF) files assume a fixed, high-luminance white paper substrate (#FFFFFF). While ideal for physical laser printing, prolonged reading on self-illuminated displays in low-light environments introduces visual fatigue and glare. FolioTone solves this by decoupling the vector page luminance from the background canvas color in real time.',
    contentWidth
  );
  doc.text(p1, margin, 174);

  // Diagram Box
  doc.setDrawColor(148, 163, 184);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, 240, contentWidth, 130, 6, 6, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Figure 1.1 — Luminance Interpolation Pipeline', margin + 18, 265);

  // Inside Diagram nodes
  doc.setDrawColor(79, 70, 229);
  doc.setFillColor(238, 242, 255);
  doc.roundedRect(margin + 18, 282, 135, 64, 4, 4, 'FD');
  doc.setFontSize(9.5);
  doc.setTextColor(49, 46, 129);
  doc.text('PDF.js Vector Parse', margin + 30, 308);
  doc.setFont('helvetica', 'normal');
  doc.text('Base Canvas Raster', margin + 30, 324);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('--->', margin + 165, 316);

  doc.setDrawColor(16, 185, 129);
  doc.setFillColor(236, 253, 245);
  doc.roundedRect(margin + 195, 282, 145, 64, 4, 4, 'FD');
  doc.setTextColor(6, 95, 70);
  doc.text('Luminance Mapping', margin + 209, 308);
  doc.setFont('helvetica', 'normal');
  doc.text('L = 0.299R + 0.587G + 0.114B', margin + 205, 324);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('--->', margin + 352, 316);

  doc.setDrawColor(217, 119, 6);
  doc.setFillColor(254, 243, 199);
  doc.roundedRect(margin + 380, 282, 95, 64, 4, 4, 'FD');
  doc.setTextColor(146, 64, 14);
  doc.text('Custom Theme', margin + 392, 308);
  doc.setFont('helvetica', 'normal');
  doc.text('Dark / Sepia / Hex', margin + 388, 324);

  // Section 2
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Comparative Photometric Benchmarks', margin, 405);

  const tableTop = 424;
  const rowH = 26;
  const cols = [margin, margin + 130, margin + 260, margin + 380];

  doc.setFillColor(241, 245, 249);
  doc.rect(margin, tableTop, contentWidth, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Theme Preset', cols[0] + 10, tableTop + 17);
  doc.text('Background Hex', cols[1] + 10, tableTop + 17);
  doc.text('Foreground Ink', cols[2] + 10, tableTop + 17);
  doc.text('Contrast Ratio', cols[3] + 10, tableTop + 17);

  const rows = [
    ['Light Studio (Default)', '#FFFFFF', '#0F172A', '18.1 : 1 (AAA)'],
    ['Obsidian Dark Mode', '#121620', '#E2E8F0', '13.4 : 1 (AAA)'],
    ['Archival Warm Sepia', '#F4ECD8', '#2C221E', '12.6 : 1 (AAA)'],
    ['Midnight Navy Custom', '#0D1B2A', '#E0E1DD', '12.9 : 1 (AAA)'],
  ];

  doc.setFont('helvetica', 'normal');
  rows.forEach((r, idx) => {
    const y = tableTop + rowH * (idx + 1);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    doc.setTextColor(30, 41, 59);
    doc.text(r[0], cols[0] + 10, y + 17);
    doc.text(r[1], cols[1] + 10, y + 17);
    doc.text(r[2], cols[2] + 10, y + 17);
    doc.text(r[3], cols[3] + 10, y + 17);
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  const p2 = doc.splitTextToSize(
    'Use the toolbar above to toggle between Light and Dark modes, test the warm Sepia preset, or open the Custom Color Picker to apply any background color to this document.',
    contentWidth
  );
  doc.text(p2, margin, 595);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Page 1 of 3  ·  FolioTone Sample Document', margin, 785);

  // --- PAGE 2 ---
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229);
  doc.text('FOLIOTONE TECHNICAL SPECIFICATION  ·  SECTION 3', margin, 56);

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Typography & High-DPI Vector Rendering', margin, 86);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  const p3 = doc.splitTextToSize(
    'When rendering technical papers, mathematical notation, and dense financial reports, maintaining crisp glyph boundaries across zoom levels (50% to 300%) is essential. FolioTone multiplies the viewport scale by the hardware devicePixelRatio so fonts remain razor-sharp on Retina and 4K displays.',
    contentWidth
  );
  doc.text(p3, margin, 112);

  // Code block sample
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, 175, contentWidth, 120, 6, 6, 'FD');
  doc.setFont('courier', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('// Pixel Luminance Interpolation Kernel', margin + 16, 200);
  doc.setFont('courier', 'normal');
  doc.text('const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;', margin + 16, 220);
  doc.text('const outR = fgR + lum * (bgR - fgR);', margin + 16, 238);
  doc.text('const outG = fgG + lum * (bgG - fgG);', margin + 16, 256);
  doc.text('const outB = fgB + lum * (bgB - fgB);', margin + 16, 274);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Preserving Semantic Highlights in Dark Mode', margin, 335);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  const p4 = doc.splitTextToSize(
    'Unlike naive CSS invert(1) filters that turn blue links into orange and green indicators into magenta, smart contrast recoloring preserves chromatic saturation offsets while flipping the underlying paper luminance.',
    contentWidth
  );
  doc.text(p4, margin, 358);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Page 2 of 3  ·  FolioTone Sample Document', margin, 785);

  // --- PAGE 3 ---
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229);
  doc.text('FOLIOTONE TECHNICAL SPECIFICATION  ·  SECTION 5', margin, 56);

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('5. Client-Side Themed PDF Export Architecture', margin, 86);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);
  const p5 = doc.splitTextToSize(
    'Every background color customization in FolioTone can be permanently exported into a standalone PDF file. Clicking "Export Colored PDF" renders each page with your active background color and contrast settings, compiling a new document ready for offline reading on tablets or e-readers.',
    contentWidth
  );
  doc.text(p5, margin, 112);

  doc.setDrawColor(79, 70, 229);
  doc.setFillColor(238, 242, 255);
  doc.roundedRect(margin, 180, contentWidth, 90, 6, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(49, 46, 129);
  doc.text('Ready to Upload Your Own PDF?', margin + 20, 208);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(55, 48, 163);
  doc.text(
    'Click "Upload PDF" in the top right bar or drag and drop any .pdf file onto the window.',
    margin + 20,
    228
  );
  doc.text(
    'All processing happens 100% locally in your browser with zero server upload delay.',
    margin + 20,
    246
  );

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Page 3 of 3  ·  FolioTone Sample Document', margin, 785);

  return doc.output('arraybuffer');
}

/**
 * Exports all pages of the currently loaded PDFDocumentProxy with the active
 * background and ink color transformation baked into each page.
 */
export async function exportRecoloredPdf(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  colorConfig: PdfColorConfig,
  originalFilename: string,
  onProgress: (current: number, total: number) => void
): Promise<void> {
  const totalPages = pdfDoc.numPages;
  let exportDoc: jsPDF | null = null;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress(pageNum, totalPages);
    const page = await pdfDoc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1.0 });
    // High-resolution 2x scale for crisp exported text
    const exportViewport = page.getViewport({ scale: 2.0 });

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = exportViewport.width;
    offscreenCanvas.height = exportViewport.height;
    const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) continue;

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

    const imgDataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.92);
    const orientation = baseViewport.width > baseViewport.height ? 'landscape' : 'portrait';

    if (!exportDoc) {
      exportDoc = new jsPDF({
        orientation,
        unit: 'pt',
        format: [baseViewport.width, baseViewport.height],
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

  if (exportDoc) {
    const cleanBase = originalFilename.replace(/\.pdf$/i, '');
    const suffix = colorConfig.presetId === 'custom' ? colorConfig.bgColor.replace('#', '') : colorConfig.presetId;
    exportDoc.save(`${cleanBase}-${suffix}.pdf`);
  }
}
