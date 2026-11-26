import React, { useState } from 'react';
import {
  ArrowUpDown,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  Hash,
  Highlighter,
  PanelRightOpen,
  Plus,
  Trash2,
  Unlink,
  WrapText,
  X,
} from 'lucide-react';
import type {
  AnnotationColor,
  Card,
  CardPropertyValue,
  PropertyConfig,
  PropertyType,
  TagPropertyJoined,
  TagWithCountRow,
} from '../../../../shared/types';
import { getAnnotationCssVar } from '../../../../shared/palette';
import {
  PROPERTY_TYPE_LIST,
  PropertyTypeIcon,
  PropertyValueEditor,
  parsePropertyConfig,
} from '../../primitives/card-metadata';

export interface UnifiedTagItem {
  id: string;
  type: 'card' | 'highlight';
  title: string;
  content: string;
  docTitle?: string | null;
  docId?: string;
  pageNumber?: number | null;
  color?: string | null;
  highlightType?: 'text' | 'area';
  imageReferenceId?: string | null;
  noteText?: string | null;
  updatedAt: number;
}

export interface TagDatabaseTableProps {
  selectedTag: TagWithCountRow;
  allTags: TagWithCountRow[];
  allCards: Card[];
  items: UnifiedTagItem[];
  properties: TagPropertyJoined[];
  allWorkspaceProperties: TagPropertyJoined[];
  propertyValues: CardPropertyValue[];
  allCardTagsMap: Record<string, string[]>;
  sortField: 'title' | 'date';
  onToggleSort: (field: 'title' | 'date') => void;
  onRowClick: (item: UnifiedTagItem) => void;
  onUnassignCard: (cardId: string, e: React.MouseEvent) => void;
  onUnassignHighlight: (highlightId: string, e: React.MouseEvent) => void;
  onCreateProperty: (
    type: PropertyType,
    name: string,
    config?: PropertyConfig
  ) => Promise<void>;
  onAttachProperty: (propertyId: string) => Promise<void>;
  onDetachProperty: (propertyId: string) => Promise<void>;
  onDeleteProperty: (propertyId: string) => Promise<void>;
  onRenameProperty: (property: TagPropertyJoined) => Promise<void>;
  onToggleWrapProperty: (property: TagPropertyJoined) => Promise<void>;
  onToggleHideProperty: (property: TagPropertyJoined) => Promise<void>;
  onChangeCellValue: (cardId: string, propertyId: string, valueJson: string | null) => Promise<void>;
  onUpdatePropertyConfig: (propertyId: string, config: PropertyConfig) => Promise<void>;
  onDeleteOption: (propertyId: string, optionId: string) => Promise<void>;
  onOpenCard: (cardId: string) => void;
}

