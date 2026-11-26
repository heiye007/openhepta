import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  MoreHorizontal,
  Trash2,
  Maximize2,
  ExternalLink,
  Edit3,
  FolderKanban,
  ArrowUpRight,
  StickyNote,
  FileText,
  Highlighter,
  Network,
  Paperclip,
  Calendar,
  Type,
  X,
} from 'lucide-react';
import type {
  Whiteboard,
  WhiteboardObject,
  WhiteboardStatsRow,
  WhiteboardChildItemSummary,
  WhiteboardObjectType,
} from '@shared/types';
import {
  HEPTA_CARD_PALETTE,
  HEPTA_SECTION_PALETTE,
  resolveCardBgColor,
  resolveSectionColors,
} from '@shared/palette';

export interface SubWhiteboardNodeProps {
  obj: WhiteboardObject;
  targetWhiteboard: Whiteboard | null;
  stats: WhiteboardStatsRow | undefined;
  subWhiteboardView: 'list' | 'preview';
  isLargeTextAtSmallZoom: boolean;
  zoom: number;
  isSelected: boolean;
  isDropTarget: boolean;
  isConnecting: boolean;
  isRenaming?: boolean;
  dimmed?: boolean;
  focusOpacity?: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onNavigate: (whiteboardId: string) => void;
  onOpenInNewWindow?: (whiteboardId: string) => void;
  onRename: (whiteboardId: string, objId: string, newName: string) => void;
  onFinishRename?: () => void;
  onColorChange: (objId: string, color: string) => void;
  onResizeRect: (
    objId: string,
    rect: { posX: number; posY: number; width: number; height: number }
  ) => void;
  onFitToContent: (objId: string, nextSize: { width?: number; height?: number }) => void;
  onChangeSubWhiteboardView?: (mode: 'list' | 'preview') => void;
  onDelete: (objId: string, isChild: boolean) => void;
  onStartConnect: (
    objId: string,
    side: 'top' | 'right' | 'bottom' | 'left',
    e: React.MouseEvent
  ) => void;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const SUB_WB_COLORS = [
  'white',
  'yellow',
  'red',
  'blue',
  'green',
  'black',
  'orange',
  'purple',
] as const;

const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function parseObjectJson(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function resolveConnectionStroke(styleJson: string): string {
  const parsed = parseObjectJson(styleJson);
  const stroke = parsed.strokeColor || parsed.color;
  if (typeof stroke === 'string' && stroke.trim()) {
    if (
      stroke.startsWith('var(') ||
      stroke.startsWith('#') ||
      stroke.startsWith('rgb') ||
      stroke.startsWith('hsl')
    ) {
      return stroke;
    }
    return `var(--connection-${stroke}, var(--active-item))`;
  }
  return 'var(--connection-blue, var(--active-item))';
}

function measureTitlePixelWidth(text: string): number {
  const label = text.trim() || 'Untitled Whiteboard';
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '600 18px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      return Math.ceil(ctx.measureText(label).width);
    }
  } catch {}
  return label.length * 11;
}

function measurePillPixelWidth(title: string): number {
  const label = title.trim() || 'Untitled';
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '500 13px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const textW = Math.ceil(ctx.measureText(label).width);
      return Math.max(80, Math.min(174, textW + 44));
    }
  } catch {}
  return Math.max(80, Math.min(174, label.length * 8 + 44));
}

function renderItemTypeIcon(objectType: WhiteboardObjectType, isChildWb?: boolean) {
  if (objectType === 'whiteboard_shortcut') {
    return isChildWb !== false ? (
      <FolderKanban size={14} className="shrink-0 text-active-item" />
    ) : (
      <ArrowUpRight size={14} className="shrink-0 text-active-item" />
    );
  }
  if (objectType === 'pdf' || objectType === 'epub') {
    return <FileText size={14} className="shrink-0 text-danger-item" />;
  }
  if (objectType === 'highlight') {
    return <Highlighter size={14} className="shrink-0 text-amber-500" />;
  }
  if (objectType === 'mindmap_node') {
    return <Network size={14} className="shrink-0 text-active-item" />;
  }
  if (objectType === 'media') {
    return <Paperclip size={14} className="shrink-0 text-middle-hard-grey" />;
  }
  if (objectType === 'journal') {
    return <Calendar size={14} className="shrink-0 text-emerald-500" />;
  }
  if (objectType === 'text') {
    return <Type size={14} className="shrink-0 text-middle-hard-grey" />;
  }
  return <StickyNote size={14} className="shrink-0 text-middle-hard-grey" />;
}

