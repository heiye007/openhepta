import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquarePlus, LayoutGrid, Trash2, Check, X } from 'lucide-react';
import type { AnnotationColor, Tag } from '@shared/types';
import { ANNOTATION_COLORS, getAnnotationCssVar } from '@shared/palette';
import { HighlightTagChips } from '../../primitives/card-metadata';

export interface HighlightToolbarProps {
  x: number;
  y: number;
  activeColor?: AnnotationColor | null;
  initialNote?: string;
  tags?: Tag[];
  isEditing?: boolean;
  autoOpenNote?: boolean;
  onSelectColor: (color: AnnotationColor) => void;
  onSaveNote: (noteText: string, color?: AnnotationColor) => void;
  onAddTag?: (tagName: string) => void | Promise<void>;
  onRemoveTag?: (tagId: string) => void | Promise<void>;
  onAddToWhiteboard?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function HighlightToolbar({
  x,
  y,
  activeColor = null,
  initialNote = '',
  tags = [],
  isEditing = false,
  autoOpenNote = false,
  onSelectColor,
  onSaveNote,
  onAddTag,
  onRemoveTag,
  onAddToWhiteboard,
  onDelete,
  onClose,
}: HighlightToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const [showNoteEditor, setShowNoteEditor] = useState(autoOpenNote);
  const [noteDraft, setNoteDraft] = useState(initialNote);
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: x, top: y });

  useEffect(() => {
    setNoteDraft(initialNote);
  }, [initialNote]);

  useEffect(() => {
    if (autoOpenNote) {
      setShowNoteEditor(true);
    }
  }, [autoOpenNote]);

  useEffect(() => {
    if (showNoteEditor) {
      requestAnimationFrame(() => {
        noteInputRef.current?.focus();
      });
    }
  }, [showNoteEditor]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const padding = 12;
    const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding);
    const left = Math.min(Math.max(padding, x - rect.width / 2), maxLeft);

    let top = y - rect.height - 10;
    if (top < padding) {
      top = Math.min(window.innerHeight - rect.height - padding, y + 26);
    }
    setCoords({ left, top });
  }, [x, y, showNoteEditor, isEditing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [onClose]);

  const handleSaveNoteSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onSaveNote(noteDraft.trim(), activeColor ?? 'yellow');
    setShowNoteEditor(false);
  };

  return (
    <div
      ref={containerRef}
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[1150] bg-menu-bg border border-light-grey shadow-main rounded-lg p-1.5 text-text-color select-none backdrop-blur-md"
      role="toolbar"
      aria-label="Highlight annotation toolbar"
    >
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1 px-1">
          {ANNOTATION_COLORS.map((item) => {
            const isSelected = activeColor === item.color;
            return (
              <button
                key={item.color}
                type="button"
                title={`Highlight ${item.label}`}
                aria-label={`Highlight ${item.label}`}
                onClick={() => onSelectColor(item.color)}
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform cursor-pointer hover:scale-110 ${
                  isSelected ? 'ring-2 ring-text-color ring-offset-1 ring-offset-menu-bg scale-110' : ''
                }`}
                style={{ backgroundColor: getAnnotationCssVar(item.color) }}
              >
                {isSelected && <Check size={11} strokeWidth={3} className="text-black/75" />}
              </button>
            );
          })}
        </div>

        <div className="w-px h-4 bg-light-grey mx-0.5" />

        <button
          type="button"
          onClick={() => setShowNoteEditor((prev) => !prev)}
          title={initialNote ? 'Edit Note' : 'Add Note'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium transition cursor-pointer ${
            showNoteEditor || initialNote
              ? 'bg-middle-transparent-blue text-active-item'
              : 'hover:bg-light-grey text-text-color'
          }`}
        >
          <MessageSquarePlus size={13} />
          <span>{initialNote ? 'Note' : 'Add Note'}</span>
        </button>

        {onAddToWhiteboard && (
          <button
            type="button"
            onClick={onAddToWhiteboard}
            title="Add to Whiteboard"
            className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium hover:bg-light-grey text-text-color transition cursor-pointer"
          >
            <LayoutGrid size={13} />
            <span>Add to Whiteboard</span>
          </button>
        )}

        {isEditing && onDelete && (
          <>
            <div className="w-px h-4 bg-light-grey mx-0.5" />
            <button
              type="button"
              onClick={onDelete}
              title="Delete Highlight"
              aria-label="Delete Highlight"
              className="p-1.5 rounded hover:bg-danger-item/15 text-middle-hard-grey hover:text-danger-item transition cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      {isEditing && (tags.length > 0 || onAddTag) && (
        <div className="mt-1.5 pt-1.5 border-t border-light-grey">
          <HighlightTagChips
            tags={tags}
            onAddTag={onAddTag}
            onRemoveTag={onRemoveTag}
            compact
          />
        </div>
      )}

      {showNoteEditor && (
        <form onSubmit={handleSaveNoteSubmit} className="mt-1.5 pt-1.5 border-t border-light-grey">
          <textarea
            ref={noteInputRef}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSaveNoteSubmit();
              }
            }}
            placeholder="Write a note for this highlight..."
            rows={2}
            className="w-full min-w-[260px] resize-none rounded-md bg-background-secondary border border-light-grey focus:border-active-item px-2.5 py-1.5 text-[12px] text-text-color placeholder:text-middle-grey outline-none"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10.5px] text-middle-grey">Ctrl/Cmd + Enter to save</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowNoteEditor(false)}
                className="px-2 py-0.5 rounded text-[11.5px] text-middle-hard-grey hover:bg-light-grey transition cursor-pointer flex items-center gap-0.5"
              >
                <X size={11} />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                className="px-2.5 py-0.5 rounded text-[11.5px] font-medium bg-active-item text-white hover:opacity-90 transition cursor-pointer flex items-center gap-0.5"
              >
                <Check size={11} />
                <span>Save</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
