import type { AnnotationColor, HighlightRect, MindMapEdgeColor, OptionColor } from './types';

export interface CardPaletteEntry {
  id: string;
  label: string;
  cssVar: string;
  darkHex: string;
  lightHex: string;
}

export const HEPTA_CARD_PALETTE: CardPaletteEntry[] = [
  { id: 'white', label: '默认/白', cssVar: 'var(--bg-white)', darkHex: '#2f3032', lightHex: '#ffffff' },
  { id: 'yellow', label: '黄', cssVar: 'var(--bg-yellow)', darkHex: '#403814', lightHex: '#f5e090' },
  { id: 'red', label: '红', cssVar: 'var(--bg-red)', darkHex: '#4a2126', lightHex: '#fccccc' },
  { id: 'blue', label: '蓝', cssVar: 'var(--bg-blue)', darkHex: '#1a304a', lightHex: '#c2deed' },
  { id: 'green', label: '绿', cssVar: 'var(--bg-green)', darkHex: '#0f3830', lightHex: '#cce0c4' },
  { id: 'black', label: '灰/黑', cssVar: 'var(--bg-black)', darkHex: '#222220', lightHex: '#d6d6d6' },
  { id: 'orange', label: '橙', cssVar: 'var(--bg-orange)', darkHex: '#4c3215', lightHex: '#fcd4ba' },
  { id: 'purple', label: '紫', cssVar: 'var(--bg-purple)', darkHex: '#3b294f', lightHex: '#dbd9f2' },
];

export function resolveCardBgColor(colorVal?: string | null): string {
  if (!colorVal) return 'var(--bg-white)';
  if (colorVal.startsWith('var(')) return colorVal;
  const byId = HEPTA_CARD_PALETTE.find((p) => p.id === colorVal);
  if (byId) return byId.cssVar;
  const byHex = HEPTA_CARD_PALETTE.find(
    (p) =>
      p.darkHex.toLowerCase() === colorVal.toLowerCase() ||
      p.lightHex.toLowerCase() === colorVal.toLowerCase()
  );
  if (byHex) return byHex.cssVar;
  return colorVal;
}

export interface SectionPaletteEntry {
  id: string;
  border: string;
  bg: string;
  label: string;
}

export const HEPTA_SECTION_COLORS: Record<string, SectionPaletteEntry> = {
  white: { id: 'white', border: 'var(--border-white-sect)', bg: 'var(--bg-white-sect)', label: '默认/白' },
  yellow: { id: 'yellow', border: 'var(--border-yellow-sect)', bg: 'var(--bg-yellow-sect)', label: '黄' },
  red: { id: 'red', border: 'var(--border-red-sect)', bg: 'var(--bg-red-sect)', label: '红' },
  blue: { id: 'blue', border: 'var(--border-blue-sect)', bg: 'var(--bg-blue-sect)', label: '蓝' },
  green: { id: 'green', border: 'var(--border-green-sect)', bg: 'var(--bg-green-sect)', label: '绿' },
  black: { id: 'black', border: 'var(--border-black-sect)', bg: 'var(--bg-black-sect)', label: '灰/黑' },
  orange: { id: 'orange', border: 'var(--border-orange-sect)', bg: 'var(--bg-orange-sect)', label: '橙' },
  purple: { id: 'purple', border: 'var(--border-purple-sect)', bg: 'var(--bg-purple-sect)', label: '紫' },
};

export const HEPTA_SECTION_PALETTE: SectionPaletteEntry[] = Object.values(HEPTA_SECTION_COLORS);

export function resolveSectionColors(colorVal?: string | null): {
  id: string;
  border: string;
  bg: string;
} {
  if (!colorVal) return HEPTA_SECTION_COLORS.white;
  if (HEPTA_SECTION_COLORS[colorVal]) {
    return HEPTA_SECTION_COLORS[colorVal];
  }
  for (const item of Object.values(HEPTA_SECTION_COLORS)) {
    if (colorVal.includes(item.id)) return item;
  }
  return {
    id: 'custom',
    border: colorVal.includes('hsl') ? colorVal : 'var(--border-white-sect)',
    bg: colorVal.startsWith('rgba') || colorVal.startsWith('var(--bg') ? colorVal : 'var(--bg-white-sect)',
  };
}

export interface AnnotationColorMeta {
  color: AnnotationColor;
  label: string;
  cssVar: string;
  fallbackLight: string;
  fallbackDark: string;
}

export const ANNOTATION_COLORS: AnnotationColorMeta[] = [
  { color: 'yellow', label: 'Yellow', cssVar: '--annotation-yellow', fallbackLight: '#ffd20b', fallbackDark: '#ffe366' },
  { color: 'red', label: 'Red', cssVar: '--annotation-red', fallbackLight: '#eb5353', fallbackDark: '#ff7a7a' },
  { color: 'green', label: 'Green', cssVar: '--annotation-green', fallbackLight: '#11c85a', fallbackDark: '#5cff9d' },
  { color: 'blue', label: 'Blue', cssVar: '--annotation-blue', fallbackLight: '#1aa7d3', fallbackDark: '#6ed7f7' },
  { color: 'purple', label: 'Purple', cssVar: '--annotation-purple', fallbackLight: '#a968ea', fallbackDark: '#ba75ff' },
  { color: 'orange', label: 'Orange', cssVar: '--annotation-orange', fallbackLight: '#ff8934', fallbackDark: '#f99b58' },
  { color: 'pink', label: 'Pink', cssVar: '--annotation-pink', fallbackLight: '#ea68c6', fallbackDark: '#ff8fdf' },
];

export const ANNOTATION_COLOR_MAP: Record<AnnotationColor, AnnotationColorMeta> = ANNOTATION_COLORS.reduce(
  (acc, item) => {
    acc[item.color] = item;
    return acc;
  },
  {} as Record<AnnotationColor, AnnotationColorMeta>
);