function SubWhiteboardMinimap({
  stats,
  innerW,
  innerH,
}: {
  stats: WhiteboardStatsRow | undefined;
  innerW: number;
  innerH: number;
}) {
  const objects = stats?.objects || [];
  const conns = stats?.connList || [];
  const cardColorMap = stats?.cardColorMap || {};
  const highlightColorMap = stats?.highlightColorMap || {};

  if (objects.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[13px] text-middle-grey select-none">
        Empty whiteboard
      </div>
    );
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const objMap = new Map<string, WhiteboardObject>();

  for (const item of objects) {
    objMap.set(item.id, item);
    minX = Math.min(minX, item.pos_x);
    minY = Math.min(minY, item.pos_y);
    maxX = Math.max(maxX, item.pos_x + Math.max(40, item.width));
    maxY = Math.max(maxY, item.pos_y + Math.max(24, item.height));
  }

  const contentW = Math.max(240, maxX - minX);
  const contentH = Math.max(160, maxY - minY);
  const padX = contentW * 0.08;
  const padY = contentH * 0.08;
  const boxX = minX - padX;
  const boxY = minY - padY;
  const boxW = contentW + padX * 2;
  const boxH = contentH + padY * 2;

  const safeW = Math.max(60, innerW);
  const safeH = Math.max(40, innerH);
  const scale = Math.min(safeW / boxW, safeH / boxH);
  const offsetX = (safeW - boxW * scale) / 2;
  const offsetY = (safeH - boxH * scale) / 2;

  const projectX = (wx: number) => offsetX + (wx - boxX) * scale;
  const projectY = (wy: number) => offsetY + (wy - boxY) * scale;
  const projectW = (ww: number) => Math.max(4, ww * scale);
  const projectH = (wh: number) => Math.max(3, wh * scale);

  const sections = objects.filter((o) => o.object_type === 'section');
  const nonSections = objects.filter((o) => o.object_type !== 'section');

  return (
    <div className="w-full h-full rounded-2xl bg-whiteboard-background/60 border border-light-grey/70 overflow-hidden relative">
      <svg
        viewBox={`0 0 ${safeW} ${safeH}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full block"
      >
        {sections.map((sec) => {
          const props = parseObjectJson(sec.properties_json);
          const colorKey = typeof props.color === 'string' ? props.color : 'white';
          const secColors = resolveSectionColors(colorKey);
          const sx = projectX(sec.pos_x);
          const sy = projectY(sec.pos_y);
          const sw = projectW(sec.width);
          const sh = projectH(sec.height);
          return (
            <rect
              key={sec.id}
              x={sx}
              y={sy}
              width={sw}
              height={sh}
              rx={Math.max(4, 10 * scale)}
              fill={secColors.bg}
              stroke={secColors.border}
              strokeWidth={1.5}
            />
          );
        })}

        {conns.map((conn) => {
          const src = objMap.get(conn.source_object_id);
          const dst = objMap.get(conn.target_object_id);
          if (!src || !dst) return null;
          const x1 = projectX(src.pos_x + src.width / 2);
          const y1 = projectY(src.pos_y + src.height / 2);
          const x2 = projectX(dst.pos_x + dst.width / 2);
          const y2 = projectY(dst.pos_y + dst.height / 2);
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={conn.id}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={resolveConnectionStroke(conn.style_json)}
              strokeWidth={1.5}
              strokeOpacity={0.85}
            />
          );
        })}

        {nonSections.map((item) => {
          const props = parseObjectJson(item.properties_json);
          const propColor = typeof props.color === 'string' ? props.color : null;
          const ix = projectX(item.pos_x);
          const iy = projectY(item.pos_y);
          const iw = projectW(item.width);
          const ih = projectH(item.height);
          const isSubWb =
            item.object_type === 'whiteboard_shortcut' || Boolean(props.isSubWhiteboard);

          if (item.object_type === 'highlight') {
            const hlColor =
              (item.target_id ? highlightColorMap[item.target_id] : null) ||
              propColor ||
              'yellow';
            return (
              <g key={item.id}>
                <rect
                  x={ix}
                  y={iy}
                  width={iw}
                  height={ih}
                  rx={Math.max(2, 6 * scale)}
                  fill="var(--bg-white)"
                  stroke="var(--border-grid)"
                  strokeWidth={1}
                />
                <rect
                  x={ix}
                  y={iy}
                  width={Math.max(2, iw * 0.08)}
                  height={ih}
                  rx={1}
                  fill={`var(--annotation-${hlColor}, #f5c542)`}
                />
              </g>
            );
          }

          if (isSubWb) {
            const subColors = resolveSectionColors(propColor || 'white');
            return (
              <g key={item.id}>
                <rect
                  x={ix}
                  y={iy}
                  width={iw}
                  height={ih}
                  rx={Math.max(4, 14 * scale)}
                  fill={subColors.bg}
                  stroke={subColors.border}
                  strokeWidth={1.75}
                />
                {iw >= 22 && ih >= 14 && (
                  <rect
                    x={ix + Math.min(8, iw * 0.12)}
                    y={iy + Math.min(8, ih * 0.16)}
                    width={Math.max(10, iw * 0.42)}
                    height={Math.max(3, Math.min(6, ih * 0.14))}
                    rx={2}
                    fill="var(--middle-grey)"
                    fillOpacity={0.55}
                  />
                )}
              </g>
            );
          }

          const cardColor =
            propColor || (item.target_id ? cardColorMap[item.target_id] : null) || 'white';
          const fill = resolveCardBgColor(cardColor);
          const pad = Math.min(6, iw * 0.12);
          const lineH = Math.max(2, Math.min(4.5, ih * 0.08));

          return (
            <g key={item.id}>
              <rect
                x={ix}
                y={iy}
                width={iw}
                height={ih}
                rx={Math.max(3, 8 * scale)}
                fill={fill}
                stroke="var(--middle-grey)"
                strokeOpacity={0.45}
                strokeWidth={1.25}
              />
              {iw >= 18 && ih >= 14 && (
                <rect
                  x={ix + pad}
                  y={iy + pad}
                  width={Math.max(8, (iw - pad * 2) * 0.62)}
                  height={lineH}
                  rx={lineH / 2}
                  fill="var(--text-color)"
                  fillOpacity={0.35}
                />
              )}
              {iw >= 22 && ih >= 26 && (
                <rect
                  x={ix + pad}
                  y={iy + pad + lineH * 2.2}
                  width={Math.max(10, (iw - pad * 2) * 0.85)}
                  height={Math.max(1.5, lineH * 0.75)}
                  rx={lineH / 2}
                  fill="var(--middle-grey)"
                  fillOpacity={0.35}
                />
              )}
              {iw >= 22 && ih >= 38 && (
                <rect
                  x={ix + pad}
                  y={iy + pad + lineH * 4.0}
                  width={Math.max(8, (iw - pad * 2) * 0.68)}
                  height={Math.max(1.5, lineH * 0.75)}
                  rx={lineH / 2}
                  fill="var(--middle-grey)"
                  fillOpacity={0.28}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const SubWhiteboardNode = React.memo(function SubWhiteboardNode({
  obj,
  targetWhiteboard,
  stats,
  subWhiteboardView,
  isLargeTextAtSmallZoom,
  zoom,
  isSelected,
  isDropTarget,
  isConnecting,
  isRenaming = false,
  dimmed = false,
  focusOpacity = 0.25,
  onMouseDown,
  onNavigate,
  onOpenInNewWindow,
  onRename,
  onFinishRename,
  onColorChange,
  onResizeRect,
  onFitToContent,
  onChangeSubWhiteboardView,
  onDelete,
  onStartConnect,
}: SubWhiteboardNodeProps) {
  const parsedProps = useMemo(() => parseObjectJson(obj.properties_json), [obj.properties_json]);
  const isChild = parsedProps.isChild !== false;
  const colorId = typeof parsedProps.color === 'string' ? parsedProps.color : 'white';
  const fallbackName =
    (typeof parsedProps.name === 'string' && parsedProps.name.trim()) ||
    (typeof parsedProps.title === 'string' && parsedProps.title.trim()) ||
    'Untitled Whiteboard';
  const targetId =
    obj.target_id ||
    (typeof parsedProps.subWhiteboardId === 'string' ? parsedProps.subWhiteboardId : '');
  const isDeletedTarget = !targetWhiteboard || targetWhiteboard.is_deleted === 1;
  const displayName = targetWhiteboard?.name || fallbackName;

  const [isHovered, setIsHovered] = useState(false);
  const [editingTitle, setEditingTitle] = useState(Boolean(isRenaming && isChild));
  const [draftTitle, setDraftTitle] = useState(displayName);
  const [showMenu, setShowMenu] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftTitle(displayName);
  }, [displayName]);

  useEffect(() => {
    if (isRenaming && isChild && !isDeletedTarget) {
      setEditingTitle(true);
      setDraftTitle(displayName);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [isRenaming, isChild, isDeletedTarget, displayName]);

  useEffect(() => {
    if (!showMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [showMenu]);

  const effectiveWidth = isChild && obj.height < 128 ? Math.max(obj.width, 640) : obj.width;
  const effectiveHeight = isChild ? (obj.height < 128 ? 420 : obj.height) : 128;
  const isCollapsed = !isChild || effectiveHeight <= 132;
  const isMacroLod =
    isLargeTextAtSmallZoom && Math.round(zoom * 100) <= 30 && !editingTitle && !isDeletedTarget;

  const sectionColors = useMemo(() => resolveSectionColors(colorId), [colorId]);
  const containerBg =
    colorId === 'white' ? 'var(--background-secondary)' : sectionColors.bg;
  const containerInsetBorder =
    colorId === 'white' ? 'var(--light-grey)' : sectionColors.border;

  const sortedItems = useMemo<WhiteboardChildItemSummary[]>(() => {
    if (stats?.itemSummaries && stats.itemSummaries.length > 0) {
      return [...stats.itemSummaries].sort((a, b) => {
        const aIsWb = a.objectType === 'whiteboard_shortcut' ? 1 : 0;
        const bIsWb = b.objectType === 'whiteboard_shortcut' ? 1 : 0;
        if (bIsWb !== aIsWb) return bIsWb - aIsWb;
        const cmp = naturalCollator.compare(a.title, b.title);
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      });
    }
    const rawObjects = (stats?.objects || []).filter((o) => o.object_type !== 'section');
    const built: WhiteboardChildItemSummary[] = [];
    for (const item of rawObjects) {
      const p = parseObjectJson(item.properties_json);
      const itemTitle =
        (typeof p.name === 'string' && p.name.trim()) ||
        (typeof p.title === 'string' && p.title.trim()) ||
        (typeof p.text === 'string' && p.text.trim()) ||
        '';
      if (!itemTitle) continue;
      const itemColor =
        (typeof p.color === 'string' && p.color) ||
        (item.target_id && stats?.cardColorMap?.[item.target_id]) ||
        'white';
      built.push({
        id: item.id,
        objectType: item.object_type,
        title: itemTitle,
        color: itemColor,
        isChildWhiteboard: p.isChild !== false,
      });
    }
    return built.sort((a, b) => {
      const aIsWb = a.objectType === 'whiteboard_shortcut' ? 1 : 0;
      const bIsWb = b.objectType === 'whiteboard_shortcut' ? 1 : 0;
      if (bIsWb !== aIsWb) return bIsWb - aIsWb;
      const cmp = naturalCollator.compare(a.title, b.title);
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });
  }, [stats]);

  const innerW = Math.max(120, effectiveWidth - 86);
  const innerH = Math.max(0, effectiveHeight - 138);
  const rows = Math.max(1, Math.floor((innerH + 12) / 60));
  const cols = Math.max(1, Math.floor((innerW + 16) / 96));
  const maxItems = Math.max(1, rows * cols);
  const hasOverflowItems = sortedItems.length > maxItems;
  const visibleItems = sortedItems.slice(0, maxItems);

  const commitRename = () => {
    setEditingTitle(false);
    const cleaned = draftTitle.trim() || displayName;
    setDraftTitle(cleaned);
    if (targetId && cleaned !== displayName) {
      onRename(targetId, obj.id, cleaned);
    }
    onFinishRename?.();
  };

  const handleFitToContent = () => {
    setShowMenu(false);
    if (!isChild || effectiveHeight <= 132) {
      const titleW = measureTitlePixelWidth(displayName);
      const nextWidth = Math.max(220, Math.min(1280, titleW + 184));
      onFitToContent(obj.id, { width: nextWidth });
      return;
    }

    if (subWhiteboardView === 'list') {
      if (sortedItems.length === 0) {
        onFitToContent(obj.id, { height: 220 });
        return;
      }
      let currentRowWidth = 0;
      let totalRows = 1;
      for (const item of sortedItems) {
        const pillW = measurePillPixelWidth(item.title);
        if (currentRowWidth === 0) {
          currentRowWidth = pillW;
        } else if (currentRowWidth + 16 + pillW <= innerW) {
          currentRowWidth += 16 + pillW;
        } else {
          totalRows += 1;
          currentRowWidth = pillW;
        }
      }
      const nextHeight = Math.max(180, totalRows * 60 - 12 + 138);
      onFitToContent(obj.id, { height: nextHeight });
      return;
    }

    onFitToContent(obj.id, { height: 420 });
  };

  const handleResizeStart = (direction: ResizeDirection, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = obj.pos_x;
    const startPosY = obj.pos_y;
    const startW = obj.width;
    const startH = effectiveHeight;
    const minW = 220;
    const minH = 128;

    const handleMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / Math.max(0.05, zoom);
      const dy = (moveEvent.clientY - startY) / Math.max(0.05, zoom);

      let nextX = startPosX;
      let nextY = startPosY;
      let nextW = startW;
      let nextH = startH;

      if (direction.includes('e')) {
        nextW = Math.max(minW, Math.round(startW + dx));
      }
      if (direction.includes('w')) {
        const maxDeltaX = startW - minW;
        const clampedDx = Math.min(dx, maxDeltaX);
        nextW = Math.max(minW, Math.round(startW - clampedDx));
        nextX = Math.round(startPosX + clampedDx);
      }

      if (isChild) {
        if (direction.includes('s')) {
          const rawH = Math.max(minH, Math.round(startH + dy));
          nextH = rawH <= 142 ? 128 : rawH;
        }
        if (direction.includes('n')) {
          const maxDeltaY = startH - minH;
          const clampedDy = Math.min(dy, maxDeltaY);
          const rawH = Math.max(minH, Math.round(startH - clampedDy));
          if (rawH <= 142) {
            nextH = 128;
            nextY = Math.round(startPosY + (startH - 128));
          } else {
            nextH = rawH;
            nextY = Math.round(startPosY + clampedDy);
          }
        }
      } else {
        nextH = 128;
      }

      onResizeRect(obj.id, {
        posX: nextX,
        posY: nextY,
        width: nextW,
        height: nextH,
      });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const lodFontSize = isCollapsed ? 28 : effectiveHeight >= 320 ? 40 : 32;
  const lodLineClamp = isCollapsed ? 2 : Math.max(2, Math.min(5, Math.floor(effectiveHeight / 90)));

  const resizeDirections: ResizeDirection[] = isChild
    ? ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
    : ['w', 'e'];

  const showAnchors = (isHovered || isSelected || isConnecting) && !editingTitle;

  return (
    <div
      data-whiteboard-id={obj.whiteboard_id}
      data-object-id={obj.id}
      data-whiteboard-object-id={obj.id}
      data-object-type="whiteboardInstance"
      data-whiteboard-object-type="whiteboardInstance"
      data-is-child={isChild ? 'true' : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('button') ||
          target.closest('input') ||
          target.closest('[data-resize-handle]') ||
          target.closest('[data-connect-port]') ||
          target.closest('[data-subwb-menu]')
        ) {
          return;
        }
        onMouseDown(e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isDeletedTarget && targetId) {
          onNavigate(targetId);
        }
      }}
      className={`pointer-events-auto select-none rounded-[28px] border-[3px] border-solid box-border flex flex-col ${
        isDropTarget ? 'scale-105' : ''
      }`}
      style={{
        position: 'absolute',
        left: obj.pos_x,
        top: obj.pos_y,
        width: effectiveWidth,
        height: effectiveHeight,
        zIndex: isDropTarget
          ? (obj.z_index || 10) + 120
          : isSelected || showMenu
          ? (obj.z_index || 10) + 25
          : obj.z_index || 10,
        backgroundColor: containerBg,
        borderColor: isDropTarget || isSelected ? 'var(--active-item)' : 'transparent',
        boxShadow: isDropTarget
          ? `inset 0 0 0 1.5px var(--active-item), 0 0 0 5px var(--middle-transparent-blue), var(--shadow-main)`
          : isSelected
          ? `inset 0 0 0 1px ${containerInsetBorder}, 0 0 0 2px var(--middle-transparent-blue), var(--shadow-main)`
          : `inset 0 0 0 1.5px ${containerInsetBorder}, var(--shadow-card)`,
        opacity: dimmed ? focusOpacity : 1,
        transform: isDropTarget ? 'scale(1.05)' : undefined,
        transition:
          'transform 200ms cubic-bezier(0.595, 0.235, 0.085, 1.245), border-color 150ms ease, box-shadow 150ms ease, opacity 150ms ease',
        cursor: 'grab',
      }}
    >
      {isDeletedTarget ? (
        <div className="relative w-full h-full flex items-center justify-center px-8 text-center">
          <span className="text-[15px] font-medium text-middle-grey">
            The original whiteboard is deleted.
          </span>
          <button
            type="button"
            aria-label="Remove deleted whiteboard instance"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(obj.id, false);
            }}
            className="absolute top-5 right-6 w-9 h-9 rounded-full bg-ultra-light-grey hover:bg-light-grey text-middle-hard-grey hover:text-danger-item flex items-center justify-center transition cursor-pointer"
            title="Remove deleted whiteboard instance"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <>
          <div
            className={`w-full h-full flex flex-col justify-between box-border ${
              isCollapsed ? 'px-10 justify-center' : 'px-10 pt-9 pb-9'
            } ${isMacroLod ? 'invisible' : ''}`}
          >
            <div className="flex items-center justify-between gap-3 shrink-0 min-h-[40px]">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isChild
                      ? 'bg-active-item/15 text-active-item'
                      : 'bg-ultra-light-grey text-middle-hard-grey border border-light-grey'
                  }`}
                >
                  {isChild ? <FolderKanban size={18} /> : <ArrowUpRight size={18} />}
                </div>

                {isChild && editingTitle ? (
                  <input
                    ref={inputRef}
                    type="text"
                    aria-label="Sub-whiteboard title input"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        commitRename();
                      } else if (e.key === 'Escape') {
                        setEditingTitle(false);
                        setDraftTitle(displayName);
                        onFinishRename?.();
                      }
                    }}
                    className="w-full bg-background-primary text-text-color text-[18px] font-semibold leading-tight px-2.5 py-1 rounded-lg border border-active-item outline-none"
                  />
                ) : (
                  <div
                    onClick={(e) => {
                      if (isChild && isSelected) {
                        e.stopPropagation();
                        setEditingTitle(true);
                        setDraftTitle(displayName);
                        setTimeout(() => {
                          inputRef.current?.focus();
                          inputRef.current?.select();
                        }, 0);
                      }
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (targetId) onNavigate(targetId);
                    }}
                    className="min-w-0 flex-1 flex items-center gap-2 cursor-pointer"
                    title={displayName}
                  >
                    <span className="text-[18px] font-semibold text-text-color truncate leading-snug">
                      {displayName}
                    </span>
                    {!isChild && (
                      <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-ultra-light-grey text-middle-grey border border-light-grey">
                        Shortcut
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div ref={menuRef} data-subwb-menu="true" className="relative shrink-0">
                <button
                  type="button"
                  data-whiteboard-instance-more-button=""
                  aria-label="Sub-whiteboard actions"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu((prev) => !prev);
                  }}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer ${
                    showMenu
                      ? 'bg-light-grey text-text-color opacity-100'
                      : isHovered || isSelected
                      ? 'hover:bg-light-grey text-middle-hard-grey opacity-100'
                      : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <MoreHorizontal size={18} />
                </button>

                {showMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-11 w-56 rounded-xl bg-menu-bg border border-light-grey shadow-main p-2 z-50 backdrop-blur-xl flex flex-col gap-1 text-text-color"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        if (targetId) onNavigate(targetId);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-light-grey text-[13px] font-medium text-left transition cursor-pointer"
                    >
                      <ExternalLink size={14} className="text-middle-grey" />
                      <span>{isChild ? 'Open' : 'Jump to'}</span>
                    </button>

                    {onOpenInNewWindow && targetId && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          onOpenInNewWindow(targetId);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-light-grey text-[13px] font-medium text-left transition cursor-pointer"
                      >
                        <ArrowUpRight size={14} className="text-middle-grey" />
                        <span>Open in new window</span>
                      </button>
                    )}

                    {isChild && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          setEditingTitle(true);
                          setDraftTitle(displayName);
                          setTimeout(() => {
                            inputRef.current?.focus();
                            inputRef.current?.select();
                          }, 0);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-light-grey text-[13px] font-medium text-left transition cursor-pointer"
                      >
                        <Edit3 size={14} className="text-middle-grey" />
                        <span>Rename</span>
                      </button>
                    )}

                    <div className="h-[1px] bg-light-grey my-1" />

                    <div className="px-2 py-1">
                      <div className="text-[11px] font-medium text-middle-grey mb-1.5">Color</div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {SUB_WB_COLORS.map((cId) => {
                          const pal =
                            HEPTA_SECTION_PALETTE.find((p) => p.id === cId) ||
                            HEPTA_SECTION_PALETTE[0];
                          const isCurrent = colorId === cId;
                          return (
                            <button
                              key={cId}
                              type="button"
                              aria-label={`Sub-whiteboard color ${cId}`}
                              onClick={() => {
                                onColorChange(obj.id, cId);
                                setShowMenu(false);
                              }}
                              className="h-6 rounded-md transition cursor-pointer"
                              style={{
                                backgroundColor: pal.border,
                                border: isCurrent
                                  ? '2px solid var(--active-item)'
                                  : '1px solid var(--light-grey)',
                              }}
                              title={pal.label}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {isChild && onChangeSubWhiteboardView && (
                      <>
                        <div className="h-[1px] bg-light-grey my-1" />
                        <div className="px-2 py-1">
                          <div className="text-[11px] font-medium text-middle-grey mb-1.5">
                            Sub-whiteboard view
                          </div>
                          <div className="grid grid-cols-2 gap-1">
                            {(['list', 'preview'] as const).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                aria-label={`Switch sub-whiteboard view to ${mode}`}
                                onClick={() => {
                                  onChangeSubWhiteboardView(mode);
                                  setShowMenu(false);
                                }}
                                className={`px-2 py-1 rounded-md text-[12px] font-medium transition cursor-pointer ${
                                  subWhiteboardView === mode
                                    ? 'bg-active-item text-white'
                                    : 'bg-ultra-light-grey text-middle-hard-grey hover:bg-light-grey'
                                }`}
                              >
                                {mode === 'list' ? 'List' : 'Preview'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="h-[1px] bg-light-grey my-1" />

                    <button
                      type="button"
                      aria-label="Fit sub-whiteboard to content"
                      onClick={handleFitToContent}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-light-grey text-[13px] font-medium text-left transition cursor-pointer"
                    >
                      <Maximize2 size={14} className="text-middle-grey" />
                      <span>Fit to content</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onDelete(obj.id, isChild);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-light-grey text-[13px] font-medium text-danger-item text-left transition cursor-pointer"
                    >
                      <Trash2 size={14} className="text-danger-item" />
                      <span>{isChild ? 'Delete' : 'Remove shortcut'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {isChild && !isCollapsed && (
              <div className="mt-5 flex-1 min-h-0 w-full overflow-hidden">
                {subWhiteboardView === 'preview' ? (
                  <SubWhiteboardMinimap stats={stats} innerW={innerW} innerH={innerH} />
                ) : sortedItems.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-[13px] text-middle-grey select-none">
                    {(stats?.totalObjects ?? 0) > 0 || stats?.hasOtherContent
                      ? 'Contains other content'
                      : 'Empty whiteboard'}
                  </div>
                ) : (
                  <div
                    className="w-full h-full flex flex-wrap content-start overflow-hidden"
                    style={{
                      columnGap: 16,
                      rowGap: 12,
                      maskImage: hasOverflowItems
                        ? 'linear-gradient(black calc(100% - 8px), transparent)'
                        : undefined,
                      WebkitMaskImage: hasOverflowItems
                        ? 'linear-gradient(black calc(100% - 8px), transparent)'
                        : undefined,
                    }}
                  >
                    {visibleItems.map((item) => {
                      const pillBg =
                        item.objectType === 'whiteboard_shortcut'
                          ? resolveSectionColors(item.color || 'white').border
                          : resolveCardBgColor(item.color || 'white');
                      const matchingCardPalette = HEPTA_CARD_PALETTE.find(
                        (p) => p.id === item.color
                      );
                      return (
                        <div
                          key={item.id}
                          title={item.title}
                          className="h-12 rounded-xl px-3.5 flex items-center gap-2 border border-light-grey/80 shadow-xs box-border"
                          style={{
                            minWidth: 80,
                            maxWidth: 174,
                            backgroundColor: matchingCardPalette
                              ? matchingCardPalette.cssVar
                              : pillBg,
                          }}
                        >
                          {renderItemTypeIcon(item.objectType, item.isChildWhiteboard)}
                          <span className="text-[13px] font-medium text-text-color truncate">
                            {item.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {isMacroLod && (
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center pointer-events-none">
              <div
                className="font-bold text-text-color break-words overflow-hidden"
                style={{
                  fontSize: lodFontSize,
                  lineHeight: 1.25,
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: lodLineClamp,
                }}
              >
                {displayName}
              </div>
            </div>
          )}
        </>
      )}

      {showAnchors &&
        (['top', 'right', 'bottom', 'left'] as const).map((side) => {
          const posStyle: React.CSSProperties =
            side === 'top'
              ? { top: -6, left: '50%', transform: 'translateX(-50%)' }
              : side === 'bottom'
              ? { bottom: -6, left: '50%', transform: 'translateX(-50%)' }
              : side === 'left'
              ? { left: -6, top: '50%', transform: 'translateY(-50%)' }
              : { right: -6, top: '50%', transform: 'translateY(-50%)' };
          return (
            <div
              key={side}
              data-connect-port={side}
              onMouseDown={(e) => {
                e.stopPropagation();
                onStartConnect(obj.id, side, e);
              }}
              style={posStyle}
              className="absolute w-3.5 h-3.5 rounded-full bg-background-primary border-2 border-active-item hover:scale-125 transition-transform cursor-crosshair z-30"
            />
          );
        })}

      {resizeDirections.map((dir) => {
        const handleStyle: React.CSSProperties =
          dir === 'n'
            ? { top: -4, left: 20, right: 20, height: 8, cursor: 'ns-resize' }
            : dir === 's'
            ? { bottom: -4, left: 20, right: 20, height: 8, cursor: 'ns-resize' }
            : dir === 'e'
            ? { right: -4, top: 20, bottom: 20, width: 8, cursor: 'ew-resize' }
            : dir === 'w'
            ? { left: -4, top: 20, bottom: 20, width: 8, cursor: 'ew-resize' }
            : dir === 'ne'
            ? { top: -5, right: -5, width: 14, height: 14, cursor: 'nesw-resize' }
            : dir === 'nw'
            ? { top: -5, left: -5, width: 14, height: 14, cursor: 'nwse-resize' }
            : dir === 'se'
            ? { bottom: -5, right: -5, width: 14, height: 14, cursor: 'nwse-resize' }
            : { bottom: -5, left: -5, width: 14, height: 14, cursor: 'nesw-resize' };

        return (
          <div
            key={dir}
            data-resize-handle={dir}
            onMouseDown={(e) => handleResizeStart(dir, e)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleFitToContent();
            }}
            style={handleStyle}
            className="absolute z-20"
          />
        );
      })}
    </div>
  );
});
