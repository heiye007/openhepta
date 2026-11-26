import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Inbox,
  Calendar,
  LayoutGrid,
  BookOpen,
  Tag,
  Highlighter,
  MessageSquare,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  Settings,
  HelpCircle,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Home,
  Download,
  GalleryHorizontal,
  MoreHorizontal,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Link2,
  Check,
  Sparkles,
  Target,
  X,
  Command,
  Database,
  type LucideIcon,
} from 'lucide-react';
import type { Whiteboard } from '../../../../shared/types';
import { heptaClient } from '../../client';

export type SidebarView =
  | 'map'
  | 'whiteboard'
  | 'cards'
  | 'journal'
  | 'inbox'
  | 'tags'
  | 'highlights'
  | 'chat'
  | 'status';

export interface SidebarProps {
  currentView: SidebarView;
  setCurrentView: (view: SidebarView) => void;
  whiteboards: Whiteboard[];
  activeWhiteboardId: string;
  setActiveWhiteboardId: (id: string) => void;
  onCreateWhiteboard: () => void;
  onDeleteWhiteboard?: (id: string) => void;
  cardsCount: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  currentTheme: 'light' | 'dark';
  onToggleTheme: () => void;
  onRenameWhiteboard?: (id: string, name: string) => void;
  onOpenSearch?: () => void;
  onCreateCard?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  workspaceName?: string;
  workspaceBadge?: string;
  onOpenSettings?: () => void;
  onOpenImport?: () => void;
  onOpenGallery?: () => void;
  pinnedWhiteboardIds?: string[];
  onTogglePinWhiteboard?: (id: string) => void;
  onCreateSubWhiteboard?: (parentWhiteboardId: string) => void;
}

type WorkspaceMode = 'home' | 'tutor' | 'goals';

interface ContextMenuState {
  whiteboardId: string;
  x: number;
  y: number;
}

interface PopoverAnchor {
  top: number;
  left: number;
  width?: number;
}

