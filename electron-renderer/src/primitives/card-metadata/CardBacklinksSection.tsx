import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Link2,
  Search,
  X,
  ChevronRight,
  StickyNote,
  Calendar,
  LayoutGrid,
  Plus,
  ArrowUpDown,
} from 'lucide-react';
import type { Card, CardBacklinkRow, CardWhiteboardRow } from '../../../../shared/types';

type SortMode = 'dateDescending' | 'dateAscending' | 'titleAscending' | 'titleDescending';

export interface CardBacklinksSectionProps {
  card: Card;
  allCards: Card[];
  onOpenCard?: (cardId: string) => void;
  onSwitchWhiteboard?: (whiteboardId: string) => void;
  compact?: boolean;
  loadBacklinksData?: (cardId: string) => Promise<{
    linkedCards: CardBacklinkRow[];
    linkedWhiteboards: CardWhiteboardRow[];
  }>;
  onLinkMention?: (sourceCardId: string, targetCardId: string) => Promise<void>;
}

function extractSnippet(text: string, query: string): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!query) return clean.slice(0, 140) + (clean.length > 140 ? '…' : '');
  const idx = clean.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return clean.slice(0, 140) + (clean.length > 140 ? '…' : '');
  const start = Math.max(0, idx - 45);
  const end = Math.min(clean.length, idx + query.length + 75);
  return (start > 0 ? '…' : '') + clean.slice(start, end) + (end < clean.length ? '…' : '');
}

