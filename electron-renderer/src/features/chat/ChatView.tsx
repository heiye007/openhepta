import React, { useState } from 'react';
import { MessageSquare, Send, StickyNote } from 'lucide-react';
import type { Card } from '../../../../shared/types';
import { heptaClient } from '../../client';
import { SidebarExpandButton } from '../../primitives/SidebarExpandButton';

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  matchedCards?: Card[];
}

export interface ChatViewProps {
  cards: Card[];
  whiteboardsCount: number;
  onOpenCardInSidePanel: (cardId: string) => void;
  isSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
}

export function ChatView({
  cards,
  whiteboardsCount,
  onOpenCardInSidePanel,
  isSidebarCollapsed = false,
  onExpandSidebar,
}: ChatViewProps) {
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = chatInput.trim();
    if (!prompt || isSearching) return;

    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      text: prompt,
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsSearching(true);

    let matched: Card[] = [];
    try {
      const ftsResults = await heptaClient.cards.searchFts(prompt, 5);
      if (ftsResults && ftsResults.length > 0) {
        matched = ftsResults.slice(0, 5);
      }
    } catch {
      matched = [];
    }

    if (matched.length === 0) {
      const terms = prompt
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 1);
      matched = cards
        .filter((c) => {
          const hay = `${c.title || ''} ${c.content_text || ''}`.toLowerCase();
          return terms.length > 0 ? terms.some((t) => hay.includes(t)) : hay.includes(prompt.toLowerCase());
        })
        .slice(0, 5);
    }

    const replyText =
      matched.length > 0
        ? `Found ${matched.length} relevant card${matched.length > 1 ? 's' : ''} in your local knowledge base (${cards.length} total cards across ${whiteboardsCount} whiteboards). Click any card below to inspect it in the side panel.`
        : `No direct card matches for "${prompt}" across ${cards.length} local cards. Try searching with different keywords or press Ctrl+K to browse.`;

    const assistantMsg: ChatMessage = {
      id: `msg-a-${Date.now() + 1}`,
      role: 'assistant',
      text: replyText,
      matchedCards: matched,
    };

    setChatMessages((prev) => [...prev, assistantMsg]);
    setIsSearching(false);
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
          <div className="w-full flex items-center gap-2.5">
            <div className="shadow-float p-1 w-6 h-6 rounded-md bg-chat text-background-secondary flex items-center justify-center">
              <MessageSquare size={14} strokeWidth={2.2} />
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-text-color">Chat</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="p-4 rounded-lg bg-background-secondary border border-border-grid shadow-card text-[13px] leading-relaxed text-text-color space-y-1.5">
            <div className="font-semibold text-active-item text-[12px]">
              OpenHepta Local Assistant
            </div>
            <p className="text-middle-hard-grey">
              Connected to {cards.length} cards across {whiteboardsCount} whiteboards. Ask
              about any topic in your workspace to surface related notes.
            </p>
          </div>

          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`p-4 rounded-lg border text-[13px] leading-relaxed space-y-2.5 ${
                msg.role === 'user'
                  ? 'bg-middle-transparent-blue border-active-item/30 text-text-color ml-12'
                  : 'bg-background-secondary border-border-grid shadow-card text-text-color mr-12'
              }`}
            >
              <p>{msg.text}</p>
              {msg.matchedCards && msg.matchedCards.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msg.matchedCards.map((mc) => (
                    <button
                      key={mc.id}
                      type="button"
                      onClick={() => onOpenCardInSidePanel(mc.id)}
                      className="px-2.5 py-1 rounded-md bg-background-primary border border-light-grey hover:border-active-item text-[11.5px] text-text-color hover:text-active-item flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <StickyNote size={11} className="text-middle-grey" />
                      <span className="truncate max-w-[200px]">
                        {mc.title || 'Untitled'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSendChat}
        className="px-8 py-4 border-t border-light-grey bg-background-secondary/60 shrink-0"
      >
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask your knowledge base..."
            className="flex-1 h-10 px-3.5 rounded-lg bg-background-primary border border-light-grey focus:border-active-item text-[13px] text-text-color placeholder:text-middle-grey outline-none transition"
          />
          <button
            type="submit"
            disabled={isSearching}
            className="h-10 px-3.5 rounded-lg bg-active-item text-white hover:brightness-105 disabled:opacity-60 flex items-center gap-1.5 text-[12.5px] font-medium transition cursor-pointer"
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
