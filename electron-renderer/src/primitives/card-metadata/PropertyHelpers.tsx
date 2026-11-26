import {
  Type,
  Hash,
  CircleDot,
  ListChecks,
  Calendar,
  CheckSquare,
  Link2,
  Phone,
  Mail,
  ArrowUpRight,
  X,
} from 'lucide-react';
import type { PropertyConfig, PropertyOption, PropertyType } from '../../../../shared/types';
import { resolveOptionCssVar } from '../../../../shared/palette';

export interface PropertyTypeMetaItem {
  type: PropertyType;
  label: string;
}

export const PROPERTY_TYPE_LIST: PropertyTypeMetaItem[] = [
  { type: 'text', label: 'Text' },
  { type: 'number', label: 'Number' },
  { type: 'select', label: 'Select' },
  { type: 'multiSelect', label: 'Multi-select' },
  { type: 'date', label: 'Date' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'url', label: 'URL' },
  { type: 'phone', label: 'Phone' },
  { type: 'email', label: 'Email' },
  { type: 'relation', label: 'Relation' },
];

export function PropertyTypeIcon({
  type,
  size = 13,
  className = 'text-middle-hard-grey shrink-0',
}: {
  type: PropertyType;
  size?: number;
  className?: string;
}) {
  switch (type) {
    case 'text':
      return <Type size={size} className={className} />;
    case 'number':
      return <Hash size={size} className={className} />;
    case 'select':
      return <CircleDot size={size} className={className} />;
    case 'multiSelect':
      return <ListChecks size={size} className={className} />;
    case 'date':
      return <Calendar size={size} className={className} />;
    case 'checkbox':
      return <CheckSquare size={size} className={className} />;
    case 'url':
      return <Link2 size={size} className={className} />;
    case 'phone':
      return <Phone size={size} className={className} />;
    case 'email':
      return <Mail size={size} className={className} />;
    case 'relation':
      return <ArrowUpRight size={size} className={className} />;
  }
}

export function parsePropertyConfig(configJson?: string | null): PropertyConfig {
  if (!configJson) return {};
  try {
    const parsed = JSON.parse(configJson);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function parsePropertyValueJson(valueJson?: string | null): unknown {
  if (valueJson === undefined || valueJson === null || valueJson === '') return null;
  try {
    return JSON.parse(valueJson);
  } catch {
    return valueJson;
  }
}

export function OptionBadge({
  option,
  onRemove,
  className = '',
}: {
  option: PropertyOption;
  onRemove?: (optionId: string) => void;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md py-px pl-1.5 text-[11.5px] font-medium text-text-color shadow-[inset_0_0_0_1px_var(--light-grey)] ${
        onRemove ? 'pr-1' : 'pr-1.5'
      } ${className}`}
      style={{ backgroundColor: resolveOptionCssVar(option.color) }}
    >
      <span className="truncate max-w-[140px]">{option.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(option.id);
          }}
          className="ml-1 text-middle-grey hover:text-text-color cursor-pointer shrink-0"
          aria-label={`Remove option ${option.name}`}
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}