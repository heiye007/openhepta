import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Trash2,
  Link2,
  ChevronRight,
  Search,
  Plus,
  ArrowUp,
  ArrowDown,
  Check,
  PanelRightClose,
  FoldVertical,
  UnfoldVertical,
  GripVertical,
  MoreHorizontal,
  ArrowLeftRight,
  StickyNote,
  Copy,
  Info,
  Maximize2,
  LayoutGrid,
  FileText,
  BookOpen,
} from 'lucide-react';
import { Card, DocumentRecord } from '@shared/types';
import { HEPTA_CARD_PALETTE, resolveCardBgColor } from '@shared/palette';
import { heptaClient } from '../../client';
import { CardEditor } from '../../primitives/card-editor';
import { CardTagsPropertiesBar, CardBacklinksSection } from '../../primitives/card-metadata';
import { useAppModal } from '../../primitives/AppModal';

export interface ReferencesSidePanelProps {
  cardIds: string[];
  allCards: Card[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateContent: (id: string, content: { json: string; text: string }) => void;
  onDeleteCard: (id: string) => void;
  onUpdateColor?: (id: string, color: string) => void;
  onRemoveReference?: (id: string) => void;
  onReorderReferences?: (newIds: string[]) => void;
  onAddReference?: (id: string) => void;
  onInsertNewCardAfter?: (afterCardId: string) => void;
  onSwapReference?: (cardId: string) => void;
  onSwitchWhiteboard?: (whiteboardId: string) => void;
  onOpenFullCard?: (cardId: string) => void;
  onAddToWhiteboard?: (cardId: string) => void;
  documents?: DocumentRecord[];
  sidePanelDocFocusMap?: Record<string, string | null | undefined>;
  renderDocumentReader?: (doc: DocumentRecord, focusHighlightId?: string | null) => React.ReactNode;
  onOpenFullDocument?: (documentId: string, highlightId?: string | null) => void;
}

const DEFAULT_PANEL_WIDTH = 498;
const MIN_PANEL_WIDTH = 360;
const SNAP_CLOSE_OVERSHOOT = 150;
const CENTER_GUTTER_MIN = 520;

function computeMaxPanelWidth(): number {
  if (typeof window === 'undefined') return 900;
  const asideEl = document.querySelector('aside');
  const leftWidth = asideEl ? asideEl.getBoundingClientRect().width : 256;
  return Math.max(MIN_PANEL_WIDTH, window.innerWidth - leftWidth - CENTER_GUTTER_MIN);
}

function CardMetadataPanel({ card, allCards, onSwitchWhiteboard, onOpenCard }: {
  card: Card;
  allCards: Card[];
  onSwitchWhiteboard?: (whiteboardId: string) => void;
  onOpenCard?: (cardId: string) => void;
}) {
  const [showInfo, setShowInfo] = useState(true);

  return (
    <div className="flex flex-col">
      <div className="border-t border-light-grey bg-background-secondary/40 px-7 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-text-color font-medium text-[12px]">
          <Info size={13} className="text-middle-hard-grey shrink-0" />
          <span>Info</span>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className="rounded-full bg-light-grey hover:bg-light-middle-grey px-2.5 py-0.5 text-[11px] font-medium text-middle-hard-grey hover:text-text-color transition cursor-pointer"
        >
          {showInfo ? 'Hide' : 'Show'}
        </button>
      </div>

      {showInfo && (
        <div className="px-7 pb-3 pt-1 bg-background-secondary/40">
          <CardTagsPropertiesBar
            card={card}
            allCards={allCards}
            showProperties={true}
            compact
            loadCardTags={(cId) => heptaClient.cards.listTags(cId)}
            loadAllTags={() => heptaClient.tags.listWithCounts()}
            addCardTag={(cId, tagName) => heptaClient.cards.addTag(cId, tagName)}
            removeCardTag={(cId, tagId) => heptaClient.cards.removeTag(cId, tagId)}
            loadCardProperties={(cId) => heptaClient.properties.listForCard(cId)}
            loadCardPropertyValues={(cId) => heptaClient.properties.listValuesByCard(cId)}
            setCardPropertyValue={(cId, pId, val) =>
              heptaClient.properties.setValue(cId, pId, val)
            }
            clearCardPropertyValue={(cId, pId) => heptaClient.properties.clearValue(cId, pId)}
            updatePropertyConfig={async (pId, cfg) => {
              await heptaClient.properties.update({ id: pId, config: cfg });
            }}
            deletePropertyOption={(pId, optId) =>
              heptaClient.properties.deleteOption(pId, optId, false)
            }
            createPropertyForTag={(input) => heptaClient.properties.createForTag(input)}
            onOpenCard={onOpenCard}
          />
        </div>
      )}

      <CardBacklinksSection
        card={card}
        allCards={allCards}
        loadBacklinksData={async (cId) => {
          const [linkedCards, linkedWhiteboards] = await Promise.all([
            heptaClient.cards.listBacklinks(cId),
            heptaClient.cards.listWhiteboards(cId),
          ]);
          return { linkedCards, linkedWhiteboards };
        }}
        onLinkMention={(srcId, dstId) => heptaClient.cards.linkReference(srcId, dstId)}
        onOpenCard={onOpenCard}
        onSwitchWhiteboard={onSwitchWhiteboard}
        compact
      />
    </div>
  );
}

export function CardDrawer({
  cardIds,
  allCards,
  isOpen,
  onClose,
  onUpdateTitle,
  onUpdateContent,
  onDeleteCard,
  onUpdateColor,
  onRemoveReference,
  onReorderReferences,
  onAddReference,
  onInsertNewCardAfter,
  onSwapReference,
  onSwitchWhiteboard,
  onOpenFullCard,
  onAddToWhiteboard,
  documents = [],
  sidePanelDocFocusMap,
  renderDocumentReader,
  onOpenFullDocument,
}: ReferencesSidePanelProps) {
  const { showConfirm } = useAppModal();
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('openhepta_sidepanel_width');
      return saved ? Math.max(MIN_PANEL_WIDTH, parseInt(saved, 10) || DEFAULT_PANEL_WIDTH) : DEFAULT_PANEL_WIDTH;
    } catch {
      return DEFAULT_PANEL_WIDTH;
    }
  });

  const [isResizing, setIsResizing] = useState(false);
  const [snapOvershoot, setSnapOvershoot] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [foldedCardMap, setFoldedCardMap] = useState<Record<string, boolean>>({});
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);
  const [showBatchMenu, setShowBatchMenu] = useState(false);

  
  const [draggingStackCardId, setDraggingStackCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);

  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_PANEL_WIDTH);
  const dragOvershootRef = useRef(0);
  const batchMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('openhepta_sidepanel_width', panelWidth.toString());
    } catch {
      
    }
  }, [panelWidth]);

  
  useEffect(() => {
    const clampNow = () => {
      const mx = computeMaxPanelWidth();
      setPanelWidth((prev) => (prev > mx ? Math.max(MIN_PANEL_WIDTH, mx) : prev));
    };
    window.addEventListener('resize', clampNow);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(clampNow) : null;
    ro?.observe(document.body);
    return () => {
      window.removeEventListener('resize', clampNow);
      ro?.disconnect();
    };
  }, []);

  
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (batchMenuRef.current && !batchMenuRef.current.contains(e.target as Node)) {
        setShowBatchMenu(false);
      }
      setOpenCardMenuId(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowBatchMenu(false);
        setOpenCardMenuId(null);
        setShowSearch(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const cardMap = useMemo(() => {
    const map = new Map<string, Card>();
    for (const c of allCards) {
      map.set(c.id, c);
    }
    return map;
  }, [allCards]);

  const docMap = useMemo(() => {
    const map = new Map<string, DocumentRecord>();
    for (const d of documents) {
      map.set(d.id, d);
    }
    return map;
  }, [documents]);

  const searchableDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const candidates = documents.filter((d) => !cardIds.includes(d.id));
    if (!q) return candidates.slice(0, 4);
    return candidates.filter((d) => (d.title || '').toLowerCase().includes(q)).slice(0, 5);
  }, [documents, cardIds, searchQuery]);

  const searchableCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const candidates = allCards.filter((c) => !cardIds.includes(c.id));
    if (!q) return candidates.slice(0, 8);
    return candidates
      .filter(
        (c) =>
          (c.title || '').toLowerCase().includes(q) ||
          (c.content_text && c.content_text.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [allCards, cardIds, searchQuery]);

  
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setSnapOvershoot(0);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
    dragOvershootRef.current = 0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const cleanup = () => {
      setIsResizing(false);
      setSnapOvershoot(0);
      dragOvershootRef.current = 0;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = startXRef.current - moveEvent.clientX;
      const maxWidth = computeMaxPanelWidth();
      const rawWidth = startWidthRef.current + dx;

      if (rawWidth >= MIN_PANEL_WIDTH) {
        dragOvershootRef.current = 0;
        setSnapOvershoot(0);
        setPanelWidth(Math.min(maxWidth, rawWidth));
      } else {
        setPanelWidth(MIN_PANEL_WIDTH);
        const overshoot = MIN_PANEL_WIDTH - rawWidth;
        dragOvershootRef.current = overshoot;
        setSnapOvershoot(overshoot);
        if (overshoot > SNAP_CLOSE_OVERSHOOT) {
          cleanup();
          onClose();
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  };

  const handleToggleFold = (id: string) => {
    setFoldedCardMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleToggleFoldAll = (foldState?: boolean) => {
    const shouldFold = foldState ?? !cardIds.every((id) => foldedCardMap[id]);
    const nextMap: Record<string, boolean> = {};
    for (const id of cardIds) {
      nextMap[id] = shouldFold;
    }
    setFoldedCardMap(nextMap);
    setShowBatchMenu(false);
  };

  const handleCloseAll = () => {
    onReorderReferences?.([]);
    setShowBatchMenu(false);
  };

  const handleMoveCard = (index: number, direction: 'up' | 'down') => {
    if (!onReorderReferences) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= cardIds.length) return;
    const next = [...cardIds];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    onReorderReferences(next);
  };

  const handleCopyCardLink = (cardId: string) => {
    navigator.clipboard?.writeText(`hepta://cards/${cardId}`);
    setCopiedCardId(cardId);
    setTimeout(() => setCopiedCardId((cur) => (cur === cardId ? null : cur)), 1500);
  };

  const handleDropOnCard = (targetCardId: string) => {
    if (!draggingStackCardId || draggingStackCardId === targetCardId || !onReorderReferences) {
      setDragOverCardId(null);
      return;
    }
    const fromIdx = cardIds.indexOf(draggingStackCardId);
    const toIdx = cardIds.indexOf(targetCardId);
    if (fromIdx === -1 || toIdx === -1) {
      setDragOverCardId(null);
      return;
    }
    const next = [...cardIds];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorderReferences(next);
    setDraggingStackCardId(null);
    setDragOverCardId(null);
  };

  if (!isOpen) return null;

  const snapProgress = Math.min(1, snapOvershoot / SNAP_CLOSE_OVERSHOOT);

  return (
    <div
      className="relative flex my-2 mr-2 self-stretch shrink-0 z-40 select-none"
      style={{
        width: panelWidth,
        minWidth: MIN_PANEL_WIDTH,
        transition: isResizing ? 'none' : 'width 0.15s ease',
      }}
    >
      
      <div
        onMouseDown={handleResizeStart}
        className="absolute inset-y-3 -left-1.5 w-3 cursor-col-resize z-50 flex items-center justify-center group"
        title="Drag to resize side panel (pull right past min width to close)"
      >
        <div
          className={`w-[3px] h-full rounded-full transition-colors ${
            isResizing ? 'bg-active-item' : 'bg-transparent group-hover:bg-active-item'
          }`}
        />
      </div>

      
      {snapOvershoot > 30 && (
        <div className="pointer-events-none absolute -left-2 top-1/2 -translate-x-full -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-menu-bg border border-light-grey shadow-main text-[11px] font-medium text-text-color whitespace-nowrap flex items-center gap-2 z-50">
          <span>{snapProgress >= 0.85 ? 'Release to hide panel' : 'Pull further to hide'}</span>
          <div className="w-10 h-1 rounded-full bg-light-grey overflow-hidden">
            <div
              className="h-full bg-active-item transition-none"
              style={{ width: `${Math.round(snapProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      
      <div className="flex w-full flex-col gap-y-1.5 pt-1">
        <div className="mb-0.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-x-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md border border-solid border-light-middle-grey bg-background-secondary hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition cursor-pointer"
              title="Hide side panel"
              aria-label="收起右侧边栏"
            >
              <PanelRightClose size={16} />
            </button>

            <button
              type="button"
              onClick={() => setShowSearch((prev) => !prev)}
              className={`p-1.5 rounded-md border border-solid transition cursor-pointer ${
                showSearch
                  ? 'border-active-item bg-middle-transparent-blue text-active-item'
                  : 'border-light-middle-grey bg-background-secondary hover:bg-light-grey text-middle-hard-grey hover:text-text-color'
              }`}
              title="Find anything to open in side panel..."
              aria-label="在侧边栏中搜索卡片"
            >
              <Search size={16} />
            </button>
          </div>

          <div className="relative" ref={batchMenuRef}>
            <button
              type="button"
              disabled={cardIds.length === 0}
              onClick={(e) => {
                e.stopPropagation();
                setShowBatchMenu((prev) => !prev);
              }}
              className={`p-1.5 rounded-md border border-solid transition ${
                cardIds.length === 0
                  ? 'border-light-grey bg-background-secondary/60 text-middle-grey opacity-50 cursor-not-allowed'
                  : showBatchMenu
                  ? 'border-light-middle-grey bg-light-grey text-text-color cursor-pointer'
                  : 'border-light-middle-grey bg-background-secondary hover:bg-light-grey text-middle-hard-grey hover:text-text-color cursor-pointer'
              }`}
              title="Side panel options"
              aria-label="侧边栏批量操作"
            >
              <MoreHorizontal size={16} />
            </button>

            {showBatchMenu && cardIds.length > 0 && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute right-0 top-9 w-44 p-1 rounded-lg bg-menu-bg border border-light-grey shadow-main z-50 text-[12px] flex flex-col gap-0.5"
              >
                <button
                  type="button"
                  onClick={() => handleToggleFoldAll(true)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-light-grey text-text-color transition text-left cursor-pointer"
                >
                  <FoldVertical size={13} className="text-middle-hard-grey" />
                  <span>Fold all</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleFoldAll(false)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-light-grey text-text-color transition text-left cursor-pointer"
                >
                  <UnfoldVertical size={13} className="text-middle-hard-grey" />
                  <span>Expand all</span>
                </button>
                <div className="h-px bg-light-grey my-0.5" />
                <button
                  type="button"
                  onClick={handleCloseAll}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-danger-item/15 text-danger-item transition text-left cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Close all</span>
                </button>
              </div>
            )}
          </div>
        </div>

        
        {showSearch && (
          <div className="p-2.5 rounded-lg bg-background-secondary border border-border-grid shadow-card shrink-0">
            <div className="relative">
              <input
                type="text"
                autoFocus
                placeholder="Find anything to open in side panel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background-secondary border border-light-grey focus:border-active-item rounded-md pl-8 pr-3 py-1.5 text-[12.5px] text-text-color placeholder:text-middle-grey outline-none transition"
              />
              <Search size={13} className="absolute left-2.5 top-2.5 text-middle-grey" />
            </div>

            {searchableCards.length > 0 || searchableDocs.length > 0 ? (
              <div className="mt-2 space-y-0.5 max-h-52 overflow-y-auto">
                {searchableDocs.map((sd) => (
                  <button
                    key={sd.id}
                    type="button"
                    onClick={() => {
                      onAddReference?.(sd.id);
                      setFoldedCardMap((prev) => ({ ...prev, [sd.id]: false }));
                      setSearchQuery('');
                      setShowSearch(false);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-md hover:bg-light-grey cursor-pointer flex items-center justify-between text-xs transition text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {sd.doc_type === 'pdf' ? (
                        <FileText size={12} className="text-active-item shrink-0" />
                      ) : (
                        <BookOpen size={12} className="text-active-item shrink-0" />
                      )}
                      <span className="font-medium text-text-color truncate">
                        {sd.title || 'Untitled Document'}
                      </span>
                      <span className="px-1 py-0.2 rounded bg-ultra-light-grey text-[9.5px] uppercase text-middle-grey shrink-0">
                        {sd.doc_type}
                      </span>
                    </div>
                    <span className="text-[11px] text-active-item shrink-0 flex items-center gap-0.5 ml-2">
                      <Plus size={12} /> Add
                    </span>
                  </button>
                ))}
                {searchableCards.map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => {
                      onAddReference?.(sc.id);
                      setFoldedCardMap((prev) => ({ ...prev, [sc.id]: false }));
                      setSearchQuery('');
                      setShowSearch(false);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-md hover:bg-light-grey cursor-pointer flex items-center justify-between text-xs transition text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-border-grid"
                        style={{ backgroundColor: resolveCardBgColor(sc.color) }}
                      />
                      <span className="font-medium text-text-color truncate">
                        {sc.title || 'Untitled'}
                      </span>
                    </div>
                    <span className="text-[11px] text-active-item shrink-0 flex items-center gap-0.5 ml-2">
                      <Plus size={12} /> Add
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-middle-grey text-center py-2.5">
                {searchQuery ? 'No matching cards found' : 'All cards are already open in side panel'}
              </div>
            )}
          </div>
        )}

        
        <div className="flex-1 min-h-0 flex flex-col gap-y-2 overflow-y-auto overflow-x-hidden pb-2">
          {cardIds.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center pb-9 px-6">
              <div className="w-10 h-10 rounded-xl bg-ultra-light-grey border border-light-grey flex items-center justify-center mb-3">
                <StickyNote size={18} className="text-middle-grey" />
              </div>
              <p className="text-[13px] font-medium text-middle-hard-grey">
                Select a card to open it in the side panel.
              </p>
              <p className="text-[11.5px] text-middle-grey mt-1 max-w-[260px] leading-relaxed">
                Stack multiple cards here to read, edit, or drag them onto any whiteboard.
              </p>
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="mt-4 px-3 py-1.5 rounded-md bg-background-secondary border border-border-grid hover:border-active-item text-[12px] font-medium text-text-color hover:text-active-item transition flex items-center gap-1.5 shadow-card cursor-pointer"
              >
                <Search size={13} />
                <span>Find anything to open in side panel...</span>
              </button>
            </div>
          ) : (
            cardIds.map((cardId, index) => {
              const card = cardMap.get(cardId);
              const doc = !card ? docMap.get(cardId) : undefined;
              if (!card && !doc) return null;

              if (doc) {
                const isFolded = foldedCardMap[doc.id] ?? false;
                const isFocused = focusedCardId === doc.id;
                const isDragTarget = dragOverCardId === doc.id && draggingStackCardId !== doc.id;
                const focusHlId = sidePanelDocFocusMap?.[doc.id];

                return (
                  <div key={doc.id} className="relative">
                    {isDragTarget && (
                      <div className="h-0.5 bg-active-item rounded-full mb-2 transition-all" />
                    )}
                    <div
                      onMouseDown={() => setFocusedCardId(doc.id)}
                      onDragOver={(e) => {
                        if (draggingStackCardId && draggingStackCardId !== doc.id) {
                          e.preventDefault();
                          setDragOverCardId(doc.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverCardId === doc.id) setDragOverCardId(null);
                      }}
                      onDrop={(e) => {
                        if (draggingStackCardId) {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDropOnCard(doc.id);
                        }
                      }}
                      className={`group/card rounded-lg border shrink-0 overflow-hidden transition-all duration-150 bg-background-secondary ${
                        isFocused
                          ? 'border-active-item ring-1 ring-active-item/40 shadow-card'
                          : 'border-border-grid shadow-card'
                      }`}
                    >
                      <div
                        className={`h-9 px-2 flex items-center gap-1 bg-background-secondary/70 ${
                          !isFolded ? 'border-b border-light-grey' : ''
                        }`}
                      >
                        <div
                          draggable
                          onDragStart={(e) => {
                            setDraggingStackCardId(doc.id);
                            e.dataTransfer.setData('text/plain', doc.title || 'Untitled');
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            setDraggingStackCardId(null);
                            setDragOverCardId(null);
                          }}
                          className="p-1 rounded cursor-grab active:cursor-grabbing hover:bg-light-grey text-middle-grey hover:text-text-color transition shrink-0"
                          title="Drag to reorder in stack"
                        >
                          <GripVertical size={13} />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleFold(doc.id)}
                          className="p-1 rounded hover:bg-light-grey text-middle-hard-grey transition shrink-0 cursor-pointer"
                          title={isFolded ? 'Expand' : 'Fold'}
                        >
                          <ChevronRight
                            size={14}
                            className={`transition-transform duration-150 ${!isFolded ? 'rotate-90' : ''}`}
                          />
                        </button>

                        {doc.doc_type === 'pdf' ? (
                          <FileText size={13} className="text-active-item shrink-0 mx-0.5" />
                        ) : (
                          <BookOpen size={13} className="text-active-item shrink-0 mx-0.5" />
                        )}

                        <span className="text-[13px] font-medium text-text-color truncate flex-1 min-w-0 px-1">
                          {doc.title || 'Untitled Document'}
                        </span>

                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 transition-opacity">
                          {onOpenFullDocument && (
                            <button
                              type="button"
                              onClick={() => onOpenFullDocument(doc.id, focusHlId)}
                              className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
                              title="Open full view"
                            >
                              <Maximize2 size={12} />
                            </button>
                          )}

                          {cardIds.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onSwapReference?.(doc.id)}
                              className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-active-item transition cursor-pointer"
                              title="Swap with top card"
                            >
                              <ArrowLeftRight size={12} />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onRemoveReference?.(doc.id)}
                            className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
                            title="Close"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>

                      {!isFolded && (
                        <div className="bg-background-primary">
                          {renderDocumentReader?.(doc, focusHlId)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              if (!card) return null;
              const isFolded = foldedCardMap[cardId] ?? false;
              const isFocused = focusedCardId === card.id;
              const isDragTarget = dragOverCardId === card.id && draggingStackCardId !== card.id;
              const initialEditorValue =
                card.content_json && card.content_json.includes('"type":"doc"')
                  ? card.content_json
                  : card.content_text || '';

              return (
                <div key={card.id} className="relative">
                  {isDragTarget && (
                    <div className="h-0.5 bg-active-item rounded-full mb-2 transition-all" />
                  )}
                  <div
                    onMouseDown={() => setFocusedCardId(card.id)}
                    onDragOver={(e) => {
                      if (draggingStackCardId && draggingStackCardId !== card.id) {
                        e.preventDefault();
                        setDragOverCardId(card.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverCardId === card.id) setDragOverCardId(null);
                    }}
                    onDrop={(e) => {
                      if (draggingStackCardId) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDropOnCard(card.id);
                      }
                    }}
                    className={`group/card rounded-lg border shrink-0 transition-all duration-150 ${
                      isFocused
                        ? 'border-active-item ring-1 ring-active-item/40 shadow-card'
                        : 'border-border-grid shadow-card'
                    }`}
                    style={{
                      backgroundColor: resolveCardBgColor(card.color),
                    }}
                  >
                    
                    <div
                      className={`h-9 px-2 flex items-center gap-1 rounded-t-lg bg-background-secondary/70 ${
                        !isFolded ? 'border-b border-light-grey' : 'rounded-b-lg'
                      }`}
                    >
                      
                      <div
                        draggable
                        onDragStart={(e) => {
                          setDraggingStackCardId(card.id);
                          e.dataTransfer.setData(
                            'application/openhepta-card',
                            JSON.stringify({ cardId: card.id })
                          );
                          e.dataTransfer.setData('text/plain', card.title || 'Untitled');
                          e.dataTransfer.effectAllowed = 'copyMove';

                          const ghost = document.createElement('div');
                          ghost.style.position = 'absolute';
                          ghost.style.top = '-9999px';
                          ghost.style.padding = '6px 12px';
                          ghost.style.background = 'var(--background-secondary, #242629)';
                          ghost.style.color = 'var(--text-color, #e1e1e1)';
                          ghost.style.border = '1px solid var(--active-item, #207dff)';
                          ghost.style.borderRadius = '8px';
                          ghost.style.fontSize = '12px';
                          ghost.style.fontWeight = '600';
                          ghost.style.boxShadow = '0 7px 22px rgba(0,0,0,0.25)';
                          ghost.innerText = card.title || 'Untitled';
                          document.body.appendChild(ghost);
                          e.dataTransfer.setDragImage(ghost, 12, 12);
                          setTimeout(() => ghost.remove(), 0);
                        }}
                        onDragEnd={() => {
                          setDraggingStackCardId(null);
                          setDragOverCardId(null);
                        }}
                        className="p-1 rounded cursor-grab active:cursor-grabbing hover:bg-light-grey text-middle-grey hover:text-text-color transition shrink-0"
                        title="Drag to reorder in stack or drop onto whiteboard"
                      >
                        <GripVertical size={13} />
                      </div>

                      
                      <button
                        type="button"
                        onClick={() => handleToggleFold(card.id)}
                        className="p-1 rounded hover:bg-light-grey text-middle-hard-grey transition shrink-0 cursor-pointer"
                        title={isFolded ? 'Expand' : 'Fold'}
                      >
                        <ChevronRight
                          size={14}
                          className={`transition-transform duration-150 ${!isFolded ? 'rotate-90' : ''}`}
                        />
                      </button>

                      
                      <StickyNote size={13} className="text-middle-hard-grey shrink-0 mx-0.5" />

                      
                      <input
                        type="text"
                        value={card.title}
                        onChange={(e) => onUpdateTitle(card.id, e.target.value)}
                        placeholder="Untitled"
                        className="bg-transparent text-[13px] font-medium text-text-color placeholder:text-middle-grey truncate outline-none flex-1 min-w-0 px-1 rounded focus:bg-background-primary/50"
                      />

                      
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 transition-opacity">
                        {onOpenFullCard && (
                          <button
                            type="button"
                            onClick={() => onOpenFullCard(card.id)}
                            className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
                            title="Open full card"
                          >
                            <Maximize2 size={12} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopyCardLink(card.id)}
                          className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
                          title="Copy link"
                        >
                          {copiedCardId === card.id ? (
                            <Check size={12} className="text-successful-item" />
                          ) : (
                            <Link2 size={12} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => onInsertNewCardAfter?.(card.id)}
                          className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-active-item transition cursor-pointer"
                          title="Add here"
                        >
                          <Plus size={13} />
                        </button>

                        {cardIds.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onSwapReference?.(card.id)}
                            className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-active-item transition cursor-pointer"
                            title="Swap with top card"
                          >
                            <ArrowLeftRight size={12} />
                          </button>
                        )}

                        
                        <div className="relative">
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenCardMenuId(openCardMenuId === card.id ? null : card.id);
                            }}
                            className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
                            title="More actions"
                          >
                            <MoreHorizontal size={13} />
                          </button>

                          {openCardMenuId === card.id && (
                            <div
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-7 w-48 p-1.5 rounded-lg bg-menu-bg border border-light-grey shadow-main z-50 text-[12px] space-y-1"
                            >
                              
                              <div className="px-2 py-1">
                                <div className="text-[10.5px] font-medium text-middle-grey mb-1.5">
                                  Card color
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {HEPTA_CARD_PALETTE.map((c) => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      className="w-4 h-4 rounded-full hover:scale-110 transition border border-border-grid flex items-center justify-center cursor-pointer"
                                      style={{ backgroundColor: c.cssVar }}
                                      onClick={() => {
                                        onUpdateColor?.(card.id, c.id);
                                        setOpenCardMenuId(null);
                                      }}
                                      title={c.label}
                                    >
                                      {(card.color || 'white') === c.id && (
                                        <Check size={9} className="text-text-color" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="h-px bg-light-grey" />

                              {onOpenFullCard && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenFullCard(card.id);
                                    setOpenCardMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-light-grey text-text-color transition text-left cursor-pointer"
                                >
                                  <Maximize2 size={12} className="text-middle-hard-grey" />
                                  <span>Open full card</span>
                                </button>
                              )}

                              {onAddToWhiteboard && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onAddToWhiteboard(card.id);
                                    setOpenCardMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-light-grey text-text-color transition text-left cursor-pointer"
                                >
                                  <LayoutGrid size={12} className="text-middle-hard-grey" />
                                  <span>Add to current whiteboard</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  handleCopyCardLink(card.id);
                                  setOpenCardMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-light-grey text-text-color transition text-left cursor-pointer"
                              >
                                <Copy size={12} className="text-middle-hard-grey" />
                                <span>Copy card link</span>
                              </button>

                              {cardIds.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    disabled={index === 0}
                                    onClick={() => {
                                      handleMoveCard(index, 'up');
                                      setOpenCardMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-light-grey disabled:opacity-35 text-text-color transition text-left cursor-pointer"
                                  >
                                    <ArrowUp size={12} className="text-middle-hard-grey" />
                                    <span>Move up</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={index === cardIds.length - 1}
                                    onClick={() => {
                                      handleMoveCard(index, 'down');
                                      setOpenCardMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-light-grey disabled:opacity-35 text-text-color transition text-left cursor-pointer"
                                  >
                                    <ArrowDown size={12} className="text-middle-hard-grey" />
                                    <span>Move down</span>
                                  </button>
                                </>
                              )}

                              <div className="h-px bg-light-grey" />

                              <button
                                type="button"
                                onClick={async () => {
                                  setOpenCardMenuId(null);
                                  const ok = await showConfirm({
                                    title: 'Delete card',
                                    message: `Delete "${card.title || 'Untitled'}" permanently? This action cannot be undone.`,
                                    confirmText: 'Delete',
                                    variant: 'danger',
                                  });
                                  if (ok) {
                                    onDeleteCard(card.id);
                                  }
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-danger-item/15 text-danger-item transition text-left cursor-pointer"
                              >
                                <Trash2 size={12} />
                                <span>Move to trash</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      
                      <button
                        type="button"
                        onClick={() => onRemoveReference?.(card.id)}
                        className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color transition shrink-0 cursor-pointer"
                        title="Remove from side panel"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    
                    {!isFolded && (
                      <div className="flex flex-col">
                        <div className="px-7 pt-5 pb-2 space-y-2">
                          <input
                            type="text"
                            value={card.title}
                            onChange={(e) => onUpdateTitle(card.id, e.target.value)}
                            placeholder="Untitled"
                            className="w-full text-[22px] font-bold bg-transparent text-text-color placeholder:text-middle-grey outline-none tracking-tight leading-snug"
                          />
                          <CardTagsPropertiesBar
                            card={card}
                            showProperties={false}
                            compact
                            loadCardTags={(cId) => heptaClient.cards.listTags(cId)}
                            loadAllTags={() => heptaClient.tags.listWithCounts()}
                            addCardTag={(cId, tagName) => heptaClient.cards.addTag(cId, tagName)}
                            removeCardTag={(cId, tagId) => heptaClient.cards.removeTag(cId, tagId)}
                          />
                        </div>

                        <div className="px-7 pb-6 min-h-[220px] cursor-text select-text">
                          <CardEditor
                            key={card.id}
                            initialContent={initialEditorValue}
                            onChange={(content) => onUpdateContent(card.id, content)}
                            placeholder="Type '/' for commands, '[[' to link cards..."
                            sourceCardId={card.id}
                            cards={allCards}
                            onOpenCard={(id) => onAddReference?.(id)}
                          />
                        </div>

                        
                        <CardMetadataPanel
                          card={card}
                          allCards={allCards}
                          onSwitchWhiteboard={onSwitchWhiteboard}
                          onOpenCard={(id) => onAddReference?.(id)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
