import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ChevronRight,
  MoreHorizontal,
  PanelRight,
  Crosshair,
  Trash2,
  Palette,
  Link as LinkIcon,
  Link2,
  Maximize2,
  Check,
  FoldVertical,
  UnfoldVertical,
  Copy,
  Layers,
} from 'lucide-react';
import { CardEditor } from '../../primitives/card-editor';
import type { WhiteboardObject } from '@shared/types';
import { HEPTA_CARD_PALETTE, resolveCardBgColor } from '@shared/palette';

export { HEPTA_CARD_PALETTE, resolveCardBgColor };

export interface CardTagBadge {
  id: string;
  name: string;
  color?: string | null;
}

export interface WhiteboardCardNodeProps {
  object: WhiteboardObject;
  title: string;
  contentText?: string;
  contentJson?: string;
  cards?: Array<{ id: string; title: string; color?: string | null }>;
  tags?: CardTagBadge[];
  whiteboardCount?: number;
  backlinkCount?: number;
  isSelected: boolean;
  isSingleSelected?: boolean;
  scale: number;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onUpdateSize: (id: string, width: number, height: number) => void;
  onUpdateRect?: (id: string, x: number, y: number, width: number, height: number) => void;
  onUpdateTitle: (targetId: string, title: string) => void;
  onUpdateContent: (targetId: string, content: { json: string; text: string }) => void;
  onDelete: (id: string) => void;
  onDeletePermanently?: (targetId: string) => void;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onUpdateColor?: (id: string, color: string) => void;
  onUpdateProperties?: (id: string, propertiesJson: string) => void;
  onStartConnect: (id: string, anchor: 'top' | 'bottom' | 'left' | 'right', point: { x: number; y: number }) => void;
  onOpenDrawer?: (targetId: string) => void;
  onOpenFullCard?: (targetId: string) => void;
  onDuplicate?: (id: string) => void;
  onLocateCard?: (id: string) => void;
  isLargeTextAtSmallZoom?: boolean;
  previewMode?: 'static' | 'markdown';
  isFullTitleFoldedCardMode?: boolean;
  isDimmed?: boolean;
  dimmedOpacity?: number;
  showTagsAndProperties?: boolean;
}

