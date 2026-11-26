import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  BookOpen,
  Crosshair,
  Trash2,
  ExternalLink,
  Highlighter,
} from 'lucide-react';
import type { DocumentRecord, WhiteboardObject } from '@shared/types';

export interface DocumentNodeProps {
  object: WhiteboardObject;
  document?: DocumentRecord | null;
  highlightCount?: number;
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
  onOpenDocument?: (documentId: string) => void;
  onLocate?: (id: string) => void;
}

export function DocumentNode({
  object,
  document,
  highlightCount = 0,
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
  onLocate,
}: DocumentNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [coverError, setCoverError] = useState(false);

  useEffect(() => {
    setCoverError(false);
  }, [document?.cover_reference_id]);

  let parsedProps: Record<string, string | undefined> = {};
  try {
    if (object.properties_json) parsedProps = JSON.parse(object.properties_json);
  } catch {}

  const docType: 'pdf' | 'epub' =
    document?.doc_type === 'epub' || object.object_type === 'epub' ? 'epub' : 'pdf';
  const docTitle = document?.title || parsedProps.title || (docType === 'pdf' ? 'Untitled PDF' : 'Untitled EPUB');
  const docId = document?.id || object.target_id || '';
  const totalPages = document?.total_pages ?? 0;

  let progressLabel = docType === 'pdf' ? 'PDF Document' : 'EPUB Book';
  try {
    const pos = document?.last_position_json ? JSON.parse(document.last_position_json) : {};
    if (docType === 'pdf') {
      if (pos.page && totalPages > 0) {
        progressLabel = `p. ${pos.page} / ${totalPages}`;
      } else if (totalPages > 0) {
        progressLabel = `${totalPages} pages`;
      }
    } else if (pos.chapterTitle) {
      progressLabel = pos.chapterTitle;
    } else if (typeof pos.percentage === 'number') {
      progressLabel = `${Math.round(pos.percentage * 100)}%`;
    }
  } catch {}

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
      const newW = Math.max(260, resizeStartPosRef.current.width + dx);
      const newH =
        mode === 'corner'
          ? Math.max(320, resizeStartPosRef.current.height + dy)
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

  const coverUrl =
    document?.cover_reference_id && !coverError
      ? `hepta-preview://${document.cover_reference_id}`
      : null;

  return (
    <div
      onClick={(e) => onSelect(object.id, e)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (docId && onOpenDocument) onOpenDocument(docId);
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-whiteboard-id={object.whiteboard_id}
      data-object-id={object.id}
      data-object-type={docType}
      className="group relative select-none"
      style={{
        position: 'absolute',
        left: object.pos_x,
        top: object.pos_y,
        width: object.width,
        height: object.height,
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
          className="absolute z-30 top-2 right-2 flex items-center rounded-md bg-menu-bg/95 backdrop-blur-md border border-light-grey shadow-card overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {onLocate && (
            <>
              <button
                onClick={() => onLocate(object.id)}
                className="p-1.5 hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition"
                title="在白板中央定位"
              >
                <Crosshair size={13} />
              </button>
              <div className="w-px h-3.5 bg-light-grey" />
            </>
          )}
          {docId && onOpenDocument && (
            <>
              <button
                onClick={() => onOpenDocument(docId)}
                className="px-2 py-1 hover:bg-light-grey text-active-item text-[11px] font-medium flex items-center gap-1 transition"
                title="在阅读器中打开 (Open Reader)"
              >
                <ExternalLink size={12} />
                <span>Open</span>
              </button>
              <div className="w-px h-3.5 bg-light-grey" />
            </>
          )}
          <button
            onClick={() => onDelete(object.id)}
            className="p-1.5 hover:bg-danger-item/10 text-middle-hard-grey hover:text-danger-item transition"
            title="从白板移除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 rounded-[11px] overflow-hidden cursor-grab">
        {isLodThreshold ? (
          <div className="flex-1 p-5 flex flex-col justify-between bg-background-secondary">
            <span
              className={`self-start px-2 py-0.5 rounded text-xs font-bold uppercase ${
                docType === 'pdf'
                  ? 'bg-danger-item/15 text-danger-item'
                  : 'bg-active-item/15 text-active-item'
              }`}
            >
              {docType}
            </span>
            <div className="text-[28px] font-bold leading-snug text-text-color line-clamp-4">
              {docTitle}
            </div>
            <div className="text-sm text-middle-grey">{progressLabel}</div>
          </div>
        ) : (
          <>
            <div className="relative flex-1 min-h-0 bg-background-primary overflow-hidden flex items-center justify-center border-b border-light-grey p-2">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={docTitle}
                  onError={() => setCoverError(true)}
                  className="max-w-full max-h-full w-auto h-full object-contain rounded-sm shadow-sm pointer-events-none select-none"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div
                    className={`w-16 h-20 rounded-xl border border-light-grey shadow-card flex flex-col items-center justify-center gap-1.5 ${
                      docType === 'pdf'
                        ? 'bg-danger-item/10 text-danger-item'
                        : 'bg-active-item/10 text-active-item'
                    }`}
                  >
                    {docType === 'pdf' ? <FileText size={28} /> : <BookOpen size={28} />}
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {docType}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-middle-hard-grey line-clamp-2 max-w-[260px]">
                    {docTitle}
                  </div>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3 pointer-events-none">
                {docId && onOpenDocument && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDocument(docId);
                    }}
                    className="pointer-events-auto px-3 py-1 rounded-full bg-background-secondary/95 border border-light-grey shadow-main text-xs font-semibold text-text-color hover:text-active-item flex items-center gap-1.5 transition"
                  >
                    <BookOpen size={12} className="text-active-item" />
                    <span>Open Reader</span>
                  </button>
                )}
              </div>
            </div>

            <div className="px-3.5 py-2.5 bg-background-secondary flex flex-col gap-1.5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[15px] font-semibold text-text-color truncate"
                  title={docTitle}
                >
                  {docTitle}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    docType === 'pdf'
                      ? 'bg-danger-item/15 text-danger-item'
                      : 'bg-active-item/15 text-active-item'
                  }`}
                >
                  {docType}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-middle-grey">
                <span className="truncate">{progressLabel}</span>
                {highlightCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ultra-light-grey text-middle-hard-grey shrink-0">
                    <Highlighter size={10} />
                    <span>{highlightCount}</span>
                  </span>
                )}
              </div>
            </div>
          </>
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
