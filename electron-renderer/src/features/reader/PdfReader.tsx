import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crop,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import type {
  AnnotationColor,
  DocumentRecord,
  HighlightElement,
  HighlightRect,
} from '@shared/types';
import {
  type CreateHighlightInput,
  type ReaderTocItem,
  getAnnotationCssVar,
  isAnnotationColor,
  parseHighlightRects,
  toExactArrayBuffer,
} from '@shared/palette';
import { heptaClient } from '../../client';
import { HighlightToolbar } from './HighlightToolbar';
import './reader.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfReaderHandle {
  scrollToPage: (pageNumber: number) => void;
  focusHighlight: (highlight: HighlightElement) => void;
}

export interface PdfReaderProps {
  document: DocumentRecord;
  highlights: HighlightElement[];
  focusHighlightId?: string | null;
  onTocLoaded?: (items: ReaderTocItem[]) => void;
  onCreateHighlight: (input: CreateHighlightInput) => Promise<HighlightElement | null>;
  onUpdateHighlight: (
    id: string,
    patch: {
      color?: AnnotationColor;
      noteText?: string;
      rects?: HighlightRect[];
      imageReferenceId?: string;
    }
  ) => Promise<void>;
  onDeleteHighlight: (highlight: HighlightElement) => Promise<void>;
  onAddHighlightTag?: (highlightId: string, tagName: string) => Promise<void>;
  onRemoveHighlightTag?: (highlightId: string, tagId: string) => Promise<void>;
  onAddHighlightToWhiteboard?: (highlightId: string) => void;
  onCoverSaved?: (coverReferenceId: string) => void;
  onTotalPagesResolved?: (totalPages: number) => void;
  onError?: (message: string) => void;
}

interface PendingSelection {
  pageNumber: number;
  rects: HighlightRect[];
  textContent: string;
  anchorX: number;
  anchorY: number;
}

interface ActiveHighlightPopover {
  highlight: HighlightElement;
  anchorX: number;
  anchorY: number;
  autoOpenNote?: boolean;
}

