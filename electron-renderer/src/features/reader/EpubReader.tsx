import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import ePub from 'epubjs';
import type { Book, Contents, Location, NavItem, Rendition } from 'epubjs';
import JSZip from 'jszip';
import {
  ChevronLeft,
  ChevronRight,
  ScrollText,
  BookOpen,
  AArrowUp,
  AArrowDown,
  Loader2,
} from 'lucide-react';
import type {
  AnnotationColor,
  DocumentRecord,
  HighlightElement,
} from '@shared/types';
import {
  type CreateHighlightInput,
  type ReaderTocItem,
  isAnnotationColor,
  resolveAnnotationColorHex,
  toExactArrayBuffer,
} from '@shared/palette';
import { heptaClient } from '../../client';
import { HighlightToolbar } from './HighlightToolbar';

(globalThis as unknown as { JSZip?: typeof JSZip }).JSZip = JSZip;

export interface EpubReaderHandle {
  navigateToHref: (href: string) => void;
  focusHighlight: (highlight: HighlightElement) => void;
}

export interface EpubReaderProps {
  document: DocumentRecord;
  highlights: HighlightElement[];
  focusHighlightId?: string | null;
  onTocLoaded?: (items: ReaderTocItem[]) => void;
  onCreateHighlight: (input: CreateHighlightInput) => Promise<HighlightElement | null>;
  onUpdateHighlight: (id: string, patch: { color?: AnnotationColor; noteText?: string }) => Promise<void>;
  onDeleteHighlight: (highlight: HighlightElement) => Promise<void>;
  onAddHighlightTag?: (highlightId: string, tagName: string) => Promise<void>;
  onRemoveHighlightTag?: (highlightId: string, tagId: string) => Promise<void>;
  onAddHighlightToWhiteboard?: (highlightId: string) => void;
  onCoverSaved?: (coverReferenceId: string) => void;
  onError?: (message: string) => void;
}

interface PendingEpubSelection {
  cfiRange: string;
  textContent: string;
  anchorX: number;
  anchorY: number;
  contents: Contents;
}

interface ActiveHighlightPopover {
  highlight: HighlightElement;
  anchorX: number;
  anchorY: number;
  autoOpenNote?: boolean;
}

interface LastEpubPosition {
  cfi?: string;
  flow?: 'paginated' | 'scrolled-doc';
  fontSize?: number;
}

