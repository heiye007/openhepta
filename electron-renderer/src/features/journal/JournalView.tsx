import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, PanelRightOpen } from 'lucide-react';
import type { Card } from '../../../../shared/types';
import { CardEditor } from '../../primitives/card-editor';
import { SidebarExpandButton } from '../../primitives/SidebarExpandButton';
import { heptaClient } from '../../client';

export interface JournalViewProps {
  cards: Card[];
  onRefreshCards: () => Promise<void> | void;
  onOpenCardInSidePanel: (cardId: string) => void;
  onAddCardToWhiteboard: (cardId: string) => void;
  isSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
}

function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatReadableDate(dateKey: string): string {
  const [y, m, day] = dateKey.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, day || 1);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function JournalView({
  cards,
  onRefreshCards,
  onOpenCardInSidePanel,
  onAddCardToWhiteboard,
  isSidebarCollapsed = false,
  onExpandSidebar,
}: JournalViewProps) {
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [activeJournalCard, setActiveJournalCard] = useState<Card | null>(null);

  const journalId = `journal-${selectedDate}`;

  const loadJournalEntry = useCallback(async () => {
    try {
      const entry = await heptaClient.cards.get(journalId);
      setActiveJournalCard(entry && entry.is_deleted === 0 ? entry : null);
    } catch (err) {
      console.error('Failed to load journal entry:', err);
    }
  }, [journalId]);

  useEffect(() => {
    loadJournalEntry();
  }, [loadJournalEntry]);

  const recentJournalCards = useMemo(() => {
    return cards
      .filter((c) => c.id.startsWith('journal-') && c.id !== journalId)
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, 14);
  }, [cards, journalId]);

  const handleShiftDay = (deltaDays: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setDate(dt.getDate() + deltaDays);
    setSelectedDate(toDateKey(dt));
  };

  const handleJournalChange = async (content: { json: string; text: string }) => {
    try {
      const saved = await heptaClient.cards.upsertJournal(selectedDate, content.json, content.text);
      if (saved) {
        setActiveJournalCard(saved);
        await onRefreshCards();
      }
    } catch (err) {
      console.error('Failed to save journal entry:', err);
    }
  };

  const initialEditorValue =
    activeJournalCard?.content_json && activeJournalCard.content_json.includes('"type":"doc"')
      ? activeJournalCard.content_json
      : activeJournalCard?.content_text || '';

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-background-primary">
      <div
        className={`flex items-center min-h-[48px] py-2.5 pr-6 border-b border-light-grey bg-background-secondary/60 shrink-0 transition-[padding] duration-300 ${
          isSidebarCollapsed ? 'pl-2.5' : 'pl-6'
        }`}
      >
        <SidebarExpandButton visible={isSidebarCollapsed} onExpand={onExpandSidebar} />
        <div className="flex-1 min-w-0">
          <div className="w-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="shadow-float p-1 w-6 h-6 rounded-md bg-timeline text-background-secondary flex items-center justify-center">
              <Calendar size={14} strokeWidth={2.2} />
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-text-color">Journal</h1>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleShiftDay(-1)}
              className="p-1.5 rounded-md bg-background-primary border border-light-grey hover:bg-light-grey text-middle-hard-grey transition cursor-pointer"
              title="Previous day"
            >
              <ChevronLeft size={14} />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="h-7 px-2.5 rounded-md bg-background-primary border border-light-grey text-[12px] text-text-color outline-none focus:border-active-item tabular-nums"
            />
            <button
              type="button"
              onClick={() => handleShiftDay(1)}
              className="p-1.5 rounded-md bg-background-primary border border-light-grey hover:bg-light-grey text-middle-hard-grey transition cursor-pointer"
              title="Next day"
            >
              <ChevronRight size={14} />
            </button>
            {selectedDate !== todayKey && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayKey)}
                className="h-7 px-2.5 rounded-md bg-ultra-light-grey hover:bg-light-grey border border-light-grey text-[11.5px] font-medium text-active-item transition cursor-pointer"
              >
                Today
              </button>
            )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="rounded-xl bg-background-secondary border border-border-grid shadow-card overflow-hidden">
            <div className="px-7 pt-6 pb-3 border-b border-light-grey/70 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[20px] font-bold tracking-tight text-text-color">
                    {selectedDate}
                  </h2>
                  {selectedDate === todayKey && (
                    <span className="px-2 py-0.5 rounded-full bg-middle-transparent-blue text-active-item text-[11px] font-medium">
                      Today
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-middle-grey mt-0.5">
                  {formatReadableDate(selectedDate)}
                </p>
              </div>

              {activeJournalCard && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenCardInSidePanel(activeJournalCard.id)}
                    className="px-2.5 py-1 rounded-md border border-light-grey hover:bg-light-grey text-[11.5px] text-middle-hard-grey hover:text-text-color flex items-center gap-1 transition cursor-pointer"
                  >
                    <PanelRightOpen size={12} />
                    <span>Side panel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddCardToWhiteboard(activeJournalCard.id)}
                    className="px-2.5 py-1 rounded-md border border-light-grey hover:border-active-item hover:text-active-item text-[11.5px] text-middle-hard-grey flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>Add to board</span>
                  </button>
                </div>
              )}
            </div>

            <div className="px-7 py-5 min-h-[280px] cursor-text select-text">
              <CardEditor
                key={journalId}
                initialContent={initialEditorValue}
                onChange={handleJournalChange}
                placeholder="Write today's reflections, tasks, or fleeting ideas... ('/' for commands, '[[' to link cards)"
                sourceCardId={journalId}
                cards={cards}
                onOpenCard={onOpenCardInSidePanel}
              />
            </div>
          </div>

          {recentJournalCards.length > 0 && (
            <div className="space-y-3">
              <div className="text-[11.5px] font-semibold uppercase tracking-wider text-middle-grey px-1">
                Recent entries
              </div>
              <div className="space-y-2">
                {recentJournalCards.map((entry) => {
                  const datePart = entry.id.replace('journal-', '');
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedDate(datePart)}
                      className="w-full text-left p-4 rounded-lg bg-background-secondary border border-border-grid hover:border-active-item/60 shadow-card transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-semibold text-text-color">
                          {entry.title || datePart}
                        </span>
                        <span className="text-[11px] text-middle-grey">
                          {formatReadableDate(datePart)}
                        </span>
                      </div>
                      <p className="text-[12px] text-middle-hard-grey line-clamp-2 leading-relaxed">
                        {entry.content_text || 'Empty entry'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
