import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, StickyNote, LayoutGrid, Plus, ArrowRight, X } from 'lucide-react';
import type { Card, Whiteboard } from '../../../../shared/types';
import { resolveCardBgColor } from '../../../../shared/palette';
import { heptaClient } from '../../client';

export interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: Card[];
  whiteboards: Whiteboard[];
  onSelectCard: (cardId: string, fullView?: boolean) => void;
  onSelectWhiteboard: (whiteboardId: string) => void;
  onCreateCardWithTitle: (title: string) => Promise<void>;
}

type SearchResultItem =
  | { kind: 'whiteboard'; whiteboard: Whiteboard }
  | { kind: 'card'; card: Card }
  | { kind: 'create'; title: string };

export function GlobalSearchModal({
  isOpen,
  onClose,
  cards,
  whiteboards,
  onSelectCard,
  onSelectWhiteboard,
  onCreateCardWithTitle,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [ftsMatches, setFtsMatches] = useState<Card[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setFtsMatches(null);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setFtsMatches(null);
      return;
    }

    let cancelled = false;
    const runSearch = async () => {
      try {
        let rows = await heptaClient.cards.searchFts(trimmed, 20);
        if (rows.length === 0) {
          rows = await heptaClient.cards.list(trimmed);
        }
        if (!cancelled) setFtsMatches(rows.slice(0, 20));
      } catch {
        if (!cancelled) setFtsMatches(null);
      }
    };

    const timer = setTimeout(runSearch, 90);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  const results = useMemo<SearchResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const matchedWhiteboards = whiteboards
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map((whiteboard): SearchResultItem => ({ kind: 'whiteboard', whiteboard }));

    const cardSource =
      q && ftsMatches !== null
        ? ftsMatches
        : cards
            .filter(
              (c) =>
                !q ||
                (c.title || '').toLowerCase().includes(q) ||
                (c.content_text || '').toLowerCase().includes(q)
            )
            .slice(0, 12);

    const matchedCards = cardSource.map(
      (card): SearchResultItem => ({ kind: 'card', card })
    );

    const items: SearchResultItem[] = [...matchedWhiteboards, ...matchedCards];
    if (query.trim().length > 0) {
      items.push({ kind: 'create', title: query.trim() });
    }
    return items;
  }, [query, whiteboards, cards, ftsMatches]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  const executeItem = async (item: SearchResultItem, shiftKey = false) => {
    if (item.kind === 'whiteboard') {
      onSelectWhiteboard(item.whiteboard.id);
      onClose();
    } else if (item.kind === 'card') {
      onSelectCard(item.card.id, shiftKey);
      onClose();
    } else if (item.kind === 'create') {
      await onCreateCardWithTitle(item.title);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      executeItem(results[selectedIndex], e.shiftKey);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--scrim-color)] pt-[12vh] px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-[580px] rounded-xl bg-background-secondary border border-border-grid shadow-main overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-light-grey">
          <Search size={16} className="text-middle-grey shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards, whiteboards, or create new..."
            className="flex-1 bg-transparent text-[14px] text-text-color placeholder:text-middle-grey outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
          <kbd className="px-1.5 py-0.5 rounded bg-ultra-light-grey border border-light-grey text-[10px] text-middle-grey font-mono">
            ESC
          </kbd>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-1.5 space-y-0.5">
          {results.length === 0 ? (
            <div className="py-10 text-center text-[12.5px] text-middle-grey">
              No matching cards or whiteboards.
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              if (item.kind === 'whiteboard') {
                return (
                  <button
                    key={`wb-${item.whiteboard.id}`}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => executeItem(item)}
                    className={`w-full px-3 py-2 rounded-lg flex items-center justify-between text-left transition cursor-pointer ${
                      isSelected ? 'bg-light-grey' : 'hover:bg-ultra-light-grey'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-5 h-5 rounded bg-map text-background-secondary flex items-center justify-center shrink-0">
                        <LayoutGrid size={11} />
                      </div>
                      <span className="text-[13px] font-medium text-text-color truncate">
                        {item.whiteboard.name}
                      </span>
                      <span className="text-[11px] text-middle-grey shrink-0">Whiteboard</span>
                    </div>
                    <ArrowRight size={13} className="text-middle-grey shrink-0" />
                  </button>
                );
              }

              if (item.kind === 'card') {
                return (
                  <button
                    key={`card-${item.card.id}`}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={(e) => executeItem(item, e.shiftKey)}
                    className={`w-full px-3 py-2 rounded-lg flex items-center justify-between gap-3 text-left transition cursor-pointer ${
                      isSelected ? 'bg-light-grey' : 'hover:bg-ultra-light-grey'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className="w-4 h-4 rounded flex items-center justify-center border border-border-grid shrink-0"
                        style={{ backgroundColor: resolveCardBgColor(item.card.color) }}
                      >
                        <StickyNote size={10} className="text-middle-hard-grey" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-text-color truncate">
                          {item.card.title || 'Untitled'}
                        </div>
                        {item.card.content_text && (
                          <div className="text-[11.5px] text-middle-grey truncate">
                            {item.card.content_text}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[10.5px] text-middle-grey shrink-0 tabular-nums">
                      {new Date(item.card.updated_at).toLocaleDateString()}
                    </span>
                  </button>
                );
              }

              return (
                <button
                  key="create-new"
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => executeItem(item)}
                  className={`w-full px-3 py-2 rounded-lg flex items-center gap-2.5 text-left transition cursor-pointer ${
                    isSelected ? 'bg-middle-transparent-blue' : 'hover:bg-ultra-light-grey'
                  }`}
                >
                  <Plus size={14} className="text-active-item shrink-0" />
                  <span className="text-[13px] text-text-color">
                    Create card <span className="font-semibold">&ldquo;{item.title}&rdquo;</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-light-grey bg-background-primary/60 flex items-center justify-between text-[11px] text-middle-grey">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Open in side panel</span>
            <span>⇧↵ Open full</span>
          </div>
          <span>Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
