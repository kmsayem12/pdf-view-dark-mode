import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { PdfColorConfig } from '../types/pdf';
import { transformPdfImageData } from '../utils/pdfEngine';

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  colorConfig: PdfColorConfig;
  isCurrentPage: boolean;
  onPageVisible?: (pageNumber: number) => void;
  onBaseDimensionsKnown?: (width: number, height: number) => void;
}

export const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  scale,
  colorConfig,
  isCurrentPage,
  onPageVisible,
  onBaseDimensionsKnown,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const baseImageDataRef = useRef<ImageData | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: Math.round(595 * scale),
    height: Math.round(842 * scale),
  });
  const [isRendering, setIsRendering] = useState<boolean>(true);

  // Observe page visibility to update active page indicator on scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onPageVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
            onPageVisible(pageNumber);
          }
        });
      },
      { threshold: [0.45, 0.75] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onPageVisible]);

  // Step 1: Render base PDF page vector data via PDF.js when document, page, or zoom scale changes
  useEffect(() => {
    let isCancelled = false;

    async function renderBasePage() {
      setIsRendering(true);
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // Ignore cancellation errors
          }
        }

        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        const unscaledViewport = page.getViewport({ scale: 1.0 });
        if (pageNumber === 1 && onBaseDimensionsKnown) {
          onBaseDimensionsKnown(unscaledViewport.width, unscaledViewport.height);
        }

        const cssViewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const hiDpiViewport = page.getViewport({ scale: scale * dpr });

        const cssW = Math.floor(cssViewport.width);
        const cssH = Math.floor(cssViewport.height);
        const pixelW = Math.floor(hiDpiViewport.width);
        const pixelH = Math.floor(hiDpiViewport.height);

        setDimensions({ width: cssW, height: cssH });

        const offscreen = document.createElement('canvas');
        offscreen.width = pixelW;
        offscreen.height = pixelH;
        const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!offCtx) return;

        offCtx.fillStyle = '#FFFFFF';
        offCtx.fillRect(0, 0, pixelW, pixelH);

        const task = page.render({
          canvasContext: offCtx,
          viewport: hiDpiViewport,
          canvas: offscreen,
        });
        renderTaskRef.current = task;

        await task.promise;
        if (isCancelled) return;

        const rawData = offCtx.getImageData(0, 0, pixelW, pixelH);
        baseImageDataRef.current = rawData;

        // Paint immediately with current colorConfig
        const displayCanvas = displayCanvasRef.current;
        if (displayCanvas) {
          displayCanvas.width = pixelW;
          displayCanvas.height = pixelH;
          const displayCtx = displayCanvas.getContext('2d');
          if (displayCtx) {
            const transformed = transformPdfImageData(rawData, colorConfig);
            displayCtx.putImageData(transformed, 0, 0);
          }
        }
        setIsRendering(false);
      } catch (err: unknown) {
        const errorName = err instanceof Error ? err.name : '';
        if (!isCancelled && errorName !== 'RenderingCancelledException') {
          setIsRendering(false);
        }
      }
    }

    renderBasePage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore
        }
      }
    };
  }, [pdfDoc, pageNumber, scale]);

  // Step 2: Instantaneous recoloring when background color, dark mode, or contrast changes
  useEffect(() => {
    const rawData = baseImageDataRef.current;
    const displayCanvas = displayCanvasRef.current;
    if (!rawData || !displayCanvas) return;

    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    const transformed = transformPdfImageData(rawData, colorConfig);
    ctx.putImageData(transformed, 0, 0);
  }, [colorConfig]);

  return (
    <div
      ref={containerRef}
      id={`pdf-page-${pageNumber}`}
      className="group relative flex flex-col items-center transition-transform duration-150"
    >
      {/* Page Frame */}
      <div
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          backgroundColor: colorConfig.bgColor,
        }}
        className={`relative overflow-hidden rounded-sm transition-shadow duration-150 ${
          isCurrentPage
            ? 'ring-2 ring-indigo-600 dark:ring-indigo-500 shadow-lg'
            : 'ring-1 ring-slate-300/80 dark:ring-slate-800 shadow-md'
        }`}
      >
        <canvas
          ref={displayCanvasRef}
          style={{
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
          }}
          className="block"
        />

        {isRendering && (
          <div
            style={{ backgroundColor: colorConfig.bgColor }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-90"
          >
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <span
              style={{ color: colorConfig.textColor }}
              className="font-mono text-xs opacity-70"
            >
              Rendering page {pageNumber}...
            </span>
          </div>
        )}
      </div>

      {/* Subtle Unboxed Page Footer Label */}
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
        <span>Page {String(pageNumber).padStart(2, '0')}</span>
        <span aria-hidden="true">·</span>
        <span>{colorConfig.bgColor.toUpperCase()}</span>
      </div>
    </div>
  );
};