export function getAnnotationCssVar(color: AnnotationColor): string {
  const meta = ANNOTATION_COLOR_MAP[color] ?? ANNOTATION_COLOR_MAP.yellow;
  return `var(${meta.cssVar}, ${meta.fallbackLight})`;
}

export function resolveAnnotationColorHex(
  color: AnnotationColor,
  theme: 'light' | 'dark' = 'light'
): string {
  const meta = ANNOTATION_COLOR_MAP[color] ?? ANNOTATION_COLOR_MAP.yellow;
  const g = globalThis as {
    document?: {
      documentElement?: {
        getAttribute?: (name: string) => string | null;
      };
    };
    getComputedStyle?: (el: unknown) => {
      getPropertyValue?: (prop: string) => string;
    };
  };
  if (g.document?.documentElement && typeof g.getComputedStyle === 'function') {
    const computed = g
      .getComputedStyle(g.document.documentElement)
      .getPropertyValue?.(meta.cssVar)
      ?.trim();
    if (computed) return computed;
    const domTheme = g.document.documentElement.getAttribute?.('data-theme');
    if (domTheme === 'dark' || domTheme === 'light') {
      return domTheme === 'dark' ? meta.fallbackDark : meta.fallbackLight;
    }
  }
  return theme === 'dark' ? meta.fallbackDark : meta.fallbackLight;
}

export function isAnnotationColor(value: string | null | undefined): value is AnnotationColor {
  return value !== undefined && value !== null && value in ANNOTATION_COLOR_MAP;
}

export function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function parseHighlightRects(rectsJson: string): HighlightRect[] {
  try {
    const parsed = JSON.parse(rectsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is HighlightRect =>
        Boolean(r) &&
        typeof r.top === 'number' &&
        typeof r.left === 'number' &&
        typeof r.width === 'number' &&
        typeof r.height === 'number'
    );
  } catch {
    return [];
  }
}

export interface ReaderTocItem {
  id: string;
  title: string;
  pageNumber?: number;
  href?: string;
  children?: ReaderTocItem[];
}

export interface CreateHighlightInput {
  sourceType: 'pdf' | 'epub';
  highlightType: 'text' | 'area';
  pageNumber?: number | null;
  epubCfi?: string | null;
  rects?: HighlightRect[];
  textContent: string;
  imageReferenceId?: string | null;
  noteText?: string;
  color: AnnotationColor;
}

export interface OptionPaletteEntry {
  id: OptionColor;
  label: string;
  cssVar: string;
}

export const HEPTA_OPTION_PALETTE: OptionPaletteEntry[] = [
  { id: 'white', label: 'White', cssVar: 'var(--option-white)' },
  { id: 'yellow', label: 'Yellow', cssVar: 'var(--option-yellow)' },
  { id: 'red', label: 'Red', cssVar: 'var(--option-red)' },
  { id: 'blue', label: 'Blue', cssVar: 'var(--option-blue)' },
  { id: 'green', label: 'Green', cssVar: 'var(--option-green)' },
  { id: 'black', label: 'Gray', cssVar: 'var(--option-black)' },
  { id: 'orange', label: 'Orange', cssVar: 'var(--option-orange)' },
  { id: 'purple', label: 'Purple', cssVar: 'var(--option-purple)' },
];

export function resolveOptionCssVar(color?: OptionColor | string | null): string {
  if (!color) return 'var(--light-grey)';
  const found = HEPTA_OPTION_PALETTE.find((o) => o.id === color);
  return found ? found.cssVar : 'var(--light-grey)';
}

export function pickRandomOptionColor(): OptionColor {
  const idx = Math.floor(Math.random() * HEPTA_OPTION_PALETTE.length);
  return HEPTA_OPTION_PALETTE[idx].id;
}

export interface MindMapEdgeColorEntry {
  id: MindMapEdgeColor;
  label: string;
  stroke: string;
  softBg: string;
}

export const HEPTA_MINDMAP_EDGE_PALETTE: MindMapEdgeColorEntry[] = [
  { id: 'blue', label: 'Blue', stroke: '#3b82f6', softBg: 'rgba(59, 130, 246, 0.14)' },
  { id: 'green', label: 'Green', stroke: '#10b981', softBg: 'rgba(16, 185, 129, 0.14)' },
  { id: 'orange', label: 'Orange', stroke: '#f97316', softBg: 'rgba(249, 115, 22, 0.14)' },
  { id: 'purple', label: 'Purple', stroke: '#8b5cf6', softBg: 'rgba(139, 92, 246, 0.14)' },
  { id: 'red', label: 'Red', stroke: '#ef4444', softBg: 'rgba(239, 68, 68, 0.14)' },
  { id: 'yellow', label: 'Yellow', stroke: '#eab308', softBg: 'rgba(234, 179, 8, 0.16)' },
  { id: 'pink', label: 'Pink', stroke: '#ec4899', softBg: 'rgba(236, 72, 153, 0.14)' },
  { id: 'gray', label: 'Gray', stroke: '#71717a', softBg: 'rgba(113, 113, 122, 0.14)' },
];

export const MINDMAP_DEFAULT_BRANCH_COLORS: MindMapEdgeColor[] = [
  'blue',
  'green',
  'orange',
  'purple',
  'red',
  'yellow',
  'pink',
];

export function resolveMindMapEdgeColor(color?: MindMapEdgeColor | string | null): MindMapEdgeColorEntry {
  const found = HEPTA_MINDMAP_EDGE_PALETTE.find((entry) => entry.id === color);
  return found ?? HEPTA_MINDMAP_EDGE_PALETTE[0];
}
