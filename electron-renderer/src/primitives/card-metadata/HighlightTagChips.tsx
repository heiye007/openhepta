import React, { useState } from 'react';
import { Check, Hash, Plus, X } from 'lucide-react';
import type { Tag } from '@shared/types';

export interface HighlightTagChipsProps {
  tags?: Tag[];
  onAddTag?: (tagName: string) => void | Promise<void>;
  onRemoveTag?: (tagId: string) => void | Promise<void>;
  compact?: boolean;
}

export function HighlightTagChips({
  tags = [],
  onAddTag,
  onRemoveTag,
  compact = false,
}: HighlightTagChipsProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const submitDraft = () => {
    const trimmed = draft.trim().replace(/^#/, '');
    if (!trimmed || !onAddTag) {
      setIsAdding(false);
      setDraft('');
      return;
    }
    void onAddTag(trimmed);
    setDraft('');
    setIsAdding(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    submitDraft();
  };

  if (tags.length === 0 && !onAddTag) return null;

  return (
    <div
      className={`flex items-center flex-wrap gap-1 ${compact ? 'text-[10.5px]' : 'text-[11px]'}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-light-grey/90 text-text-color font-medium max-w-[120px]"
        >
          <Hash size={10} className="shrink-0 opacity-70" style={{ color: tag.color || undefined }} />
          <span className="truncate">{tag.name}</span>
          {onRemoveTag && (
            <button
              type="button"
              aria-label={`Remove tag ${tag.name}`}
              onClick={() => void onRemoveTag(tag.id)}
              className="ml-0.5 text-middle-grey hover:text-danger-item cursor-pointer"
              title={`Remove #${tag.name}`}
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}

      {onAddTag &&
        (isAdding ? (
          <form onSubmit={handleSubmit} className="inline-flex items-center gap-1">
            <input
              type="text"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  submitDraft();
                } else if (e.key === 'Escape') {
                  e.stopPropagation();
                  setIsAdding(false);
                  setDraft('');
                }
              }}
              onBlur={() => {
                submitDraft();
              }}
              placeholder="Tag name..."
              aria-label="New highlight tag"
              className="w-24 h-5 px-1.5 rounded bg-background-primary border border-active-item text-[11px] text-text-color placeholder:text-middle-grey outline-none"
            />
            <button
              type="button"
              aria-label="Confirm highlight tag"
              onMouseDown={(e) => e.preventDefault()}
              onClick={submitDraft}
              className="p-0.5 rounded bg-active-item text-white hover:opacity-90 cursor-pointer"
              title="Add tag"
            >
              <Check size={11} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            aria-label="Add highlight tag"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-light-grey text-middle-grey hover:text-active-item hover:border-active-item transition cursor-pointer"
            title="Add tag"
          >
            <Plus size={10} />
            <span>Tag</span>
          </button>
        ))}
    </div>
  );
}
