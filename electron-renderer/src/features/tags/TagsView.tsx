import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Tag,
  Hash,
  Plus,
  Trash2,
  PanelRightOpen,
  PanelRightClose,
  PanelLeftOpen,
  X,
  Highlighter,
  ExternalLink,
  Table2,
  Kanban,
  LayoutGrid,
  Search,
  MoreHorizontal,
  Copy,
} from 'lucide-react';
import type {
  Card,
  CardPropertyValue,
  HighlightJoinedRow,
  PropertyConfig,
  PropertyType,
  TagGroup,
  TagPropertyJoined,
  TagWithCountRow,
} from '../../../../shared/types';
import { getAnnotationCssVar, resolveCardBgColor } from '../../../../shared/palette';
import { heptaClient } from '../../client';
import { useAppModal } from '../../primitives/AppModal';
import { SidebarExpandButton } from '../../primitives/SidebarExpandButton';
import { PropertyTypeIcon, PropertyValueEditor } from '../../primitives/card-metadata';
import { TagTreeSidebar } from './TagTreeSidebar';
import { TagDatabaseTable, type UnifiedTagItem } from './TagDatabaseTable';
import { TagDatabaseKanban } from './TagDatabaseKanban';

export interface TagsViewProps {
  allCards: Card[];
  onOpenCardInSidePanel: (cardId: string) => void;
  onAddCardToWhiteboard: (cardId: string) => void;
  onOpenDocument?: (documentId: string, highlightId?: string) => void;
  onAddHighlightToWhiteboard?: (highlightId: string) => void;
  isSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  isSidePanelOpen?: boolean;
  onToggleSidePanel?: () => void;
}

const TAG_COLORS = ['#207dff', '#75c33a', '#e89b3d', '#e14646', '#c28dfd', '#52aff3'];

