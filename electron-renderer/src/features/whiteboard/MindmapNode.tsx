import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Network,
  Plus,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Trash2,
  GripHorizontal,
  ArrowLeftRight,
  ArrowUpDown,
  FileText,
  Highlighter,
  ExternalLink,
  Undo2,
  Redo2,
  Palette,
  Search,
  X,
  Unlink,
} from 'lucide-react';
import type {
  Card,
  HighlightElement,
  MindMapData,
  MindMapEdgeColor,
  MindMapNodeData,
  MindMapNodeSide,
  MindMapResolvedSide,
  WhiteboardObject,
} from '@shared/types';
import {
  HEPTA_MINDMAP_EDGE_PALETTE,
  getAnnotationCssVar,
  resolveCardBgColor,
  resolveMindMapEdgeColor,
} from '@shared/palette';
import {
  applyMindMapOperation,
  computeMindMapLayout,
  navigateMindMapByArrow,
  parseOrMigrateMindMapData,
  type MindMapOperation,
  type MindMapPositionedNode,
} from '../../primitives/canvas-math';

export interface MindmapNodeProps {
  object: WhiteboardObject;
  scale: number;
  isSelected: boolean;
  isDimmed?: boolean;
  dimmedOpacity?: number;
  cards?: Card[];
  highlightsMap?: Map<string, HighlightElement>;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onUpdateData: (id: string, propertiesJson: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onStartConnect?: (
    id: string,
    anchor: 'top' | 'bottom' | 'left' | 'right',
    point: { x: number; y: number }
  ) => void;
  onOpenCard?: (cardId: string) => void;
  onOpenDocument?: (documentId: string, highlightId?: string) => void;
  onTurnNodeIntoCard?: (title: string) => Promise<Card | null>;
  onDetachNodeToWhiteboard?: (
    node: MindMapNodeData,
    worldPos: { x: number; y: number }
  ) => Promise<void>;
}

const MAX_HISTORY = 40;

export function MindmapNode({
  object,
  scale,
  isSelected,
  isDimmed = false,
  dimmedOpacity = 0.25,
  cards = [],
  highlightsMap,
  onUpdatePosition,
  onDragEnd,
  onUpdateData,
  onDelete,
  onSelect,
  onStartConnect,
  onOpenCard,
  onOpenDocument,
  onTurnNodeIntoCard,
  onDetachNodeToWhiteboard,
}: MindmapNodeProps) {
  const [mindMap, setMindMap] = useState<MindMapData>(() =>
    parseOrMigrateMindMapData(object.properties_json)
  );
  const [undoStack, setUndoStack] = useState<MindMapData[]>([]);
  const [redoStack, setRedoStack] = useState<MindMapData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dropTargetNodeId, setDropTargetNodeId] = useState<string | null>(null);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [attachPickerMode, setAttachPickerMode] = useState<'card' | 'highlight' | null>(null);
  const [attachQuery, setAttachQuery] = useState('');
  const [convertingNodeId, setConvertingNodeId] = useState<string | null>(null);

  const rootContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingWholeRef = useRef(false);
  const dragStartRef = useRef({
    x: 0,
    y: 0,
    objX: 0,
    objY: 0,
    currentX: 0,
    currentY: 0,
  });

  useEffect(() => {
    setMindMap(parseOrMigrateMindMapData(object.properties_json));
  }, [object.properties_json]);

  useEffect(() => {
    if (!isSelected) {
      setSelectedNodeId(null);
      setEditingNodeId(null);
      setShowColorMenu(false);
      setAttachPickerMode(null);
    } else if (!selectedNodeId) {
      setSelectedNodeId(mindMap.rootNodeId);
    }
  }, [isSelected, mindMap.rootNodeId, selectedNodeId]);

  const cardsById = useMemo(() => {
    const map = new Map<string, Card>();
    for (const c of cards) map.set(c.id, c);
    return map;
  }, [cards]);

  const layoutResult = useMemo(() => computeMindMapLayout(mindMap), [mindMap]);