interface CropDraft {
  pageNumber: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

type AreaResizeHandle = 'move' | 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se';

interface AreaAdjustDraft {
  highlightId: string;
  pageNumber: number;
  handle: AreaResizeHandle;
  startX: number;
  startY: number;
  initialRect: HighlightRect;
  currentRect: HighlightRect;
}

const AREA_HANDLES: Array<{
  handle: Exclude<AreaResizeHandle, 'move'>;
  style: React.CSSProperties;
  cursorClass: string;
}> = [
  { handle: 'nw', style: { left: -4, top: -4 }, cursorClass: 'cursor-nwse-resize' },
  { handle: 'n', style: { left: '50%', top: -4, transform: 'translateX(-50%)' }, cursorClass: 'cursor-ns-resize' },
  { handle: 'ne', style: { right: -4, top: -4 }, cursorClass: 'cursor-nesw-resize' },
  { handle: 'e', style: { right: -4, top: '50%', transform: 'translateY(-50%)' }, cursorClass: 'cursor-ew-resize' },
  { handle: 'se', style: { right: -4, bottom: -4 }, cursorClass: 'cursor-nwse-resize' },
  { handle: 's', style: { left: '50%', bottom: -4, transform: 'translateX(-50%)' }, cursorClass: 'cursor-ns-resize' },
  { handle: 'sw', style: { left: -4, bottom: -4 }, cursorClass: 'cursor-nesw-resize' },
  { handle: 'w', style: { left: -4, top: '50%', transform: 'translateY(-50%)' }, cursorClass: 'cursor-ew-resize' },
];

function computeAdjustedAreaRect(
  initial: HighlightRect,
  handle: AreaResizeHandle,
  dx: number,
  dy: number
): HighlightRect {
  const minSize = 0.015;
  if (handle === 'move') {
    const left = Math.min(1 - initial.width, Math.max(0, initial.left + dx));
    const top = Math.min(1 - initial.height, Math.max(0, initial.top + dy));
    return { left, top, width: initial.width, height: initial.height };
  }
  let left = initial.left;
  let top = initial.top;
  let right = initial.left + initial.width;
  let bottom = initial.top + initial.height;

  if (handle.includes('w')) {
    left = Math.min(right - minSize, Math.max(0, initial.left + dx));
  }
  if (handle.includes('e')) {
    right = Math.max(left + minSize, Math.min(1, initial.left + initial.width + dx));
  }
  if (handle.includes('n')) {
    top = Math.min(bottom - minSize, Math.max(0, initial.top + dy));
  }
  if (handle.includes('s')) {
    bottom = Math.max(top + minSize, Math.min(1, initial.top + initial.height + dy));
  }

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

async function captureAreaCropImage(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  normRect: HighlightRect,
  scale: number
): Promise<string | null> {
  const page = await pdfDoc.getPage(pageNumber);
  const cropScale = Math.max(1.5, scale * (window.devicePixelRatio || 1));
  const vp = page.getViewport({ scale: cropScale });
  const offCanvas = window.document.createElement('canvas');
  offCanvas.width = Math.max(1, Math.floor(vp.width));
  offCanvas.height = Math.max(1, Math.floor(vp.height));
  await page.render({ canvas: offCanvas, viewport: vp }).promise;

  const sx = Math.floor(normRect.left * offCanvas.width);
  const sy = Math.floor(normRect.top * offCanvas.height);
  const sw = Math.max(2, Math.floor(normRect.width * offCanvas.width));
  const sh = Math.max(2, Math.floor(normRect.height * offCanvas.height));

  const cropCanvas = window.document.createElement('canvas');
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const ctx = cropCanvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(offCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const dataUrl = cropCanvas.toDataURL('image/png');
  const saved = await heptaClient.localFile.saveImage(
    dataUrl,
    `pdf-crop-p${pageNumber}-${Date.now()}.png`
  );
  return saved.referenceId;
}

interface LastPdfPosition {
  page?: number;
  scale?: number;
  scrollTop?: number;
  fitWidth?: boolean;
}

function parseLastPdfPosition(raw: string): LastPdfPosition {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function mergeLineRects(rects: HighlightRect[]): HighlightRect[] {
  if (rects.length <= 1) return rects;
  const sorted = [...rects].sort((a, b) =>
    Math.abs(a.top - b.top) < 0.008 ? a.left - b.left : a.top - b.top
  );
  const merged: HighlightRect[] = [];
  for (const r of sorted) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      Math.abs(prev.top - r.top) < 0.01 &&
      Math.abs(prev.height - r.height) < 0.014 &&
      r.left <= prev.left + prev.width + 0.014
    ) {
      const right = Math.max(prev.left + prev.width, r.left + r.width);
      const bottom = Math.max(prev.top + prev.height, r.top + r.height);
      prev.left = Math.min(prev.left, r.left);
      prev.top = Math.min(prev.top, r.top);
      prev.width = right - prev.left;
      prev.height = bottom - prev.top;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

interface PdfPageViewProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  baseWidth: number;
  baseHeight: number;
  scale: number;
  isVisible: boolean;
  isCropMode: boolean;
  cropDraft: CropDraft | null;
  selectedAreaHighlightId: string | null;
  areaAdjustDraft: AreaAdjustDraft | null;
  pendingRectOverrides: Record<string, HighlightRect>;
  highlights: HighlightElement[];
  pulsingHighlightId: string | null;
  needCoverCapture: boolean;
  onCoverCaptured: (dataUrl: string) => void;
  onPageViewportResolved: (pageNumber: number, width: number, height: number) => void;
  onHighlightClick: (highlight: HighlightElement, e: React.MouseEvent) => void;
  onCropStart: (pageNumber: number, normX: number, normY: number) => void;
  onCropMove: (pageNumber: number, normX: number, normY: number) => void;
  onCropEnd: (pageNumber: number, rectPxWidth: number, rectPxHeight: number, clientX: number, clientY: number) => void;
  onAreaAdjustStart: (
    highlight: HighlightElement,
    pageNumber: number,
    handle: AreaResizeHandle,
    normX: number,
    normY: number
  ) => void;
  registerPageElement: (pageNumber: number, el: HTMLDivElement | null) => void;
}

const PdfPageView = React.memo(function PdfPageView({
  pdfDoc,
  pageNumber,
  baseWidth,
  baseHeight,
  scale,
  isVisible,
  isCropMode,
  cropDraft,
  selectedAreaHighlightId,
  areaAdjustDraft,
  pendingRectOverrides,
  highlights,
  pulsingHighlightId,
  needCoverCapture,
  onCoverCaptured,
  onPageViewportResolved,
  onHighlightClick,
  onCropStart,
  onCropMove,
  onCropEnd,
  onAreaAdjustStart,
  registerPageElement,
}: PdfPageViewProps) {
  const pageWrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerTaskRef = useRef<pdfjsLib.TextLayer | null>(null);
  const renderedKeyRef = useRef<string>('');
  const coverCapturedRef = useRef(false);

  const width = Math.round(baseWidth * scale);
  const height = Math.round(baseHeight * scale);

  useEffect(() => {
    registerPageElement(pageNumber, pageWrapperRef.current);
    return () => registerPageElement(pageNumber, null);
  }, [pageNumber, registerPageElement]);

  useEffect(() => {
    if (!isVisible) return;
    const renderKey = `${pageNumber}@${scale.toFixed(3)}`;
    if (renderedKeyRef.current === renderKey) return;

    let cancelled = false;
    const canvas = canvasRef.current;
    const textDiv = textLayerRef.current;
    if (!canvas || !textDiv) return;

    const run = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }
        if (textLayerTaskRef.current) {
          textLayerTaskRef.current.cancel();
          textLayerTaskRef.current = null;
        }

        const page: PDFPageProxy = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const baseVp = page.getViewport({ scale: 1 });
        if (
          Math.abs(baseVp.width - baseWidth) > 1 ||
          Math.abs(baseVp.height - baseHeight) > 1
        ) {
          onPageViewportResolved(pageNumber, baseVp.width, baseVp.height);
        }

        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
        canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
        const renderTask = page.render({
          canvas,
          viewport,
          transform,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (cancelled) return;

        if (pageNumber === 1 && needCoverCapture && !coverCapturedRef.current) {
          coverCapturedRef.current = true;
          try {
            const dataUrl = canvas.toDataURL('image/png');
            if (dataUrl && dataUrl.length > 64) {
              onCoverCaptured(dataUrl);
            }
          } catch {
            coverCapturedRef.current = false;
          }
        }

        textDiv.innerHTML = '';
        const textContent = await page.getTextContent();
        if (cancelled) return;

        const tl = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textDiv,
          viewport,
        });
        textLayerTaskRef.current = tl;
        await tl.render();
        if (!cancelled) {
          renderedKeyRef.current = renderKey;
        }
      } catch (err: unknown) {
        const name = (err as { name?: string })?.name;
        if (name === 'RenderingCancelledException' || name === 'AbortException') {
          return;
        }
        if (!cancelled) {
          console.error(`Failed to render PDF page ${pageNumber}:`, err);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (textLayerTaskRef.current) {
        textLayerTaskRef.current.cancel();
        textLayerTaskRef.current = null;
      }
    };
  }, [
    pdfDoc,
    pageNumber,
    scale,
    isVisible,
    baseWidth,
    baseHeight,
    needCoverCapture,
    onCoverCaptured,
    onPageViewportResolved,
  ]);

  const getNormalizedPoint = (e: React.MouseEvent) => {
    const el = pageWrapperRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { nx, ny, rect };
  };

  const cropBoxStyle = useMemo(() => {
    if (!cropDraft || cropDraft.pageNumber !== pageNumber) return null;
    const left = Math.min(cropDraft.startX, cropDraft.currentX);
    const top = Math.min(cropDraft.startY, cropDraft.currentY);
    const w = Math.abs(cropDraft.currentX - cropDraft.startX);
    const h = Math.abs(cropDraft.currentY - cropDraft.startY);
    return {
      left: `${left * 100}%`,
      top: `${top * 100}%`,
      width: `${w * 100}%`,
      height: `${h * 100}%`,
    };
  }, [cropDraft, pageNumber]);

  return (
    <div
      ref={pageWrapperRef}
      data-pdf-page={pageNumber}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        '--scale-factor': String(scale),
        '--total-scale-factor': String(scale),
        '--scale-round-x': '1px',
        '--scale-round-y': '1px',
      } as React.CSSProperties}
      onMouseDown={(e) => {
        if (!isCropMode || e.button !== 0) return;
        const pt = getNormalizedPoint(e);
        if (!pt) return;
        e.preventDefault();
        onCropStart(pageNumber, pt.nx, pt.ny);
      }}
      onMouseMove={(e) => {
        if (!isCropMode || !cropDraft || cropDraft.pageNumber !== pageNumber) return;
        const pt = getNormalizedPoint(e);
        if (!pt) return;
        onCropMove(pageNumber, pt.nx, pt.ny);
      }}
      onMouseUp={(e) => {
        if (!isCropMode || !cropDraft || cropDraft.pageNumber !== pageNumber) return;
        const pt = getNormalizedPoint(e);
        if (!pt) return;
        const boxW = Math.abs(pt.nx - cropDraft.startX) * pt.rect.width;
        const boxH = Math.abs(pt.ny - cropDraft.startY) * pt.rect.height;
        onCropEnd(pageNumber, boxW, boxH, e.clientX, e.clientY);
      }}
      className={`hepta-pdf-page relative mx-auto my-4 bg-white shadow-card border border-light-grey select-text ${
        isCropMode ? 'cursor-crosshair select-none' : areaAdjustDraft ? 'select-none' : ''
      }`}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      <div className="absolute inset-0 pointer-events-none z-[3]">
        {highlights.map((hl) => {
          const rects = parseHighlightRects(hl.rects_json);
          const colorVar = getAnnotationCssVar(isAnnotationColor(hl.color) ? hl.color : 'yellow');
          const isPulsing = pulsingHighlightId === hl.id;
          const isArea = hl.highlight_type === 'area';
          const isSelectedArea = isArea && selectedAreaHighlightId === hl.id;
          const isAdjustingThis = areaAdjustDraft?.highlightId === hl.id;
          return rects.map((rawRect, idx) => {
            const overrideRect = pendingRectOverrides[hl.id];
            const r =
              isAdjustingThis && areaAdjustDraft
                ? areaAdjustDraft.currentRect
                : overrideRect ?? rawRect;
            return (
              <div
                key={`${hl.id}-${idx}`}
                data-highlight-id={hl.id}
                aria-label={isArea ? 'Area highlight box' : undefined}
                onMouseDown={(e) => {
                  if (!isArea || e.button !== 0 || isCropMode) return;
                  const pt = getNormalizedPoint(e);
                  if (!pt) return;
                  e.stopPropagation();
                  e.preventDefault();
                  onAreaAdjustStart(hl, pageNumber, 'move', pt.nx, pt.ny);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isAdjustingThis) {
                    onHighlightClick(hl, e);
                  }
                }}
                style={{
                  top: `${r.top * 100}%`,
                  left: `${r.left * 100}%`,
                  width: `${r.width * 100}%`,
                  height: `${r.height * 100}%`,
                  backgroundColor: isArea
                    ? `color-mix(in srgb, ${colorVar} 14%, transparent)`
                    : `color-mix(in srgb, ${colorVar} 34%, transparent)`,
                  border: isArea ? `2px solid ${colorVar}` : undefined,
                  borderRadius: isArea ? '4px' : '2px',
                }}
                className={`absolute pointer-events-auto ${
                  isAdjustingThis ? '' : 'transition-opacity'
                } ${
                  isArea
                    ? isAdjustingThis
                      ? 'cursor-move'
                      : 'cursor-move hover:opacity-95'
                    : 'cursor-pointer hover:opacity-85'
                } ${isPulsing ? 'hepta-highlight-pulse ring-2 ring-active-item' : ''}`}
                title={hl.note_text ? `Note: ${hl.note_text}` : hl.text_content || 'Area highlight'}
              >
                {isSelectedArea &&
                  AREA_HANDLES.map(({ handle, style, cursorClass }) => (
                    <div
                      key={handle}
                      aria-label={`Resize area ${handle}`}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        const pt = getNormalizedPoint(e);
                        if (!pt) return;
                        e.stopPropagation();
                        e.preventDefault();
                        onAreaAdjustStart(hl, pageNumber, handle, pt.nx, pt.ny);
                      }}
                      style={{
                        ...style,
                        borderColor: colorVar,
                      }}
                      className={`absolute w-2.5 h-2.5 rounded-full bg-white border-2 shadow-sm ${cursorClass}`}
                    />
                  ))}
              </div>
            );
          });
        })}

