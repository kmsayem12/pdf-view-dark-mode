import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  Sun,
  Moon,
  PanelLeft,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Palette,
  Maximize2,
  MoveHorizontal,
  AlertCircle,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
import {
  THEME_PRESETS,
  type FitMode,
  type LoadedDocumentMeta,
  type PdfColorConfig,
  type PdfThemePresetId,
} from './types/pdf';
import {
  createSamplePdfArrayBuffer,
  exportRecoloredPdf,
  getHexLuminance,
  pdfjsLib,
} from './utils/pdfEngine';
import { PdfPageCanvas } from './components/PdfPageCanvas';
import { ThumbnailSidebar } from './components/ThumbnailSidebar';
import { ColorPickerPopover } from './components/ColorPickerPopover';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export default function App() {
  // UI Dark Mode state synced with <html class="dark">
  const [isDarkUi, setIsDarkUi] = useState<boolean>(false);

  // PDF Background & Contrast Recoloring state
  const [colorConfig, setColorConfig] = useState<PdfColorConfig>({
    presetId: 'light',
    bgColor: THEME_PRESETS.light.bgColor,
    textColor: THEME_PRESETS.light.textColor,
    smartContrast: true,
    label: THEME_PRESETS.light.label,
  });

  // Document & PDF.js state
  const [docMeta, setDocMeta] = useState<LoadedDocumentMeta | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Viewer navigation & layout state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInputText, setPageInputText] = useState<string>('1');
  const [zoomScale, setZoomScale] = useState<number>(1.2);
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [basePageSize, setBasePageSize] = useState<{ width: number; height: number }>({
    width: 595,
    height: 842,
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState<boolean>(false);

  // Export state
  const [exportProgress, setExportProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [exportSuccessToast, setExportSuccessToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportStageRef = useRef<HTMLDivElement>(null);
  const popoverWrapperRef = useRef<HTMLDivElement>(null);

  // Sync <html class="dark"> with isDarkUi
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkUi) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkUi]);

  // Close custom color popover on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (
        isColorPopoverOpen &&
        popoverWrapperRef.current &&
        !popoverWrapperRef.current.contains(e.target as Node)
      ) {
        setIsColorPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isColorPopoverOpen]);

  // Recalculate zoom scale when fitMode is 'width' or 'page' and stage resizes
  const computeFittedScale = useCallback(
    (mode: FitMode, pageW: number, pageH: number) => {
      const stage = viewportStageRef.current;
      if (!stage || mode === 'manual') return;

      const availableW = Math.max(320, stage.clientWidth - 64);
      const availableH = Math.max(320, stage.clientHeight - 56);

      if (mode === 'width') {
        const target = Math.min(2.2, Math.max(0.5, availableW / pageW));
        setZoomScale(Number(target.toFixed(2)));
      } else if (mode === 'page') {
        const scaleW = availableW / pageW;
        const scaleH = availableH / pageH;
        const target = Math.min(2.2, Math.max(0.45, Math.min(scaleW, scaleH)));
        setZoomScale(Number(target.toFixed(2)));
      }
    },
    []
  );

  useEffect(() => {
    const stage = viewportStageRef.current;
    if (!stage || fitMode === 'manual') return;

    const observer = new ResizeObserver(() => {
      computeFittedScale(fitMode, basePageSize.width, basePageSize.height);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [fitMode, basePageSize, computeFittedScale, isSidebarOpen]);

  // Load PDF from an ArrayBuffer
  const loadPdfFromBuffer = useCallback(
    async (buffer: ArrayBuffer, filename: string, sizeBytes: number, isSample = false) => {
      setIsLoadingDoc(true);
      setErrorMsg(null);
      try {
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const pdfDoc = await loadingTask.promise;

        setDocMeta({
          name: filename,
          sizeBytes,
          numPages: pdfDoc.numPages,
          pdfDoc,
          isSample,
        });
        setCurrentPage(1);
        setPageInputText('1');
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to parse PDF file. Please choose a valid PDF document.';
        setErrorMsg(`Failed to open PDF: ${msg}`);
      } finally {
        setIsLoadingDoc(false);
      }
    },
    []
  );

  // Handle file selection from input or drag-and-drop
  const handleFileUpload = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setErrorMsg('Please select a valid PDF document (.pdf).');
        return;
      }
      const arrayBuffer = await file.arrayBuffer();
      await loadPdfFromBuffer(arrayBuffer, file.name, file.size, false);
    },
    [loadPdfFromBuffer]
  );

  // Load built-in 3-page sample PDF
  const handleLoadSamplePdf = useCallback(async () => {
    const buffer = createSamplePdfArrayBuffer();
    await loadPdfFromBuffer(
      buffer,
      'FolioTone-Optical-Contrast-Spec.pdf',
      buffer.byteLength,
      true
    );
  }, [loadPdfFromBuffer]);

  // Quick Toggle between Light and Dark mode (both UI and PDF background)
  const handleToggleLightDark = () => {
    const nextIsDark = !isDarkUi;
    setIsDarkUi(nextIsDark);
    const preset = nextIsDark ? THEME_PRESETS.dark : THEME_PRESETS.light;
    setColorConfig((prev) => ({
      ...prev,
      presetId: preset.id,
      bgColor: preset.bgColor,
      textColor: preset.textColor,
      label: preset.label,
    }));
  };

  // Select a specific preset ('light' | 'dark' | 'sepia')
  const handleSelectPreset = (presetId: Exclude<PdfThemePresetId, 'custom'>) => {
    const preset = THEME_PRESETS[presetId];
    setIsDarkUi(preset.isDarkUi);
    setColorConfig((prev) => ({
      ...prev,
      presetId: preset.id,
      bgColor: preset.bgColor,
      textColor: preset.textColor,
      label: preset.label,
    }));
  };

  // Update custom background & ink colors from the ColorPickerPopover
  const handleUpdateCustomColors = (
    bgColor: string,
    textColor: string,
    label = 'Custom',
    syncDarkUi?: boolean
  ) => {
    const shouldUseDarkUi =
      typeof syncDarkUi === 'boolean' ? syncDarkUi : getHexLuminance(bgColor) < 0.45;
    setIsDarkUi(shouldUseDarkUi);
    setColorConfig((prev) => ({
      ...prev,
      presetId: 'custom',
      bgColor,
      textColor,
      label,
    }));
  };

  // Scroll to a specific PDF page
  const scrollToPage = (targetPage: number) => {
    if (!docMeta) return;
    const clamped = Math.max(1, Math.min(docMeta.numPages, targetPage));
    setCurrentPage(clamped);
    setPageInputText(String(clamped));
    const pageEl = document.getElementById(`pdf-page-${clamped}`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Handle visibility callback from IntersectionObserver
  const handlePageVisible = useCallback((visiblePage: number) => {
    setCurrentPage(visiblePage);
    setPageInputText(String(visiblePage));
  }, []);

  // Handle base dimensions callback from Page 1
  const handleBaseDimensionsKnown = useCallback(
    (w: number, h: number) => {
      setBasePageSize((prev) => {
        if (Math.abs(prev.width - w) < 1 && Math.abs(prev.height - h) < 1) {
          return prev;
        }
        return { width: w, height: h };
      });
      if (fitMode !== 'manual') {
        computeFittedScale(fitMode, w, h);
      }
    },
    [fitMode, computeFittedScale]
  );

  // Zoom adjustment handlers
  const handleZoomStep = (delta: number) => {
    setFitMode('manual');
    setZoomScale((prev) => {
      const next = Math.min(3.0, Math.max(0.5, Number((prev + delta).toFixed(2))));
      return next;
    });
  };

  const handleSelectFitMode = (mode: FitMode) => {
    setFitMode(mode);
    computeFittedScale(mode, basePageSize.width, basePageSize.height);
  };

  // Export recolored PDF
  const handleExportColoredPdf = async () => {
    if (!docMeta || exportProgress) return;
    setExportSuccessToast(null);
    try {
      await exportRecoloredPdf(
        docMeta.pdfDoc,
        colorConfig,
        docMeta.name,
        (current, total) => setExportProgress({ current, total })
      );
      setExportSuccessToast(`Saved recolored PDF (${colorConfig.bgColor.toUpperCase()})`);
      setTimeout(() => setExportSuccessToast(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error exporting PDF';
      setErrorMsg(msg);
    } finally {
      setExportProgress(null);
    }
  };

  const pagesArray = docMeta
    ? Array.from({ length: docMeta.numPages }, (_, idx) => idx + 1)
    : [];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setIsDraggingOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) {
          handleFileUpload(droppedFile);
        }
      }}
      className="h-screen w-screen overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150"
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) {
            handleFileUpload(selected);
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Zone 1, 2, 3 Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-white font-display whitespace-nowrap shrink-0"
        >
          FolioTone
        </a>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              fileInputRef.current?.click();
            }}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Open Local PDF
          </a>
          <a
            href="#sample"
            onClick={(e) => {
              e.preventDefault();
              handleLoadSamplePdf();
            }}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Sample Document
          </a>
          <a
            href="#color-studio"
            onClick={(e) => {
              e.preventDefault();
              setIsColorPopoverOpen((prev) => !prev);
            }}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Background Studio
          </a>
          {docMeta && (
            <a
              href="#export"
              onClick={(e) => {
                e.preventDefault();
                handleExportColoredPdf();
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Export Colored PDF
            </a>
          )}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload PDF
          </button>
        </div>
      </header>

      {/* Contextual Workspace Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 shrink-0">
        {/* Left Cluster: Document Info + Page Navigation */}
        <div className="flex items-center gap-3">
          {docMeta ? (
            <>
              <button
                type="button"
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                title={isSidebarOpen ? 'Hide thumbnails sidebar' : 'Show thumbnails sidebar'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSidebarOpen
                    ? 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60'
                }`}
              >
                <PanelLeft className="w-3.5 h-3.5" />
                <span>Thumbnails</span>
              </button>

              <div className="h-4 w-px bg-slate-300 dark:bg-slate-700" />

              {/* Page Step & Direct Page Jump */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => scrollToPage(currentPage - 1)}
                  aria-label="Previous Page"
                  className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const parsed = parseInt(pageInputText, 10);
                    if (!Number.isNaN(parsed)) {
                      scrollToPage(parsed);
                    } else {
                      setPageInputText(String(currentPage));
                    }
                  }}
                  className="flex items-center gap-1.5 text-xs font-mono"
                >
                  <input
                    type="text"
                    aria-label="Current page number"
                    value={pageInputText}
                    onChange={(e) => setPageInputText(e.target.value)}
                    onBlur={() => {
                      const parsed = parseInt(pageInputText, 10);
                      if (!Number.isNaN(parsed)) {
                        scrollToPage(parsed);
                      } else {
                        setPageInputText(String(currentPage));
                      }
                    }}
                    className="w-10 px-1.5 py-1 text-center rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:outline-2 focus:outline-indigo-600"
                  />
                  <span className="text-slate-500 dark:text-slate-400">
                    / {docMeta.numPages}
                  </span>
                </form>

                <button
                  type="button"
                  disabled={currentPage >= docMeta.numPages}
                  onClick={() => scrollToPage(currentPage + 1)}
                  aria-label="Next Page"
                  className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pl-2">
                <span className="truncate max-w-[180px] font-medium text-slate-700 dark:text-slate-300">
                  {docMeta.name}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{formatFileSize(docMeta.sizeBytes)}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>No PDF loaded</span>
              <span aria-hidden="true">·</span>
              <span>Upload a file or launch sample to inspect pages</span>
            </div>
          )}
        </div>

        {/* Center Cluster: Zoom & Fit Controls (shown when document is active) */}
        {docMeta && (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => handleZoomStep(-0.15)}
                aria-label="Zoom out"
                className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2.5 text-xs font-mono font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => handleZoomStep(0.15)}
                aria-label="Zoom in"
                className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="hidden sm:flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => handleSelectFitMode('width')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  fitMode === 'width'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <MoveHorizontal className="w-3.5 h-3.5" />
                Fit Width
              </button>
              <button
                type="button"
                onClick={() => handleSelectFitMode('page')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  fitMode === 'page'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Fit Page
              </button>
            </div>
          </div>
        )}

        {/* Right Cluster: Primary Light/Dark Toggle + PDF Background Presets + Custom Picker + Export */}
        <div className="flex items-center gap-2.5">
          {/* Explicit Light / Dark Mode Toggle Button */}
          <button
            type="button"
            onClick={handleToggleLightDark}
            aria-label="Toggle between Light and Dark mode"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isDarkUi
                ? 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-500'
                : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
            }`}
          >
            {isDarkUi ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-300" />
                <span>Switch to Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-200" />
                <span>Switch to Dark Mode</span>
              </>
            )}
          </button>

          {/* Segmented Preset Bar: Light | Dark | Sepia | Custom Color */}
          <div
            ref={popoverWrapperRef}
            className="relative flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-800 rounded-lg"
          >
            {(['light', 'dark', 'sepia'] as const).map((presetKey) => {
              const preset = THEME_PRESETS[presetKey];
              const isActive = colorConfig.presetId === presetKey;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(presetKey)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span
                    style={{ backgroundColor: preset.bgColor }}
                    className="w-2.5 h-2.5 rounded-full border border-slate-400/60 shrink-0"
                  />
                  {preset.label}
                </button>
              );
            })}

            {/* Custom Color Picker Trigger */}
            <button
              type="button"
              onClick={() => setIsColorPopoverOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                colorConfig.presetId === 'custom' || isColorPopoverOpen
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span
                style={{ backgroundColor: colorConfig.bgColor }}
                className="w-3 h-3 rounded-full border border-slate-400 shrink-0"
              />
              <Palette className="w-3.5 h-3.5" />
              <span>Custom BG</span>
            </button>

            {isColorPopoverOpen && (
              <ColorPickerPopover
                colorConfig={colorConfig}
                onUpdateCustomColors={handleUpdateCustomColors}
                onToggleSmartContrast={(enabled) =>
                  setColorConfig((prev) => ({ ...prev, smartContrast: enabled }))
                }
                onClose={() => setIsColorPopoverOpen(false)}
              />
            )}
          </div>

          {/* Export Recolored PDF Button */}
          {docMeta && (
            <button
              type="button"
              disabled={Boolean(exportProgress)}
              onClick={handleExportColoredPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              {exportProgress ? (
                <span className="font-mono">
                  Exporting {exportProgress.current}/{exportProgress.total}...
                </span>
              ) : (
                <span>Export Colored PDF</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Notifications / Error / Toast Banners */}
      {errorMsg && (
        <div className="px-6 py-2.5 bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-900 flex items-center justify-between text-xs text-red-700 dark:text-red-300 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="font-medium underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {exportSuccessToast && (
        <div className="px-6 py-2 bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-900 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{exportSuccessToast}</span>
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Drag-and-drop overlay indicator */}
        {isDraggingOver && (
          <div className="absolute inset-4 z-50 rounded-2xl border-2 border-dashed border-indigo-500 bg-indigo-50/90 dark:bg-indigo-950/90 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <Upload className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-bounce" />
            <p className="text-base font-semibold text-indigo-950 dark:text-indigo-100">
              Drop your PDF file here to open & recolor
            </p>
          </div>
        )}

        {docMeta ? (
          <>
            {/* Collapsible Left Page Thumbnails Sidebar */}
            <ThumbnailSidebar
              pdfDoc={docMeta.pdfDoc}
              currentPage={currentPage}
              colorConfig={colorConfig}
              isOpen={isSidebarOpen}
              onSelectPage={scrollToPage}
            />

            {/* Main PDF.js Scrollable Stage */}
            <main
              ref={viewportStageRef}
              className="flex-1 overflow-y-auto overflow-x-auto bg-slate-200/70 dark:bg-slate-950 p-6 md:p-8 flex flex-col items-center gap-8"
            >
              {pagesArray.map((pageNum) => (
                <PdfPageCanvas
                  key={`${docMeta.name}-${pageNum}`}
                  pdfDoc={docMeta.pdfDoc}
                  pageNumber={pageNum}
                  scale={zoomScale}
                  colorConfig={colorConfig}
                  isCurrentPage={pageNum === currentPage}
                  onPageVisible={handlePageVisible}
                  onBaseDimensionsKnown={
                    pageNum === 1 ? handleBaseDimensionsKnown : undefined
                  }
                />
              ))}
            </main>
          </>
        ) : (
          /* Arrival Upload & Live Background Preview Studio */
          <main className="flex-1 overflow-y-auto px-6 py-10 flex items-center justify-center">
            <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Left 7 Columns: Upload Dropzone Card */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>PDF.js Canvas Engine</span>
                    <span aria-hidden="true">·</span>
                    <span>100% Local Browser Rendering</span>
                    <span aria-hidden="true">·</span>
                    <span>Zero Upload Delay</span>
                  </div>

                  <h1
                    style={{ textWrap: 'balance' }}
                    className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white font-display"
                  >
                    Upload any PDF and transform its page background color
                  </h1>

                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Eliminate harsh white-page glare with one-click Light and Dark mode contrast
                    inversion, warm Sepia vellum, or any custom background hex color while keeping
                    typography razor-sharp.
                  </p>
                </div>

                {/* Interactive Dropzone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="mt-6 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl p-8 text-center transition-colors cursor-pointer bg-slate-50/70 dark:bg-slate-800/40 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                    <FolderOpen className="w-6 h-6" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
                    Click to select a PDF file, or drag and drop it here
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Supports any standard `.pdf` document, e-book, or academic paper
                  </p>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      Choose PDF File
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadSamplePdf();
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Try with Sample PDF
                    </button>
                  </div>
                </div>

                {isLoadingDoc && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                    <span>Rendering PDF document pages...</span>
                  </div>
                )}
              </div>

              {/* Right 5 Columns: Live Theme & Background Simulator Preview */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Live Page Surface Preview
                    </span>
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {colorConfig.label} · {colorConfig.bgColor.toUpperCase()}
                    </span>
                  </div>

                  {/* Simulated PDF Page Sheet reflecting current Light/Dark/Custom background */}
                  <div
                    style={{
                      backgroundColor: colorConfig.bgColor,
                      color: colorConfig.textColor,
                    }}
                    className="mt-4 rounded-lg border border-slate-300 dark:border-slate-700 p-5 shadow-sm transition-colors duration-150"
                  >
                    <div className="text-[11px] font-mono opacity-70">
                      SECTION 01 · OPTICAL ERGONOMICS
                    </div>
                    <h2 className="mt-1.5 text-base font-bold font-display">
                      Adaptive PDF Background Recoloring
                    </h2>
                    <p className="mt-2 text-xs leading-relaxed opacity-90">
                      Test the Light and Dark mode toggle above or pick a custom background color.
                      When you upload your PDF, every page will render with this exact surface
                      color and ink contrast.
                    </p>
                    <div className="mt-4 pt-3 border-t border-current/15 flex items-center justify-between text-[11px] font-mono opacity-75">
                      <span>BG: {colorConfig.bgColor.toUpperCase()}</span>
                      <span>INK: {colorConfig.textColor.toUpperCase()}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Theme Switcher inside Preview Card */}
                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2.5">
                    Try switching PDF background mode right now:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleToggleLightDark}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-indigo-600 text-white hover:opacity-95 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {isDarkUi ? (
                        <>
                          <Sun className="w-3.5 h-3.5 text-amber-300" />
                          <span>Light Mode</span>
                        </>
                      ) : (
                        <>
                          <Moon className="w-3.5 h-3.5 text-indigo-200" />
                          <span>Dark Mode</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsColorPopoverOpen(true)}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Palette className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Custom Color</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
