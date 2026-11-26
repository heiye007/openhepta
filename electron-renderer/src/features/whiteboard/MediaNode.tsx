import React, { useRef } from 'react';
import {
  Image as ImageIcon,
  Film,
  Music,
  Paperclip,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import type { WhiteboardObject } from '@shared/types';

export type WhiteboardMediaKind = 'image' | 'video' | 'audio' | 'file';

export interface MediaNodeProps {
  object: WhiteboardObject;
  scale: number;
  isSelected: boolean;
  isDimmed?: boolean;
  dimmedOpacity?: number;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onUpdateSize: (id: string, width: number, height: number) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onOpenExternal?: (referenceId: string) => void;
  onStartConnect?: (
    id: string,
    anchor: 'top' | 'bottom' | 'left' | 'right',
    point: { x: number; y: number }
  ) => void;
}

export function detectMediaKind(fileName: string): WhiteboardMediaKind {
  const lower = fileName.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/.test(lower)) return 'image';
  if (/\.(mp4|webm|mov|m4v|mkv|ogv)$/.test(lower)) return 'video';
  if (/\.(mp3|wav|m4a|ogg|flac|aac|opus)$/.test(lower)) return 'audio';
  return 'file';
}

function parseMediaProps(raw?: string | null): {
  name: string;
  mediaKind: WhiteboardMediaKind;
  aspectRatio?: number;
} {
  try {
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Attachment';
      const explicitKind = parsed.mediaKind;
      const mediaKind: WhiteboardMediaKind =
        explicitKind === 'image' ||
        explicitKind === 'video' ||
        explicitKind === 'audio' ||
        explicitKind === 'file'
          ? explicitKind
          : detectMediaKind(name);
      const aspectRatio =
        typeof parsed.aspectRatio === 'number' && Number.isFinite(parsed.aspectRatio) && parsed.aspectRatio > 0
          ? parsed.aspectRatio
          : undefined;
      return { name, mediaKind, aspectRatio };
    }
  } catch {
  }
  return { name: 'Attachment', mediaKind: 'file' };
}

