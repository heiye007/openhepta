import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Highlighter,
  Search,
  PanelRightOpen,
  Plus,
  FileText,
  BookOpen,
  StickyNote,
  Trash2,
  ExternalLink,
  MessageSquare,
  Check,
  X,
} from 'lucide-react';
import type {
  AnnotationColor,
  Card,
  HighlightJoinedRow,
} from '@shared/types';
import {
  ANNOTATION_COLORS,
  getAnnotationCssVar,
  resolveCardBgColor,
} from '@shared/palette';
import { heptaClient } from '../../client';
import { useAppModal } from '../../primitives/AppModal';
import { HighlightTagChips } from '../../primitives/card-metadata';
import { SidebarExpandButton } from '../../primitives/SidebarExpandButton';

export interface HighlightsViewProps {
  cards: Card[];
  onOpenCardInSidePanel: (cardId: string) => void;
  onAddCardToWhiteboard: (cardId: string) => void;
  onOpenDocument?: (documentId: string, highlightId?: string) => void;
  onAddHighlightToWhiteboard?: (highlightId: string) => void;
  refreshKey?: number;
  isSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
}

type SourceFilter = 'all' | 'pdf' | 'epub' | 'card';

interface ExtractedCardHighlight {
  id: string;
  cardId: string;
  cardTitle: string;
  cardColor?: string | null;
  excerpt: string;
  updatedAt: number;
}

interface ProseMirrorJsonNode {
  type?: string;
  text?: string;
  marks?: Array<{ type?: string }>;
  content?: ProseMirrorJsonNode[];
}

function collectText(node: ProseMirrorJsonNode | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  return node.content.map(collectText).join(' ');
}

function extractHighlightsFromCards(cards: Card[]): ExtractedCardHighlight[] {
  const results: ExtractedCardHighlight[] = [];
  for (const card of cards) {
    if (card.content_json && card.content_json.includes('"type":"doc"')) {
      try {
        const doc = JSON.parse(card.content_json) as ProseMirrorJsonNode;
        const walk = (node: ProseMirrorJsonNode | undefined) => {
          if (!node) return;
          if (node.type === 'blockquote' || node.type === 'callout') {
            const text = collectText(node).trim();
            if (text) {
              results.push({
                id: `${card.id}-blk-${results.length}`,
                cardId: card.id,
                cardTitle: card.title || 'Untitled',
                cardColor: card.color,
                excerpt: text,
                updatedAt: card.updated_at,
              });
            }
          } else if (
            node.type === 'text' &&
            Array.isArray(node.marks) &&
            node.marks.some((m) => m.type === 'highlight')
          ) {
            const text = (node.text || '').trim();
            if (text) {
              results.push({
                id: `${card.id}-hl-${results.length}`,
                cardId: card.id,
                cardTitle: card.title || 'Untitled',
                cardColor: card.color,
                excerpt: text,
                updatedAt: card.updated_at,
              });
            }
          }
          if (Array.isArray(node.content)) {
            for (const child of node.content) walk(child);
          }
        };
        walk(doc);
      } catch {
        continue;
      }
    }
  }
  return results;
}