export function CardBacklinksSection({
  card,
  allCards,
  onOpenCard,
  onSwitchWhiteboard,
  compact = false,
  loadBacklinksData,
  onLinkMention,
}: CardBacklinksSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('dateDescending');
  const [journalsFirst, setJournalsFirst] = useState(true);

  const [linkedCards, setLinkedCards] = useState<CardBacklinkRow[]>([]);
  const [linkedWhiteboards, setLinkedWhiteboards] = useState<CardWhiteboardRow[]>([]);

  const loadBacklinks = useCallback(async () => {
    if (!loadBacklinksData) return;
    try {
      const res = await loadBacklinksData(card.id);
      setLinkedCards(res.linkedCards || []);
      setLinkedWhiteboards(res.linkedWhiteboards || []);
    } catch {
      setLinkedCards([]);
      setLinkedWhiteboards([]);
    }
  }, [card.id, loadBacklinksData]);

  useEffect(() => {
    loadBacklinks();
  }, [loadBacklinks]);

  const unlinkedMentions = useMemo(() => {
    const titleNeedle = (card.title || '').trim();
    if (titleNeedle.length < 2) return [];
    const lowerNeedle = titleNeedle.toLowerCase();
    const linkedIdSet = new Set(linkedCards.map((c) => c.id));
    return allCards.filter(
      (c) =>
        c.id !== card.id &&
        !linkedIdSet.has(c.id) &&
        c.content_text &&
        c.content_text.toLowerCase().includes(lowerNeedle)
    );
  }, [allCards, card.id, card.title, linkedCards]);

  const filteredLinkedCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = linkedCards.filter((c) => {
      if (!q) return true;
      return (
        (c.title || '').toLowerCase().includes(q) ||
        (c.content_text || '').toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (journalsFirst) {
        const aj = a.id.startsWith('journal-') ? 0 : 1;
        const bj = b.id.startsWith('journal-') ? 0 : 1;
        if (aj !== bj) return aj - bj;
      }
      if (sortMode === 'titleAscending') {
        return (a.title || 'Untitled').localeCompare(b.title || 'Untitled');
      }
      if (sortMode === 'titleDescending') {
        return (b.title || 'Untitled').localeCompare(a.title || 'Untitled');
      }
      if (sortMode === 'dateAscending') {
        return a.updated_at - b.updated_at;
      }
      return b.updated_at - a.updated_at;
    });
    return list;
  }, [linkedCards, searchQuery, sortMode, journalsFirst]);

  const filteredWhiteboards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return linkedWhiteboards;
    return linkedWhiteboards.filter((w) => w.name.toLowerCase().includes(q));
  }, [linkedWhiteboards, searchQuery]);

  const handleLinkUnlinkedMention = async (sourceCardId: string) => {
    if (!onLinkMention) return;
    try {
      await onLinkMention(sourceCardId, card.id);
      await loadBacklinks();
    } catch {
      return;
    }
  };

  const totalLinks = linkedCards.length + linkedWhiteboards.length;
  const filteredTotal = filteredLinkedCards.length + filteredWhiteboards.length;

  const cycleSortMode = () => {
    const order: SortMode[] = [
      'dateDescending',
      'dateAscending',
      'titleAscending',
      'titleDescending',
    ];
    const next = order[(order.indexOf(sortMode) + 1) % order.length];
    setSortMode(next);
  };

  const sortLabelMap: Record<SortMode, string> = {
    dateDescending: 'Date · newest first',
    dateAscending: 'Date · oldest first',
    titleAscending: 'Title · A–Z',
    titleDescending: 'Title · Z–A',
  };

  return (
    <div
      className={`border-t border-light-grey bg-background-secondary/40 ${
        compact ? 'px-7 py-4' : 'px-10 py-5'
      } space-y-3`}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-color hover:text-active-item transition cursor-pointer"
        >
          <ChevronRight
            size={14}
            className={`text-middle-hard-grey transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
          <Link2 size={13} className="text-middle-hard-grey" />
          <span>Links to this card</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-ultra-light-grey border border-light-grey text-[10.5px] tabular-nums text-middle-grey">
            {totalLinks}
          </span>
        </button>

        {unlinkedMentions.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              setShowUnlinked((v) => !v);
            }}
            className="text-[11px] text-middle-hard-grey hover:text-active-item transition cursor-pointer"
          >
            {unlinkedMentions.length} unlinked mention{unlinkedMentions.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="space-y-3">
          {totalLinks > 0 && (
            <div className="flex items-center gap-1.5 rounded-md bg-background-primary border border-light-grey focus-within:border-active-item px-2 py-1">
              <Search size={12} className="text-middle-grey shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search backlinks..."
                className="flex-1 bg-transparent text-[12px] text-text-color placeholder:text-middle-grey outline-none min-w-0"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-middle-grey hover:text-text-color cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
              <div className="h-3.5 w-px bg-light-grey mx-0.5" />
              <button
                type="button"
                onClick={cycleSortMode}
                className="text-[11px] text-middle-hard-grey hover:text-text-color flex items-center gap-1 shrink-0 cursor-pointer"
                title={`Sort: ${sortLabelMap[sortMode]}`}
              >
                <ArrowUpDown size={11} />
                <span className="hidden sm:inline">{sortLabelMap[sortMode]}</span>
              </button>
              <button
                type="button"
                onClick={() => setJournalsFirst((v) => !v)}
                className={`px-1.5 py-0.5 rounded text-[10.5px] transition cursor-pointer ${
                  journalsFirst
                    ? 'bg-middle-transparent-blue text-active-item font-medium'
                    : 'text-middle-grey hover:text-text-color'
                }`}
                title="Journals first"
              >
                Journals first
              </button>
            </div>
          )}

          {totalLinks === 0 ? (
            <div className="text-[12px] text-middle-grey py-1">
              No linked mentions yet. Use <code className="px-1 rounded bg-ultra-light-grey">[[</code> in another card or place this card on a whiteboard.
            </div>
          ) : filteredTotal === 0 ? (
            <div className="text-[12px] text-middle-grey py-2">No matching backlinks</div>
          ) : (
            <div className="space-y-1.5">
              {filteredWhiteboards.map((wb) => (
                <button
                  key={`wb-${wb.id}`}
                  type="button"
                  onClick={() => onSwitchWhiteboard?.(wb.id)}
                  className="w-full text-left px-3 py-2 rounded-md bg-background-primary border border-light-grey hover:border-active-item transition flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <LayoutGrid size={12} className="text-active-item shrink-0" />
                    <span className="text-[12.5px] font-medium text-text-color truncate">
                      {wb.name}
                    </span>
                  </div>
                  <span className="text-[10.5px] text-middle-grey shrink-0">Whiteboard</span>
                </button>
              ))}

              {filteredLinkedCards.map((lc) => {
                const isJournal = lc.id.startsWith('journal-');
                return (
                  <button
                    key={`card-${lc.id}`}
                    type="button"
                    onClick={() => onOpenCard?.(lc.id)}
                    className="w-full text-left p-2.5 rounded-md bg-background-primary border border-light-grey hover:border-active-item transition space-y-1 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isJournal ? (
                          <Calendar size={12} className="text-middle-hard-grey shrink-0" />
                        ) : (
                          <StickyNote size={12} className="text-middle-hard-grey shrink-0" />
                        )}
                        <span className="text-[12.5px] font-medium text-text-color truncate">
                          {lc.title || 'Untitled'}
                        </span>
                      </div>
                      <span className="text-[10.5px] text-middle-grey tabular-nums shrink-0">
                        {new Date(lc.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    {lc.content_text && (
                      <p className="text-[11.5px] text-middle-hard-grey line-clamp-2 leading-relaxed">
                        {extractSnippet(lc.content_text, searchQuery || card.title)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {unlinkedMentions.length > 0 && (
            <div className="pt-2 border-t border-light-grey/60 space-y-2">
              <button
                type="button"
                onClick={() => setShowUnlinked((v) => !v)}
                className="flex items-center gap-1.5 text-[11.5px] font-medium text-middle-hard-grey hover:text-text-color cursor-pointer"
              >
                <ChevronRight
                  size={12}
                  className={`transition-transform ${showUnlinked ? 'rotate-90' : ''}`}
                />
                <span>Unlinked mentions</span>
                <span className="text-middle-grey tabular-nums">({unlinkedMentions.length})</span>
              </button>

              {showUnlinked && (
                <div className="space-y-1.5">
                  {unlinkedMentions.map((um) => (
                    <div
                      key={`unlinked-${um.id}`}
                      className="p-2.5 rounded-md bg-background-primary/70 border border-light-grey flex items-start justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenCard?.(um.id)}
                        className="text-left min-w-0 flex-1 space-y-0.5 cursor-pointer"
                      >
                        <div className="text-[12px] font-medium text-text-color hover:text-active-item truncate">
                          {um.title || 'Untitled'}
                        </div>
                        <p className="text-[11px] text-middle-grey line-clamp-2">
                          {extractSnippet(um.content_text, card.title)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLinkUnlinkedMention(um.id)}
                        className="px-2 py-1 rounded bg-ultra-light-grey hover:bg-active-item text-text-color hover:text-white border border-light-grey hover:border-active-item text-[11px] font-medium flex items-center gap-1 shrink-0 transition cursor-pointer"
                        title="Create backlink"
                      >
                        <Plus size={11} />
                        <span>Link</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
