import React, { useRef, useState } from 'react';
import type { Connection, WhiteboardObject, ConnectionStyle } from '@shared/types';
import { Point, getConnectionPath } from '../../primitives/canvas-math';
import { X, CornerDownRight, Spline, Minus, Activity, ArrowRight, ArrowLeftRight, Palette } from 'lucide-react';

export const HEPTA_CONNECTION_COLORS = [
  { id: 'blue', color: 'var(--connection-blue)', label: '蓝' },
  { id: 'yellow', color: 'var(--connection-yellow)', label: '黄' },
  { id: 'red', color: 'var(--connection-red)', label: '红' },
  { id: 'green', color: 'var(--connection-green)', label: '绿' },
  { id: 'orange', color: 'var(--connection-orange)', label: '橙' },
  { id: 'purple', color: 'var(--connection-purple)', label: '紫' },
  { id: 'white', color: 'var(--connection-white)', label: '白' },
  { id: 'black', color: 'var(--connection-black)', label: '黑' },
];

export interface ConnectionLayerProps {
  connections: Connection[];
  objectsMap: Map<string, WhiteboardObject>;
  activeConnectLine: {
    sourceId: string;
    sourceAnchor: 'top' | 'bottom' | 'left' | 'right';
    startPoint: Point;
    currentPoint: Point;
  } | null;
  selectedConnectionId: string | null;
  onSelectConnection: (id: string | null) => void;
  onDeleteConnection: (id: string) => void;
  onUpdateConnectionLabel: (id: string, label: string) => void;
  onUpdateConnectionStyle?: (id: string, styleJson: string) => void;
  zoom?: number;
  focusedObjectIds?: Set<string> | null;
}

