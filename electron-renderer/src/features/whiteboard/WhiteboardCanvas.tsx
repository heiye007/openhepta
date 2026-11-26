import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ViewportState,
  Point,
  screenToWorld,
  getVisibleWorldBounds,
  isObjectInViewport,
  alignObjects,
  arrangeObjects,
  lintWhiteboard,
  computeBoundingBox,
  computeSmartGuides,
  AlignmentGuide,
  LintIssue,
  createDefaultMindMapData,
} from '../../primitives/canvas-math';
import type {
  Whiteboard,
  WhiteboardObject,
  WhiteboardStatsRow,
  Connection,
  Card,
  DocumentRecord,
  HighlightElement,
  AnnotationColor,
  AlignmentType,
  ArrangeLayoutType,
  WhiteboardOptions,
  MindMapNodeData,
} from '@shared/types';
import { HEPTA_DEFAULT_DIMENSIONS } from '@shared/types';
import { HEPTA_CARD_PALETTE } from '@shared/palette';
import { heptaClient } from '../../client';
import { useAppModal } from '../../primitives/AppModal';
import { WhiteboardCardNode, CardTagBadge } from './WhiteboardCardNode';
import { DocumentNode } from './DocumentNode';
import { HighlightNode } from './HighlightNode';
import { SectionNode } from './SectionNode';
import { MindmapNode } from './MindmapNode';
import { SubWhiteboardNode } from './SubWhiteboardNode';
import { MediaNode, detectMediaKind } from './MediaNode';
import { docFromMarkdown, docToJson } from '../../primitives/card-editor/prosemirror/serializer';
import { ConnectionLayer } from './ConnectionLayer';
import { WhiteboardHeader, type WhiteboardBreadcrumbItem } from './WhiteboardHeader';
import {
  MousePointer,
  Hand,
  Link2,
  StickyNote,
  Type,
  Layers,
  Network,
  Calendar,
  FolderPlus,
  Paperclip,
  MoreHorizontal,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Columns,
  Rows,
  LayoutGrid,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  Palette,
  X,
  ZoomIn,
  ZoomOut,
  Search,
  BookOpen,
  Bookmark,
  Sliders,
  Mouse,
  Touchpad,
  Keyboard,
  Check,
  ArrowUpRight,
  FileUp,
  Eye,
} from 'lucide-react';

export interface WhiteboardCanvasProps {
  whiteboardId: string;
  whiteboardName?: string;
  onUpdateWhiteboardName?: (id: string, name: string) => void;
  cards: Card[];
  onRefreshCards: () => void;
  onOpenCardDrawer?: (cardId: string) => void;
  onOpenFullCard?: (cardId: string) => void;
  onOpenDocument?: (documentId: string, highlightId?: string) => void;
  refreshKey?: number;
  onDeleteWhiteboard?: (id: string) => void;
  onOpenMap?: () => void;
  isSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  isSidePanelOpen?: boolean;
  onToggleSidePanel?: () => void;
  onSwitchWhiteboard?: (whiteboardId: string) => void;
  onWhiteboardsChanged?: () => void;
  breadcrumbs?: WhiteboardBreadcrumbItem[];
}

export type ToolMode =
  | 'select'
  | 'grab'
  | 'connect'
  | 'createCard'
  | 'createText'
  | 'createMindmap'
  | 'createSection'
  | 'sub_whiteboard';

const DEFAULT_WHITEBOARD_OPTIONS: WhiteboardOptions = {
  subWhiteboardView: 'list',
  showTagsAndProperties: true,
  isFullTitleFoldedCardMode: false,
  isLargeTextAtSmallZoom: true,
  showMentionLinks: true,
  smartGuidesEnabled: true,
  showGridBackground: true,
  snapToGrid: false,
  showMinimap: true,
  isFocusMode: false,
  connectionDepth: 1,
  focusModeOpacity: 0.25,
  previewMode: 'markdown',
  navigationMode: 'mouse',
};

function parseWhiteboardOptions(rawJson?: string | null): Partial<WhiteboardOptions> {
  if (!rawJson) return {};
  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<WhiteboardOptions> = {};
    if (parsed.subWhiteboardView === 'list' || parsed.subWhiteboardView === 'preview') {
      out.subWhiteboardView = parsed.subWhiteboardView;
    }
    if (typeof parsed.showTagsAndProperties === 'boolean') {
      out.showTagsAndProperties = parsed.showTagsAndProperties;
    }
    if (typeof parsed.isFullTitleFoldedCardMode === 'boolean') {
      out.isFullTitleFoldedCardMode = parsed.isFullTitleFoldedCardMode;
    }
    if (typeof parsed.isLargeTextAtSmallZoom === 'boolean') {
      out.isLargeTextAtSmallZoom = parsed.isLargeTextAtSmallZoom;
    }
    if (typeof parsed.showMentionLinks === 'boolean') {
      out.showMentionLinks = parsed.showMentionLinks;
    }
    if (typeof parsed.smartGuidesEnabled === 'boolean') {
      out.smartGuidesEnabled = parsed.smartGuidesEnabled;
    }
    if (typeof parsed.showGridBackground === 'boolean') {
      out.showGridBackground = parsed.showGridBackground;
    }
    if (typeof parsed.snapToGrid === 'boolean') {
      out.snapToGrid = parsed.snapToGrid;
    }
    if (typeof parsed.showMinimap === 'boolean') {
      out.showMinimap = parsed.showMinimap;
    }
    if (typeof parsed.isFocusMode === 'boolean') {
      out.isFocusMode = parsed.isFocusMode;
    }
    if (typeof parsed.connectionDepth === 'number' && Number.isFinite(parsed.connectionDepth)) {
      out.connectionDepth = Math.max(0, Math.min(5, Math.round(parsed.connectionDepth)));
    }
    if (typeof parsed.focusModeOpacity === 'number' && Number.isFinite(parsed.focusModeOpacity)) {
      out.focusModeOpacity = Math.max(0, Math.min(1, parsed.focusModeOpacity));
    }
    if (parsed.previewMode === 'static' || parsed.previewMode === 'markdown') {
      out.previewMode = parsed.previewMode;
    }
    if (parsed.navigationMode === 'mouse' || parsed.navigationMode === 'trackpad') {
      out.navigationMode = parsed.navigationMode;
    }
    return out;
  } catch {
    return {};
  }
}

function readCachedWhiteboardOptions(whiteboardId: string): WhiteboardOptions {
  try {
    const raw = localStorage.getItem(`openhepta.wb.options.${whiteboardId}`);
    return { ...DEFAULT_WHITEBOARD_OPTIONS, ...parseWhiteboardOptions(raw) };
  } catch {
    return DEFAULT_WHITEBOARD_OPTIONS;
  }
}

function writeCachedWhiteboardOptions(whiteboardId: string, options: WhiteboardOptions): void {
  try {
    localStorage.setItem(`openhepta.wb.options.${whiteboardId}`, JSON.stringify(options));
  } catch {
  }
}

