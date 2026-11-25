import React, { useEffect, useRef } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { PdfColorConfig } from '../types/pdf';
import { transformPdfImageData } from '../utils/pdfEngine';

interface ThumbnailItemProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  colorConfig: PdfColorConfig;
  isActive: boolean;
  onSelect: (pageNumber: number) => void;
}

const ThumbnailItem: React.FC<ThumbnailItemProps> = ({
  pdfDoc,
  pageNumber,
  colorConfig,
  isActive,
  onSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseDataRef = useRef<ImageData | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isActive && buttonRef.current) {
      buttonRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  useEffect(() => {
    let isCancelled = false;

    async function renderThumb() {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: 0.28 });
        const w = Math.floor(viewport.width);
        const h = Math.floor(viewport.height);

        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!offCtx) return;

        offCtx.fillStyle = '#FFFFFF';
        offCtx.fillRect(0, 0, w, h);

        const task = page.render({
          canvasContext: offCtx,
          viewport,
          canvas: offscreen,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (isCancelled) return;

        const rawData = offCtx.getImageData(0, 0, w, h);
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
        // Ignore cancellation
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
      }
    };
  }, [pdfDoc, pageNumber]);

  useEffect(() => {
    const rawData = baseDataRef.current;
    const canvas = canvasRef.current;
    if (!rawData || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(transformPdfImageData(rawData, colorConfig), 0, 0);
  }, [colorConfig]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onSelect(pageNumber)}
      className={`group w-full flex flex-col items-center p-2.5 rounded-lg transition-colors text-left focus-visible:outline-2 focus-visible:outline-indigo-600 ${
        isActive
          ? 'bg-indigo-50/90 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-600 dark:text-slate-400'
      }`}
    >
      <div
        style={{ backgroundColor: colorConfig.bgColor }}
        className={`overflow-hidden rounded-xs transition-all ${
          isActive
            ? 'ring-2 ring-indigo-600 dark:ring-indigo-400 shadow-sm'
            : 'ring-1 ring-slate-300 dark:ring-slate-700 group-hover:ring-slate-400 dark:group-hover:ring-slate-600'
        }`}
      >
        <canvas ref={canvasRef} className="block max-w-[150px] h-auto" />
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
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {pages.map((pageNumber) => (
          <ThumbnailItem
            key={pageNumber}
            pdfDoc={pdfDoc}
            pageNumber={pageNumber}
            colorConfig={colorConfig}
            isActive={pageNumber === currentPage}
            onSelect={onSelectPage}
          />
        ))}
      </div>
    </aside>
  );
};