export function ConnectionLayer({
  connections,
  objectsMap,
  activeConnectLine,
  selectedConnectionId,
  onSelectConnection,
  onDeleteConnection,
  onUpdateConnectionLabel,
  onUpdateConnectionStyle,
  zoom = 1,
  focusedObjectIds = null,
}: ConnectionLayerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [colorPickerConnId, setColorPickerConnId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const resolvedAutoAxisRef = useRef<
    Map<string, { axis: 'horizontal' | 'vertical'; beginDir: 'top' | 'bottom' | 'left' | 'right'; endDir: 'top' | 'bottom' | 'left' | 'right' }>
  >(new Map());

  const isLodThreshold = Math.round(zoom * 100) <= 30;

  const resolveMarkerId = (strokeColor: string, isSelected: boolean): string => {
    if (isSelected) return 'url(#arrow-selected)';
    const matched = HEPTA_CONNECTION_COLORS.find((c) => c.color === strokeColor);
    return matched ? `url(#arrow-color-${matched.id})` : 'url(#arrow-color-blue)';
  };

  const getEffectiveHeight = (obj: WhiteboardObject): number => {
    try {
      const p = obj.properties_json ? (JSON.parse(obj.properties_json) as Record<string, unknown>) : {};
      if (obj.object_type === 'card' && p.isFolded) return 46;
      if (obj.object_type === 'whiteboard_shortcut' && p.isChild === false) return 128;
    } catch {}
    return obj.height;
  };

  const getObjectAnchor = (
    obj: WhiteboardObject,
    anchor: 'top' | 'bottom' | 'left' | 'right' | 'auto',
    targetObj?: WhiteboardObject,
    connKey?: string,
    isSource = true
  ): { point: Point; direction: 'top' | 'bottom' | 'left' | 'right' } => {
    const objHeight = getEffectiveHeight(obj);
    const cx = obj.pos_x + obj.width / 2;
    const cy = obj.pos_y + objHeight / 2;

    if (anchor === 'auto' && targetObj) {
      const cached = connKey ? resolvedAutoAxisRef.current.get(connKey) : undefined;
      let resolvedDir: 'top' | 'bottom' | 'left' | 'right';

      if (cached) {
        resolvedDir = isSource ? cached.beginDir : cached.endDir;
      } else {
        const targetHeight = getEffectiveHeight(targetObj);
        const tcx = targetObj.pos_x + targetObj.width / 2;
        const tcy = targetObj.pos_y + targetHeight / 2;
        const dx = tcx - cx;
        const dy = tcy - cy;

        const gapRight = targetObj.pos_x - (obj.pos_x + obj.width);
        const gapLeft = obj.pos_x - (targetObj.pos_x + targetObj.width);
        const gapBottom = targetObj.pos_y - (obj.pos_y + objHeight);
        const gapTop = obj.pos_y - (targetObj.pos_y + targetHeight);

        const gapX = Math.max(0, gapRight, gapLeft);
        const gapY = Math.max(0, gapBottom, gapTop);

        let useHorizontal: boolean;
        if (gapX > 0 && gapY === 0) {
          useHorizontal = true;
        } else if (gapY > 0 && gapX === 0) {
          useHorizontal = false;
        } else if (gapX > 0 && gapY > 0) {
          useHorizontal = gapX >= gapY;
        } else {
          const normX = Math.abs(dx) / Math.max(1, (obj.width + targetObj.width) / 2);
          const normY = Math.abs(dy) / Math.max(1, (objHeight + targetHeight) / 2);
          useHorizontal = normX >= normY;
        }

        const primaryDir: 'top' | 'bottom' | 'left' | 'right' = useHorizontal
          ? dx >= 0
            ? 'right'
            : 'left'
          : dy >= 0
          ? 'bottom'
          : 'top';
        const oppositeDir: 'top' | 'bottom' | 'left' | 'right' =
          primaryDir === 'right'
            ? 'left'
            : primaryDir === 'left'
            ? 'right'
            : primaryDir === 'bottom'
            ? 'top'
            : 'bottom';

        if (connKey) {
          resolvedAutoAxisRef.current.set(connKey, {
            axis: useHorizontal ? 'horizontal' : 'vertical',
            beginDir: isSource ? primaryDir : oppositeDir,
            endDir: isSource ? oppositeDir : primaryDir,
          });
        }
        resolvedDir = primaryDir;
      }

      switch (resolvedDir) {
        case 'left':
          return { point: { x: obj.pos_x, y: cy }, direction: 'left' };
        case 'right':
          return { point: { x: obj.pos_x + obj.width, y: cy }, direction: 'right' };
        case 'top':
          return { point: { x: cx, y: obj.pos_y }, direction: 'top' };
        case 'bottom':
        default:
          return { point: { x: cx, y: obj.pos_y + objHeight }, direction: 'bottom' };
      }
    }

    switch (anchor) {
      case 'left':
        return { point: { x: obj.pos_x, y: cy }, direction: 'left' };
      case 'right':
        return { point: { x: obj.pos_x + obj.width, y: cy }, direction: 'right' };
      case 'top':
        return { point: { x: cx, y: obj.pos_y }, direction: 'top' };
      case 'bottom':
      default:
        return { point: { x: cx, y: obj.pos_y + objHeight }, direction: 'bottom' };
    }
  };

  const handleStartEdit = (conn: Connection, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conn.id);
    setEditingText(conn.label || '');
  };

  const handleSaveLabel = (id: string) => {
    onUpdateConnectionLabel(id, editingText.trim());
    setEditingId(null);
  };

  const handleToggleStyle = (conn: Connection, patch: Partial<ConnectionStyle>, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onUpdateConnectionStyle) return;
    let currentStyle: ConnectionStyle = {
      strokeColor: 'var(--connection-blue)',
      strokeWidth: 2.5,
      dashed: false,
      type: 'curve',
      beginStyle: 'none',
      endStyle: 'default',
    };
    try {
      if (conn.style_json) {
        currentStyle = { ...currentStyle, ...JSON.parse(conn.style_json) };
      }
    } catch {}
    const updated = { ...currentStyle, ...patch };
    onUpdateConnectionStyle(conn.id, JSON.stringify(updated));
  };

  return (
    <svg
      className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
      style={{ zIndex: 25 }}
    >
      <defs>
        {HEPTA_CONNECTION_COLORS.map((c) => (
          <marker
            key={c.id}
            id={`arrow-color-${c.id}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill={c.color} />
          </marker>
        ))}

        <marker
          id="arrow-selected"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--active-item)" />
        </marker>

        <marker
          id="arrow-active"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--active-item)" />
        </marker>
      </defs>

      {connections.map((conn) => {
        const sourceObj = objectsMap.get(conn.source_object_id);
        const targetObj = objectsMap.get(conn.target_object_id);
        if (!sourceObj || !targetObj) return null;

        const defaultType: 'curve' | 'straight' | 'elbow' =
          sourceObj.object_type === 'mindmap_node' || targetObj.object_type === 'mindmap_node'
            ? 'elbow'
            : 'curve';

        let style: ConnectionStyle = {
          strokeColor: 'var(--connection-blue)',
          strokeWidth: 2.5,
          dashed: false,
          type: defaultType,
        };

        try {
          if (conn.style_json) {
            style = { ...style, ...JSON.parse(conn.style_json) };
          }
        } catch {}

        const isSelected = selectedConnectionId === conn.id;
        const isHovered = hoveredId === conn.id;
        const isDimmed =
          focusedObjectIds !== null &&
          (!focusedObjectIds.has(conn.source_object_id) ||
            !focusedObjectIds.has(conn.target_object_id));

        const sourceAnchor = getObjectAnchor(
          sourceObj,
          style.beginPos || 'auto',
          targetObj,
          conn.id,
          true
        );
        const targetAnchor = getObjectAnchor(
          targetObj,
          style.endPos || 'auto',
          sourceObj,
          conn.id,
          false
        );

        const pathData = getConnectionPath(
          style.type,
          sourceAnchor.point,
          targetAnchor.point,
          sourceAnchor.direction,
          targetAnchor.direction
        );

        const midX = (sourceAnchor.point.x + targetAnchor.point.x) / 2;
        const midY = (sourceAnchor.point.y + targetAnchor.point.y) / 2;
        const markerUrl = resolveMarkerId(style.strokeColor, isSelected);
        const isDashed = Boolean(style.dashed || style.lineStyle === 'dashed');

        return (
          <g
            key={conn.id}
            data-object-id={conn.id}
            data-object-type="connection"
            className={`highlightOutline cursor-pointer ${isSelected ? 'selected' : ''}`}
            style={{ opacity: isDimmed ? 0.15 : 1, transition: 'opacity 0.15s ease' }}
            onMouseEnter={() => setHoveredId(conn.id)}
            onMouseLeave={() => setHoveredId((prev) => (prev === conn.id ? null : prev))}
          >
            <path
              d={pathData}
              fill="none"
              stroke="transparent"
              strokeWidth={22}
              className="pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                setColorPickerConnId(null);
                onSelectConnection(conn.id);
              }}
              onDoubleClick={(e) => handleStartEdit(conn, e)}
            />

            {(isSelected || isHovered) && (
              <path
                d={pathData}
                fill="none"
                stroke={isSelected ? 'var(--active-item)' : style.strokeColor}
                strokeWidth={style.strokeWidth + (isSelected ? 8 : 5)}
                strokeOpacity={isSelected ? 0.3 : 0.16}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mainOutline pointer-events-none transition-opacity duration-150"
              />
            )}

            <path
              d={pathData}
              fill="none"
              stroke={isSelected ? 'var(--active-item)' : style.strokeColor}
              strokeWidth={isSelected ? Math.max(3, style.strokeWidth + 0.5) : style.strokeWidth}
              strokeDasharray={isDashed ? '6,4' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerStart={style.beginStyle === 'default' || style.beginStyle === 'lineArrow' ? markerUrl : undefined}
              markerEnd={style.endStyle !== 'none' ? markerUrl : undefined}
              className="secondaryOutline pointer-events-none transition-colors duration-150"
            />

            {(!isLodThreshold || isSelected || editingId === conn.id) && (conn.label || isSelected || editingId === conn.id) && (
              <foreignObject
                x={midX - 180}
                y={midY - 24}
                width={360}
                height={56}
                className="overflow-visible pointer-events-auto"
              >
                <div className="flex flex-col items-center justify-center">
                  {editingId === conn.id ? (
                    <div className="bg-menu-bg border border-active-item rounded-lg px-2.5 py-1.5 shadow-main flex items-center gap-1.5 backdrop-blur-md">
                      <input
                        type="text"
                        autoFocus
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={() => handleSaveLabel(conn.id)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') handleSaveLabel(conn.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="bg-transparent text-text-color text-xs outline-none w-28 text-center font-medium"
                        placeholder="输入关系..."
                      />
                    </div>
                  ) : (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectConnection(conn.id);
                      }}
                      onDoubleClick={(e) => handleStartEdit(conn, e)}
                      className={`px-3 py-1 rounded-full text-[11px] font-medium backdrop-blur-md flex items-center gap-1.5 shadow-card transition-all duration-150 ${
                        isSelected
                          ? 'bg-menu-bg text-text-color border border-active-item shadow-main'
                          : 'bg-menu-bg/90 text-text-color border border-light-grey hover:border-active-item'
                      }`}
                    >
                      <span>{conn.label || (isSelected ? '编辑关系' : '')}</span>

                      {isSelected && (
                        <div className="flex items-center gap-1 ml-1 pl-1.5 border-l border-light-grey">
                          <button
                            onClick={(e) => {
                              const nextType =
                                style.type === 'curve' ? 'elbow' : style.type === 'elbow' ? 'straight' : 'curve';
                              handleToggleStyle(conn, { type: nextType }, e);
                            }}
                            className="p-1 rounded hover:bg-light-grey text-middle-hard-grey hover:text-active-item transition"
                            title={`形态: ${style.type === 'curve' ? '贝塞尔曲线' : style.type === 'elbow' ? '折线 (Elbow)' : '直线'}`}
                          >
                            {style.type === 'curve' && <Spline size={13} />}
                            {style.type === 'elbow' && <CornerDownRight size={13} className="text-active-item" />}
                            {style.type === 'straight' && <Minus size={13} />}
                          </button>

                          <button
                            onClick={(e) => {
                              let nextBegin: 'none' | 'default' = 'none';
                              let nextEnd: 'none' | 'default' = 'default';

                              if (style.beginStyle === 'none' && style.endStyle !== 'none') {
                                nextBegin = 'default';
                                nextEnd = 'default';
                              } else if (style.beginStyle === 'default' && style.endStyle !== 'none') {
                                nextBegin = 'none';
                                nextEnd = 'none';
                              } else {
                                nextBegin = 'none';
                                nextEnd = 'default';
                              }
                              handleToggleStyle(conn, { beginStyle: nextBegin, endStyle: nextEnd }, e);
                            }}
                            className="p-1 rounded hover:bg-light-grey text-middle-hard-grey hover:text-active-item transition"
                            title={`箭头: ${
                              style.beginStyle === 'default'
                                ? '双向箭头'
                                : style.endStyle !== 'none'
                                ? '单向箭头'
                                : '无箭头'
                            }`}
                          >
                            {style.beginStyle === 'default' ? (
                              <ArrowLeftRight size={13} className="text-active-item" />
                            ) : style.endStyle !== 'none' ? (
                              <ArrowRight size={13} />
                            ) : (
                              <Minus size={13} className="text-middle-grey" />
                            )}
                          </button>

                          <button
                            onClick={(e) => handleToggleStyle(conn, { dashed: !style.dashed }, e)}
                            className={`p-1 rounded hover:bg-light-grey transition ${
                              style.dashed ? 'text-active-item' : 'text-middle-grey hover:text-text-color'
                            }`}
                            title={style.dashed ? '虚线 (点击切为实线)' : '实线 (点击切为虚线)'}
                          >
                            <Activity size={13} />
                          </button>

                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setColorPickerConnId(colorPickerConnId === conn.id ? null : conn.id);
                              }}
                              className="p-1 rounded hover:bg-light-grey text-middle-hard-grey hover:text-active-item transition flex items-center"
                              title="选择线条色彩"
                            >
                              <Palette size={13} />
                            </button>

                            {colorPickerConnId === conn.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute top-7 left-1/2 -translate-x-1/2 p-2 bg-menu-bg border border-light-grey rounded-xl shadow-main flex items-center gap-1.5 z-50 backdrop-blur-md"
                              >
                                {HEPTA_CONNECTION_COLORS.map((c) => (
                                  <button
                                    key={c.id}
                                    onClick={(e) => {
                                      handleToggleStyle(conn, { strokeColor: c.color }, e);
                                      setColorPickerConnId(null);
                                    }}
                                    className="w-4 h-4 rounded-full border border-light-grey hover:scale-125 transition"
                                    style={{ background: c.color }}
                                    title={c.label}
                                  />
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteConnection(conn.id);
                            }}
                            className="hover:text-danger-item p-1 text-middle-grey transition ml-0.5"
                            title="删除连线"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}

      {activeConnectLine && (() => {
        const dx = activeConnectLine.currentPoint.x - activeConnectLine.startPoint.x;
        const dy = activeConnectLine.currentPoint.y - activeConnectLine.startPoint.y;
        let endPoint = activeConnectLine.currentPoint;
        let targetDir: 'top' | 'bottom' | 'left' | 'right' =
          Math.abs(dx) >= Math.abs(dy)
            ? dx >= 0
              ? 'left'
              : 'right'
            : dy >= 0
            ? 'top'
            : 'bottom';

        for (const candidate of objectsMap.values()) {
          if (candidate.id === activeConnectLine.sourceId) continue;
          if (
            activeConnectLine.currentPoint.x >= candidate.pos_x &&
            activeConnectLine.currentPoint.x <= candidate.pos_x + candidate.width &&
            activeConnectLine.currentPoint.y >= candidate.pos_y &&
            activeConnectLine.currentPoint.y <= candidate.pos_y + candidate.height
          ) {
            const dxLeft = Math.abs(activeConnectLine.currentPoint.x - candidate.pos_x);
            const dxRight = Math.abs(
              activeConnectLine.currentPoint.x - (candidate.pos_x + candidate.width)
            );
            const dyTop = Math.abs(activeConnectLine.currentPoint.y - candidate.pos_y);
            const dyBottom = Math.abs(
              activeConnectLine.currentPoint.y - (candidate.pos_y + candidate.height)
            );
            const minDist = Math.min(dxLeft, dxRight, dyTop, dyBottom);
            const snappedSide: 'top' | 'bottom' | 'left' | 'right' =
              minDist === dxLeft
                ? 'left'
                : minDist === dxRight
                ? 'right'
                : minDist === dyTop
                ? 'top'
                : 'bottom';
            const snapped = getObjectAnchor(candidate, snappedSide);
            endPoint = snapped.point;
            targetDir = snapped.direction;
            break;
          }
        }

        return (
          <path
            d={getConnectionPath(
              'curve',
              activeConnectLine.startPoint,
              endPoint,
              activeConnectLine.sourceAnchor,
              targetDir
            )}
            fill="none"
            stroke="var(--active-item)"
            strokeWidth={2.5}
            strokeDasharray="6,4"
            strokeLinecap="round"
            markerEnd="url(#arrow-active)"
            className="pointer-events-none"
          />
        );
      })()}
    </svg>
  );
}
