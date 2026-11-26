import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Check,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Card,
  OptionColor,
  PropertyConfig,
  PropertyOption,
  TagProperty,
} from '../../../../shared/types';
import {
  HEPTA_OPTION_PALETTE,
  pickRandomOptionColor,
  resolveOptionCssVar,
} from '../../../../shared/palette';
import { OptionBadge, parsePropertyConfig, parsePropertyValueJson } from './PropertyHelpers';

export interface PropertyValueEditorProps {
  property: TagProperty;
  valueJson?: string | null;
  allCards?: Card[];
  relationTargetCards?: Card[];
  compact?: boolean;
  wrap?: boolean;
  onChangeValue: (nextValueJson: string | null) => void;
  onUpdatePropertyConfig?: (propertyId: string, config: PropertyConfig) => Promise<void> | void;
  onDeleteOption?: (propertyId: string, optionId: string) => Promise<void> | void;
  onOpenCard?: (cardId: string) => void;
}

export function PropertyValueEditor({
  property,
  valueJson,
  allCards = [],
  relationTargetCards,
  compact = false,
  wrap = false,
  onChangeValue,
  onUpdatePropertyConfig,
  onDeleteOption,
  onOpenCard,
}: PropertyValueEditorProps) {
  const config = useMemo(() => parsePropertyConfig(property.config_json), [property.config_json]);
  const options = config.options ?? [];
  const parsedValue = useMemo(() => parsePropertyValueJson(valueJson), [valueJson]);

  const [isEditingText, setIsEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [optionNameDraft, setOptionNameDraft] = useState('');

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPopoverOpen && !isEditingText) return;
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        if (isEditingText) {
          commitTextDraft();
        }
        setIsPopoverOpen(false);
        setEditingOptionId(null);
        setSearchQuery('');
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  });

  const commitTextDraft = () => {
    const trimmed = textDraft.trim();
    if (property.type === 'number') {
      if (!trimmed) {
        onChangeValue(null);
      } else {
        const num = Number(trimmed);
        if (!Number.isNaN(num)) {
          onChangeValue(JSON.stringify(num));
        }
      }
    } else if (property.type === 'date') {
      if (!trimmed) {
        onChangeValue(null);
      } else {
        onChangeValue(JSON.stringify({ start: trimmed }));
      }
    } else {
      if (!trimmed) {
        onChangeValue(null);
      } else {
        onChangeValue(JSON.stringify(trimmed));
      }
    }
    setIsEditingText(false);
  };

  if (property.type === 'checkbox') {
    const checked = parsedValue === true;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChangeValue(JSON.stringify(!checked));
        }}
        className={`w-4 h-4 rounded border flex items-center justify-center transition cursor-pointer ${
          checked
            ? 'bg-active-item border-active-item text-white'
            : 'bg-background-primary border-light-grey hover:border-active-item'
        }`}
        aria-label={`Toggle ${property.name}`}
      >
        {checked && <Check size={11} strokeWidth={3} />}
      </button>
    );
  }

  if (property.type === 'date') {
    const dateVal =
      typeof parsedValue === 'object' && parsedValue !== null && 'start' in parsedValue
        ? String((parsedValue as { start: string }).start).slice(0, 10)
        : typeof parsedValue === 'string'
        ? parsedValue.slice(0, 10)
        : '';

    return (
      <div className="flex items-center gap-1 group/date" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          value={dateVal}
          onChange={(e) => {
            const val = e.target.value;
            onChangeValue(val ? JSON.stringify({ start: val }) : null);
          }}
          className={`bg-transparent text-[12px] text-text-color outline-none cursor-pointer rounded px-1 py-0.5 hover:bg-ultra-light-grey ${
            !dateVal ? 'text-middle-grey' : ''
          }`}
        />
        {dateVal && (
          <button
            type="button"
            onClick={() => onChangeValue(null)}
            className="opacity-0 group-hover/date:opacity-100 text-middle-grey hover:text-danger-item cursor-pointer"
            aria-label="Clear date"
          >
            <X size={11} />
          </button>
        )}
      </div>
    );
  }

  if (
    property.type === 'text' ||
    property.type === 'number' ||
    property.type === 'url' ||
    property.type === 'phone' ||
    property.type === 'email'
  ) {
    const displayVal = parsedValue === null || parsedValue === undefined ? '' : String(parsedValue);

    const openEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      setTextDraft(displayVal);
      setIsEditingText(true);
    };

    return (
      <div ref={wrapperRef} className="relative w-full min-w-0" onClick={(e) => e.stopPropagation()}>
        {isEditingText ? (
          <input
            type={property.type === 'number' ? 'number' : 'text'}
            autoFocus
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTextDraft();
              } else if (e.key === 'Escape') {
                setIsEditingText(false);
              }
            }}
            onBlur={commitTextDraft}
            className={`w-full px-1.5 py-0.5 rounded bg-background-primary border border-active-item text-[12px] text-text-color outline-none ${
              property.type === 'number' ? 'text-right tabular-nums' : ''
            }`}
          />
        ) : (
          <div
            onClick={openEdit}
            className={`flex items-center gap-1.5 min-h-[24px] px-1.5 py-0.5 rounded hover:bg-ultra-light-grey cursor-text transition ${
              property.type === 'number' ? 'justify-end tabular-nums' : ''
            }`}
          >
            {displayVal ? (
              <>
                <span
                  className={`text-[12px] text-text-color ${
                    wrap ? 'break-words whitespace-normal' : 'truncate'
                  } ${property.type === 'url' ? 'underline decoration-middle-grey/50' : ''}`}
                >
                  {displayVal}
                </span>
                {property.type === 'url' && (
                  <a
                    href={displayVal.startsWith('http') ? displayVal : `https://${displayVal}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-middle-grey hover:text-active-item shrink-0"
                    title="Open URL"
                  >
                    <ExternalLink size={11} />
                  </a>
                )}
              </>
            ) : (
              <span className="text-[11.5px] text-middle-grey/60">
                {compact ? 'Empty' : ''}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (property.type === 'select' || property.type === 'multiSelect') {
    const isMulti = property.type === 'multiSelect';
    const selectedIds: string[] = isMulti
      ? Array.isArray(parsedValue)
        ? parsedValue.filter((v): v is string => typeof v === 'string')
        : []
      : typeof parsedValue === 'string'
      ? [parsedValue]
      : [];

    const selectedOptions = selectedIds
      .map((id) => options.find((o) => o.id === id))
      .filter((o): o is PropertyOption => Boolean(o));

    const filteredOptions = options.filter(
      (o) => !searchQuery.trim() || o.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
    );

    const exactMatch = options.some(
      (o) => o.name.toLowerCase() === searchQuery.trim().toLowerCase()
    );

    const toggleOption = (optId: string) => {
      if (isMulti) {
        const next = selectedIds.includes(optId)
          ? selectedIds.filter((id) => id !== optId)
          : [...selectedIds, optId];
        onChangeValue(next.length > 0 ? JSON.stringify(next) : null);
      } else {
        const next = selectedIds[0] === optId ? null : optId;
        onChangeValue(next ? JSON.stringify(next) : null);
        setIsPopoverOpen(false);
      }
    };

    const createOption = async (rawName: string) => {
      const trimmed = rawName.trim();
      if (!trimmed || !onUpdatePropertyConfig) return;
      const newOpt: PropertyOption = {
        id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: trimmed,
        color: pickRandomOptionColor(),
      };
      const nextOptions = [...options, newOpt];
      await onUpdatePropertyConfig(property.id, { ...config, options: nextOptions });
      if (isMulti) {
        onChangeValue(JSON.stringify([...selectedIds, newOpt.id]));
      } else {
        onChangeValue(JSON.stringify(newOpt.id));
        setIsPopoverOpen(false);
      }
      setSearchQuery('');
    };

    const updateOptionColor = async (optId: string, color: OptionColor) => {
      if (!onUpdatePropertyConfig) return;
      const nextOptions = options.map((o) => (o.id === optId ? { ...o, color } : o));
      await onUpdatePropertyConfig(property.id, { ...config, options: nextOptions });
    };

    const commitOptionRename = async (optId: string) => {
      const trimmed = optionNameDraft.trim();
      setEditingOptionId(null);
      if (!trimmed || !onUpdatePropertyConfig) return;
      const nextOptions = options.map((o) => (o.id === optId ? { ...o, name: trimmed } : o));
      await onUpdatePropertyConfig(property.id, { ...config, options: nextOptions });
    };

    const handleRemoveSelectedOption = (optId: string) => {
      if (isMulti) {
        const next = selectedIds.filter((id) => id !== optId);
        onChangeValue(next.length > 0 ? JSON.stringify(next) : null);
      } else {
        onChangeValue(null);
      }
    };

    return (
      <div ref={wrapperRef} className="relative w-full min-w-0" onClick={(e) => e.stopPropagation()}>
        <div
          onClick={() => setIsPopoverOpen((v) => !v)}
          className={`flex items-center gap-1 min-h-[24px] px-1 py-0.5 rounded hover:bg-ultra-light-grey cursor-pointer transition ${
            wrap ? 'flex-wrap' : 'overflow-hidden'
          }`}
        >
          {selectedOptions.length > 0 ? (
            selectedOptions.map((opt) => (
              <OptionBadge
                key={opt.id}
                option={opt}
                onRemove={isPopoverOpen ? handleRemoveSelectedOption : undefined}
              />
            ))
          ) : (
            <span className="text-[11.5px] text-middle-grey/60 px-0.5">
              {compact ? 'Empty' : ''}
            </span>
          )}
        </div>

        {isPopoverOpen && (
          <div className="absolute left-0 top-7 w-64 p-1.5 rounded-lg bg-menu-texture-bg-medium backdrop-blur-2xl border border-light-grey shadow-main z-50 text-[12px]">
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim() && !exactMatch) {
                  e.preventDefault();
                  createOption(searchQuery);
                } else if (e.key === 'Escape') {
                  setIsPopoverOpen(false);
                }
              }}
              placeholder="Search or create option..."
              className="w-full px-2 py-1 mb-1.5 rounded bg-background-primary border border-light-grey focus:border-active-item text-[12px] text-text-color placeholder:text-middle-grey outline-none"
            />

            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {filteredOptions.map((opt) => {
                const isSelected = selectedIds.includes(opt.id);
                const isEditingOpt = editingOptionId === opt.id;
                return (
                  <div key={opt.id} className="group/opt relative">
                    <div
                      onClick={() => {
                        if (!isEditingOpt) toggleOption(opt.id);
                      }}
                      className="flex items-center justify-between gap-1.5 px-1.5 py-1 rounded hover:bg-light-grey cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <OptionBadge option={opt} />
                        {isSelected && <Check size={12} className="text-active-item shrink-0" />}
                      </div>

                      {onUpdatePropertyConfig && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isEditingOpt) {
                              setEditingOptionId(null);
                            } else {
                              setEditingOptionId(opt.id);
                              setOptionNameDraft(opt.name);
                            }
                          }}
                          className="p-0.5 rounded opacity-0 group-hover/opt:opacity-100 hover:bg-background-primary text-middle-grey hover:text-text-color cursor-pointer"
                          aria-label={`Edit option ${opt.name}`}
                        >
                          <MoreHorizontal size={12} />
                        </button>
                      )}
                    </div>

                    {isEditingOpt && (
                      <div
                        className="mt-1 mb-1.5 p-2 rounded-md bg-background-primary border border-light-grey space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          autoFocus
                          value={optionNameDraft}
                          onChange={(e) => setOptionNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitOptionRename(opt.id);
                            } else if (e.key === 'Escape') {
                              setEditingOptionId(null);
                            }
                          }}
                          className="w-full px-2 py-1 rounded bg-background-secondary border border-light-grey focus:border-active-item text-[11.5px] text-text-color outline-none"
                        />

                        <div className="flex items-center gap-1 flex-wrap">
                          {HEPTA_OPTION_PALETTE.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => updateOptionColor(opt.id, c.id)}
                              className={`w-4 h-4 rounded-full border cursor-pointer transition ${
                                opt.color === c.id
                                  ? 'border-active-item ring-1 ring-active-item scale-110'
                                  : 'border-light-grey'
                              }`}
                              style={{ backgroundColor: resolveOptionCssVar(c.id) }}
                              title={c.label}
                              aria-label={`Set color ${c.label}`}
                            />
                          ))}
                        </div>

                        {onDeleteOption && (
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteOption(property.id, opt.id);
                              setEditingOptionId(null);
                            }}
                            className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[11.5px] text-danger-item hover:bg-danger-item/10 cursor-pointer"
                          >
                            <Trash2 size={11} />
                            <span>Delete option</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {searchQuery.trim() && !exactMatch && onUpdatePropertyConfig && (
                <button
                  type="button"
                  onClick={() => createOption(searchQuery)}
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-light-grey text-text-color cursor-pointer"
                >
                  <Plus size={12} className="text-active-item" />
                  <span className="text-[12px]">Create</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[11px] font-medium"
                    style={{ backgroundColor: 'var(--option-blue)' }}
                  >
                    {searchQuery.trim()}
                  </span>
                </button>
              )}

              {filteredOptions.length === 0 && !searchQuery.trim() && (
                <p className="px-2 py-1.5 text-[11.5px] text-middle-grey">
                  Type to create an option...
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (property.type === 'relation') {
    const pool = relationTargetCards ?? allCards;
    const rawRefs = Array.isArray(parsedValue) ? parsedValue : [];
    const linkedIds = rawRefs
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null && 'id' in item) {
          return String((item as { id: string }).id);
        }
        return null;
      })
      .filter((id): id is string => Boolean(id));

    const linkedCards = linkedIds
      .map((id) => allCards.find((c) => c.id === id))
      .filter((c): c is Card => Boolean(c));

    const filteredPool = pool.filter(
      (c) =>
        !searchQuery.trim() ||
        (c.title || 'Untitled').toLowerCase().includes(searchQuery.trim().toLowerCase())
    );

    const toggleRelatedCard = (cardId: string) => {
      const nextIds = linkedIds.includes(cardId)
        ? linkedIds.filter((id) => id !== cardId)
        : [...linkedIds, cardId];
      if (nextIds.length === 0) {
        onChangeValue(null);
      } else {
        onChangeValue(JSON.stringify(nextIds.map((id) => ({ id, type: 'card' }))));
      }
    };

    return (
      <div ref={wrapperRef} className="relative w-full min-w-0" onClick={(e) => e.stopPropagation()}>
        <div
          onClick={() => setIsPopoverOpen((v) => !v)}
          className={`flex items-center gap-1 min-h-[24px] px-1 py-0.5 rounded hover:bg-ultra-light-grey cursor-pointer transition ${
            wrap ? 'flex-wrap' : 'overflow-hidden'
          }`}
        >
          {linkedCards.length > 0 ? (
            linkedCards.map((c) => (
              <span
                key={c.id}
                onClick={(e) => {
                  if (onOpenCard) {
                    e.stopPropagation();
                    onOpenCard(c.id);
                  }
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ultra-light-grey border border-light-grey text-[11.5px] text-text-color hover:border-active-item max-w-[140px] truncate"
              >
                <FileText size={10} className="text-middle-grey shrink-0" />
                <span className="truncate">{c.title || 'Untitled'}</span>
              </span>
            ))
          ) : (
            <span className="text-[11.5px] text-middle-grey/60 px-0.5">
              {compact ? 'Link card...' : ''}
            </span>
          )}
        </div>

        {isPopoverOpen && (
          <div className="absolute left-0 top-7 w-64 p-1.5 rounded-lg bg-menu-texture-bg-medium backdrop-blur-2xl border border-light-grey shadow-main z-50 text-[12px]">
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search cards to link..."
              className="w-full px-2 py-1 mb-1.5 rounded bg-background-primary border border-light-grey focus:border-active-item text-[12px] text-text-color placeholder:text-middle-grey outline-none"
            />
            <div className="max-h-52 overflow-y-auto space-y-0.5">
              {filteredPool.slice(0, 30).map((c) => {
                const isLinked = linkedIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleRelatedCard(c.id)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-light-grey text-left text-text-color cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText size={12} className="text-middle-grey shrink-0" />
                      <span className="truncate">{c.title || 'Untitled'}</span>
                    </div>
                    {isLinked && <Check size={12} className="text-active-item shrink-0" />}
                  </button>
                );
              })}
              {filteredPool.length === 0 && (
                <p className="px-2 py-1.5 text-[11.5px] text-middle-grey">No matching cards.</p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}