        {cropBoxStyle && (
          <div
            style={cropBoxStyle}
            className="absolute border-2 border-dashed border-active-item bg-middle-transparent-blue rounded-sm pointer-events-none"
          />
        )}
      </div>

      <div
        ref={textLayerRef}
        className={`textLayer ${
          isCropMode || Boolean(areaAdjustDraft) ? 'pointer-events-none select-none' : ''
        }`}
      />

      <div className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded bg-black/45 text-white text-[10px] font-medium tabular-nums pointer-events-none z-[4]">
        {pageNumber}
      </div>
    </div>
  );
});

export const PdfReader = forwardRef<PdfReaderHandle, PdfReaderProps>(function PdfReader(
  {
    document: docRecord,
    highlights,
    focusHighlightId,
    onTocLoaded,
    onCreateHighlight,
    onUpdateHighlight,
    onDeleteHighlight,
    onAddHighlightTag,
    onRemoveHighlightTag,
    onAddHighlightToWhiteboard,
    onCoverSaved,
    onTotalPagesResolved,
    onError,
  },
  ref
) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const initialPos = useMemo(
    () => parseLastPdfPosition(docRecord.last_position_json),
    [docRecord.id]
  );

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(docRecord.total_pages || 0);
  const [currentPage, setCurrentPage] = useState<number>(initialPos.page || 1);
  const [pageInput, setPageInput] = useState<string>(String(initialPos.page || 1));
  const [scale, setScale] = useState<number>(initialPos.scale || 1.15);
  const [fitWidth, setFitWidth] = useState<boolean>(initialPos.fitWidth ?? true);
  const [pageSizes, setPageSizes] = useState<Record<number, { width: number; height: number }>>({});
  const [defaultPageSize, setDefaultPageSize] = useState<{ width: number; height: number }>({
    width: 612,
    height: 792,
  });
  const [visiblePages, setVisiblePages] = useState<Set<number>>(() => new Set([1, 2]));
  const [loading, setLoading] = useState<boolean>(true);
  const [isCropMode, setIsCropMode] = useState<boolean>(false);
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const [selectedAreaHighlightId, setSelectedAreaHighlightId] = useState<string | null>(null);
  const [areaAdjustDraft, setAreaAdjustDraft] = useState<AreaAdjustDraft | null>(null);
  const [pendingRectOverrides, setPendingRectOverrides] = useState<Record<string, HighlightRect>>({});
  const areaAdjustDraftRef = useRef<AreaAdjustDraft | null>(null);
  const justFinishedAdjustRef = useRef<boolean>(false);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [activePopover, setActivePopover] = useState<ActiveHighlightPopover | null>(null);
  const [pulsingHighlightId, setPulsingHighlightId] = useState<string | null>(null);

  const restoredScrollRef = useRef<boolean>(false);
  const savePositionTimerRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const lastFocusedIdRef = useRef<string | null>(null);

  const registerPageElement = useCallback((pageNumber: number, el: HTMLDivElement | null) => {
    const map = pageElementsRef.current;
    if (el) {
      map.set(pageNumber, el);
      observerRef.current?.observe(el);
    } else {
      const prev = map.get(pageNumber);
      if (prev) observerRef.current?.unobserve(prev);
      map.delete(pageNumber);
    }
  }, []);

  const persistPosition = useCallback(
    (page: number, nextScale: number, scrollTop: number, isFitWidth: boolean) => {
      if (savePositionTimerRef.current) {
        window.clearTimeout(savePositionTimerRef.current);
      }
      savePositionTimerRef.current = window.setTimeout(() => {
        const payload: LastPdfPosition = {
          page,
          scale: Number(nextScale.toFixed(3)),
          scrollTop: Math.round(scrollTop),
          fitWidth: isFitWidth,
        };
        void heptaClient.documents
          .updatePosition(docRecord.id, JSON.stringify(payload))
          .catch((err) => console.error('Failed to persist PDF position:', err));
      }, 350);
    },
    [docRecord.id]
  );

  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    setLoading(true);
    restoredScrollRef.current = false;

    const loadPdf = async () => {
      try {
        const bytes = await heptaClient.localFile.readBuffer(docRecord.file_reference_id);
        if (cancelled) return;
        const arrayBuffer = toExactArrayBuffer(bytes);
        loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          useSystemFonts: true,
        });
        const doc = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);

        if (doc.numPages !== docRecord.total_pages) {
          void heptaClient.documents.updatePosition(
            docRecord.id,
            docRecord.last_position_json,
            doc.numPages
          );
          onTotalPagesResolved?.(doc.numPages);
        }

        const firstPage = await doc.getPage(1);
        if (cancelled) return;
        const vp = firstPage.getViewport({ scale: 1 });
        setDefaultPageSize({ width: vp.width, height: vp.height });
        setPageSizes({ 1: { width: vp.width, height: vp.height } });

        if (initialPos.fitWidth ?? true) {
          const containerWidth = scrollContainerRef.current?.clientWidth || 840;
          const computed = Math.max(0.45, Math.min(2.6, (containerWidth - 72) / vp.width));
          setScale(computed);
        } else if (initialPos.scale) {
          setScale(initialPos.scale);
        }

        if (onTocLoaded) {
          try {
            const outline = await doc.getOutline();
            if (!cancelled && outline && outline.length > 0) {
              const resolveDestPage = async (dest: unknown): Promise<number | undefined> => {
                try {
                  let resolvedDest = dest;
                  if (typeof resolvedDest === 'string') {
                    resolvedDest = await doc.getDestination(resolvedDest);
                  }
                  if (Array.isArray(resolvedDest) && resolvedDest[0]) {
                    const idx = await doc.getPageIndex(resolvedDest[0]);
                    return idx + 1;
                  }
                } catch {
                  return undefined;
                }
                return undefined;
              };

              let counter = 0;
              const convertOutline = async (
                items: typeof outline
              ): Promise<ReaderTocItem[]> => {
                const out: ReaderTocItem[] = [];
                for (const item of items) {
                  counter += 1;
                  const pageNumber = await resolveDestPage(item.dest);
                  const children =
                    item.items && item.items.length > 0
                      ? await convertOutline(item.items)
                      : undefined;
                  out.push({
                    id: `pdf-toc-${counter}`,
                    title: item.title || 'Untitled section',
                    pageNumber,
                    children,
                  });
                }
                return out;
              };

              const tocItems = await convertOutline(outline);
              if (!cancelled) onTocLoaded(tocItems);
            } else if (!cancelled) {
              onTocLoaded([]);
            }
          } catch {
            if (!cancelled) onTocLoaded([]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load PDF document';
          onError?.(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
      if (savePositionTimerRef.current) window.clearTimeout(savePositionTimerRef.current);
      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [docRecord.id, docRecord.file_reference_id]);

  useEffect(() => {
    if (!fitWidth || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      if (w > 120 && defaultPageSize.width > 0) {
        const next = Math.max(0.45, Math.min(2.6, (w - 72) / defaultPageSize.width));
        setScale((prev) => (Math.abs(prev - next) > 0.015 ? next : prev));
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitWidth, defaultPageSize.width]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || numPages === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const entry of entries) {
            const p = Number((entry.target as HTMLElement).dataset.pdfPage);
            if (!p) continue;
            if (entry.isIntersecting) {
              if (!next.has(p)) {
                next.add(p);
                changed = true;
              }
            } else if (next.has(p)) {
              next.delete(p);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      },
      { root, rootMargin: '600px 0px', threshold: 0.01 }
    );

    observerRef.current = io;
    pageElementsRef.current.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      observerRef.current = null;
    };
  }, [numPages]);

  const scrollToPage = useCallback(
    (pageNumber: number, yFraction = 0) => {
      const clamped = Math.max(1, Math.min(numPages || 1, pageNumber));
      const el = pageElementsRef.current.get(clamped);
      const container = scrollContainerRef.current;
      if (el && container) {
        const top = el.offsetTop + el.offsetHeight * yFraction - 20;
        container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
      setCurrentPage(clamped);
      setPageInput(String(clamped));
      setVisiblePages((prev) => {
        const next = new Set(prev);
        next.add(clamped);
        return next;
      });
    },
    [numPages]
  );

  const focusHighlight = useCallback(
    (highlight: HighlightElement) => {
      if (!highlight.page_number) return;
      const rects = parseHighlightRects(highlight.rects_json);
      const topFrac = rects.length > 0 ? Math.max(0, rects[0].top - 0.12) : 0;
      scrollToPage(highlight.page_number, topFrac);
      setPulsingHighlightId(highlight.id);
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => {
        setPulsingHighlightId((curr) => (curr === highlight.id ? null : curr));
      }, 2200);
    },
    [scrollToPage]
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage: (p) => scrollToPage(p),
      focusHighlight,
    }),
    [scrollToPage, focusHighlight]
  );

  useEffect(() => {
    if (loading || numPages === 0 || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    if (focusHighlightId) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    if (initialPos.scrollTop && initialPos.scrollTop > 0) {
      requestAnimationFrame(() => {
        container.scrollTop = initialPos.scrollTop ?? 0;
      });
    } else if (initialPos.page && initialPos.page > 1) {
      requestAnimationFrame(() => scrollToPage(initialPos.page!));
    }
  }, [loading, numPages, focusHighlightId, initialPos, scrollToPage]);

  useEffect(() => {
    if (!focusHighlightId || loading || numPages === 0) return;
    if (lastFocusedIdRef.current === focusHighlightId) return;
    const target = highlights.find((h) => h.id === focusHighlightId);
    if (target) {
      lastFocusedIdRef.current = focusHighlightId;
      requestAnimationFrame(() => focusHighlight(target));
    }
  }, [focusHighlightId, highlights, loading, numPages, focusHighlight]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || numPages === 0) return;
    const midY = container.scrollTop + container.clientHeight * 0.35;
    let bestPage = currentPage;
    let bestDist = Infinity;
    pageElementsRef.current.forEach((el, p) => {
      const center = el.offsetTop + el.offsetHeight / 2;
      const dist = Math.abs(center - midY);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = p;
      }
    });
    if (bestPage !== currentPage) {
      setCurrentPage(bestPage);
      setPageInput(String(bestPage));
    }
    persistPosition(bestPage, scale, container.scrollTop, fitWidth);
  }, [currentPage, numPages, scale, fitWidth, persistPosition]);

  const handleCoverCaptured = useCallback(
    async (dataUrl: string) => {
      if (docRecord.cover_reference_id) return;
      try {
        const saved = await heptaClient.localFile.saveImage(
          dataUrl,
          `${docRecord.title || 'document'}-cover.png`
        );
        await heptaClient.documents.updateCover(docRecord.id, saved.referenceId);
        onCoverSaved?.(saved.referenceId);
      } catch (err) {
        console.error('Failed to save PDF cover:', err);
      }
    },
    [docRecord.id, docRecord.title, docRecord.cover_reference_id, onCoverSaved]
  );

  const handlePageViewportResolved = useCallback(
    (pageNumber: number, width: number, height: number) => {
      setPageSizes((prev) => {
        const existing = prev[pageNumber];
        if (existing && Math.abs(existing.width - width) < 1 && Math.abs(existing.height - height) < 1) {
          return prev;
        }
        return { ...prev, [pageNumber]: { width, height } };
      });
    },
    []
  );

  const handleTextMouseUp = useCallback(() => {
    if (isCropMode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    const bounding = range.getBoundingClientRect();
    if (bounding.width < 2 && bounding.height < 2) return;

    const clientRects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 1 && r.height > 1
    );
    if (clientRects.length === 0) return;

    let matchedPage = 0;
    const normalizedRects: HighlightRect[] = [];

    pageElementsRef.current.forEach((pageEl, pageNum) => {
      const pageBox = pageEl.getBoundingClientRect();
      for (const r of clientRects) {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (
          cx >= pageBox.left &&
          cx <= pageBox.right &&
          cy >= pageBox.top &&
          cy <= pageBox.bottom
        ) {
          if (matchedPage === 0) matchedPage = pageNum;
          if (matchedPage === pageNum) {
            normalizedRects.push({
              top: Math.max(0, Math.min(1, (r.top - pageBox.top) / pageBox.height)),
              left: Math.max(0, Math.min(1, (r.left - pageBox.left) / pageBox.width)),
              width: Math.max(0.002, Math.min(1, r.width / pageBox.width)),
              height: Math.max(0.004, Math.min(1, r.height / pageBox.height)),
            });
          }
        }
      }
    });

    if (matchedPage === 0 || normalizedRects.length === 0) return;

    setActivePopover(null);
    setPendingSelection({
      pageNumber: matchedPage,
      rects: mergeLineRects(normalizedRects),
      textContent: text,
      anchorX: bounding.left + bounding.width / 2,
      anchorY: bounding.top,
    });
  }, [isCropMode]);

  const handleCropStart = useCallback((pageNumber: number, nx: number, ny: number) => {
    setPendingSelection(null);
    setActivePopover(null);
    setCropDraft({ pageNumber, startX: nx, startY: ny, currentX: nx, currentY: ny });
  }, []);

  const handleCropMove = useCallback((pageNumber: number, nx: number, ny: number) => {
    setCropDraft((prev) =>
      prev && prev.pageNumber === pageNumber
        ? { ...prev, currentX: nx, currentY: ny }
        : prev
    );
  }, []);

  const handleCropEnd = useCallback(
    async (
      pageNumber: number,
      rectPxWidth: number,
      rectPxHeight: number,
      clientX: number,
      clientY: number
    ) => {
      const draft = cropDraft;
      setCropDraft(null);
      if (!draft || draft.pageNumber !== pageNumber || !pdfDoc) return;
      if (rectPxWidth < 12 || rectPxHeight < 12) return;

      const normRect: HighlightRect = {
        left: Math.min(draft.startX, draft.currentX),
        top: Math.min(draft.startY, draft.currentY),
        width: Math.abs(draft.currentX - draft.startX),
        height: Math.abs(draft.currentY - draft.startY),
      };

      try {
        const imageReferenceId = await captureAreaCropImage(pdfDoc, pageNumber, normRect, scale);
        if (!imageReferenceId) return;

        const created = await onCreateHighlight({
          sourceType: 'pdf',
          highlightType: 'area',
          pageNumber,
          rects: [normRect],
          textContent: '',
          imageReferenceId,
          color: 'yellow',
        });

        setIsCropMode(false);
        if (created) {
          setSelectedAreaHighlightId(created.id);
          setActivePopover({
            highlight: created,
            anchorX: clientX,
            anchorY: clientY,
          });
        }
      } catch (err) {
        console.error('Area crop highlight failed:', err);
        onError?.('Failed to create area crop highlight');
      }
    },
    [cropDraft, pdfDoc, scale, onCreateHighlight, onError]
  );

  const adjustCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      adjustCleanupRef.current?.();
      adjustCleanupRef.current = null;
    };
  }, []);

  const handleAreaAdjustMove = useCallback((pageNumber: number, nx: number, ny: number) => {
    const prev = areaAdjustDraftRef.current;
    if (!prev || prev.pageNumber !== pageNumber) return;
    const nextRect = computeAdjustedAreaRect(
      prev.initialRect,
      prev.handle,
      nx - prev.startX,
      ny - prev.startY
    );
    const updated = { ...prev, currentRect: nextRect };
    areaAdjustDraftRef.current = updated;
    setAreaAdjustDraft(updated);
  }, []);

  const handleAreaAdjustEnd = useCallback(
    async (pageNumber: number) => {
      adjustCleanupRef.current?.();
      adjustCleanupRef.current = null;
      const draft = areaAdjustDraftRef.current;
      areaAdjustDraftRef.current = null;
      setAreaAdjustDraft(null);
      if (!draft || draft.pageNumber !== pageNumber || !pdfDoc) return;
      const changed =
        Math.abs(draft.currentRect.left - draft.initialRect.left) > 0.001 ||
        Math.abs(draft.currentRect.top - draft.initialRect.top) > 0.001 ||
        Math.abs(draft.currentRect.width - draft.initialRect.width) > 0.001 ||
        Math.abs(draft.currentRect.height - draft.initialRect.height) > 0.001;
      if (!changed) return;

      justFinishedAdjustRef.current = true;
      window.setTimeout(() => {
        justFinishedAdjustRef.current = false;
      }, 150);

      setPendingRectOverrides((prev) => ({
        ...prev,
        [draft.highlightId]: draft.currentRect,
      }));

      try {
        const imageReferenceId = await captureAreaCropImage(
          pdfDoc,
          pageNumber,
          draft.currentRect,
          scale
        );
        await onUpdateHighlight(draft.highlightId, {
          rects: [draft.currentRect],
          imageReferenceId: imageReferenceId ?? undefined,
        });
      } catch (err) {
        console.error('Failed to resize area highlight:', err);
        onError?.('Failed to update area highlight');
      } finally {
        setPendingRectOverrides((prev) => {
          if (!(draft.highlightId in prev)) return prev;
          const next = { ...prev };
          delete next[draft.highlightId];
          return next;
        });
      }
    },
    [pdfDoc, scale, onUpdateHighlight, onError]
  );

  const handleAreaAdjustStart = useCallback(
    (
      highlight: HighlightElement,
      pageNumber: number,
      handle: AreaResizeHandle,
      nx: number,
      ny: number
    ) => {
      const rects = parseHighlightRects(highlight.rects_json);
      if (rects.length === 0) return;
      adjustCleanupRef.current?.();
      const initialRect = rects[0];
      const nextDraft: AreaAdjustDraft = {
        highlightId: highlight.id,
        pageNumber,
        handle,
        startX: nx,
        startY: ny,
        initialRect,
        currentRect: initialRect,
      };
      setPendingSelection(null);
      setActivePopover(null);
      setSelectedAreaHighlightId(highlight.id);
      areaAdjustDraftRef.current = nextDraft;
      justFinishedAdjustRef.current = false;
      setAreaAdjustDraft(nextDraft);

      const handleWindowMouseMove = (e: MouseEvent) => {
        const pageEl = pageElementsRef.current.get(pageNumber);
        if (!pageEl) return;
        const rect = pageEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const moveNx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        const moveNy = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
        handleAreaAdjustMove(pageNumber, moveNx, moveNy);
      };
      const handleWindowMouseUp = () => {
        void handleAreaAdjustEnd(pageNumber);
      };
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
      adjustCleanupRef.current = () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
      };
    },
    [handleAreaAdjustMove, handleAreaAdjustEnd]
  );

  const handleHighlightClick = useCallback((hl: HighlightElement, e: React.MouseEvent) => {
    if (justFinishedAdjustRef.current) return;
    setPendingSelection(null);
    setSelectedAreaHighlightId(hl.highlight_type === 'area' ? hl.id : null);
    setActivePopover({
      highlight: hl,
      anchorX: e.clientX,
      anchorY: e.clientY,
    });
  }, []);

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, HighlightElement[]>();
    for (const hl of highlights) {
      const p = hl.page_number || 1;
      const arr = map.get(p);
      if (arr) arr.push(hl);
      else map.set(p, [hl]);
    }
    return map;
  }, [highlights]);

  const handleZoom = (delta: number) => {
    setFitWidth(false);
    setScale((prev) => Math.max(0.4, Math.min(3.0, Number((prev + delta).toFixed(2)))));
  };

  const handleFitWidth = () => {
    setFitWidth(true);
    const w = scrollContainerRef.current?.clientWidth || 840;
    if (defaultPageSize.width > 0) {
      setScale(Math.max(0.45, Math.min(2.6, (w - 72) / defaultPageSize.width)));
    }
  };

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(pageInput, 10);
    if (!Number.isNaN(n)) {
      scrollToPage(n);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const savePendingHighlight = async (
    color: AnnotationColor,
    noteText = '',
    openEditorAfter = false,
    addToWbAfter = false
  ) => {
    if (!pendingSelection) return;
    const selSnapshot = pendingSelection;
    window.getSelection()?.removeAllRanges();
    setPendingSelection(null);

    const created = await onCreateHighlight({
      sourceType: 'pdf',
      highlightType: 'text',
      pageNumber: selSnapshot.pageNumber,
      rects: selSnapshot.rects,
      textContent: selSnapshot.textContent,
      noteText,
      color,
    });

    if (created) {
      if (addToWbAfter) {
        onAddHighlightToWhiteboard?.(created.id);
      } else if (openEditorAfter) {
        setActivePopover({
          highlight: created,
          anchorX: selSnapshot.anchorX,
          anchorY: selSnapshot.anchorY,
          autoOpenNote: true,
        });
      }
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-background-primary select-none">
      <div className="h-10 px-3 border-b border-light-grey bg-background-secondary flex items-center justify-between gap-2 shrink-0 text-[12px]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous Page"
            onClick={() => scrollToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-light-grey disabled:opacity-35 text-text-color cursor-pointer disabled:cursor-default"
            title="Previous Page"
          >
            <ChevronUp size={14} />
          </button>
          <form onSubmit={handlePageSubmit} className="flex items-center gap-1">
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={handlePageSubmit}
              className="w-10 h-6 text-center rounded bg-background-primary border border-light-grey focus:border-active-item text-[12px] tabular-nums text-text-color outline-none"
              aria-label="Current page"
            />
            <span className="text-middle-grey tabular-nums">/ {numPages || '—'}</span>
          </form>
          <button
            type="button"
            aria-label="Next Page"
            onClick={() => scrollToPage(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="p-1 rounded hover:bg-light-grey disabled:opacity-35 text-text-color cursor-pointer disabled:cursor-default"
            title="Next Page"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Area Crop"
            onClick={() => setIsCropMode((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11.5px] font-medium transition cursor-pointer ${
              isCropMode
                ? 'bg-active-item text-white'
                : 'hover:bg-light-grey text-middle-hard-grey hover:text-text-color'
            }`}
            title="Area Crop Highlight (drag box over PDF page)"
          >
            <Crop size={13} />
            <span>Area Crop</span>
          </button>

          <div className="w-px h-4 bg-light-grey mx-1" />

          <button
            type="button"
            onClick={() => handleZoom(-0.15)}
            className="p-1 rounded hover:bg-light-grey text-text-color cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="w-11 text-center text-[11.5px] tabular-nums text-middle-hard-grey">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => handleZoom(0.15)}
            className="p-1 rounded hover:bg-light-grey text-text-color cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={handleFitWidth}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[11.5px] transition cursor-pointer ${
              fitWidth
                ? 'bg-middle-transparent-blue text-active-item font-medium'
                : 'hover:bg-light-grey text-middle-hard-grey'
            }`}
            title="Fit Width"
          >
            <Maximize2 size={12} />
            <span>Fit</span>
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseUp={handleTextMouseUp}
        className="flex-1 overflow-y-auto overflow-x-auto relative px-4 py-2"
      >
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-middle-grey">
            <Loader2 size={24} className="animate-spin text-active-item" />
            <span className="text-[12.5px]">Rendering PDF document...</span>
          </div>
        )}

        {!loading &&
          pdfDoc &&
          Array.from({ length: numPages }, (_, idx) => {
            const pageNum = idx + 1;
            const dims = pageSizes[pageNum] ?? defaultPageSize;
            return (
              <PdfPageView
                key={pageNum}
                pdfDoc={pdfDoc}
                pageNumber={pageNum}
                baseWidth={dims.width}
                baseHeight={dims.height}
                scale={scale}
                isVisible={visiblePages.has(pageNum)}
                isCropMode={isCropMode}
                cropDraft={cropDraft}
                selectedAreaHighlightId={selectedAreaHighlightId}
                areaAdjustDraft={areaAdjustDraft}
                pendingRectOverrides={pendingRectOverrides}
                highlights={highlightsByPage.get(pageNum) ?? []}
                pulsingHighlightId={pulsingHighlightId}
                needCoverCapture={!docRecord.cover_reference_id}
                onCoverCaptured={handleCoverCaptured}
                onPageViewportResolved={handlePageViewportResolved}
                onHighlightClick={handleHighlightClick}
                onCropStart={handleCropStart}
                onCropMove={handleCropMove}
                onCropEnd={handleCropEnd}
                onAreaAdjustStart={handleAreaAdjustStart}
                registerPageElement={registerPageElement}
              />
            );
          })}
      </div>

      {pendingSelection && (
        <HighlightToolbar
          x={pendingSelection.anchorX}
          y={pendingSelection.anchorY}
          onSelectColor={(color) => void savePendingHighlight(color)}
          onSaveNote={(noteText, color = 'yellow') =>
            void savePendingHighlight(color, noteText, false, false)
          }
          onAddToWhiteboard={() => void savePendingHighlight('yellow', '', false, true)}
          onClose={() => {
            setPendingSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}

      {activePopover && (
        <HighlightToolbar
          x={activePopover.anchorX}
          y={activePopover.anchorY}
          isEditing
          activeColor={
            isAnnotationColor(activePopover.highlight.color)
              ? activePopover.highlight.color
              : 'yellow'
          }
          initialNote={activePopover.highlight.note_text}
          tags={
            highlights.find((h) => h.id === activePopover.highlight.id)?.tags ??
            activePopover.highlight.tags ??
            []
          }
          autoOpenNote={activePopover.autoOpenNote}
          onAddTag={
            onAddHighlightTag
              ? (tagName) => onAddHighlightTag(activePopover.highlight.id, tagName)
              : undefined
          }
          onRemoveTag={
            onRemoveHighlightTag
              ? (tagId) => onRemoveHighlightTag(activePopover.highlight.id, tagId)
              : undefined
          }
          onSelectColor={(color) => {
            const id = activePopover.highlight.id;
            setActivePopover((prev) =>
              prev ? { ...prev, highlight: { ...prev.highlight, color } } : null
            );
            void onUpdateHighlight(id, { color });
          }}
          onSaveNote={(noteText) => {
            const id = activePopover.highlight.id;
            setActivePopover((prev) =>
              prev ? { ...prev, highlight: { ...prev.highlight, note_text: noteText } } : null
            );
            void onUpdateHighlight(id, { noteText });
          }}
          onAddToWhiteboard={() => {
            onAddHighlightToWhiteboard?.(activePopover.highlight.id);
            setActivePopover(null);
          }}
          onDelete={() => {
            const hl = activePopover.highlight;
            setActivePopover(null);
            void onDeleteHighlight(hl);
          }}
          onClose={() => setActivePopover(null)}
        />
      )}
    </div>
  );
});