export function MediaNode({
  object,
  scale,
  isSelected,
  isDimmed = false,
  dimmedOpacity = 0.25,
  onUpdatePosition,
  onDragEnd,
  onUpdateSize,
  onDelete,
  onSelect,
  onOpenExternal,
  onStartConnect,
}: MediaNodeProps) {
  const { name, mediaKind, aspectRatio } = parseMediaProps(object.properties_json);
  const fileUrl = object.target_id
    ? `hepta-file://${encodeURIComponent(object.target_id)}`
    : '';
  const isLod = Math.round(scale * 100) <= 30;

  const dragRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    objX: 0,
    objY: 0,
    curX: 0,
    curY: 0,
  });

  const handleDragMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, video, audio')) return;
    e.stopPropagation();
    onSelect(object.id, e);

    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      objX: object.pos_x,
      objY: object.pos_y,
      curX: object.pos_x,
      curY: object.pos_y,
    };

    const handleMove = (mv: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = (mv.clientX - dragRef.current.startX) / scale;
      const dy = (mv.clientY - dragRef.current.startY) / scale;
      const nx = dragRef.current.objX + dx;
      const ny = dragRef.current.objY + dy;
      dragRef.current.curX = nx;
      dragRef.current.curY = ny;
      onUpdatePosition(object.id, nx, ny);
    };

    const handleUp = () => {
      if (dragRef.current.active) {
        dragRef.current.active = false;
        onDragEnd?.(object.id, dragRef.current.curX, dragRef.current.curY);
      }
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const initW = object.width;
    const initH = object.height;
    const ratio = mediaKind === 'image' ? aspectRatio ?? initW / Math.max(1, initH) : null;

    const handleMove = (mv: MouseEvent) => {
      const dx = (mv.clientX - startX) / scale;
      const dy = (mv.clientY - startY) / scale;
      const nextW = Math.max(160, Math.round(initW + dx));
      const nextH = ratio
        ? Math.max(100, Math.round(nextW / ratio))
        : Math.max(mediaKind === 'audio' ? 96 : 120, Math.round(initH + dy));
      onUpdateSize(object.id, nextW, nextH);
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const renderConnectAnchors = () => {
    if (!onStartConnect) return null;
    return (['top', 'bottom', 'left', 'right'] as const).map((anchor) => {
      const posClass =
        anchor === 'top'
          ? '-top-1.5 left-1/2 -translate-x-1/2'
          : anchor === 'bottom'
          ? '-bottom-1.5 left-1/2 -translate-x-1/2'
          : anchor === 'left'
          ? '-left-1.5 top-1/2 -translate-y-1/2'
          : '-right-1.5 top-1/2 -translate-y-1/2';
      return (
        <div
          key={anchor}
          onMouseDown={(e) => {
            e.stopPropagation();
            const pt =
              anchor === 'top'
                ? { x: object.pos_x + object.width / 2, y: object.pos_y }
                : anchor === 'bottom'
                ? { x: object.pos_x + object.width / 2, y: object.pos_y + object.height }
                : anchor === 'left'
                ? { x: object.pos_x, y: object.pos_y + object.height / 2 }
                : { x: object.pos_x + object.width, y: object.pos_y + object.height / 2 };
            onStartConnect(object.id, anchor, pt);
          }}
          className={`absolute ${posClass} w-3 h-3 rounded-full bg-background-primary border-2 border-active-item opacity-0 group-hover/media:opacity-100 hover:scale-125 transition-all cursor-crosshair z-30 shadow-sm`}
        />
      );
    });
  };

  const extLabel = name.includes('.') ? name.split('.').pop()?.toUpperCase() || 'FILE' : 'FILE';

  return (
    <div
      data-whiteboard-id={object.whiteboard_id}
      data-object-id={object.id}
      data-object-type="media"
      data-media-kind={mediaKind}
      aria-label={`Media asset: ${name}`}
      onMouseDown={handleDragMouseDown}
      style={{
        transform: `translate3d(${object.pos_x}px, ${object.pos_y}px, 0)`,
        width: object.width,
        height: object.height,
        zIndex: isSelected ? 22 : object.z_index || 10,
        opacity: isDimmed ? dimmedOpacity : 1,
        boxShadow: isSelected
          ? '0 0 0 2px var(--active-item), var(--shadow-main)'
          : 'var(--shadow-card)',
      }}
      className={`group/media pointer-events-auto select-none absolute top-0 left-0 rounded-xl border transition-shadow duration-150 cursor-grab active:cursor-grabbing ${
        mediaKind === 'image' ? 'bg-background-secondary/80' : 'bg-background-primary'
      } ${isSelected ? 'border-active-item' : 'border-light-grey'}`}
    >
      {renderConnectAnchors()}

      {mediaKind === 'image' ? (
        <div className="relative w-full h-full rounded-xl overflow-hidden flex items-center justify-center">
          {fileUrl && !isLod ? (
            <img
              src={fileUrl}
              alt={name}
              draggable={false}
              className="w-full h-full object-contain pointer-events-none"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-middle-grey p-3">
              <ImageIcon size={24} />
              <span className="text-xs truncate max-w-full">{name}</span>
            </div>
          )}

          <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 px-2 py-1 rounded-lg bg-black/60 text-white text-[11px] opacity-0 group-hover/media:opacity-100 transition-opacity">
            <span className="truncate font-medium">{name}</span>
            <div className="flex items-center gap-1 shrink-0">
              {object.target_id && onOpenExternal && (
                <button
                  type="button"
                  aria-label="Open media externally"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenExternal(object.target_id!);
                  }}
                  className="p-1 rounded hover:bg-white/20 cursor-pointer"
                  title="Open externally"
                >
                  <ExternalLink size={12} />
                </button>
              )}
              <button
                type="button"
                aria-label="Delete media"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(object.id);
                }}
                className="p-1 rounded hover:bg-danger-item/80 cursor-pointer"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      ) : mediaKind === 'video' ? (
        <div className="w-full h-full rounded-xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-light-grey bg-background-secondary shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <Film size={14} className="text-active-item shrink-0" />
              <span className="text-xs font-semibold text-text-color truncate">{name}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {object.target_id && onOpenExternal && (
                <button
                  type="button"
                  aria-label="Open video externally"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenExternal(object.target_id!);
                  }}
                  className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color cursor-pointer"
                  title="Open externally"
                >
                  <ExternalLink size={12} />
                </button>
              )}
              <button
                type="button"
                aria-label="Delete video"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(object.id);
                }}
                className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-danger-item cursor-pointer"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 bg-black flex items-center justify-center">
            {fileUrl && !isLod ? (
              <video
                src={fileUrl}
                controls
                preload="metadata"
                className="w-full h-full object-contain"
              />
            ) : (
              <Film size={28} className="text-white/60" />
            )}
          </div>
        </div>
      ) : mediaKind === 'audio' ? (
        <div className="w-full h-full rounded-xl overflow-hidden flex flex-col justify-between p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-active-item/15 text-active-item flex items-center justify-center shrink-0">
                <Music size={14} />
              </div>
              <span className="text-xs font-semibold text-text-color truncate">{name}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {object.target_id && onOpenExternal && (
                <button
                  type="button"
                  aria-label="Open audio externally"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenExternal(object.target_id!);
                  }}
                  className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color cursor-pointer"
                  title="Open externally"
                >
                  <ExternalLink size={12} />
                </button>
              )}
              <button
                type="button"
                aria-label="Delete audio"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(object.id);
                }}
                className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-danger-item cursor-pointer"
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {fileUrl && !isLod && (
            <audio src={fileUrl} controls preload="metadata" className="w-full h-8" />
          )}
        </div>
      ) : (
        <div className="w-full h-full rounded-xl overflow-hidden flex flex-col justify-between p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-ultra-light-grey border border-light-grey flex items-center justify-center shrink-0">
                <Paperclip size={15} className="text-active-item" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-text-color truncate">{name}</div>
                <div className="text-[10px] font-mono text-middle-grey">{extLabel}</div>
              </div>
            </div>
            <button
              type="button"
              aria-label="Delete attachment"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(object.id);
              }}
              className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-danger-item cursor-pointer shrink-0"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>
          {object.target_id && onOpenExternal && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenExternal(object.target_id!);
              }}
              className="mt-2 w-full py-1.5 rounded-lg bg-ultra-light-grey hover:bg-light-grey border border-light-grey text-xs text-active-item font-medium transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <ExternalLink size={12} />
              <span>Open file</span>
            </button>
          )}
        </div>
      )}

      <div
        onMouseDown={handleResizeMouseDown}
        className="absolute bottom-1 right-1 w-3.5 h-3.5 cursor-nwse-resize opacity-0 group-hover/media:opacity-100 transition-opacity flex items-end justify-end z-30"
        title="Resize"
      >
        <div className="w-2 h-2 border-r-2 border-b-2 border-active-item rounded-br-sm" />
      </div>
    </div>
  );
}
