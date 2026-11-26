import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  PanelLeftClose,
  PanelLeftOpen,
  ListTree,
  Highlighter,
  Search,
  LayoutGrid,
  Trash2,
  MessageSquare,
  Check,
  FileText,
  BookOpen,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import type {
  AnnotationColor,
  DocumentRecord,
  HighlightElement,
  HighlightRect,
} from '@shared/types';
import {
  ANNOTATION_COLORS,
  type CreateHighlightInput,
  type ReaderTocItem,
  getAnnotationCssVar,
  isAnnotationColor,
} from '@shared/palette';
import { heptaClient } from '../../client';
import { useAppModal } from '../../primitives/AppModal';
import { HighlightTagChips } from '../../primitives/card-metadata';
import { PdfReader, type PdfReaderHandle } from './PdfReader';
import { EpubReader, type EpubReaderHandle } from './EpubReader';

export interface DocumentReaderShellProps {
  documentId: string;
  focusHighlightId?: string | null;
  onClose?: () => void;
  onAddHighlightToWhiteboard?: (highlightId: string) => void;
  onDocumentUpdated?: () => void;
  embedded?: boolean;
}

type SidebarTab = 'toc' | 'highlights';

function TocTree({
  items,
  depth = 0,
  onSelect,
}: {
  items: ReaderTocItem[];
  depth?: number;
  onSelect: (item: ReaderTocItem) => void;
}) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <div key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            style={{ paddingLeft: `${10 + depth * 12}px` }}
            className="w-full text-left pr-2.5 py-1.5 rounded-md text-[12px] text-text-color hover:bg-light-grey transition flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="truncate">{item.title}</span>
            {item.pageNumber !== undefined && (
              <span className="text-[10.5px] text-middle-grey tabular-nums shrink-0">
                p.{item.pageNumber}
              </span>
            )}
          </button>
          {item.children && item.children.length > 0 && (
            <TocTree items={item.children} depth={depth + 1} onSelect={onSelect} />
          )}
        </div>
      ))}
    </div>
  );
}

