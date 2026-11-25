import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { PdfColorConfig } from '../types/pdf';
import { transformPdfImageData } from '../utils/pdfEngine';

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  defaultBaseWidth: number;
  defaultBaseHeight: number;
  colorConfig: PdfColorConfig;
  isCurrentPage: boolean;
  onPageVisible?: (pageNumber: number) => void;
}

export const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  scale,
  defaultBaseWidth,
  defaultBaseHeight,
  colorConfig,
  isCurrentPage,
  onPageVisible,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageDataRef = useRef<ImageData | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  // Track exact unscaled dimensions of this page once loaded (defaults to Page 1 size)
  const [pageBaseSize, setPageBaseSize] = useState<{ width: number; height: number }>({
    width: defaultBaseWidth,
    height: defaultBaseHeight,
  });

  // Whether this page is within the virtualized render window (viewport + 900px buffer)
  const [isNearViewport, setIsNearViewport] = useState<boolean>(pageNumber <= 2);
  const [isRendering, setIsRendering] = useState<boolean>(false);

  // Sync defaultBaseWidth / defaultBaseHeight if page hasn't fetched its own dimensions yet
  useEffect(() => {
    setPageBaseSize((prev) => {
      if (prev.width === 595 && prev.height === 842) {
        return { width: defaultBaseWidth, height: defaultBaseHeight };
      }
      return prev;
    });
  }, [defaultBaseWidth, defaultBaseHeight]);

  const cssWidth = Math.floor(pageBaseSize.width * scale);
  const cssHeight = Math.floor(pageBaseSize.height * scale);

  // Observer 1: Virtualization Buffer Observer (mounts/renders canvas near viewport, evicts memory far offscreen)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const bufferObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsNearViewport(entry.isIntersecting);
        });
      },
      {
        rootMargin: '900px 0px 900px 0px',
        threshold: 0,
      }
    );

    bufferObserver.observe(el);
    return () => bufferObserver.disconnect();
  }, []);

  // Observer 2: Active Page Indicator Observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onPageVisible) return;

    const activeObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            onPageVisible(pageNumber);
          }
        });
      },
      { threshold: [0.4, 0.7] }
    );

    activeObserver.observe(el);
    return () => activeObserver.disconnect();
  }, [pageNumber, onPageVisible]);

  // Step 1: Render base PDF page ONLY when isNearViewport is true; evict memory immediately when false
  useEffect(() => {
    let isCancelled = false;

    if (!isNearViewport) {
      // Cancel any in-flight render task and deallocate memory for offscreen pages
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore
        }
        renderTaskRef.current = null;
      }
      baseImageDataRef.current = null;
      if (displayCanvasRef.current) {
        displayCanvasRef.current.width = 0;
        displayCanvasRef.current.height = 0;
      }
      setIsRendering(false);
      return;
    }

    async function renderVisiblePage() {
      setIsRendering(true);
      let pageObj: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null;
      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // Ignore
          }
        }

        pageObj = await pdfDoc.getPage(pageNumber);
        if (isCancelled) {
          pageObj.cleanup();
          return;
        }

        const unscaledViewport = pageObj.getViewport({ scale: 1.0 });
        setPageBaseSize({
          width: unscaledViewport.width,
          height: unscaledViewport.height,
        });

        // Cap total raster pixels per canvas (~4.5M pixels max) so huge pages or high zoom never spike RAM
        const rawDpr = Math.min(window.devicePixelRatio || 1, 1.75);
        const estimatedPixels =
          unscaledViewport.width * scale * rawDpr * (unscaledViewport.height * scale * rawDpr);
        const maxAllowedPixels = 4_200_000;
        const safeDpr =
          estimatedPixels > maxAllowedPixels
            ? rawDpr * Math.sqrt(maxAllowedPixels / estimatedPixels)
            : rawDpr;

        const hiDpiViewport = pageObj.getViewport({ scale: scale * safeDpr });
        const pixelW = Math.max(1, Math.floor(hiDpiViewport.width));
        const pixelH = Math.max(1, Math.floor(hiDpiViewport.height));

        const offscreen = document.createElement('canvas');
        offscreen.width = pixelW;
        offscreen.height = pixelH;
        const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!offCtx) {
          pageObj.cleanup();
          return;
        }

        offCtx.fillStyle = '#FFFFFF';
        offCtx.fillRect(0, 0, pixelW, pixelH);

        const task = pageObj.render({
          canvasContext: offCtx,
          viewport: hiDpiViewport,
          canvas: offscreen,
        });
        renderTaskRef.current = task;

        await task.promise;
        if (isCancelled) {
          offscreen.width = 0;
          offscreen.height = 0;
          pageObj.cleanup();
          return;
        }

        const rawData = offCtx.getImageData(0, 0, pixelW, pixelH);
        // Free temporary offscreen canvas and PDF.js page resources right away
        offscreen.width = 0;
        offscreen.height = 0;
        pageObj.cleanup();

        baseImageDataRef.current = rawData;

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
        if (pageObj) {
          try {
            pageObj.cleanup();
          } catch {
            // Ignore
          }
        }
        const errorName = err instanceof Error ? err.name : '';
        if (!isCancelled && errorName !== 'RenderingCancelledException') {
          setIsRendering(false);
        }
      }
    }

    renderVisiblePage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNumber, scale, isNearViewport]);

  // Step 2: Instantaneous recoloring for currently mounted/visible pages when background color changes
  useEffect(() => {
    if (!isNearViewport) return;
    const rawData = baseImageDataRef.current;
    const displayCanvas = displayCanvasRef.current;
    if (!rawData || !displayCanvas) return;

    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    const transformed = transformPdfImageData(rawData, colorConfig);
    ctx.putImageData(transformed, 0, 0);
  }, [colorConfig, isNearViewport]);

  return (
    <div
      ref={containerRef}
      id={`pdf-page-${pageNumber}`}
      className="group relative flex flex-col items-center"
    >
      {/* Fixed-Dimension Page Frame preserves exact scroll height even when offscreen canvas is evicted */}
      <div
        style={{
          width: `${cssWidth}px`,
          height: `${cssHeight}px`,
          backgroundColor: colorConfig.bgColor,
        }}
        className={`relative overflow-hidden rounded-sm transition-shadow duration-150 ${
          isCurrentPage
            ? 'ring-2 ring-indigo-600 dark:ring-indigo-500 shadow-lg'
            : 'ring-1 ring-slate-300/80 dark:ring-slate-800 shadow-md'
        }`}
      >
        {isNearViewport && (
          <canvas
            ref={displayCanvasRef}
            style={{
              width: `${cssWidth}px`,
              height: `${cssHeight}px`,
            }}
            className="block"
          />
        )}

        {(isRendering || !isNearViewport) && (
          <div
            style={{ backgroundColor: colorConfig.bgColor }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-90"
          >
            {isRendering && (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            )}
            <span
              style={{ color: colorConfig.textColor }}
              className="font-mono text-xs opacity-60"
            >
              Page {pageNumber}
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
