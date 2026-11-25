import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { PdfColorConfig } from '../types/pdf';
import { transformPdfImageData } from '../utils/pdfEngine';

interface ThumbnailItemProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  colorConfig: PdfColorConfig;
  isActive: boolean;
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (pageNumber: number) => void;
}

const ThumbnailItem: React.FC<ThumbnailItemProps> = ({
  pdfDoc,
  pageNumber,
  colorConfig,
  isActive,
  scrollRootRef,
  onSelect,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseDataRef = useRef<ImageData | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  // Lazy-load thumbnails only when scrolled near the sidebar viewport
  const [isVisibleInSidebar, setIsVisibleInSidebar] = useState<boolean>(pageNumber <= 8);

  useEffect(() => {
    if (isActive && buttonRef.current) {
      buttonRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisibleInSidebar(entry.isIntersecting);
        });
      },
      {
        root: scrollRootRef.current,
        rootMargin: '260px 0px 260px 0px',
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRootRef]);

  useEffect(() => {
    let isCancelled = false;

    if (!isVisibleInSidebar) {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore
        }
        renderTaskRef.current = null;
      }
      baseDataRef.current = null;
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      return;
    }

    async function renderThumb() {
      let pageObj: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null;
      try {
        pageObj = await pdfDoc.getPage(pageNumber);
        if (isCancelled) {
          pageObj.cleanup();
          return;
        }

        const unscaled = pageObj.getViewport({ scale: 1.0 });
        const targetScale = Math.min(0.26, 140 / Math.max(1, unscaled.width));
        const viewport = pageObj.getViewport({ scale: targetScale });
        const w = Math.max(1, Math.floor(viewport.width));
        const h = Math.max(1, Math.floor(viewport.height));

        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!offCtx) {
          pageObj.cleanup();
          return;
        }

        offCtx.fillStyle = '#FFFFFF';
        offCtx.fillRect(0, 0, w, h);

        const task = pageObj.render({
          canvasContext: offCtx,
          viewport,
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

        const rawData = offCtx.getImageData(0, 0, w, h);
        offscreen.width = 0;
        offscreen.height = 0;
        pageObj.cleanup();

        baseDataRef.current = rawData;

        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.putImageData(transformPdfImageData(rawData, colorConfig), 0, 0);
          }
        }
      } catch {
        if (pageObj) {
          try {
            pageObj.cleanup();
          } catch {
            // Ignore
          }
        }
      }
    }

    renderThumb();

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
  }, [pdfDoc, pageNumber, isVisibleInSidebar]);

  useEffect(() => {
    if (!isVisibleInSidebar) return;
    const rawData = baseDataRef.current;
    const canvas = canvasRef.current;
    if (!rawData || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(transformPdfImageData(rawData, colorConfig), 0, 0);
  }, [colorConfig, isVisibleInSidebar]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onSelect(pageNumber)}
      className={`group w-full flex flex-col items-center p-2.5 rounded-lg transition-colors text-left focus-visible:outline-2 focus-visible:outline-indigo-600 cursor-pointer ${
        isActive
          ? 'bg-indigo-50/90 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
      }`}
    >
      <div
        style={{
          backgroundColor: colorConfig.bgColor,
          minWidth: '132px',
          minHeight: '186px',
        }}
        className={`overflow-hidden rounded-xs flex items-center justify-center transition-all ${
          isActive
            ? 'ring-2 ring-indigo-600 dark:ring-indigo-400 shadow-sm'
            : 'ring-1 ring-slate-300 dark:ring-slate-700 group-hover:ring-slate-400 dark:group-hover:ring-slate-600'
        }`}
      >
        {isVisibleInSidebar ? (
          <canvas ref={canvasRef} className="block max-w-[140px] h-auto" />
        ) : (
          <span
            style={{ color: colorConfig.textColor }}
            className="font-mono text-[11px] opacity-50"
          >
            {pageNumber}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between w-full px-2 text-xs font-mono">
        <span>Page {String(pageNumber).padStart(2, '0')}</span>
        {isActive && <span className="font-sans font-medium text-[11px]">Active</span>}
      </div>
    </button>
  );
};

interface ThumbnailSidebarProps {
  pdfDoc: PDFDocumentProxy;
  currentPage: number;
  colorConfig: PdfColorConfig;
  isOpen: boolean;
  onSelectPage: (pageNumber: number) => void;
}

export const ThumbnailSidebar: React.FC<ThumbnailSidebarProps> = ({
  pdfDoc,
  currentPage,
  colorConfig,
  isOpen,
  onSelectPage,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen) return null;

  const pages = Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);

  return (
    <aside
      aria-label="PDF Page Thumbnails"
      className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full select-none"
    >
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-tight text-slate-700 dark:text-slate-300">
          Page Thumbnails
        </span>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
          {pdfDoc.numPages} {pdfDoc.numPages === 1 ? 'page' : 'pages'}
        </span>
      </div>
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {pages.map((pageNumber) => (
          <ThumbnailItem
            key={pageNumber}
            pdfDoc={pdfDoc}
            pageNumber={pageNumber}
            colorConfig={colorConfig}
            isActive={pageNumber === currentPage}
            scrollRootRef={scrollContainerRef}
            onSelect={onSelectPage}
          />
        ))}
      </div>
    </aside>
  );
};