export function DocumentReaderShell({
  documentId,
  focusHighlightId = null,
  onClose,
  onAddHighlightToWhiteboard,
  onDocumentUpdated,
  embedded = false,
}: DocumentReaderShellProps) {
  const { showConfirm, showAlert } = useAppModal();
  const pdfRef = useRef<PdfReaderHandle | null>(null);
  const epubRef = useRef<EpubReaderHandle | null>(null);

  const [docRecord, setDocRecord] = useState<DocumentRecord | null>(null);
  const [highlights, setHighlights] = useState<HighlightElement[]>([]);
  const [tocItems, setTocItems] = useState<ReaderTocItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => !embedded);
  const [activeTab, setActiveTab] = useState<SidebarTab>(
    focusHighlightId ? 'highlights' : 'toc'
  );
  const [colorFilter, setColorFilter] = useState<AnnotationColor | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFocusId, setActiveFocusId] = useState<string | null>(focusHighlightId);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');

  useEffect(() => {
    setActiveFocusId(focusHighlightId ?? null);
    if (focusHighlightId) {
      setActiveTab('highlights');
    }
  }, [focusHighlightId]);

  const fetchDocumentAndHighlights = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const doc = await heptaClient.documents.get(documentId);
      if (!doc) {
        setDocRecord(null);
        setLoadError('Document not found or has been deleted.');
        return;
      }
      setDocRecord(doc);

      const hls = await heptaClient.highlights.listBySource(documentId);
      setHighlights(hls);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open document';
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    setTocItems([]);
    void fetchDocumentAndHighlights();
  }, [fetchDocumentAndHighlights]);

  const handleCreateHighlight = useCallback(
    async (input: CreateHighlightInput): Promise<HighlightElement | null> => {
      if (!docRecord) return null;
      const noteText = input.noteText?.trim() ?? '';

      try {
        const created = await heptaClient.highlights.create({
          sourceId: docRecord.id,
          sourceType: input.sourceType,
          highlightType: input.highlightType,
          pageNumber: input.pageNumber ?? null,
          epubCfi: input.epubCfi ?? null,
          rects: input.rects ?? [],
          textContent: input.textContent,
          imageReferenceId: input.imageReferenceId ?? null,
          noteJson: '{}',
          noteText,
          color: input.color,
        });
        setHighlights((prev) => [...prev, created]);
        onDocumentUpdated?.();
        return created;
      } catch (err) {
        console.error('Failed to insert highlight:', err);
        void showAlert({
          title: 'Highlight Error',
          message: 'Could not save highlight to local database.',
        });
        return null;
      }
    },
    [docRecord, onDocumentUpdated, showAlert]
  );

  const handleUpdateHighlight = useCallback(
    async (
      id: string,
      patch: {
        color?: AnnotationColor;
        noteText?: string;
        rects?: HighlightRect[];
        imageReferenceId?: string;
      }
    ) => {
      const now = Date.now();
      const target = highlights.find((h) => h.id === id);
      if (!target) return;
      const nextColor = patch.color ?? target.color;
      const nextNote = patch.noteText !== undefined ? patch.noteText : target.note_text;
      const nextRectsJson =
        patch.rects !== undefined ? JSON.stringify(patch.rects) : target.rects_json;
      const nextImageRefId =
        patch.imageReferenceId !== undefined
          ? patch.imageReferenceId
          : target.image_reference_id;

      try {
        if (patch.color !== undefined) {
          await heptaClient.highlights.updateColor(id, patch.color);
        }
        if (patch.noteText !== undefined) {
          await heptaClient.highlights.updateNote(id, patch.noteText);
        }
        if (patch.rects !== undefined) {
          await heptaClient.highlights.updateRects(id, patch.rects, patch.imageReferenceId);
        }
        setHighlights((prev) =>
          prev.map((h) =>
            h.id === id
              ? {
                  ...h,
                  color: nextColor,
                  note_text: nextNote,
                  rects_json: nextRectsJson,
                  image_reference_id: nextImageRefId,
                  updated_at: now,
                }
              : h
          )
        );
        onDocumentUpdated?.();
      } catch (err) {
        console.error('Failed to update highlight:', err);
      }
    },
    [highlights, onDocumentUpdated]
  );

  const handleAddHighlightTag = useCallback(
    async (highlightId: string, tagName: string) => {
      try {
        const tag = await heptaClient.highlights.addTag(highlightId, tagName);
        setHighlights((prev) =>
          prev.map((h) => {
            if (h.id !== highlightId) return h;
            const existing = h.tags ?? [];
            if (existing.some((t) => t.id === tag.id)) return h;
            return { ...h, tags: [...existing, tag] };
          })
        );
        onDocumentUpdated?.();
      } catch (err) {
        console.error('Failed to add highlight tag:', err);
      }
    },
    [onDocumentUpdated]
  );

  const handleRemoveHighlightTag = useCallback(
    async (highlightId: string, tagId: string) => {
      try {
        await heptaClient.highlights.removeTag(highlightId, tagId);
        setHighlights((prev) =>
          prev.map((h) =>
            h.id === highlightId
              ? { ...h, tags: (h.tags ?? []).filter((t) => t.id !== tagId) }
              : h
          )
        );
        onDocumentUpdated?.();
      } catch (err) {
        console.error('Failed to remove highlight tag:', err);
      }
    },
    [onDocumentUpdated]
  );

  const handleDeleteHighlight = useCallback(
    async (highlight: HighlightElement) => {
      const confirmed = await showConfirm({
        title: 'Delete highlight',
        message: 'Are you sure you want to delete this highlight and its note?',
        confirmText: 'Delete',
        variant: 'danger',
      });
      if (!confirmed) return;

      try {
        await heptaClient.highlights.delete(highlight.id);
        setHighlights((prev) => prev.filter((h) => h.id !== highlight.id));
        if (editingNoteId === highlight.id) {
          setEditingNoteId(null);
        }
        onDocumentUpdated?.();
      } catch (err) {
        console.error('Failed to delete highlight:', err);
      }
    },
    [editingNoteId, onDocumentUpdated, showConfirm]
  );

  const handleJumpToHighlight = useCallback(
    (hl: HighlightElement) => {
      setActiveFocusId(hl.id);
      if (docRecord?.doc_type === 'pdf') {
        pdfRef.current?.focusHighlight(hl);
      } else if (docRecord?.doc_type === 'epub') {
        epubRef.current?.focusHighlight(hl);
      }
    },
    [docRecord?.doc_type]
  );

  const handleSelectToc = useCallback(
    (item: ReaderTocItem) => {
      if (docRecord?.doc_type === 'pdf' && item.pageNumber !== undefined) {
        pdfRef.current?.scrollToPage(item.pageNumber);
      } else if (docRecord?.doc_type === 'epub' && item.href) {
        epubRef.current?.navigateToHref(item.href);
      }
    },
    [docRecord?.doc_type]
  );

  const filteredHighlights = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return highlights.filter((h) => {
      if (colorFilter !== 'all' && h.color !== colorFilter) return false;
      if (!q) return true;
      return (
        h.text_content.toLowerCase().includes(q) ||
        h.note_text.toLowerCase().includes(q)
      );
    });
  }, [highlights, colorFilter, searchQuery]);

  const handleStartEditNote = (hl: HighlightElement) => {
    setEditingNoteId(hl.id);
    setNoteDraft(hl.note_text);
  };

  const handleCommitNote = async (hlId: string) => {
    const trimmed = noteDraft.trim();
    setEditingNoteId(null);
    await handleUpdateHighlight(hlId, { noteText: trimmed });
  };

  return (
    <div
      className={
        embedded
          ? 'w-full h-[640px] bg-background-primary flex flex-col overflow-hidden text-text-color'
          : 'fixed inset-0 z-[1050] bg-background-primary flex flex-col overflow-hidden text-text-color'
      }
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : 'true'}
      aria-label={docRecord?.title || 'Document Reader'}
    >
      <header className="h-11 px-3 border-b border-light-grey bg-background-secondary flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsSidebarOpen((v) => !v)}
            className="p-1.5 rounded-md hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition cursor-pointer shrink-0"
            title={isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
          >
            {isSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>

          {docRecord && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ultra-light-grey border border-light-grey text-[10.5px] font-semibold uppercase tracking-wide text-middle-hard-grey shrink-0">
              {docRecord.doc_type === 'pdf' ? <FileText size={11} /> : <BookOpen size={11} />}
              <span>{docRecord.doc_type}</span>
            </span>
          )}

          <h1 className="text-[13.5px] font-semibold truncate text-text-color">
            {docRecord?.title || 'Loading document...'}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded-full bg-ultra-light-grey border border-light-grey text-[11px] font-medium tabular-nums text-middle-grey">
            {highlights.length} highlight{highlights.length === 1 ? '' : 's'}
          </span>

          {!embedded && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition cursor-pointer"
              title="Close Reader"
              aria-label="Close Reader"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {isSidebarOpen && (
          <aside
            className={`${
              embedded ? 'w-[240px]' : 'w-[310px]'
            } shrink-0 border-r border-light-grey bg-background-secondary flex flex-col overflow-hidden`}
          >
            <div className="p-1.5 border-b border-light-grey grid grid-cols-2 gap-1 bg-background-primary/50 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('toc')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-medium transition cursor-pointer ${
                  activeTab === 'toc'
                    ? 'bg-background-secondary text-text-color shadow-float border border-light-grey'
                    : 'text-middle-hard-grey hover:text-text-color'
                }`}
              >
                <ListTree size={13} />
                <span>Contents</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('highlights')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-medium transition cursor-pointer ${
                  activeTab === 'highlights'
                    ? 'bg-background-secondary text-text-color shadow-float border border-light-grey'
                    : 'text-middle-hard-grey hover:text-text-color'
                }`}
              >
                <Highlighter size={13} />
                <span>Highlights ({highlights.length})</span>
              </button>
            </div>

            {activeTab === 'toc' ? (
              <div className="flex-1 overflow-y-auto p-2">
                {tocItems.length === 0 ? (
                  <div className="py-12 px-4 text-center text-[12px] text-middle-grey">
                    No table of contents embedded in this document.
                  </div>
                ) : (
                  <TocTree items={tocItems} onSelect={handleSelectToc} />
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-2.5 border-b border-light-grey space-y-2 shrink-0">
                  <div className="relative">
                    <Search
                      size={12.5}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-middle-grey"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search highlights & notes..."
                      className="w-full h-7 pl-7 pr-2.5 rounded-md bg-background-primary border border-light-grey focus:border-active-item text-[12px] text-text-color placeholder:text-middle-grey outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setColorFilter('all')}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition cursor-pointer border ${
                        colorFilter === 'all'
                          ? 'bg-active-item text-white border-active-item'
                          : 'bg-background-primary border-light-grey text-middle-hard-grey hover:text-text-color'
                      }`}
                    >
                      All
                    </button>
                    {ANNOTATION_COLORS.map((c) => {
                      const active = colorFilter === c.color;
                      return (
                        <button
                          key={c.color}
                          type="button"
                          onClick={() => setColorFilter(active ? 'all' : c.color)}
                          title={`Filter by ${c.label}`}
                          aria-label={`Filter by ${c.label}`}
                          className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                            active ? 'ring-2 ring-text-color ring-offset-1 ring-offset-background-secondary scale-110' : 'opacity-80 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: getAnnotationCssVar(c.color) }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                  {filteredHighlights.length === 0 ? (
                    <div className="py-12 px-4 text-center text-[12px] text-middle-grey">
                      {highlights.length === 0
                        ? 'Select text or use Area Crop to create your first highlight.'
                        : 'No highlights match your filter.'}
                    </div>
                  ) : (
                    filteredHighlights.map((hl) => {
                      const color: AnnotationColor = isAnnotationColor(hl.color)
                        ? hl.color
                        : 'yellow';
                      const colorVar = getAnnotationCssVar(color);
                      const isEditingThisNote = editingNoteId === hl.id;
                      const isFocused = activeFocusId === hl.id;

                      return (
                        <div
                          key={hl.id}
                          className={`group rounded-lg bg-background-primary border transition overflow-hidden ${
                            isFocused
                              ? 'border-active-item shadow-float'
                              : 'border-light-grey hover:border-light-middle-grey'
                          }`}
                        >
                          <div
                            onClick={() => handleJumpToHighlight(hl)}
                            className="p-2.5 cursor-pointer space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-[10.5px] text-middle-grey">
                              <span className="flex items-center gap-1.5 font-medium">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: colorVar }}
                                />
                                <span>
                                  {hl.page_number
                                    ? `Page ${hl.page_number}`
                                    : hl.highlight_type === 'area'
                                    ? 'Area'
                                    : 'Excerpt'}
                                </span>
                              </span>
                              <span className="inline-flex items-center gap-0.5 text-active-item opacity-0 group-hover:opacity-100 transition-opacity">
                                <span>Jump</span>
                                <ArrowUpRight size={11} />
                              </span>
                            </div>

                            {hl.highlight_type === 'area' && hl.image_reference_id ? (
                              <div
                                className="rounded overflow-hidden border-l-[3px] bg-background-secondary p-1"
                                style={{ borderLeftColor: colorVar }}
                              >
                                <img
                                  src={`hepta-preview://${hl.image_reference_id}`}
                                  alt="Cropped PDF region"
                                  className="w-full max-h-40 object-contain rounded-sm"
                                  loading="lazy"
                                />
                              </div>
                            ) : (
                              <blockquote
                                className="pl-2.5 border-l-[3px] text-[12px] text-text-color leading-relaxed break-words"
                                style={{ borderLeftColor: colorVar }}
                              >
                                {hl.text_content}
                              </blockquote>
                            )}
                          </div>

                          <div className="px-2.5 pb-2 space-y-1.5">
                            {isEditingThisNote ? (
                              <div className="space-y-1.5">
                                <textarea
                                  value={noteDraft}
                                  onChange={(e) => setNoteDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                      e.preventDefault();
                                      void handleCommitNote(hl.id);
                                    } else if (e.key === 'Escape') {
                                      e.stopPropagation();
                                      setEditingNoteId(null);
                                    }
                                  }}
                                  rows={2}
                                  autoFocus
                                  placeholder="Add note..."
                                  className="w-full resize-none rounded bg-background-secondary border border-active-item px-2 py-1 text-[11.5px] text-text-color outline-none"
                                />
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingNoteId(null)}
                                    className="px-2 py-0.5 rounded text-[11px] text-middle-hard-grey hover:bg-light-grey cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleCommitNote(hl.id)}
                                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-active-item text-white flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Check size={10} />
                                    <span>Save</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              hl.note_text && (
                                <div
                                  onClick={() => handleStartEditNote(hl)}
                                  className="px-2 py-1 rounded bg-background-secondary border border-light-grey text-[11.5px] text-middle-hard-grey cursor-text hover:border-light-middle-grey"
                                  title="Click to edit note"
                                >
                                  {hl.note_text}
                                </div>
                              )
                            )}

                            <HighlightTagChips
                              tags={hl.tags}
                              onAddTag={(tagName) => handleAddHighlightTag(hl.id, tagName)}
                              onRemoveTag={(tagId) => handleRemoveHighlightTag(hl.id, tagId)}
                              compact
                            />

                            <div className="flex items-center justify-between pt-0.5">
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {ANNOTATION_COLORS.map((c) => (
                                  <button
                                    key={c.color}
                                    type="button"
                                    onClick={() =>
                                      void handleUpdateHighlight(hl.id, { color: c.color })
                                    }
                                    className={`w-2.5 h-2.5 rounded-full cursor-pointer transition-transform hover:scale-125 ${
                                      hl.color === c.color ? 'ring-1 ring-text-color' : ''
                                    }`}
                                    style={{ backgroundColor: getAnnotationCssVar(c.color) }}
                                    title={`Change color to ${c.label}`}
                                  />
                                ))}
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditNote(hl)}
                                  className="p-1 rounded hover:bg-light-grey text-middle-hard-grey hover:text-text-color cursor-pointer"
                                  title={hl.note_text ? 'Edit Note' : 'Add Note'}
                                >
                                  <MessageSquare size={12} />
                                </button>
                                {onAddHighlightToWhiteboard && (
                                  <button
                                    type="button"
                                    onClick={() => onAddHighlightToWhiteboard(hl.id)}
                                    className="px-1.5 py-0.5 rounded hover:bg-light-grey text-[11px] font-medium text-middle-hard-grey hover:text-active-item flex items-center gap-1 cursor-pointer"
                                    title="Add Highlight to Whiteboard"
                                  >
                                    <LayoutGrid size={11.5} />
                                    <span>To Board</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteHighlight(hl)}
                                  className="p-1 rounded hover:bg-danger-item/15 text-middle-grey hover:text-danger-item cursor-pointer"
                                  title="Delete Highlight"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </aside>
        )}

        <main className="flex-1 flex flex-col overflow-hidden relative">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-middle-grey">
              <Loader2 size={24} className="animate-spin text-active-item" />
              <span className="text-[12.5px]">Loading document...</span>
            </div>
          ) : loadError || !docRecord ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-[13.5px] font-medium text-danger-item">
                {loadError || 'Unable to open document.'}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-md bg-background-secondary border border-light-grey hover:border-active-item text-[12px] cursor-pointer"
              >
                Close Reader
              </button>
            </div>
          ) : docRecord.doc_type === 'pdf' ? (
            <PdfReader
              ref={pdfRef}
              document={docRecord}
              highlights={highlights}
              focusHighlightId={activeFocusId}
              onTocLoaded={setTocItems}
              onCreateHighlight={handleCreateHighlight}
              onUpdateHighlight={handleUpdateHighlight}
              onDeleteHighlight={handleDeleteHighlight}
              onAddHighlightTag={handleAddHighlightTag}
              onRemoveHighlightTag={handleRemoveHighlightTag}
              onAddHighlightToWhiteboard={onAddHighlightToWhiteboard}
              onCoverSaved={(coverRefId) => {
                setDocRecord((prev) =>
                  prev ? { ...prev, cover_reference_id: coverRefId } : prev
                );
                onDocumentUpdated?.();
              }}
              onTotalPagesResolved={(totalPages) => {
                setDocRecord((prev) =>
                  prev ? { ...prev, total_pages: totalPages } : prev
                );
                onDocumentUpdated?.();
              }}
              onError={(msg) => setLoadError(msg)}
            />
          ) : (
            <EpubReader
              ref={epubRef}
              document={docRecord}
              highlights={highlights}
              focusHighlightId={activeFocusId}
              onTocLoaded={setTocItems}
              onCreateHighlight={handleCreateHighlight}
              onUpdateHighlight={handleUpdateHighlight}
              onDeleteHighlight={handleDeleteHighlight}
              onAddHighlightTag={handleAddHighlightTag}
              onRemoveHighlightTag={handleRemoveHighlightTag}
              onAddHighlightToWhiteboard={onAddHighlightToWhiteboard}
              onCoverSaved={(coverRefId) => {
                setDocRecord((prev) =>
                  prev ? { ...prev, cover_reference_id: coverRefId } : prev
                );
                onDocumentUpdated?.();
              }}
              onError={(msg) => setLoadError(msg)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
