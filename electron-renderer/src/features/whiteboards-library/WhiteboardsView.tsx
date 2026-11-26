import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutGrid,
  List,
  Plus,
  Search,
  X,
  Pin,
  PinOff,
  MoreHorizontal,
  Edit3,
  Copy,
  Files,
  Trash2,
  ArrowUpDown,
  Link2,
  Check,
  StickyNote,
  Layers,
  Network,
  GitBranch,
  Image as ImageIcon,
} from 'lucide-react';
import { Whiteboard, WhiteboardObject, WhiteboardStatsRow } from '@shared/types';
import { resolveCardBgColor, resolveSectionColors } from '@shared/palette';
import { heptaClient } from '../../client';
import { useAppModal } from '../../primitives/AppModal';
import { SidebarExpandButton } from '../../primitives/SidebarExpandButton';

type WhiteboardStats = WhiteboardStatsRow;

export interface WhiteboardsViewProps {
  whiteboards: Whiteboard[];
  activeWhiteboardId: string;
  pinnedIds?: string[];
  onTogglePin?: (id: string) => void;
  onSelectWhiteboard: (id: string) => void;
  onCreateWhiteboard: () => Promise<void> | void;
  onRenameWhiteboard: (id: string, name: string) => Promise<void> | void;
  onDeleteWhiteboard: (id: string) => Promise<void> | void;
  onReloadWhiteboards?: () => Promise<void> | void;
  isSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
}

type SortField = 'updated' | 'created' | 'name';
type ViewMode = 'grid' | 'table';

const PINNED_STORAGE_KEY = 'openhepta-pinned-whiteboards';

