import React, { useState, useMemo } from 'react';
import {
  CircleDot,
  Edit3,
  Highlighter,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Card,
  CardPropertyValue,
  HighlightJoinedRow,
  OptionColor,
  PropertyConfig,
  PropertyOption,
  TagPropertyJoined,
  TagWithCountRow,
} from '../../../../shared/types';
import {
  HEPTA_OPTION_PALETTE,
  getAnnotationCssVar,
  pickRandomOptionColor,
  resolveCardBgColor,
  resolveOptionCssVar,
} from '../../../../shared/palette';
import { parsePropertyConfig, parsePropertyValueJson } from '../../primitives/card-metadata';

export interface TagDatabaseKanbanProps {
  selectedTag: TagWithCountRow;
  taggedCards: Card[];
  taggedHighlights: HighlightJoinedRow[];
  properties: TagPropertyJoined[];
  propertyValues: CardPropertyValue[];
  onSelectGroupByProperty: (propertyId: string) => Promise<void>;
  onCreateSelectProperty: () => Promise<void>;
  onChangeCardOption: (cardId: string, propertyId: string, optionId: string | null) => Promise<void>;
  onUpdatePropertyConfig: (propertyId: string, config: PropertyConfig) => Promise<void>;
  onDeleteOption: (propertyId: string, optionId: string, deleteCards?: boolean) => Promise<void>;
  onCreateCardInColumn: (propertyId: string | null, optionId: string | null) => Promise<void>;
  onOpenCardInSidePanel: (cardId: string) => void;
  onAddCardToWhiteboard: (cardId: string) => void;
  onUnassignCard: (cardId: string, e: React.MouseEvent) => void;
  onUnassignHighlight: (highlightId: string, e: React.MouseEvent) => void;
  onOpenDocument?: (documentId: string, highlightId?: string) => void;
}

