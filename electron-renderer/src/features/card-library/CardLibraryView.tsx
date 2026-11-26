import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  LayoutGrid,
  List,
  Table2,
  Trash2,
  Maximize2,
  PanelRightOpen,
  X,
  ArrowUpDown,
  Hash,
  Layers,
  Check,
  Palette,
  Tag as TagIcon,
  FileText,
  Calendar,
  Highlighter,
  Inbox,
  GripVertical,
  FileUp,
  BookMarked,
} from 'lucide-react';
import { Card, DocumentRecord, Whiteboard } from '@shared/types';
import { HEPTA_CARD_PALETTE, resolveCardBgColor } from '@shared/palette';
import { heptaClient } from '../../client';
import { useAppModal } from '../../primitives/AppModal';
import { SidebarExpandButton } from '../../primitives/SidebarExpandButton';

interface TagInfo {
  id: string;
  name: string;
  color: string | null;
}

interface WhiteboardInfo {
  id: string;
  name: string;
}

export interface CardLibraryViewProps {
  cards: Card[];
  whiteboards?: Whiteboard[];
  onOpenCardInSidePanel: (cardId: string) => void;
  onOpenFullCard: (cardId: string) => void;
  onAddCardToWhiteboard: (cardId: string, whiteboardId?: string) => void;
  onCreateCard: (title: string, contentText: string, color?: string) => Promise<void>;
  onDeleteCard: (cardId: string) => void;
  onUpdateColor?: (cardId: string, color: string) => Promise<void> | void;
  onRefreshCards?: () => Promise<void> | void;
  onOpenDocument?: (documentId: string) => void;
  onAddDocumentToWhiteboard?: (doc: DocumentRecord) => void;
  refreshKey?: number;
  isSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
}

type SortField = 'updated' | 'created' | 'title' | 'manual';
type ViewMode = 'grid' | 'table' | 'list';
type TypeFilter = 'all' | 'notes' | 'journal' | 'highlights' | 'unorganized' | 'documents';

const MANUAL_ORDER_KEY = 'openhepta_card_library_manual_order';

