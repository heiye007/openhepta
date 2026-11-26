import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Highlighter,
  Link2,
  ChevronDown,
  ChevronRight,
  Palette,
  Check,
  Copy,
  Trash2,
  Unlink,
  ExternalLink,
  Plus,
  FileText,
  Type,
  Heading1,
  Heading2,
  Heading3,
  CheckSquare,
  List,
  ListOrdered,
  Quote,
  Lightbulb,
  FileCode,
  Minus,
  Calendar,
  Clock,
  ListCollapse,
  Table,
  Sigma,
  Image,
  Video,
  Map as MapIcon,
} from 'lucide-react';
import { BlockTypeId, TURN_INTO_ITEMS } from './commands';
import { EDITOR_PALETTE } from './schema';

export interface SlashCommandItem {
  id: string;
  label: string;
  description?: string;
  keywords: string[];
  shortcut?: string;
  icon: React.ReactNode;
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    id: 'text',
    label: 'Text',
    keywords: ['paragraph', 'plain', 'p', '正文', '文本'],
    icon: <Type size={14} />,
  },
  {
    id: 'h1',
    label: 'Heading 1',
    keywords: ['h1', 'title', 'heading', '一级标题', '标题'],
    shortcut: '#',
    icon: <Heading1 size={14} />,
  },
  {
    id: 'h2',
    label: 'Heading 2',
    keywords: ['h2', 'subtitle', 'heading', '二级标题', '标题'],
    shortcut: '##',
    icon: <Heading2 size={14} />,
  },
  {
    id: 'h3',
    label: 'Heading 3',
    keywords: ['h3', 'heading', '三级标题', '标题'],
    shortcut: '###',
    icon: <Heading3 size={14} />,
  },
  {
    id: 'card',
    label: 'Card',
    keywords: ['card', 'link', 'wiki', 'mention', '[[', '双链', '卡片'],
    shortcut: '[[',
    icon: <FileText size={14} />,
  },
  {
    id: 'whiteboard',
    label: 'Whiteboard',
    keywords: ['whiteboard', 'wb', 'board', 'map', 'canvas', '白板'],
    icon: <MapIcon size={14} />,
  },
  {
    id: 'date',
    label: 'Date',
    keywords: ['date', 'today', 'journal', 'calendar', '日期', '今天'],
    icon: <Calendar size={14} />,
  },
  {
    id: 'now',
    label: 'Now',
    keywords: ['now', 'time', 'timestamp', '时间'],
    icon: <Clock size={14} />,
  },
  {
    id: 'checkbox',
    label: 'Todo list',
    keywords: ['todo', 'task', 'check', 'checkbox', '待办', '任务'],
    shortcut: '[]',
    icon: <CheckSquare size={14} />,
  },
  {
    id: 'ul',
    label: 'Bullet list',
    keywords: ['bullet', 'unordered', 'list', 'ul', '无序列表', '列表'],
    shortcut: '-',
    icon: <List size={14} />,
  },
  {
    id: 'ol',
    label: 'Number list',
    keywords: ['numbered', 'ordered', 'list', 'ol', '有序列表'],
    shortcut: '1.',
    icon: <ListOrdered size={14} />,
  },
  {
    id: 'toggle',
    label: 'Toggle list',
    keywords: ['toggle', 'fold', 'collapse', 'details', '折叠'],
    shortcut: '>>',
    icon: <ListCollapse size={14} />,
  },
  {
    id: 'callout',
    label: 'Callout',
    keywords: ['callout', 'note', 'tip', 'info', 'box', '提示框', '高亮块'],
    icon: <Lightbulb size={14} />,
  },
  {
    id: 'q',
    label: 'Quote',
    keywords: ['quote', 'blockquote', '引用'],
    shortcut: '>',
    icon: <Quote size={14} />,
  },
  {
    id: 'code',
    label: 'Code block',
    keywords: ['code', 'program', 'pre', '代码块'],
    shortcut: '```',
    icon: <FileCode size={14} />,
  },
  {
    id: 'table',
    label: 'Table',
    keywords: ['table', 'grid', 'spreadsheet', '表格'],
    icon: <Table size={14} />,
  },
  {
    id: 'math',
    label: 'Math block',
    keywords: ['math', 'latex', 'formula', 'equation', 'katex', '公式'],
    shortcut: '$$',
    icon: <Sigma size={14} />,
  },
  {
    id: 'inline_math',
    label: 'Inline math',
    keywords: ['inline', 'math', 'latex', 'katex', '行内公式'],
    shortcut: '$...$',
    icon: <Sigma size={14} />,
  },
  {
    id: 'image',
    label: 'Image',
    keywords: ['image', 'photo', 'picture', 'img', '图片'],
    icon: <Image size={14} />,
  },
  {
    id: 'video',
    label: 'Video',
    keywords: ['video', 'youtube', 'vimeo', 'mp4', '视频'],
    icon: <Video size={14} />,
  },
  {
    id: 'divider',
    label: 'Divider',
    keywords: ['divider', 'hr', 'line', 'horizontal', '分割线'],
    shortcut: '---',
    icon: <Minus size={14} />,
  },
];