function readStoredPinnedIds(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseColorFromProps(propsJson: string): string | null {
  try {
    const parsed = propsJson ? JSON.parse(propsJson) : {};
    return parsed?.color || parsed?.bgColor || null;
  } catch {
    return null;
  }
}

function resolveConnectionPreviewColor(styleJson: string): string {
  try {
    const parsed = styleJson ? JSON.parse(styleJson) : {};
    const c = parsed?.strokeColor || parsed?.color;
    if (!c) return 'var(--connection-blue, var(--active-item))';
    if (typeof c === 'string') {
      if (c.startsWith('var(') || c.startsWith('#') || c.startsWith('rgb') || c.startsWith('hsl')) {
        return c;
      }
      return `var(--connection-${c}, var(--active-item))`;
    }
  } catch {
    
  }
  return 'var(--connection-blue, var(--active-item))';
}

function WhiteboardMiniMap({ stats }: { stats?: WhiteboardStats }) {
  const objects = stats?.objects || [];
  const conns = stats?.connList || [];
  const cardColorMap = stats?.cardColorMap || {};
  const highlightColorMap = stats?.highlightColorMap || {};

  if (objects.length === 0) {
    return (
      <div
        className="w-full h-full flex items-center justify-center bg-whiteboard-background"
        style={{
          backgroundImage:
            'radial-gradient(circle, var(--border-grid) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      >
        <span className="text-[11px] text-middle-grey">Empty whiteboard</span>
      </div>
    );
  }

  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const objMap = new Map<string, WhiteboardObject>();

  for (const obj of objects) {
    objMap.set(obj.id, obj);
    minX = Math.min(minX, obj.pos_x);
    minY = Math.min(minY, obj.pos_y);
    maxX = Math.max(maxX, obj.pos_x + Math.max(40, obj.width));
    maxY = Math.max(maxY, obj.pos_y + Math.max(24, obj.height));
  }

  const spanX = Math.max(400, maxX - minX);
  const spanY = Math.max(260, maxY - minY);
  const padX = spanX * 0.1;
  const padY = spanY * 0.1;
  const vbX = minX - padX;
  const vbY = minY - padY;
  const vbW = spanX + padX * 2;
  const vbH = spanY + padY * 2;
  const strokeW = Math.max(2, vbW * 0.004);

  const sections = objects.filter((o) => o.object_type === 'section');
  const others = objects.filter((o) => o.object_type !== 'section');

  return (
    <div
      className="w-full h-full bg-whiteboard-background overflow-hidden relative"
      style={{
        backgroundImage:
          'radial-gradient(circle, var(--border-grid) 1px, transparent 1px)',
        backgroundSize: '14px 14px',
      }}
    >
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        
        {sections.map((sec) => {
          const col = parseColorFromProps(sec.properties_json);
          const secColors = resolveSectionColors(col);
          const w = Math.max(40, sec.width);
          const h = Math.max(30, sec.height);
          const rx = Math.max(8, vbW * 0.01);
          const pillW = Math.min(w * 0.45, Math.max(48, vbW * 0.08));
          const pillH = Math.min(h * 0.25, Math.max(12, vbH * 0.032));
          return (
            <g key={sec.id}>
              <rect
                x={sec.pos_x}
                y={sec.pos_y}
                width={w}
                height={h}
                rx={rx}
                fill={secColors.bg}
                stroke={secColors.border}
                strokeWidth={strokeW * 1.2}
              />
              <rect
                x={sec.pos_x + Math.max(8, vbW * 0.008)}
                y={sec.pos_y + Math.max(8, vbH * 0.008)}
                width={pillW}
                height={pillH}
                rx={pillH / 2}
                fill={secColors.border}
                fillOpacity={0.85}
              />
            </g>
          );
        })}

        
        {conns.map((conn) => {
          const src = objMap.get(conn.source_object_id);
          const dst = objMap.get(conn.target_object_id);
          if (!src || !dst) return null;
          const x1 = src.pos_x + src.width / 2;
          const y1 = src.pos_y + src.height / 2;
          const x2 = dst.pos_x + dst.width / 2;
          const y2 = dst.pos_y + dst.height / 2;
          const cx = (x1 + x2) / 2;
          const connColor = resolveConnectionPreviewColor(conn.style_json);
          return (
            <path
              key={conn.id}
              d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={connColor}
              strokeWidth={strokeW * 1.25}
              strokeOpacity={0.85}
            />
          );
        })}

        
        {others.map((obj) => {
          const propColor = parseColorFromProps(obj.properties_json);
          const w = Math.max(40, obj.width);
          const h = Math.max(24, obj.height);
          const rx = Math.max(6, vbW * 0.008);

          if (obj.object_type === 'highlight') {
            const hlColor =
              (obj.target_id ? highlightColorMap[obj.target_id] : null) ||
              propColor ||
              'yellow';
            const barColor = `var(--annotation-${hlColor}, var(--annotation-yellow, #f5c542))`;
            const barW = Math.max(6, w * 0.03);
            return (
              <g key={obj.id}>
                <rect
                  x={obj.pos_x}
                  y={obj.pos_y}
                  width={w}
                  height={h}
                  rx={rx}
                  fill="var(--bg-white)"
                  stroke="var(--border-grid)"
                  strokeWidth={strokeW * 0.9}
                />
                <rect
                  x={obj.pos_x}
                  y={obj.pos_y}
                  width={barW}
                  height={h}
                  rx={rx * 0.5}
                  fill={barColor}
                />
              </g>
            );
          }

          if (obj.object_type === 'pdf' || obj.object_type === 'epub') {
            const badgeColor =
              obj.object_type === 'pdf' ? 'var(--danger-item)' : 'var(--active-item)';
            return (
              <g key={obj.id}>
                <rect
                  x={obj.pos_x}
                  y={obj.pos_y}
                  width={w}
                  height={h}
                  rx={rx}
                  fill="var(--bg-white)"
                  stroke="var(--border-grid)"
                  strokeWidth={strokeW * 0.9}
                />
                <rect
                  x={obj.pos_x + w * 0.08}
                  y={obj.pos_y + h * 0.08}
                  width={w * 0.28}
                  height={Math.max(10, h * 0.07)}
                  rx={4}
                  fill={badgeColor}
                  fillOpacity={0.85}
                />
              </g>
            );
          }

          const resolvedCardColor =
            propColor || (obj.target_id ? cardColorMap[obj.target_id] : null);
          const fill =
            obj.object_type === 'mindmap_node'
              ? resolveCardBgColor(propColor || 'blue')
              : obj.object_type === 'whiteboard_shortcut'
              ? resolveCardBgColor(propColor || 'purple')
              : resolveCardBgColor(resolvedCardColor);

          return (
            <rect
              key={obj.id}
              x={obj.pos_x}
              y={obj.pos_y}
              width={w}
              height={h}
              rx={rx}
              fill={fill}
              stroke="var(--border-grid)"
              strokeWidth={strokeW * 0.9}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function WhiteboardsView({
  whiteboards,
  activeWhiteboardId,
  pinnedIds: controlledPinnedIds,
  onTogglePin: controlledTogglePin,
  onSelectWhiteboard,
  onCreateWhiteboard,
  onRenameWhiteboard,
  onDeleteWhiteboard,
  onReloadWhiteboards,
  isSidebarCollapsed = false,
  onExpandSidebar,
}: WhiteboardsViewProps) {
  const { showConfirm } = useAppModal();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortAsc, setSortAsc] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [statsMap, setStatsMap] = useState<Record<string, WhiteboardStats>>({});

  const [internalPinnedIds, setInternalPinnedIds] = useState<string[]>(readStoredPinnedIds);
  const pinnedIds = controlledPinnedIds ?? internalPinnedIds;

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadWhiteboardStats = useCallback(async () => {
    try {
      const next = await heptaClient.whiteboards.getStatsMap();
      setStatsMap(next || {});
    } catch (err) {
      console.error('Failed to load whiteboard aggregate stats:', err);
    }
  }, []);

  useEffect(() => {
    loadWhiteboardStats();
  }, [whiteboards, loadWhiteboardStats]);

  useEffect(() => {
    const handleChanged = () => {
      void loadWhiteboardStats();
      void onReloadWhiteboards?.();
    };
    window.addEventListener('openhepta:whiteboards-changed', handleChanged);
    return () => window.removeEventListener('openhepta:whiteboards-changed', handleChanged);
  }, [loadWhiteboardStats, onReloadWhiteboards]);

  useEffect(() => {
    if (!openMenuId) return;
    const handleOutside = () => setOpenMenuId(null);
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [openMenuId]);

  const handleTogglePin = (wbId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (controlledTogglePin) {
      controlledTogglePin(wbId);
      return;
    }
    setInternalPinnedIds((prev) => {
      const next = prev.includes(wbId) ? prev.filter((id) => id !== wbId) : [wbId, ...prev];
      try {
        localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        
      }
      return next;
    });
  };

  const handleStartRename = (wb: Whiteboard, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenMenuId(null);
    setRenamingId(wb.id);
    setRenameDraft(wb.name);
  };

  const handleCommitRename = async (wbId: string) => {
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (!trimmed) return;
    await onRenameWhiteboard(wbId, trimmed);
  };

  const handleCopyLink = (wbId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenMenuId(null);
    navigator.clipboard?.writeText(`hepta://whiteboards/${wbId}`);
    setCopiedId(wbId);
    setTimeout(() => setCopiedId((curr) => (curr === wbId ? null : curr)), 1600);
  };

  const handleDuplicateWhiteboard = async (wb: Whiteboard, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenMenuId(null);
    try {
      await heptaClient.whiteboards.duplicate(wb.id);
      await onReloadWhiteboards?.();
      await loadWhiteboardStats();
    } catch (err) {
      console.error('Failed to duplicate whiteboard:', err);
    }
  };

  const handleConfirmDelete = async (wb: Whiteboard, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenMenuId(null);
    if (whiteboards.length <= 1) return;
    const ok = await showConfirm({
      title: 'Delete whiteboard',
      message:
        'The whiteboards and all their nested whiteboards will be put into trash. Cards inside the whiteboards will not be deleted.',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (ok) {
      await onDeleteWhiteboard(wb.id);
    }
  };

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = whiteboards.filter((wb) => !q || wb.name.toLowerCase().includes(q));

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortField === 'created') {
        cmp = a.created_at - b.created_at;
      } else {
        cmp = a.updated_at - b.updated_at;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [whiteboards, searchQuery, sortField, sortAsc]);

  const pinnedWhiteboards = useMemo(
    () => filteredAndSorted.filter((w) => pinnedIds.includes(w.id)),
    [filteredAndSorted, pinnedIds]
  );

  const renderGridCard = (wb: Whiteboard) => {
    const isPinned = pinnedIds.includes(wb.id);
    const isActive = wb.id === activeWhiteboardId;
    const stats = statsMap[wb.id];
    const isRenaming = renamingId === wb.id;

    return (
      <div
        key={wb.id}
        onClick={() => {
          if (!isRenaming) onSelectWhiteboard(wb.id);
        }}
        className={`group relative rounded-xl border bg-background-secondary shadow-card hover:shadow-float transition-all cursor-pointer flex flex-col ${
          openMenuId === wb.id ? 'z-30' : 'z-0'
        } ${
          isActive
            ? 'border-active-item ring-1 ring-active-item/40'
            : 'border-border-grid hover:border-active-item/60'
        }`}
      >
        
        <div className="h-[156px] w-full border-b border-light-grey relative">
          <div className="w-full h-full overflow-hidden rounded-t-xl">
            <WhiteboardMiniMap stats={stats} />
          </div>

          
          <div
            className={`absolute top-2 right-2 flex items-center gap-1 transition-opacity ${
              openMenuId === wb.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => handleTogglePin(wb.id, e)}
              className={`p-1.5 rounded-md bg-background-secondary/90 border border-light-grey shadow-sm transition cursor-pointer ${
                isPinned
                  ? 'text-active-item opacity-100'
                  : 'text-middle-hard-grey hover:text-text-color'
              }`}
              title={isPinned ? 'Unpin whiteboard' : 'Pin whiteboard'}
            >
              {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
            </button>

            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === wb.id ? null : wb.id);
                }}
                className="p-1.5 rounded-md bg-background-secondary/90 border border-light-grey shadow-sm text-middle-hard-grey hover:text-text-color transition cursor-pointer"
                title="More actions"
              >
                <MoreHorizontal size={12} />
              </button>

              {openMenuId === wb.id && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-8 w-44 p-1 rounded-lg bg-menu-bg border border-light-grey shadow-main z-50 text-[12px] space-y-0.5"
                >
                  <button
                    type="button"
                    onClick={(e) => handleTogglePin(wb.id, e)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-light-grey text-text-color text-left cursor-pointer"
                  >
                    {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                    <span>{isPinned ? 'Unpin' : 'Pin'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleStartRename(wb, e)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-light-grey text-text-color text-left cursor-pointer"
                  >
                    <Edit3 size={12} />
                    <span>Rename</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDuplicateWhiteboard(wb, e)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-light-grey text-text-color text-left cursor-pointer"
                  >
                    <Files size={12} />
                    <span>Duplicate</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleCopyLink(wb.id, e)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-light-grey text-text-color text-left cursor-pointer"
                  >
                    <Link2 size={12} />
                    <span>Copy link</span>
                  </button>
                  {whiteboards.length > 1 && (
                    <>
                      <div className="h-px bg-light-grey my-0.5" />
                      <button
                        type="button"
                        onClick={(e) => handleConfirmDelete(wb, e)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-danger-item/15 text-danger-item text-left cursor-pointer"
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {isPinned && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-background-secondary/90 border border-light-grey text-[10px] font-medium text-active-item flex items-center gap-1 shadow-sm">
              <Pin size={10} />
              <span>Pinned</span>
            </div>
          )}
        </div>

        
        <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            {isRenaming ? (
              <input
                type="text"
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => handleCommitRename(wb.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitRename(wb.id);
                  else if (e.key === 'Escape') setRenamingId(null);
                }}
                className="flex-1 bg-background-primary border border-active-item rounded px-2 py-0.5 text-[13.5px] font-semibold text-text-color outline-none"
              />
            ) : (
              <h3
                onDoubleClick={(e) => handleStartRename(wb, e)}
                className="text-[14px] font-semibold text-text-color group-hover:text-active-item transition truncate"
              >
                {wb.name}
              </h3>
            )}

            {copiedId === wb.id && (
              <span className="text-[10.5px] text-successful-item flex items-center gap-0.5 shrink-0">
                <Check size={11} /> Copied
              </span>
            )}
          </div>

          
          <div className="flex items-center justify-between text-[11px] text-middle-grey pt-1 border-t border-light-grey/70">
            <div className="flex items-center gap-2.5 tabular-nums">
              <span className="inline-flex items-center gap-1" title="Cards">
                <StickyNote size={11} />
                {stats?.cards ?? 0}
              </span>
              <span className="inline-flex items-center gap-1" title="Sections">
                <Layers size={11} />
                {stats?.sections ?? 0}
              </span>
              <span className="inline-flex items-center gap-1" title="Mindmaps">
                <Network size={11} />
                {stats?.mindmaps ?? 0}
              </span>
              <span className="inline-flex items-center gap-1" title="Connections">
                <GitBranch size={11} />
                {stats?.connections ?? 0}
              </span>
              {(stats?.media ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1" title="Media">
                  <ImageIcon size={11} />
                  {stats?.media}
                </span>
              )}
            </div>
            <span className="tabular-nums shrink-0">
              {new Date(wb.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-background-primary">
      
      <div
        className={`flex items-center min-h-[48px] py-2.5 pr-6 border-b border-light-grey bg-background-secondary/70 shrink-0 transition-[padding] duration-300 ${
          isSidebarCollapsed ? 'pl-2.5' : 'pl-6'
        }`}
      >
        <SidebarExpandButton visible={isSidebarCollapsed} onExpand={onExpandSidebar} />
        <div className="flex-1 min-w-0">
          <div className="w-full flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="shadow-float p-1 w-6 h-6 rounded-md bg-map text-background-secondary flex items-center justify-center">
              <LayoutGrid size={14} strokeWidth={2.2} />
            </div>
            <h1 className="text-[17px] font-semibold tracking-tight text-text-color">
              Whiteboards
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-ultra-light-grey border border-light-grey text-[11px] font-medium tabular-nums text-middle-grey">
              {whiteboards.length} whiteboard{whiteboards.length === 1 ? '' : 's'}
            </span>

            
            <div className="relative ml-1">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-middle-grey"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find a whiteboard..."
                className="w-56 h-8 pl-8 pr-7 rounded-md bg-background-primary border border-light-grey focus:border-active-item text-[12.5px] text-text-color placeholder:text-middle-grey outline-none transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-middle-grey hover:text-text-color cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            
            <div className="flex items-center rounded-md border border-light-grey bg-background-primary overflow-hidden">
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="h-8 pl-2.5 pr-1.5 bg-transparent text-[12px] text-middle-hard-grey outline-none cursor-pointer"
                title="Sort whiteboards"
              >
                <option value="updated">Updated time</option>
                <option value="created">Created time</option>
                <option value="name">Name A–Z</option>
              </select>
              <button
                type="button"
                onClick={() => setSortAsc((v) => !v)}
                className="h-8 px-2 border-l border-light-grey hover:bg-ultra-light-grey text-middle-hard-grey flex items-center gap-1 text-[11px] transition cursor-pointer"
                title={sortAsc ? 'Ascending' : 'Descending'}
              >
                <ArrowUpDown size={12} />
                <span>{sortAsc ? 'Asc' : 'Desc'}</span>
              </button>
            </div>

            
            <div className="flex items-center rounded-md border border-light-grey bg-background-primary p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-2 py-1 rounded text-[11.5px] flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-light-grey font-medium text-text-color'
                    : 'text-middle-grey hover:text-text-color'
                }`}
                title="Show as grid"
              >
                <LayoutGrid size={13} />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded text-[11.5px] flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-light-grey font-medium text-text-color'
                    : 'text-middle-grey hover:text-text-color'
                }`}
                title="Show as table"
              >
                <List size={13} />
                <span>Table</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onCreateWhiteboard}
              className="h-8 px-3 rounded-md bg-active-item text-white hover:brightness-105 text-[12.5px] font-medium flex items-center gap-1.5 transition cursor-pointer shadow-sm"
            >
              <Plus size={14} />
              <span>New whiteboard</span>
            </button>
          </div>
          </div>
        </div>
      </div>

      
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto space-y-8">
          {filteredAndSorted.length === 0 ? (
            <div className="py-20 text-center rounded-xl border border-dashed border-light-middle-grey bg-background-secondary/40 px-6">
              <LayoutGrid size={28} className="mx-auto text-middle-grey mb-2.5" />
              <p className="text-[14px] font-medium text-middle-hard-grey">
                No whiteboards found.
              </p>
              <p className="text-[12px] text-middle-grey mt-1">
                {searchQuery
                  ? `No whiteboards matched "${searchQuery}".`
                  : 'Create your first visual whiteboard to organize cards and connections.'}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="px-3 py-1.5 rounded-md border border-light-grey bg-background-secondary text-[12px] text-text-color hover:bg-light-grey transition cursor-pointer"
                  >
                    Clear search
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCreateWhiteboard}
                  className="px-3 py-1.5 rounded-md bg-active-item text-white text-[12px] font-medium hover:brightness-105 transition cursor-pointer"
                >
                  + New whiteboard
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <>
              
              {pinnedWhiteboards.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-middle-grey">
                    <Pin size={12} className="text-active-item" />
                    <span>Pinned ({pinnedWhiteboards.length})</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {pinnedWhiteboards.map((wb) => renderGridCard(wb))}
                  </div>
                </section>
              )}

              
              <section className="space-y-3">
                <div className="text-[11.5px] font-semibold uppercase tracking-wider text-middle-grey">
                  All Whiteboards ({filteredAndSorted.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredAndSorted.map((wb) => renderGridCard(wb))}
                </div>
              </section>
            </>
          ) : (
            
            <div className="rounded-xl border border-border-grid bg-background-secondary overflow-x-auto shadow-card">
              <table className="w-full text-left border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-light-grey bg-background-primary/60 text-[11px] font-semibold text-middle-grey uppercase tracking-wider">
                    <th className="px-4 py-2.5 min-w-[220px]">Whiteboard</th>
                    <th className="px-3 py-2.5 text-center">Cards</th>
                    <th className="px-3 py-2.5 text-center">Sections</th>
                    <th className="px-3 py-2.5 text-center">Mindmaps</th>
                    <th className="px-3 py-2.5 text-center">Connections</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Updated</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Created</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-grey">
                  {filteredAndSorted.map((wb) => {
                    const stats = statsMap[wb.id];
                    const isPinned = pinnedIds.includes(wb.id);
                    const isActive = wb.id === activeWhiteboardId;
                    const isRenaming = renamingId === wb.id;

                    return (
                      <tr
                        key={wb.id}
                        onClick={() => {
                          if (!isRenaming) onSelectWhiteboard(wb.id);
                        }}
                        className={`group hover:bg-ultra-light-grey cursor-pointer transition ${
                          isActive ? 'bg-middle-transparent-blue/30' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => handleTogglePin(wb.id, e)}
                              className={`p-1 rounded hover:bg-light-grey transition cursor-pointer ${
                                isPinned
                                  ? 'text-active-item'
                                  : 'text-middle-grey opacity-40 group-hover:opacity-100'
                              }`}
                              title={isPinned ? 'Unpin' : 'Pin'}
                            >
                              <Pin size={12} />
                            </button>
                            {isRenaming ? (
                              <input
                                type="text"
                                autoFocus
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => handleCommitRename(wb.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCommitRename(wb.id);
                                  else if (e.key === 'Escape') setRenamingId(null);
                                }}
                                className="bg-background-primary border border-active-item rounded px-2 py-0.5 text-[12.5px] font-medium text-text-color outline-none"
                              />
                            ) : (
                              <span className="font-medium text-text-color group-hover:text-active-item truncate">
                                {wb.name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-middle-hard-grey">
                          {stats?.cards ?? 0}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-middle-hard-grey">
                          {stats?.sections ?? 0}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-middle-hard-grey">
                          {stats?.mindmaps ?? 0}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-middle-hard-grey">
                          {stats?.connections ?? 0}
                        </td>
                        <td className="px-3 py-2.5 text-[11.5px] text-middle-grey tabular-nums whitespace-nowrap">
                          {new Date(wb.updated_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2.5 text-[11.5px] text-middle-grey tabular-nums whitespace-nowrap">
                          {new Date(wb.created_at).toLocaleDateString()}
                        </td>
                        <td
                          className="px-4 py-2.5 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleStartRename(wb, e)}
                              className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color cursor-pointer"
                              title="Rename"
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDuplicateWhiteboard(wb, e)}
                              className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color cursor-pointer"
                              title="Duplicate"
                            >
                              <Copy size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleCopyLink(wb.id, e)}
                              className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color cursor-pointer"
                              title="Copy link"
                            >
                              {copiedId === wb.id ? (
                                <Check size={12} className="text-successful-item" />
                              ) : (
                                <Link2 size={12} />
                              )}
                            </button>
                            {whiteboards.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => handleConfirmDelete(wb, e)}
                                className="p-1 rounded hover:bg-danger-item/15 text-middle-grey hover:text-danger-item cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
