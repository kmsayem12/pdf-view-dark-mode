import type { PDFDocumentProxy } from 'pdfjs-dist';

export type PdfThemePresetId = 'light' | 'dark' | 'sepia' | 'custom';

export type FitMode = 'width' | 'page' | 'manual';

export interface PdfColorConfig {
  presetId: PdfThemePresetId;
  bgColor: string;
  textColor: string;
  smartContrast: boolean;
  label: string;
}

export interface ColorPresetOption {
  id: PdfThemePresetId;
  label: string;
  description: string;
  bgColor: string;
  textColor: string;
  isDarkUi: boolean;
}

export interface CustomSwatch {
  name: string;
  bgColor: string;
  textColor: string;
  isDarkUi: boolean;
}

export interface LoadedDocumentMeta {
  name: string;
  sizeBytes: number;
  numPages: number;
  pdfDoc: PDFDocumentProxy;
  isSample?: boolean;
}

export const THEME_PRESETS: Record<Exclude<PdfThemePresetId, 'custom'>, ColorPresetOption> = {
  light: {
    id: 'light',
    label: 'Light',
    description: 'Crisp studio paper with deep slate ink',
    bgColor: '#FFFFFF',
    textColor: '#0F172A',
    isDarkUi: false,
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    description: 'Smart contrast inversion on obsidian slate',
    bgColor: '#121620',
    textColor: '#E2E8F0',
    isDarkUi: true,
  },
  sepia: {
    id: 'sepia',
    label: 'Sepia',
    description: 'Warm archival vellum for extended reading',
    bgColor: '#F4ECD8',
    textColor: '#2C221E',
    isDarkUi: false,
  },
};

export const CUSTOM_SWATCHES: CustomSwatch[] = [
  { name: 'Midnight Navy', bgColor: '#0D1B2A', textColor: '#E0E1DD', isDarkUi: true },
  { name: 'Forest Moss', bgColor: '#13221B', textColor: '#D8F3DC', isDarkUi: true },
  { name: 'Warm Charcoal', bgColor: '#1C1917', textColor: '#E7E5E4', isDarkUi: true },
  { name: 'Soft Sage', bgColor: '#EBF3EE', textColor: '#1B3022', isDarkUi: false },
  { name: 'Nordic Ice', bgColor: '#EEF4F8', textColor: '#0F2537', isDarkUi: false },
  { name: 'Sandstone', bgColor: '#EFE6D5', textColor: '#2B2118', isDarkUi: false },
  { name: 'Deep Aubergine', bgColor: '#1E1424', textColor: '#F3E8FF', isDarkUi: true },
  { name: 'Solarized Dark', bgColor: '#002B36', textColor: '#93A1A1', isDarkUi: true },
];
