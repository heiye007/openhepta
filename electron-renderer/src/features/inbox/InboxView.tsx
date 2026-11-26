import React, { useState, useEffect, useCallback } from 'react';
import { Inbox, Plus, PanelRightOpen, Trash2, CheckCircle2, LayoutGrid } from 'lucide-react';
import type { Card, Whiteboard } from '../../../../shared/types';
import { resolveCardBgColor } from '../../../../shared/palette';
import { useAppModal } from '../../primitives/AppModal';
import { SidebarExpandButton } from '../../primitives/SidebarExpandButton';
import { heptaClient } from '../../client';

export interface InboxViewProps {
  whiteboards: Whiteboard[];
  activeWhiteboardId: string;
  onRefreshCards: () => Promise<void> | void;
  onOpenCardInSidePanel: (cardId: string) => void;
  onAddCardToWhiteboard: (cardId: string, whiteboardId?: string) => Promise<void> | void;
  onDeleteCard: (cardId: string) => void;
  isSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
}

export function InboxView({
  whiteboards,
  activeWhiteboardId,
  onRefreshCards,
  onOpenCardInSidePanel,
  onAddCardToWhiteboard,
  onDeleteCard,
  isSidebarCollapsed = false,
  onExpandSidebar,
}: InboxViewProps) {
  const { showConfirm } = useAppModal();
  const [inboxCards, setInboxCards] = useState<Card[]>([]);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickBody, setQuickBody] = useState('');
  const [targetWbId, setTargetWbId] = useState(activeWhiteboardId);

  useEffect(() => {
    if (activeWhiteboardId) setTargetWbId(activeWhiteboardId);
  }, [activeWhiteboardId]);

  const loadInboxCards = useCallback(async () => {
    try {
      const rows = await heptaClient.cards.listInbox();
      setInboxCards(rows || []);
    } catch (err) {
      console.error('Failed to load inbox cards:', err);
    }
  }, []);

  useEffect(() => {
    loadInboxCards();
  }, [loadInboxCards]);

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title && !quickBody.trim()) return;

    const id = `card-${Date.now()}`;
    try {
      await heptaClient.cards.create({
        id,
        title: title || 'Quick note',
        contentJson: '{}',
        contentText: quickBody.trim(),
      });
      setQuickTitle('');
      setQuickBody('');
      await Promise.all([loadInboxCards(), onRefreshCards()]);
    } catch (err) {
      console.error('Failed to capture inbox card:', err);
    }
  };

  const handleAssignToWhiteboard = async (cardId: string) => {
    await onAddCardToWhiteboard(cardId, targetWbId || activeWhiteboardId);
    await loadInboxCards();
  };

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
              <div className="shadow-float p-1 w-6 h-6 rounded-md bg-inbox text-background-secondary flex items-center justify-center">
              <Inbox size={14} strokeWidth={2.2} />
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-text-color">Inbox</h1>
            <span className="px-2 py-0.5 rounded-full bg-ultra-light-grey border border-light-grey text-[11px] font-medium tabular-nums text-middle-grey">
              {inboxCards.length}
            </span>
          </div>

          {whiteboards.length > 0 && (
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-middle-grey flex items-center gap-1">
                <LayoutGrid size={12} />
                <span>Target board:</span>
              </span>
              <select
                value={targetWbId}
                onChange={(e) => setTargetWbId(e.target.value)}
                className="h-7 px-2 rounded-md bg-background-primary border border-light-grey text-text-color text-[12px] outline-none focus:border-active-item"
              >
                {whiteboards.map((wb) => (
                  <option key={wb.id} value={wb.id}>
                    {wb.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <form
            onSubmit={handleCapture}
            className="rounded-lg bg-background-secondary border border-border-grid shadow-card p-3.5 space-y-2"
          >
            <input
              type="text"
              placeholder="Capture a thought or fleeting note... (Enter to save)"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              className="w-full bg-transparent text-[13.5px] font-medium text-text-color placeholder:text-middle-grey outline-none"
            />
            <div className="flex items-end gap-3">
              <textarea
                rows={2}
                placeholder="Optional details..."
                value={quickBody}
                onChange={(e) => setQuickBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    handleCapture(e);
                  }
                }}
                className="flex-1 bg-background-primary px-3 py-1.5 rounded-md border border-light-grey focus:border-active-item text-[12.5px] text-text-color placeholder:text-middle-grey outline-none resize-none"
              />
              <button
                type="submit"
                className="h-8 px-3 rounded-md bg-active-item text-white hover:brightness-105 text-[12px] font-medium flex items-center gap-1 shrink-0 transition cursor-pointer"
              >
                <Plus size={13} />
                <span>Capture</span>
              </button>
            </div>
          </form>

          {inboxCards.length === 0 ? (
            <div className="py-16 text-center rounded-lg border border-dashed border-light-middle-grey bg-background-secondary/40 px-6">
              <CheckCircle2 size={28} className="mx-auto text-successful-item mb-2.5" />
              <div className="text-[14px] font-semibold text-text-color">All done</div>
              <div className="text-[12.5px] text-middle-hard-grey mt-1">
                No cards in your Inbox
              </div>
              <p className="text-[11.5px] text-middle-grey mt-1.5 max-w-md mx-auto">
                Add cards via Ctrl + N, quick capture above, or open any card from the Library to organize later.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {inboxCards.map((card) => (
                <div
                  key={card.id}
                  onClick={() => onOpenCardInSidePanel(card.id)}
                  className="group p-3.5 rounded-lg bg-background-secondary border border-border-grid hover:border-active-item/60 shadow-card flex items-start justify-between gap-4 cursor-pointer transition"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 border border-border-grid"
                      style={{ backgroundColor: resolveCardBgColor(card.color) }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium text-text-color group-hover:text-active-item transition truncate">
                        {card.title || 'Untitled'}
                      </div>
                      {card.content_text && (
                        <p className="text-[12px] text-middle-hard-grey line-clamp-2 mt-0.5 leading-relaxed">
                          {card.content_text}
                        </p>
                      )}
                      <div className="text-[11px] text-middle-grey mt-1.5 tabular-nums">
                        {new Date(card.updated_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAssignToWhiteboard(card.id);
                      }}
                      className="px-2.5 py-1 rounded-md bg-ultra-light-grey hover:bg-active-item text-text-color hover:text-white border border-light-grey hover:border-active-item text-[11.5px] font-medium transition flex items-center gap-1 cursor-pointer"
                      title="Move to selected whiteboard"
                    >
                      <Plus size={12} />
                      <span>Add to board</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCardInSidePanel(card.id);
                      }}
                      className="p-1.5 rounded-md hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
                      title="Open in side panel"
                    >
                      <PanelRightOpen size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await showConfirm({
                          title: 'Delete card',
                          message: `Delete "${card.title || 'Untitled'}" permanently?`,
                          confirmText: 'Delete',
                          variant: 'danger',
                        });
                        if (ok) {
                          await onDeleteCard(card.id);
                          loadInboxCards();
                        }
                      }}
                      className="p-1.5 rounded-md hover:bg-danger-item/15 text-middle-grey hover:text-danger-item transition cursor-pointer"
                      title="Move to trash"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