function readManualOrder(): string[] {
  try {
    const raw = localStorage.getItem(MANUAL_ORDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function hasHighlightContent(card: Card): boolean {
  if (!card.content_json || !card.content_json.includes('"type":"doc"')) return false;
  return (
    card.content_json.includes('"type":"highlight"') ||
    card.content_json.includes('"type":"blockquote"') ||
    card.content_json.includes('"type":"callout"')
  );
}

export function CardLibraryView({
  cards,
  whiteboards = [],
  onOpenCardInSidePanel,
  onOpenFullCard,
  onAddCardToWhiteboard,
  onCreateCard,
  onDeleteCard,
  onUpdateColor,
  onRefreshCards,
  onOpenDocument,
  onAddDocumentToWhiteboard,
  refreshKey = 0,
  isSidebarCollapsed = false,
  onExpandSidebar,
}: CardLibraryViewProps) {
  const { showConfirm, showAlert } = useAppModal();
  const [filterText, setFilterText] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [selectedTagId, setSelectedTagId] = useState<string>('all');
  const [selectedWbId, setSelectedWbId] = useState<string>('all');
  const [selectedColor, setSelectedColor] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortAsc, setSortAsc] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newColor, setNewColor] = useState<string>('white');

  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchWbOpen, setBatchWbOpen] = useState(false);
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  const [batchColorOpen, setBatchColorOpen] = useState(false);
  const [batchNewTagName, setBatchNewTagName] = useState('');

  
  const [manualOrder, setManualOrder] = useState<string[]>(readManualOrder);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);

  
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const [cardTagsMap, setCardTagsMap] = useState<Record<string, TagInfo[]>>({});
  const [cardWbsMap, setCardWbsMap] = useState<Record<string, WhiteboardInfo[]>>({});
  const [backlinkCountMap, setBacklinkCountMap] = useState<Record<string, number>>({});
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isImportingDocs, setIsImportingDocs] = useState(false);
  const [brokenCoverIds, setBrokenCoverIds] = useState<Set<string>>(() => new Set());

  const loadDocuments = useCallback(async () => {
    try {
      const rows = await heptaClient.documents.list();
      setDocuments(rows || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, []);

  const loadMetadataMappings = useCallback(async () => {
    try {
      const [tagRows, ctRows, woRows, refRows] = await Promise.all([
        heptaClient.tags.listWithCounts(),
        heptaClient.cards.listAllCardTags(),
        heptaClient.cards.listAllCardWhiteboards(),
        heptaClient.cards.listBacklinkCounts(),
      ]);

      setAllTags((tagRows || []).map((t) => ({ id: t.id, name: t.name, color: t.color ?? null })));

      const tMap: Record<string, TagInfo[]> = {};
      for (const row of ctRows || []) {
        if (!tMap[row.card_id]) tMap[row.card_id] = [];
        tMap[row.card_id].push({ id: row.tag_id, name: row.name, color: row.color });
      }
      setCardTagsMap(tMap);

      const wMap: Record<string, WhiteboardInfo[]> = {};
      for (const row of woRows || []) {
        if (!wMap[row.target_id]) wMap[row.target_id] = [];
        wMap[row.target_id].push({ id: row.whiteboard_id, name: row.name });
      }
      setCardWbsMap(wMap);

      const bMap: Record<string, number> = {};
      for (const row of refRows || []) {
        bMap[row.target_card_id] = row.cnt;
      }
      setBacklinkCountMap(bMap);
    } catch (err) {
      console.error('Failed to load card library metadata:', err);
    }
  }, []);

  useEffect(() => {
    loadMetadataMappings();
    loadDocuments();
  }, [cards, refreshKey, loadMetadataMappings, loadDocuments]);

  const handleImportDocuments = async () => {
    try {
      setIsImportingDocs(true);
      const picked = await heptaClient.localFile.pickDocuments();
      if (!picked || picked.length === 0) return;

      let firstImportedId: string | null = null;
      for (const file of picked) {
        const added = await heptaClient.localFile.add({
          path: file.path,
          name: file.name,
        });
        const cleanTitle = file.name.replace(/\.(pdf|epub)$/i, '') || file.name;
        const createdDoc = await heptaClient.documents.create({
          docType: file.docType,
          title: cleanTitle,
          fileReferenceId: added.referenceId,
        });
        if (!firstImportedId) firstImportedId = createdDoc.id;
      }

      await loadDocuments();
      setTypeFilter('documents');
      if (firstImportedId && onOpenDocument) {
        onOpenDocument(firstImportedId);
      }
    } catch (err) {
      console.error('Failed to import PDF/EPUB:', err);
      await showAlert({
        title: 'Import failed',
        message: 'Could not import the selected PDF or EPUB file.',
        variant: 'danger',
      });
    } finally {
      setIsImportingDocs(false);
    }
  };

  const handleDeleteDocument = async (doc: DocumentRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await showConfirm({
      title: 'Delete document',
      message: `Remove "${doc.title}" from Documents? Existing highlights will remain archived.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    await heptaClient.documents.delete(doc.id);
    await loadDocuments();
  };

  const filteredDocuments = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return documents.filter((d) => !q || d.title.toLowerCase().includes(q));
  }, [documents, filterText]);

  useEffect(() => {
    try {
      localStorage.setItem(MANUAL_ORDER_KEY, JSON.stringify(manualOrder));
    } catch {
      
    }
  }, [manualOrder]);

  
  useEffect(() => {
    const idSet = new Set(cards.map((c) => c.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => idSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [cards]);

  const filteredCards = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    let list = cards.filter((c) => {
      
      if (typeFilter === 'journal' && !c.id.startsWith('journal-')) return false;
      if (typeFilter === 'notes' && c.id.startsWith('journal-')) return false;
      if (typeFilter === 'highlights' && !hasHighlightContent(c)) return false;
      if (typeFilter === 'unorganized' && (cardWbsMap[c.id]?.length || 0) > 0) return false;

      
      if (selectedColor !== 'all' && (c.color || 'white') !== selectedColor) return false;

      
      if (selectedTagId !== 'all') {
        const cTags = cardTagsMap[c.id] || [];
        if (!cTags.some((t) => t.id === selectedTagId)) return false;
      }

      
      if (selectedWbId !== 'all') {
        const cWbs = cardWbsMap[c.id] || [];
        if (!cWbs.some((w) => w.id === selectedWbId)) return false;
      }

      
      if (!q) return true;
      const tagMatch = (cardTagsMap[c.id] || []).some((t) =>
        t.name.toLowerCase().includes(q)
      );
      return (
        (c.title || '').toLowerCase().includes(q) ||
        (c.content_text || '').toLowerCase().includes(q) ||
        tagMatch
      );
    });

    const manualIndexMap = new Map<string, number>();
    manualOrder.forEach((id, idx) => manualIndexMap.set(id, idx));

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'title') {
        cmp = (a.title || 'Untitled').localeCompare(b.title || 'Untitled');
      } else if (sortField === 'created') {
        cmp = a.created_at - b.created_at;
      } else if (sortField === 'manual') {
        const ia = manualIndexMap.has(a.id) ? manualIndexMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const ib = manualIndexMap.has(b.id) ? manualIndexMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
        cmp = ia !== ib ? ia - ib : b.updated_at - a.updated_at;
        return sortAsc ? -cmp : cmp;
      } else {
        cmp = a.updated_at - b.updated_at;
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [
    cards,
    filterText,
    typeFilter,
    selectedColor,
    selectedTagId,
    selectedWbId,
    sortField,
    sortAsc,
    cardTagsMap,
    cardWbsMap,
    manualOrder,
  ]);

  const toggleCardSelected = (cardId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredCards.length && filteredCards.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCards.map((c) => c.id));
    }
  };

  const handleBatchAddToWhiteboard = async (wbId: string) => {
    for (const id of selectedIds) {
      await onAddCardToWhiteboard(id, wbId);
    }
    setBatchWbOpen(false);
    setSelectedIds([]);
    loadMetadataMappings();
  };

  const handleBatchApplyTag = async (tagId: string) => {
    for (const cardId of selectedIds) {
      await heptaClient.tags.assignToCard(cardId, tagId);
    }
    setBatchTagOpen(false);
    await loadMetadataMappings();
  };

  const handleBatchCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = batchNewTagName.trim().replace(/^#/, '');
    if (!trimmed) return;
    const existing = allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    const created = existing ? existing : await heptaClient.tags.create(trimmed, '#207dff');
    setBatchNewTagName('');
    await handleBatchApplyTag(created.id);
  };

  const handleBatchColor = async (colorId: string) => {
    if (onUpdateColor) {
      for (const id of selectedIds) {
        await onUpdateColor(id, colorId);
      }
    } else {
      for (const id of selectedIds) {
        await heptaClient.cards.updateColor(id, colorId);
      }
      await onRefreshCards?.();
    }
    setBatchColorOpen(false);
  };

  const handleBatchDelete = async () => {
    const ok = await showConfirm({
      title: 'Delete selected cards',
      message: `Delete ${selectedIds.length} selected card${selectedIds.length > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    for (const id of [...selectedIds]) {
      await onDeleteCard(id);
    }
    setSelectedIds([]);
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim() || 'Untitled';
    await onCreateCard(title, newBody.trim(), newColor === 'white' ? undefined : newColor);
    setNewTitle('');
    setNewBody('');
    setNewColor('white');
    setShowComposer(false);
  };

  const handleDropManualReorder = (targetId: string) => {
    if (!draggingCardId || draggingCardId === targetId) return;
    const currentOrder = filteredCards.map((c) => c.id);
    const fromIdx = currentOrder.indexOf(draggingCardId);
    const toIdx = currentOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...currentOrder];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setManualOrder(next);
    setSortField('manual');
    setSortAsc(false);
    setDraggingCardId(null);
  };

  const hasActiveFilters =
    typeFilter !== 'all' ||
    selectedTagId !== 'all' ||
    selectedWbId !== 'all' ||
    selectedColor !== 'all' ||
    filterText.trim() !== '';

  return (
    <div className="relative flex-1 h-full flex flex-col overflow-hidden bg-background-primary">
      
      <div
        className={`pt-2.5 pb-3 pr-6 border-b border-light-grey bg-background-secondary/70 shrink-0 space-y-3 transition-[padding] duration-300 ${
          isSidebarCollapsed ? 'pl-2.5' : 'pl-6'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          <div className="flex items-center gap-2.5 flex-wrap">
            <SidebarExpandButton visible={isSidebarCollapsed} onExpand={onExpandSidebar} />
            <div className="flex items-center gap-2 mr-1">
              <div className="shadow-float p-1 w-6 h-6 rounded-md bg-card-library text-background-secondary flex items-center justify-center">
                <BookOpen size={14} strokeWidth={2.2} />
              </div>
              <h1 className="text-[17px] font-semibold tracking-tight text-text-color">
                Card Library
              </h1>
            </div>

            
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-middle-grey"
              />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Find a card..."
                className="w-60 h-8 pl-8 pr-7 rounded-md bg-background-primary border border-light-grey focus:border-active-item text-[12.5px] text-text-color placeholder:text-middle-grey outline-none transition"
              />
              {filterText && (
                <button
                  type="button"
                  onClick={() => setFilterText('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-middle-grey hover:text-text-color cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowComposer((prev) => !prev)}
              className="h-8 px-2.5 rounded-md bg-background-primary border border-light-grey hover:border-active-item text-text-color hover:text-active-item text-[12.5px] font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus size={14} />
              <span>Card</span>
            </button>

            <button
              type="button"
              onClick={handleImportDocuments}
              disabled={isImportingDocs}
              className="h-8 px-2.5 rounded-md bg-background-primary border border-light-grey hover:border-active-item text-text-color hover:text-active-item disabled:opacity-50 text-[12.5px] font-medium flex items-center gap-1.5 transition cursor-pointer"
              title="Import PDF or EPUB files"
            >
              <FileUp size={14} />
              <span>{isImportingDocs ? 'Importing...' : 'Import PDF / EPUB'}</span>
            </button>
          </div>

          
          <div className="flex items-center gap-2">
            
            <div className="flex items-center rounded-md border border-light-grey bg-background-primary overflow-hidden">
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="h-8 pl-2.5 pr-1.5 bg-transparent text-[12px] text-middle-hard-grey outline-none cursor-pointer"
                title="Sort by"
              >
                <option value="updated">Updated time</option>
                <option value="created">Created time</option>
                <option value="title">Title</option>
                <option value="manual">Manual</option>
              </select>
              <button
                type="button"
                onClick={() => setSortAsc((prev) => !prev)}
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
                title="Grid view"
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
                title="Table view"
              >
                <Table2 size={13} />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2 py-1 rounded text-[11.5px] flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-light-grey font-medium text-text-color'
                    : 'text-middle-grey hover:text-text-color'
                }`}
                title="List view"
              >
                <List size={13} />
                <span>List</span>
              </button>
            </div>
          </div>
        </div>

        
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          
          <div className="flex items-center rounded-md border border-light-grey bg-background-primary p-0.5">
            {(
              [
                { id: 'all', label: 'All', Icon: BookOpen },
                { id: 'notes', label: 'Notes', Icon: FileText },
                { id: 'journal', label: 'Journal', Icon: Calendar },
                { id: 'highlights', label: 'Highlights', Icon: Highlighter },
                { id: 'unorganized', label: 'Unorganized', Icon: Inbox },
                { id: 'documents', label: `Documents (${documents.length})`, Icon: BookMarked },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTypeFilter(id)}
                className={`px-2 py-1 rounded flex items-center gap-1 transition cursor-pointer ${
                  typeFilter === id
                    ? 'bg-light-grey font-medium text-text-color'
                    : 'text-middle-grey hover:text-text-color'
                }`}
              >
                <Icon size={11} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          
          <div className="flex items-center gap-1 h-7 px-2 rounded-md border border-light-grey bg-background-primary">
            <Hash size={11} className="text-middle-grey" />
            <select
              value={selectedTagId}
              onChange={(e) => setSelectedTagId(e.target.value)}
              className="bg-transparent text-[11.5px] text-middle-hard-grey outline-none cursor-pointer max-w-[120px]"
            >
              <option value="all">All tags</option>
              {allTags.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.name}
                </option>
              ))}
            </select>
          </div>

          
          <div className="flex items-center gap-1 h-7 px-2 rounded-md border border-light-grey bg-background-primary">
            <Layers size={11} className="text-middle-grey" />
            <select
              value={selectedWbId}
              onChange={(e) => setSelectedWbId(e.target.value)}
              className="bg-transparent text-[11.5px] text-middle-hard-grey outline-none cursor-pointer max-w-[150px]"
            >
              <option value="all">All whiteboards</option>
              {whiteboards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          
          <div className="flex items-center gap-1 pl-1">
            <button
              type="button"
              onClick={() => setSelectedColor('all')}
              className={`px-2 py-0.5 rounded-full text-[11px] border transition cursor-pointer ${
                selectedColor === 'all'
                  ? 'bg-text-color text-background-secondary border-text-color font-medium'
                  : 'bg-background-primary text-middle-hard-grey border-light-grey hover:border-middle-grey'
              }`}
            >
              All colors
            </button>
            {HEPTA_CARD_PALETTE.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedColor(selectedColor === c.id ? 'all' : c.id)}
                className={`w-4 h-4 rounded-full border transition cursor-pointer ${
                  selectedColor === c.id
                    ? 'ring-2 ring-active-item ring-offset-1 ring-offset-background-secondary border-active-item scale-110'
                    : 'border-border-grid hover:scale-110'
                }`}
                style={{ backgroundColor: c.cssVar }}
                title={c.label}
              />
            ))}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setFilterText('');
                setTypeFilter('all');
                setSelectedTagId('all');
                setSelectedWbId('all');
                setSelectedColor('all');
              }}
              className="ml-auto text-[11px] text-active-item hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      
      {selectedIds.length > 0 && (
        <div className="px-6 pt-2.5 shrink-0 z-30">
          <div className="h-9 rounded-lg bg-menu-texture-bg-medium backdrop-blur-2xl border border-light-grey px-2 flex items-center text-[12.5px] text-text-color shadow-main">
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="p-1 rounded hover:bg-light-grey text-middle-hard-grey transition cursor-pointer"
              title="Clear selection"
            >
              <X size={14} />
            </button>
            <div className="mx-2 h-4 w-px bg-light-grey" />
            <span className="font-medium tabular-nums">
              {selectedIds.length} Card{selectedIds.length > 1 ? 's' : ''} Selected
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="ml-2.5 text-[11px] text-active-item hover:underline cursor-pointer"
            >
              {selectedIds.length === filteredCards.length ? 'Deselect all' : 'Select all'}
            </button>

            <div className="ml-auto flex items-center gap-1 relative">
              <button
                type="button"
                onClick={() => {
                  for (const id of [...selectedIds].reverse()) {
                    onOpenCardInSidePanel(id);
                  }
                }}
                className="px-2 py-1 rounded hover:bg-light-grey text-[12px] text-middle-hard-grey hover:text-text-color flex items-center gap-1 transition cursor-pointer"
              >
                <PanelRightOpen size={13} />
                <span>Side panel</span>
              </button>

              
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setBatchWbOpen((v) => !v);
                    setBatchTagOpen(false);
                    setBatchColorOpen(false);
                  }}
                  className="px-2 py-1 rounded hover:bg-light-grey text-[12px] text-middle-hard-grey hover:text-text-color flex items-center gap-1 transition cursor-pointer"
                >
                  <Layers size={13} />
                  <span>Add to whiteboard</span>
                </button>
                {batchWbOpen && (
                  <div className="absolute right-0 top-8 w-52 p-1 rounded-lg bg-menu-bg border border-light-grey shadow-main z-50 max-h-56 overflow-y-auto">
                    {whiteboards.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => handleBatchAddToWhiteboard(w.id)}
                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-light-grey text-[12px] text-text-color truncate cursor-pointer"
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setBatchTagOpen((v) => !v);
                    setBatchWbOpen(false);
                    setBatchColorOpen(false);
                  }}
                  className="px-2 py-1 rounded hover:bg-light-grey text-[12px] text-middle-hard-grey hover:text-text-color flex items-center gap-1 transition cursor-pointer"
                >
                  <TagIcon size={13} />
                  <span>Add tag</span>
                </button>
                {batchTagOpen && (
                  <div className="absolute right-0 top-8 w-52 p-2 rounded-lg bg-menu-bg border border-light-grey shadow-main z-50 space-y-1.5">
                    <form onSubmit={handleBatchCreateTag}>
                      <input
                        type="text"
                        autoFocus
                        value={batchNewTagName}
                        onChange={(e) => setBatchNewTagName(e.target.value)}
                        placeholder="New tag + Enter..."
                        className="w-full px-2 py-1 rounded bg-background-secondary border border-light-grey text-[12px] text-text-color outline-none focus:border-active-item"
                      />
                    </form>
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {allTags.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleBatchApplyTag(t.id)}
                          className="w-full text-left px-2 py-1 rounded hover:bg-light-grey text-[12px] text-text-color truncate cursor-pointer"
                        >
                          #{t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setBatchColorOpen((v) => !v);
                    setBatchWbOpen(false);
                    setBatchTagOpen(false);
                  }}
                  className="px-2 py-1 rounded hover:bg-light-grey text-[12px] text-middle-hard-grey hover:text-text-color flex items-center gap-1 transition cursor-pointer"
                >
                  <Palette size={13} />
                  <span>Color</span>
                </button>
                {batchColorOpen && (
                  <div className="absolute right-0 top-8 p-2 rounded-lg bg-menu-bg border border-light-grey shadow-main z-50 flex items-center gap-1.5">
                    {HEPTA_CARD_PALETTE.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleBatchColor(c.id)}
                        className="w-5 h-5 rounded-full border border-border-grid hover:scale-110 transition cursor-pointer"
                        style={{ backgroundColor: c.cssVar }}
                        title={c.label}
                      />
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleBatchDelete}
                className="px-2 py-1 rounded hover:bg-danger-item/15 text-[12px] text-danger-item flex items-center gap-1 transition cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      
      <div
        className="flex-1 overflow-y-auto px-6 py-4"
        onClick={() => {
          setBatchWbOpen(false);
          setBatchTagOpen(false);
          setBatchColorOpen(false);
        }}
      >
        
        {showComposer && (
          <form
            onSubmit={handleSubmitCreate}
            className="mb-5 p-4 rounded-lg bg-background-secondary border border-border-grid shadow-card space-y-3 max-w-3xl"
          >
            <div className="flex items-center justify-between gap-3">
              <input
                type="text"
                autoFocus
                placeholder="Untitled"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="flex-1 bg-transparent text-[15px] font-semibold text-text-color placeholder:text-middle-grey outline-none"
              />
              <div className="flex items-center gap-1">
                {HEPTA_CARD_PALETTE.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setNewColor(c.id)}
                    className={`w-4 h-4 rounded-full border cursor-pointer transition ${
                      newColor === c.id
                        ? 'ring-2 ring-active-item border-active-item'
                        : 'border-border-grid'
                    }`}
                    style={{ backgroundColor: c.cssVar }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <textarea
              rows={3}
              placeholder="Write your note..."
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              className="w-full bg-background-primary px-3 py-2 rounded-md border border-light-grey focus:border-active-item text-[13px] text-text-color placeholder:text-middle-grey outline-none resize-none leading-relaxed"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowComposer(false)}
                className="px-3 py-1.5 rounded-md text-[12px] text-middle-hard-grey hover:bg-light-grey transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-md text-[12px] font-medium bg-active-item text-white hover:brightness-105 transition cursor-pointer"
              >
                Create &amp; Open
              </button>
            </div>
          </form>
        )}

        {typeFilter === 'documents' ? (
          filteredDocuments.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center gap-2">
              <BookMarked size={26} className="text-middle-grey" />
              <p className="text-[13px] text-middle-hard-grey font-medium">
                No PDF or EPUB documents yet.
              </p>
              <button
                type="button"
                onClick={handleImportDocuments}
                className="mt-1 px-3 py-1.5 rounded-md bg-active-item text-white text-[12px] font-medium hover:brightness-105 flex items-center gap-1.5 cursor-pointer"
              >
                <FileUp size={13} />
                <span>Import PDF / EPUB</span>
              </button>
            </div>
          ) : (
            <div className="grid select-none grid-cols-[repeat(auto-fill,minmax(224px,1fr))] gap-3.5 pb-10">
              {filteredDocuments.map((doc) => (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open document: ${doc.title}`}
                  onClick={() => onOpenDocument?.(doc.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenDocument?.(doc.id);
                    }
                  }}
                  className="group relative h-[240px] rounded-lg border border-solid border-border-grid bg-background-secondary hover:border-active-item/60 hover:shadow-float transition cursor-pointer flex flex-col overflow-hidden"
                >
                  
                  <div className="h-[148px] w-full bg-background-primary border-b border-light-grey relative flex items-center justify-center overflow-hidden p-2">
                    {doc.cover_reference_id && !brokenCoverIds.has(doc.id) ? (
                      <img
                        src={`hepta-preview://${doc.cover_reference_id}`}
                        alt={doc.title}
                        onError={() =>
                          setBrokenCoverIds((prev) => new Set(prev).add(doc.id))
                        }
                        className="max-w-full max-h-full w-auto h-full object-contain rounded-sm shadow-sm"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-middle-grey">
                        {doc.doc_type === 'pdf' ? (
                          <FileText size={30} className="text-danger-item/80" />
                        ) : (
                          <BookMarked size={30} className="text-active-item/80" />
                        )}
                        <span className="text-[10.5px] font-semibold uppercase tracking-wider">
                          {doc.doc_type}
                        </span>
                      </div>
                    )}

                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-background-secondary/90 border border-light-grey text-[10px] font-semibold uppercase text-text-color">
                      {doc.doc_type}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteDocument(doc, e)}
                      className="absolute top-2 right-2 p-1 rounded bg-background-secondary/90 border border-light-grey text-middle-grey hover:text-danger-item opacity-0 group-hover:opacity-100 transition cursor-pointer"
                      title="Delete document"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <h3 className="font-semibold text-[13px] text-text-color group-hover:text-active-item transition line-clamp-2 leading-snug">
                      {doc.title}
                    </h3>
                    <div className="flex items-center justify-between text-[11px] text-middle-grey pt-1">
                      <span className="tabular-nums">
                        {doc.total_pages > 0
                          ? `${doc.total_pages} pages`
                          : new Date(doc.updated_at).toLocaleDateString()}
                      </span>
                      {onAddDocumentToWhiteboard && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddDocumentToWhiteboard(doc);
                          }}
                          className="px-2 py-0.5 rounded bg-background-primary border border-light-grey hover:border-active-item hover:text-active-item transition flex items-center gap-1 cursor-pointer"
                        >
                          <Plus size={11} />
                          <span>Add to board</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : filteredCards.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-[13px] text-middle-grey">No cards found.</p>
          </div>
        ) : viewMode === 'grid' ? (
          
          <div className="grid select-none grid-cols-[repeat(auto-fill,minmax(224px,1fr))] gap-3 pb-10">
            {filteredCards.map((card) => {
              const isSelected = selectedIds.includes(card.id);
              const cTags = cardTagsMap[card.id] || [];
              const cWbs = cardWbsMap[card.id] || [];
              const blCount = backlinkCountMap[card.id] || 0;

              return (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => setDraggingCardId(card.id)}
                  onDragOver={(e) => {
                    if (draggingCardId && draggingCardId !== card.id) e.preventDefault();
                  }}
                  onDrop={() => handleDropManualReorder(card.id)}
                  onDragEnd={() => setDraggingCardId(null)}
                  onClick={(e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                      toggleCardSelected(card.id, e);
                    } else {
                      onOpenCardInSidePanel(card.id);
                    }
                  }}
                  onDoubleClick={() => onOpenFullCard(card.id)}
                  className="group relative h-[208px] rounded-lg border border-solid border-border-grid hover:shadow-float transition-shadow cursor-pointer flex flex-col justify-between p-3.5 overflow-hidden"
                  style={{
                    backgroundColor: resolveCardBgColor(card.color),
                    boxShadow: isSelected ? '0 0 0 2px var(--active-item)' : undefined,
                  }}
                >
                  
                  <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-start justify-between gap-1.5 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => toggleCardSelected(card.id, e)}
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition cursor-pointer ${
                            isSelected
                              ? 'bg-active-item border-active-item text-white opacity-100'
                              : 'border-middle-grey bg-background-primary/80 opacity-0 group-hover:opacity-100'
                          }`}
                          title="Select card"
                        >
                          {isSelected && <Check size={11} strokeWidth={3} />}
                        </button>
                        <h3 className="font-semibold text-[13.5px] text-text-color truncate leading-snug">
                          {card.title || 'Untitled'}
                        </h3>
                      </div>

                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenCardInSidePanel(card.id);
                          }}
                          className="p-1 rounded hover:bg-light-grey text-middle-hard-grey cursor-pointer"
                          title="Open in side panel"
                        >
                          <PanelRightOpen size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFullCard(card.id);
                          }}
                          className="p-1 rounded hover:bg-light-grey text-middle-hard-grey cursor-pointer"
                          title="Open full card"
                        >
                          <Maximize2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddCardToWhiteboard(card.id);
                          }}
                          className="p-1 rounded hover:bg-light-grey text-middle-hard-grey hover:text-active-item cursor-pointer"
                          title="Add to whiteboard"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>

                    <p className="text-[12px] text-middle-hard-grey line-clamp-5 leading-relaxed break-words">
                      {card.content_text || ''}
                    </p>
                  </div>

                  
                  <div className="pt-2 mt-1.5 border-t border-light-grey/70 flex items-center justify-between gap-1.5 shrink-0">
                    <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                      {cTags.slice(0, 2).map((t) => (
                        <span
                          key={t.id}
                          className="px-1.5 py-0.5 rounded bg-ultra-light-grey border border-light-grey text-[10px] text-middle-hard-grey truncate max-w-[74px]"
                        >
                          #{t.name}
                        </span>
                      ))}
                      {cWbs.slice(0, 1).map((w) => (
                        <span
                          key={w.id}
                          className="px-1.5 py-0.5 rounded bg-background-primary/70 border border-light-grey text-[10px] text-middle-grey truncate max-w-[76px]"
                          title={`On whiteboard: ${w.name}`}
                        >
                          {w.name}
                        </span>
                      ))}
                    </div>
                    <span className="text-[10px] text-middle-grey tabular-nums shrink-0">
                      {blCount > 0 ? `${blCount} ref` : new Date(card.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'table' ? (
          
          <div className="rounded-lg border border-border-grid bg-background-secondary overflow-x-auto shadow-card">
            <table className="w-full text-left border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-light-grey bg-background-primary/60 text-[11px] font-semibold text-middle-grey uppercase tracking-wider">
                  <th className="w-9 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${
                        selectedIds.length === filteredCards.length && filteredCards.length > 0
                          ? 'bg-active-item border-active-item text-white'
                          : 'border-middle-grey'
                      }`}
                    >
                      {selectedIds.length === filteredCards.length && filteredCards.length > 0 && (
                        <Check size={11} strokeWidth={3} />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2.5 min-w-[220px]">Title</th>
                  <th className="px-3 py-2.5 min-w-[160px]">Tags</th>
                  <th className="px-3 py-2.5 min-w-[160px]">Whiteboards</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Updated</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Created</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Properties</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-grey">
                {filteredCards.map((card) => {
                  const isSelected = selectedIds.includes(card.id);
                  const cTags = cardTagsMap[card.id] || [];
                  const cWbs = cardWbsMap[card.id] || [];
                  const blCount = backlinkCountMap[card.id] || 0;
                  const charCount = card.content_text?.length || 0;

                  return (
                    <tr
                      key={card.id}
                      onClick={() => onOpenCardInSidePanel(card.id)}
                      className={`group hover:bg-ultra-light-grey cursor-pointer transition ${
                        isSelected ? 'bg-middle-transparent-blue/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => toggleCardSelected(card.id, e)}>
                        <button
                          type="button"
                          className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${
                            isSelected
                              ? 'bg-active-item border-active-item text-white'
                              : 'border-middle-grey opacity-60 group-hover:opacity-100'
                          }`}
                        >
                          {isSelected && <Check size={11} strokeWidth={3} />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 border border-border-grid"
                            style={{ backgroundColor: resolveCardBgColor(card.color) }}
                          />
                          <span className="font-medium text-text-color truncate max-w-[260px]">
                            {card.title || 'Untitled'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {cTags.length > 0 ? (
                            cTags.map((t) => (
                              <span
                                key={t.id}
                                className="px-1.5 py-0.5 rounded bg-ultra-light-grey border border-light-grey text-[11px] text-middle-hard-grey"
                              >
                                #{t.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-middle-grey text-[11px]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {cWbs.length > 0 ? (
                            cWbs.map((w) => (
                              <span
                                key={w.id}
                                className="px-1.5 py-0.5 rounded bg-background-primary border border-light-grey text-[11px] text-middle-hard-grey truncate max-w-[140px]"
                              >
                                {w.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-middle-grey text-[11px]">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-middle-grey tabular-nums whitespace-nowrap">
                        {new Date(card.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-middle-grey tabular-nums whitespace-nowrap">
                        {new Date(card.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-middle-hard-grey tabular-nums whitespace-nowrap">
                        {charCount} chars · {blCount} backlinks
                      </td>
                      <td
                        className="px-3 py-2.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenFullCard(card.id)}
                            className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color cursor-pointer"
                            title="Open full card"
                          >
                            <Maximize2 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onAddCardToWhiteboard(card.id)}
                            className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-active-item cursor-pointer"
                            title="Add to whiteboard"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          
          <div className="rounded-lg border border-border-grid bg-background-secondary divide-y divide-light-grey overflow-hidden shadow-card">
            {filteredCards.map((card) => {
              const isSelected = selectedIds.includes(card.id);
              const cTags = cardTagsMap[card.id] || [];
              return (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => setDraggingCardId(card.id)}
                  onDragOver={(e) => {
                    if (draggingCardId && draggingCardId !== card.id) e.preventDefault();
                  }}
                  onDrop={() => handleDropManualReorder(card.id)}
                  onDragEnd={() => setDraggingCardId(null)}
                  onClick={() => onOpenCardInSidePanel(card.id)}
                  className={`group px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-ultra-light-grey cursor-pointer transition ${
                    isSelected ? 'bg-middle-transparent-blue/40' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <GripVertical
                      size={12}
                      className="text-middle-grey opacity-0 group-hover:opacity-100 shrink-0 cursor-grab"
                    />
                    <button
                      type="button"
                      onClick={(e) => toggleCardSelected(card.id, e)}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition cursor-pointer ${
                        isSelected
                          ? 'bg-active-item border-active-item text-white'
                          : 'border-middle-grey opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {isSelected && <Check size={11} strokeWidth={3} />}
                    </button>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-border-grid"
                      style={{ backgroundColor: resolveCardBgColor(card.color) }}
                    />
                    <span className="text-[13px] font-medium text-text-color truncate max-w-[240px]">
                      {card.title || 'Untitled'}
                    </span>
                    <span className="text-[12px] text-middle-grey truncate flex-1">
                      {card.content_text || ''}
                    </span>
                    <div className="hidden md:flex items-center gap-1 shrink-0">
                      {cTags.slice(0, 2).map((t) => (
                        <span
                          key={t.id}
                          className="px-1.5 py-0.5 rounded bg-ultra-light-grey border border-light-grey text-[10.5px] text-middle-hard-grey"
                        >
                          #{t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-middle-grey tabular-nums">
                      {new Date(card.updated_at).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFullCard(card.id);
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-light-grey text-middle-hard-grey cursor-pointer"
                      title="Open full card"
                    >
                      <Maximize2 size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddCardToWhiteboard(card.id);
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-light-grey text-middle-hard-grey hover:text-active-item cursor-pointer"
                      title="Add to whiteboard"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      
      <div className="mx-6 border-t border-light-grey py-1.5 text-[12px] shrink-0 flex items-center justify-between">
        <div>
          <span className="mr-1.5 text-middle-grey">Count</span>
          <span className="text-middle-hard-grey tabular-nums font-medium">
            {typeFilter === 'documents' ? filteredDocuments.length : filteredCards.length}
          </span>
        </div>
        <span className="text-[11px] text-middle-grey">
          Click to open in side panel · Double-click for full view
        </span>
      </div>
    </div>
  );
}