export function TagDatabaseKanban({
  selectedTag,
  taggedCards,
  taggedHighlights,
  properties,
  propertyValues,
  onSelectGroupByProperty,
  onCreateSelectProperty,
  onChangeCardOption,
  onUpdatePropertyConfig,
  onDeleteOption,
  onCreateCardInColumn,
  onOpenCardInSidePanel,
  onAddCardToWhiteboard,
  onUnassignCard,
  onUnassignHighlight,
  onOpenDocument,
}: TagDatabaseKanbanProps) {
  const selectProperties = useMemo(
    () => properties.filter((p) => p.type === 'select'),
    [properties]
  );

  const activeGroupProp = useMemo(() => {
    if (selectedTag.kanban_group_by_property_id) {
      const found = selectProperties.find((p) => p.id === selectedTag.kanban_group_by_property_id);
      if (found) return found;
    }
    return selectProperties[0] ?? null;
  }, [selectProperties, selectedTag.kanban_group_by_property_id]);

  const [openColMenuId, setOpenColMenuId] = useState<string | null>(null);
  const [renamingOptId, setRenamingOptId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [isAddingCol, setIsAddingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  const activeConfig = useMemo(
    () => (activeGroupProp ? parsePropertyConfig(activeGroupProp.config_json) : {}),
    [activeGroupProp]
  );
  const options = activeConfig.options ?? [];

  const cardOptionMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!activeGroupProp) return map;
    for (const v of propertyValues) {
      if (v.property_id === activeGroupProp.id) {
        const parsed = parsePropertyValueJson(v.value_json);
        if (typeof parsed === 'string') {
          map.set(v.card_id, parsed);
        }
      }
    }
    return map;
  }, [propertyValues, activeGroupProp]);

  const handleCreateOptionColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupProp) return;
    const trimmed = newColName.trim();
    if (!trimmed) {
      setIsAddingCol(false);
      return;
    }
    const newOpt: PropertyOption = {
      id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name: trimmed,
      color: pickRandomOptionColor(),
    };
    await onUpdatePropertyConfig(activeGroupProp.id, {
      ...activeConfig,
      options: [...options, newOpt],
    });
    setNewColName('');
    setIsAddingCol(false);
  };

  const handleRenameOption = async (optId: string) => {
    if (!activeGroupProp) return;
    const trimmed = renameDraft.trim();
    setRenamingOptId(null);
    if (!trimmed) return;
    const nextOptions = options.map((o) => (o.id === optId ? { ...o, name: trimmed } : o));
    await onUpdatePropertyConfig(activeGroupProp.id, { ...activeConfig, options: nextOptions });
  };

  const handleChangeOptionColor = async (optId: string, color: OptionColor) => {
    if (!activeGroupProp) return;
    const nextOptions = options.map((o) => (o.id === optId ? { ...o, color } : o));
    await onUpdatePropertyConfig(activeGroupProp.id, { ...activeConfig, options: nextOptions });
  };

  if (!activeGroupProp) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="w-11 h-11 rounded-xl bg-background-secondary border border-border-grid flex items-center justify-center mb-3 shadow-card">
          <CircleDot size={18} className="text-middle-grey" />
        </div>
        <h3 className="text-[14px] font-semibold text-text-color">
          Kanban view requires a Select property
        </h3>
        <p className="text-[12px] text-middle-grey mt-1 max-w-sm">
          Create a Select property (e.g. Status) on #{selectedTag.name} to group cards into Kanban columns.
        </p>
        <button
          type="button"
          onClick={onCreateSelectProperty}
          className="mt-4 px-3.5 py-1.5 rounded-md bg-active-item text-white hover:brightness-105 text-[12px] font-medium flex items-center gap-1.5 transition cursor-pointer"
        >
          <Plus size={13} />
          <span>Create Status property</span>
        </button>
      </div>
    );
  }

  const columns: Array<{
    id: string;
    option: PropertyOption | null;
    cards: Card[];
    highlights: HighlightJoinedRow[];
  }> = [
    {
      id: '__none__',
      option: null,
      cards: taggedCards.filter((c) => {
        const optId = cardOptionMap.get(c.id);
        return !optId || !options.some((o) => o.id === optId);
      }),
      highlights: taggedHighlights.filter((h) => {
        const optId = cardOptionMap.get(h.id);
        return !optId || !options.some((o) => o.id === optId);
      }),
    },
    ...options.map((opt) => ({
      id: opt.id,
      option: opt,
      cards: taggedCards.filter((c) => cardOptionMap.get(c.id) === opt.id),
      highlights: taggedHighlights.filter((h) => cardOptionMap.get(h.id) === opt.id),
    })),
  ];

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      onClick={() => setOpenColMenuId(null)}
    >
      <div className="px-5 py-2 border-b border-light-grey/70 bg-background-secondary/30 flex items-center gap-2 text-[12px]">
        <span className="text-middle-grey">Group by:</span>
        <select
          value={activeGroupProp.id}
          onChange={(e) => onSelectGroupByProperty(e.target.value)}
          className="px-2 py-1 rounded-md bg-background-primary border border-light-grey text-text-color font-medium outline-none cursor-pointer"
        >
          {selectProperties.map((sp) => (
            <option key={sp.id} value={sp.id}>
              {sp.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-x-auto p-4 flex items-start gap-3.5">
        {columns.map((col) => {
          const isNone = col.option === null;
          const colBg = isNone ? 'var(--light-grey)' : resolveOptionCssVar(col.option!.color);
          const isDragOver = dragOverColId === col.id;
          const isMenuOpen = openColMenuId === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverColId(col.id);
              }}
              onDragLeave={() => {
                if (dragOverColId === col.id) setDragOverColId(null);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setDragOverColId(null);
                if (!draggedCardId) return;
                const targetOptId = isNone ? null : col.option!.id;
                await onChangeCardOption(draggedCardId, activeGroupProp.id, targetOptId);
                setDraggedCardId(null);
              }}
              className={`w-[276px] shrink-0 flex flex-col rounded-lg border transition max-h-full ${
                isDragOver ? 'border-active-item ring-2 ring-active-item/30' : 'border-light-grey/60'
              }`}
              style={{ backgroundColor: colBg }}
            >
              <div className="relative px-2.5 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {renamingOptId === col.id && col.option ? (
                    <input
                      type="text"
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRenameOption(col.option!.id);
                        } else if (e.key === 'Escape') {
                          setRenamingOptId(null);
                        }
                      }}
                      onBlur={() => handleRenameOption(col.option!.id)}
                      className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-background-primary border border-active-item text-[12.5px] font-semibold text-text-color outline-none"
                    />
                  ) : (
                    <span className="text-[13px] font-semibold text-text-color truncate">
                      {isNone ? `No ${activeGroupProp.name}` : col.option!.name}
                    </span>
                  )}
                  <span className="px-1.5 py-0.2 rounded-full bg-background-primary/70 text-[11px] font-medium text-middle-hard-grey shrink-0">
                    {col.cards.length + col.highlights.length}
                  </span>
                </div>

                {!isNone && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenColMenuId(isMenuOpen ? null : col.id);
                    }}
                    className="p-1 rounded hover:bg-background-primary/60 text-middle-hard-grey hover:text-text-color cursor-pointer shrink-0"
                    aria-label="Column options"
                  >
                    <MoreHorizontal size={13} />
                  </button>
                )}

                {isMenuOpen && col.option && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-2 top-9 w-52 p-1.5 rounded-lg bg-menu-texture-bg-medium backdrop-blur-2xl border border-light-grey shadow-main z-40 text-[12px]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setOpenColMenuId(null);
                        setRenamingOptId(col.option!.id);
                        setRenameDraft(col.option!.name);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-text-color cursor-pointer"
                    >
                      <Edit3 size={12} />
                      <span>Rename</span>
                    </button>

                    <div className="my-1 border-t border-light-grey" />
                    <div className="px-2 py-1 text-[10.5px] font-medium text-middle-grey uppercase tracking-wider">
                      Colors
                    </div>
                    <div className="flex items-center gap-1.5 px-2 pb-1.5 flex-wrap">
                      {HEPTA_OPTION_PALETTE.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleChangeOptionColor(col.option!.id, c.id)}
                          className={`w-4 h-4 rounded-full border cursor-pointer ${
                            col.option!.color === c.id
                              ? 'border-active-item scale-110 ring-1 ring-active-item'
                              : 'border-light-grey'
                          }`}
                          style={{ backgroundColor: resolveOptionCssVar(c.id) }}
                          title={c.label}
                        />
                      ))}
                    </div>

                    <div className="my-1 border-t border-light-grey" />
                    <button
                      type="button"
                      onClick={() => {
                        setOpenColMenuId(null);
                        onDeleteOption(activeGroupProp.id, col.option!.id, false);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-danger-item/10 text-danger-item cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>Delete option</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-1.5 pb-1.5 space-y-1.5">
                {col.cards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => setDraggedCardId(card.id)}
                    onDragEnd={() => {
                      setDraggedCardId(null);
                      setDragOverColId(null);
                    }}
                    onClick={() => onOpenCardInSidePanel(card.id)}
                    className="group p-2.5 rounded-md border border-border-grid hover:border-active-item/60 shadow-card cursor-pointer transition flex flex-col justify-between"
                    style={{ backgroundColor: resolveCardBgColor(card.color) }}
                  >
                    <div className="flex items-start justify-between gap-1.5 mb-1">
                      <h4 className="text-[12.5px] font-semibold text-text-color truncate group-hover:text-active-item">
                        {card.title || 'Untitled'}
                      </h4>
                      <button
                        type="button"
                        onClick={(e) => onUnassignCard(card.id, e)}
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer shrink-0"
                        title="Remove tag"
                      >
                        <X size={11} />
                      </button>
                    </div>
                    {card.content_text && (
                      <p className="text-[11.5px] text-middle-hard-grey line-clamp-2 leading-relaxed">
                        {card.content_text}
                      </p>
                    )}
                    <div className="pt-2 mt-2 border-t border-light-grey/50 flex items-center justify-between text-[10.5px] text-middle-grey">
                      <span>{new Date(card.updated_at).toLocaleDateString()}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddCardToWhiteboard(card.id);
                        }}
                        className="px-1.5 py-0.5 rounded bg-background-primary/80 border border-light-grey hover:border-active-item text-[10px] cursor-pointer"
                      >
                        + Board
                      </button>
                    </div>
                  </div>
                ))}

                {col.highlights.map((hl) => {
                  const accentColor = getAnnotationCssVar(hl.color);
                  return (
                    <div
                      key={hl.id}
                      draggable
                      onDragStart={() => setDraggedCardId(hl.id)}
                      onDragEnd={() => {
                        setDraggedCardId(null);
                        setDragOverColId(null);
                      }}
                      onClick={() => {
                        if (hl.source_id) onOpenDocument?.(hl.source_id, hl.id);
                      }}
                      className="group p-2.5 rounded-md bg-background-primary border border-border-grid hover:border-active-item/60 shadow-card transition cursor-pointer space-y-1.5"
                      style={{
                        borderLeftWidth: 3,
                        borderLeftColor: accentColor,
                      }}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1 text-[10.5px] font-medium text-middle-grey truncate">
                          <Highlighter size={10} className="shrink-0" style={{ color: accentColor }} />
                          <span className="truncate">
                            {hl.doc_title || hl.source_type.toUpperCase()}
                            {hl.page_number ? ` · P.${hl.page_number}` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => onUnassignHighlight(hl.id, e)}
                          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer shrink-0"
                          title="Remove tag"
                        >
                          <X size={11} />
                        </button>
                      </div>
                      <p className="text-[11.5px] text-text-color line-clamp-2 leading-relaxed">
                        {hl.text_content || '(Area highlight)'}
                      </p>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() =>
                    onCreateCardInColumn(activeGroupProp.id, isNone ? null : col.option!.id)
                  }
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] text-middle-hard-grey hover:text-text-color hover:bg-background-primary/50 transition cursor-pointer"
                >
                  <Plus size={13} />
                  <span>New card</span>
                </button>
              </div>
            </div>
          );
        })}

        <div className="w-60 shrink-0">
          {isAddingCol ? (
            <form
              onSubmit={handleCreateOptionColumn}
              className="p-2 rounded-lg bg-background-secondary border border-light-grey space-y-2"
            >
              <input
                type="text"
                autoFocus
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsAddingCol(false);
                    setNewColName('');
                  }
                }}
                placeholder="Option name..."
                className="w-full px-2 py-1 rounded bg-background-primary border border-active-item text-[12.5px] text-text-color outline-none"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded bg-active-item text-white text-[11.5px] font-medium cursor-pointer"
                >
                  Add column
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingCol(false);
                    setNewColName('');
                  }}
                  className="px-2 py-1 rounded text-[11.5px] text-middle-grey hover:text-text-color cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingCol(true)}
              className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-light-grey hover:border-active-item text-[12.5px] text-middle-grey hover:text-text-color transition cursor-pointer"
            >
              <Plus size={14} />
              <span>Add column</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}