const MIN_SIDEBAR_WIDTH = 256;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 256;
const WIDTH_STORAGE_KEY = 'openhepta-sidebar-width';
const PINNED_STORAGE_KEY = 'openhepta-pinned-whiteboards';

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_SIDEBAR_WIDTH;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.min(Math.max(parsed, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
    }
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

function readStoredPinnedIds(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setCurrentView,
  whiteboards,
  activeWhiteboardId,
  setActiveWhiteboardId,
  onCreateWhiteboard,
  onDeleteWhiteboard,
  cardsCount,
  searchQuery,
  setSearchQuery,
  currentTheme,
  onToggleTheme,
  onRenameWhiteboard,
  onOpenSearch,
  onCreateCard,
  isCollapsed: controlledCollapsed,
  onToggleCollapse,
  workspaceName: workspaceNameProp = 'OpenHepta',
  workspaceBadge = 'Local',
  onOpenSettings,
  onOpenImport,
  onOpenGallery,
  pinnedWhiteboardIds,
  onTogglePinWhiteboard,
  onCreateSubWhiteboard,
}) => {
  const [sidebarWidth, setSidebarWidth] = useState<number>(readStoredWidth);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isWhiteboardsExpanded, setIsWhiteboardsExpanded] = useState(true);
  const [isPinnedExpanded, setIsPinnedExpanded] = useState(true);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [localSearchInput, setLocalSearchInput] = useState(searchQuery);

  const workspaces = useMemo(
    () => (workspaceNameProp === 'OpenHepta' ? ['OpenHepta', 'Research Vault'] : [workspaceNameProp, 'OpenHepta']),
    [workspaceNameProp]
  );
  const [activeWorkspace, setActiveWorkspace] = useState<string>(workspaceNameProp);
  const [workspacePopover, setWorkspacePopover] = useState<PopoverAnchor | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('home');
  const [modePopover, setModePopover] = useState<PopoverAnchor | null>(null);

  const [internalPinnedIds, setInternalPinnedIds] = useState<string[]>(readStoredPinnedIds);
  const pinnedIds = pinnedWhiteboardIds ?? internalPinnedIds;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [optimisticNames, setOptimisticNames] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [copiedWbId, setCopiedWbId] = useState<string | null>(null);

  const [utilityModal, setUtilityModal] = useState<'help' | 'import' | 'gallery' | null>(null);
  const [localWhiteboardsOverride, setLocalWhiteboardsOverride] = useState<Whiteboard[] | null>(null);
  const [draggedWbId, setDraggedWbId] = useState<string | null>(null);
  const [dropTargetWbId, setDropTargetWbId] = useState<string | null>(null);
  const [isDropTargetRoot, setIsDropTargetRoot] = useState(false);

  const effectiveWhiteboards = localWhiteboardsOverride ?? whiteboards;

  const isDraggingRef = useRef(false);
  const workspaceTriggerRef = useRef<HTMLDivElement>(null);
  const modeTriggerRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isCollapsed = controlledCollapsed ?? internalCollapsed;

  const toggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  useEffect(() => {
    setActiveWorkspace(workspaceNameProp);
  }, [workspaceNameProp]);

  useEffect(() => {
    setLocalSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setLocalWhiteboardsOverride(null);
    setOptimisticNames((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const wb of whiteboards) {
        if (next[wb.id] && next[wb.id] === wb.name) {
          delete next[wb.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [whiteboards]);

  const refreshLocalWhiteboards = async () => {
    try {
      const latest = await heptaClient.whiteboards.list();
      if (latest && latest.length > 0) {
        setLocalWhiteboardsOverride(latest);
      }
    } catch {
      return;
    }
  };

  useEffect(() => {
    const handleWhiteboardsChanged = () => {
      void refreshLocalWhiteboards();
    };
    window.addEventListener('openhepta:whiteboards-changed', handleWhiteboardsChanged);
    return () => window.removeEventListener('openhepta:whiteboards-changed', handleWhiteboardsChanged);
  }, []);

  const handleMoveWhiteboardHierarchy = async (
    whiteboardId: string,
    targetParentWhiteboardId: string | null
  ) => {
    if (whiteboardId === targetParentWhiteboardId) return;
    try {
      const result = await heptaClient.whiteboards.moveHierarchy({
        whiteboardId,
        targetParentWhiteboardId,
      });
      if (result.status === 'moved') {
        if (targetParentWhiteboardId) {
          setFoldedSubWbIds((prev) => {
            const next = new Set(prev);
            next.delete(targetParentWhiteboardId);
            return next;
          });
        }
        await refreshLocalWhiteboards();
        window.dispatchEvent(new CustomEvent('openhepta:whiteboards-changed'));
      }
    } catch (err) {
      console.error('Failed to move whiteboard hierarchy:', err);
    }
  };

  useEffect(() => {
    if (pinnedWhiteboardIds !== undefined) return;
    try {
      localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(internalPinnedIds));
    } catch {
      return;
    }
  }, [internalPinnedIds, pinnedWhiteboardIds]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const clamped = Math.min(Math.max(e.clientX, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
      setSidebarWidth(clamped);
    };
    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      setSidebarWidth((current) => {
        try {
          localStorage.setItem(WIDTH_STORAGE_KEY, String(current));
        } catch {
          return current;
        }
        return current;
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const resetSidebarWidth = () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(DEFAULT_SIDEBAR_WIDTH));
    } catch {
      return;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleCollapse();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'o')) {
        e.preventDefault();
        if (onOpenSearch) {
          onOpenSearch();
        } else {
          setIsSearchOpen((prev) => !prev);
        }
        return;
      }
      if (e.key === 'Escape') {
        setContextMenu(null);
        setWorkspacePopover(null);
        setModePopover(null);
        setIsSearchOpen(false);
        setUtilityModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenSearch, onToggleCollapse]);

  useEffect(() => {
    if (!contextMenu && !workspacePopover && !modePopover) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-sidebar-popover="true"]')) return;
      setContextMenu(null);
      setWorkspacePopover(null);
      setModePopover(null);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [contextMenu, workspacePopover, modePopover]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const getWhiteboardDisplayName = (wb: Whiteboard) => optimisticNames[wb.id] ?? wb.name;

  const beginRename = (wb: Whiteboard) => {
    setContextMenu(null);
    setRenamingId(wb.id);
    setRenameDraft(getWhiteboardDisplayName(wb));
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const targetId = renamingId;
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (!trimmed) return;

    const targetWb = effectiveWhiteboards.find((w) => w.id === targetId);
    if (targetWb && trimmed === getWhiteboardDisplayName(targetWb)) return;

    setOptimisticNames((prev) => ({ ...prev, [targetId]: trimmed }));
    if (onRenameWhiteboard) {
      onRenameWhiteboard(targetId, trimmed);
    } else {
      try {
        await heptaClient.whiteboards.rename(targetId, trimmed);
      } catch (err) {
        console.error('Failed to rename whiteboard:', err);
      }
    }
    window.dispatchEvent(new CustomEvent('openhepta:whiteboards-changed'));
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft('');
  };

  const togglePinWhiteboard = (wbId: string) => {
    if (onTogglePinWhiteboard) {
      onTogglePinWhiteboard(wbId);
    } else {
      setInternalPinnedIds((prev) =>
        prev.includes(wbId) ? prev.filter((id) => id !== wbId) : [...prev, wbId]
      );
    }
    setContextMenu(null);
  };

  const handleCopyWhiteboardLink = async (wb: Whiteboard) => {
    const link = `hepta://whiteboard/${wb.id}`;
    try {
      await navigator.clipboard?.writeText(link);
    } catch {
      setContextMenu(null);
      return;
    }
    setCopiedWbId(wb.id);
    setTimeout(() => setCopiedWbId((cur) => (cur === wb.id ? null : cur)), 1500);
    setContextMenu(null);
  };

  const openWhiteboardContextMenu = (e: React.MouseEvent, wbId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 176;
    const menuHeight = 160;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
    setContextMenu({ whiteboardId: wbId, x: Math.max(8, x), y: Math.max(8, y) });
  };

  const handleOpenWorkspacePopover = () => {
    if (workspacePopover) {
      setWorkspacePopover(null);
      return;
    }
    const rect = workspaceTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setModePopover(null);
    setContextMenu(null);
    setWorkspacePopover({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(220, rect.width),
    });
  };

  const handleOpenModePopover = () => {
    if (modePopover) {
      setModePopover(null);
      return;
    }
    const rect = modeTriggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setWorkspacePopover(null);
    setContextMenu(null);
    setModePopover({
      top: rect.bottom + 4,
      left: rect.left,
    });
  };

  const handlePrimaryCompoundAction = () => {
    if (workspaceMode === 'tutor') {
      setCurrentView('chat');
      return;
    }
    if (workspaceMode === 'goals') {
      if (onCreateCard) {
        onCreateCard();
      } else {
        setCurrentView('cards');
      }
      return;
    }
    onCreateWhiteboard();
  };

  const triggerQuickSearch = () => {
    if (onOpenSearch) {
      onOpenSearch();
    } else {
      setIsSearchOpen(true);
    }
  };

  const navItems: Array<{
    key: SidebarView;
    label: string;
    gradient: string;
    Icon: LucideIcon;
    count?: number;
    onQuickAdd?: () => void;
    quickAddTitle?: string;
  }> = [
    { key: 'inbox', label: 'Inbox', gradient: 'bg-inbox', Icon: Inbox },
    { key: 'journal', label: 'Journal', gradient: 'bg-timeline', Icon: Calendar },
    {
      key: 'map',
      label: 'Whiteboard',
      gradient: 'bg-map',
      Icon: LayoutGrid,
      onQuickAdd: onCreateWhiteboard,
      quickAddTitle: 'New whiteboard',
    },
    {
      key: 'cards',
      label: 'Card Library',
      gradient: 'bg-card-library',
      Icon: BookOpen,
      onQuickAdd: onCreateCard,
      quickAddTitle: 'New card',
    },
    { key: 'tags', label: 'Tag Database', gradient: 'bg-tag', Icon: Tag },
    { key: 'highlights', label: 'Highlight', gradient: 'bg-highlight', Icon: Highlighter },
    { key: 'chat', label: 'Chat', gradient: 'bg-chat', Icon: MessageSquare },
  ];

  const pinnedWhiteboards = useMemo(
    () => effectiveWhiteboards.filter((wb) => pinnedIds.includes(wb.id)),
    [effectiveWhiteboards, pinnedIds]
  );

  const [foldedSubWbIds, setFoldedSubWbIds] = useState<Set<string>>(new Set());

  const toggleSubWbFold = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFoldedSubWbIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { rootWhiteboards, childrenMap } = useMemo(() => {
    const roots: Whiteboard[] = [];
    const children = new Map<string, Whiteboard[]>();
    const wbIds = new Set(effectiveWhiteboards.map((w) => w.id));
    for (const wb of effectiveWhiteboards) {
      if (wb.parent_whiteboard_id && wbIds.has(wb.parent_whiteboard_id)) {
        const list = children.get(wb.parent_whiteboard_id) ?? [];
        list.push(wb);
        children.set(wb.parent_whiteboard_id, list);
      } else {
        roots.push(wb);
      }
    }
    return { rootWhiteboards: roots, childrenMap: children };
  }, [effectiveWhiteboards]);

  const filteredSearchWhiteboards = useMemo(() => {
    const q = localSearchInput.trim().toLowerCase();
    if (!q) return effectiveWhiteboards;
    return effectiveWhiteboards.filter((wb) => getWhiteboardDisplayName(wb).toLowerCase().includes(q));
  }, [effectiveWhiteboards, localSearchInput, optimisticNames]);

  const workspaceInitial = activeWorkspace === 'OpenHepta' ? 'H' : activeWorkspace.charAt(0).toUpperCase() || 'H';

  const modeConfig: Record<
    WorkspaceMode,
    { label: string; cta: string; Icon: LucideIcon }
  > = {
    home: { label: 'Home', cta: 'New whiteboard', Icon: Home },
    tutor: { label: 'AI Tutor', cta: 'New session', Icon: Sparkles },
    goals: { label: 'Goals', cta: 'New card', Icon: Target },
  };
  const ActiveModeIcon = modeConfig[workspaceMode].Icon;

  const renderWhiteboardRow = (wb: Whiteboard, isPinnedSection = false, depth = 0): React.ReactNode => {
    const isActive = currentView === 'whiteboard' && activeWhiteboardId === wb.id;
    const isRenaming = renamingId === wb.id;
    const isPinned = pinnedIds.includes(wb.id);
    const displayName = getWhiteboardDisplayName(wb);
    const children = childrenMap.get(wb.id) ?? [];
    const hasChildren = !isPinnedSection && children.length > 0;
    const isFolded = foldedSubWbIds.has(wb.id);
    const isDropTarget = !isPinnedSection && dropTargetWbId === wb.id;

    return (
      <React.Fragment key={`${isPinnedSection ? 'pin-' : ''}${wb.id}`}>
        <div
          draggable={!isRenaming && !isPinnedSection}
          onDragStart={(e) => {
            if (isRenaming || isPinnedSection) return;
            e.stopPropagation();
            setDraggedWbId(wb.id);
            e.dataTransfer.setData('text/plain', wb.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            setDraggedWbId(null);
            setDropTargetWbId(null);
            setIsDropTargetRoot(false);
          }}
          onDragOver={(e) => {
            if (isPinnedSection || !draggedWbId || draggedWbId === wb.id) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            if (dropTargetWbId !== wb.id) {
              setDropTargetWbId(wb.id);
              setIsDropTargetRoot(false);
            }
          }}
          onDragLeave={() => {
            if (dropTargetWbId === wb.id) {
              setDropTargetWbId(null);
            }
          }}
          onDrop={(e) => {
            if (isPinnedSection) return;
            e.preventDefault();
            e.stopPropagation();
            const sourceId = draggedWbId || e.dataTransfer.getData('text/plain');
            setDraggedWbId(null);
            setDropTargetWbId(null);
            setIsDropTargetRoot(false);
            if (!sourceId || sourceId === wb.id) return;
            void handleMoveWhiteboardHierarchy(sourceId, wb.id);
          }}
          onClick={() => {
            if (isRenaming) return;
            setActiveWhiteboardId(wb.id);
            setCurrentView('whiteboard');
            window.dispatchEvent(
              new CustomEvent('openhepta:select-whiteboard', { detail: { whiteboardId: wb.id } })
            );
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            beginRename(wb);
          }}
          onContextMenu={(e) => openWhiteboardContextMenu(e, wb.id)}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          className={`group/wb relative flex h-7 cursor-pointer select-none items-center gap-1 rounded-md pr-1.5 transition ${
            isDropTarget
              ? 'bg-active-item/15 text-text-color ring-1 ring-active-item'
              : isActive
              ? 'bg-light-grey font-medium text-text-color'
              : 'text-middle-hard-grey hover:bg-ultra-light-grey hover:text-text-color'
          }`}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => toggleSubWbFold(wb.id, e)}
              className="p-0.5 -ml-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer shrink-0"
              title={isFolded ? '展开子白板' : '收起子白板'}
            >
              {isFolded ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
            </button>
          ) : depth > 0 ? (
            <div className="w-3 shrink-0" />
          ) : null}

          {isPinnedSection ? (
            <Pin size={11} className="shrink-0 text-active-item/80" />
          ) : (
            <LayoutGrid
              size={12}
              className={`shrink-0 ${isActive ? 'text-active-item' : 'text-middle-grey group-hover/wb:text-middle-hard-grey'}`}
            />
          )}

          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={commitRename}
              className="min-w-0 flex-1 rounded bg-background-primary px-1.5 py-0.5 text-[12.5px] leading-none text-text-color outline-none ring-1 ring-active-item"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-[12.5px] leading-none" title={displayName}>
              {displayName}
            </span>
          )}

          {!isRenaming && (
            <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover/wb:opacity-100">
              {onCreateSubWhiteboard && !isPinnedSection && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateSubWhiteboard(wb.id);
                  }}
                  className="rounded p-0.5 text-middle-grey hover:bg-light-grey hover:text-active-item transition cursor-pointer"
                  title="新建子白板"
                >
                  <Plus size={11} />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePinWhiteboard(wb.id);
                }}
                className={`rounded p-0.5 hover:bg-light-grey transition cursor-pointer ${
                  isPinned ? 'text-active-item' : 'text-middle-grey hover:text-text-color'
                }`}
                title={isPinned ? '取消固定' : '固定到顶部'}
              >
                {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  openWhiteboardContextMenu(
                    {
                      preventDefault: () => {},
                      stopPropagation: () => {},
                      clientX: rect.right,
                      clientY: rect.bottom + 2,
                    } as React.MouseEvent,
                    wb.id
                  );
                }}
                className="rounded p-0.5 text-middle-grey hover:bg-light-grey hover:text-text-color transition cursor-pointer"
                title="更多操作"
              >
                <MoreHorizontal size={13} />
              </button>
            </div>
          )}
        </div>
        {hasChildren && !isFolded && (
          <div className="space-y-[1px]">
            {children.map((child) => renderWhiteboardRow(child, false, depth + 1))}
          </div>
        )}
      </React.Fragment>
    );
  };

  const contextMenuWhiteboard = contextMenu
    ? effectiveWhiteboards.find((wb) => wb.id === contextMenu.whiteboardId) ?? null
    : null;

  const showFloatingExpandButton = isCollapsed && controlledCollapsed === undefined;

  return (
    <>
      {showFloatingExpandButton && (
        <button
          type="button"
          onClick={toggleCollapse}
          className="fixed left-2.5 top-2.5 z-40 flex h-7 w-7 items-center justify-center rounded-md border border-light-grey bg-background-secondary/90 text-middle-hard-grey shadow-float backdrop-blur hover:bg-light-grey hover:text-text-color transition cursor-pointer"
          title="展开侧边栏 (Ctrl+\)"
          aria-label="展开侧边栏"
        >
          <PanelLeftOpen size={15} />
        </button>
      )}

      <aside
        aria-hidden={isCollapsed}
        className={`relative h-full shrink-0 z-30 select-none overflow-hidden bg-background-secondary ${
          isCollapsed ? 'pointer-events-none' : ''
        }`}
        style={{
          width: isCollapsed ? '0px' : `${sidebarWidth}px`,
          transition: isResizing ? 'none' : 'width 0.25s cubic-bezier(0, 0.55, 0.45, 1)',
        }}
      >
        <div
          className="flex h-full flex-col border-r border-light-grey bg-background-secondary"
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="relative m-1 flex shrink-0 items-center gap-x-2 px-1 py-1.5">
            <div
              ref={workspaceTriggerRef}
              onClick={handleOpenWorkspacePopover}
              className="flex min-w-0 items-center gap-x-1.5 rounded-md py-1 pl-1.5 pr-1 cursor-pointer select-none hover:bg-light-grey transition"
              title="切换工作区"
            >
              <div className="relative flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md border border-border-palette bg-[#191919]">
                <span className="text-[11px] font-bold leading-none text-active-item">
                  {workspaceInitial}
                </span>
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-successful-item ring-2 ring-background-secondary" />
              </div>
              <div className="truncate text-[12px] font-medium leading-[1.35] text-middle-hard-grey">
                {activeWorkspace}
              </div>
              <ChevronDown size={14} className="shrink-0 text-middle-hard-grey" />
            </div>

            <div className="z-10 ml-auto flex shrink-0 items-center gap-x-1.5">
              <div className="flex shrink-0 items-center rounded-[3px] bg-ultra-light-grey px-[5px] py-0.5">
                <span
                  className="hepta-premium-text bg-clip-text text-[11px] font-medium leading-[1.3] text-transparent"
                  style={{
                    backgroundImage:
                      'linear-gradient(270deg, #FF5656 1.01%, #F49EFF 50.72%, #A993FF 100.43%)',
                  }}
                >
                  {workspaceBadge}
                </span>
              </div>
              <button
                type="button"
                onClick={toggleCollapse}
                className="shrink-0 rounded-md p-1 text-middle-hard-grey hover:bg-light-grey hover:text-text-color transition cursor-pointer"
                title="收起侧边栏 (Ctrl+\)"
                aria-label="收起侧边栏"
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
          </div>

          <div className="flex shrink-0 gap-x-2 px-2 pb-2 pt-0.5">
            <div className="box-border flex h-7 w-full grow items-center overflow-hidden rounded-md ring-1 ring-inset ring-light-grey transition">
              <button
                ref={modeTriggerRef}
                type="button"
                onClick={handleOpenModePopover}
                className="flex h-7 w-12 shrink-0 cursor-pointer select-none items-center justify-center gap-x-1 border-r border-solid border-light-grey pl-1 hover:bg-light-grey transition"
                title={`当前模式：${modeConfig[workspaceMode].label}`}
              >
                <ActiveModeIcon size={14} className="text-middle-hard-grey" />
                <ChevronDown size={10} className="text-middle-grey" />
              </button>
              <button
                type="button"
                onClick={handlePrimaryCompoundAction}
                className="flex h-7 min-w-0 grow cursor-pointer select-none items-center gap-x-1.5 px-[7px] text-left text-[12.5px] leading-none text-active-item hover:bg-light-grey transition"
              >
                <Plus size={14} className="shrink-0 text-active-item" />
                <span className="truncate">{modeConfig[workspaceMode].cta}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={triggerQuickSearch}
              className="box-border flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-solid border-light-grey hover:bg-light-grey transition cursor-pointer"
              title="全局快速搜索 (Ctrl+K / Ctrl+O)"
              aria-label="全局搜索"
            >
              <Search size={14} className="text-middle-hard-grey" />
            </button>
          </div>

          <nav className="shrink-0 px-2 flex flex-col gap-y-[1px]" aria-label="主导航">
            {navItems.map(({ key, label, gradient, Icon, count, onQuickAdd, quickAddTitle }) => {
              const isActive = currentView === key;
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setCurrentView(key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setCurrentView(key);
                    }
                  }}
                  className={`group/nav box-border flex h-8 w-full shrink-0 items-center rounded-md px-2 transition cursor-pointer ${
                    isActive
                      ? 'bg-light-grey font-medium text-text-color'
                      : 'text-middle-hard-grey hover:bg-light-grey hover:text-text-color'
                  }`}
                >
                  <div
                    className={`shadow-float mr-1.5 -ml-0.5 box-border flex h-5 w-5 shrink-0 items-center justify-center rounded-md p-[3px] text-background-secondary ${gradient}`}
                  >
                    <Icon size={14} strokeWidth={2} />
                  </div>
                  <span className="truncate text-[12.5px] leading-none">{label}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    {typeof count === 'number' && count > 0 && (
                      <span
                        className={`text-[11px] font-normal tabular-nums text-middle-grey ${
                          onQuickAdd ? 'group-hover/nav:hidden' : ''
                        }`}
                      >
                        {count}
                      </span>
                    )}
                    {onQuickAdd && (
                      <button
                        type="button"
                        aria-label={quickAddTitle || `Add ${label}`}
                        title={quickAddTitle}
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickAdd();
                        }}
                        className="hidden group-hover/nav:flex items-center justify-center rounded p-0.5 text-middle-hard-grey hover:bg-background-primary hover:text-active-item cursor-pointer"
                      >
                        <Plus size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="mx-2 my-1 h-px shrink-0 bg-light-grey" />

          <div className="relative grow overflow-y-auto overflow-x-hidden px-2 pb-1 pt-2">
            {pinnedWhiteboards.length > 0 && (
              <div className="mb-2">
                <div
                  className="flex h-6 cursor-pointer select-none items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wider text-middle-grey hover:text-text-color transition"
                  onClick={() => setIsPinnedExpanded((prev) => !prev)}
                >
                  {isPinnedExpanded ? (
                    <ChevronDown size={12} className="mr-1" />
                  ) : (
                    <ChevronRight size={12} className="mr-1" />
                  )}
                  <span>Pinned</span>
                </div>
                {isPinnedExpanded && (
                  <div className="mt-0.5 space-y-[1px]">
                    {pinnedWhiteboards.map((wb) => renderWhiteboardRow(wb, true, 0))}
                  </div>
                )}
              </div>
            )}

            <div
              onDragOver={(e) => {
                if (!draggedWbId) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                setIsDropTargetRoot(true);
                setDropTargetWbId(null);
              }}
              onDragLeave={() => setIsDropTargetRoot(false)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const sourceId = draggedWbId || e.dataTransfer.getData('text/plain');
                setDraggedWbId(null);
                setDropTargetWbId(null);
                setIsDropTargetRoot(false);
                if (!sourceId) return;
                void handleMoveWhiteboardHierarchy(sourceId, null);
              }}
              className={`group flex h-7 cursor-pointer select-none items-center rounded-md px-2 text-[11px] font-semibold uppercase tracking-wider transition ${
                isDropTargetRoot
                  ? 'bg-active-item/15 text-active-item ring-1 ring-active-item'
                  : 'text-middle-grey hover:text-text-color'
              }`}
              onClick={() => setIsWhiteboardsExpanded(!isWhiteboardsExpanded)}
            >
              {isWhiteboardsExpanded ? (
                <ChevronDown size={12} className="mr-1" />
              ) : (
                <ChevronRight size={12} className="mr-1" />
              )}
              <span>Whiteboards</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateWhiteboard();
                }}
                className="ml-auto rounded p-0.5 text-middle-grey opacity-0 transition group-hover:opacity-100 hover:bg-light-grey hover:text-active-item cursor-pointer"
                title="新建白板"
              >
                <Plus size={13} />
              </button>
            </div>

            {isWhiteboardsExpanded && (
              <div className="mt-0.5 space-y-[1px]">
                {rootWhiteboards.map((wb) => renderWhiteboardRow(wb, false, 0))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-light-grey px-2 pb-1.5 pt-[5px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => (onOpenSettings ? onOpenSettings() : setCurrentView('status'))}
                  className={`rounded-md p-1.5 transition cursor-pointer ${
                    currentView === 'status'
                      ? 'bg-light-grey text-text-color'
                      : 'text-middle-grey hover:bg-light-grey hover:text-text-color'
                  }`}
                  title="设置与存储状态"
                  aria-label="Settings"
                >
                  <Settings size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => (onOpenImport ? onOpenImport() : setUtilityModal('import'))}
                  className="rounded-md p-1.5 text-middle-grey hover:bg-light-grey hover:text-text-color transition cursor-pointer"
                  title="导入 (Markdown / Notion / Obsidian)"
                >
                  <Download size={15} />
                </button>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="rounded-md p-1.5 text-middle-grey hover:bg-light-grey hover:text-text-color transition cursor-pointer"
                  title={currentTheme === 'light' ? '切换为深色模式' : '切换为亮色模式'}
                >
                  {currentTheme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => setUtilityModal('help')}
                  className="rounded-md p-1.5 text-middle-grey hover:bg-light-grey hover:text-text-color transition cursor-pointer"
                  title="帮助与快捷键"
                >
                  <HelpCircle size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => (onOpenGallery ? onOpenGallery() : setUtilityModal('gallery'))}
                  className="rounded-md p-1.5 text-middle-grey hover:bg-light-grey hover:text-text-color transition cursor-pointer"
                  title="白板画廊与模板"
                >
                  <GalleryHorizontal size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {!isCollapsed && (
          <div
            onMouseDown={startResizing}
            onDoubleClick={resetSidebarWidth}
            className="group/resize absolute right-[-2.5px] top-0 bottom-0 z-20 flex w-[5px] cursor-col-resize items-stretch justify-center"
            title="拖动调整侧边栏宽度（双击恢复默认 256px）"
          >
            <div
              className={`h-full w-[2px] transition-colors duration-150 ${
                isResizing
                  ? 'bg-active-item'
                  : 'bg-transparent group-hover/resize:bg-active-item/55'
              }`}
            />
          </div>
        )}
      </aside>

      {workspacePopover && (
        <div
          data-sidebar-popover="true"
          className="fixed z-50 rounded-lg border border-light-grey bg-[var(--menu-bg)] p-1.5 shadow-main"
          style={{
            top: workspacePopover.top,
            left: workspacePopover.left,
            minWidth: workspacePopover.width,
          }}
        >
          <div className="px-2 py-1 text-[11px] font-medium text-middle-grey">
            Local Workspaces
          </div>
          {workspaces.map((ws) => {
            const selected = ws === activeWorkspace;
            return (
              <button
                key={ws}
                type="button"
                onClick={() => {
                  setActiveWorkspace(ws);
                  setWorkspacePopover(null);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-color hover:bg-light-grey transition cursor-pointer"
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border-palette bg-[#191919] text-[10px] font-bold text-active-item">
                  {ws === 'OpenHepta' ? 'H' : ws.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 truncate">{ws}</span>
                {selected && <Check size={13} className="text-active-item" />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-light-grey" />
          <button
            type="button"
            onClick={() => {
              setWorkspacePopover(null);
              setCurrentView('status');
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-middle-hard-grey hover:bg-light-grey hover:text-text-color transition cursor-pointer"
          >
            <Database size={13} />
            <span>SQLite 引擎与存储诊断</span>
          </button>
        </div>
      )}

      {modePopover && (
        <div
          data-sidebar-popover="true"
          className="fixed z-50 w-44 rounded-lg border border-light-grey bg-[var(--menu-bg)] p-1 shadow-main"
          style={{ top: modePopover.top, left: modePopover.left }}
        >
          {(Object.keys(modeConfig) as WorkspaceMode[]).map((modeKey) => {
            const ItemIcon = modeConfig[modeKey].Icon;
            const active = workspaceMode === modeKey;
            return (
              <button
                key={modeKey}
                type="button"
                onClick={() => {
                  setWorkspaceMode(modeKey);
                  setModePopover(null);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-color hover:bg-light-grey transition cursor-pointer"
              >
                <ItemIcon size={14} className="text-middle-hard-grey" />
                <span className="flex-1">{modeConfig[modeKey].label}</span>
                {active && <Check size={13} className="text-active-item" />}
              </button>
            );
          })}
        </div>
      )}

      {contextMenu && contextMenuWhiteboard && (
        <div
          data-sidebar-popover="true"
          className="fixed z-50 w-44 rounded-lg border border-light-grey bg-[var(--menu-bg)] p-1 shadow-main"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            type="button"
            onClick={() => togglePinWhiteboard(contextMenuWhiteboard.id)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-color hover:bg-light-grey transition cursor-pointer"
          >
            {pinnedIds.includes(contextMenuWhiteboard.id) ? (
              <>
                <PinOff size={13} className="text-middle-hard-grey" />
                <span>取消固定</span>
              </>
            ) : (
              <>
                <Pin size={13} className="text-middle-hard-grey" />
                <span>固定到顶部</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => beginRename(contextMenuWhiteboard)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-color hover:bg-light-grey transition cursor-pointer"
          >
            <Pencil size={13} className="text-middle-hard-grey" />
            <span>重命名</span>
          </button>
          <button
            type="button"
            onClick={() => handleCopyWhiteboardLink(contextMenuWhiteboard)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-color hover:bg-light-grey transition cursor-pointer"
          >
            <Link2 size={13} className="text-middle-hard-grey" />
            <span>{copiedWbId === contextMenuWhiteboard.id ? '已复制链接' : '复制内部链接'}</span>
          </button>
          {contextMenuWhiteboard.parent_whiteboard_id && (
            <button
              type="button"
              aria-label="Move whiteboard to root"
              onClick={() => {
                void handleMoveWhiteboardHierarchy(contextMenuWhiteboard.id, null);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-color hover:bg-light-grey transition cursor-pointer"
            >
              <LayoutGrid size={13} className="text-middle-hard-grey" />
              <span>移至顶层 (Move to root)</span>
            </button>
          )}
          {effectiveWhiteboards.length > 1 && onDeleteWhiteboard && (
            <>
              <div className="my-1 h-px bg-light-grey" />
              <button
                type="button"
                onClick={() => {
                  onDeleteWhiteboard(contextMenuWhiteboard.id);
                  if (pinnedWhiteboardIds === undefined) {
                    setInternalPinnedIds((prev) =>
                      prev.filter((id) => id !== contextMenuWhiteboard.id)
                    );
                  }
                  setContextMenu(null);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-danger-item hover:bg-light-grey transition cursor-pointer"
              >
                <Trash2 size={13} />
                <span>删除白板</span>
              </button>
            </>
          )}
        </div>
      )}

      {isSearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--scrim-color)] pt-20 backdrop-blur-[1px]"
          onClick={() => setIsSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-light-grey bg-background-secondary shadow-main"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-light-grey px-3.5 py-2.5">
              <Search size={15} className="shrink-0 text-middle-grey" />
              <input
                autoFocus
                value={localSearchInput}
                onChange={(e) => {
                  setLocalSearchInput(e.target.value);
                  setSearchQuery(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (filteredSearchWhiteboards.length > 0 && localSearchInput.trim()) {
                      setActiveWhiteboardId(filteredSearchWhiteboards[0].id);
                      setCurrentView('whiteboard');
                    } else {
                      setCurrentView('cards');
                    }
                    setIsSearchOpen(false);
                  }
                }}
                placeholder="搜索白板、卡片库或快捷跳转视图…"
                className="w-full bg-transparent text-[13px] text-text-color placeholder-middle-grey outline-none"
              />
              {localSearchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalSearchInput('');
                    setSearchQuery('');
                  }}
                  className="rounded p-0.5 text-middle-grey hover:bg-light-grey hover:text-text-color cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
              <kbd className="rounded border border-light-grey bg-ultra-light-grey px-1.5 py-0.5 text-[10px] text-middle-grey">
                ESC
              </kbd>
            </div>

            <div className="max-h-72 overflow-y-auto p-2 space-y-2">
              <div>
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-middle-grey">
                  Whiteboards ({filteredSearchWhiteboards.length})
                </div>
                {filteredSearchWhiteboards.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-middle-grey">未找到匹配白板，按回车在 Card Library 中检索</div>
                ) : (
                  filteredSearchWhiteboards.map((wb) => (
                    <button
                      key={wb.id}
                      type="button"
                      onClick={() => {
                        setActiveWhiteboardId(wb.id);
                        setCurrentView('whiteboard');
                        window.dispatchEvent(
                          new CustomEvent('openhepta:select-whiteboard', {
                            detail: { whiteboardId: wb.id },
                          })
                        );
                        setIsSearchOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-color hover:bg-light-grey transition cursor-pointer"
                    >
                      <LayoutGrid size={13} className="text-active-item shrink-0" />
                      <span className="truncate">{getWhiteboardDisplayName(wb)}</span>
                    </button>
                  ))
                )}
              </div>

              <div>
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-middle-grey">
                  Quick Actions
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('cards');
                    setIsSearchOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12.5px] text-text-color hover:bg-light-grey transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen size={13} className="text-middle-hard-grey" />
                    <span>在 Card Library 中搜索“{localSearchInput || '全部卡片'}”</span>
                  </span>
                  <span className="text-[11px] text-middle-grey">{cardsCount} 张</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCreateWhiteboard();
                    setIsSearchOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-active-item hover:bg-light-grey transition cursor-pointer"
                >
                  <Plus size={13} />
                  <span>新建思维白板</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-light-grey bg-ultra-light-grey px-3.5 py-1.5 text-[11px] text-middle-grey">
              <span className="flex items-center gap-1">
                <Command size={11} />
                <span>Ctrl+K / Ctrl+O 呼出</span>
              </span>
              <span>Enter 跳转 · Esc 关闭</span>
            </div>
          </div>
        </div>
      )}

      {utilityModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim-color)] backdrop-blur-[1px]"
          onClick={() => setUtilityModal(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-light-grey bg-background-secondary p-4 shadow-main"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-color">
                {utilityModal === 'help' && 'OpenHepta 快捷键指南'}
                {utilityModal === 'import' && '外部知识库导入'}
                {utilityModal === 'gallery' && '白板画廊与模板'}
              </h3>
              <button
                type="button"
                onClick={() => setUtilityModal(null)}
                className="rounded p-1 text-middle-grey hover:bg-light-grey hover:text-text-color cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            {utilityModal === 'help' && (
              <div className="space-y-2 text-xs text-middle-hard-grey">
                <div className="flex justify-between">
                  <span>收起 / 展开侧边栏</span>
                  <kbd className="rounded border border-light-grey px-1.5 py-0.5 text-[11px]">Ctrl + \</kbd>
                </div>
                <div className="flex justify-between">
                  <span>全局快速搜索</span>
                  <kbd className="rounded border border-light-grey px-1.5 py-0.5 text-[11px]">Ctrl + K</kbd>
                </div>
                <div className="flex justify-between">
                  <span>平移画布</span>
                  <kbd className="rounded border border-light-grey px-1.5 py-0.5 text-[11px]">Space + 拖拽</kbd>
                </div>
                <div className="flex justify-between">
                  <span>重命名白板</span>
                  <kbd className="rounded border border-light-grey px-1.5 py-0.5 text-[11px]">双击白板项</kbd>
                </div>
              </div>
            )}
            {utilityModal === 'import' && (
              <p className="text-xs leading-relaxed text-middle-hard-grey">
                支持导入 Markdown 文件夹、Notion 导出包与 Obsidian Vault 至本地 SQLite 引擎（可在 `onOpenImport` 接入文件选择器后启用）。
              </p>
            )}
            {utilityModal === 'gallery' && (
              <p className="text-xs leading-relaxed text-middle-hard-grey">
                精选视觉知识画布模板（文献综述、系统架构图、Zettelkasten 卡片盒）将在后续接入模板引擎后展示。
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};