export function getBlockIcon(id: BlockTypeId): React.ReactNode {
  switch (id) {
    case 'h1':
      return <Heading1 size={13} />;
    case 'h2':
      return <Heading2 size={13} />;
    case 'h3':
      return <Heading3 size={13} />;
    case 'checkbox':
      return <CheckSquare size={13} />;
    case 'ul':
      return <List size={13} />;
    case 'ol':
      return <ListOrdered size={13} />;
    case 'toggle':
      return <ListCollapse size={13} />;
    case 'q':
      return <Quote size={13} />;
    case 'callout':
      return <Lightbulb size={13} />;
    case 'code':
      return <FileCode size={13} />;
    default:
      return <Type size={13} />;
  }
}

interface BlockContextMenuProps {
  top: number;
  left: number;
  currentType: BlockTypeId;
  onTurnInto: (id: BlockTypeId) => void;
  onDuplicate: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function BlockContextMenu({
  top,
  left,
  currentType,
  onTurnInto,
  onDuplicate,
  onCopyLink,
  onDelete,
  onClose,
}: BlockContextMenuProps) {
  const [showTurnIntoSub, setShowTurnIntoSub] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('.block-drag-handle')) {
          onClose();
        }
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{ position: 'absolute', top, left, zIndex: 70 }}
      onMouseDown={(e) => e.stopPropagation()}
      className="hepta-block-menu w-48 py-1 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-border-palette shadow-main text-xs text-text-color select-none"
    >
      <div
        className="relative"
        onMouseEnter={() => setShowTurnIntoSub(true)}
        onMouseLeave={() => setShowTurnIntoSub(false)}
      >
        <button
          type="button"
          onClick={() => setShowTurnIntoSub((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-light-grey transition text-left"
        >
          <span className="flex items-center gap-2">
            <span className="text-middle-hard-grey">{getBlockIcon(currentType)}</span>
            <span>Turn into</span>
          </span>
          <ChevronRight size={13} className="text-middle-grey" />
        </button>

        {showTurnIntoSub && (
          <div className="absolute left-full top-0 ml-1 w-44 py-1 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-border-palette shadow-main z-[80] max-h-72 overflow-y-auto">
            {TURN_INTO_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onTurnInto(item.id);
                  onClose();
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-light-grey transition text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="text-middle-hard-grey">{getBlockIcon(item.id)}</span>
                  <span>{item.label}</span>
                </span>
                {currentType === item.id && <Check size={12} className="text-active-item" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-light-grey transition text-left"
      >
        <Copy size={13} className="text-middle-hard-grey" />
        <span>Duplicate</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onCopyLink();
          setCopied(true);
          setTimeout(() => onClose(), 450);
        }}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-light-grey transition text-left"
      >
        <span className="flex items-center gap-2">
          <Link2 size={13} className="text-middle-hard-grey" />
          <span>Copy link to block</span>
        </span>
        {copied && <Check size={12} className="text-successful-item" />}
      </button>

      <div className="h-px bg-light-grey my-1" />

      <button
        type="button"
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-danger-item/15 text-danger-item transition text-left"
      >
        <Trash2 size={13} />
        <span>Delete</span>
      </button>
    </div>
  );
}

interface BubbleToolbarProps {
  top: number;
  left: number;
  activeBlockType: BlockTypeId;
  activeMarks: {
    strong: boolean;
    em: boolean;
    underline: boolean;
    strike: boolean;
    code: boolean;
    link: boolean;
    textColor: string | null;
    bgColor: string | null;
  };
  onTurnInto: (id: BlockTypeId) => void;
  onToggleMark: (mark: 'strong' | 'em' | 'underline' | 'strike' | 'code') => void;
  onInsertInlineMath?: () => void;
  onToggleHighlight: () => void;
  onSetColor: (type: 'text' | 'background', color: string | null) => void;
  onOpenLinkPopover: () => void;
}

export function BubbleToolbar({
  top,
  left,
  activeBlockType,
  activeMarks,
  onTurnInto,
  onToggleMark,
  onInsertInlineMath,
  onToggleHighlight,
  onSetColor,
  onOpenLinkPopover,
}: BubbleToolbarProps) {
  const [openSubmenu, setOpenSubmenu] = useState<'turnInto' | 'color' | null>(null);
  const currentTurnInto =
    TURN_INTO_ITEMS.find((t) => t.id === activeBlockType) || TURN_INTO_ITEMS[0];

  const preventFocusLoss = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div
      style={{ position: 'absolute', top, left, zIndex: 65 }}
      onMouseDown={preventFocusLoss}
      className="hepta-bubble-toolbar flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-menu-bg/95 backdrop-blur-xl border border-border-palette shadow-main text-text-color select-none"
    >
      <div className="relative">
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={() => setOpenSubmenu((prev) => (prev === 'turnInto' ? null : 'turnInto'))}
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-light-grey text-xs font-medium transition whitespace-nowrap"
          title="Turn into (Ctrl+/)"
        >
          <span>{currentTurnInto.shortLabel}</span>
          <ChevronDown size={11} className="text-middle-grey" />
        </button>

        {openSubmenu === 'turnInto' && (
          <div className="absolute left-0 top-full mt-1.5 w-44 py-1 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-border-palette shadow-main z-[70] max-h-64 overflow-y-auto text-xs">
            {TURN_INTO_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={preventFocusLoss}
                onClick={() => {
                  onTurnInto(item.id);
                  setOpenSubmenu(null);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-light-grey transition text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="text-middle-hard-grey">{getBlockIcon(item.id)}</span>
                  <span>{item.label}</span>
                </span>
                {activeBlockType === item.id && (
                  <Check size={12} className="text-active-item" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-light-grey mx-0.5" />

      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={() => onToggleMark('strong')}
        className={`p-1.5 rounded-md transition ${
          activeMarks.strong
            ? 'bg-active-item/20 text-active-item'
            : 'hover:bg-light-grey text-text-color'
        }`}
        title="Bold (Ctrl+B)"
      >
        <Bold size={13} />
      </button>

      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={() => onToggleMark('em')}
        className={`p-1.5 rounded-md transition ${
          activeMarks.em
            ? 'bg-active-item/20 text-active-item'
            : 'hover:bg-light-grey text-text-color'
        }`}
        title="Italic (Ctrl+I)"
      >
        <Italic size={13} />
      </button>

      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={() => onToggleMark('underline')}
        className={`p-1.5 rounded-md transition ${
          activeMarks.underline
            ? 'bg-active-item/20 text-active-item'
            : 'hover:bg-light-grey text-text-color'
        }`}
        title="Underline (Ctrl+U)"
      >
        <Underline size={13} />
      </button>

      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={() => onToggleMark('strike')}
        className={`p-1.5 rounded-md transition ${
          activeMarks.strike
            ? 'bg-active-item/20 text-active-item'
            : 'hover:bg-light-grey text-text-color'
        }`}
        title="Strikethrough (Ctrl+Shift+S)"
      >
        <Strikethrough size={13} />
      </button>

      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={() => onToggleMark('code')}
        className={`p-1.5 rounded-md transition ${
          activeMarks.code
            ? 'bg-active-item/20 text-active-item'
            : 'hover:bg-light-grey text-text-color'
        }`}
        title="Inline code (Ctrl+E)"
      >
        <Code size={13} />
      </button>

      {onInsertInlineMath && (
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={onInsertInlineMath}
          className="p-1.5 rounded-md transition hover:bg-light-grey text-text-color"
          title="Inline math (Ctrl+Shift+E)"
        >
          <Sigma size={13} />
        </button>
      )}

      <div className="w-px h-4 bg-light-grey mx-0.5" />

      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={onToggleHighlight}
        className={`p-1.5 rounded-md transition ${
          activeMarks.bgColor
            ? 'bg-active-item/20 text-active-item'
            : 'hover:bg-light-grey text-text-color'
        }`}
        title="Highlight (Ctrl+Shift+H)"
      >
        <Highlighter size={13} />
      </button>

      <div className="relative">
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={() => setOpenSubmenu((prev) => (prev === 'color' ? null : 'color'))}
          className={`flex items-center gap-0.5 px-1.5 py-1.5 rounded-md transition ${
            activeMarks.textColor || activeMarks.bgColor
              ? 'bg-active-item/15 text-active-item'
              : 'hover:bg-light-grey text-text-color'
          }`}
          title="Text & highlight color"
        >
          <Palette size={13} />
          <ChevronDown size={10} className="text-middle-grey" />
        </button>

        {openSubmenu === 'color' && (
          <div className="absolute right-0 top-full mt-1.5 w-52 p-2.5 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-border-palette shadow-main z-[70] text-xs space-y-2.5">
            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-middle-grey mb-1.5">
                <span>Text Color</span>
                {activeMarks.textColor && (
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => {
                      onSetColor('text', null);
                      setOpenSubmenu(null);
                    }}
                    className="text-active-item hover:underline normal-case font-normal"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {Object.entries(EDITOR_PALETTE).map(([key, val]) => (
                  <button
                    key={`t-${key}`}
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => {
                      onSetColor('text', activeMarks.textColor === key ? null : key);
                      setOpenSubmenu(null);
                    }}
                    className={`h-6 rounded-md border flex items-center justify-center font-semibold text-xs transition ${
                      activeMarks.textColor === key
                        ? 'border-active-item ring-1 ring-active-item'
                        : 'border-light-grey hover:bg-light-grey'
                    }`}
                    style={{ color: `var(--text-${key}-editor, ${val.text})` }}
                    title={`Text: ${val.label}`}
                  >
                    A
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-light-grey" />

            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-middle-grey mb-1.5">
                <span>Background</span>
                {activeMarks.bgColor && (
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => {
                      onSetColor('background', null);
                      setOpenSubmenu(null);
                    }}
                    className="text-active-item hover:underline normal-case font-normal"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {Object.entries(EDITOR_PALETTE).map(([key, val]) => (
                  <button
                    key={`b-${key}`}
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => {
                      onSetColor('background', activeMarks.bgColor === key ? null : key);
                      setOpenSubmenu(null);
                    }}
                    className={`h-6 rounded-md border flex items-center justify-center text-[11px] font-medium transition ${
                      activeMarks.bgColor === key
                        ? 'border-active-item ring-1 ring-active-item'
                        : 'border-light-grey hover:scale-105'
                    }`}
                    style={{ backgroundColor: `var(--bg-${key}-editor, ${val.bg})` }}
                    title={`Highlight: ${val.label}`}
                  >
                    A
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-light-grey mx-0.5" />

      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={onOpenLinkPopover}
        className={`p-1.5 rounded-md transition ${
          activeMarks.link
            ? 'bg-active-item/20 text-active-item'
            : 'hover:bg-light-grey text-text-color'
        }`}
        title="Link (Ctrl+K)"
      >
        <Link2 size={13} />
      </button>
    </div>
  );
}

interface LinkPopoverProps {
  top: number;
  left: number;
  initialHref: string;
  hasExistingLink: boolean;
  onApply: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function LinkPopover({
  top,
  left,
  initialHref,
  hasExistingLink,
  onApply,
  onRemove,
  onClose,
}: LinkPopoverProps) {
  const [url, setUrl] = useState(initialHref);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUrl(initialHref);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [initialHref]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      onRemove();
    } else {
      onApply(url.trim());
    }
  };

  return (
    <div
      ref={popoverRef}
      style={{ position: 'absolute', top, left, zIndex: 75 }}
      onMouseDown={(e) => e.stopPropagation()}
      className="hepta-link-popover w-72 p-2 rounded-xl bg-menu-bg/95 backdrop-blur-xl border border-border-palette shadow-main text-xs text-text-color"
    >
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Link2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-middle-grey" />
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Paste or type a URL..."
            className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-background-secondary border border-light-grey focus:border-active-item outline-none text-xs text-text-color"
          />
        </div>
        <button
          type="submit"
          className="px-2.5 py-1.5 rounded-lg bg-active-item text-white font-medium hover:opacity-90 transition shrink-0"
          title="Apply link (Enter)"
        >
          <Check size={13} />
        </button>
        {hasExistingLink && url.trim() && (
          <button
            type="button"
            onClick={() => {
              const target = /^[a-z][\w+.-]*:/i.test(url.trim())
                ? url.trim()
                : `https://${url.trim()}`;
              window.open(target, '_blank', 'noopener,noreferrer');
            }}
            className="p-1.5 rounded-lg hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition shrink-0"
            title="Open link"
          >
            <ExternalLink size={13} />
          </button>
        )}
        {hasExistingLink && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-danger-item/15 text-middle-hard-grey hover:text-danger-item transition shrink-0"
            title="Remove link"
          >
            <Unlink size={13} />
          </button>
        )}
      </form>
    </div>
  );
}

interface SlashMenuProps {
  top: number;
  left: number;
  query: string;
  items: SlashCommandItem[];
  selectedIndex: number;
  onHoverIndex: (idx: number) => void;
  onSelect: (item: SlashCommandItem) => void;
}

export function SlashMenu({
  top,
  left,
  query,
  items,
  selectedIndex,
  onHoverIndex,
  onSelect,
}: SlashMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeEl = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return createPortal(
    <div
      data-canvas-ui="true"
      style={{ position: 'fixed', top, left, zIndex: 9999 }}
      onMouseDown={(e) => e.preventDefault()}
      onWheel={(e) => e.stopPropagation()}
      className="hepta-slash-menu w-60 py-1.5 bg-menu-bg/95 backdrop-blur-xl border border-border-palette rounded-xl shadow-main overflow-hidden text-xs text-text-color select-none"
    >
      <div className="px-3 py-1 flex items-center justify-between text-[10px] font-semibold text-middle-grey uppercase tracking-wider">
        <span>Basic Blocks</span>
        {query && <span className="font-mono text-active-item normal-case">/{query}</span>}
      </div>
      <div ref={listRef} className="max-h-64 overflow-y-auto px-1">
        {items.length === 0 ? (
          <div className="px-3 py-3 text-center text-[11px] text-middle-grey">
            No matching commands
          </div>
        ) : (
          items.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHoverIndex(idx)}
              onClick={() => onSelect(item)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition ${
                idx === selectedIndex ? 'bg-light-grey text-text-color' : 'hover:bg-light-grey/60'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-middle-hard-grey shrink-0">{item.icon}</span>
                <span className="truncate font-medium">{item.label}</span>
              </div>
              {item.shortcut && (
                <span className="text-[10px] text-middle-grey font-mono shrink-0 ml-2">
                  {item.shortcut}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body
  );
}

export interface MentionCardCandidate {
  id: string;
  title: string;
  color?: string | null;
  isCreateOption?: boolean;
}

interface MentionMenuProps {
  top: number;
  left: number;
  query: string;
  items: MentionCardCandidate[];
  selectedIndex: number;
  loading?: boolean;
  onHoverIndex: (idx: number) => void;
  onSelect: (item: MentionCardCandidate) => void;
}

export function MentionMenu({
  top,
  left,
  query,
  items,
  selectedIndex,
  loading,
  onHoverIndex,
  onSelect,
}: MentionMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeEl = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return createPortal(
    <div
      data-canvas-ui="true"
      style={{ position: 'fixed', top, left, zIndex: 9999 }}
      onMouseDown={(e) => e.preventDefault()}
      onWheel={(e) => e.stopPropagation()}
      className="hepta-mention-menu w-64 py-1.5 bg-menu-bg/95 backdrop-blur-xl border border-border-palette rounded-xl shadow-main overflow-hidden text-xs text-text-color select-none"
    >
      <div className="px-3 py-1 flex items-center justify-between text-[10px] font-semibold text-middle-grey uppercase tracking-wider">
        <span>Link to Card</span>
        {query && <span className="font-mono text-active-item normal-case truncate max-w-[110px]">[[{query}</span>}
      </div>
      <div ref={listRef} className="max-h-56 overflow-y-auto px-1">
        {loading && items.length === 0 ? (
          <div className="px-3 py-3 text-center text-[11px] text-middle-grey">Searching cards...</div>
        ) : items.length === 0 ? (
          <div className="px-3 py-3 text-center text-[11px] text-middle-grey">
            Type a card title to link or create
          </div>
        ) : (
          items.map((item, idx) => (
            <button
              key={item.isCreateOption ? `create-${item.title}` : item.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHoverIndex(idx)}
              onClick={() => onSelect(item)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition ${
                idx === selectedIndex ? 'bg-light-grey text-text-color' : 'hover:bg-light-grey/60'
              }`}
            >
              {item.isCreateOption ? (
                <>
                  <Plus size={13} className="text-active-item shrink-0" />
                  <span className="truncate">
                    Create card <span className="font-semibold text-active-item">"{item.title}"</span>
                  </span>
                </>
              ) : (
                <>
                  <FileText size={13} className="text-middle-hard-grey shrink-0" />
                  <span className="truncate font-medium">{item.title || 'Untitled'}</span>
                </>
              )}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body
  );
}

export interface WhiteboardMentionCandidate {
  id: string;
  name: string;
  isCreateOption?: boolean;
}

interface WhiteboardPickerMenuProps {
  top: number;
  left: number;
  items: WhiteboardMentionCandidate[];
  loading?: boolean;
  onSelect: (item: WhiteboardMentionCandidate) => void;
  onClose: () => void;
}

export function WhiteboardPickerMenu({
  top,
  left,
  items,
  loading,
  onSelect,
  onClose,
}: WhiteboardPickerMenuProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const filtered: WhiteboardMentionCandidate[] = items.filter(
    (wb) => !q || (wb.name || '').toLowerCase().includes(q)
  );
  const hasExact = q
    ? filtered.some((wb) => (wb.name || '').trim().toLowerCase() === q)
    : true;
  const visibleItems: WhiteboardMentionCandidate[] =
    q && !hasExact
      ? [...filtered, { id: '__create_wb__', name: query.trim(), isCreateOption: true }]
      : filtered;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const activeEl = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      data-canvas-ui="true"
      style={{ position: 'fixed', top, left, zIndex: 9999 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className="hepta-whiteboard-picker w-64 py-1.5 bg-menu-bg/95 backdrop-blur-xl border border-border-palette rounded-xl shadow-main text-xs text-text-color select-none"
    >
      <div className="px-2 pb-1.5">
        <input
          type="text"
          autoFocus
          aria-label="Search whiteboard to mention"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (visibleItems.length > 0) {
                setSelectedIndex((prev) => (prev + 1) % visibleItems.length);
              }
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (visibleItems.length > 0) {
                setSelectedIndex((prev) => (prev - 1 + visibleItems.length) % visibleItems.length);
              }
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (visibleItems.length > 0) {
                const idx = Math.min(selectedIndex, visibleItems.length - 1);
                onSelect(visibleItems[idx]);
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="Search or create whiteboard..."
          className="w-full px-2.5 py-1.5 rounded-lg bg-background-primary border border-light-grey text-xs text-text-color placeholder:text-middle-grey outline-none focus:border-active-item"
        />
      </div>
      <div className="px-3 py-0.5 text-[10px] font-semibold text-middle-grey uppercase tracking-wider">
        Link to Whiteboard
      </div>
      <div ref={listRef} className="max-h-52 overflow-y-auto px-1">
        {loading && visibleItems.length === 0 ? (
          <div className="px-3 py-3 text-center text-[11px] text-middle-grey">
            Loading whiteboards...
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="px-3 py-3 text-center text-[11px] text-middle-grey">
            Type a whiteboard name to link or create
          </div>
        ) : (
          visibleItems.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setSelectedIndex(idx)}
              onClick={() => onSelect(item)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                idx === selectedIndex
                  ? 'bg-active-item/12 text-text-color'
                  : 'hover:bg-light-grey/70 text-text-color'
              }`}
            >
              {item.isCreateOption ? (
                <>
                  <Plus size={13} className="text-active-item shrink-0" />
                  <span className="truncate">
                    Create whiteboard{' '}
                    <span className="font-semibold text-active-item">&quot;{item.name}&quot;</span>
                  </span>
                </>
              ) : (
                <>
                  <MapIcon size={13} className="text-middle-hard-grey shrink-0" />
                  <span className="truncate font-medium">
                    {item.name || 'Untitled Whiteboard'}
                  </span>
                </>
              )}
            </button>
          ))
        )}
      </div>
    </div>,
    document.body
  );
}

interface TableToolbarProps {
  top: number;
  left: number;
  onAddRow: () => void;
  onAddColumn: () => void;
  onDeleteRow: () => void;
  onDeleteColumn: () => void;
  onDeleteTable: () => void;
}

export function TableToolbar({
  top,
  left,
  onAddRow,
  onAddColumn,
  onDeleteRow,
  onDeleteColumn,
  onDeleteTable,
}: TableToolbarProps) {
  const preventFocusLoss = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div
      style={{ position: 'absolute', top, left, zIndex: 62 }}
      onMouseDown={preventFocusLoss}
      className="hepta-table-toolbar flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-menu-bg/95 backdrop-blur-xl border border-border-palette shadow-main text-[11px] text-text-color select-none"
    >
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={onAddRow}
        className="px-2 py-1 rounded hover:bg-light-grey transition font-medium"
        title="Add row below"
      >
        + Row
      </button>
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={onAddColumn}
        className="px-2 py-1 rounded hover:bg-light-grey transition font-medium"
        title="Add column right"
      >
        + Col
      </button>
      <div className="w-px h-3.5 bg-light-grey mx-0.5" />
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={onDeleteRow}
        className="px-2 py-1 rounded hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition"
        title="Delete current row"
      >
        - Row
      </button>
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={onDeleteColumn}
        className="px-2 py-1 rounded hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition"
        title="Delete current column"
      >
        - Col
      </button>
      <div className="w-px h-3.5 bg-light-grey mx-0.5" />
      <button
        type="button"
        onMouseDown={preventFocusLoss}
        onClick={onDeleteTable}
        className="p-1 rounded hover:bg-danger-item/15 text-middle-hard-grey hover:text-danger-item transition"
        title="Delete table"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
