import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Hash, Plus, X, Clock, FileText } from 'lucide-react';
import type {
  Card,
  CardPropertyValue,
  CreatePropertyInput,
  PropertyConfig,
  PropertyType,
  Tag,
  TagPropertyJoined,
  TagWithCountRow,
} from '../../../../shared/types';
import { PROPERTY_TYPE_LIST, PropertyTypeIcon } from './PropertyHelpers';
import { PropertyValueEditor } from './PropertyValueEditor';

export interface CardTagsPropertiesBarProps {
  card: Card;
  allCards?: Card[];
  showProperties?: boolean;
  compact?: boolean;
  onTagsChanged?: () => void;
  loadCardTags?: (cardId: string) => Promise<Tag[]>;
  loadAllTags?: () => Promise<Array<Tag | TagWithCountRow>>;
  addCardTag?: (cardId: string, tagName: string) => Promise<Tag>;
  removeCardTag?: (cardId: string, tagId: string) => Promise<void>;
  loadCardProperties?: (cardId: string) => Promise<TagPropertyJoined[]>;
  loadCardPropertyValues?: (cardId: string) => Promise<CardPropertyValue[]>;
  setCardPropertyValue?: (cardId: string, propertyId: string, valueJson: string) => Promise<void>;
  clearCardPropertyValue?: (cardId: string, propertyId: string) => Promise<void>;
  updatePropertyConfig?: (propertyId: string, config: PropertyConfig) => Promise<void>;
  deletePropertyOption?: (propertyId: string, optionId: string) => Promise<void>;
  createPropertyForTag?: (input: CreatePropertyInput) => Promise<TagPropertyJoined>;
  onOpenCard?: (cardId: string) => void;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CardTagsPropertiesBar({
  card,
  allCards = [],
  showProperties = true,
  compact = false,
  onTagsChanged,
  loadCardTags,
  loadAllTags,
  addCardTag,
  removeCardTag,
  loadCardProperties,
  loadCardPropertyValues,
  setCardPropertyValue,
  clearCardPropertyValue,
  updatePropertyConfig,
  deletePropertyOption,
  createPropertyForTag,
  onOpenCard,
}: CardTagsPropertiesBarProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [properties, setProperties] = useState<TagPropertyJoined[]>([]);
  const [valuesMap, setValuesMap] = useState<Record<string, string>>({});
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [isAddingProp, setIsAddingProp] = useState(false);
  const [newPropName, setNewPropName] = useState('');
  const [newPropType, setNewPropType] = useState<PropertyType>('text');
  const [newPropTagId, setNewPropTagId] = useState<string>('');

  const tagWrapperRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      const [cardTagRows, allTagRows, propRows, valueRows] = await Promise.all([
        loadCardTags ? loadCardTags(card.id) : Promise.resolve([]),
        loadAllTags ? loadAllTags() : Promise.resolve([]),
        loadCardProperties ? loadCardProperties(card.id) : Promise.resolve([]),
        loadCardPropertyValues ? loadCardPropertyValues(card.id) : Promise.resolve([]),
      ]);
      const safeTags = cardTagRows || [];
      setTags(safeTags);
      setAllTags(allTagRows || []);
      setProperties(propRows || []);
      const nextMap: Record<string, string> = {};
      for (const v of valueRows || []) {
        nextMap[v.property_id] = v.value_json;
      }
      setValuesMap(nextMap);
      if (safeTags.length > 0) {
        setNewPropTagId((prev) => (safeTags.some((t) => t.id === prev) ? prev : safeTags[0].id));
      } else {
        setNewPropTagId('');
      }
    } catch {
      setTags([]);
    }
  }, [
    card.id,
    loadCardTags,
    loadAllTags,
    loadCardProperties,
    loadCardPropertyValues,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isAddingTag) return;
    const handleOutside = (e: MouseEvent) => {
      if (tagWrapperRef.current && !tagWrapperRef.current.contains(e.target as Node)) {
        setIsAddingTag(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [isAddingTag]);

  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    return allTags
      .filter((at) => !tags.some((t) => t.id === at.id))
      .filter((at) => !q || at.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allTags, tags, tagInput]);

  const handleAdoptTagName = async (rawName: string) => {
    const trimmed = rawName.trim().replace(/^#/, '');
    if (!trimmed || !addCardTag) return;
    await addCardTag(card.id, trimmed);
    setTagInput('');
    setIsAddingTag(false);
    await loadData();
    onTagsChanged?.();
  };

  const handleRemoveTag = async (tagId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!removeCardTag) return;
    await removeCardTag(card.id, tagId);
    await loadData();
    onTagsChanged?.();
  };

  const handleChangeValue = async (propertyId: string, nextValueJson: string | null) => {
    if (nextValueJson === null) {
      setValuesMap((prev) => {
        const copy = { ...prev };
        delete copy[propertyId];
        return copy;
      });
      await clearCardPropertyValue?.(card.id, propertyId);
    } else {
      setValuesMap((prev) => ({ ...prev, [propertyId]: nextValueJson }));
      await setCardPropertyValue?.(card.id, propertyId, nextValueJson);
    }
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetTagId = newPropTagId || tags[0]?.id;
    const trimmed = newPropName.trim();
    if (!targetTagId || !trimmed || !createPropertyForTag) return;
    await createPropertyForTag({
      tagId: targetTagId,
      name: trimmed,
      type: newPropType,
      config: newPropType === 'select' || newPropType === 'multiSelect' ? { options: [] } : {},
    });
    setNewPropName('');
    setIsAddingProp(false);
    await loadData();
  };

  const charCount = card.content_text?.length || 0;
  const wordCount = card.content_text?.trim() ? card.content_text.trim().split(/\s+/).length : 0;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      <div className="flex flex-wrap items-center gap-1.5" ref={tagWrapperRef}>
        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-ultra-light-grey border border-light-grey text-[11.5px] font-medium text-text-color"
          >
            <Hash size={10} style={{ color: t.color || 'var(--active-item)' }} className="shrink-0" />
            <span>{t.name}</span>
            <button
              type="button"
              onClick={(e) => handleRemoveTag(t.id, e)}
              className="text-middle-grey hover:text-danger-item transition cursor-pointer"
              title="Remove tag"
            >
              <X size={10} />
            </button>
          </span>
        ))}

        <div className="relative">
          {isAddingTag ? (
            <div>
              <input
                type="text"
                autoFocus
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsAddingTag(false);
                    setTagInput('');
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (tagInput.trim()) handleAdoptTagName(tagInput);
                  }
                }}
                placeholder="Add tag..."
                className="w-36 px-2 py-0.5 rounded-md bg-background-primary border border-active-item text-[11.5px] text-text-color placeholder:text-middle-grey outline-none"
              />
              {(suggestions.length > 0 || tagInput.trim().length > 0) && (
                <div className="absolute left-0 top-7 w-52 p-1 rounded-lg bg-menu-texture-bg-medium backdrop-blur-2xl border border-light-grey shadow-main z-50 text-[12px]">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleAdoptTagName(s.name)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-light-grey text-text-color flex items-center gap-1.5 cursor-pointer"
                    >
                      <Hash size={11} style={{ color: s.color || 'var(--middle-grey)' }} />
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
                  {tagInput.trim() &&
                    suggestions.every(
                      (s) => s.name.toLowerCase() !== tagInput.trim().toLowerCase()
                    ) && (
                      <button
                        type="button"
                        onClick={() => handleAdoptTagName(tagInput)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-light-grey text-active-item font-medium flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus size={12} />
                        <span className="truncate">Create #{tagInput.trim().replace(/^#/, '')}</span>
                      </button>
                    )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingTag(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] text-middle-grey hover:text-text-color hover:bg-ultra-light-grey transition cursor-pointer"
            >
              <Plus size={11} />
              <span>Add tag</span>
            </button>
          )}
        </div>
      </div>

      {showProperties && (
        <div className="pt-2 border-t border-light-grey/70 space-y-1.5 text-[11.5px]">
          {properties.length > 0 && (
            <div className="space-y-1">
              {properties.map((prop) => (
                <div
                  key={prop.id}
                  className="flex items-center gap-2 py-0.5 min-h-[26px]"
                >
                  <div className="flex items-center gap-1.5 w-32 shrink-0 text-middle-hard-grey truncate">
                    <PropertyTypeIcon type={prop.type} size={12} />
                    <span className="truncate" title={prop.name}>
                      {prop.name}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <PropertyValueEditor
                      property={prop}
                      valueJson={valuesMap[prop.id] ?? null}
                      allCards={allCards}
                      compact
                      wrap
                      onChangeValue={(nextVal) => handleChangeValue(prop.id, nextVal)}
                      onUpdatePropertyConfig={
                        updatePropertyConfig
                          ? async (pId, cfg) => {
                              await updatePropertyConfig(pId, cfg);
                              await loadData();
                            }
                          : undefined
                      }
                      onDeleteOption={
                        deletePropertyOption
                          ? async (pId, optId) => {
                              await deletePropertyOption(pId, optId);
                              await loadData();
                            }
                          : undefined
                      }
                      onOpenCard={onOpenCard}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {createPropertyForTag && tags.length > 0 && (
            <div>
              {isAddingProp ? (
                <form
                  onSubmit={handleCreateProperty}
                  className="flex flex-wrap items-center gap-1.5 pt-1"
                >
                  <input
                    type="text"
                    autoFocus
                    value={newPropName}
                    onChange={(e) => setNewPropName(e.target.value)}
                    placeholder="Property name..."
                    className="w-28 px-2 py-0.5 rounded bg-background-primary border border-light-grey focus:border-active-item text-text-color outline-none"
                  />
                  <select
                    value={newPropType}
                    onChange={(e) => setNewPropType(e.target.value as PropertyType)}
                    className="px-1.5 py-0.5 rounded bg-background-primary border border-light-grey text-text-color outline-none text-[11.5px]"
                  >
                    {PROPERTY_TYPE_LIST.filter((t) => t.type !== 'relation').map((item) => (
                      <option key={item.type} value={item.type}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {tags.length > 1 && (
                    <select
                      value={newPropTagId}
                      onChange={(e) => setNewPropTagId(e.target.value)}
                      className="px-1.5 py-0.5 rounded bg-background-primary border border-light-grey text-text-color outline-none text-[11.5px] max-w-[100px]"
                    >
                      {tags.map((t) => (
                        <option key={t.id} value={t.id}>
                          #{t.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="submit"
                    className="px-2 py-0.5 rounded bg-active-item text-white text-[11px] font-medium cursor-pointer"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingProp(false)}
                    className="px-1.5 py-0.5 rounded text-middle-grey hover:text-text-color cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingProp(true)}
                  className="inline-flex items-center gap-1 text-middle-grey hover:text-text-color transition cursor-pointer py-0.5"
                >
                  <Plus size={11} />
                  <span>Add property</span>
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-middle-grey text-[11px]">
            <span className="inline-flex items-center gap-1">
              <Clock size={11} />
              Created {formatDateTime(card.created_at)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={11} />
              Updated {formatDateTime(card.updated_at)}
            </span>
            <span className="inline-flex items-center gap-1">
              <FileText size={11} />
              {wordCount} words · {charCount} chars
            </span>
          </div>
        </div>
      )}
    </div>
  );
}