export function HighlightsView({
  cards,
  onOpenCardInSidePanel,
  onAddCardToWhiteboard,
  onOpenDocument,
  onAddHighlightToWhiteboard,
  refreshKey = 0,
  isSidebarCollapsed = false,
  onExpandSidebar,
}: HighlightsViewProps) {
  const { showConfirm } = useAppModal();
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [colorFilter, setColorFilter] = useState<AnnotationColor | 'all'>('all');
  const [docHighlights, setDocHighlights] = useState<HighlightJoinedRow[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const loadDocHighlights = useCallback(async () => {
    try {
      const rows = await heptaClient.highlights.list();
      setDocHighlights(rows || []);
    } catch (err) {
      console.error('Failed to load highlight_elements:', err);
    }
  }, []);

  useEffect(() => {
    void loadDocHighlights();
  }, [refreshKey, loadDocHighlights]);

  const cardHighlights = useMemo(() => extractHighlightsFromCards(cards), [cards]);

  const filteredDocHighlights = useMemo(() => {
    if (sourceFilter === 'card') return [];
    const q = query.trim().toLowerCase();
    return docHighlights.filter((h) => {
      if (sourceFilter !== 'all' && h.source_type !== sourceFilter) return false;
      if (colorFilter !== 'all' && h.color !== colorFilter) return false;
      if (!q) return true;
      return (
        (h.text_content || '').toLowerCase().includes(q) ||
        (h.note_text || '').toLowerCase().includes(q) ||
        (h.doc_title || '').toLowerCase().includes(q) ||
        (h.tags ?? []).some((t) => t.name.toLowerCase().includes(q))
      );
    });
  }, [docHighlights, sourceFilter, colorFilter, query]);

  const handleAddHighlightTag = useCallback(async (highlightId: string, tagName: string) => {
    try {
      const tag = await heptaClient.highlights.addTag(highlightId, tagName);
      setDocHighlights((prev) =>
        prev.map((h) => {
          if (h.id !== highlightId) return h;
          const existing = h.tags ?? [];
          if (existing.some((t) => t.id === tag.id)) return h;
          return { ...h, tags: [...existing, tag] };
        })
      );
    } catch (err) {
      console.error('Failed to add highlight tag:', err);
    }
  }, []);

  const handleRemoveHighlightTag = useCallback(async (highlightId: string, tagId: string) => {
    try {
      await heptaClient.highlights.removeTag(highlightId, tagId);
      setDocHighlights((prev) =>
        prev.map((h) =>
          h.id === highlightId
            ? { ...h, tags: (h.tags ?? []).filter((t) => t.id !== tagId) }
            : h
        )
      );
    } catch (err) {
      console.error('Failed to remove highlight tag:', err);
    }
  }, []);

  const filteredCardHighlights = useMemo(() => {
    if (sourceFilter !== 'all' && sourceFilter !== 'card') return [];
    if (colorFilter !== 'all') return [];
    const q = query.trim().toLowerCase();
    if (!q) return cardHighlights;
    return cardHighlights.filter(
      (h) =>
        h.excerpt.toLowerCase().includes(q) ||
        h.cardTitle.toLowerCase().includes(q)
    );
  }, [cardHighlights, sourceFilter, colorFilter, query]);

  const totalCount = filteredDocHighlights.length + filteredCardHighlights.length;

  const handleSaveNote = async (highlightId: string) => {
    try {
      await heptaClient.highlights.updateNote(highlightId, noteDraft.trim());
      setEditingNoteId(null);
      await loadDocHighlights();
    } catch (err) {
      console.error('Failed to save highlight note:', err);
    }
  };

  const handleDeleteHighlight = async (h: HighlightJoinedRow) => {
    const ok = await showConfirm({
      title: 'Delete highlight',
      message: 'Delete this highlight permanently? This action cannot be undone.',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await heptaClient.highlights.delete(h.id);
      await loadDocHighlights();
    } catch (err) {
      console.error('Failed to delete highlight:', err);
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-background-primary">
      <div
        className={`flex items-start pt-2.5 pb-3 pr-6 border-b border-light-grey bg-background-secondary/60 shrink-0 transition-[padding] duration-300 ${
          isSidebarCollapsed ? 'pl-2.5' : 'pl-6'
        }`}
      >
        <div className="pt-0.5 shrink-0">
          <SidebarExpandButton visible={isSidebarCollapsed} onExpand={onExpandSidebar} />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="w-full flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="shadow-float p-1 w-6 h-6 rounded-md bg-highlight text-background-secondary flex items-center justify-center">
              <Highlighter size={14} strokeWidth={2.2} />
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-text-color">
              Highlights
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-ultra-light-grey border border-light-grey text-[11px] font-medium tabular-nums text-middle-grey">
              {totalCount}
            </span>
          </div>

          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-middle-grey"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search highlights..."
              className="w-60 h-8 pl-8 pr-7 rounded-md bg-background-primary border border-light-grey focus:border-active-item text-[12.5px] text-text-color placeholder:text-middle-grey outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-middle-grey hover:text-text-color cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="w-full flex flex-wrap items-center gap-2.5 text-[11.5px]">
          <div className="flex items-center rounded-md border border-light-grey bg-background-primary p-0.5">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'pdf', label: 'PDF' },
                { id: 'epub', label: 'EPUB' },
                { id: 'card', label: 'Cards' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceFilter(tab.id)}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  sourceFilter === tab.id
                    ? 'bg-light-grey font-medium text-text-color'
                    : 'text-middle-grey hover:text-text-color'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 pl-1">
            <button
              type="button"
              onClick={() => setColorFilter('all')}
              className={`px-2 py-0.5 rounded-full text-[11px] border transition cursor-pointer ${
                colorFilter === 'all'
                  ? 'bg-text-color text-background-secondary border-text-color font-medium'
                  : 'bg-background-primary text-middle-hard-grey border-light-grey hover:border-middle-grey'
              }`}
            >
              All colors
            </button>
            {ANNOTATION_COLORS.map((c) => (
              <button
                key={c.color}
                type="button"
                onClick={() => setColorFilter(colorFilter === c.color ? 'all' : c.color)}
                className={`w-4 h-4 rounded-full border transition cursor-pointer ${
                  colorFilter === c.color
                    ? 'ring-2 ring-active-item ring-offset-1 ring-offset-background-secondary border-active-item scale-110'
                    : 'border-border-grid hover:scale-110'
                }`}
                style={{ backgroundColor: getAnnotationCssVar(c.color) }}
                title={c.label}
              />
            ))}
          </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {totalCount === 0 ? (
            <div className="py-20 text-center rounded-lg border border-dashed border-light-middle-grey bg-background-secondary/40 px-6">
              <Highlighter size={26} className="mx-auto text-middle-grey mb-2.5" />
              <div className="text-[14px] font-medium text-middle-hard-grey">
                No highlights found.
              </div>
              <p className="text-[12px] text-middle-grey mt-1 max-w-md mx-auto">
                Highlight text or capture area snapshots inside any PDF or EPUB document, or add blockquotes inside cards.
              </p>
            </div>
          ) : (
            <>
              {filteredDocHighlights.length > 0 && (
                <div className="space-y-3">
                  {filteredDocHighlights.map((h) => {
                    const accentColor = getAnnotationCssVar(h.color || 'yellow');
                    const isEditingNote = editingNoteId === h.id;
                    const isPdf = h.source_type === 'pdf';

                    return (
                      <div
                        key={h.id}
                        className="group p-4 rounded-lg bg-background-secondary border border-border-grid hover:border-active-item/60 shadow-card transition space-y-2.5"
                        style={{
                          borderLeftWidth: 4,
                          borderLeftColor: accentColor,
                        }}
                      >
                        {h.highlight_type === 'area' && h.image_reference_id ? (
                          <div className="rounded-md overflow-hidden border border-light-grey bg-background-primary max-h-60 flex items-center justify-center">
                            <img
                              src={`hepta-preview://${h.image_reference_id}`}
                              alt="Area highlight"
                              className="max-h-56 w-auto object-contain"
                            />
                          </div>
                        ) : (
                          <blockquote className="text-[13px] text-text-color leading-relaxed whitespace-pre-wrap">
                            {h.text_content || '(Area highlight)'}
                          </blockquote>
                        )}

                        {isEditingNote ? (
                          <div className="space-y-1.5 pt-1">
                            <textarea
                              rows={2}
                              autoFocus
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Add a note..."
                              className="w-full px-2.5 py-1.5 rounded-md bg-background-primary border border-active-item text-[12px] text-text-color outline-none resize-none"
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingNoteId(null)}
                                className="px-2 py-0.5 rounded text-[11px] text-middle-hard-grey hover:bg-light-grey cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSaveNote(h.id)}
                                className="px-2.5 py-0.5 rounded bg-active-item text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                              >
                                <Check size={11} />
                                <span>Save note</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          h.note_text && (
                            <div
                              onClick={() => {
                                setEditingNoteId(h.id);
                                setNoteDraft(h.note_text || '');
                              }}
                              className="px-2.5 py-1.5 rounded-md bg-background-primary/70 border border-light-grey text-[12px] text-middle-hard-grey cursor-text hover:border-middle-grey transition"
                            >
                              {h.note_text}
                            </div>
                          )
                        )}

                        <HighlightTagChips
                          tags={h.tags}
                          onAddTag={(tagName) => handleAddHighlightTag(h.id, tagName)}
                          onRemoveTag={(tagId) => handleRemoveHighlightTag(h.id, tagId)}
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11.5px] text-middle-grey">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-ultra-light-grey border border-light-grey text-[10px] font-semibold uppercase text-middle-hard-grey shrink-0">
                              {h.source_type}
                            </span>
                            {isPdf ? (
                              <FileText size={12} className="shrink-0" />
                            ) : (
                              <BookOpen size={12} className="shrink-0" />
                            )}
                            <span className="font-medium text-middle-hard-grey truncate max-w-[260px]">
                              {h.doc_title || 'Document'}
                            </span>
                            {isPdf && h.page_number != null && (
                              <span className="text-[11px] text-middle-grey tabular-nums shrink-0">
                                · Page {h.page_number}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {onOpenDocument && (
                              <button
                                type="button"
                                onClick={() => onOpenDocument(h.source_id, h.id)}
                                className="px-2 py-0.5 rounded bg-middle-transparent-blue text-active-item hover:brightness-105 text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                                title={
                                  isPdf && h.page_number != null
                                    ? `Open at page ${h.page_number}`
                                    : 'Locate in Reader'
                                }
                              >
                                <ExternalLink size={11} />
                                <span>
                                  {isPdf && h.page_number != null
                                    ? `Open at page ${h.page_number}`
                                    : 'Locate in EPUB'}
                                </span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(h.id);
                                setNoteDraft(h.note_text || '');
                              }}
                              className="p-1 rounded hover:bg-light-grey text-middle-hard-grey cursor-pointer"
                              title="Edit note"
                            >
                              <MessageSquare size={12} />
                            </button>
                            {onAddHighlightToWhiteboard && (
                              <button
                                type="button"
                                onClick={() => onAddHighlightToWhiteboard(h.id)}
                                className="px-2 py-0.5 rounded bg-background-primary border border-light-grey hover:border-active-item hover:text-active-item transition flex items-center gap-1 cursor-pointer"
                              >
                                <Plus size={11} />
                                <span>Add to board</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDeleteHighlight(h)}
                              className="p-1 rounded hover:bg-danger-item/15 text-middle-grey hover:text-danger-item transition cursor-pointer"
                              title="Delete highlight"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {filteredCardHighlights.length > 0 && (
                <div className="space-y-3">
                  {filteredDocHighlights.length > 0 && (
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-middle-grey pt-2">
                      Card Highlights ({filteredCardHighlights.length})
                    </div>
                  )}
                  {filteredCardHighlights.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onOpenCardInSidePanel(item.cardId)}
                      className="group p-4 rounded-lg bg-background-secondary border border-border-grid hover:border-active-item/60 shadow-card cursor-pointer transition space-y-2.5"
                    >
                      <blockquote className="pl-3 border-l-2 border-active-item text-[13px] text-text-color leading-relaxed">
                        {item.excerpt}
                      </blockquote>
                      <div className="flex items-center justify-between text-[11.5px] text-middle-grey">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 border border-border-grid"
                            style={{ backgroundColor: resolveCardBgColor(item.cardColor) }}
                          />
                          <StickyNote size={12} className="shrink-0" />
                          <span className="font-medium text-middle-hard-grey truncate">
                            {item.cardTitle}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenCardInSidePanel(item.cardId);
                            }}
                            className="p-1 rounded hover:bg-light-grey text-middle-hard-grey cursor-pointer"
                            title="Open in side panel"
                          >
                            <PanelRightOpen size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddCardToWhiteboard(item.cardId);
                            }}
                            className="px-2 py-0.5 rounded bg-background-primary border border-light-grey hover:border-active-item hover:text-active-item transition flex items-center gap-1 cursor-pointer"
                          >
                            <Plus size={11} />
                            <span>Add to board</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