function OptionToggleRow({
  title,
  description,
  checked,
  onToggle,
  icon,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      onClick={onToggle}
      className="w-full flex items-start justify-between gap-2.5 px-2.5 py-2 rounded-lg hover:bg-ultra-light-grey text-left transition cursor-pointer"
    >
      <div className="min-w-0 flex-1 flex items-start gap-2">
        {icon && <span className="mt-0.5 shrink-0 text-middle-hard-grey">{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-text-color leading-snug">{title}</div>
          {description && (
            <div className="text-[11px] text-middle-grey leading-snug mt-0.5">{description}</div>
          )}
        </div>
      </div>
      <span
        className={`mt-0.5 relative inline-flex h-[18px] w-[32px] shrink-0 items-center rounded-full transition-colors duration-150 ${
          checked ? 'bg-active-item' : 'bg-middle-grey'
        }`}
      >
        <span
          className={`inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-150 ${
            checked ? 'translate-x-[16px]' : 'translate-x-[2px]'
          }`}
        />
      </span>
    </button>
  );
}

function parseJsonObject(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isSubWhiteboardObject(obj: WhiteboardObject): boolean {
  if (obj.object_type === 'whiteboard_shortcut') return true;
  const props = parseJsonObject(obj.properties_json);
  return Boolean(props.isSubWhiteboard);
}

function getSubWhiteboardTargetId(obj: WhiteboardObject): string {
  if (obj.target_id) return obj.target_id;
  const props = parseJsonObject(obj.properties_json);
  return typeof props.subWhiteboardId === 'string' ? props.subWhiteboardId : '';
}

function isChildSubWhiteboardObject(obj: WhiteboardObject): boolean {
  const props = parseJsonObject(obj.properties_json);
  return props.isChild !== false;
}

function normalizeSectionColorKey(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return 'white';
  const lowered = raw.trim().toLowerCase();
  const valid = ['white', 'yellow', 'red', 'blue', 'green', 'black', 'orange', 'purple'];
  for (const key of valid) {
    if (lowered === key || lowered.includes(`-${key}-`)) {
      return key;
    }
  }
  return 'white';
}

function getObjectSideAnchor(
  obj: WhiteboardObject,
  side: 'top' | 'right' | 'bottom' | 'left'
): Point {
  if (side === 'top') return { x: obj.pos_x + obj.width / 2, y: obj.pos_y };
  if (side === 'bottom') return { x: obj.pos_x + obj.width / 2, y: obj.pos_y + obj.height };
  if (side === 'left') return { x: obj.pos_x, y: obj.pos_y + obj.height / 2 };
  return { x: obj.pos_x + obj.width, y: obj.pos_y + obj.height / 2 };
}

export function WhiteboardCanvas({
  whiteboardId,
  whiteboardName = '思维白板',
  onUpdateWhiteboardName,
  cards,
  onRefreshCards,
  onOpenCardDrawer,
  onOpenFullCard,
  onOpenDocument,
  refreshKey,
  onDeleteWhiteboard,
  onOpenMap,
  isSidebarCollapsed = false,
  onExpandSidebar,
  isSidePanelOpen = false,
  onToggleSidePanel,
  onSwitchWhiteboard,
  onWhiteboardsChanged,
  breadcrumbs,
}: WhiteboardCanvasProps) {
  const { showConfirm } = useAppModal();
  const containerRef = useRef<HTMLDivElement>(null);

  const [overrideWhiteboardId, setOverrideWhiteboardId] = useState<string | null>(null);
  useEffect(() => {
    setOverrideWhiteboardId(null);
  }, [whiteboardId]);

  useEffect(() => {
    const handleSelectWhiteboard = (e: Event) => {
      const custom = e as CustomEvent<{ whiteboardId?: string }>;
      if (custom.detail?.whiteboardId) {
        setOverrideWhiteboardId(custom.detail.whiteboardId);
      }
    };
    window.addEventListener('openhepta:select-whiteboard', handleSelectWhiteboard);
    return () => window.removeEventListener('openhepta:select-whiteboard', handleSelectWhiteboard);
  }, []);

  const activeWhiteboardId = overrideWhiteboardId ?? whiteboardId;

  const [wbOptions, setWbOptions] = useState<WhiteboardOptions>(() =>
    readCachedWhiteboardOptions(activeWhiteboardId)
  );
  useEffect(() => {
    setWbOptions(readCachedWhiteboardOptions(activeWhiteboardId));
  }, [activeWhiteboardId]);

  const subWhiteboardView = wbOptions.subWhiteboardView;
  const showTagsAndProperties = wbOptions.showTagsAndProperties;
  const showMinimap = wbOptions.showMinimap;
  const isFullTitleFoldedCardMode = wbOptions.isFullTitleFoldedCardMode;
  const isLargeTextAtSmallZoom = wbOptions.isLargeTextAtSmallZoom;
  const showMentionLinks = wbOptions.showMentionLinks;
  const smartGuidesEnabled = wbOptions.smartGuidesEnabled;
  const showGridBackground = wbOptions.showGridBackground;
  const snapToGrid = wbOptions.snapToGrid;
  const isFocusMode = wbOptions.isFocusMode;
  const connectionDepth = wbOptions.connectionDepth;
  const focusModeOpacity = wbOptions.focusModeOpacity;
  const previewMode = wbOptions.previewMode;
  const navigationMode = wbOptions.navigationMode;

  const updateWhiteboardOption = useCallback(
    <K extends keyof WhiteboardOptions>(key: K, value: WhiteboardOptions[K]) => {
      setWbOptions((prev) => {
        const next = { ...prev, [key]: value };
        writeCachedWhiteboardOptions(activeWhiteboardId, next);
        return next;
      });
      void heptaClient.whiteboards.updateOptions(activeWhiteboardId, { [key]: value });
    },
    [activeWhiteboardId]
  );

  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showNavigationMenu, setShowNavigationMenu] = useState(false);

  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  const [isSmoothZooming, setIsSmoothZooming] = useState(false);
  const smoothZoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerSmoothTransition = useCallback(() => {
    setIsSmoothZooming(true);
    if (smoothZoomTimerRef.current) clearTimeout(smoothZoomTimerRef.current);
    smoothZoomTimerRef.current = setTimeout(() => setIsSmoothZooming(false), 220);
  }, []);

  const [recentlyCreatedSectionId, setRecentlyCreatedSectionId] = useState<string | null>(null);
  const [renamingSubWbObjId, setRenamingSubWbObjId] = useState<string | null>(null);
  const [dropTargetSubWbObjId, setDropTargetSubWbObjId] = useState<string | null>(null);
  const dropTargetSubWbObjIdRef = useRef<string | null>(null);
  const [subWbCreationBox, setSubWbCreationBox] = useState<{
    startWorld: Point;
    currentWorld: Point;
  } | null>(null);
  const isCreatingSubWbBoxRef = useRef(false);
  const subWbBoxStartRef = useRef<Point>({ x: 0, y: 0 });
  const [showShortcutPopover, setShowShortcutPopover] = useState(false);
  const [shortcutSearchQuery, setShortcutSearchQuery] = useState('');
  const [shortcutPlaceWorldPos, setShortcutPlaceWorldPos] = useState<Point | null>(null);
  const [canvasContextMenu, setCanvasContextMenu] = useState<{
    screenX: number;
    screenY: number;
    worldPos: Point;
  } | null>(null);
  const [subWbToast, setSubWbToast] = useState<{
    type: 'success' | 'warning';
    message: string;
    targetWhiteboardId?: string;
  } | null>(null);
  const subWbToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSubWbToast = useCallback(
    (toast: { type: 'success' | 'warning'; message: string; targetWhiteboardId?: string }) => {
      setSubWbToast(toast);
      if (subWbToastTimerRef.current) clearTimeout(subWbToastTimerRef.current);
      subWbToastTimerRef.current = setTimeout(() => setSubWbToast(null), 5000);
    },
    []
  );

  const pointerWorldRef = useRef<Point | null>(null);
  const isAltKeyRef = useRef(false);
  const copiedObjectsRef = useRef<WhiteboardObject[]>([]);

  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const toolBeforeTemporarilyUseGrabToolRef = useRef<ToolMode | null>(null);

  const [showMoreToolsMenu, setShowMoreToolsMenu] = useState(false);

  const [viewport, setViewport] = useState<ViewportState>({
    panX: 0,
    panY: 0,
    zoom: 1.0,
  });

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const [objects, setObjects] = useState<WhiteboardObject[]>([]);
  const objectsRef = useRef<WhiteboardObject[]>([]);
  objectsRef.current = objects;
  const [connections, setConnections] = useState<Connection[]>([]);
  const [allWhiteboards, setAllWhiteboards] = useState<Whiteboard[]>([]);
  const [whiteboardStatsMap, setWhiteboardStatsMap] = useState<Record<string, WhiteboardStatsRow>>(
    {}
  );
  const [cardTagsMap, setCardTagsMap] = useState<Map<string, CardTagBadge[]>>(new Map());
  const [cardWhiteboardCounts, setCardWhiteboardCounts] = useState<Map<string, number>>(new Map());
  const [cardBacklinkCounts, setCardBacklinkCounts] = useState<Map<string, number>>(new Map());
  const [documentsMap, setDocumentsMap] = useState<Map<string, DocumentRecord>>(new Map());
  const [highlightsMap, setHighlightsMap] = useState<Map<string, HighlightElement>>(new Map());
  const [docHighlightCounts, setDocHighlightCounts] = useState<Map<string, number>>(new Map());

  const [selectedObjectIds, setSelectedObjectIds] = useState<Set<string>>(new Set());
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  const [selectionBox, setSelectionBox] = useState<{
    startWorld: Point;
    currentWorld: Point;
  } | null>(null);
  const isMarqueeRef = useRef(false);
  const marqueeStartRef = useRef<Point>({ x: 0, y: 0 });
  const marqueeBaseSelectionRef = useRef<Set<string>>(new Set());

  const [activeConnectLine, setActiveConnectLine] = useState<{
    sourceId: string;
    sourceAnchor: 'top' | 'bottom' | 'left' | 'right';
    startPoint: Point;
    currentPoint: Point;
  } | null>(null);

  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [showLintModal, setShowLintModal] = useState(false);

  const [showBatchColorPicker, setShowBatchColorPicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);

  interface HistoryMoveStep {
    type: 'move';
    changes: Array<{ id: string; oldX: number; oldY: number; newX: number; newY: number }>;
  }
  const undoStackRef = useRef<HistoryMoveStep[]>([]);
  const redoStackRef = useRef<HistoryMoveStep[]>([]);
  const dragOriginsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; startPanX: number; startPanY: number }>({
    clientX: 0,
    clientY: 0,
    startPanX: 0,
    startPanY: 0,
  });
  const isSpacePressedRef = useRef(false);

  const notifyWhiteboardsChanged = useCallback(() => {
    onWhiteboardsChanged?.();
    window.dispatchEvent(new CustomEvent('openhepta:whiteboards-changed'));
  }, [onWhiteboardsChanged]);

  const handleNavigateToWhiteboard = useCallback(
    (targetWbId: string) => {
      if (!targetWbId) return;
      setSelectedObjectIds(new Set());
      setSelectedConnectionId(null);
      setSubWbToast(null);
      setOverrideWhiteboardId(targetWbId);
      onSwitchWhiteboard?.(targetWbId);
    },
    [onSwitchWhiteboard]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      isAltKeyRef.current = e.altKey;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      pointerWorldRef.current = screenToWorld(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        viewport
      );
    };
    const handleGlobalMouseUp = () => {
      setActiveGuides([]);
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [viewport]);

  const hydratedViewportWbIdRef = useRef<string | null>(null);
  const viewportRef = useRef<ViewportState>(viewport);
  viewportRef.current = viewport;
  const rightDragMovedRef = useRef(false);
  const saveViewportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveViewport = useCallback(
    (vp: ViewportState) => {
      if (saveViewportTimeoutRef.current) clearTimeout(saveViewportTimeoutRef.current);
      saveViewportTimeoutRef.current = setTimeout(async () => {
        try {
          await heptaClient.whiteboards.updateViewport(activeWhiteboardId, vp.panX, vp.panY, vp.zoom);
        } catch (err) {
          console.error('Failed to save viewport:', err);
        }
      }, 500);
    },
    [activeWhiteboardId]
  );

  const loadWhiteboardData = useCallback(async () => {
    if (!activeWhiteboardId) return;
    try {
      const [wb, wbsList, stats] = await Promise.all([
        heptaClient.whiteboards.get(activeWhiteboardId),
        heptaClient.whiteboards.list(),
        heptaClient.whiteboards.getStatsMap(),
      ]);
      setAllWhiteboards(wbsList || []);
      setWhiteboardStatsMap(stats || {});

      if (wb) {
        if (hydratedViewportWbIdRef.current !== activeWhiteboardId) {
          hydratedViewportWbIdRef.current = activeWhiteboardId;
          setViewport({
            panX: wb.viewport_pan_x ?? 0,
            panY: wb.viewport_pan_y ?? 0,
            zoom: wb.viewport_zoom ?? 1.0,
          });
        }
        const persisted = parseWhiteboardOptions(wb.options_json);
        if (Object.keys(persisted).length > 0) {
          setWbOptions((prev) => {
            const merged = { ...prev, ...persisted };
            writeCachedWhiteboardOptions(activeWhiteboardId, merged);
            return merged;
          });
        }
      }

      const objs = await heptaClient.whiteboards.listObjects(activeWhiteboardId);
      setObjects(objs);

      const conns = await heptaClient.whiteboards.listConnections(activeWhiteboardId);
      setConnections(conns);

      try {
        const tagRows = await heptaClient.cards.listAllCardTags();
        const nextTagsMap = new Map<string, CardTagBadge[]>();
        for (const row of tagRows) {
          const list = nextTagsMap.get(row.card_id) || [];
          list.push({ id: row.tag_id, name: row.name, color: row.color });
          nextTagsMap.set(row.card_id, list);
        }
        setCardTagsMap(nextTagsMap);

        const wbRows = await heptaClient.cards.listAllCardWhiteboards();
        const wbSets = new Map<string, Set<string>>();
        for (const row of wbRows) {
          let set = wbSets.get(row.target_id);
          if (!set) {
            set = new Set<string>();
            wbSets.set(row.target_id, set);
          }
          set.add(row.whiteboard_id);
        }
        const nextWbCounts = new Map<string, number>();
        for (const [targetId, set] of wbSets.entries()) {
          nextWbCounts.set(targetId, set.size);
        }
        setCardWhiteboardCounts(nextWbCounts);

        const refRows = await heptaClient.cards.listBacklinkCounts();
        const nextRefCounts = new Map<string, number>();
        for (const row of refRows) {
          nextRefCounts.set(row.target_card_id, row.cnt);
        }
        setCardBacklinkCounts(nextRefCounts);
      } catch {
      }

      try {
        const docs = await heptaClient.documents.list();
        const nextDocsMap = new Map<string, DocumentRecord>();
        for (const doc of docs) {
          nextDocsMap.set(doc.id, doc);
        }
        setDocumentsMap(nextDocsMap);

        const hlRows = await heptaClient.highlights.list();
        const nextHlMap = new Map<string, HighlightElement>();
        const nextDocHlCounts = new Map<string, number>();
        for (const hl of hlRows) {
          nextHlMap.set(hl.id, hl);
          nextDocHlCounts.set(hl.source_id, (nextDocHlCounts.get(hl.source_id) || 0) + 1);
        }
        setHighlightsMap(nextHlMap);
        setDocHighlightCounts(nextDocHlCounts);
      } catch {
      }

      setLintIssues(lintWhiteboard(objs));
    } catch (err) {
      console.error('Failed to load whiteboard data:', err);
    }
  }, [activeWhiteboardId]);

  useEffect(() => {
    loadWhiteboardData();
  }, [loadWhiteboardData, refreshKey]);

  useEffect(() => {
    const handleWhiteboardsChanged = () => {
      void loadWhiteboardData();
    };
    window.addEventListener('openhepta:whiteboards-changed', handleWhiteboardsChanged);
    return () => window.removeEventListener('openhepta:whiteboards-changed', handleWhiteboardsChanged);
  }, [loadWhiteboardData]);

  const zoomToTarget = useCallback(
    (targetZoom: number) => {
      const clampedZoom = Math.min(3.0, Math.max(0.1, targetZoom));
      triggerSmoothTransition();
      setViewport((v) => {
        const cx = containerSize.width / 2;
        const cy = containerSize.height / 2;
        const worldCenterX = (cx - v.panX) / v.zoom;
        const worldCenterY = (cy - v.panY) / v.zoom;
        const nextVp: ViewportState = {
          zoom: clampedZoom,
          panX: cx - worldCenterX * clampedZoom,
          panY: cy - worldCenterY * clampedZoom,
        };
        saveViewport(nextVp);
        return nextVp;
      });
    },
    [containerSize, saveViewport, triggerSmoothTransition]
  );

  const handleZoomToFit = useCallback(() => {
    triggerSmoothTransition();
    if (objects.length === 0) {
      const resetVp = { panX: 0, panY: 0, zoom: 1.0 };
      setViewport(resetVp);
      saveViewport(resetVp);
      return;
    }
    const box = computeBoundingBox(objects);
    const padding = 120;
    const availW = Math.max(containerSize.width - padding * 2, 200);
    const availH = Math.max(containerSize.height - padding * 2, 200);

    const scaleX = availW / Math.max(box.width, 100);
    const scaleY = availH / Math.max(box.height, 100);
    const targetZoom = Math.max(0.15, Math.min(1.5, Math.min(scaleX, scaleY)));

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    const newPanX = containerSize.width / 2 - centerX * targetZoom;
    const newPanY = containerSize.height / 2 - centerY * targetZoom;

    const newVp: ViewportState = {
      zoom: targetZoom,
      panX: newPanX,
      panY: newPanY,
    };
    setViewport(newVp);
    saveViewport(newVp);
  }, [objects, containerSize, saveViewport, triggerSmoothTransition]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.code === 'Space' && !e.repeat) {
        isSpacePressedRef.current = true;
        if (!toolBeforeTemporarilyUseGrabToolRef.current) {
          toolBeforeTemporarilyUseGrabToolRef.current = toolMode;
        }
        setToolMode('grab');
        return;
      }

      if (e.shiftKey && (e.key === '0' || e.code === 'Digit0')) {
        e.preventDefault();
        zoomToTarget(1.0);
        return;
      }
      if (e.shiftKey && (e.key === '1' || e.code === 'Digit1')) {
        e.preventDefault();
        handleZoomToFit();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomToTarget(viewport.zoom + 0.15);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'ArrowDown' || e.key === '-')) {
        e.preventDefault();
        zoomToTarget(viewport.zoom - 0.15);
        return;
      }

      if (target && target.closest('[data-mindmap-root]')) {
        const lower = e.key.toLowerCase();
        if (
          e.key === 'Tab' ||
          e.key === 'Enter' ||
          e.key === 'Backspace' ||
          e.key === 'Delete' ||
          e.key === ' ' ||
          e.key === 'F2' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          ((e.ctrlKey || e.metaKey) && lower === 'z')
        ) {
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        const step = undoStackRef.current.pop();
        if (step && step.type === 'move') {
          redoStackRef.current.push(step);
          setObjects((prev) =>
            prev.map((obj) => {
              const ch = step.changes.find((c) => c.id === obj.id);
              return ch ? { ...obj, pos_x: ch.oldX, pos_y: ch.oldY } : obj;
            })
          );
          heptaClient.whiteboards
            .batchUpdateObjects(step.changes.map((c) => ({ id: c.id, posX: c.oldX, posY: c.oldY })))
            .catch(console.error);
        }
        return;
      }

      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        const step = redoStackRef.current.pop();
        if (step && step.type === 'move') {
          undoStackRef.current.push(step);
          setObjects((prev) =>
            prev.map((obj) => {
              const ch = step.changes.find((c) => c.id === obj.id);
              return ch ? { ...obj, pos_x: ch.newX, pos_y: ch.newY } : obj;
            })
          );
          heptaClient.whiteboards
            .batchUpdateObjects(step.changes.map((c) => ({ id: c.id, posX: c.newX, posY: c.newY })))
            .catch(console.error);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const selectedText = window.getSelection()?.toString();
        if (!selectedText && selectedObjectIds.size > 0) {
          e.preventDefault();
          copiedObjectsRef.current = objects
            .filter((o) => selectedObjectIds.has(o.id))
            .map((o) => ({ ...o }));
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (copiedObjectsRef.current.length > 0) {
          e.preventDefault();
          void handlePasteCopiedObjects();
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        setShowSearchModal((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        fileInputRef.current?.click();
        return;
      }

      if (((e.ctrlKey || e.metaKey) && e.key === '/') || (!e.ctrlKey && !e.metaKey && e.key === '?')) {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setToolMode('select');
            break;
          case 'h':
            setToolMode((prev) => (prev === 'grab' ? 'select' : 'grab'));
            break;
          case 'c':
            setToolMode('connect');
            break;
          case 'n':
            handleCreateCardObject();
            break;
          case 't':
            handleCreateCardObject(undefined, 'text');
            break;
          case 'g':
            if (selectedObjectIds.size > 0) {
              void handleCreateSectionForSelected();
            } else {
              void handleCreateSectionObject();
            }
            break;
          case 'm':
            handleCreateMindmapObject();
            break;
          case 'w':
            handleCreateSubWhiteboardObject();
            break;
          case 'delete':
          case 'backspace':
            if (selectedObjectIds.size > 0) {
              handleBatchDelete();
            } else if (selectedConnectionId) {
              handleDeleteConnection(selectedConnectionId);
            }
            break;
          case 'escape':
            setSelectedObjectIds(new Set());
            setSelectedConnectionId(null);
            setShowLintModal(false);
            setShowBatchColorPicker(false);
            setShowMoreToolsMenu(false);
            setShowSearchModal(false);
            setShowOptionsMenu(false);
            setShowShortcutsModal(false);
            setShowNavigationMenu(false);
            setShowShortcutPopover(false);
            setCanvasContextMenu(null);
            setToolMode('select');
            break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        if (toolBeforeTemporarilyUseGrabToolRef.current) {
          setToolMode(toolBeforeTemporarilyUseGrabToolRef.current);
          toolBeforeTemporarilyUseGrabToolRef.current = null;
        } else {
          setToolMode('select');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [toolMode, selectedObjectIds, selectedConnectionId, handleZoomToFit]);

  const objectsMap = useMemo(() => {
    const map = new Map<string, WhiteboardObject>();
    for (const obj of objects) {
      map.set(obj.id, obj);
    }
    return map;
  }, [objects]);

  const whiteboardsMap = useMemo(() => {
    const map = new Map<string, Whiteboard>();
    for (const wb of allWhiteboards) {
      map.set(wb.id, wb);
    }
    return map;
  }, [allWhiteboards]);

  const activeWhiteboardRecord = whiteboardsMap.get(activeWhiteboardId) || null;
  const effectiveWhiteboardName =
    activeWhiteboardRecord?.name ||
    (activeWhiteboardId === whiteboardId ? whiteboardName : 'Untitled Whiteboard');

  const effectiveBreadcrumbs = useMemo<WhiteboardBreadcrumbItem[]>(() => {
    if (!activeWhiteboardRecord) {
      return activeWhiteboardId === whiteboardId ? breadcrumbs || [] : [];
    }
    if (!activeWhiteboardRecord.parent_whiteboard_id) return [];
    const chain: WhiteboardBreadcrumbItem[] = [];
    let cur: Whiteboard | undefined = activeWhiteboardRecord;
    const visited = new Set<string>();
    while (cur && cur.parent_whiteboard_id && !visited.has(cur.id)) {
      visited.add(cur.id);
      const parent = whiteboardsMap.get(cur.parent_whiteboard_id);
      if (!parent) break;
      const pid = parent.id;
      chain.unshift({
        id: pid,
        name: parent.name,
        onClick: () => handleNavigateToWhiteboard(pid),
      });
      cur = parent;
    }
    return chain;
  }, [
    activeWhiteboardRecord,
    activeWhiteboardId,
    whiteboardId,
    breadcrumbs,
    whiteboardsMap,
    handleNavigateToWhiteboard,
  ]);

  const filteredShortcutWhiteboards = useMemo(() => {
    const q = shortcutSearchQuery.trim().toLowerCase();
    return allWhiteboards.filter((wb) => {
      if (wb.id === activeWhiteboardId || wb.is_deleted === 1) return false;
      if (!q) return true;
      return wb.name.toLowerCase().includes(q);
    });
  }, [allWhiteboards, activeWhiteboardId, shortcutSearchQuery]);

  const cardsMap = useMemo(() => {
    const map = new Map<string, Card>();
    for (const c of cards) {
      map.set(c.id, c);
    }
    return map;
  }, [cards]);

  const visibleBounds = useMemo(() => {
    return getVisibleWorldBounds(viewport, containerSize.width, containerSize.height);
  }, [viewport, containerSize]);

  const visibleObjects = useMemo(() => {
    return objects.filter((obj) =>
      isObjectInViewport(
        { x: obj.pos_x, y: obj.pos_y, width: obj.width, height: obj.height },
        visibleBounds,
        250
      )
    );
  }, [objects, visibleBounds]);

  const focusedObjectIds = useMemo<Set<string> | null>(() => {
    if (!isFocusMode || selectedObjectIds.size === 0) return null;
    const result = new Set<string>(selectedObjectIds);
    let frontier = new Set<string>(selectedObjectIds);
    for (let depth = 0; depth < connectionDepth; depth++) {
      const nextFrontier = new Set<string>();
      for (const conn of connections) {
        if (frontier.has(conn.source_object_id) && !result.has(conn.target_object_id)) {
          result.add(conn.target_object_id);
          nextFrontier.add(conn.target_object_id);
        }
        if (frontier.has(conn.target_object_id) && !result.has(conn.source_object_id)) {
          result.add(conn.source_object_id);
          nextFrontier.add(conn.source_object_id);
        }
      }
      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }
    return result;
  }, [isFocusMode, selectedObjectIds, connectionDepth, connections]);

  const mentionLinkPairs = useMemo(() => {
    if (!showMentionLinks) return [];
    const cardObjsByTitle = new Map<string, WhiteboardObject>();
    for (const obj of objects) {
      if (obj.object_type === 'card' && obj.target_id) {
        const c = cardsMap.get(obj.target_id);
        if (c?.title) {
          cardObjsByTitle.set(c.title.trim().toLowerCase(), obj);
        }
      }
    }
    const pairs: Array<{ id: string; source: WhiteboardObject; target: WhiteboardObject }> = [];
    const seen = new Set<string>();
    for (const obj of objects) {
      if (obj.object_type !== 'card' || !obj.target_id) continue;
      const c = cardsMap.get(obj.target_id);
      if (!c?.content_text) continue;
      const regex = /\[\[([^\]]+)\]\]/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(c.content_text)) !== null) {
        const targetTitle = match[1].trim().toLowerCase();
        const targetObj = cardObjsByTitle.get(targetTitle);
        if (targetObj && targetObj.id !== obj.id) {
          const key = `${obj.id}->${targetObj.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            pairs.push({ id: key, source: obj, target: targetObj });
          }
        }
      }
    }
    return pairs;
  }, [showMentionLinks, objects, cardsMap]);

  const multiSelectionToolbarPos = useMemo(() => {
    if (selectedObjectIds.size < 2) return null;
    const selectedObjs = objects.filter((o) => selectedObjectIds.has(o.id));
    if (selectedObjs.length === 0) return null;

    const box = computeBoundingBox(selectedObjs);
    const screenX = (box.x + box.width / 2) * viewport.zoom + viewport.panX;
    const screenY = box.y * viewport.zoom + viewport.panY - 48;

    return {
      left: Math.max(160, Math.min(containerSize.width - 240, screenX)),
      top: Math.max(68, Math.min(containerSize.height - 60, screenY)),
    };
  }, [selectedObjectIds, objects, viewport, containerSize]);

  const handleWheel = (e: React.WheelEvent) => {
    const targetEl = e.target as HTMLElement | null;
    if (
      targetEl?.closest(
        '[data-canvas-ui], [role="menu"], [role="dialog"], .hepta-slash-menu, .hepta-mention-menu, .hepta-whiteboard-picker'
      )
    ) {
      return;
    }
    const openEditorMenu = document.querySelector(
      '.hepta-slash-menu, .hepta-mention-menu, .hepta-whiteboard-picker'
    ) as HTMLElement | null;
    if (openEditorMenu) {
      e.preventDefault();
      const scrollList = openEditorMenu.querySelector('.overflow-y-auto') as HTMLElement | null;
      if (scrollList) {
        scrollList.scrollTop += e.deltaY;
      }
      return;
    }
    e.preventDefault();
    if (!containerRef.current) return;
    if (isSmoothZooming) setIsSmoothZooming(false);

    if (e.ctrlKey || e.metaKey) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseScreen: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };

      const zoomFactor =
        Math.abs(e.deltaY) < 24
          ? Math.exp(-e.deltaY * 0.012)
          : e.deltaY < 0
          ? 1.08
          : 0.92;
      const targetZoom = Math.min(3.0, Math.max(0.1, viewport.zoom * zoomFactor));

      const mouseWorld = screenToWorld(mouseScreen, viewport);
      const newPanX = mouseScreen.x - mouseWorld.x * targetZoom;
      const newPanY = mouseScreen.y - mouseWorld.y * targetZoom;

      const newVp: ViewportState = {
        zoom: targetZoom,
        panX: newPanX,
        panY: newPanY,
      };

      setViewport(newVp);
      saveViewport(newVp);
    } else {
      const dx = navigationMode === 'mouse' && e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      const dy = navigationMode === 'mouse' && e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
      const newVp: ViewportState = {
        ...viewport,
        panX: viewport.panX - dx,
        panY: viewport.panY - dy,
      };
      setViewport(newVp);
      saveViewport(newVp);
    }
  };

  const startCanvasPan = (e: React.MouseEvent, isRightButton: boolean) => {
    if (e.button === 1) {
      e.preventDefault();
    }
    if (isRightButton) {
      rightDragMovedRef.current = false;
    }
    if (isSmoothZooming) setIsSmoothZooming(false);
    isPanningRef.current = true;
    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startPanX: viewportRef.current.panX,
      startPanY: viewportRef.current.panY,
    };

    const handleWindowPanMove = (moveEvent: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = moveEvent.clientX - panStartRef.current.clientX;
      const dy = moveEvent.clientY - panStartRef.current.clientY;
      if (isRightButton && !rightDragMovedRef.current && Math.hypot(dx, dy) <= 3) {
        return;
      }
      if (isRightButton) {
        rightDragMovedRef.current = true;
      }
      const newVp: ViewportState = {
        zoom: viewportRef.current.zoom,
        panX: panStartRef.current.startPanX + dx,
        panY: panStartRef.current.startPanY + dy,
      };
      setViewport(newVp);
      saveViewport(newVp);
    };

    const handleWindowPanUp = () => {
      isPanningRef.current = false;
      window.removeEventListener('mousemove', handleWindowPanMove);
      window.removeEventListener('mouseup', handleWindowPanUp);
    };

    window.addEventListener('mousemove', handleWindowPanMove);
    window.addEventListener('mouseup', handleWindowPanUp);
  };

  const handleMouseDownCapture = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isMiddlePan = e.button === 1;
    const isRightPan = e.button === 2;
    const isGrabLeftPan =
      e.button === 0 &&
      (toolMode === 'grab' || isSpacePressedRef.current) &&
      !target.closest('button, input, textarea, [role="dialog"], [role="menu"]');

    if (isMiddlePan || isRightPan || isGrabLeftPan) {
      if (canvasContextMenu) {
        setCanvasContextMenu(null);
      }
      if (isMiddlePan || isGrabLeftPan) {
        e.stopPropagation();
        e.preventDefault();
      }
      startCanvasPan(e, isRightPan);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const targetEl = e.target as HTMLElement;
    const isInsideCanvasMenu = Boolean(targetEl.closest('[role="menu"]'));
    if (canvasContextMenu && !isInsideCanvasMenu) {
      setCanvasContextMenu(null);
    }
    const isGrab =
      toolMode === 'grab' ||
      isSpacePressedRef.current ||
      e.button === 1 ||
      e.button === 2;
    if (isGrab) {
      if (!isPanningRef.current) {
        startCanvasPan(e, e.button === 2);
      }
      return;
    }

    if (targetEl.closest('[data-canvas-ui], button, input, textarea, [role="dialog"], [role="menu"]')) {
      return;
    }

    const clickedObject = targetEl.closest('[data-object-id]');
    const clickedSectionOnly =
      clickedObject && clickedObject.getAttribute('data-object-type') === 'section';
    if (clickedObject && !(clickedSectionOnly && e.shiftKey)) return;

    if (toolMode === 'sub_whiteboard' && e.button === 0 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const worldPos = screenToWorld(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        viewport
      );
      isCreatingSubWbBoxRef.current = true;
      subWbBoxStartRef.current = worldPos;
      setSubWbCreationBox({ startWorld: worldPos, currentWorld: worldPos });
      return;
    }

    if (toolMode === 'select' && e.button === 0) {
      const isAdditive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!isAdditive) {
        setSelectedObjectIds(new Set());
        setSelectedConnectionId(null);
        marqueeBaseSelectionRef.current = new Set();
      } else {
        marqueeBaseSelectionRef.current = new Set(selectedObjectIds);
      }

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const worldPos = screenToWorld(
          { x: e.clientX - rect.left, y: e.clientY - rect.top },
          viewportRef.current
        );
        isMarqueeRef.current = true;
        marqueeStartRef.current = worldPos;
        setSelectionBox({ startWorld: worldPos, currentWorld: worldPos });

        const handleWindowMarqueeMove = (moveEvent: MouseEvent) => {
          if (!isMarqueeRef.current || !containerRef.current) return;
          const curRect = containerRef.current.getBoundingClientRect();
          const currentWorld = screenToWorld(
            { x: moveEvent.clientX - curRect.left, y: moveEvent.clientY - curRect.top },
            viewportRef.current
          );
          setSelectionBox({
            startWorld: marqueeStartRef.current,
            currentWorld,
          });
          const x1 = Math.min(marqueeStartRef.current.x, currentWorld.x);
          const x2 = Math.max(marqueeStartRef.current.x, currentWorld.x);
          const y1 = Math.min(marqueeStartRef.current.y, currentWorld.y);
          const y2 = Math.max(marqueeStartRef.current.y, currentWorld.y);
          const hitIds = new Set<string>(marqueeBaseSelectionRef.current);
          for (const obj of objectsRef.current) {
            const intersects = !(
              obj.pos_x + obj.width < x1 ||
              obj.pos_x > x2 ||
              obj.pos_y + obj.height < y1 ||
              obj.pos_y > y2
            );
            if (intersects) hitIds.add(obj.id);
          }
          setSelectedObjectIds(hitIds);
        };

        const handleWindowMarqueeUp = () => {
          isMarqueeRef.current = false;
          setSelectionBox(null);
          window.removeEventListener('mousemove', handleWindowMarqueeMove);
          window.removeEventListener('mouseup', handleWindowMarqueeUp);
        };

        window.addEventListener('mousemove', handleWindowMarqueeMove);
        window.addEventListener('mouseup', handleWindowMarqueeUp);
      }
    }
  };

  const handleCanvasContextMenuCapture = (e: React.MouseEvent) => {
    if (rightDragMovedRef.current) {
      rightDragMovedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    if (rightDragMovedRef.current) {
      rightDragMovedRef.current = false;
      e.preventDefault();
      return;
    }
    const clickedObject = (e.target as HTMLElement).closest('[data-object-id]');
    if (clickedObject || !containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const worldPos = screenToWorld(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      viewport
    );
    setCanvasContextMenu({
      screenX: Math.min(e.clientX - rect.left, Math.max(16, rect.width - 230)),
      screenY: Math.min(e.clientY - rect.top, Math.max(56, rect.height - 200)),
      worldPos,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      return;
    }

    if (isCreatingSubWbBoxRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const currentWorld = screenToWorld(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        viewport
      );
      setSubWbCreationBox({
        startWorld: subWbBoxStartRef.current,
        currentWorld,
      });
      return;
    }

    if (isMarqueeRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const currentWorld = screenToWorld(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        viewport
      );
      setSelectionBox({
        startWorld: marqueeStartRef.current,
        currentWorld,
      });

      const x1 = Math.min(marqueeStartRef.current.x, currentWorld.x);
      const x2 = Math.max(marqueeStartRef.current.x, currentWorld.x);
      const y1 = Math.min(marqueeStartRef.current.y, currentWorld.y);
      const y2 = Math.max(marqueeStartRef.current.y, currentWorld.y);

      const hitIds = new Set<string>(marqueeBaseSelectionRef.current);
      for (const obj of objects) {
        const intersects = !(
          obj.pos_x + obj.width < x1 ||
          obj.pos_x > x2 ||
          obj.pos_y + obj.height < y1 ||
          obj.pos_y > y2
        );
        if (intersects) hitIds.add(obj.id);
      }
      setSelectedObjectIds(hitIds);
      return;
    }

    if (activeConnectLine && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const currentWorld = screenToWorld(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        viewport
      );
      setActiveConnectLine((prev) => (prev ? { ...prev, currentPoint: currentWorld } : null));
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;

    if (isCreatingSubWbBoxRef.current) {
      isCreatingSubWbBoxRef.current = false;
      const box = subWbCreationBox;
      setSubWbCreationBox(null);
      if (box) {
        const rawW = Math.abs(box.currentWorld.x - box.startWorld.x);
        const rawH = Math.abs(box.currentWorld.y - box.startWorld.y);
        const defaultDim = HEPTA_DEFAULT_DIMENSIONS.sub_whiteboard || { width: 640, height: 420 };
        if (rawW > 20 || rawH > 20) {
          void handleCreateSubWhiteboardObject({
            x: Math.min(box.startWorld.x, box.currentWorld.x),
            y: Math.min(box.startWorld.y, box.currentWorld.y),
            width: Math.max(220, Math.round(rawW)),
            height: Math.max(128, Math.round(rawH)),
          });
        } else {
          void handleCreateSubWhiteboardObject({
            x: box.startWorld.x - defaultDim.width / 2,
            y: box.startWorld.y - defaultDim.height / 2,
            width: defaultDim.width,
            height: defaultDim.height,
          });
        }
      }
      return;
    }

    if (isMarqueeRef.current) {
      isMarqueeRef.current = false;
      setSelectionBox(null);
    }

    if (activeConnectLine) {
      if (containerRef.current) {
        const targetObj = objects.find(
          (obj) =>
            obj.id !== activeConnectLine.sourceId &&
            activeConnectLine.currentPoint.x >= obj.pos_x &&
            activeConnectLine.currentPoint.x <= obj.pos_x + obj.width &&
            activeConnectLine.currentPoint.y >= obj.pos_y &&
            activeConnectLine.currentPoint.y <= obj.pos_y + obj.height
        );

        if (targetObj) {
          const dxLeft = Math.abs(activeConnectLine.currentPoint.x - targetObj.pos_x);
          const dxRight = Math.abs(activeConnectLine.currentPoint.x - (targetObj.pos_x + targetObj.width));
          const dyTop = Math.abs(activeConnectLine.currentPoint.y - targetObj.pos_y);
          const dyBottom = Math.abs(activeConnectLine.currentPoint.y - (targetObj.pos_y + targetObj.height));
          const minDist = Math.min(dxLeft, dxRight, dyTop, dyBottom);
          const endPos: 'top' | 'bottom' | 'left' | 'right' =
            minDist === dxLeft
              ? 'left'
              : minDist === dxRight
              ? 'right'
              : minDist === dyTop
              ? 'top'
              : 'bottom';
          void handleCreateConnection(
            activeConnectLine.sourceId,
            targetObj.id,
            activeConnectLine.sourceAnchor,
            endPos
          );
        }
      }
      setActiveConnectLine(null);
    }
  };

  const handleSelectObject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedConnectionId(null);

    if (toolMode === 'connect') {
      if (selectedObjectIds.size === 1) {
        const sourceId = Array.from(selectedObjectIds)[0];
        if (sourceId !== id) {
          const srcObj = objectsMap.get(sourceId);
          const dstObj = objectsMap.get(id);
          let beginSide: 'auto' | 'top' | 'bottom' | 'left' | 'right' = 'auto';
          let endSide: 'auto' | 'top' | 'bottom' | 'left' | 'right' = 'auto';
          if (srcObj && dstObj) {
            const dx = dstObj.pos_x + dstObj.width / 2 - (srcObj.pos_x + srcObj.width / 2);
            const dy = dstObj.pos_y + dstObj.height / 2 - (srcObj.pos_y + srcObj.height / 2);
            const gapX = Math.max(
              0,
              dstObj.pos_x - (srcObj.pos_x + srcObj.width),
              srcObj.pos_x - (dstObj.pos_x + dstObj.width)
            );
            const gapY = Math.max(
              0,
              dstObj.pos_y - (srcObj.pos_y + srcObj.height),
              srcObj.pos_y - (dstObj.pos_y + dstObj.height)
            );
            const horizontal = gapX > 0 && gapY === 0 ? true : gapY > 0 && gapX === 0 ? false : gapX >= gapY;
            if (horizontal) {
              beginSide = dx >= 0 ? 'right' : 'left';
              endSide = dx >= 0 ? 'left' : 'right';
            } else {
              beginSide = dy >= 0 ? 'bottom' : 'top';
              endSide = dy >= 0 ? 'top' : 'bottom';
            }
          }
          void handleCreateConnection(sourceId, id, beginSide, endSide);
          setSelectedObjectIds(new Set([id]));
          return;
        }
      }
      setSelectedObjectIds(new Set([id]));
      return;
    }

    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelectedObjectIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    } else {
      if (!selectedObjectIds.has(id)) {
        setSelectedObjectIds(new Set([id]));
      }
    }
  };

  const findDropTargetSubWhiteboard = (
    movingIds: Set<string>,
    fallbackWorldPoint?: Point
  ): WhiteboardObject | null => {
    const checkPoints: Point[] = [];
    if (pointerWorldRef.current) checkPoints.push(pointerWorldRef.current);
    if (fallbackWorldPoint) checkPoints.push(fallbackWorldPoint);
    if (checkPoints.length === 0) return null;

    const candidates = objects
      .filter((obj) => {
        if (movingIds.has(obj.id)) return false;
        if (!isSubWhiteboardObject(obj)) return false;
        const targetId = getSubWhiteboardTargetId(obj);
        if (!targetId) return false;
        const targetWb = whiteboardsMap.get(targetId);
        if (targetWb && targetWb.is_deleted === 1) return false;
        return true;
      })
      .sort((a, b) => (b.z_index || 0) - (a.z_index || 0));

    for (const pt of checkPoints) {
      for (const candidate of candidates) {
        if (
          pt.x >= candidate.pos_x &&
          pt.x <= candidate.pos_x + candidate.width &&
          pt.y >= candidate.pos_y &&
          pt.y <= candidate.pos_y + candidate.height
        ) {
          return candidate;
        }
      }
    }
    return null;
  };

  const executeDropIntoSubWhiteboard = async (
    draggedId: string,
    targetSubWbObjId: string,
    copyMode: boolean
  ): Promise<boolean> => {
    const targetObj = objectsMap.get(targetSubWbObjId);
    if (!targetObj) return false;
    const targetWbId = getSubWhiteboardTargetId(targetObj);
    if (!targetWbId) return false;

    const movingIds =
      selectedObjectIds.has(draggedId) && selectedObjectIds.size > 1
        ? Array.from(selectedObjectIds).filter((oid) => oid !== targetSubWbObjId)
        : [draggedId];

    if (movingIds.length === 0) return false;

    try {
      const result = await heptaClient.whiteboards.moveObjectsAcross({
        sourceWhiteboardId: activeWhiteboardId,
        targetWhiteboardId: targetWbId,
        objectIds: movingIds,
        copy: copyMode,
      });

      dragOriginsRef.current.clear();

      if (result.cycleBlockedIds.length > 0 && result.movedObjectIds.length === 0) {
        await loadWhiteboardData();
        showSubWbToast({
          type: 'warning',
          message: 'Cannot move a whiteboard into its own descendant',
        });
        return true;
      }

      if (result.movedObjectIds.length > 0) {
        setSelectedObjectIds(new Set());
        await loadWhiteboardData();
        notifyWhiteboardsChanged();
        const verb = copyMode ? 'Copied' : 'Moved';
        const baseMsg = `${verb} ${result.movedObjectIds.length} item(s)`;
        const message =
          result.cycleBlockedIds.length > 0
            ? `${baseMsg}; ${result.cycleBlockedIds.length} stayed behind`
            : baseMsg;
        showSubWbToast({
          type: 'success',
          message,
          targetWhiteboardId: targetWbId,
        });
        return true;
      }
    } catch (err) {
      console.error('Failed to drop objects into sub-whiteboard:', err);
      await loadWhiteboardData();
    }
    return false;
  };

  const handleUpdatePosition = (id: string, rawX: number, rawY: number) => {
    const primaryObj = objectsMap.get(id);
    if (!primaryObj) return;

    if (dragOriginsRef.current.size === 0) {
      if (selectedObjectIds.has(id) && selectedObjectIds.size > 1) {
        for (const sid of selectedObjectIds) {
          const o = objectsMap.get(sid);
          if (o) dragOriginsRef.current.set(sid, { x: o.pos_x, y: o.pos_y });
        }
      } else {
        dragOriginsRef.current.set(id, { x: primaryObj.pos_x, y: primaryObj.pos_y });
      }
    }

    const otherObjects = objects.filter((o) => o.id !== id && !selectedObjectIds.has(o.id));
    let effectiveX = rawX;
    let effectiveY = rawY;
    if (smartGuidesEnabled) {
      const snap = computeSmartGuides(
        { x: rawX, y: rawY, width: primaryObj.width, height: primaryObj.height },
        otherObjects,
        12
      );
      setActiveGuides(snap.guides);
      effectiveX = snap.x;
      effectiveY = snap.y;
    } else {
      setActiveGuides([]);
    }
    if (showGridBackground && snapToGrid) {
      const gridStep = 32;
      effectiveX = Math.round(effectiveX / gridStep) * gridStep;
      effectiveY = Math.round(effectiveY / gridStep) * gridStep;
    }
    const origin = dragOriginsRef.current.get(id) || { x: primaryObj.pos_x, y: primaryObj.pos_y };
    const totalDx = effectiveX - origin.x;
    const totalDy = effectiveY - origin.y;

    const movingSet =
      selectedObjectIds.has(id) && selectedObjectIds.size > 1
        ? new Set(selectedObjectIds)
        : new Set([id]);
    const dropTarget = findDropTargetSubWhiteboard(movingSet, {
      x: effectiveX + primaryObj.width / 2,
      y: effectiveY + primaryObj.height / 2,
    });
    const nextDropId = dropTarget ? dropTarget.id : null;
    if (dropTargetSubWbObjIdRef.current !== nextDropId) {
      dropTargetSubWbObjIdRef.current = nextDropId;
      setDropTargetSubWbObjId(nextDropId);
    }

    if (selectedObjectIds.has(id) && selectedObjectIds.size > 1) {
      setObjects((prev) =>
        prev.map((obj) => {
          if (selectedObjectIds.has(obj.id)) {
            const objOrigin = dragOriginsRef.current.get(obj.id) || { x: obj.pos_x, y: obj.pos_y };
            return { ...obj, pos_x: objOrigin.x + totalDx, pos_y: objOrigin.y + totalDy };
          }
          return obj;
        })
      );
    } else {
      setObjects((prev) =>
        prev.map((obj) => (obj.id === id ? { ...obj, pos_x: effectiveX, pos_y: effectiveY } : obj))
      );
    }
  };

  const handleCardDragEnd = async (cardId: string, finalX: number, finalY: number) => {
    setActiveGuides([]);

    const activeDropTargetId = dropTargetSubWbObjIdRef.current;
    dropTargetSubWbObjIdRef.current = null;
    setDropTargetSubWbObjId(null);

    if (activeDropTargetId) {
      const handled = await executeDropIntoSubWhiteboard(
        cardId,
        activeDropTargetId,
        isAltKeyRef.current
      );
      if (handled) return;
    }

    const liveObjects = objectsRef.current;
    if (dragOriginsRef.current.size > 0) {
      const changes: Array<{ id: string; oldX: number; oldY: number; newX: number; newY: number }> = [];
      for (const [oid, origin] of dragOriginsRef.current.entries()) {
        const cur = liveObjects.find((o) => o.id === oid);
        if (cur && (Math.abs(cur.pos_x - origin.x) > 0.5 || Math.abs(cur.pos_y - origin.y) > 0.5)) {
          changes.push({ id: oid, oldX: origin.x, oldY: origin.y, newX: cur.pos_x, newY: cur.pos_y });
        }
      }
      if (changes.length > 0) {
        undoStackRef.current.push({ type: 'move', changes });
        redoStackRef.current = [];
      }
      dragOriginsRef.current.clear();
    }

    if (selectedObjectIds.has(cardId) && selectedObjectIds.size > 1) {
      try {
        const updates = Array.from(selectedObjectIds).map((id) => {
          const obj = liveObjects.find((o) => o.id === id);
          return {
            id,
            posX: obj?.pos_x ?? 0,
            posY: obj?.pos_y ?? 0,
          };
        });
        await heptaClient.whiteboards.batchUpdateObjects(updates);
        setLintIssues(lintWhiteboard(liveObjects));
      } catch (err) {
        console.error('Failed to batch update selected positions:', err);
      }
      return;
    }

    const card = liveObjects.find((o) => o.id === cardId);
    const saveX = card ? card.pos_x : finalX;
    const saveY = card ? card.pos_y : finalY;

    try {
      await heptaClient.whiteboards.updateObjectPosition(cardId, saveX, saveY);
    } catch (err) {
      console.error(err);
    }

    if (!card) return;

    const cardCenterX = saveX + card.width / 2;
    const cardCenterY = saveY + card.height / 2;

    const targetSection = objects.find(
      (obj) =>
        obj.object_type === 'section' &&
        cardCenterX >= obj.pos_x &&
        cardCenterX <= obj.pos_x + obj.width &&
        cardCenterY >= obj.pos_y &&
        cardCenterY <= obj.pos_y + obj.height
    );

    let currentProps: Record<string, unknown> = {};
    try {
      if (card.properties_json) currentProps = JSON.parse(card.properties_json);
    } catch {}

    const previousSectionId = currentProps.section_id;
    const newSectionId = targetSection ? targetSection.id : null;

    if (previousSectionId !== newSectionId) {
      const updatedProps = { ...currentProps, section_id: newSectionId };
      const jsonStr = JSON.stringify(updatedProps);

      setObjects((prev) =>
        prev.map((o) => (o.id === cardId ? { ...o, properties_json: jsonStr } : o))
      );

      try {
        await heptaClient.whiteboards.updateObjectProperties(cardId, jsonStr);
      } catch (err) {
        console.error('Failed to update card section relation:', err);
      }
    }

    setLintIssues(lintWhiteboard(objects));
  };

  const isObjectInsideSection = useCallback(
    (obj: WhiteboardObject, sec: WhiteboardObject): boolean => {
      if (obj.id === sec.id) return false;

      let props: Record<string, unknown> = {};
      try {
        if (obj.properties_json) props = JSON.parse(obj.properties_json);
      } catch {}
      if (props.section_id === sec.id) return true;

      if (
        obj.pos_x >= sec.pos_x &&
        obj.pos_x + obj.width <= sec.pos_x + sec.width &&
        obj.pos_y >= sec.pos_y &&
        obj.pos_y + obj.height <= sec.pos_y + sec.height
      ) {
        return true;
      }

      const cx = obj.pos_x + obj.width / 2;
      const cy = obj.pos_y + obj.height / 2;
      if (
        cx >= sec.pos_x &&
        cx <= sec.pos_x + sec.width &&
        cy >= sec.pos_y &&
        cy <= sec.pos_y + sec.height
      ) {
        return true;
      }

      const xOverlap = Math.max(
        0,
        Math.min(obj.pos_x + obj.width, sec.pos_x + sec.width) - Math.max(obj.pos_x, sec.pos_x)
      );
      const yOverlap = Math.max(
        0,
        Math.min(obj.pos_y + obj.height, sec.pos_y + sec.height) - Math.max(obj.pos_y, sec.pos_y)
      );
      const overlapArea = xOverlap * yOverlap;
      const objArea = Math.max(1, (obj.width || 1) * (obj.height || 1));
      if (overlapArea / objArea >= 0.3) {
        return true;
      }

      return false;
    },
    []
  );

  const draggingSectionCoMovedRef = useRef<{
    sectionId: string;
    coMovedIds: Set<string>;
  } | null>(null);

  const handleSectionDragStart = useCallback(
    (sectionId: string) => {
      const currentSec = objects.find((o) => o.id === sectionId);
      if (!currentSec) return;

      const coMovedIds = new Set<string>();

      const collectChildren = (parentSec: WhiteboardObject) => {
        objects.forEach((obj) => {
          if (obj.id === parentSec.id) return;
          if (isObjectInsideSection(obj, parentSec)) {
            coMovedIds.add(obj.id);
            if (obj.object_type === 'section') {
              collectChildren(obj);
            }
          }
        });
      };

      collectChildren(currentSec);

      draggingSectionCoMovedRef.current = {
        sectionId,
        coMovedIds,
      };
    },
    [objects, isObjectInsideSection]
  );

  const handleUpdateSectionPosition = (
    sectionId: string,
    newX: number,
    newY: number,
    deltaX: number,
    deltaY: number
  ) => {
    if (
      !draggingSectionCoMovedRef.current ||
      draggingSectionCoMovedRef.current.sectionId !== sectionId
    ) {
      handleSectionDragStart(sectionId);
    }

    const coMovedIds = draggingSectionCoMovedRef.current?.coMovedIds || new Set<string>();
    const movingSet = new Set<string>([sectionId, ...coMovedIds]);
    const secObj = objectsMap.get(sectionId);
    const dropTarget = findDropTargetSubWhiteboard(
      movingSet,
      secObj ? { x: newX + secObj.width / 2, y: newY + secObj.height / 2 } : undefined
    );
    const nextDropId = dropTarget ? dropTarget.id : null;
    if (dropTargetSubWbObjIdRef.current !== nextDropId) {
      dropTargetSubWbObjIdRef.current = nextDropId;
      setDropTargetSubWbObjId(nextDropId);
    }

    setObjects((prev) =>
      prev.map((obj) => {
        if (obj.id === sectionId) {
          return { ...obj, pos_x: newX, pos_y: newY };
        }
        if (coMovedIds.has(obj.id)) {
          return { ...obj, pos_x: obj.pos_x + deltaX, pos_y: obj.pos_y + deltaY };
        }
        return obj;
      })
    );
  };

  const handleSectionDragEnd = async (sectionId: string, finalX: number, finalY: number) => {
    setActiveGuides([]);
    const coMovedIds = draggingSectionCoMovedRef.current?.coMovedIds || new Set<string>();
    draggingSectionCoMovedRef.current = null;

    const activeDropTargetId = dropTargetSubWbObjIdRef.current;
    dropTargetSubWbObjIdRef.current = null;
    setDropTargetSubWbObjId(null);

    if (activeDropTargetId) {
      const handled = await executeDropIntoSubWhiteboard(
        sectionId,
        activeDropTargetId,
        isAltKeyRef.current
      );
      if (handled) return;
    }

    setObjects((currentObjects) => {
      const coMoved = currentObjects.filter((o) => coMovedIds.has(o.id));

      const updates = [
        { id: sectionId, posX: finalX, posY: finalY },
        ...coMoved.map((obj) => {
          let props: Record<string, unknown> = {};
          try {
            if (obj.properties_json) props = JSON.parse(obj.properties_json);
          } catch {}
          props.section_id = sectionId;
          return {
            id: obj.id,
            posX: obj.pos_x,
            posY: obj.pos_y,
            propertiesJson: JSON.stringify(props),
          };
        }),
      ];

      heptaClient.whiteboards.batchUpdateObjects(updates).catch((err) => {
        console.error('Failed to batch persist section co-movement:', err);
      });

      const updatedObjects = currentObjects.map((obj) => {
        if (coMovedIds.has(obj.id)) {
          let props: Record<string, unknown> = {};
          try {
            if (obj.properties_json) props = JSON.parse(obj.properties_json);
          } catch {}
          props.section_id = sectionId;
          return { ...obj, properties_json: JSON.stringify(props) };
        }
        return obj;
      });

      setLintIssues(lintWhiteboard(updatedObjects));
      return updatedObjects;
    });
  };

  const handleFitToContent = async (sectionId: string) => {
    const sec = objectsMap.get(sectionId);
    if (!sec) return;

    const contained = objects.filter((obj) => {
      if (obj.id === sectionId) return false;
      let props: Record<string, unknown> = {};
      try {
        if (obj.properties_json) props = JSON.parse(obj.properties_json);
      } catch {}
      return (
        props.section_id === sectionId ||
        (obj.pos_x >= sec.pos_x &&
          obj.pos_x + obj.width <= sec.pos_x + sec.width &&
          obj.pos_y >= sec.pos_y &&
          obj.pos_y + obj.height <= sec.pos_y + sec.height)
      );
    });

    if (contained.length === 0) return;

    const bbox = computeBoundingBox(contained);
    const newX = bbox.x - 40;
    const newY = bbox.y - 40;
    const newW = Math.max(bbox.width + 80, HEPTA_DEFAULT_DIMENSIONS.section.width);
    const newH = Math.max(bbox.height + 80, HEPTA_DEFAULT_DIMENSIONS.section.height);

    setObjects((prev) =>
      prev.map((o) => (o.id === sectionId ? { ...o, pos_x: newX, pos_y: newY, width: newW, height: newH } : o))
    );

    try {
      await heptaClient.whiteboards.updateObjectRect(sectionId, newX, newY, newW, newH);
      setLintIssues(lintWhiteboard(objects));
    } catch (err) {
      console.error('Failed to fit section to content:', err);
    }
  };

  const handleAlign = async (alignment: AlignmentType) => {
    const targets = objects.filter((o) => selectedObjectIds.has(o.id));
    if (targets.length < 2) return;

    const newPositions = alignObjects(targets, alignment);
    setObjects((prev) =>
      prev.map((o) => {
        const match = newPositions.find((p) => p.id === o.id);
        return match ? { ...o, pos_x: match.x, pos_y: match.y } : o;
      })
    );

    try {
      await heptaClient.whiteboards.batchUpdateObjects(
        newPositions.map((p) => ({ id: p.id, posX: p.x, posY: p.y }))
      );
      setLintIssues(lintWhiteboard(objects));
    } catch (err) {
      console.error('Failed to save aligned positions:', err);
    }
  };

  const handleArrange = async (layoutType: ArrangeLayoutType) => {
    const targets = objects.filter((o) => selectedObjectIds.has(o.id));
    if (targets.length < 2) return;

    const newPositions = arrangeObjects(targets, layoutType, { gap: 40 });
    setObjects((prev) =>
      prev.map((o) => {
        const match = newPositions.find((p) => p.id === o.id);
        return match ? { ...o, pos_x: match.x, pos_y: match.y } : o;
      })
    );

    try {
      await heptaClient.whiteboards.batchUpdateObjects(
        newPositions.map((p) => ({ id: p.id, posX: p.x, posY: p.y }))
      );
      setLintIssues(lintWhiteboard(objects));
    } catch (err) {
      console.error('Failed to save arranged positions:', err);
    }
  };

  const handleCreateSectionForSelected = async () => {
    const selectedObjs = objectsRef.current.filter((o) => selectedObjectIds.has(o.id));
    if (selectedObjs.length === 0) return;

    const box = computeBoundingBox(selectedObjs);
    const secX = box.x - 40;
    const secY = box.y - 40;
    const secW = Math.max(box.width + 80, HEPTA_DEFAULT_DIMENSIONS.section.width);
    const secH = Math.max(box.height + 80, HEPTA_DEFAULT_DIMENSIONS.section.height);

    const objId = `wbo-sec-${Date.now()}`;
    try {
      await heptaClient.whiteboards.createObject({
        id: objId,
        whiteboardId: activeWhiteboardId,
        objectType: 'section',
        targetId: null,
        posX: secX,
        posY: secY,
        width: secW,
        height: secH,
        zIndex: 1,
        propertiesJson: JSON.stringify({
          title: '新结构分区',
          color: 'white',
        }),
      });

      const updates = selectedObjs.map((obj) => {
        let props: Record<string, unknown> = {};
        try {
          if (obj.properties_json) props = JSON.parse(obj.properties_json);
        } catch {}
        props.section_id = objId;
        return {
          id: obj.id,
          propertiesJson: JSON.stringify(props),
        };
      });
      await heptaClient.whiteboards.batchUpdateObjects(updates);
      await loadWhiteboardData();
      setSelectedObjectIds(new Set([objId]));
      setRecentlyCreatedSectionId(objId);
      setTimeout(() => setRecentlyCreatedSectionId(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedObjectIds);
    if (ids.length === 0) return;

    const selectedObjs = ids
      .map((id) => objectsMap.get(id))
      .filter((o): o is WhiteboardObject => Boolean(o));

    const childSubWbObjs = selectedObjs.filter((o) => {
      if (!isSubWhiteboardObject(o)) return false;
      if (!isChildSubWhiteboardObject(o)) return false;
      const targetId = getSubWhiteboardTargetId(o);
      if (!targetId) return false;
      const targetWb = whiteboardsMap.get(targetId);
      return Boolean(targetWb && targetWb.is_deleted === 0);
    });

    if (childSubWbObjs.length > 0) {
      const ok = await showConfirm({
        title: 'Delete whiteboard',
        message:
          'The whiteboards and all their nested whiteboards will be put into trash. Cards inside the whiteboards will not be deleted.',
        confirmText: 'Delete',
        variant: 'danger',
      });
      if (!ok) return;
    }

    try {
      const childSubWbObjIds = new Set(childSubWbObjs.map((o) => o.id));
      for (const subObj of childSubWbObjs) {
        const targetId = getSubWhiteboardTargetId(subObj);
        if (targetId) {
          await heptaClient.whiteboards.delete(targetId);
        }
      }

      const regularIds = ids.filter((id) => !childSubWbObjIds.has(id));
      if (regularIds.length > 0) {
        await heptaClient.whiteboards.batchDeleteObjects(regularIds);
      }

      setSelectedObjectIds(new Set());
      await loadWhiteboardData();
      if (childSubWbObjs.length > 0) {
        notifyWhiteboardsChanged();
      }
    } catch (err) {
      console.error('Failed to batch delete objects:', err);
    }
  };

  const handleBatchUpdateColor = async (colorVar: string) => {
    const ids = Array.from(selectedObjectIds);
    if (ids.length === 0) return;

    const updatedObjects = objects.map((obj) => {
      if (selectedObjectIds.has(obj.id)) {
        let props: Record<string, unknown> = {};
        try {
          if (obj.properties_json) props = JSON.parse(obj.properties_json);
        } catch {}
        props.color = colorVar;
        return { ...obj, properties_json: JSON.stringify(props) };
      }
      return obj;
    });

    setObjects(updatedObjects);
    setShowBatchColorPicker(false);

    try {
      const updates = ids.map((id) => {
        const obj = updatedObjects.find((o) => o.id === id);
        return {
          id,
          propertiesJson: obj?.properties_json || '{}',
        };
      });
      await heptaClient.whiteboards.batchUpdateObjects(updates);
    } catch (err) {
      console.error('Failed to batch update colors:', err);
    }
  };

  const handleUpdateSize = async (id: string, width: number, height: number) => {
    setObjects((prev) =>
      prev.map((obj) => (obj.id === id ? { ...obj, width, height } : obj))
    );
    try {
      await heptaClient.whiteboards.updateObjectSize(id, width, height);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateRect = async (id: string, x: number, y: number, width: number, height: number) => {
    setObjects((prev) =>
      prev.map((obj) => (obj.id === id ? { ...obj, pos_x: x, pos_y: y, width, height } : obj))
    );
    try {
      await heptaClient.whiteboards.updateObjectRect(id, x, y, width, height);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteObject = async (id: string) => {
    try {
      await heptaClient.whiteboards.deleteObject(id);
      setObjects((prev) => prev.filter((o) => o.id !== id));
      setConnections((prev) =>
        prev.filter((c) => c.source_object_id !== id && c.target_object_id !== id)
      );
      setSelectedObjectIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setLintIssues(lintWhiteboard(objects.filter((o) => o.id !== id)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCardTitle = async (cardId: string, title: string) => {
    try {
      await heptaClient.cards.updateTitle(cardId, title);
      onRefreshCards();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCardContent = async (
    cardId: string,
    content: { json: string; text: string }
  ) => {
    try {
      await heptaClient.cards.updateContent(cardId, content.json, content.text);
      onRefreshCards();
    } catch (err) {
      console.error(err);
    }
  };

  const handleLocateCard = (id: string) => {
    const obj = objects.find((o) => o.id === id);
    if (!obj || !containerRef.current) return;
    triggerSmoothTransition();
    const rect = containerRef.current.getBoundingClientRect();
    const newPanX = rect.width / 2 - (obj.pos_x + obj.width / 2) * viewport.zoom;
    const newPanY = rect.height / 2 - (obj.pos_y + obj.height / 2) * viewport.zoom;
    const newVp: ViewportState = { ...viewport, panX: newPanX, panY: newPanY };
    setViewport(newVp);
    saveViewport(newVp);
  };

  const handleUpdateProperties = async (id: string, propertiesJson: string) => {
    setObjects((prev) =>
      prev.map((o) => (o.id === id ? { ...o, properties_json: propertiesJson } : o))
    );
    try {
      await heptaClient.whiteboards.updateObjectProperties(id, propertiesJson);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDuplicateObject = async (objectId: string) => {
    const source = objectsMap.get(objectId);
    if (!source) return;
    const newId = `wbo-${Date.now()}`;
    const isSubWb = isSubWhiteboardObject(source);
    let nextPropsJson = source.properties_json || '{}';
    let nextHeight = source.height;
    let nextWidth = source.width;
    let nextObjectType = source.object_type;
    let nextTargetId = source.target_id;
    if (isSubWb) {
      const parsed = parseJsonObject(source.properties_json);
      nextObjectType = 'whiteboard_shortcut';
      nextTargetId = getSubWhiteboardTargetId(source) || source.target_id;
      nextWidth = Math.max(220, source.width || HEPTA_DEFAULT_DIMENSIONS.whiteboard_shortcut.width);
      nextHeight = HEPTA_DEFAULT_DIMENSIONS.whiteboard_shortcut.height;
      nextPropsJson = JSON.stringify({
        ...parsed,
        isChild: false,
      });
    }
    try {
      await heptaClient.whiteboards.createObject({
        id: newId,
        whiteboardId: activeWhiteboardId,
        objectType: nextObjectType,
        targetId: nextTargetId,
        posX: source.pos_x + 40,
        posY: source.pos_y + 40,
        width: nextWidth,
        height: nextHeight,
        zIndex: (source.z_index || 10) + 1,
        propertiesJson: nextPropsJson,
      });
      await loadWhiteboardData();
      setSelectedObjectIds(new Set([newId]));
    } catch (err) {
      console.error('Failed to duplicate object:', err);
    }
  };

  const handlePasteCopiedObjects = async () => {
    const sources = copiedObjectsRef.current;
    if (!sources || sources.length === 0) return;

    const now = Date.now();
    const newIds: string[] = [];
    try {
      for (let idx = 0; idx < sources.length; idx++) {
        const src = sources[idx];
        const newId = `wbo-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
        newIds.push(newId);

        if (isSubWhiteboardObject(src)) {
          const parsed = parseJsonObject(src.properties_json);
          const targetId = getSubWhiteboardTargetId(src);
          const targetWb = targetId ? whiteboardsMap.get(targetId) : null;
          const shortcutDim = HEPTA_DEFAULT_DIMENSIONS.whiteboard_shortcut || {
            width: 640,
            height: 128,
          };
          await heptaClient.whiteboards.createObject({
            id: newId,
            whiteboardId: activeWhiteboardId,
            objectType: 'whiteboard_shortcut',
            targetId: targetId || null,
            posX: src.pos_x + 40,
            posY: src.pos_y + 40,
            width: Math.max(220, src.width || shortcutDim.width),
            height: shortcutDim.height,
            zIndex: (src.z_index || 10) + 1,
            propertiesJson: JSON.stringify({
              name:
                targetWb?.name ||
                (typeof parsed.name === 'string' ? parsed.name : '') ||
                (typeof parsed.title === 'string' ? parsed.title : 'Untitled Whiteboard'),
              color: typeof parsed.color === 'string' ? parsed.color : 'white',
              isChild: false,
            }),
          });
        } else {
          await heptaClient.whiteboards.createObject({
            id: newId,
            whiteboardId: activeWhiteboardId,
            objectType: src.object_type,
            targetId: src.target_id,
            posX: src.pos_x + 40,
            posY: src.pos_y + 40,
            width: src.width,
            height: src.height,
            zIndex: (src.z_index || 10) + 1,
            propertiesJson: src.properties_json || '{}',
          });
        }
      }

      copiedObjectsRef.current = sources.map((s) => ({
        ...s,
        pos_x: s.pos_x + 40,
        pos_y: s.pos_y + 40,
      }));
      await loadWhiteboardData();
      setSelectedObjectIds(new Set(newIds));
    } catch (err) {
      console.error('Failed to paste copied objects:', err);
    }
  };

  const handleSubWhiteboardMouseDown = (obj: WhiteboardObject, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    handleSelectObject(obj.id, e);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startObjX = obj.pos_x;
    const startObjY = obj.pos_y;
    let currentX = startObjX;
    let currentY = startObjY;
    let hasMoved = false;

    const handleMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startClientX) / Math.max(0.05, viewport.zoom);
      const dy = (moveEvent.clientY - startClientY) / Math.max(0.05, viewport.zoom);
      if (!hasMoved && Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY) < 3) {
        return;
      }
      hasMoved = true;
      currentX = startObjX + dx;
      currentY = startObjY + dy;
      handleUpdatePosition(obj.id, currentX, currentY);
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      if (hasMoved) {
        void handleCardDragEnd(obj.id, currentX, currentY);
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleRenameSubWhiteboard = async (wbId: string, objId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await heptaClient.whiteboards.rename(wbId, trimmed);
      onUpdateWhiteboardName?.(wbId, trimmed);
      const obj = objectsMap.get(objId);
      if (obj) {
        const props = parseJsonObject(obj.properties_json);
        props.name = trimmed;
        await handleUpdateProperties(objId, JSON.stringify(props));
      }
      setAllWhiteboards((prev) => prev.map((w) => (w.id === wbId ? { ...w, name: trimmed } : w)));
      notifyWhiteboardsChanged();
    } catch (err) {
      console.error('Failed to rename sub-whiteboard:', err);
    }
  };

  const handleSubWhiteboardColorChange = async (objId: string, color: string) => {
    const obj = objectsMap.get(objId);
    if (!obj) return;
    const props = parseJsonObject(obj.properties_json);
    props.color = color;
    await handleUpdateProperties(objId, JSON.stringify(props));
  };

  const handleSubWhiteboardFitToContent = async (
    objId: string,
    nextSize: { width?: number; height?: number }
  ) => {
    const obj = objectsMap.get(objId);
    if (!obj) return;
    const nextW = nextSize.width ?? obj.width;
    const nextH = nextSize.height ?? obj.height;
    await handleUpdateSize(objId, nextW, nextH);
  };

  const handleDeleteSubWhiteboardNode = async (objId: string, isChild: boolean) => {
    const obj = objectsMap.get(objId);
    const targetId = obj ? getSubWhiteboardTargetId(obj) : '';
    const targetWb = targetId ? whiteboardsMap.get(targetId) : null;

    if (!isChild || !targetId || !targetWb || targetWb.is_deleted === 1) {
      await handleDeleteObject(objId);
      return;
    }

    const confirmed = await showConfirm({
      title: 'Delete whiteboard',
      message:
        'The whiteboards and all their nested whiteboards will be put into trash. Cards inside the whiteboards will not be deleted.',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await heptaClient.whiteboards.delete(targetId);
      setSelectedObjectIds((prev) => {
        const next = new Set(prev);
        next.delete(objId);
        return next;
      });
      await loadWhiteboardData();
      notifyWhiteboardsChanged();
    } catch (err) {
      console.error('Failed to delete sub-whiteboard:', err);
    }
  };

  const handleCreateWhiteboardShortcut = async (targetWb: Whiteboard, customPoint?: Point) => {
    const dim = HEPTA_DEFAULT_DIMENSIONS.whiteboard_shortcut || { width: 640, height: 128 };
    const pos = customPoint || {
      x: visibleBounds.x + visibleBounds.width / 2 - dim.width / 2,
      y: visibleBounds.y + visibleBounds.height / 2 - dim.height / 2,
    };
    const objId = `wbo-shortcut-${Date.now()}`;
    try {
      await heptaClient.whiteboards.createObject({
        id: objId,
        whiteboardId: activeWhiteboardId,
        objectType: 'whiteboard_shortcut',
        targetId: targetWb.id,
        posX: pos.x,
        posY: pos.y,
        width: dim.width,
        height: dim.height,
        zIndex: 10,
        propertiesJson: JSON.stringify({
          name: targetWb.name,
          color: 'white',
          isChild: false,
        }),
      });
      setShowShortcutPopover(false);
      setShortcutSearchQuery('');
      setShortcutPlaceWorldPos(null);
      setShowMoreToolsMenu(false);
      await loadWhiteboardData();
      setSelectedObjectIds(new Set([objId]));
      setToolMode('select');
    } catch (err) {
      console.error('Failed to create whiteboard shortcut:', err);
    }
  };

  const handleCreateCardObject = async (customPoint?: Point, type: 'card' | 'text' = 'card') => {
    const dim = type === 'text' ? HEPTA_DEFAULT_DIMENSIONS.text : HEPTA_DEFAULT_DIMENSIONS.card;
    const centerPoint = customPoint || {
      x: visibleBounds.x + visibleBounds.width / 2 - dim.width / 2,
      y: visibleBounds.y + visibleBounds.height / 2 - (type === 'text' ? 50 : dim.height / 2),
    };

    const cardId = `card-${Date.now()}`;
    const objId = `wbo-${Date.now()}`;
    const initialProps = JSON.stringify({
      color: 'white',
      isFolded: false,
      isAutoHeight: true,
      foldedHeight: 46,
    });

    try {
      await heptaClient.cards.create({
        id: cardId,
        title: type === 'text' ? 'Text' : '',
        contentJson: '{}',
        contentText: '',
      });

      await heptaClient.whiteboards.createObject({
        id: objId,
        whiteboardId: activeWhiteboardId,
        objectType: 'card',
        targetId: cardId,
        posX: centerPoint.x,
        posY: centerPoint.y,
        width: dim.width,
        height: type === 'text' ? 41.5 : dim.height,
        zIndex: 10,
        propertiesJson: initialProps,
      });

      onRefreshCards();
      await loadWhiteboardData();
      setSelectedObjectIds(new Set([objId]));
      setToolMode('select');
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSectionObject = async () => {
    const dim = HEPTA_DEFAULT_DIMENSIONS.section;
    const objId = `wbo-sec-${Date.now()}`;
    const centerPoint = {
      x: visibleBounds.x + visibleBounds.width / 2 - dim.width / 2,
      y: visibleBounds.y + visibleBounds.height / 2 - dim.height / 2,
    };

    try {
      await heptaClient.whiteboards.createObject({
        id: objId,
        whiteboardId: activeWhiteboardId,
        objectType: 'section',
        targetId: null,
        posX: centerPoint.x,
        posY: centerPoint.y,
        width: dim.width,
        height: dim.height,
        zIndex: 1,
        propertiesJson: JSON.stringify({
          title: '新结构分区',
          color: 'var(--bg-white-sect)',
          borderColor: 'hsl(var(--border-white-sect-hsl))',
        }),
      });
      await loadWhiteboardData();
      setSelectedObjectIds(new Set([objId]));
      setRecentlyCreatedSectionId(objId);
      setTimeout(() => setRecentlyCreatedSectionId(null), 3000);
      setToolMode('select');
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateMindmapObject = async () => {
    const dim = HEPTA_DEFAULT_DIMENSIONS.mindmap_node;
    const objId = `wbo-mm-${Date.now()}`;
    const centerPoint = {
      x: visibleBounds.x + visibleBounds.width / 2 - dim.width / 2,
      y: visibleBounds.y + visibleBounds.height / 2 - dim.height / 2,
    };

    try {
      await heptaClient.whiteboards.createObject({
        id: objId,
        whiteboardId: activeWhiteboardId,
        objectType: 'mindmap_node',
        targetId: null,
        posX: centerPoint.x,
        posY: centerPoint.y,
        width: dim.width,
        height: dim.height,
        zIndex: 15,
        propertiesJson: JSON.stringify({ mindMapV2: createDefaultMindMapData() }),
      });
      await loadWhiteboardData();
      setSelectedObjectIds(new Set([objId]));
      setShowMoreToolsMenu(false);
      setToolMode('select');
    } catch (err) {
      console.error(err);
    }
  };

  const handleTurnMindmapNodeIntoCard = async (title: string): Promise<Card | null> => {
    try {
      const cardId = `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const created = await heptaClient.cards.create({
        id: cardId,
        title: title.trim() || 'Untitled',
        contentJson: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph' }],
        }),
        contentText: '',
        color: 'white',
      });
      onRefreshCards();
      return created;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const handleDetachMindmapNodeToWhiteboard = async (
    node: MindMapNodeData,
    worldPos: { x: number; y: number }
  ): Promise<void> => {
    try {
      const now = Date.now();
      if (node.type === 'cardNode' && node.cardId) {
        const dim = HEPTA_DEFAULT_DIMENSIONS.card;
        await heptaClient.whiteboards.createObject({
          id: `wbo-card-${now}-${Math.random().toString(36).slice(2, 5)}`,
          whiteboardId: activeWhiteboardId,
          objectType: 'card',
          targetId: node.cardId,
          posX: worldPos.x,
          posY: worldPos.y,
          width: dim.width,
          height: dim.height,
          zIndex: 16,
        });
        await loadWhiteboardData();
      } else if (node.type === 'highlightElementNode' && node.highlightId) {
        const dim = HEPTA_DEFAULT_DIMENSIONS.highlight;
        await heptaClient.whiteboards.createObject({
          id: `wbo-hl-${now}-${Math.random().toString(36).slice(2, 5)}`,
          whiteboardId: activeWhiteboardId,
          objectType: 'highlight',
          targetId: node.highlightId,
          posX: worldPos.x,
          posY: worldPos.y,
          width: dim.width,
          height: dim.height,
          zIndex: 16,
        });
        await loadWhiteboardData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const importDocumentAndPlaceOnCanvas = async (
    filePath: string,
    fileName: string,
    docType: 'pdf' | 'epub',
    worldPoint?: Point
  ): Promise<string | null> => {
    try {
      const added = await heptaClient.localFile.add({
        path: filePath,
        name: fileName,
      });
      const now = Date.now();
      const docId = `doc-${now}-${Math.random().toString(36).slice(2, 6)}`;
      const objId = `wbo-doc-${now}-${Math.random().toString(36).slice(2, 6)}`;
      const cleanTitle = fileName.replace(/\.(pdf|epub)$/i, '') || fileName;
      const dim = HEPTA_DEFAULT_DIMENSIONS[docType] || HEPTA_DEFAULT_DIMENSIONS.pdf;
      const pos = worldPoint || {
        x: visibleBounds.x + visibleBounds.width / 2 - dim.width / 2,
        y: visibleBounds.y + visibleBounds.height / 2 - dim.height / 2,
      };

      await heptaClient.documents.create({
        id: docId,
        docType,
        title: cleanTitle,
        fileReferenceId: added.referenceId,
        coverReferenceId: null,
        totalPages: 0,
        lastPositionJson: '{}',
        metadataJson: '{}',
      });

      await heptaClient.whiteboards.createObject({
        id: objId,
        whiteboardId: activeWhiteboardId,
        objectType: docType,
        targetId: docId,
        posX: pos.x,
        posY: pos.y,
        width: dim.width,
        height: dim.height,
        zIndex: 10,
        propertiesJson: JSON.stringify({ title: cleanTitle, docType, fileReferenceId: added.referenceId }),
      });

      return objId;
    } catch (err) {
      console.error('Failed to import document:', err);
      return null;
    }
  };

  const handleImportDocuments = async () => {
    try {
      const picked = await heptaClient.localFile.pickDocuments?.();
      if (!picked || picked.length === 0) return;
      const createdIds: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const item = picked[i];
        const dim = HEPTA_DEFAULT_DIMENSIONS[item.docType] || HEPTA_DEFAULT_DIMENSIONS.pdf;
        const pos = {
          x: visibleBounds.x + visibleBounds.width / 2 - dim.width / 2 + i * 36,
          y: visibleBounds.y + visibleBounds.height / 2 - dim.height / 2 + i * 36,
        };
        const objId = await importDocumentAndPlaceOnCanvas(item.path, item.name, item.docType, pos);
        if (objId) createdIds.push(objId);
      }
      await loadWhiteboardData();
      if (createdIds.length > 0) {
        setSelectedObjectIds(new Set([createdIds[createdIds.length - 1]]));
      }
    } catch (err) {
      console.error('Failed to pick documents:', err);
    }
  };

  const handleUpdateHighlightNote = async (highlightId: string, noteText: string) => {
    setHighlightsMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(highlightId);
      if (existing) next.set(highlightId, { ...existing, note_text: noteText, updated_at: Date.now() });
      return next;
    });
    try {
      await heptaClient.highlights.updateNote(highlightId, noteText);
    } catch (err) {
      console.error('Failed to update highlight note:', err);
    }
  };

  const handleUpdateHighlightColor = async (highlightId: string, color: AnnotationColor) => {
    setHighlightsMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(highlightId);
      if (existing) next.set(highlightId, { ...existing, color, updated_at: Date.now() });
      return next;
    });
    try {
      await heptaClient.highlights.updateColor(highlightId, color);
    } catch (err) {
      console.error('Failed to update highlight color:', err);
    }
  };

  const probeImageAspectRatio = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const ratio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 4 / 3;
        URL.revokeObjectURL(objectUrl);
        resolve(ratio);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(4 / 3);
      };
      img.src = objectUrl;
    });
  };

  const ingestFilesOntoCanvas = async (
    fileList: File[],
    origin: 'afterExistingObjects' | Point
  ): Promise<string[]> => {
    if (fileList.length === 0) return [];
    let startX = visibleBounds.x + visibleBounds.width / 2 - 220;
    let startY = visibleBounds.y + visibleBounds.height / 2 - 160;
    if (origin === 'afterExistingObjects') {
      if (objects.length > 0) {
        let rightmost = objects[0];
        for (const o of objects) {
          if (o.pos_x + o.width > rightmost.pos_x + rightmost.width) {
            rightmost = o;
          }
        }
        startX = rightmost.pos_x + rightmost.width + 48;
        startY = rightmost.pos_y;
      }
    } else {
      startX = origin.x - 200;
      startY = origin.y - 140;
    }

    const createdIds: string[] = [];
    let createdAnyCard = false;
    let cursorX = startX;
    let cursorY = startY;
    let rowMaxHeight = 0;
    let colCount = 0;
    const GAP = 32;

    const advanceCursor = (w: number, h: number) => {
      rowMaxHeight = Math.max(rowMaxHeight, h);
      colCount += 1;
      if (colCount >= 4) {
        colCount = 0;
        cursorX = startX;
        cursorY += rowMaxHeight + GAP;
        rowMaxHeight = 0;
      } else {
        cursorX += w + GAP;
      }
    };

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const filePath =
          heptaClient.localFile.getPathForFile?.(file) ||
          (file as File & { path?: string }).path ||
          file.name;
        const lower = file.name.toLowerCase();

        if (lower.endsWith('.pdf') || lower.endsWith('.epub')) {
          const docType: 'pdf' | 'epub' = lower.endsWith('.epub') ? 'epub' : 'pdf';
          const dim = HEPTA_DEFAULT_DIMENSIONS[docType];
          const objId = await importDocumentAndPlaceOnCanvas(filePath, file.name, docType, {
            x: cursorX,
            y: cursorY,
          });
          if (objId) {
            createdIds.push(objId);
            advanceCursor(dim.width, dim.height);
          }
          continue;
        }

        if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')) {
          const rawText = await file.text();
          const baseTitle = file.name.replace(/\.(md|markdown|txt)$/i, '').trim() || 'Untitled';
          const pmDoc = docFromMarkdown(rawText);
          const now = Date.now();
          const cardId = `card-${now}-${i}`;
          await heptaClient.cards.create({
            id: cardId,
            title: baseTitle,
            contentJson: docToJson(pmDoc),
            contentText: rawText,
            color: 'white',
          });
          const cardDim = HEPTA_DEFAULT_DIMENSIONS.card;
          const objId = `wbo-card-${now}-${i}`;
          await heptaClient.whiteboards.createObject({
            id: objId,
            whiteboardId: activeWhiteboardId,
            objectType: 'card',
            targetId: cardId,
            posX: cursorX,
            posY: cursorY,
            width: cardDim.width,
            height: cardDim.height,
            zIndex: 10,
          });
          createdIds.push(objId);
          createdAnyCard = true;
          advanceCursor(cardDim.width, cardDim.height);
          continue;
        }

        const mediaKind = detectMediaKind(file.name);
        const res = await heptaClient.localFile.add({
          path: filePath,
          name: file.name,
        });

        let width = 320;
        let height = 136;
        let aspectRatio: number | undefined;
        if (mediaKind === 'image') {
          aspectRatio = await probeImageAspectRatio(file);
          width = 420;
          height = Math.max(140, Math.min(480, Math.round(width / aspectRatio)));
          if (height === 480) {
            width = Math.max(180, Math.round(height * aspectRatio));
          }
        } else if (mediaKind === 'video') {
          width = 480;
          height = 310;
        } else if (mediaKind === 'audio') {
          width = 360;
          height = 112;
        }

        const objId = `wbo-file-${Date.now()}-${i}`;
        await heptaClient.whiteboards.createObject({
          id: objId,
          whiteboardId: activeWhiteboardId,
          objectType: 'media',
          targetId: res.referenceId,
          posX: cursorX,
          posY: cursorY,
          width,
          height,
          zIndex: 10,
          propertiesJson: JSON.stringify({
            name: file.name,
            sha256: res.sha256,
            mediaKind,
            ...(aspectRatio ? { aspectRatio } : {}),
          }),
        });
        createdIds.push(objId);
        advanceCursor(width, height);
      } catch (err) {
        console.error('Failed to upload file:', err);
      }
    }

    if (createdAnyCard) {
      onRefreshCards();
    }
    if (createdIds.length > 0) {
      await loadWhiteboardData();
      setSelectedObjectIds(new Set(createdIds));
      showSubWbToast({
        type: 'success',
        message: `Uploaded ${createdIds.length} file${createdIds.length > 1 ? 's' : ''}`,
      });
    } else {
      showSubWbToast({ type: 'warning', message: 'Unable to upload file' });
    }
    return createdIds;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await ingestFilesOntoCanvas(Array.from(files), 'afterExistingObjects');
    e.target.value = '';
  };

  const handleCreateJournalObject = async () => {
    const today = new Date().toISOString().split('T')[0];
    const cardId = `card-jnl-${Date.now()}`;
    const objId = `wbo-jnl-${Date.now()}`;
    const centerPoint = {
      x: visibleBounds.x + visibleBounds.width / 2 - 260,
      y: visibleBounds.y + visibleBounds.height / 2 - 110,
    };
    try {
      await heptaClient.cards.create({
        id: cardId,
        title: `日记 (${today})`,
        contentJson: '{}',
        contentText: '',
      });
      await heptaClient.whiteboards.createObject({
        id: objId,
        whiteboardId: activeWhiteboardId,
        objectType: 'card',
        targetId: cardId,
        posX: centerPoint.x,
        posY: centerPoint.y,
        width: 520,
        height: 223.5,
        zIndex: 10,
        propertiesJson: JSON.stringify({ isJournal: true }),
      });
      onRefreshCards();
      await loadWhiteboardData();
      setSelectedObjectIds(new Set([objId]));
      setShowMoreToolsMenu(false);
      setToolMode('select');
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSubWhiteboardObject = async (customRect?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  }) => {
    const dim = HEPTA_DEFAULT_DIMENSIONS.sub_whiteboard || { width: 640, height: 420 };
    const width = Math.max(220, customRect?.width ?? dim.width);
    const height = Math.max(128, customRect?.height ?? dim.height);
    const pos = customRect
      ? { x: customRect.x, y: customRect.y }
      : {
          x: visibleBounds.x + visibleBounds.width / 2 - width / 2,
          y: visibleBounds.y + visibleBounds.height / 2 - height / 2,
        };
    const objId = `wbo-sub-${Date.now()}`;
    try {
      const createdWb = await heptaClient.whiteboards.create(
        'Untitled Whiteboard',
        activeWhiteboardId
      );
      await heptaClient.whiteboards.createObject({
        id: objId,
        whiteboardId: activeWhiteboardId,
        objectType: 'whiteboard_shortcut',
        targetId: createdWb.id,
        posX: pos.x,
        posY: pos.y,
        width,
        height,
        zIndex: 10,
        propertiesJson: JSON.stringify({
          name: createdWb.name,
          color: 'white',
          isChild: true,
        }),
      });
      await loadWhiteboardData();
      notifyWhiteboardsChanged();
      setSelectedObjectIds(new Set([objId]));
      setRenamingSubWbObjId(objId);
      setShowMoreToolsMenu(false);
      setToolMode('select');
    } catch (err) {
      console.error('Failed to create sub-whiteboard:', err);
    }
  };

  const handleCreateSubWhiteboardFromSelected = async () => {
    const selectedObjs = objects.filter((o) => selectedObjectIds.has(o.id));
    if (selectedObjs.length === 0) return;

    const box = computeBoundingBox(selectedObjs);
    const dim = HEPTA_DEFAULT_DIMENSIONS.sub_whiteboard || { width: 640, height: 420 };
    try {
      const childWb = await heptaClient.whiteboards.create(
        'Untitled Whiteboard',
        activeWhiteboardId
      );

      await heptaClient.whiteboards.moveObjectsAcross({
        sourceWhiteboardId: activeWhiteboardId,
        targetWhiteboardId: childWb.id,
        objectIds: selectedObjs.map((o) => o.id),
      });

      const subWbObjId = `wbo-sub-${Date.now()}`;
      await heptaClient.whiteboards.createObject({
        id: subWbObjId,
        whiteboardId: activeWhiteboardId,
        objectType: 'whiteboard_shortcut',
        targetId: childWb.id,
        posX: box.x,
        posY: box.y,
        width: dim.width,
        height: dim.height,
        zIndex: 10,
        propertiesJson: JSON.stringify({
          name: childWb.name,
          color: 'white',
          isChild: true,
        }),
      });

      await loadWhiteboardData();
      notifyWhiteboardsChanged();
      setSelectedObjectIds(new Set([subWbObjId]));
      setRenamingSubWbObjId(subWbObjId);
    } catch (err) {
      console.error('Failed to create sub-whiteboard from selection:', err);
    }
  };

  const handleTurnSectionIntoWhiteboard = async (sectionId: string) => {
    const secObj = objects.find((o) => o.id === sectionId);
    if (!secObj) return;

    const secProps = parseJsonObject(secObj.properties_json);
    const title =
      typeof secProps.title === 'string' && secProps.title.trim()
        ? secProps.title.trim()
        : 'Untitled Whiteboard';
    const secColorKey = normalizeSectionColorKey(secProps.color);

    const containedObjs = objects.filter(
      (o) => o.id !== sectionId && isObjectInsideSection(o, secObj)
    );
    const dim = HEPTA_DEFAULT_DIMENSIONS.sub_whiteboard || { width: 640, height: 420 };

    try {
      const childWb = await heptaClient.whiteboards.create(title, activeWhiteboardId);

      if (containedObjs.length > 0) {
        await heptaClient.whiteboards.moveObjectsAcross({
          sourceWhiteboardId: activeWhiteboardId,
          targetWhiteboardId: childWb.id,
          objectIds: containedObjs.map((o) => o.id),
        });
      }

      await heptaClient.whiteboards.deleteObject(sectionId);

      const subWbObjId = `wbo-sub-${Date.now()}`;
      await heptaClient.whiteboards.createObject({
        id: subWbObjId,
        whiteboardId: activeWhiteboardId,
        objectType: 'whiteboard_shortcut',
        targetId: childWb.id,
        posX: secObj.pos_x,
        posY: secObj.pos_y,
        width: dim.width,
        height: dim.height,
        zIndex: 10,
        propertiesJson: JSON.stringify({
          name: title,
          color: secColorKey,
          isChild: true,
        }),
      });

      await loadWhiteboardData();
      notifyWhiteboardsChanged();
      setSelectedObjectIds(new Set([subWbObjId]));
    } catch (err) {
      console.error('Failed to turn section into sub-whiteboard:', err);
    }
  };

  const handleStartConnect = (
    id: string,
    anchor: 'top' | 'bottom' | 'left' | 'right',
    point: Point
  ) => {
    setActiveConnectLine({
      sourceId: id,
      sourceAnchor: anchor,
      startPoint: point,
      currentPoint: point,
    });
  };

  const handleCreateConnection = async (
    sourceId: string,
    targetId: string,
    beginPos: 'auto' | 'top' | 'bottom' | 'left' | 'right' = 'auto',
    endPos: 'auto' | 'top' | 'bottom' | 'left' | 'right' = 'auto'
  ) => {
    const connId = `conn-${Date.now()}`;
    const styleJson = JSON.stringify({
      strokeColor: 'var(--connection-blue)',
      strokeWidth: 2.5,
      type: 'curve',
      beginPos,
      endPos,
      beginStyle: 'none',
      endStyle: 'default',
    });
    const optimisticConn: Connection = {
      id: connId,
      whiteboard_id: activeWhiteboardId,
      source_object_id: sourceId,
      target_object_id: targetId,
      label: '',
      style_json: styleJson,
    };
    setConnections((prev) => [...prev, optimisticConn]);
    setSelectedConnectionId(connId);
    try {
      await heptaClient.whiteboards.createConnection({
        id: connId,
        whiteboardId: activeWhiteboardId,
        sourceObjectId: sourceId,
        targetObjectId: targetId,
        label: '',
        styleJson,
      });
    } catch (err) {
      console.error(err);
      setConnections((prev) => prev.filter((c) => c.id !== connId));
    }
  };

  const handleDeleteConnection = async (id: string) => {
    try {
      await heptaClient.whiteboards.deleteConnection(id);
      setConnections((prev) => prev.filter((c) => c.id !== id));
      if (selectedConnectionId === id) setSelectedConnectionId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateConnectionLabel = async (id: string, label: string) => {
    try {
      await heptaClient.whiteboards.updateConnection(id, { label });
      setConnections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, label } : c))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateConnectionStyle = async (id: string, styleJson: string) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, style_json: styleJson } : c))
    );
    try {
      await heptaClient.whiteboards.updateConnection(id, { styleJson });
    } catch (err) {
      console.error(err);
    }
  };

  const handleZoomIn = () => {
    zoomToTarget(viewport.zoom + 0.15);
  };

  const handleZoomOut = () => {
    zoomToTarget(viewport.zoom - 0.15);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const isBackground =
      e.target === containerRef.current || (e.target as HTMLElement).id === 'canvas-grid-bg';
    if (isBackground) {
      const rect = containerRef.current!.getBoundingClientRect();
      const worldP = screenToWorld(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        viewport
      );
      handleCreateCardObject({ x: worldP.x - 260, y: worldP.y - 190 });
    }
  };

  const handleExportWhiteboardImage = () => {
    const canvasEl = document.createElement('canvas');
    const width = 1920;
    const height = 1080;
    canvasEl.width = width;
    canvasEl.height = height;
    const ctx = canvasEl.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#eeeded';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      for (let x = 0; x < width; x += 32) {
        for (let y = 0; y < height; y += 32) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#2e2e2e';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.fillText(`${whiteboardName} - Whiteboard Snapshot`, 50, 60);
      ctx.font = '14px JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillText(`OpenHepta Visual Knowledge OS • ${objects.length} elements • ${connections.length} connections • ${new Date().toLocaleDateString()}`, 50, 90);

      objects.slice(0, 12).forEach((obj, idx) => {
        const x = 50 + (idx % 4) * 450;
        const y = 130 + Math.floor(idx / 4) * 280;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
        ctx.shadowBlur = 10;
        ctx.fillRect(x, y, 420, 240);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.strokeRect(x, y, 420, 240);
        ctx.fillStyle = '#2e2e2e';
        ctx.font = '600 16px Inter, sans-serif';
        const cardMatch = cards.find((c) => c.id === obj.target_id);
        let propsTitle = '';
        try {
          propsTitle = JSON.parse(obj.properties_json || '{}').title || '';
        } catch {}
        const title = cardMatch?.title || propsTitle || `白板对象 #${idx + 1}`;
        ctx.fillText(title.slice(0, 26), x + 20, y + 40);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.font = '13px Inter, sans-serif';
        const text = cardMatch?.content_text?.slice(0, 90) || '卡片内容快照与视觉拓扑...';
        ctx.fillText(text, x + 20, y + 75);
      });

      const link = document.createElement('a');
      link.download = `${whiteboardName.replace(/\s+/g, '_')}_export.png`;
      link.href = canvasEl.toDataURL('image/png');
      link.click();
    }
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const worldPoint = screenToWorld(mouseScreen, viewport);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      const createdIds = await ingestFilesOntoCanvas(droppedFiles, worldPoint);
      if (createdIds.length > 0) {
        return;
      }
    }

    const highlightDropData = e.dataTransfer.getData('application/openhepta-highlight');
    if (highlightDropData) {
      try {
        const parsed = JSON.parse(highlightDropData);
        const hlId = parsed.highlightId;
        if (hlId) {
          const dim = HEPTA_DEFAULT_DIMENSIONS.highlight;
          const objId = `wbo-hl-${Date.now()}`;
          await heptaClient.whiteboards.createObject({
            id: objId,
            whiteboardId: activeWhiteboardId,
            objectType: 'highlight',
            targetId: hlId,
            posX: worldPoint.x - dim.width / 2,
            posY: worldPoint.y - dim.height / 2,
            width: dim.width,
            height: dim.height,
            zIndex: 10,
            propertiesJson: JSON.stringify({ color: parsed.color || 'yellow' }),
          });
          await loadWhiteboardData();
          setSelectedObjectIds(new Set([objId]));
          return;
        }
      } catch (err) {
        console.error('Failed to handle highlight drop:', err);
      }
    }

    const blockData = e.dataTransfer.getData('application/openhepta-block');
    if (blockData) {
      try {
        const parsed = JSON.parse(blockData);
        const cardTitle = parsed.title?.trim() || '提取卡片';
        const cardContent = parsed.content || '';
        const now = Date.now();
        const cardId = `card-${now}`;
        const objId = `wbo-${now}`;
        const dim = HEPTA_DEFAULT_DIMENSIONS.card;
        const initialProps = JSON.stringify({
          color: 'white',
          isFolded: false,
          isAutoHeight: true,
          foldedHeight: 46,
        });

        const initialDoc = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: cardContent }],
            },
          ],
        };

        await heptaClient.cards.create({
          id: cardId,
          title: cardTitle,
          contentJson: JSON.stringify(initialDoc),
          contentText: cardContent,
        });

        await heptaClient.whiteboards.createObject({
          id: objId,
          whiteboardId: activeWhiteboardId,
          objectType: 'card',
          targetId: cardId,
          posX: worldPoint.x - dim.width / 2,
          posY: worldPoint.y - 30,
          width: dim.width,
          height: dim.height,
          zIndex: 10,
          propertiesJson: initialProps,
        });

        onRefreshCards();
        await loadWhiteboardData();
        setSelectedObjectIds(new Set([objId]));
        return;
      } catch (err) {
        console.error('Failed to handle block drop:', err);
      }
    }

    const cardData = e.dataTransfer.getData('application/openhepta-card');
    if (cardData) {
      try {
        const parsed = JSON.parse(cardData);
        const existingCardId = parsed.cardId;
        if (existingCardId) {
          const existingObj = objects.find((o) => o.target_id === existingCardId);
          if (existingObj) {
            handleLocateCard(existingObj.id);
            setSelectedObjectIds(new Set([existingObj.id]));
            return;
          }
          const now = Date.now();
          const objId = `wbo-${now}`;
          const dim = HEPTA_DEFAULT_DIMENSIONS.card;
          const initialProps = JSON.stringify({
            color: 'white',
            isFolded: false,
            isAutoHeight: true,
            foldedHeight: 46,
          });

          await heptaClient.whiteboards.createObject({
            id: objId,
            whiteboardId: activeWhiteboardId,
            objectType: 'card',
            targetId: existingCardId,
            posX: worldPoint.x - dim.width / 2,
            posY: worldPoint.y - 30,
            width: dim.width,
            height: dim.height,
            zIndex: 10,
            propertiesJson: initialProps,
          });

          await loadWhiteboardData();
          setSelectedObjectIds(new Set([objId]));
          return;
        }
      } catch (err) {
        console.error('Failed to handle card drop:', err);
      }
    }

    const textData = e.dataTransfer.getData('text/plain');
    if (textData && textData.trim()) {
      const now = Date.now();
      const cardId = `card-${now}`;
      const objId = `wbo-${now}`;
      const dim = HEPTA_DEFAULT_DIMENSIONS.card;
      const initialProps = JSON.stringify({
        color: 'white',
        isFolded: false,
        isAutoHeight: true,
        foldedHeight: 46,
      });

      const initialDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: textData }],
          },
        ],
      };

      await heptaClient.cards.create({
        id: cardId,
        title: textData.slice(0, 30),
        contentJson: JSON.stringify(initialDoc),
        contentText: textData,
      });

      await heptaClient.whiteboards.createObject({
        id: objId,
        whiteboardId: activeWhiteboardId,
        objectType: 'card',
        targetId: cardId,
        posX: worldPoint.x - dim.width / 2,
        posY: worldPoint.y - 30,
        width: dim.width,
        height: dim.height,
        zIndex: 10,
        propertiesJson: initialProps,
      });

      onRefreshCards();
      await loadWhiteboardData();
      setSelectedObjectIds(new Set([objId]));
      return;
    }
  };

  const activeCursor = isSpacePressedRef.current
    ? 'grab'
    : isPanningRef.current
    ? 'grabbing'
    : toolMode === 'grab'
    ? 'grab'
    : toolMode === 'connect' || toolMode === 'sub_whiteboard'
    ? 'crosshair'
    : 'default';

  return (
    <div
      ref={containerRef}
      data-whiteboard-id={activeWhiteboardId}
      onWheel={handleWheel}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenuCapture={handleCanvasContextMenuCapture}
      onContextMenu={handleCanvasContextMenu}
      onDoubleClick={handleDoubleClick}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
      className="relative w-full h-full overflow-hidden select-none bg-whiteboard-background"
      style={{ cursor: activeCursor }}
    >
      {showGridBackground && (() => {
        const gridStep = viewport.zoom < 0.35 ? 64 : 32;
        const dotRadius = Math.max(0.85, Math.min(1.4, 1.2 * Math.min(1.2, viewport.zoom)));
        return (
          <div
            id="canvas-grid-bg"
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundSize: `${gridStep * viewport.zoom}px ${gridStep * viewport.zoom}px`,
              backgroundImage: `radial-gradient(circle, var(--border-grid) ${dotRadius}px, transparent ${dotRadius}px)`,
              backgroundPosition: `${viewport.panX}px ${viewport.panY}px`,
            }}
          />
        );
      })()}

      <div
        className="absolute top-0 left-0 w-full h-full origin-top-left pointer-events-none"
        style={{
          transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})`,
          transition: isSmoothZooming ? 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
        }}
      >
        {showMentionLinks && mentionLinkPairs.length > 0 && (
          <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
            style={{ zIndex: 24 }}
          >
            {mentionLinkPairs.map((pair) => {
              const x1 = pair.source.pos_x + pair.source.width / 2;
              const y1 = pair.source.pos_y + pair.source.height / 2;
              const x2 = pair.target.pos_x + pair.target.width / 2;
              const y2 = pair.target.pos_y + pair.target.height / 2;
              const isDimmedLink =
                focusedObjectIds !== null &&
                (!focusedObjectIds.has(pair.source.id) || !focusedObjectIds.has(pair.target.id));
              return (
                <line
                  key={pair.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--connection-purple)"
                  strokeWidth={1.5}
                  strokeDasharray="5,5"
                  strokeOpacity={isDimmedLink ? Math.max(0.05, focusModeOpacity * 0.4) : 0.45}
                />
              );
            })}
          </svg>
        )}

        <ConnectionLayer
          connections={connections}
          objectsMap={objectsMap}
          activeConnectLine={activeConnectLine}
          selectedConnectionId={selectedConnectionId}
          onSelectConnection={(id) => {
            setSelectedConnectionId(id);
            setSelectedObjectIds(new Set());
          }}
          onDeleteConnection={handleDeleteConnection}
          onUpdateConnectionLabel={handleUpdateConnectionLabel}
          onUpdateConnectionStyle={handleUpdateConnectionStyle}
          zoom={viewport.zoom}
          focusedObjectIds={focusedObjectIds}
        />

        {activeGuides.length > 0 && (
          <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
            style={{ zIndex: 90 }}
          >
            {activeGuides.map((guide, idx) => (
              <line
                key={idx}
                x1={guide.orientation === 'vertical' ? guide.pos : visibleBounds.x - 2000}
                y1={guide.orientation === 'horizontal' ? guide.pos : visibleBounds.y - 2000}
                x2={guide.orientation === 'vertical' ? guide.pos : visibleBounds.x + visibleBounds.width + 2000}
                y2={guide.orientation === 'horizontal' ? guide.pos : visibleBounds.y + visibleBounds.height + 2000}
                stroke="var(--active-item)"
                strokeWidth={1 / viewport.zoom}
                strokeDasharray={`${4 / viewport.zoom}, ${4 / viewport.zoom}`}
              />
            ))}
          </svg>
        )}

        {visibleObjects.map((obj) => {
          const isSelected = selectedObjectIds.has(obj.id);
          const isDimmed = focusedObjectIds !== null && !focusedObjectIds.has(obj.id);

          if (obj.object_type === 'section') {
            const isInsideAnotherSection = objects.some(
              (other) =>
                other.id !== obj.id &&
                other.object_type === 'section' &&
                obj.pos_x >= other.pos_x &&
                obj.pos_y >= other.pos_y &&
                obj.pos_x + obj.width <= other.pos_x + other.width &&
                obj.pos_y + obj.height <= other.pos_y + other.height
            );

            return (
              <SectionNode
                key={obj.id}
                object={obj}
                scale={viewport.zoom}
                isSelected={isSelected}
                isInsideSection={isInsideAnotherSection}
                isDimmed={isDimmed}
                dimmedOpacity={focusModeOpacity}
                onDragStart={handleSectionDragStart}
                onUpdatePosition={(id, x, y, dx, dy) =>
                  handleUpdateSectionPosition(id, x, y, dx, dy)
                }
                onDragEnd={handleSectionDragEnd}
                onUpdateSize={handleUpdateSize}
                onFitToContent={handleFitToContent}
                autoFocusTitle={recentlyCreatedSectionId === obj.id}
                onUpdateTitle={(id, title) =>
                  handleUpdateProperties(
                    id,
                    JSON.stringify({ ...JSON.parse(obj.properties_json || '{}'), title })
                  )
                }
                onUpdateColor={(id, bg, border) =>
                  handleUpdateProperties(
                    id,
                    JSON.stringify({
                      ...JSON.parse(obj.properties_json || '{}'),
                      color: bg,
                      borderColor: border,
                    })
                  )
                }
                onDelete={handleDeleteObject}
                onSelect={(id, e) => handleSelectObject(id, e)}
                onTurnIntoSubWhiteboard={handleTurnSectionIntoWhiteboard}
              />
            );
          }

          if (obj.object_type === 'mindmap_node') {
            return (
              <MindmapNode
                key={obj.id}
                object={obj}
                scale={viewport.zoom}
                isSelected={isSelected}
                isDimmed={isDimmed}
                dimmedOpacity={focusModeOpacity}
                cards={cards}
                highlightsMap={highlightsMap}
                onUpdatePosition={handleUpdatePosition}
                onDragEnd={handleCardDragEnd}
                onUpdateData={handleUpdateProperties}
                onDelete={handleDeleteObject}
                onSelect={(id, e) => handleSelectObject(id, e)}
                onStartConnect={handleStartConnect}
                onOpenCard={onOpenCardDrawer || onOpenFullCard}
                onOpenDocument={onOpenDocument}
                onTurnNodeIntoCard={handleTurnMindmapNodeIntoCard}
                onDetachNodeToWhiteboard={handleDetachMindmapNodeToWhiteboard}
              />
            );
          }

          let parsedObjProps: Record<string, unknown> = {};
          try {
            if (obj.properties_json) parsedObjProps = JSON.parse(obj.properties_json);
          } catch {}

          if (parsedObjProps.isSubWhiteboard || obj.object_type === 'whiteboard_shortcut') {
            const subWbId = getSubWhiteboardTargetId(obj);
            const targetWb = subWbId ? whiteboardsMap.get(subWbId) ?? null : null;
            return (
              <SubWhiteboardNode
                key={obj.id}
                obj={obj}
                targetWhiteboard={targetWb}
                stats={subWbId ? whiteboardStatsMap[subWbId] : undefined}
                subWhiteboardView={subWhiteboardView}
                isLargeTextAtSmallZoom={isLargeTextAtSmallZoom}
                zoom={viewport.zoom}
                isSelected={isSelected}
                isDropTarget={dropTargetSubWbObjId === obj.id}
                isConnecting={toolMode === 'connect' || activeConnectLine !== null}
                isRenaming={renamingSubWbObjId === obj.id}
                dimmed={isDimmed}
                focusOpacity={focusModeOpacity}
                onMouseDown={(e) => handleSubWhiteboardMouseDown(obj, e)}
                onNavigate={handleNavigateToWhiteboard}
                onRename={handleRenameSubWhiteboard}
                onFinishRename={() =>
                  setRenamingSubWbObjId((cur) => (cur === obj.id ? null : cur))
                }
                onColorChange={handleSubWhiteboardColorChange}
                onResizeRect={(objId, rect) =>
                  handleUpdateRect(objId, rect.posX, rect.posY, rect.width, rect.height)
                }
                onFitToContent={handleSubWhiteboardFitToContent}
                onChangeSubWhiteboardView={(mode) => updateWhiteboardOption('subWhiteboardView', mode)}
                onDelete={handleDeleteSubWhiteboardNode}
                onStartConnect={(objId, side) => {
                  handleStartConnect(objId, side, getObjectSideAnchor(obj, side));
                }}
              />
            );
          }

          if (obj.object_type === 'pdf' || obj.object_type === 'epub') {
            const docData = obj.target_id ? documentsMap.get(obj.target_id) : null;
            const hlCount = obj.target_id ? docHighlightCounts.get(obj.target_id) ?? 0 : 0;
            return (
              <DocumentNode
                key={obj.id}
                object={obj}
                document={docData}
                highlightCount={hlCount}
                isSelected={isSelected}
                isDimmed={isDimmed}
                dimmedOpacity={focusModeOpacity}
                scale={viewport.zoom}
                onUpdatePosition={handleUpdatePosition}
                onDragEnd={handleCardDragEnd}
                onUpdateSize={handleUpdateSize}
                onDelete={handleDeleteObject}
                onSelect={(id, e) => handleSelectObject(id, e)}
                onStartConnect={handleStartConnect}
                onOpenDocument={(docId) => onOpenDocument?.(docId)}
                onLocate={handleLocateCard}
              />
            );
          }

          if (obj.object_type === 'highlight') {
            const hlData = obj.target_id ? highlightsMap.get(obj.target_id) : null;
            const srcDoc = hlData?.source_id ? documentsMap.get(hlData.source_id) : null;
            const srcCard = !srcDoc && hlData?.source_id ? cardsMap.get(hlData.source_id) : null;
            return (
              <HighlightNode
                key={obj.id}
                object={obj}
                highlight={hlData}
                sourceTitle={srcDoc?.title || srcCard?.title}
                isSelected={isSelected}
                isDimmed={isDimmed}
                dimmedOpacity={focusModeOpacity}
                scale={viewport.zoom}
                onUpdatePosition={handleUpdatePosition}
                onDragEnd={handleCardDragEnd}
                onUpdateSize={handleUpdateSize}
                onDelete={handleDeleteObject}
                onSelect={(id, e) => handleSelectObject(id, e)}
                onStartConnect={handleStartConnect}
                onOpenDocument={onOpenDocument}
                onUpdateHighlightNote={handleUpdateHighlightNote}
                onUpdateHighlightColor={handleUpdateHighlightColor}
                onLocate={handleLocateCard}
              />
            );
          }

          if (obj.object_type === 'media') {
            return (
              <MediaNode
                key={obj.id}
                object={obj}
                scale={viewport.zoom}
                isSelected={isSelected}
                isDimmed={isDimmed}
                dimmedOpacity={focusModeOpacity}
                onUpdatePosition={handleUpdatePosition}
                onDragEnd={handleCardDragEnd}
                onUpdateSize={handleUpdateSize}
                onDelete={handleDeleteObject}
                onSelect={(id, e) => handleSelectObject(id, e)}
                onOpenExternal={(refId) => heptaClient.localFile.openExternal?.(refId)}
                onStartConnect={handleStartConnect}
              />
            );
          }

          const cardData = obj.target_id ? cardsMap.get(obj.target_id) : null;
          const dbTags = obj.target_id ? cardTagsMap.get(obj.target_id) || [] : [];
          const resolvedTags: CardTagBadge[] =
            dbTags.length > 0
              ? dbTags
              : cardData?.content_text
              ? Array.from(
                  new Set(
                    (cardData.content_text.match(/#([A-Za-z0-9_\u4e00-\u9fa5-]+)/g) || []).map((t) =>
                      t.slice(1)
                    )
                  )
                ).map((name) => ({ id: `inline-${name}`, name }))
              : [];
          const wbCount = obj.target_id ? cardWhiteboardCounts.get(obj.target_id) ?? 1 : 1;
          const refCount = obj.target_id ? cardBacklinkCounts.get(obj.target_id) ?? 0 : 0;

          return (
            <WhiteboardCardNode
              key={obj.id}
              object={obj}
              title={cardData ? cardData.title : ''}
              contentText={cardData ? cardData.content_text : ''}
              contentJson={cardData ? cardData.content_json : undefined}
              cards={cards}
              tags={resolvedTags}
              whiteboardCount={wbCount}
              backlinkCount={refCount}
              isSelected={isSelected}
              isSingleSelected={selectedObjectIds.size === 1 && isSelected}
              isDimmed={isDimmed}
              dimmedOpacity={focusModeOpacity}
              showTagsAndProperties={showTagsAndProperties}
              scale={viewport.zoom}
              onUpdatePosition={handleUpdatePosition}
              onDragEnd={handleCardDragEnd}
              onUpdateSize={handleUpdateSize}
              onUpdateRect={handleUpdateRect}
              onUpdateTitle={(targetId, title) => handleUpdateCardTitle(targetId, title)}
              onUpdateContent={(targetId, content) =>
                handleUpdateCardContent(targetId, content)
              }
              onUpdateColor={(id, colorVal) => {
                let props: Record<string, unknown> = {};
                try {
                  if (obj.properties_json) props = JSON.parse(obj.properties_json);
                } catch {}
                props.color = colorVal;
                handleUpdateProperties(id, JSON.stringify(props));
              }}
              onUpdateProperties={handleUpdateProperties}
              onDelete={handleDeleteObject}
              onDeletePermanently={async (targetId) => {
                try {
                  await heptaClient.cards.delete(targetId);
                  onRefreshCards();
                  loadWhiteboardData();
                } catch (err) {
                  console.error(err);
                }
              }}
              onSelect={(id, e) => handleSelectObject(id, e)}
              onStartConnect={handleStartConnect}
              onOpenDrawer={onOpenCardDrawer}
              onOpenFullCard={onOpenFullCard || onOpenCardDrawer}
              onDuplicate={handleDuplicateObject}
              onLocateCard={handleLocateCard}
              isLargeTextAtSmallZoom={isLargeTextAtSmallZoom}
              previewMode={previewMode}
              isFullTitleFoldedCardMode={isFullTitleFoldedCardMode}
            />
          );
        })}

        {selectionBox && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: Math.min(selectionBox.startWorld.x, selectionBox.currentWorld.x),
              top: Math.min(selectionBox.startWorld.y, selectionBox.currentWorld.y),
              width: Math.abs(selectionBox.currentWorld.x - selectionBox.startWorld.x),
              height: Math.abs(selectionBox.currentWorld.y - selectionBox.startWorld.y),
              border: `${1 / Math.max(0.1, viewport.zoom)}px solid var(--active-item)`,
              borderRadius: `${4 / Math.max(0.1, viewport.zoom)}px`,
              backgroundColor: 'var(--middle-transparent-blue)',
              zIndex: 200,
            }}
          />
        )}

        {subWbCreationBox && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: Math.min(subWbCreationBox.startWorld.x, subWbCreationBox.currentWorld.x),
              top: Math.min(subWbCreationBox.startWorld.y, subWbCreationBox.currentWorld.y),
              width: Math.max(
                220,
                Math.abs(subWbCreationBox.currentWorld.x - subWbCreationBox.startWorld.x)
              ),
              height: Math.max(
                128,
                Math.abs(subWbCreationBox.currentWorld.y - subWbCreationBox.startWorld.y)
              ),
              border: `${2 / Math.max(0.1, viewport.zoom)}px dashed var(--active-item)`,
              borderRadius: 28,
              backgroundColor: 'var(--middle-transparent-blue)',
              zIndex: 205,
            }}
          />
        )}
      </div>

      <WhiteboardHeader
        whiteboardId={activeWhiteboardId}
        whiteboardName={effectiveWhiteboardName}
        onUpdateWhiteboardName={(name) => {
          onUpdateWhiteboardName?.(activeWhiteboardId, name);
          setAllWhiteboards((prev) =>
            prev.map((w) => (w.id === activeWhiteboardId ? { ...w, name } : w))
          );
          notifyWhiteboardsChanged();
        }}
        onExportImage={handleExportWhiteboardImage}
        onDeleteWhiteboard={() => onDeleteWhiteboard?.(activeWhiteboardId)}
        isSidebarCollapsed={isSidebarCollapsed}
        onExpandSidebar={onExpandSidebar}
        isSidePanelOpen={isSidePanelOpen}
        onToggleSidePanel={() => {
          if (onToggleSidePanel) {
            onToggleSidePanel();
          } else if (cards.length > 0 && onOpenCardDrawer) {
            onOpenCardDrawer(cards[0].id);
          }
        }}
        onOpenMap={onOpenMap}
        breadcrumbs={effectiveBreadcrumbs}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.epub,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.avif,.mp4,.webm,.mov,.m4v,.mp3,.wav,.m4a,.ogg,.flac,.aac,.md,.markdown,.txt"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      <div className="absolute top-1/2 left-[6px] -translate-y-1/2 flex flex-col gap-y-1.5 p-[3.5px] rounded-[10px] bg-background-primary/95 backdrop-blur-xl border-[0.5px] border-solid border-light-grey shadow-float z-40 text-text-color">
        <button
          onClick={() => setToolMode('select')}
          aria-label="Select tool (V)"
          className={`p-2 rounded-lg transition ${
            toolMode === 'select'
              ? 'bg-active-item text-white shadow'
              : 'hover:bg-ultra-light-grey text-middle-hard-grey'
          }`}
          title="指针选择 (V)"
        >
          <MousePointer size={15} />
        </button>

        <button
          onClick={() => setToolMode('grab')}
          aria-label="Pan canvas (H)"
          className={`p-2 rounded-lg transition ${
            toolMode === 'grab'
              ? 'bg-active-item text-white shadow'
              : 'hover:bg-ultra-light-grey text-middle-hard-grey'
          }`}
          title="拖动画布 (H / 按住空格 / 鼠标右键或中键拖拽)"
        >
          <Hand size={15} />
        </button>

        <button
          onClick={() => handleCreateCardObject()}
          className="p-2 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color transition"
          title="笔记卡片 (N)"
        >
          <StickyNote size={15} />
        </button>

        <button
          aria-label="Upload files"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color transition"
          title="Upload files (Ctrl+U)"
        >
          <Paperclip size={15} />
        </button>

        <button
          onClick={handleImportDocuments}
          className="p-2 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
          title="导入 PDF / EPUB 文献到白板"
        >
          <FileUp size={15} />
        </button>

        <button
          onClick={() => setToolMode(toolMode === 'connect' ? 'select' : 'connect')}
          className={`p-2 rounded-lg transition ${
            toolMode === 'connect'
              ? 'bg-active-item text-white shadow'
              : 'hover:bg-ultra-light-grey text-middle-hard-grey'
          }`}
          title="卡片连线 (C)"
        >
          <Link2 size={15} />
        </button>

        <button
          onClick={() => handleCreateCardObject(undefined, 'text')}
          className="p-2 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color transition"
          title="画布独立文本 (T)"
        >
          <Type size={15} />
        </button>

        <button
          onClick={handleCreateSectionObject}
          aria-label="Create Section"
          className="p-2 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color transition"
          title="结构分区容器 (G)"
        >
          <Layers size={15} />
        </button>

        <button
          type="button"
          aria-label="Create Sub-whiteboard"
          onClick={(e) => {
            if (e.shiftKey) {
              setToolMode(toolMode === 'sub_whiteboard' ? 'select' : 'sub_whiteboard');
            } else {
              void handleCreateSubWhiteboardObject();
            }
          }}
          className={`p-2 rounded-lg transition ${
            toolMode === 'sub_whiteboard'
              ? 'bg-active-item text-white shadow'
              : 'hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color'
          }`}
          title="嵌套子白板 (W) · Shift+点击拖框创建"
        >
          <FolderPlus size={15} />
        </button>

        <button
          type="button"
          aria-label="Create Whiteboard Shortcut"
          onClick={() => {
            setShortcutPlaceWorldPos(null);
            setShortcutSearchQuery('');
            setShowShortcutPopover((prev) => !prev);
          }}
          className={`p-2 rounded-lg transition ${
            showShortcutPopover
              ? 'bg-active-item text-white shadow'
              : 'hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color'
          }`}
          title="白板快捷方式 (Whiteboard shortcut)"
        >
          <ArrowUpRight size={15} />
        </button>

        <button
          onClick={() => setShowSearchModal(true)}
          className={`p-2 rounded-lg transition ${
            showSearchModal
              ? 'bg-active-item text-white shadow'
              : 'hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color'
          }`}
          title="搜索此白板内容 (Ctrl+P)"
        >
          <Search size={15} />
        </button>

        <div className="h-[1px] w-5 bg-light-grey mx-auto my-0.5" />

        <div className="relative">
          <button
            onClick={() => setShowMoreToolsMenu(!showMoreToolsMenu)}
            className={`p-2 rounded-lg transition ${
              showMoreToolsMenu
                ? 'bg-active-item text-white'
                : 'hover:bg-ultra-light-grey text-middle-hard-grey'
            }`}
            title="更多白板工具"
          >
            <MoreHorizontal size={15} />
          </button>

          {showMoreToolsMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute left-11 bottom-0 w-48 max-h-[calc(100vh-80px)] overflow-y-auto p-1.5 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-light-grey shadow-main flex flex-col gap-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
            >
              <button
                onClick={handleCreateJournalObject}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-ultra-light-grey transition text-left"
              >
                <div className="flex items-center gap-2 text-text-color">
                  <BookOpen size={14} className="text-blue-500" />
                  <span>日记卡片 (Journal)</span>
                </div>
              </button>

              <button
                onClick={() => {
                  handleCreateJournalObject();
                  setShowMoreToolsMenu(false);
                }}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-ultra-light-grey transition text-left"
              >
                <div className="flex items-center gap-2 text-text-color">
                  <Calendar size={14} className="text-orange-500" />
                  <span>日历视图 (Calendar)</span>
                </div>
              </button>

              <button
                onClick={handleCreateMindmapObject}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-ultra-light-grey transition text-left"
              >
                <div className="flex items-center gap-2 text-text-color">
                  <Network size={14} className="text-active-item" />
                  <span>思维导图 (Mindmap)</span>
                </div>
                <span className="text-[10px] font-mono text-middle-grey">M</span>
              </button>

              <button
                onClick={() => void handleCreateSubWhiteboardObject()}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-ultra-light-grey transition text-left"
              >
                <div className="flex items-center gap-2 text-text-color">
                  <FolderPlus size={14} className="text-purple-500" />
                  <span>嵌套子白板</span>
                </div>
                <span className="text-[10px] font-mono text-middle-grey">W</span>
              </button>

              <button
                onClick={() => {
                  setShowMoreToolsMenu(false);
                  setShortcutPlaceWorldPos(null);
                  setShortcutSearchQuery('');
                  setShowShortcutPopover(true);
                }}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-ultra-light-grey transition text-left"
              >
                <div className="flex items-center gap-2 text-text-color">
                  <Bookmark size={14} className="text-emerald-500" />
                  <span>白板快捷方式</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {multiSelectionToolbarPos && (
        <div
          data-canvas-ui="true"
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -translate-x-1/2 flex items-center gap-1 p-1.5 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-light-grey shadow-main z-50 text-text-color animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: multiSelectionToolbarPos.left,
            top: multiSelectionToolbarPos.top,
          }}
        >
          <div className="text-[11px] font-medium px-2 py-0.5 text-middle-grey border-r border-light-grey mr-0.5">
            已选 {selectedObjectIds.size} 项
          </div>

          <button
            onClick={() => handleAlign('left')}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
            title="左对齐 (EX)"
          >
            <AlignLeft size={14} />
          </button>
          <button
            onClick={() => handleAlign('centerHorizontally')}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
            title="水平居中对齐 (EX)"
          >
            <AlignCenter size={14} />
          </button>
          <button
            onClick={() => handleAlign('right')}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
            title="右对齐 (EX)"
          >
            <AlignRight size={14} />
          </button>

          <div className="w-[1px] h-3.5 bg-light-grey mx-0.5" />

          <button
            onClick={() => handleAlign('top')}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
            title="顶对齐 (EX)"
          >
            <AlignVerticalJustifyStart size={14} />
          </button>
          <button
            onClick={() => handleAlign('centerVertically')}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
            title="垂直居中对齐 (EX)"
          >
            <AlignVerticalJustifyCenter size={14} />
          </button>
          <button
            onClick={() => handleAlign('bottom')}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
            title="底对齐 (EX)"
          >
            <AlignVerticalJustifyEnd size={14} />
          </button>

          <div className="w-[1px] h-3.5 bg-light-grey mx-0.5" />

          <button
            onClick={() => handleArrange('row')}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
            title="水平横排排版 (bxe)"
          >
            <Columns size={14} />
          </button>
          <button
            onClick={() => handleArrange('column')}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
            title="垂直竖排排版 (bxe)"
          >
            <Rows size={14} />
          </button>
          <button
            onClick={() => handleArrange('grid')}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
            title="矩阵网格排版 (bxe)"
          >
            <LayoutGrid size={14} />
          </button>

          <div className="w-[1px] h-3.5 bg-light-grey mx-0.5" />

          <button
            onClick={handleCreateSectionForSelected}
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition cursor-pointer"
            title="将所选元素打包框入新分区 (G)"
          >
            <Layers size={14} />
          </button>
          <button
            onClick={handleCreateSubWhiteboardFromSelected}
            aria-label="Pack into Sub-whiteboard"
            className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition cursor-pointer"
            title="将所选元素打包为子白板 (Create sub-whiteboard)"
          >
            <FolderPlus size={14} />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowBatchColorPicker(!showBatchColorPicker)}
              className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-active-item transition"
              title="批量更改色彩"
            >
              <Palette size={14} />
            </button>

            {showBatchColorPicker && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-8 left-1/2 -translate-x-1/2 p-2 bg-menu-bg border border-light-grey rounded-xl shadow-xl flex items-center gap-1.5 z-50 backdrop-blur-md"
              >
                {HEPTA_CARD_PALETTE.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleBatchUpdateColor(c.cssVar)}
                    className="w-4 h-4 rounded-full border border-black/10 hover:scale-125 transition"
                    style={{ background: c.cssVar }}
                    title={c.label}
                  />
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleBatchDelete}
            className="p-1 rounded-lg hover:bg-danger-item/10 text-danger-item transition"
            title="批量删除所选元素 (Delete)"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}

      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="pointer-events-none absolute bottom-1 right-1 flex flex-col items-end gap-y-1.5 z-40 select-none"
      >
        {showMinimap && (
          <div className="pointer-events-auto w-52 h-36 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-light-grey shadow-main overflow-hidden p-1 flex flex-col animate-in fade-in duration-150">
          <div className="text-[10px] text-middle-grey px-2 py-1 font-medium flex justify-between items-center border-b border-light-grey">
            <span className="font-semibold text-text-color">全景小地图 (Minimap)</span>
            <span className="font-mono text-[9px] text-middle-grey">{objects.length} 元素</span>
          </div>
          <div
            className="relative flex-1 bg-background-primary/60 border border-light-grey rounded-lg overflow-hidden cursor-crosshair"
            onMouseDown={(e) => {
              const updateViewportFromMinimap = (clientX: number, clientY: number, targetRect: DOMRect) => {
                const clickXRatio = Math.max(0, Math.min(1, (clientX - targetRect.left) / targetRect.width));
                const clickYRatio = Math.max(0, Math.min(1, (clientY - targetRect.top) / targetRect.height));
                const targetWorldX = (clickXRatio - 0.5) * 4000;
                const targetWorldY = (clickYRatio - 0.5) * 4000;
                const newVp: ViewportState = {
                  zoom: viewport.zoom,
                  panX: containerSize.width / 2 - targetWorldX * viewport.zoom,
                  panY: containerSize.height / 2 - targetWorldY * viewport.zoom,
                };
                setViewport(newVp);
                saveViewport(newVp);
              };

              const rect = e.currentTarget.getBoundingClientRect();
              updateViewportFromMinimap(e.clientX, e.clientY, rect);

              const handleMinimapMouseMove = (moveEvt: MouseEvent) => {
                updateViewportFromMinimap(moveEvt.clientX, moveEvt.clientY, rect);
              };

              const handleMinimapMouseUp = () => {
                window.removeEventListener('mousemove', handleMinimapMouseMove);
                window.removeEventListener('mouseup', handleMinimapMouseUp);
              };

              window.addEventListener('mousemove', handleMinimapMouseMove);
              window.addEventListener('mouseup', handleMinimapMouseUp);
            }}
          >
            {objects.map((obj) => (
              <div
                key={obj.id}
                className={`absolute rounded-[1px] ${
                  obj.object_type === 'section'
                    ? 'border border-active-item/40 bg-active-item/10'
                    : obj.object_type === 'mindmap_node'
                    ? 'bg-successful-item/70'
                    : 'bg-active-item/80'
                }`}
                style={{
                  left: `${Math.max(0, Math.min(95, ((obj.pos_x + 2000) / 4000) * 100))}%`,
                  top: `${Math.max(0, Math.min(95, ((obj.pos_y + 2000) / 4000) * 100))}%`,
                  width: `${Math.max(3, (obj.width / 4000) * 100)}%`,
                  height: `${Math.max(2.5, (obj.height / 4000) * 100)}%`,
                }}
              />
            ))}

            <div
              className="absolute border-2 border-active-item bg-active-item/20 rounded pointer-events-none transition-transform"
              style={{
                left: `${Math.max(0, Math.min(98, (((-viewport.panX / viewport.zoom) + 2000) / 4000) * 100))}%`,
                top: `${Math.max(0, Math.min(98, (((-viewport.panY / viewport.zoom) + 2000) / 4000) * 100))}%`,
                width: `${Math.max(5, ((containerSize.width / viewport.zoom) / 4000) * 100)}%`,
                height: `${Math.max(5, ((containerSize.height / viewport.zoom) / 4000) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-x-2 rounded bg-whiteboard-background p-1 text-text-color">
        <div className="relative">
          <button
            aria-label="Options"
            onClick={() => {
              setShowNavigationMenu(false);
              setShowOptionsMenu(!showOptionsMenu);
            }}
            className={`p-1.5 rounded-lg transition ${
              showOptionsMenu
                ? 'bg-active-item text-white shadow'
                : 'hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color'
            }`}
            title="Options"
          >
            <Sliders size={15} />
          </button>

          {showOptionsMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-11 right-0 w-[248px] overflow-y-hidden p-1.5 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-light-grey shadow-2xl flex flex-col z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="pb-1 border-b border-light-grey">
                <OptionToggleRow
                  title="Full title for folded cards"
                  description="Display the full title for folded cards"
                  checked={isFullTitleFoldedCardMode}
                  onToggle={() =>
                    updateWhiteboardOption(
                      'isFullTitleFoldedCardMode',
                      !isFullTitleFoldedCardMode
                    )
                  }
                />
              </div>

              <div className="py-1 border-b border-light-grey">
                <OptionToggleRow
                  title="Large text at small zoom"
                  description="Display larger text for card when zoom out"
                  checked={isLargeTextAtSmallZoom}
                  onToggle={() =>
                    updateWhiteboardOption('isLargeTextAtSmallZoom', !isLargeTextAtSmallZoom)
                  }
                />
              </div>

              <div className="py-1 border-b border-light-grey">
                <OptionToggleRow
                  title="Show mention link"
                  description="Display visible link if an object mentions another"
                  checked={showMentionLinks}
                  onToggle={() => updateWhiteboardOption('showMentionLinks', !showMentionLinks)}
                />
              </div>

              <div className="py-1 border-b border-light-grey">
                <OptionToggleRow
                  title="Minimap"
                  description="Show a minimap of the whiteboard"
                  checked={showMinimap}
                  onToggle={() => updateWhiteboardOption('showMinimap', !showMinimap)}
                />
              </div>

              <div className="pt-1">
                <OptionToggleRow
                  title="Focus mode"
                  description="Dim everything except the selected objects and their connections"
                  checked={isFocusMode}
                  onToggle={() => updateWhiteboardOption('isFocusMode', !isFocusMode)}
                />
                <div
                  className={`transition-[max-height] duration-200 overflow-hidden ${
                    isFocusMode ? 'max-h-[66px]' : 'max-h-0'
                  }`}
                >
                  <div className="mx-1 mb-1 flex flex-col gap-0.5 px-2 py-1 rounded-lg bg-ultra-light-grey/60">
                    <div className="flex items-center gap-2 h-7">
                      <span
                        className="shrink-0 text-middle-hard-grey"
                        title="Connection depth"
                      >
                        <Link2 size={14} />
                      </span>
                      <input
                        type="range"
                        aria-label="Connection depth"
                        min={0}
                        max={5}
                        step={1}
                        value={connectionDepth}
                        disabled={!isFocusMode}
                        onChange={(e) =>
                          updateWhiteboardOption('connectionDepth', Number(e.target.value))
                        }
                        className="flex-1 min-w-0 accent-active-item cursor-pointer h-1"
                      />
                      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-text-color">
                        {connectionDepth}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 h-7">
                      <span
                        className="shrink-0 text-middle-hard-grey"
                        title="Fade other objects"
                      >
                        <Eye size={14} />
                      </span>
                      <input
                        type="range"
                        aria-label="Fade other objects"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(focusModeOpacity * 100)}
                        disabled={!isFocusMode}
                        onChange={(e) =>
                          updateWhiteboardOption('focusModeOpacity', Number(e.target.value) / 100)
                        }
                        className="flex-1 min-w-0 accent-active-item cursor-pointer h-1"
                      />
                      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-text-color">
                        {Math.round(focusModeOpacity * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            aria-label="Navigation mode"
            onClick={() => {
              setShowOptionsMenu(false);
              setShowNavigationMenu(!showNavigationMenu);
            }}
            className={`p-1.5 rounded-lg transition ${
              showNavigationMenu
                ? 'bg-ultra-light-grey text-active-item'
                : 'hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color'
            }`}
            title="Navigation mode"
          >
            {navigationMode === 'mouse' ? <Mouse size={15} /> : <Touchpad size={15} />}
          </button>

          {showNavigationMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-11 right-0 w-[248px] p-1 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-light-grey shadow-2xl flex flex-col gap-0.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
            >
              <button
                type="button"
                aria-label="Mouse navigation"
                onClick={() => {
                  updateWhiteboardOption('navigationMode', 'mouse');
                  setShowNavigationMenu(false);
                }}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition cursor-pointer ${
                  navigationMode === 'mouse'
                    ? 'bg-light-grey text-text-color'
                    : 'hover:bg-ultra-light-grey text-text-color'
                }`}
              >
                <Mouse size={16} className="shrink-0 text-middle-hard-grey" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium leading-tight text-text-color">
                    Mouse navigation
                  </p>
                  <p className="mt-0.5 text-[11px] leading-tight text-middle-grey">
                    Right click to move / Scroll to zoom
                  </p>
                </div>
                {navigationMode === 'mouse' && (
                  <Check size={14} className="shrink-0 text-active-item" />
                )}
              </button>
              <button
                type="button"
                aria-label="Trackpad navigation"
                onClick={() => {
                  updateWhiteboardOption('navigationMode', 'trackpad');
                  setShowNavigationMenu(false);
                }}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition cursor-pointer ${
                  navigationMode === 'trackpad'
                    ? 'bg-light-grey text-text-color'
                    : 'hover:bg-ultra-light-grey text-text-color'
                }`}
              >
                <Touchpad size={16} className="shrink-0 text-middle-hard-grey" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium leading-tight text-text-color">
                    Trackpad navigation
                  </p>
                  <p className="mt-0.5 text-[11px] leading-tight text-middle-grey">
                    Slide to move / Pinch to zoom
                  </p>
                </div>
                {navigationMode === 'trackpad' && (
                  <Check size={14} className="shrink-0 text-active-item" />
                )}
              </button>
            </div>
          )}
        </div>

        <button
          aria-label="Zoom to fit"
          onClick={() => {
            handleZoomToFit();
          }}
          className="font-feature-tnum w-[59.28px] text-[12px] text-middle-hard-grey hover:text-text-color hover:bg-ultra-light-grey px-1 py-1 rounded-lg text-center transition cursor-pointer select-none"
          title="Zoom to fit (Shift+1)"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>

        <button
          aria-label="Zoom in"
          onClick={handleZoomIn}
          className="p-1.5 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color transition"
          title="Zoom in (Ctrl+↑)"
        >
          <ZoomIn size={15} />
        </button>

        <button
          aria-label="Zoom out"
          onClick={handleZoomOut}
          className="p-1.5 rounded-lg hover:bg-ultra-light-grey text-middle-hard-grey hover:text-text-color transition"
          title="Zoom out (Ctrl+↓)"
        >
          <ZoomOut size={15} />
        </button>
      </div>
      </div>

      {showSearchModal && (
        <div
          onClick={() => setShowSearchModal(false)}
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-100"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-background-secondary border border-light-grey rounded-2xl shadow-2xl overflow-hidden p-3 flex flex-col gap-2 text-text-color animate-in zoom-in-95 duration-100"
          >
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-ultra-light-grey border border-light-grey">
              <Search size={16} className="text-active-item shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索此白板中的卡片与文本内容... (ESC 退出)"
                className="flex-1 bg-transparent text-sm text-text-color placeholder:text-middle-grey outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 rounded text-middle-grey hover:text-text-color"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto flex flex-col gap-1 p-1">
              {objects
                .filter((o) => {
                  if (!searchQuery.trim()) return true;
                  const card = o.target_id ? cardsMap.get(o.target_id) : null;
                  const doc = o.target_id ? documentsMap.get(o.target_id) : null;
                  const hl = o.target_id ? highlightsMap.get(o.target_id) : null;
                  const title = card?.title || doc?.title || '';
                  const text = card?.content_text || hl?.text_content || hl?.note_text || '';
                  let propsTitle = '';
                  try {
                    if (o.properties_json) propsTitle = JSON.parse(o.properties_json).title || '';
                  } catch {}
                  const q = searchQuery.toLowerCase();
                  return (
                    title.toLowerCase().includes(q) ||
                    text.toLowerCase().includes(q) ||
                    propsTitle.toLowerCase().includes(q)
                  );
                })
                .slice(0, 15)
                .map((o) => {
                  const card = o.target_id ? cardsMap.get(o.target_id) : null;
                  const doc = o.target_id ? documentsMap.get(o.target_id) : null;
                  const hl = o.target_id ? highlightsMap.get(o.target_id) : null;
                  let objTitle = card?.title || doc?.title;
                  if (!objTitle && hl) {
                    objTitle = hl.text_content?.slice(0, 50) || 'Highlight';
                  }
                  if (!objTitle) {
                    try {
                      if (o.properties_json) objTitle = JSON.parse(o.properties_json).title;
                    } catch {}
                  }
                  if (!objTitle) {
                    objTitle = o.object_type === 'section' ? '结构分区' : o.object_type === 'mindmap_node' ? '思维导图' : 'Untitled';
                  }

                  return (
                    <div
                      key={o.id}
                      onClick={() => {
                        const targetZoom = Math.max(0.8, viewport.zoom);
                        const newVp: ViewportState = {
                          zoom: targetZoom,
                          panX: containerSize.width / 2 - (o.pos_x + o.width / 2) * targetZoom,
                          panY: containerSize.height / 2 - (o.pos_y + o.height / 2) * targetZoom,
                        };
                        setViewport(newVp);
                        saveViewport(newVp);
                        setSelectedObjectIds(new Set([o.id]));
                        setShowSearchModal(false);
                      }}
                      className="p-2.5 rounded-xl hover:bg-ultra-light-grey cursor-pointer transition flex items-center justify-between"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-semibold text-text-color truncate">{objTitle}</span>
                        <span className="text-[11px] text-middle-grey truncate">
                          {card?.content_text || hl?.note_text || `类型: ${o.object_type}`}
                        </span>
                      </div>
                      <span className="text-[10px] text-middle-grey font-mono shrink-0 ml-2">跳转定位</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {showShortcutsModal && (
        <div
          onClick={() => setShowShortcutsModal(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-background-secondary border border-light-grey rounded-2xl shadow-2xl overflow-hidden p-6 flex flex-col gap-5 text-text-color"
          >
            <div className="flex items-center justify-between border-b border-light-grey pb-3">
              <div className="flex items-center gap-2.5">
                <Keyboard size={20} className="text-active-item" />
                <h3 className="text-base font-semibold">白板全局快捷键速查表 (Keyboard Shortcuts)</h3>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-grey hover:text-text-color transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
              <div className="p-3.5 rounded-xl bg-ultra-light-grey/80 border border-light-grey flex flex-col gap-2">
                <div className="text-xs font-bold text-active-item flex items-center gap-1.5 pb-1 border-b border-light-grey">
                  <span>工具切换与对象创建</span>
                </div>
                {[
                  { label: '指针选择模式 (Select)', key: 'V' },
                  { label: '抓手漫游 (Grab)', key: 'H / Space (按住)' },
                  { label: '新建笔记卡片 (Note Card)', key: 'N' },
                  { label: '建立卡片连线 (Connect)', key: 'C' },
                  { label: '画布独立文字 (Text)', key: 'T' },
                  { label: '结构分区容器 (Section)', key: 'G' },
                  { label: '思维导图节点 (Mindmap)', key: 'M' },
                  { label: '上传附件文件 (Upload)', key: 'Ctrl + U' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-text-color">{item.label}</span>
                    <kbd className="px-2 py-0.5 rounded bg-background-primary border border-light-grey text-[11px] font-mono shadow-sm">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-xl bg-ultra-light-grey/80 border border-light-grey flex flex-col gap-2">
                <div className="text-xs font-bold text-active-item flex items-center gap-1.5 pb-1 border-b border-light-grey">
                  <span>视口缩放与导航漫游</span>
                </div>
                {[
                  { label: '适应全白板视口 (Zoom to Fit)', key: 'Shift + 1' },
                  { label: '1:1 视角复位 (Reset Zoom)', key: 'Shift + 0' },
                  { label: '放大视口 (Zoom In)', key: 'Ctrl + = / +' },
                  { label: '缩小视口 (Zoom Out)', key: 'Ctrl + -' },
                  { label: '画布自由平移', key: '鼠标滚轮 / 触控板轻扫' },
                  { label: '视口锚点缩放', key: 'Ctrl + 滚轮 / 双指捏合' },
                  { label: '多选卡片 (Marquee)', key: '背景拖拽框选' },
                  { label: '追加选中项', key: 'Shift + 点击' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-text-color">{item.label}</span>
                    <kbd className="px-2 py-0.5 rounded bg-background-primary border border-light-grey text-[11px] font-mono shadow-sm">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>

              <div className="col-span-2 p-3.5 rounded-xl bg-ultra-light-grey/80 border border-light-grey flex flex-col gap-2">
                <div className="text-xs font-bold text-active-item flex items-center gap-1.5 pb-1 border-b border-light-grey">
                  <span>全局检索、拓扑与通用动作</span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {[
                    { label: '搜索白板卡片与内容', key: 'Ctrl + P / Ctrl + F' },
                    { label: '打开本快捷键速查表', key: 'Ctrl + / 或 ?' },
                    { label: '删除选中卡片或连线', key: 'Delete / Backspace' },
                    { label: '撤销位移 (Undo)', key: 'Ctrl + Z' },
                    { label: '重做位移 (Redo)', key: 'Ctrl + Y / Ctrl+Shift+Z' },
                    { label: '取消选择 / 关闭弹窗', key: 'Escape' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-text-color">{item.label}</span>
                      <kbd className="px-2 py-0.5 rounded bg-background-primary border border-light-grey text-[11px] font-mono shadow-sm">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-light-grey">
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="px-5 py-1.5 rounded-lg text-xs font-medium bg-active-item text-white hover:brightness-105 transition"
              >
                确定 (ESC)
              </button>
            </div>
          </div>
        </div>
      )}

      {showLintModal && (
        <div
          onClick={() => setShowLintModal(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-background-secondary border border-light-grey rounded-2xl shadow-main overflow-hidden p-5 flex flex-col gap-4 text-text-color"
          >
            <div className="flex items-center justify-between border-b border-light-grey pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-active-item" />
                <h3 className="text-sm font-semibold">白板拓扑冲突巡检 (lintWhiteboard)</h3>
              </div>
              <button
                onClick={() => setShowLintModal(false)}
                className="p-1 rounded-lg hover:bg-ultra-light-grey text-middle-grey hover:text-text-color"
              >
                <X size={15} />
              </button>
            </div>

            {lintIssues.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center text-center gap-2">
                <CheckCircle2 size={32} className="text-successful-item" />
                <span className="text-sm font-medium">当前白板布局规范健康</span>
                <span className="text-xs text-middle-grey">未检测到卡片重叠、分区交叉或越界悬空等拓扑冲突。</span>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto flex flex-col gap-2">
                {lintIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-ultra-light-grey border border-light-grey flex flex-col gap-1 text-xs"
                  >
                    <div className="flex items-center gap-2 font-semibold text-danger-item">
                      <span>[{issue.type}]</span>
                      <span>{issue.message}</span>
                    </div>
                    <div className="text-[11px] text-middle-grey font-mono">
                      关联对象: {issue.objectIds.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-light-grey">
              <button
                onClick={() => setShowLintModal(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-active-item text-white hover:brightness-105 transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      {showShortcutPopover && (
        <div
          role="dialog"
          data-canvas-ui="true"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            setShowShortcutPopover(false);
            setShortcutPlaceWorldPos(null);
          }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/20 backdrop-blur-[1px]"
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-menu-bg border border-light-grey shadow-main overflow-hidden p-3 flex flex-col gap-2 text-text-color"
          >
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-text-color">
                <ArrowUpRight size={14} className="text-active-item" />
                <span>Create Whiteboard Shortcut</span>
              </div>
              <button
                type="button"
                aria-label="Close shortcut picker"
                onClick={() => {
                  setShowShortcutPopover(false);
                  setShortcutPlaceWorldPos(null);
                }}
                className="p-1 rounded-md hover:bg-ultra-light-grey text-middle-grey hover:text-text-color cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-background-primary border border-light-grey">
              <Search size={14} className="text-middle-grey shrink-0" />
              <input
                type="text"
                autoFocus
                aria-label="Search whiteboards for shortcut"
                value={shortcutSearchQuery}
                onChange={(e) => setShortcutSearchQuery(e.target.value)}
                placeholder="Search existing whiteboards..."
                className="flex-1 bg-transparent text-xs text-text-color placeholder:text-middle-grey outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
              {filteredShortcutWhiteboards.length === 0 ? (
                <div className="py-6 text-center text-xs text-middle-grey">
                  No other whiteboards found.
                </div>
              ) : (
                filteredShortcutWhiteboards.map((wb) => (
                  <button
                    key={wb.id}
                    type="button"
                    aria-label={`Shortcut to ${wb.name}`}
                    onClick={() =>
                      void handleCreateWhiteboardShortcut(wb, shortcutPlaceWorldPos || undefined)
                    }
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-ultra-light-grey text-left transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <LayoutGrid size={13} className="text-active-item shrink-0" />
                      <span className="text-xs font-medium text-text-color truncate">
                        {wb.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-middle-grey shrink-0">Shortcut</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {canvasContextMenu && (
        <div
          role="menu"
          data-canvas-ui="true"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            left: canvasContextMenu.screenX,
            top: canvasContextMenu.screenY,
          }}
          className="absolute z-50 w-52 p-1.5 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-light-grey shadow-main flex flex-col gap-0.5 text-xs text-text-color"
        >
          <button
            type="button"
            onClick={() => {
              const pos = canvasContextMenu.worldPos;
              setCanvasContextMenu(null);
              void handleCreateCardObject({ x: pos.x - 260, y: pos.y - 120 });
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-ultra-light-grey text-left transition cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <StickyNote size={13} className="text-middle-hard-grey" />
              <span>Note card</span>
            </span>
            <span className="text-[10px] font-mono text-middle-grey">N</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCanvasContextMenu(null);
              void handleCreateSectionObject();
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-ultra-light-grey text-left transition cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Layers size={13} className="text-middle-hard-grey" />
              <span>Section</span>
            </span>
            <span className="text-[10px] font-mono text-middle-grey">G</span>
          </button>
          <div className="h-px bg-light-grey my-0.5" />
          <button
            type="button"
            onClick={() => {
              const pos = canvasContextMenu.worldPos;
              const dim = HEPTA_DEFAULT_DIMENSIONS.sub_whiteboard || { width: 640, height: 420 };
              setCanvasContextMenu(null);
              void handleCreateSubWhiteboardObject({
                x: pos.x - dim.width / 2,
                y: pos.y - dim.height / 2,
                width: dim.width,
                height: dim.height,
              });
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-ultra-light-grey text-left transition cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <FolderPlus size={13} className="text-active-item" />
              <span>Sub-whiteboard</span>
            </span>
            <span className="text-[10px] font-mono text-middle-grey">W</span>
          </button>
          <button
            type="button"
            aria-label="Create Whiteboard Shortcut"
            onClick={() => {
              const pos = canvasContextMenu.worldPos;
              const dim = HEPTA_DEFAULT_DIMENSIONS.whiteboard_shortcut || {
                width: 640,
                height: 128,
              };
              setCanvasContextMenu(null);
              setShortcutPlaceWorldPos({
                x: pos.x - dim.width / 2,
                y: pos.y - dim.height / 2,
              });
              setShortcutSearchQuery('');
              setShowShortcutPopover(true);
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-ultra-light-grey text-left transition cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <ArrowUpRight size={13} className="text-emerald-500" />
              <span>Whiteboard shortcut</span>
            </span>
          </button>
        </div>
      )}

      {subWbToast && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-2.5 rounded-xl border shadow-main text-xs font-medium backdrop-blur-xl ${
            subWbToast.type === 'warning'
              ? 'bg-danger-item/15 border-danger-item/40 text-danger-item'
              : 'bg-menu-bg/95 border-light-grey text-text-color'
          }`}
        >
          <span>{subWbToast.message}</span>
          {subWbToast.targetWhiteboardId && (
            <button
              type="button"
              aria-label="View target sub-whiteboard"
              onClick={() => {
                if (subWbToast.targetWhiteboardId) {
                  handleNavigateToWhiteboard(subWbToast.targetWhiteboardId);
                }
              }}
              className="px-2.5 py-1 rounded-md bg-active-item text-white text-[11px] font-semibold hover:brightness-110 transition cursor-pointer"
            >
              View
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setSubWbToast(null)}
            className="p-0.5 rounded hover:bg-light-grey text-middle-grey hover:text-text-color cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