export function WhiteboardCardNode({
  object,
  title,
  contentText = '',
  contentJson,
  cards,
  tags = [],
  whiteboardCount = 1,
  backlinkCount = 0,
  isSelected,
  isSingleSelected = false,
  scale,
  onUpdatePosition,
  onDragEnd,
  onUpdateSize,
  onUpdateRect,
  onUpdateTitle,
  onUpdateContent,
  onDelete,
  onDeletePermanently,
  onSelect,
  onUpdateColor,
  onUpdateProperties,
  onStartConnect,
  onOpenDrawer,
  onOpenFullCard,
  onDuplicate,
  onLocateCard,
  isLargeTextAtSmallZoom = true,
  previewMode = 'markdown',
  isFullTitleFoldedCardMode = false,
  isDimmed = false,
  dimmedOpacity = 0.25,
  showTagsAndProperties = true,
}: WhiteboardCardNodeProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingBody, setIsEditingBody] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(title);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMiniColorPicker, setShowMiniColorPicker] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);
  const [isBodyOverflowing, setIsBodyOverflowing] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const cardRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentTitle(title);
  }, [title]);

  useEffect(() => {
    if (!isSelected && isEditingBody) {
      setIsEditingBody(false);
    }
    if (!isSelected && showMiniColorPicker) {
      setShowMiniColorPicker(false);
    }
  }, [isSelected, isEditingBody, showMiniColorPicker]);

  useEffect(() => {
    const el = bodyScrollRef.current;
    if (!el) return;
    const checkOverflow = () => {
      setIsBodyOverflowing(el.scrollHeight > el.clientHeight + 4);
    };
    checkOverflow();
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => ro.disconnect();
  }, [object.width, object.height, contentText, contentJson, isEditingBody]);

  const parsedProps = useMemo(() => {
    try {
      return object.properties_json ? JSON.parse(object.properties_json) : {};
    } catch {
      return {};
    }
  }, [object.properties_json]);

  const isFolded = parsedProps.isFolded ?? false;

  const cardColor = useMemo(() => {
    return resolveCardBgColor(parsedProps.color || 'white');
  }, [parsedProps.color]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
        setConfirmPermanentDelete(false);
      }
    };
    if (showMoreMenu) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  const isLodThreshold = Math.round(scale * 100) <= 30;
  const isLargeTextMode = isLodThreshold && isLargeTextAtSmallZoom;

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0, objX: 0, objY: 0, currentX: 0, currentY: 0 });
  const latestCallbacksRef = useRef({
    onUpdatePosition,
    onDragEnd,
    onUpdateSize,
    onUpdateRect,
    scale,
  });
  latestCallbacksRef.current = {
    onUpdatePosition,
    onDragEnd,
    onUpdateSize,
    onUpdateRect,
    scale,
  };

  const isResizingRef = useRef(false);
  const resizeStartPosRef = useRef({
    x: 0,
    y: 0,
    objX: 0,
    objY: 0,
    width: 0,
    height: 0,
    mode: 'corner' as 'left' | 'right' | 'corner',
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('.card-anchor') ||
      target.closest('.card-resize-handle') ||
      target.closest('.card-popover-menu') ||
      target.closest('.card-mini-toolbar') ||
      (isEditingBody && target.closest('.ProseMirror'))
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
      const curScale = latestCallbacksRef.current.scale;
      const dx = (moveEvent.clientX - dragStartPosRef.current.x) / curScale;
      const dy = (moveEvent.clientY - dragStartPosRef.current.y) / curScale;
      const nextX = dragStartPosRef.current.objX + dx;
      const nextY = dragStartPosRef.current.objY + dy;
      dragStartPosRef.current.currentX = nextX;
      dragStartPosRef.current.currentY = nextY;
      latestCallbacksRef.current.onUpdatePosition(object.id, nextX, nextY);
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        latestCallbacksRef.current.onDragEnd?.(
          object.id,
          dragStartPosRef.current.currentX,
          dragStartPosRef.current.currentY
        );
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (e: React.MouseEvent, mode: 'left' | 'right' | 'corner') => {
    e.stopPropagation();
    isResizingRef.current = true;
    resizeStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      objX: object.pos_x,
      objY: object.pos_y,
      width: object.width,
      height: object.height,
      mode,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = (moveEvent.clientX - resizeStartPosRef.current.x) / scale;
      const dy = (moveEvent.clientY - resizeStartPosRef.current.y) / scale;

      if (mode === 'left') {
        const maxDx = resizeStartPosRef.current.width - 280;
        const clampedDx = Math.min(dx, maxDx);
        const newW = resizeStartPosRef.current.width - clampedDx;
        const newX = resizeStartPosRef.current.objX + clampedDx;
        if (onUpdateRect) {
          onUpdateRect(object.id, newX, resizeStartPosRef.current.objY, newW, resizeStartPosRef.current.height);
        } else {
          onUpdatePosition(object.id, newX, resizeStartPosRef.current.objY);
          onUpdateSize(object.id, newW, resizeStartPosRef.current.height);
        }
        return;
      }

      const newW = Math.max(280, resizeStartPosRef.current.width + dx);
      let newH = resizeStartPosRef.current.height;
      if (mode === 'corner' && !isFolded) {
        newH = Math.max(160, resizeStartPosRef.current.height + dy);
      }

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

  const handleAnchorMouseDown = (anchor: 'top' | 'bottom' | 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    let point = { x: object.pos_x + object.width / 2, y: object.pos_y };
    if (anchor === 'bottom') point = { x: object.pos_x + object.width / 2, y: object.pos_y + object.height };
    if (anchor === 'left') point = { x: object.pos_x, y: object.pos_y + object.height / 2 };
    if (anchor === 'right') point = { x: object.pos_x + object.width, y: object.pos_y + object.height / 2 };

    onStartConnect(object.id, anchor, point);
  };

  const handleToggleFold = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextFolded = !isFolded;
    const nextProps = { ...parsedProps, isFolded: nextFolded };
    if (nextFolded) {
      nextProps.previousHeight = object.height > 46 ? object.height : 720;
      onUpdateSize(object.id, object.width, 46);
    } else {
      const restoreHeight = parsedProps.previousHeight || 720;
      onUpdateSize(object.id, object.width, restoreHeight);
    }
    onUpdateProperties?.(object.id, JSON.stringify(nextProps));
  };

  const handleCopyCardLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = `hepta://cards/${object.target_id || object.id}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleFitToContent = () => {
    setShowMoreMenu(false);
    if (isFolded) {
      handleToggleFold();
    }
    const lines = (contentText || '').split('\n').length;
    const estHeight = Math.min(1080, Math.max(320, 100 + lines * 24));
    onUpdateSize(object.id, object.width, estHeight);
  };

  const activePaletteId = parsedProps.color || 'white';
  const cardBorderStyle = isSelected
    ? '1px solid var(--active-item)'
    : activePaletteId === 'white'
    ? '1px solid var(--light-grey)'
    : '1px solid rgba(0, 0, 0, 0.08)';

  const cardShadowStyle = isSelected
    ? '0 0 0 2px var(--active-item), var(--shadow-main)'
    : isHovered
    ? '0 6px 18px rgba(0, 0, 0, 0.09), var(--shadow-card)'
    : 'var(--shadow-card)';

  const resolvedEditorInitialContent = useMemo(() => {
    const trimmedJson = (contentJson || '').trim();
    if (trimmedJson.startsWith('{') && /"type"\s*:\s*"doc"/.test(trimmedJson)) {
      return trimmedJson;
    }
    return contentText;
  }, [contentJson, contentText]);

  const visibleTags = showTagsAndProperties ? tags : [];
  const hasMetadataFooter = !isFolded && !isLodThreshold && (visibleTags.length > 0 || backlinkCount > 0 || whiteboardCount > 1);

  return (
    <div
      ref={cardRootRef}
      onClick={(e) => onSelect(object.id, e)}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-whiteboard-id={object.whiteboard_id}
      data-object-id={object.id}
      data-object-type="card"
      data-is-editing={isEditingTitle || isEditingBody ? 'true' : 'false'}
      aria-label={`Card: ${currentTitle || 'Untitled'}`}
      className="group relative select-none"
      style={{
        position: 'absolute',
        left: object.pos_x,
        top: object.pos_y,
        width: object.width,
        height: isFolded ? (isFullTitleFoldedCardMode ? 'auto' : 46) : object.height,
        minHeight: isFolded ? 46 : undefined,
        zIndex: isSelected ? 10 : isHovered ? 5 : object.z_index,
        pointerEvents: 'auto',
        background: cardColor,
        borderRadius: 12,
        boxShadow: cardShadowStyle,
        border: cardBorderStyle,
        color: 'var(--text-color)',
        display: 'flex',
        flexDirection: 'column',
        overflow: showMoreMenu || isSingleSelected ? 'visible' : 'hidden',
        opacity: isDimmed ? dimmedOpacity : 1,
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.15s ease',
      }}
    >
      {isSingleSelected && !isLodThreshold && !isEditingTitle && (
        <div
          className="card-mini-toolbar absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 flex items-center gap-0.5 px-1.5 py-1 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-light-grey shadow-main z-50 text-text-color"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex items-center">
            <button
              onClick={() => setShowMiniColorPicker((prev) => !prev)}
              className={`p-1.5 rounded-lg transition flex items-center gap-1 ${
                showMiniColorPicker ? 'bg-light-grey' : 'hover:bg-light-grey'
              }`}
              title="切换卡片颜色"
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-light-grey shadow-sm"
                style={{ backgroundColor: cardColor }}
              />
            </button>
            {showMiniColorPicker && (
              <div className="absolute bottom-full left-0 mb-2 p-1.5 rounded-xl bg-menu-bg border border-light-grey shadow-main flex items-center gap-1.5 z-50">
                {HEPTA_CARD_PALETTE.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      const nextProps = { ...parsedProps, color: c.id };
                      onUpdateColor?.(object.id, c.id);
                      onUpdateProperties?.(object.id, JSON.stringify(nextProps));
                      setShowMiniColorPicker(false);
                    }}
                    className={`w-5 h-5 rounded-full border transition hover:scale-110 flex items-center justify-center ${
                      activePaletteId === c.id ? 'border-active-item ring-1 ring-active-item' : 'border-light-grey'
                    }`}
                    style={{ backgroundColor: c.cssVar }}
                    title={c.label}
                  >
                    {activePaletteId === c.id && <Check size={10} className="text-middle-hard-grey" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-light-grey mx-0.5" />

          {object.target_id && onOpenDrawer && (
            <button
              onClick={() => onOpenDrawer(object.target_id!)}
              className="p-1.5 rounded-lg hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition"
              title="在右侧引用边栏打开"
            >
              <PanelRight size={14} />
            </button>
          )}

          {object.target_id && (onOpenFullCard || onOpenDrawer) && (
            <button
              onClick={() => (onOpenFullCard || onOpenDrawer)?.(object.target_id!)}
              className="p-1.5 rounded-lg hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition"
              title="全屏展开卡片 (Open full card)"
            >
              <Maximize2 size={14} />
            </button>
          )}

          <button
            onClick={handleToggleFold}
            className="p-1.5 rounded-lg hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition"
            title={isFolded ? '展开卡片 (Unfold)' : '折叠卡片 (Fold)'}
          >
            {isFolded ? <UnfoldVertical size={14} /> : <FoldVertical size={14} />}
          </button>

          <button
            onMouseDown={(e) => handleAnchorMouseDown('right', e)}
            className="p-1.5 rounded-lg hover:bg-light-grey text-middle-hard-grey hover:text-active-item transition"
            title="拖拽建立连线 (Connect)"
          >
            <Link2 size={14} />
          </button>

          {onDuplicate && (
            <button
              onClick={() => onDuplicate(object.id)}
              className="p-1.5 rounded-lg hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition"
              title="创建卡片副本 (Duplicate)"
            >
              <Copy size={14} />
            </button>
          )}

          <div className="w-px h-4 bg-light-grey mx-0.5" />

          <button
            onClick={() => onDelete(object.id)}
            className="p-1.5 rounded-lg hover:bg-danger-item/10 text-middle-hard-grey hover:text-danger-item transition"
            title="从白板移除 (Remove)"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
      {!isLodThreshold && (
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
          className={`absolute z-30 top-[8px] right-[8px] flex items-center rounded-md bg-menu-bg/95 backdrop-blur-md border border-light-grey shadow-card overflow-visible transition-opacity duration-150 ${
            showMoreMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onLocateCard?.(object.id)}
            className="p-1.5 hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition rounded-l-md"
            title="在白板中央定位此卡片 (Locate)"
          >
            <Crosshair size={13} />
          </button>

          <div className="w-px h-3.5 bg-light-grey" />

          {object.target_id && onOpenDrawer && (
            <>
              <button
                onClick={() => onOpenDrawer(object.target_id!)}
                className="p-1.5 hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition"
                title="在右侧引用边栏中打开 (Open in side panel)"
              >
                <PanelRight size={13} />
              </button>
              <div className="w-px h-3.5 bg-light-grey" />
            </>
          )}

          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => {
                setShowMoreMenu(!showMoreMenu);
                setConfirmPermanentDelete(false);
              }}
              className="p-1.5 hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition rounded-r-md"
              title="更多卡片选项"
            >
              <MoreHorizontal size={13} />
            </button>

            {showMoreMenu && (
              <div
                className="card-popover-menu absolute right-0 top-full mt-1.5 w-[248px] rounded-xl bg-menu-bg border border-light-grey shadow-main py-1.5 z-50 backdrop-blur-md flex flex-col text-xs text-text-color select-none"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-middle-grey border-b border-light-grey flex items-center justify-between">
                  <span>卡片主题色</span>
                  <Palette size={12} />
                </div>
                <div className="grid grid-cols-4 gap-2 p-2.5 border-b border-light-grey">
                  {HEPTA_CARD_PALETTE.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        const nextProps = { ...parsedProps, color: c.id };
                        onUpdateColor?.(object.id, c.id);
                        onUpdateProperties?.(object.id, JSON.stringify(nextProps));
                        setShowMoreMenu(false);
                      }}
                      className="group/color flex flex-col items-center gap-1 p-1 rounded-lg hover:bg-light-grey transition"
                    >
                      <div
                        className="w-5 h-5 rounded-full border border-light-grey shadow-sm flex items-center justify-center transition-transform group-hover/color:scale-110"
                        style={{ backgroundColor: c.cssVar }}
                      >
                        {activePaletteId === c.id && (
                          <Check size={11} className="text-middle-hard-grey" />
                        )}
                      </div>
                      <span className="text-[10px] text-middle-hard-grey truncate w-full text-center">
                        {c.label}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleToggleFold();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-light-grey transition text-left"
                >
                  {isFolded ? (
                    <>
                      <UnfoldVertical size={14} className="text-middle-hard-grey" />
                      <span>展开卡片正文 (Unfold)</span>
                    </>
                  ) : (
                    <>
                      <FoldVertical size={14} className="text-middle-hard-grey" />
                      <span>折叠卡片 (Fold card)</span>
                    </>
                  )}
                </button>

                {!isFolded && (
                  <button
                    onClick={handleFitToContent}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-light-grey transition text-left"
                  >
                    <Maximize2 size={14} className="text-middle-hard-grey" />
                    <span>自适应内容高度 (Fit to content)</span>
                  </button>
                )}

                <button
                  onClick={handleCopyCardLink}
                  className="flex items-center justify-between px-3 py-2 hover:bg-light-grey transition text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <LinkIcon size={14} className="text-middle-hard-grey" />
                    <span>复制双链链接</span>
                  </div>
                  {copiedLink && <span className="text-successful-item text-[11px]">已复制</span>}
                </button>

                {object.target_id && onOpenDrawer && (
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      onOpenDrawer(object.target_id!);
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-light-grey transition text-left"
                  >
                    <PanelRight size={14} className="text-middle-hard-grey" />
                    <span>在右侧抽屉中打开</span>
                  </button>
                )}

                <div className="h-px bg-light-grey my-1" />

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    onDelete(object.id);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-light-grey transition text-left text-middle-hard-grey"
                >
                  <Trash2 size={14} />
                  <span>从白板移除 (仅移除引用)</span>
                </button>

                {object.target_id && onDeletePermanently && (
                  confirmPermanentDelete ? (
                    <div className="px-3 py-2 flex items-center justify-between gap-2 bg-danger-item/10">
                      <span className="text-danger-item font-medium text-[11px]">彻底删除卡片？</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setShowMoreMenu(false);
                            setConfirmPermanentDelete(false);
                            onDeletePermanently(object.target_id!);
                          }}
                          className="px-2 py-0.5 rounded bg-danger-item text-white text-[11px] font-medium hover:brightness-110 transition"
                        >
                          确认
                        </button>
                        <button
                          onClick={() => setConfirmPermanentDelete(false)}
                          className="px-2 py-0.5 rounded bg-light-grey text-text-color text-[11px] hover:bg-light-middle-grey transition"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmPermanentDelete(true)}
                      className="flex items-center gap-2.5 px-3 py-2 hover:bg-danger-item/10 text-danger-item transition text-left"
                    >
                      <Trash2 size={14} />
                      <span>永久删除卡片 (彻底删除)</span>
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 rounded-[11px] overflow-hidden">
      {isLodThreshold ? (
        <div
          onMouseDown={handleMouseDown}
          className="flex-1 p-5 flex flex-col justify-start cursor-grab select-none overflow-hidden"
          style={{ background: 'transparent' }}
        >
          <div
            style={{
              fontSize: isLargeTextMode ? 31.875 : 17,
              fontWeight: isLargeTextMode ? 700 : 600,
              color: title ? 'var(--text-color)' : 'var(--middle-grey)',
              lineHeight: 1.3,
              letterSpacing: isLargeTextMode ? '-0.02em' : 'normal',
              display: '-webkit-box',
              WebkitLineClamp: isLargeTextMode ? 3 : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              marginBottom: 8,
            }}
          >
            {title || 'Untitled'}
          </div>
          {contentText && !isFolded && (
            <div
              style={{
                fontSize: isLargeTextMode ? 16 : 14,
                color: 'var(--middle-hard-grey)',
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 6,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
              }}
            >
              {contentText.slice(0, 200)}
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            onMouseDown={handleMouseDown}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (object.target_id && onOpenDrawer) {
                onOpenDrawer(object.target_id);
              }
            }}
            className={`min-h-[46px] px-3 py-2 flex items-center justify-between cursor-grab shrink-0 ${
              isFolded ? '' : 'border-b border-light-grey/60'
            }`}
            style={{ backgroundColor: 'transparent' }}
            title="双击在右侧分屏边栏打开 (Double click for right sidebar)"
          >
            <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-16">
              <button
                onClick={handleToggleFold}
                className="p-1 rounded hover:bg-light-grey text-middle-hard-grey transition-colors shrink-0"
                title={isFolded ? '展开卡片 (Unfold)' : '折叠卡片 (Fold)'}
              >
                <ChevronRight
                  size={15}
                  className={`transition-transform duration-200 ${!isFolded ? 'rotate-90' : ''}`}
                />
              </button>

              {isEditingTitle ? (
                <input
                  type="text"
                  autoFocus
                  placeholder="Untitled"
                  value={currentTitle}
                  onChange={(e) => setCurrentTitle(e.target.value)}
                  onBlur={() => {
                    setIsEditingTitle(false);
                    if (object.target_id) onUpdateTitle(object.target_id, currentTitle.trim());
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      setIsEditingTitle(false);
                      if (object.target_id) onUpdateTitle(object.target_id, currentTitle.trim());
                    } else if (e.key === 'Escape') {
                      setIsEditingTitle(false);
                      setCurrentTitle(title);
                    }
                  }}
                  className="bg-background-secondary border border-active-item rounded px-1.5 py-0.5 text-[17px] leading-[1.4] font-semibold text-text-color placeholder:text-middle-grey outline-none w-full"
                />
              ) : (
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setIsEditingTitle(true);
                  }}
                  className={`text-[17px] leading-[1.4] font-semibold cursor-text ${
                    title ? 'text-text-color' : 'text-middle-grey'
                  } ${
                    isFolded && isFullTitleFoldedCardMode
                      ? 'whitespace-normal break-words'
                      : 'truncate'
                  }`}
                  title="双击重命名卡片标题"
                >
                  {title || 'Untitled'}
                </span>
              )}
            </div>
          </div>

          {isFolded ? null : (
            <>
              <div
                ref={bodyScrollRef}
                className={`relative flex-1 px-4 py-3 ${
                  isEditingBody ? 'overflow-y-auto cursor-text' : 'overflow-hidden cursor-grab'
                }`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!isEditingBody) {
                    setIsEditingBody(true);
                    setTimeout(() => {
                      const pm = bodyScrollRef.current?.querySelector('.ProseMirror') as HTMLElement | null;
                      pm?.focus();
                    }, 0);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && isEditingBody) {
                    e.stopPropagation();
                    setIsEditingBody(false);
                  }
                }}
                onBlurCapture={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setIsEditingBody(false);
                  }
                }}
              >
                {previewMode === 'static' && !isEditingBody ? (
                  <div className="text-[15px] leading-[1.6] text-text-color whitespace-pre-wrap break-words pointer-events-none">
                    {contentText || (
                      <span className="text-middle-grey text-sm">Double-click to edit card...</span>
                    )}
                  </div>
                ) : (
                  <div className={isEditingBody ? '' : 'pointer-events-none select-none'}>
                    <CardEditor
                      key={object.id}
                      initialContent={resolvedEditorInitialContent}
                      readOnly={!isEditingBody}
                      cards={cards}
                      onOpenCard={onOpenDrawer}
                      onChange={(val) => {
                        if (object.target_id) {
                          onUpdateContent(object.target_id, { json: val.json, text: val.text });
                        }
                      }}
                      sourceCardId={object.target_id || undefined}
                    />
                  </div>
                )}

                {!isEditingBody && (isBodyOverflowing || !!contentText) && (
                  <div
                    className="pointer-events-none absolute bottom-0 left-0 right-0 h-11 z-10"
                    style={{
                      background:
                        activePaletteId === 'white'
                          ? 'var(--preview-blur)'
                          : `linear-gradient(180deg, transparent 0%, ${cardColor} 100%)`,
                    }}
                  />
                )}
              </div>

              {(hasMetadataFooter || isHovered || isSelected) && (visibleTags.length > 0 || backlinkCount > 0 || whiteboardCount > 1) && (
                <div
                  className="px-3.5 py-2 border-t border-light-grey/60 flex items-center justify-between gap-2 text-[11px] shrink-0"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1 flex-wrap min-w-0">
                    {visibleTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-light-grey text-middle-hard-grey font-medium truncate max-w-[110px]"
                      >
                        #{tag.name}
                      </span>
                    ))}
                    {visibleTags.length > 3 && (
                      <span className="px-1 py-0.5 rounded bg-ultra-light-grey text-middle-grey font-mono text-[10px]">
                        +{visibleTags.length - 3}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {backlinkCount > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (object.target_id && onOpenDrawer) onOpenDrawer(object.target_id);
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ultra-light-grey hover:bg-light-grey text-middle-hard-grey transition"
                        title={`${backlinkCount} 条反向链接`}
                      >
                        <Link2 size={10} />
                        <span>{backlinkCount}</span>
                      </button>
                    )}
                    {whiteboardCount > 1 && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ultra-light-grey text-middle-hard-grey"
                        title={`存在于 ${whiteboardCount} 个白板中`}
                      >
                        <Layers size={10} />
                        <span>{whiteboardCount}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
      </div>

      {!isLodThreshold && (
        <div
          onMouseDown={(e) => handleResizeStart(e, 'left')}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onUpdateSize(object.id, 520, object.height);
          }}
          className="card-resize-handle absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-active-item/25 z-20 transition"
          title="左右拖拽缩放宽度（双击恢复标准 520px）"
        />
      )}

      {!isLodThreshold && (
        <div
          onMouseDown={(e) => handleResizeStart(e, 'right')}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onUpdateSize(object.id, 520, object.height);
          }}
          className="card-resize-handle absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-active-item/25 z-20 transition"
          title="左右拖拽缩放宽度（双击恢复标准 520px）"
        />
      )}

      {!isLodThreshold && !isFolded && (
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

      <style>{`
        .card-anchor {
          position: absolute;
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: var(--active-item);
          border: 2px solid var(--whiteboard-background);
          opacity: 0;
          transition: opacity 0.15s ease, transform 0.15s ease;
          cursor: crosshair;
          z-index: 20;
        }
        div:hover > .card-anchor {
          opacity: 1;
        }
        .card-anchor:hover {
          transform: scale(1.35) !important;
        }
      `}</style>
    </div>
  );
}
