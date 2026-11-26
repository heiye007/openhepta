import React, { useState, useRef, useEffect } from 'react';
import {
  Crosshair,
  Trash2,
  ExternalLink,
  FileText,
  BookOpen,
  MessageSquare,
} from 'lucide-react';
import type {
  AnnotationColor,
  HighlightElement,
  Tag,
  WhiteboardObject,
} from '@shared/types';
import { ANNOTATION_COLORS, getAnnotationCssVar } from '@shared/palette';
import { heptaClient } from '../../client';
import { HighlightTagChips } from '../../primitives/card-metadata';

export const ANNOTATION_COLOR_OPTIONS: Array<{
  id: AnnotationColor;
  label: string;
  cssVar: string;
}> = ANNOTATION_COLORS.map((item) => ({
  id: item.color,
  label: item.label,
  cssVar: getAnnotationCssVar(item.color),
}));

export interface HighlightNodeProps {
  object: WhiteboardObject;
  highlight?: HighlightElement | null;
  sourceTitle?: string;
  isSelected: boolean;
  isDimmed?: boolean;
  dimmedOpacity?: number;
  scale: number;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onUpdateSize: (id: string, width: number, height: number) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onStartConnect?: (
    id: string,
    anchor: 'top' | 'bottom' | 'left' | 'right',
    point: { x: number; y: number }
  ) => void;
  onOpenDocument?: (documentId: string, highlightId?: string) => void;
  onUpdateHighlightNote?: (highlightId: string, noteText: string) => void;
  onUpdateHighlightColor?: (highlightId: string, color: AnnotationColor) => void;
  onLocate?: (id: string) => void;
}

