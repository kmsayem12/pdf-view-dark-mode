import React from 'react';
import { Palette, RotateCcw, Sparkles, Check } from 'lucide-react';
import { CUSTOM_SWATCHES, type CustomSwatch, type PdfColorConfig } from '../types/pdf';
import { getAutoContrastInkColor } from '../utils/pdfEngine';

interface ColorPickerPopoverProps {
  colorConfig: PdfColorConfig;
  onUpdateCustomColors: (bgColor: string, textColor: string, label?: string, syncDarkUi?: boolean) => void;
  onToggleSmartContrast: (enabled: boolean) => void;
  onClose: () => void;
}

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  colorConfig,
  onUpdateCustomColors,
  onToggleSmartContrast,
  onClose,
}) => {
  const handleBgChange = (newBg: string) => {
    const autoInk = getAutoContrastInkColor(newBg);
    onUpdateCustomColors(newBg, autoInk, 'Custom');
  };

  const handleInkChange = (newInk: string) => {
    onUpdateCustomColors(colorConfig.bgColor, newInk, 'Custom');
  };

  const handleApplySwatch = (swatch: CustomSwatch) => {
    onUpdateCustomColors(swatch.bgColor, swatch.textColor, swatch.name, swatch.isDarkUi);
  };

  return (
    <div
      role="dialog"
      aria-label="Custom PDF Background Color Picker"
      className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-4 z-50 text-slate-900 dark:text-slate-100"
    >
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-sm font-semibold">PDF Background Studio</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          Done
        </button>
      </div>

      {/* Custom Hex Color Pickers */}
      <div className="mt-3.5 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Page Background
          </label>
          <div className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70">
            <input
              type="color"
              aria-label="Choose PDF page background color"
              value={colorConfig.bgColor}
              onChange={(e) => handleBgChange(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
            />
            <input
              type="text"
              value={colorConfig.bgColor.toUpperCase()}
              onChange={(e) => {
                const val = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                  handleBgChange(val);
                }
              }}
              maxLength={7}
              className="w-full bg-transparent font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Text & Ink Contrast
          </label>
          <div className="flex items-center gap-2 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70">
            <input
              type="color"
              aria-label="Choose PDF text and ink color"
              value={colorConfig.textColor}
              onChange={(e) => handleInkChange(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
            />
            <input
              type="text"
              value={colorConfig.textColor.toUpperCase()}
              onChange={(e) => {
                const val = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                  handleInkChange(val);
                }
              }}
              maxLength={7}
              className="w-full bg-transparent font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Live Preview Mini Page */}
      <div
        style={{
          backgroundColor: colorConfig.bgColor,
          color: colorConfig.textColor,
        }}
        className="mt-3.5 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between"
      >
        <div>
          <div className="text-xs font-semibold">Live Contrast Preview</div>
          <div className="text-[11px] opacity-80 font-mono mt-0.5">
            BG {colorConfig.bgColor.toUpperCase()} · INK {colorConfig.textColor.toUpperCase()}
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleBgChange(colorConfig.bgColor)}
          title="Auto-balance text ink contrast"
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-current/25 hover:bg-black/5 dark:hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
          Auto Ink
        </button>
      </div>

      {/* Curated Reading Swatches */}
      <div className="mt-4">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
          Curated Reading Surfaces
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {CUSTOM_SWATCHES.map((swatch) => {
            const isSelected =
              colorConfig.bgColor.toLowerCase() === swatch.bgColor.toLowerCase() &&
              colorConfig.textColor.toLowerCase() === swatch.textColor.toLowerCase();
            return (
              <button
                key={swatch.name}
                type="button"
                onClick={() => handleApplySwatch(swatch)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                  isSelected
                    ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/40'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span
                  style={{
                    backgroundColor: swatch.bgColor,
                    color: swatch.textColor,
                  }}
                  className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0"
                >
                  {isSelected ? <Check className="w-3 h-3" /> : 'Aa'}
                </span>
                <span className="text-xs font-medium truncate">{swatch.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Smart Chromatic Preservation Toggle */}
      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-medium">Preserve Colored Diagrams</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Retains chart and link hues while flipping background
            </div>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={colorConfig.smartContrast}
          onClick={() => onToggleSmartContrast(!colorConfig.smartContrast)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ${
            colorConfig.smartContrast ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-150 ${
              colorConfig.smartContrast ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
};