export function TagDatabaseTable({
  selectedTag,
  allTags,
  allCards,
  items,
  properties,
  allWorkspaceProperties,
  propertyValues,
  allCardTagsMap,
  sortField,
  onToggleSort,
  onRowClick,
  onUnassignCard,
  onUnassignHighlight,
  onCreateProperty,
  onAttachProperty,
  onDetachProperty,
  onDeleteProperty,
  onRenameProperty,
  onToggleWrapProperty,
  onToggleHideProperty,
  onChangeCellValue,
  onUpdatePropertyConfig,
  onDeleteOption,
  onOpenCard,
}: TagDatabaseTableProps) {
  const [showAddPropMenu, setShowAddPropMenu] = useState(false);
  const [showTypeSubmenu, setShowTypeSubmenu] = useState(false);
  const [pickingRelationTag, setPickingRelationTag] = useState(false);
  const [activeColumnMenuId, setActiveColumnMenuId] = useState<string | null>(null);

  const visibleProps = properties.filter((p) => p.is_hidden !== 1);
  const hiddenProps = properties.filter((p) => p.is_hidden === 1);
  const otherProps = allWorkspaceProperties.filter(
    (wp) => !properties.some((p) => p.id === wp.id)
  );

  const valueLookup = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const v of propertyValues) {
      map.set(`${v.card_id}#${v.property_id}`, v.value_json);
    }
    return map;
  }, [propertyValues]);

  const handleSelectPropertyType = async (type: PropertyType, label: string) => {
    if (type === 'relation') {
      setPickingRelationTag(true);
      return;
    }
    const sameTypeCount = properties.filter((p) => p.type === type).length;
    const defaultName = sameTypeCount === 0 ? label : `${label} ${sameTypeCount + 1}`;
    const config: PropertyConfig =
      type === 'select' || type === 'multiSelect' ? { options: [] } : {};
    setShowAddPropMenu(false);
    setShowTypeSubmenu(false);
    await onCreateProperty(type, defaultName, config);
  };

  const handlePickRelationTargetTag = async (targetTag: TagWithCountRow) => {
    setPickingRelationTag(false);
    setShowAddPropMenu(false);
    setShowTypeSubmenu(false);
    await onCreateProperty('relation', targetTag.name, { tagId: targetTag.id });
  };

  return (
    <div
      className="flex-1 overflow-x-auto overflow-y-auto"
      onClick={() => {
        setShowAddPropMenu(false);
        setShowTypeSubmenu(false);
        setPickingRelationTag(false);
        setActiveColumnMenuId(null);
      }}
    >
      <table className="w-full min-w-[680px] border-collapse text-left text-[12.5px]">
        <thead className="sticky top-0 bg-background-secondary/95 backdrop-blur border-b border-light-grey text-[11px] font-semibold text-middle-grey select-none z-20">
          <tr>
            <th
              className="py-2.5 px-4 min-w-[220px] cursor-pointer hover:text-text-color transition uppercase tracking-wider border-r border-light-grey/60"
              onClick={() => onToggleSort('title')}
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span>Title</span>
                <ArrowUpDown
                  size={11}
                  className={sortField === 'title' ? 'text-active-item' : 'opacity-40'}
                />
              </div>
            </th>

            <th className="py-2.5 px-3 w-24 whitespace-nowrap uppercase tracking-wider border-r border-light-grey/60">
              Type
            </th>

            {visibleProps.map((prop) => {
              const isMenuOpen = activeColumnMenuId === prop.id;
              return (
                <th
                  key={prop.id}
                  style={{ minWidth: `${prop.width || 160}px` }}
                  className="relative py-2.5 px-3 whitespace-nowrap border-r border-light-grey/60"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveColumnMenuId(isMenuOpen ? null : prop.id);
                      setShowAddPropMenu(false);
                    }}
                    className="w-full flex items-center gap-1.5 text-left text-[11.5px] font-semibold text-middle-hard-grey hover:text-text-color cursor-pointer"
                  >
                    <PropertyTypeIcon type={prop.type} size={12} />
                    <span className="truncate">{prop.name}</span>
                  </button>

                  {isMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-9 w-48 p-1 rounded-lg bg-menu-texture-bg-medium backdrop-blur-2xl border border-light-grey shadow-main z-40 text-[12px] font-normal text-text-color"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveColumnMenuId(null);
                          onRenameProperty(prop);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey cursor-pointer"
                      >
                        <Edit3 size={12} className="text-middle-hard-grey" />
                        <span>Rename</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveColumnMenuId(null);
                          onToggleWrapProperty(prop);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-light-grey cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <WrapText size={12} className="text-middle-hard-grey" />
                          <span>Wrap column</span>
                        </span>
                        <span className="text-[10.5px] text-middle-grey">
                          {prop.should_wrap ? 'On' : 'Off'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveColumnMenuId(null);
                          onToggleHideProperty(prop);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey cursor-pointer"
                      >
                        <EyeOff size={12} className="text-middle-hard-grey" />
                        <span>Hide column</span>
                      </button>

                      <div className="my-1 border-t border-light-grey" />

                      <button
                        type="button"
                        onClick={() => {
                          setActiveColumnMenuId(null);
                          onDetachProperty(prop.id);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-middle-hard-grey cursor-pointer"
                      >
                        <Unlink size={12} />
                        <span>Remove from #{selectedTag.name}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveColumnMenuId(null);
                          onDeleteProperty(prop.id);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-danger-item/10 text-danger-item cursor-pointer"
                      >
                        <Trash2 size={12} />
                        <span>Delete property</span>
                      </button>
                    </div>
                  )}
                </th>
              );
            })}

            <th className="relative py-2 px-2 w-10 border-r border-light-grey/60">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddPropMenu((v) => !v);
                  setShowTypeSubmenu(false);
                  setPickingRelationTag(false);
                  setActiveColumnMenuId(null);
                }}
                className="p-1 rounded hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer"
                title="Add property"
                aria-label="Add property"
              >
                <Plus size={14} />
              </button>

              {showAddPropMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-9 w-60 p-1 rounded-lg bg-menu-texture-bg-medium backdrop-blur-2xl border border-light-grey shadow-main z-40 text-[12px] font-normal text-text-color"
                >
                  {pickingRelationTag ? (
                    <div>
                      <div className="px-2 py-1.5 text-[11px] font-semibold text-middle-grey uppercase tracking-wider flex items-center justify-between">
                        <span>Target Tag Database</span>
                        <button
                          type="button"
                          onClick={() => setPickingRelationTag(false)}
                          className="text-middle-grey hover:text-text-color cursor-pointer"
                        >
                          Back
                        </button>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-0.5">
                        {allTags.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handlePickRelationTargetTag(t)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-left cursor-pointer"
                          >
                            <Hash size={12} style={{ color: t.color || 'var(--active-item)' }} />
                            <span className="truncate">{t.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : hiddenProps.length === 0 && otherProps.length === 0 ? (
                    <div>
                      <div className="px-2 py-1 text-[11px] font-semibold text-middle-grey uppercase tracking-wider">
                        Select property type
                      </div>
                      {PROPERTY_TYPE_LIST.map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => handleSelectPropertyType(item.type, item.label)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-left cursor-pointer"
                        >
                          <PropertyTypeIcon type={item.type} size={13} />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowTypeSubmenu((v) => !v)}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-left cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <Plus size={13} className="text-middle-hard-grey" />
                            <span>Create new property</span>
                          </span>
                          <ChevronRight size={13} className="text-middle-grey" />
                        </button>

                        {showTypeSubmenu && (
                          <div className="mt-1 pl-2 border-l border-light-grey space-y-0.5">
                            {PROPERTY_TYPE_LIST.map((item) => (
                              <button
                                key={item.type}
                                type="button"
                                onClick={() => handleSelectPropertyType(item.type, item.label)}
                                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-light-grey text-left cursor-pointer"
                              >
                                <PropertyTypeIcon type={item.type} size={12} />
                                <span>{item.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {hiddenProps.length > 0 && (
                        <>
                          <div className="my-1 border-t border-light-grey" />
                          <div className="px-2 py-1 text-[10.5px] font-medium text-middle-grey uppercase tracking-wider">
                            Hidden properties
                          </div>
                          {hiddenProps.map((hp) => (
                            <button
                              key={hp.id}
                              type="button"
                              onClick={() => {
                                setShowAddPropMenu(false);
                                onToggleHideProperty(hp);
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-left cursor-pointer"
                            >
                              <Eye size={12} className="text-middle-grey" />
                              <span className="truncate">{hp.name}</span>
                            </button>
                          ))}
                        </>
                      )}

                      {otherProps.length > 0 && (
                        <>
                          <div className="my-1 border-t border-light-grey" />
                          <div className="px-2 py-1 text-[10.5px] font-medium text-middle-grey uppercase tracking-wider">
                            Other properties ({otherProps.length})
                          </div>
                          <div className="max-h-44 overflow-y-auto space-y-0.5">
                            {otherProps.map((op) => (
                              <button
                                key={op.id}
                                type="button"
                                onClick={() => {
                                  setShowAddPropMenu(false);
                                  onAttachProperty(op.id);
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-left cursor-pointer"
                              >
                                <PropertyTypeIcon type={op.type} size={12} />
                                <span className="truncate">{op.name}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </th>

            <th
              className="py-2.5 px-3 w-28 cursor-pointer hover:text-text-color transition whitespace-nowrap uppercase tracking-wider border-r border-light-grey/60"
              onClick={() => onToggleSort('date')}
            >
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span>Updated</span>
                <ArrowUpDown
                  size={11}
                  className={sortField === 'date' ? 'text-active-item' : 'opacity-40'}
                />
              </div>
            </th>

            <th className="py-2.5 px-4 w-20 text-right whitespace-nowrap uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-light-grey/60">
          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => onRowClick(item)}
              className="group hover:bg-hover/70 cursor-pointer transition"
            >
              <td className="py-2 px-4 max-w-xs min-w-0 border-r border-light-grey/40">
                <div className="flex items-center gap-2 min-w-0">
                  {item.type === 'card' ? (
                    <FileText size={14} className="text-middle-grey shrink-0" />
                  ) : (
                    <Highlighter
                      size={14}
                      className="shrink-0"
                      style={{
                        color: getAnnotationCssVar((item.color as AnnotationColor) || 'yellow'),
                      }}
                    />
                  )}
                  <span className="font-medium text-text-color truncate block">{item.title}</span>
                </div>
              </td>

              <td className="py-2 px-3 whitespace-nowrap border-r border-light-grey/40">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${item.type === 'card'
                      ? 'bg-middle-transparent-blue text-active-item'
                      : 'bg-tag/15 text-tag'
                    }`}
                >
                  {item.type === 'card' ? 'Card' : 'Highlight'}
                </span>
              </td>

              {visibleProps.map((prop) => {
                const cellVal = valueLookup.get(`${item.id}#${prop.id}`) ?? null;
                const config = parsePropertyConfig(prop.config_json);
                const relationTargetCards =
                  prop.type === 'relation' && config.tagId
                    ? allCards.filter((c) => (allCardTagsMap[c.id] ?? []).includes(config.tagId!))
                    : undefined;

                return (
                  <td
                    key={prop.id}
                    className="py-1.5 px-2 border-r border-light-grey/40 align-middle"
                  >
                    <PropertyValueEditor
                      property={prop}
                      valueJson={cellVal}
                      allCards={allCards}
                      relationTargetCards={relationTargetCards}
                      wrap={prop.should_wrap === 1}
                      onChangeValue={(nextVal) => onChangeCellValue(item.id, prop.id, nextVal)}
                      onUpdatePropertyConfig={onUpdatePropertyConfig}
                      onDeleteOption={onDeleteOption}
                      onOpenCard={onOpenCard}
                    />
                  </td>
                );
              })}

              <td className="border-r border-light-grey/40" />

              <td className="py-2 px-3 text-middle-grey text-[11.5px] tabular-nums whitespace-nowrap border-r border-light-grey/40">
                {new Date(item.updatedAt).toLocaleDateString()}
              </td>

              <td className="py-2 px-4 text-right whitespace-nowrap">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRowClick(item);
                    }}
                    className="p-1 rounded hover:bg-light-grey text-middle-hard-grey cursor-pointer"
                    title="Open in side panel"
                    aria-label="Open in side panel"
                  >
                    <PanelRightOpen size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      if (item.type === 'card') {
                        onUnassignCard(item.id, e);
                      } else {
                        onUnassignHighlight(item.id, e);
                      }
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-danger-item/15 text-middle-grey hover:text-danger-item transition cursor-pointer"
                    title="Remove tag"
                    aria-label="Remove tag"
                  >
                    <X size={13} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}