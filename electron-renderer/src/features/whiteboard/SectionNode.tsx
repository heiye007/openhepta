import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MoreHorizontal, Trash2, Maximize2, FolderPlus } from 'lucide-react';
import type { WhiteboardObject } from '@shared/types';
import {
  HEPTA_SECTION_COLORS,
  HEPTA_SECTION_PALETTE,
  resolveSectionColors,
} from '@shared/palette';

export { HEPTA_SECTION_COLORS, HEPTA_SECTION_PALETTE, resolveSectionColors };

export interface SectionNodeProps {
  object: WhiteboardObject;
  scale: number;
  isSelected: boolean;
  isInsideSection?: boolean;
  isDimmed?: boolean;
  dimmedOpacity?: number;
  onDragStart?: (id: string) => void;
  onUpdatePosition: (id: string, x: number, y: number, deltaX: number, deltaY: number) => void;
  onDragEnd?: (id: string, newX: number, newY: number) => void;
  onUpdateSize: (id: string, width: number, height: number) => void;
  onFitToContent?: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onUpdateColor?: (id: string, color: string, borderColor: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onTurnIntoSubWhiteboard?: (id: string) => void;
  autoFocusTitle?: boolean;
}

export function SectionNode({
  object,
  scale,
  isSelected,
  isInsideSection = false,
  isDimmed = false,
  dimmedOpacity = 0.25,
  onDragStart,
  onUpdatePosition,
  onDragEnd,
  onUpdateSize,
  onFitToContent,
  onUpdateTitle,
  onUpdateColor,
  onDelete,
  onSelect,
  onTurnIntoSubWhiteboard,
  autoFocusTitle = false,
}: SectionNodeProps) {
  let parsedProps = {
    title: '未命名分区',
    color: 'white',
  };
  try {
    if (object.properties_json) {
      parsedProps = { ...parsedProps, ...JSON.parse(object.properties_json) };
    }
  } catch {}

  const sectionColors = useMemo(
    () => resolveSectionColors(parsedProps.color),
    [parsedProps.color]
  );

  const [isEditingTitle, setIsEditingTitle] = useState(autoFocusTitle);
  const [title, setTitle] = useState(parsedProps.title);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  useEffect(() => {
    setTitle(parsedProps.title);
  }, [parsedProps.title]);

  useEffect(() => {
    if (autoFocusTitle) {
      setIsEditingTitle(true);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [autoFocusTitle]);

  const inputWidth = useMemo(() => {
    const textToMeasure = title || '未命名分区';
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const measured = ctx.measureText(textToMeasure).width;
        return Math.max(24, Math.ceil(measured) + 6);
      }
    } catch {}
    return Math.max(24, textToMeasure.length * 11 + 6);
  }, [title]);

  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0, objX: 0, objY: 0, lastX: 0, lastY: 0 });
  const isResizingRef = useRef(false);
  const resizeStartPosRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    onSelect(object.id, e);
    onDragStart?.(object.id);

    isDraggingRef.current = true;
    dragStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      objX: object.pos_x,
      objY: object.pos_y,
      lastX: object.pos_x,
      lastY: object.pos_y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const totalDx = (moveEvent.clientX - dragStartPosRef.current.x) / scale;
      const totalDy = (moveEvent.clientY - dragStartPosRef.current.y) / scale;
      const newX = dragStartPosRef.current.objX + totalDx;
      const newY = dragStartPosRef.current.objY + totalDy;

      const deltaX = newX - dragStartPosRef.current.lastX;
      const deltaY = newY - dragStartPosRef.current.lastY;
      dragStartPosRef.current.lastX = newX;
      dragStartPosRef.current.lastY = newY;

      onUpdatePosition(object.id, newX, newY, deltaX, deltaY);
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        onDragEnd?.(object.id, dragStartPosRef.current.lastX, dragStartPosRef.current.lastY);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    isResizingRef.current = true;
    resizeStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: object.width,
      height: object.height,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const dx = (moveEvent.clientX - resizeStartPosRef.current.x) / scale;
      const dy = (moveEvent.clientY - resizeStartPosRef.current.y) / scale;
      onUpdateSize(
        object.id,
        Math.max(240, resizeStartPosRef.current.width + dx),
        Math.max(160, resizeStartPosRef.current.height + dy)
      );
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const r = 1 / Math.max(0.05, scale || 1);
  const isLodThreshold = Math.round(scale * 100) <= 30;
  const titleTransform = isInsideSection
    ? `translate(${6 * r}px, ${6 * r}px) scale(${r})`
    : `translateY(calc(-${100 * r}% - ${6 * r}px)) scale(${r})`;
  const titleMaxWidth = isInsideSection
    ? `calc(100% - 18px)`
    : `calc(100% - 6px)`;

  return (
    <div
      onClick={(e) => onSelect(object.id, e)}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          handleMouseDown(e);
        }
      }}
      data-whiteboard-id={object.whiteboard_id}
      data-object-id={object.id}
      data-object-type="section"
      style={{
        position: 'absolute',
        left: object.pos_x,
        top: object.pos_y,
        width: object.width,
        height: object.height,
        zIndex: object.z_index || 0,
        pointerEvents: 'auto',
        boxSizing: 'border-box',
        borderRadius: 12,
        backgroundColor: sectionColors.bg,
        boxShadow: isSelected
          ? `inset 0 0 0 2px ${sectionColors.border}, 0 0 0 2px var(--active-item)`
          : `inset 0 0 0 2px ${sectionColors.border}`,
        border: isSelected
          ? '3px solid var(--active-item)'
          : '3px solid transparent',
        userSelect: 'none',
        cursor: 'grab',
        opacity: isDimmed ? dimmedOpacity : 1,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        data-is-section-title="true"
        data-is-section-title-inside-section={isInsideSection ? 'true' : 'false'}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          marginTop: 3,
          marginRight: 3,
          marginLeft: 3,
          transform: titleTransform,
          maxWidth: titleMaxWidth,
          boxSizing: 'border-box',
          display: 'flex',
          transformOrigin: 'top left',
          alignItems: 'center',
          overflow: 'hidden',
          borderRadius: 6,
          boxShadow: isEditingTitle
            ? 'inset 0 0 0 1px var(--active-item), 0 0 0 2px var(--middle-transparent-blue)'
            : 'inset 0 0 0 1px var(--light-grey)',
          padding: title ? '2px 8px' : '2px 6px',
          backgroundColor: isEditingTitle ? 'var(--background-primary)' : sectionColors.border,
          zIndex: 15,
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          transition: 'box-shadow 0.15s ease, background-color 0.15s ease',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={title}
          readOnly={!isEditingTitle}
          placeholder="未命名分区"
          onChange={(e) => setTitle(e.target.value)}
          onFocus={(e) => {
            setIsEditingTitle(true);
            e.target.select();
          }}
          onBlur={() => {
            setIsEditingTitle(false);
            onUpdateTitle(object.id, title);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              setIsEditingTitle(false);
              onUpdateTitle(object.id, title);
            } else if (e.key === 'Escape') {
              setIsEditingTitle(false);
              setTitle(parsedProps.title);
            }
          }}
          style={{
            maxWidth: '100%',
            width: inputWidth,
            fontSize: 16,
            fontWeight: 700,
            lineHeight: '22px',
            color: 'var(--text-color)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: 0,
            margin: 0,
            textOverflow: 'ellipsis',
            pointerEvents: isEditingTitle ? 'auto' : 'none',
          }}
        />

        {!isEditingTitle && (
          <div
            onClick={() => {
              if (isSelected) {
                setIsEditingTitle(true);
                setTimeout(() => {
                  inputRef.current?.focus();
                  inputRef.current?.select();
                }, 0);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditingTitle(true);
              setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
              }, 0);
            }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              cursor: 'pointer',
            }}
            className="hover:bg-light-grey"
          />
        )}

        {!isEditingTitle && (
          <div
            ref={menuRef}
            role="button"
            aria-label="Section actions"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            style={{
              position: 'relative',
              marginLeft: 8,
              width: 18,
              height: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: 'pointer',
              color: 'var(--middle-grey)',
            }}
            title="分区选项"
          >
            <MoreHorizontal size={14} />

            {showMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: 24,
                  left: 0,
                  width: 210,
                  backgroundColor: 'var(--menu-bg)',
                  border: '1px solid var(--light-grey)',
                  borderRadius: 10,
                  boxShadow: 'var(--shadow-main)',
                  padding: '8px',
                  zIndex: 100,
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, padding: '2px 4px' }}>
                  {HEPTA_SECTION_PALETTE.map((pal) => (
                    <button
                      key={pal.id}
                      type="button"
                      aria-label={`Section color ${pal.id}`}
                      onClick={() => {
                        onUpdateColor?.(object.id, pal.id, pal.border);
                        setShowMenu(false);
                      }}
                      style={{
                        width: '100%',
                        height: 22,
                        borderRadius: 6,
                        backgroundColor: pal.border,
                        border: sectionColors.id === pal.id ? '2px solid var(--active-item)' : '1px solid var(--light-grey)',
                        cursor: 'pointer',
                      }}
                      title={pal.label}
                    />
                  ))}
                </div>

                <div style={{ height: 1, backgroundColor: 'var(--light-grey)', margin: '2px 0' }} />

                <button
                  type="button"
                  aria-label="Fit section to content"
                  onClick={() => {
                    setShowMenu(false);
                    onFitToContent?.(object.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-color)',
                    fontSize: 13,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  className="hover:bg-light-grey"
                >
                  <Maximize2 size={14} color="var(--middle-grey)" />
                  自适应收纳 (Fit to content)
                </button>

                {onTurnIntoSubWhiteboard && (
                  <button
                    type="button"
                    aria-label="Turn into sub-whiteboard"
                    onClick={() => {
                      setShowMenu(false);
                      onTurnIntoSubWhiteboard(object.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-color)',
                      fontSize: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    className="hover:bg-light-grey"
                  >
                    <FolderPlus size={14} color="var(--middle-grey)" />
                    Turn into sub-whiteboard
                  </button>
                )}

                <button
                  type="button"
                  aria-label="Delete section"
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(object.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--danger-item)',
                    fontSize: 13,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  className="hover:bg-light-grey"
                >
                  <Trash2 size={14} color="var(--danger-item)" />
                  删除分区 (Delete)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!isLodThreshold && (
        <div
          onMouseDown={handleResizeStart}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onFitToContent?.(object.id);
          }}
          title="拖动调整大小 / 双击自适应内容 (Fit to content)"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 18,
            height: 18,
            cursor: 'nwse-resize',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M11 3L3 11M11 7L7 11M11 11H11.01"
              stroke="var(--middle-grey)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