  const persistMindMap = useCallback(
    (nextData: MindMapData, pushHistory = true) => {
      if (pushHistory) {
        setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), mindMap]);
        setRedoStack([]);
      }
      setMindMap(nextData);
      let existingProps: Record<string, unknown> = {};
      try {
        if (object.properties_json) {
          existingProps = JSON.parse(object.properties_json) as Record<string, unknown>;
        }
      } catch {
        existingProps = {};
      }
      onUpdateData(object.id, JSON.stringify({ ...existingProps, mindMapV2: nextData }));
    },
    [mindMap, object.id, object.properties_json, onUpdateData]
  );

  const runOperation = useCallback(
    (op: MindMapOperation) => {
      const res = applyMindMapOperation(mindMap, op);
      if (res.status === 'ok') {
        persistMindMap(res.data, true);
      }
      return res;
    },
    [mindMap, persistMindMap]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), mindMap]);
    persistMindMap(previous, false);
  }, [mindMap, persistMindMap, undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), mindMap]);
    persistMindMap(next, false);
  }, [mindMap, persistMindMap, redoStack]);

  const handleWholeDragStart = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(object.id, e);
    isDraggingWholeRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      objX: object.pos_x,
      objY: object.pos_y,
      currentX: object.pos_x,
      currentY: object.pos_y,
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isDraggingWholeRef.current) return;
      const dx = (moveEvt.clientX - dragStartRef.current.x) / scale;
      const dy = (moveEvt.clientY - dragStartRef.current.y) / scale;
      const newX = dragStartRef.current.objX + dx;
      const newY = dragStartRef.current.objY + dy;
      dragStartRef.current.currentX = newX;
      dragStartRef.current.currentY = newY;
      onUpdatePosition(object.id, newX, newY);
    };

    const handleMouseUp = () => {
      if (isDraggingWholeRef.current) {
        isDraggingWholeRef.current = false;
        onDragEnd?.(object.id, dragStartRef.current.currentX, dragStartRef.current.currentY);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startEditingNode = useCallback((node: MindMapNodeData) => {
    if (node.type !== 'textNode' && node.type !== 'textElementNode') return;
    setSelectedNodeId(node.id);
    setEditingNodeId(node.id);
    setEditingText(node.content);
  }, []);

  const commitEditingNode = useCallback(() => {
    if (!editingNodeId) return;
    const trimmed = editingText.trim() || 'Untitled';
    runOperation({
      operation: 'updateTextNode',
      targetId: editingNodeId,
      content: trimmed,
    });
    setEditingNodeId(null);
    setEditingText('');
  }, [editingNodeId, editingText, runOperation]);

  const handleAddChild = useCallback(
    (parentId: string, side?: MindMapNodeSide | null) => {
      const res = runOperation({
        operation: 'addNode',
        parentId,
        side,
        nodeType: 'textNode',
        content: 'New topic',
      });
      if (res.status === 'ok' && res.createdNodeId) {
        setSelectedNodeId(res.createdNodeId);
        setEditingNodeId(res.createdNodeId);
        setEditingText('New topic');
      }
    },
    [runOperation]
  );

  const handleAddSibling = useCallback(
    (node: MindMapNodeData) => {
      if (!node.parentId) {
        handleAddChild(node.id);
        return;
      }
      const parent = mindMap.nodes.find((n) => n.id === node.parentId);
      if (!parent) return;
      const idx = parent.childNodeIds.indexOf(node.id);
      const res = runOperation({
        operation: 'addNode',
        parentId: parent.id,
        side: node.side,
        insertionIndex: idx >= 0 ? idx + 1 : undefined,
        nodeType: 'textNode',
        content: 'New topic',
      });
      if (res.status === 'ok' && res.createdNodeId) {
        setSelectedNodeId(res.createdNodeId);
        setEditingNodeId(res.createdNodeId);
        setEditingText('New topic');
      }
    },
    [handleAddChild, mindMap.nodes, runOperation]
  );

  const handleToggleCollapse = useCallback(
    (node: MindMapNodeData) => {
      if (node.childNodeIds.length === 0) return;
      runOperation({
        operation: 'setCollapsed',
        targetId: node.id,
        isCollapsed: !node.isCollapsed,
      });
    },
    [runOperation]
  );

  const handleDeleteNodeSubtree = useCallback(
    (node: MindMapNodeData) => {
      if (!node.parentId) return;
      const fallbackId = node.parentId;
      const res = runOperation({ operation: 'deleteSubtree', targetId: node.id });
      if (res.status === 'ok') {
        setSelectedNodeId(fallbackId);
        setEditingNodeId(null);
      }
    },
    [runOperation]
  );

  const handleTurnIntoCard = useCallback(
    async (node: MindMapNodeData) => {
      if (!onTurnNodeIntoCard || node.type !== 'textNode') return;
      setConvertingNodeId(node.id);
      try {
        const created = await onTurnNodeIntoCard(node.content.trim() || 'Untitled');
        if (created) {
          runOperation({
            operation: 'convertNode',
            targetId: node.id,
            nodeType: 'cardNode',
            content: created.title || node.content,
            cardId: created.id,
          });
        }
      } finally {
        setConvertingNodeId(null);
      }
    },
    [onTurnNodeIntoCard, runOperation]
  );

  const handleDetachNode = useCallback(
    async (box: MindMapPositionedNode) => {
      if (!onDetachNodeToWhiteboard || !box.node.parentId) return;
      await onDetachNodeToWhiteboard(box.node, {
        x: object.pos_x + box.x + 28,
        y: object.pos_y + box.y + 28,
      });
      runOperation({ operation: 'deleteSubtree', targetId: box.node.id });
      setSelectedNodeId(box.node.parentId);
    },
    [object.pos_x, object.pos_y, onDetachNodeToWhiteboard, runOperation]
  );

  const activeNodeBox = useMemo(() => {
    if (!selectedNodeId) return null;
    return layoutResult.nodeMap.get(selectedNodeId) ?? null;
  }, [layoutResult.nodeMap, selectedNodeId]);

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editingNodeId) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) handleRedo();
      else handleUndo();
      return;
    }
    if (!activeNodeBox) return;
    const node = activeNodeBox.node;

    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      handleAddChild(node.id);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleAddSibling(node);
      return;
    }
    if (e.key === 'F2') {
      e.preventDefault();
      e.stopPropagation();
      startEditingNode(node);
      return;
    }
    if (e.key === ' ' && node.childNodeIds.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      handleToggleCollapse(node);
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (node.parentId !== null) {
        e.preventDefault();
        e.stopPropagation();
        handleDeleteNodeSubtree(node);
      }
      return;
    }
    if (
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight'
    ) {
      e.preventDefault();
      e.stopPropagation();
      const nextId = navigateMindMapByArrow(layoutResult, node.id, e.key);
      if (nextId) {
        setSelectedNodeId(nextId);
      }
    }
  };

  const isLodThreshold = Math.round(scale * 100) <= 30;
  const rootNode = mindMap.nodes.find((n) => n.id === mindMap.rootNodeId) ?? mindMap.nodes[0];

  const attachableCards = useMemo(() => {
    const q = attachQuery.trim().toLowerCase();
    return cards
      .filter((c) => !q || (c.title || '').toLowerCase().includes(q))
      .slice(0, 30);
  }, [attachQuery, cards]);

  const attachableHighlights = useMemo(() => {
    if (!highlightsMap) return [];
    const q = attachQuery.trim().toLowerCase();
    return Array.from(highlightsMap.values())
      .filter(
        (h) =>
          !q ||
          (h.text_content || '').toLowerCase().includes(q) ||
          (h.note_text || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [attachQuery, highlightsMap]);

  const renderSideHandle = (
    box: MindMapPositionedNode,
    side: MindMapResolvedSide,
    hasChildrenOnSide: boolean
  ) => {
    const node = box.node;
    const isNodeSelected = selectedNodeId === node.id;
    const isCollapsedBranch = hasChildrenOnSide && node.isCollapsed;
    const edgeEntry = resolveMindMapEdgeColor(node.edgeColor);
    const modelSide: MindMapNodeSide = side === 'left' || side === 'top' ? 'left' : 'right';

    const positionClass =
      side === 'right'
        ? 'left-full top-1/2 -translate-y-1/2 flex-row'
        : side === 'left'
        ? 'right-full top-1/2 -translate-y-1/2 flex-row-reverse'
        : side === 'bottom'
        ? 'left-1/2 top-full -translate-x-1/2 flex-col'
        : 'left-1/2 bottom-full -translate-x-1/2 flex-col-reverse';

    const stemClass =
      side === 'left' || side === 'right' ? 'h-0.5 w-2' : 'w-0.5 h-2';

    const visibilityClass =
      isCollapsedBranch || isNodeSelected
        ? 'flex'
        : 'hidden group-hover/mmnode:flex';

    const renderChevron = () => {
      if (side === 'right') {
        return isCollapsedBranch ? <ChevronRight size={13} /> : <ChevronLeft size={13} />;
      }
      if (side === 'left') {
        return isCollapsedBranch ? <ChevronLeft size={13} /> : <ChevronRight size={13} />;
      }
      if (side === 'bottom') {
        return isCollapsedBranch ? <ChevronDown size={13} /> : <ChevronUp size={13} />;
      }
      return isCollapsedBranch ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
    };

    const showCollapseToggle = hasChildrenOnSide && (isCollapsedBranch || !isNodeSelected);

    return (
      <div
        key={side}
        className={`absolute items-center z-20 ${positionClass} ${visibilityClass}`}
      >
        <div
          className={stemClass}
          style={{ backgroundColor: isCollapsedBranch ? edgeEntry.stroke : 'var(--active-item)' }}
        />
        <button
          type="button"
          aria-label={
            showCollapseToggle
              ? isCollapsedBranch
                ? 'Expand node'
                : 'Collapse node'
              : 'Add child'
          }
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (showCollapseToggle) {
              handleToggleCollapse(node);
            } else {
              handleAddChild(node.id, modelSide);
            }
          }}
          style={
            isCollapsedBranch
              ? { backgroundColor: edgeEntry.stroke, borderColor: edgeEntry.stroke }
              : undefined
          }
          className={`flex items-center justify-center rounded-full border transition active:scale-90 cursor-pointer shadow-sm ${
            isCollapsedBranch
              ? 'h-5 min-w-5 px-1 text-[10px] font-bold text-white'
              : 'w-5 h-5 border-light-grey bg-background-primary text-active-item hover:bg-active-item hover:text-white hover:border-active-item'
          }`}
          title={
            showCollapseToggle
              ? isCollapsedBranch
                ? `Expand node (${box.hiddenDescendantCount} hidden)`
                : 'Collapse node (Space)'
              : 'Add child (Tab)'
          }
        >
          {isCollapsedBranch ? (
            <span className="flex items-center gap-0.5 leading-none">
              {box.hiddenDescendantCount}
              {renderChevron()}
            </span>
          ) : showCollapseToggle ? (
            renderChevron()
          ) : (
            <Plus size={12} />
          )}
        </button>
      </div>
    );
  };

  const renderNodeBody = (box: MindMapPositionedNode) => {
    const node = box.node;
    const isRoot = node.parentId === null;
    const isNodeSelected = selectedNodeId === node.id;
    const isEditing = editingNodeId === node.id;
    const isDropTarget = dropTargetNodeId === node.id;
    const edgeEntry = resolveMindMapEdgeColor(node.edgeColor);

    if (node.type === 'cardNode') {
      const card = node.cardId ? cardsById.get(node.cardId) : undefined;
      const cardTitle = card?.title || node.content || 'Untitled card';
      const cardExcerpt = (card?.content_text || '').replace(/\s+/g, ' ').trim();
      const bgColor = resolveCardBgColor(card?.color);

      return (
        <div
          style={{
            backgroundColor: bgColor,
            borderColor: isDropTarget
              ? 'var(--active-item)'
              : isNodeSelected
              ? 'var(--active-item)'
              : edgeEntry.stroke,
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (node.cardId && onOpenCard) onOpenCard(node.cardId);
          }}
          className={`w-full h-full rounded-xl border-2 px-3 py-2 flex flex-col justify-between shadow-sm transition ${
            isNodeSelected ? 'ring-2 ring-active-item/30 shadow-md' : 'hover:shadow-md'
          }`}
        >
          <div className="flex items-start justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <FileText size={13} className="shrink-0 text-active-item" />
              <span className="text-[12.5px] font-semibold text-text-color truncate">
                {cardTitle}
              </span>
            </div>
            {node.cardId && onOpenCard && (
              <button
                type="button"
                aria-label="Open card"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCard(node.cardId!);
                }}
                className="p-0.5 rounded hover:bg-black/10 text-middle-hard-grey hover:text-text-color shrink-0 cursor-pointer"
                title="Open card in side panel"
              >
                <ExternalLink size={11} />
              </button>
            )}
          </div>
          <p className="text-[11px] text-middle-hard-grey line-clamp-3 leading-snug mt-1">
            {cardExcerpt || 'Double-click to edit card content'}
          </p>
        </div>
      );
    }

    if (node.type === 'highlightElementNode') {
      const hl = node.highlightId ? highlightsMap?.get(node.highlightId) : undefined;
      const accentVar = getAnnotationCssVar(hl?.color ?? 'yellow');
      const quoteText = hl?.text_content || node.content || 'Highlight';

      return (
        <div
          style={{
            borderColor: isDropTarget || isNodeSelected ? 'var(--active-item)' : undefined,
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (hl?.source_id && onOpenDocument) {
              onOpenDocument(hl.source_id, hl.id);
            }
          }}
          className={`w-full h-full rounded-xl border bg-background-primary px-3 py-2 flex gap-2 shadow-sm transition ${
            isNodeSelected
              ? 'border-active-item ring-2 ring-active-item/30 shadow-md'
              : 'border-light-grey hover:border-active-item/50'
          }`}
        >
          <div
            className="w-1 rounded-full shrink-0"
            style={{ backgroundColor: accentVar }}
          />
          <div className="min-w-0 flex-1 flex flex-col justify-between">
            <p className="text-[11.5px] text-text-color line-clamp-2 leading-snug">
              {quoteText}
            </p>
            <div className="flex items-center justify-between text-[10px] text-middle-grey mt-1">
              <span className="flex items-center gap-1">
                <Highlighter size={10} />
                {hl?.page_number ? `p.${hl.page_number}` : hl?.source_type?.toUpperCase() || 'Highlight'}
              </span>
              {hl?.source_id && onOpenDocument && (
                <button
                  type="button"
                  aria-label="Locate highlight"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDocument(hl.source_id, hl.id);
                  }}
                  className="hover:text-active-item cursor-pointer"
                >
                  <ExternalLink size={10} />
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          borderColor:
            isDropTarget || isNodeSelected
              ? 'var(--active-item)'
              : isRoot
              ? 'var(--active-item)'
              : edgeEntry.stroke,
          backgroundColor: isRoot ? 'var(--active-item)' : 'var(--background-primary)',
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditingNode(node);
        }}
        className={`w-full h-full rounded-xl border-2 px-3 py-1.5 flex items-center justify-center text-center shadow-sm transition ${
          isRoot ? 'text-white font-semibold text-[13.5px]' : 'text-text-color text-[12.5px]'
        } ${isNodeSelected ? 'ring-2 ring-active-item/35 shadow-md' : 'hover:shadow-md'}`}
      >
        {isEditing ? (
          <input
            autoFocus
            value={editingText}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setEditingText(e.target.value)}
            onBlur={commitEditingNode}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEditingNode();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditingNodeId(null);
              }
            }}
            className={`w-full bg-transparent outline-none text-center ${
              isRoot ? 'text-white placeholder:text-white/70' : 'text-text-color'
            }`}
          />
        ) : (
          <span className="break-words leading-snug line-clamp-3">
            {node.content || (isRoot ? 'Mind map' : 'Topic')}
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      ref={rootContainerRef}
      tabIndex={0}
      data-object-id={object.id}
      data-object-type="mindmap_node"
      data-mindmap-root="true"
      onKeyDown={handleContainerKeyDown}
      onMouseDown={(e) => {
        if (e.button === 0) {
          onSelect(object.id, e);
          rootContainerRef.current?.focus({ preventScroll: true });
        }
      }}
      style={{
        transform: `translate3d(${object.pos_x}px, ${object.pos_y}px, 0)`,
        width: layoutResult.totalWidth,
        height: layoutResult.totalHeight,
        zIndex: isSelected ? 35 : object.z_index || 12,
        opacity: isDimmed ? dimmedOpacity : 1,
      }}
      className={`group/mmroot pointer-events-none absolute top-0 left-0 rounded-2xl transition-opacity duration-200 select-none outline-none ${
        isSelected
          ? 'ring-1 ring-active-item/40 bg-background-primary/25'
          : 'hover:ring-1 hover:ring-light-grey/70'
      }`}
    >
      {isSelected && (
        <div
          onMouseDown={handleWholeDragStart}
          className="pointer-events-auto absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-light-grey shadow-main z-50 text-xs whitespace-nowrap"
        >
          <span
            className="p-1 text-middle-grey hover:text-text-color cursor-grab active:cursor-grabbing"
            title="Drag mind map"
          >
            <GripHorizontal size={13} />
          </span>

          <button
            type="button"
            aria-label="Toggle mind map layout"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              runOperation({
                operation: 'setLayout',
                layout: mindMap.layout === 'horizontal' ? 'vertical' : 'horizontal',
              });
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color transition cursor-pointer"
            title={
              mindMap.layout === 'horizontal'
                ? 'Switch to Vertical layout'
                : 'Switch to Horizontal layout'
            }
          >
            {mindMap.layout === 'horizontal' ? (
              <>
                <ArrowLeftRight size={13} />
                <span>Horizontal</span>
              </>
            ) : (
              <>
                <ArrowUpDown size={13} />
                <span>Vertical</span>
              </>
            )}
          </button>

          <div className="h-3.5 w-[1px] bg-light-grey mx-0.5" />

          <button
            type="button"
            aria-label="Undo mind map"
            disabled={undoStack.length === 0}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleUndo();
            }}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color disabled:opacity-35 cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            aria-label="Redo mind map"
            disabled={redoStack.length === 0}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleRedo();
            }}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color disabled:opacity-35 cursor-pointer"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 size={13} />
          </button>

          {activeNodeBox && (
            <>
              <div className="h-3.5 w-[1px] bg-light-grey mx-0.5" />

              {activeNodeBox.node.parentId !== null && (
                <div className="relative">
                  <button
                    type="button"
                    aria-label="Branch color"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAttachPickerMode(null);
                      setShowColorMenu((prev) => !prev);
                    }}
                    className="flex items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color cursor-pointer"
                    title="Change branch color"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: resolveMindMapEdgeColor(activeNodeBox.node.edgeColor)
                          .stroke,
                      }}
                    />
                    <Palette size={12} />
                  </button>
                  {showColorMenu && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-8 p-1.5 rounded-xl bg-menu-bg border border-light-grey shadow-xl flex items-center gap-1.5 z-50"
                    >
                      {HEPTA_MINDMAP_EDGE_PALETTE.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          aria-label={`Branch color ${entry.label}`}
                          onClick={() => {
                            runOperation({
                              operation: 'setEdgeColor',
                              targetId: activeNodeBox.node.id,
                              edgeColor: entry.id as MindMapEdgeColor,
                            });
                            setShowColorMenu(false);
                          }}
                          style={{ backgroundColor: entry.stroke }}
                          className={`w-4 h-4 rounded-full cursor-pointer transition hover:scale-110 ${
                            activeNodeBox.node.edgeColor === entry.id
                              ? 'ring-2 ring-offset-1 ring-active-item'
                              : ''
                          }`}
                          title={entry.label}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeNodeBox.node.type === 'textNode' && onTurnNodeIntoCard && (
                <button
                  type="button"
                  aria-label="Turn into note card"
                  disabled={convertingNodeId === activeNodeBox.node.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleTurnIntoCard(activeNodeBox.node);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color cursor-pointer"
                  title="Turn node into a Note Card"
                >
                  <FileText size={12} />
                  <span>Turn into card</span>
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  aria-label="Attach card to mind map"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowColorMenu(false);
                    setAttachQuery('');
                    setAttachPickerMode((prev) => (prev === 'card' ? null : 'card'));
                  }}
                  className="flex items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color cursor-pointer"
                  title="Attach existing card as child node"
                >
                  <Plus size={12} />
                  <FileText size={12} />
                </button>
              </div>

              {highlightsMap && highlightsMap.size > 0 && (
                <button
                  type="button"
                  aria-label="Attach highlight to mind map"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowColorMenu(false);
                    setAttachQuery('');
                    setAttachPickerMode((prev) => (prev === 'highlight' ? null : 'highlight'));
                  }}
                  className="flex items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color cursor-pointer"
                  title="Attach highlight as child node"
                >
                  <Plus size={12} />
                  <Highlighter size={12} />
                </button>
              )}

              {activeNodeBox.node.parentId !== null &&
                (activeNodeBox.node.type === 'cardNode' ||
                  activeNodeBox.node.type === 'highlightElementNode') &&
                onDetachNodeToWhiteboard && (
                  <button
                    type="button"
                    aria-label="Detach to whiteboard"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDetachNode(activeNodeBox);
                    }}
                    className="flex items-center gap-1 px-1.5 py-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color cursor-pointer"
                    title="Detach node onto whiteboard"
                  >
                    <Unlink size={12} />
                  </button>
                )}

              {activeNodeBox.node.parentId !== null && (
                <button
                  type="button"
                  aria-label="Delete branch"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNodeSubtree(activeNodeBox.node);
                  }}
                  className="p-1 rounded-lg hover:bg-danger-item/15 text-middle-hard-grey hover:text-danger-item cursor-pointer"
                  title="Delete node & subtree (Delete)"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </>
          )}

          <div className="h-3.5 w-[1px] bg-light-grey mx-0.5" />

          <button
            type="button"
            aria-label="Delete mind map"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(object.id);
            }}
            className="p-1 rounded-lg hover:bg-danger-item/15 text-middle-hard-grey hover:text-danger-item cursor-pointer"
            title="Delete entire mind map"
          >
            <Trash2 size={13} />
          </button>

          {attachPickerMode && activeNodeBox && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-9 w-64 rounded-xl bg-menu-bg border border-light-grey shadow-2xl p-2 flex flex-col gap-1.5 z-50"
            >
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-ultra-light-grey border border-light-grey">
                <Search size={12} className="text-middle-grey shrink-0" />
                <input
                  autoFocus
                  value={attachQuery}
                  onChange={(e) => setAttachQuery(e.target.value)}
                  placeholder={
                    attachPickerMode === 'card' ? 'Search cards...' : 'Search highlights...'
                  }
                  className="flex-1 bg-transparent outline-none text-xs text-text-color"
                />
                <button
                  type="button"
                  onClick={() => setAttachPickerMode(null)}
                  className="text-middle-grey hover:text-text-color cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                {attachPickerMode === 'card'
                  ? attachableCards.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          const res = runOperation({
                            operation: 'addNode',
                            parentId: activeNodeBox.node.id,
                            nodeType: 'cardNode',
                            content: c.title || 'Untitled',
                            cardId: c.id,
                          });
                          if (res.status === 'ok' && res.createdNodeId) {
                            setSelectedNodeId(res.createdNodeId);
                          }
                          setAttachPickerMode(null);
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-ultra-light-grey text-left text-xs text-text-color cursor-pointer truncate"
                      >
                        <FileText size={12} className="shrink-0 text-active-item" />
                        <span className="truncate">{c.title || 'Untitled card'}</span>
                      </button>
                    ))
                  : attachableHighlights.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => {
                          const res = runOperation({
                            operation: 'addNode',
                            parentId: activeNodeBox.node.id,
                            nodeType: 'highlightElementNode',
                            content: h.text_content || 'Highlight',
                            highlightId: h.id,
                          });
                          if (res.status === 'ok' && res.createdNodeId) {
                            setSelectedNodeId(res.createdNodeId);
                          }
                          setAttachPickerMode(null);
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-ultra-light-grey text-left text-xs text-text-color cursor-pointer truncate"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: getAnnotationCssVar(h.color) }}
                        />
                        <span className="truncate">{h.text_content || 'Highlight'}</span>
                      </button>
                    ))}
              </div>
            </div>
          )}
        </div>
      )}

      {onStartConnect && (
        <>
          {(['top', 'bottom', 'left', 'right'] as const).map((anchor) => {
            const posClass =
              anchor === 'top'
                ? '-top-2 left-1/2 -translate-x-1/2'
                : anchor === 'bottom'
                ? '-bottom-2 left-1/2 -translate-x-1/2'
                : anchor === 'left'
                ? '-left-2 top-1/2 -translate-y-1/2'
                : '-right-2 top-1/2 -translate-y-1/2';
            return (
              <div
                key={anchor}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const pt =
                    anchor === 'top'
                      ? { x: object.pos_x + layoutResult.totalWidth / 2, y: object.pos_y }
                      : anchor === 'bottom'
                      ? {
                          x: object.pos_x + layoutResult.totalWidth / 2,
                          y: object.pos_y + layoutResult.totalHeight,
                        }
                      : anchor === 'left'
                      ? { x: object.pos_x, y: object.pos_y + layoutResult.totalHeight / 2 }
                      : {
                          x: object.pos_x + layoutResult.totalWidth,
                          y: object.pos_y + layoutResult.totalHeight / 2,
                        };
                  onStartConnect(object.id, anchor, pt);
                }}
                className={`pointer-events-auto absolute ${posClass} w-3 h-3 rounded-full bg-background-primary border-2 border-active-item opacity-0 group-hover/mmroot:opacity-100 hover:scale-125 transition-all cursor-crosshair z-30 shadow-sm`}
              />
            );
          })}
        </>
      )}

      {isLodThreshold ? (
        <div
          onMouseDown={handleWholeDragStart}
          className="pointer-events-auto w-full h-full flex flex-col items-center justify-center rounded-2xl bg-background-primary/90 border-2 border-active-item/60 shadow-sm cursor-grab"
        >
          <Network size={28} className="text-active-item mb-1.5" />
          <span className="text-sm font-bold text-text-color px-4 text-center truncate max-w-full">
            {rootNode?.content || 'Mind map'}
          </span>
          <span className="text-[11px] text-middle-grey mt-0.5">
            {mindMap.nodes.length} nodes
          </span>
        </div>
      ) : (
        <div className="relative w-full h-full">
          <svg
            width={layoutResult.totalWidth}
            height={layoutResult.totalHeight}
            className="absolute inset-0 pointer-events-none overflow-visible"
          >
            {layoutResult.edges.map((edge) => {
              const strokeColor = resolveMindMapEdgeColor(edge.edgeColor).stroke;
              return (
                <path
                  key={edge.id}
                  d={edge.path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {layoutResult.nodes.map((box) => {
            const node = box.node;
            const isRoot = node.parentId === null;
            const isNodeSelected = selectedNodeId === node.id;
            const isVertical = mindMap.layout === 'vertical';

            const childSides = new Set<MindMapResolvedSide>();
            for (const cid of node.childNodeIds) {
              const c = mindMap.nodes.find((n) => n.id === cid);
              if (!c) continue;
              const rs: MindMapResolvedSide = isVertical
                ? c.side === 'left'
                  ? 'top'
                  : 'bottom'
                : c.side === 'left'
                ? 'left'
                : 'right';
              childSides.add(rs);
            }

            const activeSides: MindMapResolvedSide[] = isRoot
              ? isVertical
                ? ['top', 'bottom']
                : ['left', 'right']
              : box.resolvedSide
              ? [box.resolvedSide]
              : ['right'];

            return (
              <div
                key={box.id}
                data-mindmap-node-id={node.id}
                data-mindmap-node-type={node.type}
                aria-label={`Mindmap node: ${node.content || (isRoot ? 'Mind map' : 'Topic')}`}
                draggable={!isRoot && editingNodeId !== node.id}
                onDragStart={(e) => {
                  if (isRoot) return;
                  e.stopPropagation();
                  setDraggingNodeId(node.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', node.id);
                }}
                onDragEnd={() => {
                  setDraggingNodeId(null);
                  setDropTargetNodeId(null);
                }}
                onDragOver={(e) => {
                  if (!draggingNodeId || draggingNodeId === node.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropTargetNodeId !== node.id) {
                    setDropTargetNodeId(node.id);
                  }
                }}
                onDragLeave={() => {
                  if (dropTargetNodeId === node.id) setDropTargetNodeId(null);
                }}
                onDrop={(e) => {
                  if (!draggingNodeId || draggingNodeId === node.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  runOperation({
                    operation: 'moveNode',
                    targetId: draggingNodeId,
                    newParentId: node.id,
                  });
                  setDraggingNodeId(null);
                  setDropTargetNodeId(null);
                }}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  if (isRoot && editingNodeId !== node.id) {
                    setSelectedNodeId(node.id);
                    handleWholeDragStart(e);
                    return;
                  }
                  e.stopPropagation();
                  onSelect(object.id, e);
                  setSelectedNodeId(node.id);
                  rootContainerRef.current?.focus({ preventScroll: true });
                }}
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                }}
                className={`group/mmnode pointer-events-auto absolute transition-transform duration-150 ${
                  draggingNodeId === node.id ? 'opacity-50' : ''
                } ${isRoot ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
              >
                {renderNodeBody(box)}

                {activeSides.map((s) => renderSideHandle(box, s, childSides.has(s)))}

                {!isRoot && isNodeSelected && (
                  <div
                    className={`absolute flex items-center justify-center z-20 ${
                      isVertical
                        ? 'left-full top-1/2 -translate-y-1/2 pl-2'
                        : 'left-1/2 top-full -translate-x-1/2 pt-2'
                    }`}
                  >
                    <button
                      type="button"
                      aria-label="Add sibling"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddSibling(node);
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded-full border border-light-grey bg-background-primary text-active-item hover:bg-active-item hover:text-white hover:border-active-item shadow-sm transition active:scale-90 cursor-pointer"
                      title="Add sibling (Enter)"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