export function TagsView({
  allCards,
  onOpenCardInSidePanel,
  onAddCardToWhiteboard,
  onOpenDocument,
  onAddHighlightToWhiteboard,
  isSidebarCollapsed = false,
  onExpandSidebar,
  isSidePanelOpen = false,
  onToggleSidePanel,
}: TagsViewProps) {
  const { showPrompt, showAlert, showConfirm } = useAppModal();
  const [tags, setTags] = useState<TagWithCountRow[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [taggedCards, setTaggedCards] = useState<Card[]>([]);
  const [taggedHighlights, setTaggedHighlights] = useState<HighlightJoinedRow[]>([]);
  const [tagProperties, setTagProperties] = useState<TagPropertyJoined[]>([]);
  const [allWorkspaceProperties, setAllWorkspaceProperties] = useState<TagPropertyJoined[]>([]);
  const [propertyValues, setPropertyValues] = useState<CardPropertyValue[]>([]);
  const [allCardTagsMap, setAllCardTagsMap] = useState<Record<string, string[]>>({});
  const [newTagName, setNewTagName] = useState('');
  const [tagFilterQuery, setTagFilterQuery] = useState('');
  const [itemFilterQuery, setItemFilterQuery] = useState('');
  const [isLeftPaneCollapsed, setIsLeftPaneCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'cards' | 'highlights'>('table');
  const [sortField, setSortField] = useState<'title' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const loadTagsAndGroups = useCallback(async () => {
    try {
      const [rows, groups, allProps, cardTagRows] = await Promise.all([
        heptaClient.tags.listWithCounts(),
        heptaClient.tags.listGroups(),
        heptaClient.properties.listAll(),
        heptaClient.cards.listAllCardTags(),
      ]);
      setTags(rows || []);
      setTagGroups(groups || []);
      setAllWorkspaceProperties(allProps || []);
      const ctMap: Record<string, string[]> = {};
      for (const ct of cardTagRows || []) {
        if (!ctMap[ct.card_id]) ctMap[ct.card_id] = [];
        ctMap[ct.card_id].push(ct.tag_id);
      }
      setAllCardTagsMap(ctMap);
      setSelectedTagId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return rows.length > 0 ? rows[0].id : null;
      });
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, []);

  const loadTagDatabaseData = useCallback(async (tagId: string | null) => {
    if (!tagId) {
      setTaggedCards([]);
      setTaggedHighlights([]);
      setTagProperties([]);
      setPropertyValues([]);
      return;
    }
    try {
      const [cardRows, hlRows, propRows, valRows] = await Promise.all([
        heptaClient.tags.listCardsByTag(tagId),
        heptaClient.tags.listHighlightsByTag(tagId),
        heptaClient.properties.listByTag(tagId),
        heptaClient.properties.listValuesByTag(tagId),
      ]);
      setTaggedCards(cardRows || []);
      setTaggedHighlights(hlRows || []);
      setTagProperties(propRows || []);
      setPropertyValues(valRows || []);
    } catch (err) {
      console.error('Failed to load items for tag:', err);
    }
  }, []);

  useEffect(() => {
    loadTagsAndGroups();
  }, [loadTagsAndGroups]);

  useEffect(() => {
    loadTagDatabaseData(selectedTagId);
  }, [selectedTagId, loadTagDatabaseData]);

  const createTagByName = async (
    rawName: string,
    tagGroupId?: string | null,
    parentTagId?: string | null
  ) => {
    const trimmed = rawName.trim().replace(/^#/, '');
    if (!trimmed) return;

    const existing = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setSelectedTagId(existing.id);
      setNewTagName('');
      return;
    }

    const color = TAG_COLORS[tags.length % TAG_COLORS.length];
    try {
      const created = await heptaClient.tags.create(trimmed, color, tagGroupId, parentTagId);
      setNewTagName('');
      await loadTagsAndGroups();
      setSelectedTagId(created.id);
    } catch (err) {
      console.error('Failed to create tag:', err);
      await showAlert({
        title: 'Failed to create tag',
        message: err instanceof Error ? err.message : 'Unable to create tag.',
      });
    }
  };

  const handleCreateTagPrompt = async (
    tagGroupId?: string | null,
    parentTagId?: string | null
  ) => {
    const inputName = await showPrompt({
      title: parentTagId ? 'New sub-tag' : 'New tag',
      message: 'Enter a name for the new tag database.',
      placeholder: 'Tag name...',
      confirmText: 'Create',
    });
    if (inputName && inputName.trim()) {
      await createTagByName(inputName, tagGroupId, parentTagId);
    }
  };

  const handleUpdateTag = async (input: {
    id: string;
    name?: string;
    color?: string | null;
    tagGroupId?: string | null;
    parentTagId?: string | null;
    isFolded?: number;
  }) => {
    await heptaClient.tags.update(input);
    await loadTagsAndGroups();
  };

  const handleDeleteTag = async (tagId: string, tagName: string) => {
    const confirmed = await showConfirm({
      title: 'Delete tag',
      message: `Are you sure you want to delete tag #${tagName}? Cards and highlights will not be deleted.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await heptaClient.tags.delete(tagId);
      setShowMoreMenu(false);
      await loadTagsAndGroups();
    } catch (err) {
      console.error('Failed to delete tag:', err);
    }
  };

  const handleCreateGroup = async () => {
    const inputName = await showPrompt({
      title: 'New tag group',
      message: 'Organize related tags into a group.',
      placeholder: 'Group name...',
      confirmText: 'Create',
    });
    if (!inputName || !inputName.trim()) return;
    await heptaClient.tags.createGroup(inputName.trim());
    await loadTagsAndGroups();
  };

  const handleRenameGroup = async (group: TagGroup) => {
    const nextName = await showPrompt({
      title: 'Rename tag group',
      message: 'Enter a new name for this group.',
      defaultValue: group.name,
      confirmText: 'Save',
    });
    if (!nextName || !nextName.trim()) return;
    await heptaClient.tags.updateGroup({ id: group.id, name: nextName.trim() });
    await loadTagsAndGroups();
  };

  const handleToggleGroupFold = async (group: TagGroup) => {
    await heptaClient.tags.updateGroup({
      id: group.id,
      isFolded: group.is_folded === 1 ? 0 : 1,
    });
    await loadTagsAndGroups();
  };

  const handleDeleteGroup = async (group: TagGroup) => {
    const confirmed = await showConfirm({
      title: 'Delete tag group',
      message: `Delete group "${group.name}"? Tags inside will be moved to Ungrouped.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    await heptaClient.tags.deleteGroup(group.id);
    await loadTagsAndGroups();
  };

  const handleCopyTagLink = async (tagName: string) => {
    try {
      await navigator.clipboard.writeText(`#${tagName}`);
      setShowMoreMenu(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignCard = async (cardId: string) => {
    if (!selectedTagId) return;
    try {
      await heptaClient.tags.assignToCard(cardId, selectedTagId);
      setShowAssignMenu(false);
      await Promise.all([loadTagsAndGroups(), loadTagDatabaseData(selectedTagId)]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnassignCard = async (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedTagId) return;
    try {
      await heptaClient.tags.removeFromCard(cardId, selectedTagId);
      await Promise.all([loadTagsAndGroups(), loadTagDatabaseData(selectedTagId)]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnassignHighlight = async (highlightId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedTagId) return;
    try {
      await heptaClient.highlights.removeTag(highlightId, selectedTagId);
      await Promise.all([loadTagsAndGroups(), loadTagDatabaseData(selectedTagId)]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateProperty = async (
    type: PropertyType,
    name: string,
    config?: PropertyConfig
  ) => {
    if (!selectedTagId) return;
    await heptaClient.properties.createForTag({
      tagId: selectedTagId,
      name,
      type,
      config,
    });
    await Promise.all([loadTagsAndGroups(), loadTagDatabaseData(selectedTagId)]);
  };

  const handleAttachProperty = async (propertyId: string) => {
    if (!selectedTagId) return;
    await heptaClient.properties.attachToTag(selectedTagId, propertyId);
    await Promise.all([loadTagsAndGroups(), loadTagDatabaseData(selectedTagId)]);
  };

  const handleDetachProperty = async (propertyId: string) => {
    if (!selectedTagId) return;
    await heptaClient.properties.detachFromTag(selectedTagId, propertyId);
    await loadTagDatabaseData(selectedTagId);
  };

  const handleDeleteProperty = async (propertyId: string) => {
    const confirmed = await showConfirm({
      title: 'Delete property',
      message: 'This will remove the property and its values from all databases.',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    await heptaClient.properties.delete(propertyId);
    await Promise.all([loadTagsAndGroups(), loadTagDatabaseData(selectedTagId)]);
  };

  const handleRenameProperty = async (prop: TagPropertyJoined) => {
    const nextName = await showPrompt({
      title: 'Rename property',
      message: 'Enter a new name for this property.',
      defaultValue: prop.name,
      confirmText: 'Save',
    });
    if (!nextName || !nextName.trim()) return;
    await heptaClient.properties.update({ id: prop.id, name: nextName.trim() });
    await Promise.all([loadTagsAndGroups(), loadTagDatabaseData(selectedTagId)]);
  };

  const handleToggleWrapProperty = async (prop: TagPropertyJoined) => {
    if (!selectedTagId) return;
    await heptaClient.properties.updateBinding({
      tagId: selectedTagId,
      propertyId: prop.id,
      shouldWrap: prop.should_wrap === 1 ? 0 : 1,
    });
    await loadTagDatabaseData(selectedTagId);
  };

  const handleToggleHideProperty = async (prop: TagPropertyJoined) => {
    if (!selectedTagId) return;
    await heptaClient.properties.updateBinding({
      tagId: selectedTagId,
      propertyId: prop.id,
      isHidden: prop.is_hidden === 1 ? 0 : 1,
    });
    await loadTagDatabaseData(selectedTagId);
  };

  const handleChangeCellValue = async (
    cardId: string,
    propertyId: string,
    valueJson: string | null
  ) => {
    if (valueJson === null) {
      setPropertyValues((prev) =>
        prev.filter((v) => !(v.card_id === cardId && v.property_id === propertyId))
      );
      await heptaClient.properties.clearValue(cardId, propertyId);
    } else {
      setPropertyValues((prev) => {
        const filtered = prev.filter(
          (v) => !(v.card_id === cardId && v.property_id === propertyId)
        );
        return [
          ...filtered,
          { card_id: cardId, property_id: propertyId, value_json: valueJson, updated_at: Date.now() },
        ];
      });
      await heptaClient.properties.setValue(cardId, propertyId, valueJson);
    }
  };

  const handleUpdatePropertyConfig = async (propertyId: string, config: PropertyConfig) => {
    await heptaClient.properties.update({ id: propertyId, config });
    await Promise.all([loadTagsAndGroups(), loadTagDatabaseData(selectedTagId)]);
  };

  const handleDeleteOption = async (
    propertyId: string,
    optionId: string,
    deleteCards?: boolean
  ) => {
    const confirmed = await showConfirm({
      title: 'Delete option',
      message: 'Are you sure you want to delete this option?',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    await heptaClient.properties.deleteOption(propertyId, optionId, deleteCards);
    await loadTagDatabaseData(selectedTagId);
  };

  const handleSelectGroupByProperty = async (propertyId: string) => {
    if (!selectedTagId) return;
    await heptaClient.tags.update({ id: selectedTagId, kanbanGroupByPropertyId: propertyId });
    await loadTagsAndGroups();
  };

  const handleCreateSelectPropertyForKanban = async () => {
    if (!selectedTagId) return;
    try {
      const created = await heptaClient.properties.createForTag({
        tagId: selectedTagId,
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: `opt-${Date.now()}-1`, name: 'To Do', color: 'yellow' },
            { id: `opt-${Date.now()}-2`, name: 'In Progress', color: 'blue' },
            { id: `opt-${Date.now()}-3`, name: 'Done', color: 'green' },
          ],
        },
      });
      await heptaClient.tags.update({ id: selectedTagId, kanbanGroupByPropertyId: created.id });
      await Promise.all([loadTagsAndGroups(), loadTagDatabaseData(selectedTagId)]);
    } catch (err) {
      console.error('Failed to create Status property:', err);
      await showAlert({
        title: 'Failed to create Status property',
        message: err instanceof Error ? err.message : 'Unable to create Status property.',
      });
    }
  };

  const handleCreateCardInColumn = async (
    propertyId: string | null,
    optionId: string | null
  ) => {
    if (!selectedTagId) return;
    const title = await showPrompt({
      title: 'New card',
      message: 'Enter a title for the new card.',
      placeholder: 'Card title...',
      confirmText: 'Create',
    });
    if (!title || !title.trim()) return;
    const created = await heptaClient.cards.create({ title: title.trim() });
    await heptaClient.tags.assignToCard(created.id, selectedTagId);
    if (propertyId && optionId) {
      await heptaClient.properties.setValue(created.id, propertyId, JSON.stringify(optionId));
    }
    await Promise.all([loadTagsAndGroups(), loadTagDatabaseData(selectedTagId)]);
  };

  const visibleTagProperties = useMemo(
    () => tagProperties.filter((p) => p.is_hidden !== 1),
    [tagProperties]
  );

  const propertyValueMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of propertyValues) {
      map.set(`${v.card_id}#${v.property_id}`, v.value_json);
    }
    return map;
  }, [propertyValues]);

  const renderObjectProperties = (objectId: string) => {
    if (visibleTagProperties.length === 0) return null;
    return (
      <div
        className="mt-2 pt-2 border-t border-light-grey/50 space-y-1 text-[11px]"
        onClick={(e) => e.stopPropagation()}
      >
        {visibleTagProperties.map((prop) => (
          <div key={prop.id} className="flex items-center gap-2 min-h-[22px]">
            <div className="flex items-center gap-1 w-24 shrink-0 text-middle-grey truncate">
              <PropertyTypeIcon type={prop.type} size={11} />
              <span className="truncate">{prop.name}</span>
            </div>
            <div className="flex-1 min-w-0">
              <PropertyValueEditor
                property={prop}
                valueJson={propertyValueMap.get(`${objectId}#${prop.id}`) ?? null}
                allCards={allCards}
                compact
                wrap
                onChangeValue={(nextVal) => handleChangeCellValue(objectId, prop.id, nextVal)}
                onUpdatePropertyConfig={handleUpdatePropertyConfig}
                onDeleteOption={handleDeleteOption}
                onOpenCard={onOpenCardInSidePanel}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const selectedTag = useMemo(
    () => tags.find((t) => t.id === selectedTagId) || null,
    [tags, selectedTagId]
  );

  const untaggedCandidates = useMemo(
    () => allCards.filter((c) => !taggedCards.some((tc) => tc.id === c.id)),
    [allCards, taggedCards]
  );

  const unifiedItems = useMemo<UnifiedTagItem[]>(() => {
    const cardItems: UnifiedTagItem[] = taggedCards.map((c) => ({
      id: c.id,
      type: 'card',
      title: c.title || 'Untitled',
      content: c.content_text || '',
      color: c.color,
      updatedAt: c.updated_at,
    }));

    const hlItems: UnifiedTagItem[] = taggedHighlights.map((hl) => ({
      id: hl.id,
      type: 'highlight',
      title: hl.text_content || (hl.highlight_type === 'area' ? 'Area highlight' : 'Highlight'),
      content: hl.note_text || hl.text_content || '',
      docTitle: hl.doc_title,
      docId: hl.source_id,
      pageNumber: hl.page_number,
      color: hl.color,
      highlightType: hl.highlight_type,
      imageReferenceId: hl.image_reference_id,
      noteText: hl.note_text,
      updatedAt: hl.created_at,
    }));

    const combined = [...cardItems, ...hlItems];
    const q = itemFilterQuery.trim().toLowerCase();
    const filtered = q
      ? combined.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.content.toLowerCase().includes(q) ||
            (item.docTitle && item.docTitle.toLowerCase().includes(q))
        )
      : combined;

    return filtered.sort((a, b) => {
      if (sortField === 'title') {
        const cmp = a.title.localeCompare(b.title);
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }, [taggedCards, taggedHighlights, itemFilterQuery, sortField, sortOrder]);

  const filteredTaggedCards = useMemo(() => {
    const q = itemFilterQuery.trim().toLowerCase();
    if (!q) return taggedCards;
    return taggedCards.filter(
      (c) =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.content_text || '').toLowerCase().includes(q)
    );
  }, [taggedCards, itemFilterQuery]);

  const filteredTaggedHighlights = useMemo(() => {
    const q = itemFilterQuery.trim().toLowerCase();
    if (!q) return taggedHighlights;
    return taggedHighlights.filter(
      (h) =>
        (h.text_content || '').toLowerCase().includes(q) ||
        (h.note_text || '').toLowerCase().includes(q) ||
        (h.doc_title || '').toLowerCase().includes(q)
    );
  }, [taggedHighlights, itemFilterQuery]);

  const toggleSort = (field: 'title' | 'date') => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleRowClick = (item: UnifiedTagItem) => {
    if (item.type === 'card') {
      onOpenCardInSidePanel(item.id);
    } else if (item.type === 'highlight' && item.docId) {
      onOpenDocument?.(item.docId, item.id);
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-background-primary">
      <div
        className={`flex items-center min-h-[48px] py-2 pr-4 border-b border-light-grey bg-background-secondary/60 shrink-0 transition-[padding] duration-300 ${
          isSidebarCollapsed ? 'pl-2.5' : 'pl-4'
        }`}
      >
        <SidebarExpandButton visible={isSidebarCollapsed} onExpand={onExpandSidebar} />

        <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {isLeftPaneCollapsed && (
              <button
                type="button"
                onClick={() => setIsLeftPaneCollapsed(false)}
                className="p-1.5 rounded-md hover:bg-light-grey text-middle-hard-grey transition cursor-pointer shrink-0"
                title="Show database list"
                aria-label="Show database list"
              >
                <PanelLeftOpen size={16} />
              </button>
            )}

            {selectedTag ? (
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: selectedTag.color || '#207dff' }}
                />
                <h1 className="text-[15px] font-semibold text-text-color max-w-[140px] truncate">
                  #{selectedTag.name}
                </h1>
                <span className="px-1.5 py-0.5 rounded-full bg-ultra-light-grey border border-light-grey text-[11px] font-medium tabular-nums text-middle-grey shrink-0">
                  {viewMode === 'cards'
                    ? taggedCards.length
                    : viewMode === 'highlights'
                    ? taggedHighlights.length
                    : taggedCards.length + taggedHighlights.length}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Tag size={16} className="text-tag" />
                <h1 className="text-[15px] font-semibold text-text-color">Tag Database</h1>
              </div>
            )}

            {selectedTag && (
              <div className="flex items-center ml-1.5 pl-2 border-l border-light-grey gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`h-7 px-2 rounded-md text-[12px] font-medium flex items-center gap-1 transition cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-selected text-text-color font-semibold shadow-xs'
                      : 'text-middle-grey hover:bg-hover hover:text-text-color'
                  }`}
                  aria-label="Table view"
                >
                  <Table2 size={13} />
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`h-7 px-2 rounded-md text-[12px] font-medium flex items-center gap-1 transition cursor-pointer ${
                    viewMode === 'kanban'
                      ? 'bg-selected text-text-color font-semibold shadow-xs'
                      : 'text-middle-grey hover:bg-hover hover:text-text-color'
                  }`}
                  aria-label="Kanban view"
                >
                  <Kanban size={13} />
                  <span className="hidden sm:inline">Kanban</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`h-7 px-2 rounded-md text-[12px] font-medium flex items-center gap-1 transition cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-selected text-text-color font-semibold shadow-xs'
                      : 'text-middle-grey hover:bg-hover hover:text-text-color'
                  }`}
                  aria-label="Cards view"
                >
                  <LayoutGrid size={13} />
                  <span className="hidden sm:inline">Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('highlights')}
                  className={`h-7 px-2 rounded-md text-[12px] font-medium flex items-center gap-1 transition cursor-pointer ${
                    viewMode === 'highlights'
                      ? 'bg-selected text-text-color font-semibold shadow-xs'
                      : 'text-middle-grey hover:bg-hover hover:text-text-color'
                  }`}
                  aria-label="Highlights view"
                >
                  <Highlighter size={13} />
                  <span className="hidden sm:inline">Highlights</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedTag && (
              <>
                <div className="relative">
                  <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-middle-grey"
                  />
                  <input
                    type="text"
                    value={itemFilterQuery}
                    onChange={(e) => setItemFilterQuery(e.target.value)}
                    placeholder="Filter items..."
                    className="w-36 h-7 pl-7 pr-6 rounded-md bg-background-primary border border-light-grey focus:border-active-item text-[12px] text-text-color placeholder:text-middle-grey outline-none"
                    aria-label="Filter items"
                  />
                  {itemFilterQuery && (
                    <button
                      type="button"
                      onClick={() => setItemFilterQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-middle-grey hover:text-text-color cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAssignMenu((prev) => !prev)}
                    className="h-7 px-2.5 rounded-md border border-light-grey bg-background-secondary hover:border-active-item text-[12px] text-text-color flex items-center gap-1.5 transition cursor-pointer font-medium"
                    aria-label="Link card"
                  >
                    <Plus size={12} />
                    <span>Link card</span>
                  </button>

                  {showAssignMenu && (
                    <div className="absolute right-0 top-8 w-64 p-1.5 rounded-lg bg-menu-bg border border-light-grey shadow-main z-40 max-h-60 overflow-y-auto">
                      {untaggedCandidates.length === 0 ? (
                        <div className="text-[11.5px] text-middle-grey p-2 text-center">
                          No cards available to link
                        </div>
                      ) : (
                        untaggedCandidates.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleAssignCard(c.id)}
                            className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-light-grey text-[12px] text-text-color truncate transition cursor-pointer"
                          >
                            {c.title || 'Untitled'}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowMoreMenu((prev) => !prev)}
                    className="h-7 w-7 rounded-md border border-light-grey hover:bg-light-grey text-middle-hard-grey flex items-center justify-center transition cursor-pointer"
                    title="Tag options"
                    aria-label="Tag options"
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {showMoreMenu && (
                    <div className="absolute right-0 top-8 w-44 p-1 rounded-lg bg-menu-bg border border-light-grey shadow-main z-40 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => handleCopyTagLink(selectedTag.name)}
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-light-grey text-[12px] text-text-color flex items-center gap-2 cursor-pointer"
                      >
                        <Copy size={12} className="text-middle-grey" />
                        <span>Copy tag name</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTag(selectedTag.id, selectedTag.name)}
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-danger-item/10 text-[12px] text-danger-item flex items-center gap-2 cursor-pointer"
                      >
                        <Trash2 size={12} />
                        <span>Delete tag</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {onToggleSidePanel && (
              <button
                type="button"
                onClick={onToggleSidePanel}
                className={`h-7 w-7 rounded-md border border-light-grey hover:bg-light-grey text-middle-hard-grey flex items-center justify-center transition cursor-pointer ${
                  isSidePanelOpen ? 'bg-selected text-active-item' : ''
                }`}
                title={isSidePanelOpen ? 'Hide side panel' : 'Show side panel'}
                aria-label={isSidePanelOpen ? 'Hide side panel' : 'Show side panel'}
              >
                {isSidePanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden w-full">
        {!isLeftPaneCollapsed && (
          <TagTreeSidebar
            tags={tags}
            tagGroups={tagGroups}
            selectedTagId={selectedTagId}
            viewMode={viewMode}
            tagFilterQuery={tagFilterQuery}
            newTagName={newTagName}
            onChangeFilterQuery={setTagFilterQuery}
            onChangeNewTagName={setNewTagName}
            onSelectTag={setSelectedTagId}
            onCreateTag={createTagByName}
            onCreateTagPrompt={handleCreateTagPrompt}
            onUpdateTag={handleUpdateTag}
            onDeleteTag={handleDeleteTag}
            onCreateGroup={handleCreateGroup}
            onRenameGroup={handleRenameGroup}
            onToggleGroupFold={handleToggleGroupFold}
            onDeleteGroup={handleDeleteGroup}
            onCollapsePane={() => setIsLeftPaneCollapsed(true)}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden bg-background-primary">
          {!selectedTag ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <div className="w-12 h-12 rounded-xl bg-background-secondary border border-border-grid flex items-center justify-center mb-3 shadow-card">
                <Tag size={20} className="text-tag" />
              </div>
              <p className="text-[15px] font-semibold text-text-color">Tag Database</p>
              <p className="text-[12.5px] text-middle-grey mt-1 max-w-sm">
                Select a tag from the left pane or create a new one to view its cards and properties database.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTagName.trim()) {
                    handleCreateTagPrompt();
                    return;
                  }
                  createTagByName(newTagName);
                }}
                className="flex items-center gap-2 mt-4"
              >
                <div className="relative">
                  <Hash
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-middle-grey"
                  />
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="New tag name..."
                    className="w-44 h-8 pl-7 pr-3 rounded-md bg-background-primary border border-light-grey focus:border-active-item text-[12.5px] text-text-color placeholder:text-middle-grey outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="h-8 px-3 rounded-md bg-active-item text-white hover:brightness-105 text-[12px] font-medium flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Create tag</span>
                </button>
              </form>
            </div>
          ) : viewMode === 'table' ? (
            unifiedItems.length === 0 && tagProperties.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
                <div className="w-11 h-11 rounded-xl bg-background-secondary border border-border-grid flex items-center justify-center mb-3 shadow-card">
                  <Tag size={18} className="text-middle-grey" />
                </div>
                <p className="text-[14px] font-semibold text-text-color">
                  No items in #{selectedTag.name}
                </p>
                <p className="text-[12px] text-middle-grey mt-1 max-w-sm">
                  Link cards above or add this tag from any card or document highlight.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAssignMenu(true)}
                  className="mt-4 px-3 py-1.5 rounded-md bg-active-item text-white hover:brightness-105 text-[12px] font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Link card</span>
                </button>
              </div>
            ) : (
              <TagDatabaseTable
                selectedTag={selectedTag}
                allTags={tags}
                allCards={allCards}
                items={unifiedItems}
                properties={tagProperties}
                allWorkspaceProperties={allWorkspaceProperties}
                propertyValues={propertyValues}
                allCardTagsMap={allCardTagsMap}
                sortField={sortField}
                onToggleSort={toggleSort}
                onRowClick={handleRowClick}
                onUnassignCard={handleUnassignCard}
                onUnassignHighlight={handleUnassignHighlight}
                onCreateProperty={handleCreateProperty}
                onAttachProperty={handleAttachProperty}
                onDetachProperty={handleDetachProperty}
                onDeleteProperty={handleDeleteProperty}
                onRenameProperty={handleRenameProperty}
                onToggleWrapProperty={handleToggleWrapProperty}
                onToggleHideProperty={handleToggleHideProperty}
                onChangeCellValue={handleChangeCellValue}
                onUpdatePropertyConfig={handleUpdatePropertyConfig}
                onDeleteOption={handleDeleteOption}
                onOpenCard={onOpenCardInSidePanel}
              />
            )
          ) : viewMode === 'kanban' ? (
            <TagDatabaseKanban
              selectedTag={selectedTag}
              taggedCards={filteredTaggedCards}
              taggedHighlights={filteredTaggedHighlights}
              properties={tagProperties}
              propertyValues={propertyValues}
              onSelectGroupByProperty={handleSelectGroupByProperty}
              onCreateSelectProperty={handleCreateSelectPropertyForKanban}
              onChangeCardOption={(cardId, propId, optId) =>
                handleChangeCellValue(cardId, propId, optId ? JSON.stringify(optId) : null)
              }
              onUpdatePropertyConfig={handleUpdatePropertyConfig}
              onDeleteOption={handleDeleteOption}
              onCreateCardInColumn={handleCreateCardInColumn}
              onOpenCardInSidePanel={onOpenCardInSidePanel}
              onAddCardToWhiteboard={onAddCardToWhiteboard}
              onUnassignCard={handleUnassignCard}
              onUnassignHighlight={handleUnassignHighlight}
              onOpenDocument={onOpenDocument}
            />
          ) : viewMode === 'cards' ? (
            <div className="flex-1 overflow-y-auto p-6">
              {filteredTaggedCards.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {filteredTaggedCards.map((card) => (
                    <div
                      key={card.id}
                      onClick={() => onOpenCardInSidePanel(card.id)}
                      className="group p-4 rounded-lg border border-border-grid hover:border-active-item/60 shadow-card cursor-pointer transition flex flex-col justify-between min-h-[130px]"
                      style={{ backgroundColor: resolveCardBgColor(card.color) }}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="text-[13.5px] font-semibold text-text-color group-hover:text-active-item truncate">
                            {card.title || 'Untitled'}
                          </h3>
                          <button
                            type="button"
                            onClick={(e) => handleUnassignCard(card.id, e)}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
                            title="Remove tag from card"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <p className="text-[12px] text-middle-hard-grey line-clamp-3 leading-relaxed">
                          {card.content_text || 'Empty card'}
                        </p>
                        {renderObjectProperties(card.id)}
                      </div>

                      <div className="pt-2.5 mt-2.5 border-t border-light-grey/70 flex items-center justify-between text-[11px] text-middle-grey">
                        <span>{new Date(card.updated_at).toLocaleDateString()}</span>
                        <div className="flex items-center gap-1.5">
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
                              onAddCardToWhiteboard(card.id);
                            }}
                            className="px-2 py-0.5 rounded bg-background-primary/80 border border-light-grey hover:border-active-item hover:text-active-item transition cursor-pointer"
                          >
                            + Board
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-middle-grey border border-dashed border-light-grey rounded-xl">
                  <LayoutGrid size={24} className="mb-2 opacity-50" />
                  <p className="text-[13px] font-medium text-text-color">
                    {itemFilterQuery ? '未找到匹配的卡片' : '此标签下暂无卡片'}
                  </p>
                  <p className="text-[11.5px] text-middle-grey mt-1">
                    {itemFilterQuery
                      ? '请尝试更换筛选关键词'
                      : '可在白板、卡片库或在此处点击 "+ Card" 为卡片分配此标签'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              {filteredTaggedHighlights.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {filteredTaggedHighlights.map((hl) => {
                    const accentColor = getAnnotationCssVar(hl.color);
                    return (
                      <div
                        key={hl.id}
                        className="group p-4 rounded-lg bg-background-secondary border border-border-grid hover:border-active-item/60 shadow-card transition flex flex-col justify-between"
                        style={{
                          borderLeftWidth: 4,
                          borderLeftColor: accentColor,
                        }}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-ultra-light-grey text-middle-grey border border-light-grey truncate max-w-[200px]">
                              {hl.doc_title || hl.source_type.toUpperCase()}
                              {hl.page_number ? ` · Page ${hl.page_number}` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleUnassignHighlight(hl.id, e)}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer shrink-0"
                              title="Remove tag from highlight"
                            >
                              <X size={12} />
                            </button>
                          </div>

                          {hl.highlight_type === 'area' && hl.image_reference_id ? (
                            <div className="rounded-md overflow-hidden border border-light-grey bg-background-primary max-h-48 flex items-center justify-center">
                              <img
                                src={`hepta-preview://${hl.image_reference_id}`}
                                alt="Area highlight"
                                className="max-h-44 w-auto object-contain"
                              />
                            </div>
                          ) : (
                            <blockquote className="text-[12.5px] text-text-color leading-relaxed whitespace-pre-wrap">
                              {hl.text_content || '(Area highlight)'}
                            </blockquote>
                          )}

                          {hl.note_text && (
                            <p className="text-[11.5px] text-middle-hard-grey bg-background-primary/70 border border-light-grey rounded px-2.5 py-1">
                              {hl.note_text}
                            </p>
                          )}
                          {renderObjectProperties(hl.id)}
                        </div>

                        <div className="pt-2.5 mt-3 border-t border-light-grey/70 flex items-center justify-between text-[11px] text-middle-grey">
                          <span>{new Date(hl.created_at).toLocaleDateString()}</span>
                          <div className="flex items-center gap-1.5">
                            {onAddHighlightToWhiteboard && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddHighlightToWhiteboard(hl.id);
                                }}
                                className="px-2 py-0.5 rounded bg-background-primary/80 border border-light-grey hover:border-active-item hover:text-active-item transition cursor-pointer"
                              >
                                + Board
                              </button>
                            )}
                            {onOpenDocument && (
                              <button
                                type="button"
                                onClick={() => onOpenDocument(hl.source_id, hl.id)}
                                className="px-2 py-0.5 rounded bg-middle-transparent-blue text-active-item hover:brightness-95 font-medium flex items-center gap-1 transition cursor-pointer shrink-0"
                              >
                                <ExternalLink size={11} />
                                <span>{hl.page_number ? `Page ${hl.page_number}` : 'Open'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-middle-grey border border-dashed border-light-grey rounded-xl">
                  <Highlighter size={24} className="mb-2 opacity-50" />
                  <p className="text-[13px] font-medium text-text-color">
                    {itemFilterQuery ? '未找到匹配的高亮' : '此标签下暂无高亮标注'}
                  </p>
                  <p className="text-[11.5px] text-middle-grey mt-1">
                    {itemFilterQuery
                      ? '请尝试更换筛选关键词'
                      : '在阅读 PDF 或 EPUB 文献时划选文字或区域截图，并添加此标签即可在此聚合'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}