function parseLastEpubPosition(raw: string): LastEpubPosition {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getCurrentTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function convertNavItems(items: NavItem[], prefix = 'epub-toc'): ReaderTocItem[] {
  return items.map((item, idx) => ({
    id: item.id || `${prefix}-${idx}`,
    title: (item.label || 'Untitled Chapter').trim(),
    href: item.href,
    children:
      item.subitems && item.subitems.length > 0
        ? convertNavItems(item.subitems, `${prefix}-${idx}`)
        : undefined,
  }));
}

export const EpubReader = forwardRef<EpubReaderHandle, EpubReaderProps>(function EpubReader(
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
    onError,
  },
  ref
) {
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const highlightsRef = useRef<HighlightElement[]>(highlights);
  highlightsRef.current = highlights;

  const initialPos = useMemo(
    () => parseLastEpubPosition(docRecord.last_position_json),
    [docRecord.id]
  );

  const [flow, setFlow] = useState<'paginated' | 'scrolled-doc'>(
    initialPos.flow === 'scrolled-doc' ? 'scrolled-doc' : 'paginated'
  );
  const [fontSize, setFontSize] = useState<number>(initialPos.fontSize || 105);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(getCurrentTheme);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentCfi, setCurrentCfi] = useState<string>(initialPos.cfi || '');
  const [sectionPage, setSectionPage] = useState<number>(1);
  const [sectionTotal, setSectionTotal] = useState<number>(0);
  const [pendingSelection, setPendingSelection] = useState<PendingEpubSelection | null>(null);
  const [activePopover, setActivePopover] = useState<ActiveHighlightPopover | null>(null);

  const appliedMapRef = useRef<Map<string, { cfi: string; color: AnnotationColor; theme: 'light' | 'dark' }>>(
    new Map()
  );
  const saveTimerRef = useRef<number | null>(null);
  const pendingPayloadRef = useRef<LastEpubPosition | null>(null);
  const lastFocusedIdRef = useRef<string | null>(null);
  const currentCfiRef = useRef<string>(initialPos.cfi || '');
  const flowRef = useRef<'paginated' | 'scrolled-doc'>(flow);
  const fontSizeRef = useRef<number>(fontSize);
  currentCfiRef.current = currentCfi;
  flowRef.current = flow;
  fontSizeRef.current = fontSize;

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeMode(getCurrentTheme());
    });
    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const persistPosition = useCallback(
    (cfi: string, activeFlow: 'paginated' | 'scrolled-doc', activeFontSize: number) => {
      const payload: LastEpubPosition = {
        cfi,
        flow: activeFlow,
        fontSize: activeFontSize,
      };
      pendingPayloadRef.current = payload;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        pendingPayloadRef.current = null;
        void heptaClient.documents
          .updatePosition(docRecord.id, JSON.stringify(payload))
          .catch((err) => console.error('Failed to persist EPUB position:', err));
      }, 350);
    },
    [docRecord.id]
  );

  const syncAnnotations = useCallback((rendition: Rendition, activeTheme: 'light' | 'dark') => {
    const applied = appliedMapRef.current;
    const currentById = new Map<string, HighlightElement>();
    for (const hl of highlightsRef.current) {
      if (hl.epub_cfi) currentById.set(hl.id, hl);
    }

    for (const [id, entry] of Array.from(applied.entries())) {
      const next = currentById.get(id);
      const nextColor: AnnotationColor =
        next && isAnnotationColor(next.color) ? next.color : 'yellow';
      if (!next || next.epub_cfi !== entry.cfi || nextColor !== entry.color || activeTheme !== entry.theme) {
        try {
          rendition.annotations.remove(entry.cfi, 'highlight');
        } catch {
          applied.delete(id);
          continue;
        }
        applied.delete(id);
      }
    }

    for (const [id, hl] of currentById.entries()) {
      if (applied.has(id) || !hl.epub_cfi) continue;
      const color: AnnotationColor = isAnnotationColor(hl.color) ? hl.color : 'yellow';
      const hex = resolveAnnotationColorHex(color, activeTheme);
      const cfi = hl.epub_cfi;
      try {
        rendition.annotations.highlight(
          cfi,
          { id: hl.id },
          (e: MouseEvent) => {
            const targetDoc = (e.target as HTMLElement | null)?.ownerDocument;
            const frameEl = targetDoc?.defaultView?.frameElement as HTMLElement | null;
            const frameRect = frameEl?.getBoundingClientRect();
            const anchorX = (frameRect?.left ?? 0) + e.clientX;
            const anchorY = (frameRect?.top ?? 0) + e.clientY;
            const latest = highlightsRef.current.find((item) => item.id === id) ?? hl;
            setPendingSelection(null);
            setActivePopover({
              highlight: latest,
              anchorX,
              anchorY,
            });
          },
          'hepta-epub-hl',
          {
            fill: hex,
            'fill-opacity': activeTheme === 'dark' ? '0.36' : '0.32',
            'mix-blend-mode': activeTheme === 'dark' ? 'screen' : 'multiply',
            cursor: 'pointer',
          }
        );
        applied.set(id, { cfi, color, theme: activeTheme });
      } catch {
        continue;
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let book: Book | null = null;
    let rendition: Rendition | null = null;
    appliedMapRef.current.clear();
    setLoading(true);

    const mountEpub = async () => {
      try {
        const bytes = await heptaClient.localFile.readBuffer(docRecord.file_reference_id);
        if (cancelled || !viewerRef.current) return;

        const arrayBuffer = toExactArrayBuffer(bytes);
        book = ePub(arrayBuffer);
        bookRef.current = book;
        await book.ready;
        if (cancelled || !viewerRef.current) return;

        try {
          const nav = await book.loaded.navigation;
          if (!cancelled && nav?.toc) {
            onTocLoaded?.(convertNavItems(nav.toc));
          }
        } catch {
          if (!cancelled) onTocLoaded?.([]);
        }

        if (!docRecord.cover_reference_id) {
          void (async () => {
            try {
              const coverUrl = await book?.coverUrl();
              if (!coverUrl || cancelled) return;
              const resp = await fetch(coverUrl);
              const blob = await resp.blob();
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () =>
                  typeof reader.result === 'string'
                    ? resolve(reader.result)
                    : reject(new Error('Invalid cover dataUrl'));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
              });
              if (cancelled || !dataUrl) return;
              const saved = await heptaClient.localFile.saveImage(
                dataUrl,
                `${docRecord.title || 'epub'}-cover.png`
              );
              await heptaClient.documents.updateCover(docRecord.id, saved.referenceId);
              onCoverSaved?.(saved.referenceId);
            } catch {
              return;
            }
          })();
        }

        viewerRef.current.innerHTML = '';
        rendition = book.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
          flow,
          spread: 'none',
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        rendition.themes.register('light', {
          'html, body': {
            background: '#ffffff !important',
            color: '#2e2e2e !important',
            'font-family': 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important',
            'line-height': '1.68 !important',
          },
          'body': {
            padding: '28px 40px !important',
          },
          'a': {
            color: '#207dff !important',
          },
          'img': {
            'max-width': '100% !important',
            height: 'auto !important',
          },
          '::selection': {
            background: 'rgba(75, 155, 230, 0.32)',
          },
        });

        rendition.themes.register('dark', {
          'html, body': {
            background: '#242629 !important',
            color: '#e1e1e1 !important',
            'font-family': 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important',
            'line-height': '1.68 !important',
          },
          'body': {
            padding: '28px 40px !important',
          },
          'a': {
            color: '#61c6fa !important',
          },
          'img': {
            'max-width': '100% !important',
            height: 'auto !important',
          },
          '::selection': {
            background: 'rgba(35, 131, 226, 0.35)',
          },
        });

        rendition.themes.select(themeMode);
        rendition.themes.fontSize(`${fontSize}%`);

        rendition.on('selected', (cfiRange: string, contents: Contents) => {
          const sel = contents.window.getSelection();
          const text = sel ? sel.toString().trim() : '';
          if (!text || !sel || !sel.rangeCount) return;

          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const frameEl = contents.document.defaultView?.frameElement as HTMLElement | null;
          const frameRect = frameEl?.getBoundingClientRect();

          const anchorX = (frameRect?.left ?? 0) + rect.left + rect.width / 2;
          const anchorY = (frameRect?.top ?? 0) + rect.top;

          setActivePopover(null);
          setPendingSelection({
            cfiRange,
            textContent: text,
            anchorX,
            anchorY,
            contents,
          });
        });

        rendition.on('relocated', (location: Location) => {
          const cfi = location?.start?.cfi;
          if (cfi) {
            setCurrentCfi(cfi);
            persistPosition(cfi, flowRef.current, fontSizeRef.current);
          }
          if (location?.start?.displayed) {
            const { page, total } = location.start.displayed;
            if (total > 0) {
              setSectionPage(page);
              setSectionTotal(total);
            }
          }
        });

        rendition.on('rendered', () => {
          if (rendition) {
            syncAnnotations(rendition, getCurrentTheme());
          }
        });

        const focusTarget = focusHighlightId
          ? highlightsRef.current.find((h) => h.id === focusHighlightId)?.epub_cfi
          : undefined;
        if (focusHighlightId && focusTarget) {
          lastFocusedIdRef.current = focusHighlightId;
        }
        const startTarget = focusTarget || currentCfiRef.current || undefined;
        await rendition.display(startTarget);
        if (!cancelled) {
          syncAnnotations(rendition, getCurrentTheme());
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load EPUB book';
          onError?.(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void mountEpub();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (pendingPayloadRef.current) {
        const flush = pendingPayloadRef.current;
        pendingPayloadRef.current = null;
        void heptaClient.documents
          .updatePosition(docRecord.id, JSON.stringify(flush))
          .catch(() => {});
      }
      try {
        rendition?.destroy();
      } catch {
        renditionRef.current = null;
      }
      try {
        book?.destroy();
      } catch {
        bookRef.current = null;
      }
      renditionRef.current = null;
      bookRef.current = null;
      appliedMapRef.current.clear();
    };
  }, [docRecord.id, docRecord.file_reference_id, flow]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    rendition.themes.select(themeMode);
    syncAnnotations(rendition, themeMode);
  }, [themeMode, syncAnnotations]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    rendition.themes.fontSize(`${fontSize}%`);
    if (currentCfiRef.current) {
      persistPosition(currentCfiRef.current, flow, fontSize);
    }
  }, [fontSize, flow, persistPosition]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    syncAnnotations(rendition, themeMode);
  }, [highlights, themeMode, syncAnnotations]);

  const navigateToHref = useCallback((href: string) => {
    if (!renditionRef.current) return;
    void renditionRef.current.display(href);
  }, []);

  const focusHighlight = useCallback((highlight: HighlightElement) => {
    if (!renditionRef.current || !highlight.epub_cfi) return;
    void renditionRef.current.display(highlight.epub_cfi);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      navigateToHref,
      focusHighlight,
    }),
    [navigateToHref, focusHighlight]
  );

  useEffect(() => {
    if (!focusHighlightId || loading || !renditionRef.current) return;
    if (lastFocusedIdRef.current === focusHighlightId) return;
    const target = highlights.find((h) => h.id === focusHighlightId);
    if (target?.epub_cfi) {
      lastFocusedIdRef.current = focusHighlightId;
      void renditionRef.current.display(target.epub_cfi);
    }
  }, [focusHighlightId, highlights, loading]);

  useEffect(() => {
    if (flow !== 'paginated') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') {
        void renditionRef.current?.next();
      } else if (e.key === 'ArrowLeft') {
        void renditionRef.current?.prev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flow]);

  const savePendingHighlight = async (
    color: AnnotationColor,
    noteText = '',
    openEditorAfter = false,
    addToWbAfter = false
  ) => {
    if (!pendingSelection) return;
    const selSnapshot = pendingSelection;
    try {
      selSnapshot.contents.window.getSelection()?.removeAllRanges();
    } catch {
      setPendingSelection(null);
    }
    setPendingSelection(null);

    const created = await onCreateHighlight({
      sourceType: 'epub',
      highlightType: 'text',
      epubCfi: selSnapshot.cfiRange,
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
          {flow === 'paginated' && (
            <>
              <button
                type="button"
                aria-label="Previous Page"
                onClick={() => void renditionRef.current?.prev()}
                className="p-1 rounded hover:bg-light-grey text-text-color cursor-pointer"
                title="Previous Page (Left Arrow)"
              >
                <ChevronLeft size={14} />
              </button>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  readOnly
                  value={sectionTotal > 0 ? String(sectionPage) : '—'}
                  aria-label="Current page"
                  className="w-10 h-6 text-center rounded bg-background-primary border border-light-grey text-[12px] tabular-nums text-text-color outline-none"
                />
                <span className="text-middle-grey tabular-nums">/ {sectionTotal || '—'}</span>
              </div>
              <button
                type="button"
                aria-label="Next Page"
                onClick={() => void renditionRef.current?.next()}
                className="p-1 rounded hover:bg-light-grey text-text-color cursor-pointer"
                title="Next Page (Right Arrow)"
              >
                <ChevronRight size={14} />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Toggle reading flow"
            onClick={() =>
              setFlow((prev) => {
                const next = prev === 'paginated' ? 'scrolled-doc' : 'paginated';
                if (currentCfiRef.current) {
                  persistPosition(currentCfiRef.current, next, fontSizeRef.current);
                }
                return next;
              })
            }
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition cursor-pointer"
            title={flow === 'paginated' ? 'Switch to Scrolled Reading' : 'Switch to Paginated Reading'}
          >
            {flow === 'paginated' ? <BookOpen size={13} /> : <ScrollText size={13} />}
            <span>{flow === 'paginated' ? 'Paginated' : 'Scrolled'}</span>
          </button>

          <div className="w-px h-4 bg-light-grey mx-1" />

          <button
            type="button"
            aria-label="Decrease Font Size"
            onClick={() =>
              setFontSize((s) => {
                const next = Math.max(75, s - 10);
                if (currentCfiRef.current) {
                  persistPosition(currentCfiRef.current, flowRef.current, next);
                }
                return next;
              })
            }
            className="p-1 rounded hover:bg-light-grey text-text-color cursor-pointer"
            title="Decrease Font Size"
          >
            <AArrowDown size={14} />
          </button>
          <span className="w-10 text-center text-[11.5px] tabular-nums text-middle-hard-grey">
            {fontSize}%
          </span>
          <button
            type="button"
            aria-label="Increase Font Size"
            onClick={() =>
              setFontSize((s) => {
                const next = Math.min(180, s + 10);
                if (currentCfiRef.current) {
                  persistPosition(currentCfiRef.current, flowRef.current, next);
                }
                return next;
              })
            }
            className="p-1 rounded hover:bg-light-grey text-text-color cursor-pointer"
            title="Increase Font Size"
          >
            <AArrowUp size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-background-primary flex justify-center px-4 py-2">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background-primary/80 text-middle-grey">
            <Loader2 size={24} className="animate-spin text-active-item" />
            <span className="text-[12.5px]">Opening EPUB book...</span>
          </div>
        )}

        <div
          ref={viewerRef}
          className="w-full max-w-[880px] h-full bg-background-secondary shadow-card border border-light-grey overflow-hidden"
        />
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
            try {
              pendingSelection.contents.window.getSelection()?.removeAllRanges();
            } catch {
              setPendingSelection(null);
            }
            setPendingSelection(null);
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
