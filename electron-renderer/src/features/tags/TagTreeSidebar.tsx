import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Hash,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Search,
  Trash2,
  Edit3,
  FolderInput,
} from 'lucide-react';
import type { TagGroup, TagWithCountRow } from '../../../../shared/types';

const TAG_COLORS = ['#207dff', '#75c33a', '#e89b3d', '#e14646', '#c28dfd', '#52aff3'];

export interface TagTreeSidebarProps {
  tags: TagWithCountRow[];
  tagGroups: TagGroup[];
  selectedTagId: string | null;
  viewMode: 'table' | 'kanban' | 'cards' | 'highlights';
  tagFilterQuery: string;
  newTagName: string;
  onChangeFilterQuery: (q: string) => void;
  onChangeNewTagName: (name: string) => void;
  onSelectTag: (tagId: string) => void;
  onCreateTag: (
    name: string,
    tagGroupId?: string | null,
    parentTagId?: string | null
  ) => Promise<void>;
  onCreateTagPrompt: (tagGroupId?: string | null, parentTagId?: string | null) => Promise<void>;
  onUpdateTag: (input: {
    id: string;
    name?: string;
    color?: string | null;
    tagGroupId?: string | null;
    parentTagId?: string | null;
    isFolded?: number;
  }) => Promise<void>;
  onDeleteTag: (tagId: string, tagName: string) => Promise<void>;
  onCreateGroup: () => Promise<void>;
  onRenameGroup: (group: TagGroup) => Promise<void>;
  onToggleGroupFold: (group: TagGroup) => Promise<void>;
  onDeleteGroup: (group: TagGroup) => Promise<void>;
  onCollapsePane: () => void;
}