export function HighlightNode({
  object,
  highlight,
  sourceTitle,
  isSelected,
  isDimmed = false,
  dimmedOpacity = 0.25,
  scale,
  onUpdatePosition,
  onDragEnd,
  onUpdateSize,
  onDelete,
  onSelect,
  onStartConnect,
  onOpenDocument,
  onUpdateHighlightNote,
  onUpdateHighlightColor,
  onLocate,
}: HighlightNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(highlight?.note_text || '');
  const [localTags, setLocalTags] = useState<Tag[]>(highlight?.tags ?? []);

  useEffect(() => {
    setLocalTags(highlight?.tags ?? []);
  }, [highlight?.tags]);

  useEffect(() => {
    setNoteDraft(highlight?.note_text || '');
  }, [highlight?.note_text]);

  let parsedProps: Record<string, unknown> = {};
  try {
    if (object.properties_json) parsedProps = JSON.parse(object.properties_json);
  } catch {}

  const color: AnnotationColor =
    highlight?.color ||
    (typeof parsedProps.color === 'string' ? (parsedProps.color as AnnotationColor) : 'yellow');
  const accentCssVar = getAnnotationCssVar(color);
  const textContent =
    highlight?.text_content ||
    (typeof parsedProps.text_content === 'string' ? parsedProps.text_content : '');
  const imageRefId =
    highlight?.image_reference_id ||
    (typeof parsedProps.image_reference_id === 'string' ? parsedProps.image_reference_id : null);
  const isAreaHighlight =
    (highlight?.highlight_type || parsedProps.highlight_type) === 'area' && !!imageRefId;
  const sourceId =
    highlight?.source_id ||
    (typeof parsedProps.source_id === 'string' ? parsedProps.source_id : '');
  const sourceType =
    highlight?.source_type ||
    (typeof parsedProps.source_type === 'string' ? parsedProps.source_type : 'pdf');
  const pageNumber =
    highlight?.page_number ??
    (typeof parsedProps.page_number === 'number' ? parsedProps.page_number : null);
  const highlightId = highlight?.id || object.target_id || '';

  const isLodThreshold = Math.round(scale * 100) <= 30;

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0, objX: 0, objY: 0, currentX: 0, currentY: 0 });

  const isResizingRef = useRef(false);
  const resizeStartPosRef = useRef({ x: 0, y: 0, width: 0, height: 0, mode: 'corner' as 'right' | 'corner' });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('textarea') ||
      target.closest('.card-anchor') ||
      target.closest('.card-resize-handle')
    ) {
      return;
    }

    onSelect(object.id, e);

    isDraggingRef.current = true;
    dragStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      objX: object.pos_x,
      objY: object.pos_y,
      currentX: object.pos_x,
      currentY: object.pos_y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = (moveEvent.clientX - dragStartPosRef.current.x) / scale;
      const dy = (moveEvent.clientY - dragStartPosRef.current.y) / scale;
      const nextX = dragStartPosRef.current.objX + dx;
      const nextY = dragStartPosRef.current.objY + dy;
      dragStartPosRef.current.currentX = nextX;
      dragStartPosRef.current.currentY = nextY;
      onUpdatePosition(object.id, nextX, nextY);
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        onDragEnd?.(object.id, dragStartPosRef.current.currentX, dragStartPosRef.current.currentY);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (e: React.MouseEvent, mode: 'right' | 'corner') => {
    e.stopPropagation();
    isResizingRef.current = true;
    resizeStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: object.width,
      height: object.height,
      mode,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = (moveEvent.clientX - resizeStartPosRef.current.x) / scale;
      const dy = (moveEvent.clientY - resizeStartPosRef.current.y) / scale;
      const newW = Math.max(240, resizeStartPosRef.current.width + dx);
      const newH =
        mode === 'corner'
          ? Math.max(100, resizeStartPosRef.current.height + dy)
          : resizeStartPosRef.current.height;
      onUpdateSize(object.id, newW, newH);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleAnchorMouseDown = (
    anchor: 'top' | 'bottom' | 'left' | 'right',
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!onStartConnect) return;
    let point = { x: object.pos_x + object.width / 2, y: object.pos_y };
    if (anchor === 'bottom') point = { x: object.pos_x + object.width / 2, y: object.pos_y + object.height };
    if (anchor === 'left') point = { x: object.pos_x, y: object.pos_y + object.height / 2 };
    if (anchor === 'right') point = { x: object.pos_x + object.width, y: object.pos_y + object.height / 2 };
    onStartConnect(object.id, anchor, point);
  };

  const commitNote = () => {
    setIsEditingNote(false);
    if (highlightId && onUpdateHighlightNote && noteDraft !== (highlight?.note_text || '')) {
      onUpdateHighlightNote(highlightId, noteDraft);
    }
  };

  return (
    <div
      onClick={(e) => onSelect(object.id, e)}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-whiteboard-id={object.whiteboard_id}
      data-object-id={object.id}
      data-object-type="highlight"
      className="group relative select-none"
      style={{
        position: 'absolute',
        left: object.pos_x,
        top: object.pos_y,
        width: object.width,
        minHeight: object.height,
        zIndex: isSelected ? 10 : isHovered ? 5 : object.z_index || 10,
        pointerEvents: 'auto',
        background: 'var(--background-secondary)',
        borderRadius: 12,
        boxShadow: isSelected
          ? '0 0 0 2px var(--active-item), var(--shadow-main)'
          : isHovered
          ? '0 6px 18px rgba(0, 0, 0, 0.09), var(--shadow-card)'
          : 'var(--shadow-card)',
        border: isSelected ? '1px solid var(--active-item)' : '1px solid var(--light-grey)',
        color: 'var(--text-color)',
        display: 'flex',
        flexDirection: 'column',
        opacity: isDimmed ? dimmedOpacity : 1,
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.15s ease',
      }}
    >
      {!isLodThreshold && onStartConnect && (
        <>
          <div
            onMouseDown={(e) => handleAnchorMouseDown('top', e)}
            className="card-anchor top"
            style={{ top: -6, left: '50%', transform: 'translateX(-50%)' }}
            title="连线锚点 (上)"
          />
          <div
            onMouseDown={(e) => handleAnchorMouseDown('bottom', e)}
            className="card-anchor bottom"
            style={{ bottom: -6, left: '50%', transform: 'translateX(-50%)' }}
            title="连线锚点 (下)"
          />
          <div
            onMouseDown={(e) => handleAnchorMouseDown('left', e)}
            className="card-anchor left"
            style={{ left: -6, top: '50%', transform: 'translateY(-50%)' }}
            title="连线锚点 (左)"
          />
          <div
            onMouseDown={(e) => handleAnchorMouseDown('right', e)}
            className="card-anchor right"
            style={{ right: -6, top: '50%', transform: 'translateY(-50%)' }}
            title="连线锚点 (右)"
          />
        </>
      )}

      {!isLodThreshold && (
        <div
          className="absolute z-30 -top-9 right-0 flex items-center gap-1 px-1.5 py-1 rounded-lg bg-menu-bg/95 backdrop-blur-md border border-light-grey shadow-main opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {highlightId && onUpdateHighlightColor && (
            <div className="flex items-center gap-1 pr-1 border-r border-light-grey">
              {ANNOTATION_COLOR_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onUpdateHighlightColor(highlightId, c.id)}
                  className={`w-3.5 h-3.5 rounded-full transition hover:scale-125 ${
                    color === c.id ? 'ring-2 ring-active-item ring-offset-1 ring-offset-transparent' : ''
                  }`}
                  style={{ backgroundColor: c.cssVar }}
                  title={c.label}
                />
              ))}
            </div>
          )}

          {onLocate && (
            <button
              onClick={() => onLocate(object.id)}
              className="p-1 rounded hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition"
              title="在白板中央定位"
            >
              <Crosshair size={13} />
            </button>
          )}

          {sourceId && onOpenDocument && (
            <button
              onClick={() => onOpenDocument(sourceId, highlightId || undefined)}
              className="px-1.5 py-0.5 rounded hover:bg-light-grey text-active-item text-[11px] font-medium flex items-center gap-1 transition"
              title="在阅读器中定位原文 (Locate in Reader)"
            >
              <ExternalLink size={12} />
              <span>Locate</span>
            </button>
          )}

          <button
            onClick={() => onDelete(object.id)}
            className="p-1 rounded hover:bg-danger-item/10 text-middle-hard-grey hover:text-danger-item transition"
            title="从白板移除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 rounded-[11px] overflow-hidden cursor-grab">
        {isLodThreshold ? (
          <div className="flex-1 p-4 flex gap-3 items-stretch">
            <div className="w-2 rounded-full shrink-0" style={{ backgroundColor: accentCssVar }} />
            <div className="text-[18px] font-semibold leading-snug text-text-color line-clamp-4">
              {textContent || (isAreaHighlight ? '[Area Highlight]' : 'Highlight')}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-3.5 gap-2.5">
            <div className="flex items-stretch gap-2.5">
              <div
                className="w-1 rounded-full shrink-0"
                style={{ backgroundColor: accentCssVar }}
              />
              <div className="flex-1 min-w-0">
                {isAreaHighlight ? (
                  <div className="rounded-lg overflow-hidden border border-light-grey bg-background-primary">
                    <img
                      src={`hepta-preview://${imageRefId}`}
                      alt="Area highlight"
                      className="w-full h-auto max-h-[260px] object-contain pointer-events-none select-none"
                    />
                  </div>
                ) : (
                  <blockquote
                    className="text-[14px] leading-[1.6] text-text-color whitespace-pre-wrap break-words rounded-md px-2.5 py-1.5"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${accentCssVar} 12%, transparent)`,
                    }}
                  >
                    {textContent || <span className="text-middle-grey italic">Empty highlight</span>}
                  </blockquote>
                )}
              </div>
            </div>

            <div
              className="pl-3.5"
              onClick={(e) => {
                e.stopPropagation();
                if (!isEditingNote) setIsEditingNote(true);
              }}
            >
              {isEditingNote ? (
                <textarea
                  autoFocus
                  rows={2}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={commitNote}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      commitNote();
                    } else if (e.key === 'Escape') {
                      setNoteDraft(highlight?.note_text || '');
                      setIsEditingNote(false);
                    }
                  }}
                  placeholder="Write a note..."
                  className="w-full rounded-lg bg-background-primary border border-active-item px-2.5 py-1.5 text-[13px] text-text-color placeholder:text-middle-grey outline-none resize-none"
                />
              ) : noteDraft ? (
                <div className="flex items-start gap-1.5 text-[13px] leading-[1.5] text-middle-hard-grey hover:text-text-color cursor-text rounded px-1.5 py-1 hover:bg-ultra-light-grey transition">
                  <MessageSquare size={12} className="mt-1 shrink-0 text-middle-grey" />
                  <span className="whitespace-pre-wrap break-words">{noteDraft}</span>
                </div>
              ) : (
                <div className="text-[12px] text-middle-grey hover:text-middle-hard-grey cursor-text px-1.5 py-0.5 rounded hover:bg-ultra-light-grey transition">
                  + Add note...
                </div>
              )}
            </div>

            {highlight?.id && (
              <div className="pl-3.5">
                <HighlightTagChips
                  tags={localTags}
                  onAddTag={async (tagName) => {
                    const tag = await heptaClient.highlights.addTag(highlight.id, tagName);
                    setLocalTags((prev) =>
                      prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]
                    );
                  }}
                  onRemoveTag={async (tagId) => {
                    await heptaClient.highlights.removeTag(highlight.id, tagId);
                    setLocalTags((prev) => prev.filter((t) => t.id !== tagId));
                  }}
                  compact
                />
              </div>
            )}

            <div className="mt-auto pt-2 border-t border-light-grey/70 flex items-center justify-between gap-2 text-[11px] text-middle-grey">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold uppercase text-[10px] shrink-0 ${
                    sourceType === 'epub'
                      ? 'bg-active-item/15 text-active-item'
                      : 'bg-danger-item/15 text-danger-item'
                  }`}
                >
                  {sourceType === 'epub' ? <BookOpen size={10} /> : <FileText size={10} />}
                  <span>{sourceType}</span>
                </span>
                <span className="truncate text-middle-hard-grey font-medium">
                  {sourceTitle || 'Source Document'}
                </span>
                {pageNumber !== null && pageNumber !== undefined && (
                  <span className="font-mono text-[10px] text-middle-grey shrink-0">
                    p.{pageNumber}
                  </span>
                )}
              </div>

              {sourceId && onOpenDocument && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDocument(sourceId, highlightId || undefined);
                  }}
                  className="px-2 py-0.5 rounded bg-ultra-light-grey hover:bg-light-grey text-active-item font-medium flex items-center gap-1 shrink-0 transition"
                  title="Locate in Reader"
                >
                  <ExternalLink size={10} />
                  <span>Locate in Reader</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {!isLodThreshold && (
        <div
          onMouseDown={(e) => handleResizeStart(e, 'right')}
          className="card-resize-handle absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-active-item/25 z-20 transition"
        />
      )}

      {!isLodThreshold && (
        <div
          onMouseDown={(e) => handleResizeStart(e, 'corner')}
          className="card-resize-handle absolute right-0 bottom-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
          title="自由缩放"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M8 2L2 8M8 5L5 8M8 8H8.01" stroke="var(--middle-grey)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
