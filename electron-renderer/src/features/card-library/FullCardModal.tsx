import { useEffect, useState, useCallback } from 'react';
import {
  X,
  PanelRightOpen,
  LayoutGrid,
  Trash2,
  Check,
  Link2,
  Star,
  Palette,
  Info,
  MoreHorizontal,
  Copy,
  Files,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { Card, Whiteboard } from '@shared/types';
import { HEPTA_CARD_PALETTE, resolveCardBgColor } from '@shared/palette';
import { heptaClient } from '../../client';
import { CardEditor } from '../../primitives/card-editor';
import { CardTagsPropertiesBar, CardBacklinksSection } from '../../primitives/card-metadata';
import { useAppModal } from '../../primitives/AppModal';

export interface FullCardModalProps {
  card: Card | null;
  allCards?: Card[];
  whiteboards?: Whiteboard[];
  onClose: () => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateContent: (id: string, content: { json: string; text: string }) => void;
  onUpdateColor: (id: string, color: string) => void;
  onDeleteCard: (id: string) => void;
  onOpenInSidePanel: (id: string) => void;
  onAddToWhiteboard: (id: string, whiteboardId?: string) => void;
  onSwitchWhiteboard?: (whiteboardId: string) => void;
  onSelectCard?: (cardId: string) => void;
  onDuplicateCard?: (card: Card) => Promise<void> | void;
}

const PINNED_CARDS_KEY = 'openhepta_pinned_cards';

function readPinnedCardIds(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_CARDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function FullCardModal({
  card,
  allCards = [],
  whiteboards = [],
  onClose,
  onUpdateTitle,
  onUpdateContent,
  onUpdateColor,
  onDeleteCard,
  onOpenInSidePanel,
  onAddToWhiteboard,
  onSwitchWhiteboard,
  onSelectCard,
  onDuplicateCard,
}: FullCardModalProps) {
  const { showConfirm } = useAppModal();
  const [cardWhiteboards, setCardWhiteboards] = useState<{ id: string; name: string }[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>(readPinnedCardIds);
  const [showInfo, setShowInfo] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showWbPicker, setShowWbPicker] = useState(false);

  const loadCardWhiteboards = useCallback(async () => {
    if (!card) return;
    try {
      const rows = await heptaClient.cards.listWhiteboards(card.id);
      setCardWhiteboards((rows || []).map((r) => ({ id: r.id, name: r.name })));
    } catch {
      setCardWhiteboards([]);
    }
  }, [card]);

  useEffect(() => {
    loadCardWhiteboards();
  }, [loadCardWhiteboards]);

  useEffect(() => {
    if (!card) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showColorMenu || showMoreMenu || showWbPicker) {
          setShowColorMenu(false);
          setShowMoreMenu(false);
          setShowWbPicker(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [card, onClose, showColorMenu, showMoreMenu, showWbPicker]);

  if (!card) return null;

  const isPinned = pinnedIds.includes(card.id);

  const togglePin = () => {
    setPinnedIds((prev) => {
      const next = prev.includes(card.id)
        ? prev.filter((id) => id !== card.id)
        : [card.id, ...prev];
      try {
        localStorage.setItem(PINNED_CARDS_KEY, JSON.stringify(next));
      } catch {
        
      }
      return next;
    });
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(`hepta://cards/${card.id}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1600);
  };

  const handleCopyMarkdown = () => {
    const md = `# ${card.title || 'Untitled'}\n\n${card.content_text || ''}`;
    navigator.clipboard?.writeText(md);
    setShowMoreMenu(false);
  };

  const initialEditorValue =
    card.content_json && card.content_json.includes('"type":"doc"')
      ? card.content_json
      : card.content_text || '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim-color)] p-4 md:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          setShowColorMenu(false);
          setShowMoreMenu(false);
          setShowWbPicker(false);
        }}
        className="w-full max-w-[820px] h-[90vh] flex flex-col rounded-xl border border-border-grid shadow-main overflow-hidden"
        style={{ backgroundColor: resolveCardBgColor(card.color) }}
      >
        
        <div className="h-11 px-4 border-b border-light-grey bg-background-secondary/80 flex items-center justify-between gap-2 shrink-0">
          
          <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
            {cardWhiteboards.map((wb, idx) => (
              <div key={wb.id} className="flex items-center gap-1 shrink-0">
                {idx > 0 && <ChevronRight size={11} className="text-middle-grey" />}
                <button
                  type="button"
                  onClick={() => {
                    onSwitchWhiteboard?.(wb.id);
                    onClose();
                  }}
                  className="px-2 py-0.5 rounded-md bg-background-primary border border-light-grey hover:border-active-item text-[11.5px] text-middle-hard-grey hover:text-active-item flex items-center gap-1 transition cursor-pointer"
                >
                  <LayoutGrid size={11} />
                  <span className="truncate max-w-[140px]">{wb.name}</span>
                </button>
              </div>
            ))}

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowWbPicker((v) => !v);
                  setShowColorMenu(false);
                  setShowMoreMenu(false);
                }}
                className="px-2 py-0.5 rounded-md border border-dashed border-light-middle-grey hover:border-active-item text-[11px] text-middle-grey hover:text-active-item flex items-center gap-1 transition cursor-pointer"
                title="Add card to whiteboard"
              >
                <Plus size={11} />
                <span>{cardWhiteboards.length === 0 ? 'Add to whiteboard' : 'Board'}</span>
              </button>

              {showWbPicker && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-7 w-52 p-1 rounded-lg bg-menu-bg border border-light-grey shadow-main z-50 max-h-56 overflow-y-auto"
                >
                  {whiteboards.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        onAddToWhiteboard(card.id);
                        setShowWbPicker(false);
                        onClose();
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded hover:bg-light-grey text-[12px] text-text-color cursor-pointer"
                    >
                      Add to active whiteboard
                    </button>
                  ) : (
                    whiteboards.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          onAddToWhiteboard(card.id, w.id);
                          setShowWbPicker(false);
                          loadCardWhiteboards();
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-light-grey text-[12px] text-text-color truncate cursor-pointer"
                      >
                        {w.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={togglePin}
              className={`p-1.5 rounded-md hover:bg-light-grey transition cursor-pointer ${
                isPinned ? 'text-active-item' : 'text-middle-grey hover:text-text-color'
              }`}
              title={isPinned ? 'Unpin card' : 'Pin / Favorite card'}
            >
              <Star size={14} fill={isPinned ? 'currentColor' : 'none'} />
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="p-1.5 rounded-md hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
              title={copiedLink ? 'Copied!' : 'Copy card link'}
            >
              {copiedLink ? (
                <Check size={14} className="text-successful-item" />
              ) : (
                <Link2 size={14} />
              )}
            </button>

            
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorMenu((v) => !v);
                  setShowMoreMenu(false);
                  setShowWbPicker(false);
                }}
                className="p-1.5 rounded-md hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
                title="Card color"
              >
                <Palette size={14} />
              </button>
              {showColorMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-8 p-2 rounded-lg bg-menu-bg border border-light-grey shadow-main z-50 flex items-center gap-1.5"
                >
                  {HEPTA_CARD_PALETTE.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onUpdateColor(card.id, c.id);
                        setShowColorMenu(false);
                      }}
                      className="w-5 h-5 rounded-full border border-border-grid hover:scale-110 transition flex items-center justify-center cursor-pointer"
                      style={{ backgroundColor: c.cssVar }}
                      title={c.label}
                    >
                      {(card.color || 'white') === c.id && (
                        <Check size={10} className="text-text-color" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              className={`p-1.5 rounded-md transition cursor-pointer ${
                showInfo
                  ? 'bg-middle-transparent-blue text-active-item'
                  : 'hover:bg-light-grey text-middle-grey hover:text-text-color'
              }`}
              title={showInfo ? 'Hide card info' : 'Show card info'}
            >
              <Info size={14} />
            </button>

            
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMoreMenu((v) => !v);
                  setShowColorMenu(false);
                  setShowWbPicker(false);
                }}
                className="p-1.5 rounded-md hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
                title="More actions"
              >
                <MoreHorizontal size={14} />
              </button>

              {showMoreMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-8 w-48 p-1 rounded-lg bg-menu-bg border border-light-grey shadow-main z-50 text-[12px] space-y-0.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onOpenInSidePanel(card.id);
                      setShowMoreMenu(false);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-light-grey text-text-color text-left cursor-pointer"
                  >
                    <PanelRightOpen size={13} className="text-middle-hard-grey" />
                    <span>Open in side panel</span>
                  </button>
                  {onDuplicateCard && (
                    <button
                      type="button"
                      onClick={async () => {
                        await onDuplicateCard(card);
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-light-grey text-text-color text-left cursor-pointer"
                    >
                      <Files size={13} className="text-middle-hard-grey" />
                      <span>Duplicate card</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyMarkdown}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-light-grey text-text-color text-left cursor-pointer"
                  >
                    <Copy size={13} className="text-middle-hard-grey" />
                    <span>Copy as Markdown</span>
                  </button>
                  <div className="h-px bg-light-grey my-0.5" />
                  <button
                    type="button"
                    onClick={async () => {
                      setShowMoreMenu(false);
                      const ok = await showConfirm({
                        title: 'Delete card',
                        message: `Delete "${card.title || 'Untitled'}" permanently? This action cannot be undone.`,
                        confirmText: 'Delete',
                        variant: 'danger',
                      });
                      if (ok) {
                        onDeleteCard(card.id);
                        onClose();
                      }
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-danger-item/15 text-danger-item text-left cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Move to trash</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-10 pt-7 pb-4 space-y-3">
            <input
              type="text"
              value={card.title}
              onChange={(e) => onUpdateTitle(card.id, e.target.value)}
              placeholder="Untitled"
              className="w-full text-[28px] font-bold bg-transparent text-text-color placeholder:text-middle-grey outline-none tracking-tight leading-snug"
            />

            
            <CardTagsPropertiesBar
              card={card}
              allCards={allCards}
              showProperties={showInfo}
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
              onOpenCard={(id) => {
                if (onSelectCard) {
                  onSelectCard(id);
                } else {
                  onOpenInSidePanel(id);
                  onClose();
                }
              }}
            />
          </div>

          <div className="px-10 pb-8 flex-1 min-h-[260px] select-text cursor-text">
            <CardEditor
              key={`full-${card.id}`}
              initialContent={initialEditorValue}
              onChange={(content) => onUpdateContent(card.id, content)}
              placeholder="Type '/' for commands, '[[' to link cards..."
              sourceCardId={card.id}
              cards={allCards}
              onOpenCard={(id) => {
                if (onSelectCard) {
                  onSelectCard(id);
                } else {
                  onOpenInSidePanel(id);
                  onClose();
                }
              }}
            />
          </div>

          
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
            onOpenCard={(id) => {
              if (onSelectCard) {
                onSelectCard(id);
              } else {
                onOpenInSidePanel(id);
                onClose();
              }
            }}
            onSwitchWhiteboard={(wbId) => {
              onSwitchWhiteboard?.(wbId);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