export function TagTreeSidebar({
  tags,
  tagGroups,
  selectedTagId,
  viewMode,
  tagFilterQuery,
  newTagName,
  onChangeFilterQuery,
  onChangeNewTagName,
  onSelectTag,
  onCreateTag,
  onCreateTagPrompt,
  onUpdateTag,
  onDeleteTag,
  onCreateGroup,
  onRenameGroup,
  onToggleGroupFold,
  onDeleteGroup,
  onCollapsePane,
}: TagTreeSidebarProps) {
  const [openTagMenuId, setOpenTagMenuId] = useState<string | null>(null);
  const [openGroupMenuId, setOpenGroupMenuId] = useState<string | null>(null);
  const [renamingTagId, setRenamingTagId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const filteredTags = tagFilterQuery.trim()
    ? tags.filter((t) => t.name.toLowerCase().includes(tagFilterQuery.trim().toLowerCase()))
    : tags;

  const renderTagNode = (tag: TagWithCountRow, depth: number) => {
    const isActive = tag.id === selectedTagId;
    const totalCount =
      viewMode === 'cards'
        ? tag.card_count
        : viewMode === 'highlights'
        ? tag.highlight_count ?? 0
        : tag.card_count + (tag.highlight_count ?? 0);
    const children = filteredTags.filter((t) => t.parent_tag_id === tag.id);
    const hasChildren = children.length > 0;
    const isFolded = tag.is_folded === 1;
    const isMenuOpen = openTagMenuId === tag.id;
    const isRenaming = renamingTagId === tag.id;

    return (
      <div key={tag.id} className="select-none">
        <div
          onClick={() => onSelectTag(tag.id)}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          className={`group relative flex items-center justify-between pr-2 py-1.5 rounded-md text-[12.5px] cursor-pointer transition ${
            isActive
              ? 'bg-middle-transparent-blue text-active-item font-medium'
              : 'text-text-color hover:bg-hover'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateTag({ id: tag.id, isFolded: isFolded ? 0 : 1 });
                }}
                className="p-0.5 rounded hover:bg-light-grey text-middle-grey shrink-0 cursor-pointer"
                aria-label={isFolded ? 'Expand sub-tags' : 'Collapse sub-tags'}
              >
                {isFolded ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}

            <Hash
              size={12}
              className="shrink-0"
              style={{ color: tag.color || 'var(--active-item)' }}
            />

            {isRenaming ? (
              <input
                type="text"
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (renameDraft.trim()) {
                      await onUpdateTag({ id: tag.id, name: renameDraft.trim() });
                    }
                    setRenamingTagId(null);
                  } else if (e.key === 'Escape') {
                    setRenamingTagId(null);
                  }
                }}
                onBlur={async () => {
                  if (renameDraft.trim() && renameDraft.trim() !== tag.name) {
                    await onUpdateTag({ id: tag.id, name: renameDraft.trim() });
                  }
                  setRenamingTagId(null);
                }}
                className="flex-1 min-w-0 px-1 py-0.5 rounded bg-background-primary border border-active-item text-[12px] text-text-color outline-none"
              />
            ) : (
              <span className="truncate">{tag.name}</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span
              className={`text-[10.5px] px-1.5 py-0.2 rounded-full ${
                isActive ? 'bg-active-item/15 text-active-item' : 'text-middle-grey'
              }`}
            >
              {totalCount}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenTagMenuId(isMenuOpen ? null : tag.id);
                setOpenGroupMenuId(null);
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
              aria-label={`Tag options for ${tag.name}`}
            >
              <MoreHorizontal size={12} />
            </button>
          </div>

          {isMenuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-1 top-8 w-52 p-1 rounded-lg bg-menu-texture-bg-medium backdrop-blur-2xl border border-light-grey shadow-main z-40 text-[12px]"
            >
              <button
                type="button"
                onClick={() => {
                  setOpenTagMenuId(null);
                  setRenamingTagId(tag.id);
                  setRenameDraft(tag.name);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-text-color cursor-pointer"
              >
                <Edit3 size={12} className="text-middle-hard-grey" />
                <span>Rename</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOpenTagMenuId(null);
                  onCreateTagPrompt(tag.tag_group_id ?? null, tag.id);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-text-color cursor-pointer"
              >
                <Plus size={12} className="text-middle-hard-grey" />
                <span>Create sub-tag</span>
              </button>

              <div className="my-1 border-t border-light-grey" />
              <div className="px-2 py-1 text-[10.5px] font-medium text-middle-grey uppercase tracking-wider">
                Color
              </div>
              <div className="flex items-center gap-1.5 px-2 pb-1.5">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={async () => {
                      await onUpdateTag({ id: tag.id, color: c });
                      setOpenTagMenuId(null);
                    }}
                    className={`w-4 h-4 rounded-full border cursor-pointer ${
                      tag.color === c ? 'border-active-item scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Set tag color ${c}`}
                  />
                ))}
              </div>

              <div className="my-1 border-t border-light-grey" />
              <div className="px-2 py-1 text-[10.5px] font-medium text-middle-grey uppercase tracking-wider flex items-center gap-1">
                <FolderInput size={10} />
                <span>Move to group</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await onUpdateTag({
                    id: tag.id,
                    tagGroupId: null,
                    parentTagId: null,
                  });
                  setOpenTagMenuId(null);
                }}
                className={`w-full text-left px-2 py-1 rounded hover:bg-light-grey cursor-pointer ${
                  !tag.tag_group_id && !tag.parent_tag_id
                    ? 'text-active-item font-medium'
                    : 'text-text-color'
                }`}
              >
                Ungrouped
              </button>
              {tagGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={async () => {
                    await onUpdateTag({
                      id: tag.id,
                      tagGroupId: g.id,
                      parentTagId: null,
                    });
                    setOpenTagMenuId(null);
                  }}
                  className={`w-full text-left px-2 py-1 rounded hover:bg-light-grey truncate cursor-pointer ${
                    tag.tag_group_id === g.id ? 'text-active-item font-medium' : 'text-text-color'
                  }`}
                >
                  {g.name}
                </button>
              ))}

              <div className="my-1 border-t border-light-grey" />
              <button
                type="button"
                onClick={() => {
                  setOpenTagMenuId(null);
                  onDeleteTag(tag.id, tag.name);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-danger-item/10 text-danger-item cursor-pointer"
              >
                <Trash2 size={12} />
                <span>Delete tag</span>
              </button>
            </div>
          )}
        </div>

        {!isFolded && hasChildren && (
          <div>{children.map((child) => renderTagNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const renderRootTags = (groupId: string | null) => {
    const roots = filteredTags.filter((t) => {
      const matchesGroup = (t.tag_group_id ?? null) === groupId;
      if (!matchesGroup) return false;
      if (!t.parent_tag_id) return true;
      return !filteredTags.some((p) => p.id === t.parent_tag_id);
    });
    return roots.map((t) => renderTagNode(t, 0));
  };

  return (
    <div
      className="w-64 shrink-0 border-r border-light-grey bg-background-secondary/60 flex flex-col"
      onClick={() => {
        setOpenTagMenuId(null);
        setOpenGroupMenuId(null);
      }}
    >
      <div className="p-3 border-b border-light-grey space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-text-color">Tag Database</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-ultra-light-grey border border-light-grey text-middle-grey">
              {tags.length}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onCreateGroup}
              className="p-1 rounded-md text-middle-hard-grey hover:text-text-color hover:bg-light-grey transition cursor-pointer"
              title="New tag group"
              aria-label="New tag group"
            >
              <FolderPlus size={14} />
            </button>
            <button
              type="button"
              onClick={onCollapsePane}
              className="p-1 rounded-md text-middle-hard-grey hover:text-text-color hover:bg-light-grey transition cursor-pointer"
              title="Collapse tags list"
              aria-label="Collapse tags list"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTagName.trim()) {
              onCreateTagPrompt(null, null);
              return;
            }
            onCreateTag(newTagName, null, null);
          }}
          className="flex items-center gap-1.5"
        >
          <div className="relative flex-1 min-w-0">
            <Hash
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-middle-grey"
            />
            <input
              type="text"
              value={newTagName}
              onChange={(e) => onChangeNewTagName(e.target.value)}
              placeholder="New tag..."
              aria-label="New tag name"
              className="w-full h-7 pl-6 pr-2 rounded-md bg-background-primary border border-light-grey focus:border-active-item text-[12px] text-text-color placeholder:text-middle-grey outline-none"
            />
          </div>
          <button
            type="submit"
            className="h-7 px-2 rounded-md bg-active-item text-white hover:brightness-105 text-[11.5px] font-medium flex items-center gap-1 transition cursor-pointer shrink-0"
            title="Create tag"
            aria-label="Create tag"
          >
            <Plus size={13} />
          </button>
        </form>

        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-middle-grey"
          />
          <input
            type="text"
            value={tagFilterQuery}
            onChange={(e) => onChangeFilterQuery(e.target.value)}
            placeholder="Filter tags..."
            className="w-full h-7 pl-6 pr-2 rounded-md bg-background-primary/60 border border-light-grey focus:border-active-item text-[11.5px] text-text-color placeholder:text-middle-grey outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
        {tagGroups.map((group) => {
          const isFolded = group.is_folded === 1;
          const groupTags = renderRootTags(group.id);
          const isGroupMenuOpen = openGroupMenuId === group.id;

          return (
            <div key={group.id} className="space-y-0.5">
              <div className="group/grp relative flex items-center justify-between px-2 py-1 rounded-md hover:bg-hover/60 text-[11px] font-semibold text-middle-hard-grey uppercase tracking-wider select-none">
                <button
                  type="button"
                  onClick={() => onToggleGroupFold(group)}
                  className="flex items-center gap-1 min-w-0 flex-1 text-left cursor-pointer"
                >
                  {isFolded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span className="truncate">{group.name}</span>
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onCreateTagPrompt(group.id, null)}
                    className="p-0.5 rounded opacity-0 group-hover/grp:opacity-100 hover:bg-light-grey text-middle-grey hover:text-text-color cursor-pointer"
                    title="Add tag to group"
                  >
                    <Plus size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenGroupMenuId(isGroupMenuOpen ? null : group.id);
                      setOpenTagMenuId(null);
                    }}
                    className="p-0.5 rounded opacity-0 group-hover/grp:opacity-100 hover:bg-light-grey text-middle-grey hover:text-text-color cursor-pointer"
                    title="Group options"
                  >
                    <MoreHorizontal size={12} />
                  </button>
                </div>

                {isGroupMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-1 top-6 w-40 p-1 rounded-lg bg-menu-texture-bg-medium backdrop-blur-2xl border border-light-grey shadow-main z-40 text-[12px] normal-case font-normal tracking-normal"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpenGroupMenuId(null);
                        onRenameGroup(group);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-text-color cursor-pointer"
                    >
                      <Edit3 size={12} />
                      <span>Rename group</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenGroupMenuId(null);
                        onDeleteGroup(group);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-danger-item/10 text-danger-item cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>Delete group</span>
                    </button>
                  </div>
                )}
              </div>

              {!isFolded && <div className="space-y-0.5">{groupTags}</div>}
            </div>
          );
        })}

        <div className="space-y-0.5">
          {tagGroups.length > 0 && (
            <div className="px-2 py-1 text-[11px] font-semibold text-middle-grey uppercase tracking-wider select-none">
              Ungrouped
            </div>
          )}
          {renderRootTags(null)}
        </div>

        {filteredTags.length === 0 && (
          <div className="text-center py-8 px-3 text-[12px] text-middle-grey">
            {tags.length === 0 ? 'No tags yet. Create one above.' : 'No matching tags.'}
          </div>
        )}
      </div>
    </div>
  );
}