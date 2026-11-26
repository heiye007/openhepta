import React, { useEffect, useRef, useState, useCallback, useMemo, useId } from 'react';
import { EditorState, Transaction, NodeSelection, Selection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { columnResizing, tableEditing } from 'prosemirror-tables';
import { GripVertical } from 'lucide-react';
import 'katex/dist/katex.min.css';
import './heptabase-editor.css';

import { heptaSchema } from './prosemirror/schema';
import { buildKeymap } from './prosemirror/keymap';
import { buildInputRules } from './prosemirror/inputrules';
import {
  placeholderPlugin,
  inlineTagHighlightPlugin,
  detectEditorTrigger,
} from './prosemirror/plugins';
import { HeptaCodeBlockView } from './prosemirror/CodeBlockView';
import { HeptaMathView } from './prosemirror/MathNodeView';
import { HeptaImageView, HeptaVideoView } from './prosemirror/MediaNodeViews';
import {
  docFromJson,
  docToJson,
  docToPlainText,
  docFromPlainText,
  docToHtml,
} from './prosemirror/serializer';
import {
  BlockTypeId,
  isMarkActive,
  currentBlockType,
  applyBlockType,
  applyBlockTypeAtPos,
  duplicateBlockAtPos,
  deleteBlockAtPos,
  moveBlock,
  getTopLevelBlockAtPos,
  insertHorizontalRule,
  insertDateChip,
  insertCardChip,
  insertWhiteboardChip,
  insertTable,
  insertMathDisplay,
  insertMathInline,
  insertImageBlock,
  insertVideoBlock,
  isInTable,
  addRowAfter,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  setColor,
  activeColor,
  setLink,
  getLinkRangeAtPos,
} from './prosemirror/commands';
import {
  BlockContextMenu,
  BubbleToolbar,
  LinkPopover,
  SlashMenu,
  MentionMenu,
  WhiteboardPickerMenu,
  TableToolbar,
  SLASH_COMMAND_ITEMS,
  SlashCommandItem,
  MentionCardCandidate,
  WhiteboardMentionCandidate,
} from './prosemirror/FloatingOverlays';

export interface CardEditorProps {
  initialContent?: string;
  placeholder?: string;
  onChange?: (content: { json: string; text: string; html: string }) => void;
  readOnly?: boolean;
  className?: string;
  sourceCardId?: string;
  cards?: Array<{ id: string; title: string; color?: string | null }>;
  onOpenCard?: (cardId: string) => void;
  onSearchCards?: (
    query: string
  ) => Promise<Array<{ id: string; title: string; color?: string | null }>>;
  onCreateCard?: (title: string) => Promise<{ id: string; title: string } | null>;
  onLinkCard?: (sourceCardId: string, targetCardId: string) => Promise<void>;
  whiteboards?: Array<{ id: string; name: string }>;
  onOpenWhiteboard?: (whiteboardId: string) => void;
  onSearchWhiteboards?: () => Promise<Array<{ id: string; name: string }>>;
  onCreateWhiteboard?: (name: string) => Promise<{ id: string; name: string } | null>;
}

const CALLOUT_ICONS = ['💡', '📌', '⚠️', '✅', '🔥', '💬'];

function parseInitialDoc(content: string | undefined) {
  const trimmed = (content || '').trim();
  if (trimmed.startsWith('{') && /"type"\s*:\s*"doc"/.test(trimmed)) {
    return docFromJson(trimmed);
  }
  if (trimmed) {
    return docFromPlainText(trimmed);
  }
  return heptaSchema.nodes.doc.create(null, [heptaSchema.nodes.paragraph.create()]);
}

export function CardEditor({
  initialContent = '',
  placeholder = "Type '/' for commands, '[[' to link cards...",
  onChange,
  readOnly = false,
  className = '',
  sourceCardId,
  cards,
  onOpenCard,
  onSearchCards,
  onCreateCard,
  onLinkCard,
  whiteboards,
  onOpenWhiteboard,
  onSearchWhiteboards,
  onCreateWhiteboard,
}: CardEditorProps) {
  const editorId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const editorMountRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChangeRef = useRef(onChange);
  const readOnlyRef = useRef(readOnly);
  const sourceCardIdRef = useRef(sourceCardId);
  const cardsRef = useRef(cards);
  const onOpenCardRef = useRef(onOpenCard);
  const onSearchCardsRef = useRef(onSearchCards);
  const onCreateCardRef = useRef(onCreateCard);
  const onLinkCardRef = useRef(onLinkCard);
  const whiteboardsRef = useRef(whiteboards);
  const onOpenWhiteboardRef = useRef(onOpenWhiteboard);
  const onSearchWhiteboardsRef = useRef(onSearchWhiteboards);
  const onCreateWhiteboardRef = useRef(onCreateWhiteboard);
  onChangeRef.current = onChange;
  readOnlyRef.current = readOnly;
  sourceCardIdRef.current = sourceCardId;
  cardsRef.current = cards;
  onOpenCardRef.current = onOpenCard;
  onSearchCardsRef.current = onSearchCards;
  onCreateCardRef.current = onCreateCard;
  onLinkCardRef.current = onLinkCard;
  whiteboardsRef.current = whiteboards;
  onOpenWhiteboardRef.current = onOpenWhiteboard;
  onSearchWhiteboardsRef.current = onSearchWhiteboards;
  onCreateWhiteboardRef.current = onCreateWhiteboard;

  const [activeBlock, setActiveBlock] = useState<{
    visible: boolean;
    top: number;
    pos: number;
    nodeType: string;
    text: string;
  }>({ visible: false, top: 0, pos: 0, nodeType: 'paragraph', text: '' });

  const [blockMenu, setBlockMenu] = useState<{
    open: boolean;
    top: number;
    left: number;
    blockPos: number;
    blockType: BlockTypeId;
  }>({ open: false, top: 0, left: 0, blockPos: 0, blockType: 'text' });
  const blockMenuOpenRef = useRef(false);
  blockMenuOpenRef.current = blockMenu.open;

  const [dropCursor, setDropCursor] = useState<{
    visible: boolean;
    top: number;
    insertPos: number;
  }>({ visible: false, top: 0, insertPos: 0 });
  const didDragHandleRef = useRef(false);

  const [bubbleState, setBubbleState] = useState<{
    open: boolean;
    top: number;
    left: number;
    blockType: BlockTypeId;
    marks: {
      strong: boolean;
      em: boolean;
      underline: boolean;
      strike: boolean;
      code: boolean;
      link: boolean;
      textColor: string | null;
      bgColor: string | null;
    };
  }>({
    open: false,
    top: 0,
    left: 0,
    blockType: 'text',
    marks: {
      strong: false,
      em: false,
      underline: false,
      strike: false,
      code: false,
      link: false,
      textColor: null,
      bgColor: null,
    },
  });

  const [linkPopover, setLinkPopover] = useState<{
    open: boolean;
    top: number;
    left: number;
    from: number;
    to: number;
    href: string;
    hasExistingLink: boolean;
  }>({
    open: false,
    top: 0,
    left: 0,
    from: 0,
    to: 0,
    href: '',
    hasExistingLink: false,
  });
  const linkPopoverOpenRef = useRef(false);
  linkPopoverOpenRef.current = linkPopover.open;

  const [slashMenu, setSlashMenu] = useState<{
    open: boolean;
    top: number;
    left: number;
    query: string;
    from: number;
    to: number;
    selectedIndex: number;
  }>({
    open: false,
    top: 0,
    left: 0,
    query: '',
    from: 0,
    to: 0,
    selectedIndex: 0,
  });
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;

  const [mentionMenu, setMentionMenu] = useState<{
    open: boolean;
    top: number;
    left: number;
    query: string;
    from: number;
    to: number;
    selectedIndex: number;
  }>({
    open: false,
    top: 0,
    left: 0,
    query: '',
    from: 0,
    to: 0,
    selectedIndex: 0,
  });
  const mentionMenuRef = useRef(mentionMenu);
  mentionMenuRef.current = mentionMenu;

  const [dbCards, setDbCards] = useState<MentionCardCandidate[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  const [whiteboardPicker, setWhiteboardPicker] = useState<{
    open: boolean;
    top: number;
    left: number;
    pos: number;
  }>({ open: false, top: 0, left: 0, pos: 0 });
  const whiteboardPickerRef = useRef(whiteboardPicker);
  whiteboardPickerRef.current = whiteboardPicker;
  const [dbWhiteboards, setDbWhiteboards] = useState<WhiteboardMentionCandidate[]>([]);
  const [wbLoading, setWbLoading] = useState(false);

  const [tableToolbar, setTableToolbar] = useState<{
    open: boolean;
    top: number;
    left: number;
  }>({ open: false, top: 0, left: 0 });

  const getContainerMetrics = useCallback(() => {
    const root = containerRef.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const width = root.offsetWidth || rect.width || 1;
    const height = root.offsetHeight || rect.height || 1;
    return {
      rect,
      width,
      height,
      scaleX: rect.width / width || 1,
      scaleY: rect.height / height || 1,
    };
  }, []);

  useEffect(() => {
    if (!mentionMenu.open) return;
    if (cardsRef.current && cardsRef.current.length > 0) {
      setDbCards(cardsRef.current);
      return;
    }
    const searchFn = onSearchCardsRef.current;
    if (!searchFn) return;

    let cancelled = false;
    setDbLoading(true);
    searchFn(mentionMenu.query)
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) {
          setDbCards(rows);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDbLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mentionMenu.open, mentionMenu.query]);

  useEffect(() => {
    if (!whiteboardPicker.open) return;
    if (whiteboardsRef.current && whiteboardsRef.current.length > 0) {
      setDbWhiteboards(whiteboardsRef.current);
      return;
    }
    let cancelled = false;
    setWbLoading(true);
    const load = async (): Promise<Array<{ id: string; name: string }>> => {
      if (onSearchWhiteboardsRef.current) {
        return onSearchWhiteboardsRef.current();
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = (rows: Array<{ id: string; name: string }>) => {
          if (!settled) {
            settled = true;
            resolve(rows);
          }
        };
        window.dispatchEvent(
          new CustomEvent('openhepta:request-whiteboards', { detail: { resolve: finish } })
        );
        setTimeout(() => finish([]), 600);
      });
    };
    load()
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) {
          setDbWhiteboards(rows);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [whiteboardPicker.open]);

  const filteredSlashItems = useMemo(() => {
    const q = slashMenu.query.trim().toLowerCase();
    if (!q) return SLASH_COMMAND_ITEMS;
    return SLASH_COMMAND_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.toLowerCase().includes(q))
    );
  }, [slashMenu.query]);
  const filteredSlashRef = useRef(filteredSlashItems);
  filteredSlashRef.current = filteredSlashItems;

  const filteredMentionItems = useMemo<MentionCardCandidate[]>(() => {
    const pool = cards && cards.length > 0 ? cards : dbCards;
    const q = mentionMenu.query.trim().toLowerCase();
    const withoutSelf = pool.filter((c) => c.id !== sourceCardId);
    const matched = q
      ? withoutSelf.filter((c) => (c.title || '').toLowerCase().includes(q))
      : withoutSelf;
    const list: MentionCardCandidate[] = matched.slice(0, 12);

    const trimmedQuery = mentionMenu.query.trim();
    if (
      trimmedQuery &&
      !matched.some((c) => (c.title || '').trim().toLowerCase() === q)
    ) {
      list.push({
        id: '__create__',
        title: trimmedQuery,
        isCreateOption: true,
      });
    }
    return list;
  }, [cards, dbCards, mentionMenu.query, sourceCardId]);
  const filteredMentionRef = useRef(filteredMentionItems);
  filteredMentionRef.current = filteredMentionItems;

  const openLinkPopoverAtSelection = useCallback(
    (explicitRange?: { from: number; to: number; href: string }) => {
      const view = editorViewRef.current;
      const metrics = getContainerMetrics();
      if (!view || !metrics || readOnlyRef.current) return false;

      const range = explicitRange || getLinkRangeAtPos(view.state);
      const startCoords = view.coordsAtPos(range.from);
      const endCoords = view.coordsAtPos(range.to);

      const rawTop =
        (Math.max(startCoords.bottom, endCoords.bottom) - metrics.rect.top) / metrics.scaleY + 8;
      const rawLeft =
        ((startCoords.left + endCoords.left) / 2 - metrics.rect.left) / metrics.scaleX - 144;

      setBubbleState((prev) => ({ ...prev, open: false }));
      setLinkPopover({
        open: true,
        top: Math.max(8, Math.min(rawTop, Math.max(8, metrics.height - 56))),
        left: Math.max(8, Math.min(rawLeft, Math.max(8, metrics.width - 296))),
        from: range.from,
        to: range.to,
        href: range.href,
        hasExistingLink: Boolean(range.href),
      });
      return true;
    },
    [getContainerMetrics]
  );

  const executeSlashCommand = useCallback((cmd: SlashCommandItem) => {
    const view = editorViewRef.current;
    if (!view) return;
    const { from, to } = slashMenuRef.current;

    if (to >= from && to <= view.state.doc.content.size) {
      view.dispatch(view.state.tr.delete(from, to));
    }

    switch (cmd.id) {
      case 'text':
      case 'h1':
      case 'h2':
      case 'h3':
      case 'checkbox':
      case 'ul':
      case 'ol':
      case 'toggle':
      case 'q':
      case 'callout':
      case 'code':
        applyBlockType(view, cmd.id as BlockTypeId);
        break;
      case 'table':
        insertTable(view, 3, 3);
        break;
      case 'math':
        insertMathDisplay(view);
        break;
      case 'inline_math':
        insertMathInline(view);
        break;
      case 'image':
        insertImageBlock(view);
        break;
      case 'video':
        insertVideoBlock(view);
        break;
      case 'divider':
        insertHorizontalRule(view);
        break;
      case 'card':
        view.dispatch(view.state.tr.insertText('[['));
        view.focus();
        return;
      case 'whiteboard': {
        const { top, left } = slashMenuRef.current;
        const insertPos = Math.min(from, view.state.doc.content.size);
        setSlashMenu((prev) => ({ ...prev, open: false }));
        setWhiteboardPicker({
          open: true,
          top,
          left,
          pos: insertPos,
        });
        return;
      }
      case 'date': {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        insertDateChip(view, `${yyyy}-${mm}-${dd}`);
        break;
      }
      case 'now': {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        insertDateChip(view, `${yyyy}-${mm}-${dd} ${hh}:${min}`);
        break;
      }
    }

    setSlashMenu((prev) => ({ ...prev, open: false }));
    view.focus();
  }, []);

  const executeSelectMention = useCallback(async (item: MentionCardCandidate) => {
    const view = editorViewRef.current;
    if (!view) return;
    const { from, to } = mentionMenuRef.current;

    let cardId = item.id;
    let cardTitle = item.title || 'Untitled';

    if (item.isCreateOption) {
      const created = onCreateCardRef.current
        ? await onCreateCardRef.current(cardTitle).catch(() => null)
        : null;
      if (created) {
        cardId = created.id;
        cardTitle = created.title || cardTitle;
      } else {
        cardId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      }
    }

    let replaceTo = to;
    if (to + 2 <= view.state.doc.content.size) {
      const afterText = view.state.doc.textBetween(to, to + 2, '', '');
      if (afterText === ']]') {
        replaceTo = to + 2;
      }
    }

    if (from >= 0 && replaceTo <= view.state.doc.content.size) {
      insertCardChip(view, from, replaceTo, cardId, cardTitle);
    }

    const srcId = sourceCardIdRef.current;
    if (srcId && cardId && srcId !== cardId && onLinkCardRef.current) {
      onLinkCardRef.current(srcId, cardId).catch(() => {});
    }

    setMentionMenu((prev) => ({ ...prev, open: false }));
  }, []);

  const executeSelectWhiteboard = useCallback(async (item: WhiteboardMentionCandidate) => {
    const view = editorViewRef.current;
    if (!view) return;
    const insertPos = Math.min(whiteboardPickerRef.current.pos, view.state.doc.content.size);
    let wbId = item.id;
    let wbName = item.name || 'Untitled Whiteboard';

    if (item.isCreateOption) {
      let created: { id: string; name: string } | null = null;
      if (onCreateWhiteboardRef.current) {
        created = await onCreateWhiteboardRef.current(wbName).catch(() => null);
      } else {
        created = await new Promise<{ id: string; name: string } | null>((resolve) => {
          let settled = false;
          const finish = (row: { id: string; name: string } | null) => {
            if (!settled) {
              settled = true;
              resolve(row);
            }
          };
          window.dispatchEvent(
            new CustomEvent('openhepta:create-whiteboard', {
              detail: { name: wbName, resolve: finish },
            })
          );
          setTimeout(() => finish(null), 1500);
        });
      }
      if (created) {
        wbId = created.id;
        wbName = created.name || wbName;
      } else {
        wbId = `wb-${Date.now()}`;
      }
    }

    insertWhiteboardChip(view, insertPos, insertPos, wbId, wbName);
    setWhiteboardPicker((prev) => ({ ...prev, open: false }));
  }, []);

  const executeSlashRef = useRef(executeSlashCommand);
  executeSlashRef.current = executeSlashCommand;
  const executeMentionRef = useRef(executeSelectMention);
  executeMentionRef.current = executeSelectMention;
  const openLinkRef = useRef(openLinkPopoverAtSelection);
  openLinkRef.current = openLinkPopoverAtSelection;

  const syncBubbleToolbar = useCallback(
    (state: EditorState, view: EditorView) => {
      const { selection } = state;
      if (
        readOnlyRef.current ||
        selection.empty ||
        linkPopoverOpenRef.current ||
        (selection instanceof NodeSelection &&
          selection.node.type === heptaSchema.nodes.horizontal_rule)
      ) {
        setBubbleState((prev) => (prev.open ? { ...prev, open: false } : prev));
        return;
      }

      const metrics = getContainerMetrics();
      if (!metrics) return;

      const startCoords = view.coordsAtPos(selection.from);
      const endCoords = view.coordsAtPos(selection.to);
      const topLine = Math.min(startCoords.top, endCoords.top);
      const bottomLine = Math.max(startCoords.bottom, endCoords.bottom);

      let localTop = (topLine - metrics.rect.top) / metrics.scaleY - 44;
      if (localTop < 6) {
        localTop = (bottomLine - metrics.rect.top) / metrics.scaleY + 8;
      }

      const centerX =
        ((startCoords.left + endCoords.left) / 2 - metrics.rect.left) / metrics.scaleX;
      const estimatedToolbarWidth = 340;
      const clampedLeft = Math.max(
        6,
        Math.min(centerX - estimatedToolbarWidth / 2, Math.max(6, metrics.width - estimatedToolbarWidth - 6))
      );

      setBubbleState({
        open: true,
        top: localTop,
        left: clampedLeft,
        blockType: currentBlockType(state),
        marks: {
          strong: isMarkActive(state, heptaSchema.marks.strong),
          em: isMarkActive(state, heptaSchema.marks.em),
          underline: isMarkActive(state, heptaSchema.marks.underline),
          strike: isMarkActive(state, heptaSchema.marks.strike),
          code: isMarkActive(state, heptaSchema.marks.code),
          link: isMarkActive(state, heptaSchema.marks.link),
          textColor: activeColor(state, 'text'),
          bgColor: activeColor(state, 'background'),
        },
      });
    },
    [getContainerMetrics]
  );

  const syncTableToolbar = useCallback(
    (state: EditorState, view: EditorView) => {
      if (readOnlyRef.current || !isInTable(state)) {
        setTableToolbar((prev) => (prev.open ? { ...prev, open: false } : prev));
        return;
      }
      const metrics = getContainerMetrics();
      if (!metrics) return;
      try {
        const domInfo = view.domAtPos(state.selection.$from.pos);
        const el =
          domInfo.node instanceof HTMLElement
            ? domInfo.node
            : domInfo.node.parentElement;
        const tableEl = el?.closest('table') as HTMLElement | null;
        if (!tableEl) {
          setTableToolbar((prev) => (prev.open ? { ...prev, open: false } : prev));
          return;
        }
        const tRect = tableEl.getBoundingClientRect();
        const top = Math.max(4, (tRect.top - metrics.rect.top) / metrics.scaleY - 30);
        const left = Math.max(
          24,
          Math.min(
            (tRect.left - metrics.rect.left) / metrics.scaleX,
            Math.max(24, metrics.width - 250)
          )
        );
        setTableToolbar({ open: true, top, left });
      } catch {
        setTableToolbar((prev) => (prev.open ? { ...prev, open: false } : prev));
      }
    },
    [getContainerMetrics]
  );

  const syncTriggerOverlays = useCallback(
    (state: EditorState, view: EditorView) => {
      if (readOnlyRef.current) return;
      const trigger = detectEditorTrigger(state);
      const metrics = getContainerMetrics();
      if (!trigger || !metrics) {
        setSlashMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
        setMentionMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
        return;
      }

      const coords = view.coordsAtPos(trigger.from);
      const maxDropdownHeight = 310;
      let top = coords.bottom + 6;
      if (top + maxDropdownHeight > window.innerHeight - 12 && coords.top > maxDropdownHeight + 12) {
        top = Math.max(8, coords.top - maxDropdownHeight - 6);
      } else {
        top = Math.min(top, Math.max(8, window.innerHeight - maxDropdownHeight - 12));
      }

      if (trigger.type === 'mention') {
        const left = Math.max(
          8,
          Math.min(coords.left, Math.max(8, window.innerWidth - 268))
        );
        setSlashMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
        setMentionMenu((prev) => ({
          open: true,
          top,
          left,
          query: trigger.query,
          from: trigger.from,
          to: trigger.to,
          selectedIndex: prev.open && prev.query === trigger.query ? prev.selectedIndex : 0,
        }));
      } else {
        const left = Math.max(
          8,
          Math.min(coords.left, Math.max(8, window.innerWidth - 252))
        );
        setMentionMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
        setSlashMenu((prev) => ({
          open: true,
          top,
          left,
          query: trigger.query,
          from: trigger.from,
          to: trigger.to,
          selectedIndex: prev.open && prev.query === trigger.query ? prev.selectedIndex : 0,
        }));
      }
    },
    [getContainerMetrics]
  );

  useEffect(() => {
    if (!editorMountRef.current) return;

    const initialDoc = parseInitialDoc(initialContent);
    const state = EditorState.create({
      schema: heptaSchema,
      doc: initialDoc,
      plugins: [
        history(),
        columnResizing(),
        tableEditing(),
        keymap(
          buildKeymap({
            onOpenLinkPopover: () => openLinkRef.current(),
            onToggleHighlight: () => {
              const v = editorViewRef.current;
              if (!v || v.state.selection.empty) return false;
              const currentBg = activeColor(v.state, 'background');
              setColor(v, 'background', currentBg ? null : 'yellow');
              return true;
            },
            onInsertInlineMath: () => {
              const v = editorViewRef.current;
              if (!v) return false;
              insertMathInline(v);
              return true;
            },
          })
        ),
        buildInputRules(),
        placeholderPlugin(placeholder, () => readOnlyRef.current),
        inlineTagHighlightPlugin(),
        keymap(baseKeymap),
      ],
    });

    const view = new EditorView(editorMountRef.current, {
      state,
      editable: () => !readOnlyRef.current,
      attributes: {
        class: `ProseMirror-hepta-style focus:outline-none min-h-full${
          readOnlyRef.current ? ' ProseMirror-readonly' : ''
        }`,
      },
      nodeViews: {
        code_block: (node, v, getPos) => new HeptaCodeBlockView(node, v, getPos),
        math_inline: (node, v, getPos) => new HeptaMathView(node, v, getPos, false),
        math_display: (node, v, getPos) => new HeptaMathView(node, v, getPos, true),
        image: (node, v, getPos) => new HeptaImageView(node, v, getPos),
        video: (node, v, getPos) => new HeptaVideoView(node, v, getPos),
      },
      dispatchTransaction(tr: Transaction) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        syncTriggerOverlays(newState, view);
        syncBubbleToolbar(newState, view);
        syncTableToolbar(newState, view);

        if (tr.docChanged && onChangeRef.current) {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            const doc = newState.doc;
            onChangeRef.current?.({
              json: docToJson(doc),
              text: docToPlainText(doc),
              html: docToHtml(doc),
            });
          }, 200);
        }
      },
      handleKeyDown(_v, event) {

        if (slashMenuRef.current.open) {
          const items = filteredSlashRef.current;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (items.length > 0) {
              setSlashMenu((prev) => ({
                ...prev,
                selectedIndex: (prev.selectedIndex + 1) % items.length,
              }));
            }
            return true;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (items.length > 0) {
              setSlashMenu((prev) => ({
                ...prev,
                selectedIndex: (prev.selectedIndex - 1 + items.length) % items.length,
              }));
            }
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            if (items.length > 0) {
              event.preventDefault();
              const idx = Math.min(slashMenuRef.current.selectedIndex, items.length - 1);
              executeSlashRef.current(items[idx]);
              return true;
            }
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setSlashMenu((prev) => ({ ...prev, open: false }));
            return true;
          }
        }

        if (mentionMenuRef.current.open) {
          const items = filteredMentionRef.current;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (items.length > 0) {
              setMentionMenu((prev) => ({
                ...prev,
                selectedIndex: (prev.selectedIndex + 1) % items.length,
              }));
            }
            return true;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (items.length > 0) {
              setMentionMenu((prev) => ({
                ...prev,
                selectedIndex: (prev.selectedIndex - 1 + items.length) % items.length,
              }));
            }
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            if (items.length > 0) {
              event.preventDefault();
              const idx = Math.min(mentionMenuRef.current.selectedIndex, items.length - 1);
              executeMentionRef.current(items[idx]);
              return true;
            }
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setMentionMenu((prev) => ({ ...prev, open: false }));
            return true;
          }
        }

        if (event.key === 'Escape') {
          setBlockMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
          setLinkPopover((prev) => (prev.open ? { ...prev, open: false } : prev));
        }

        return false;
      },
      handleClick(v, _pos, event) {
        const target = event.target as HTMLElement;

        const taskLi = target.closest('li.hepta-task-item') as HTMLElement | null;
        if (taskLi && !readOnlyRef.current) {
          const rect = taskLi.getBoundingClientRect();
          if (event.clientX - rect.left < 26) {
            const domPos = v.posAtDOM(taskLi, 0);
            const $pos = v.state.doc.resolve(domPos);
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type === heptaSchema.nodes.list_item) {
                const itemNode = $pos.node(d);
                if (itemNode.attrs.checked !== null) {
                  event.preventDefault();
                  const tr = v.state.tr.setNodeMarkup($pos.before(d), undefined, {
                    ...itemNode.attrs,
                    checked: !itemNode.attrs.checked,
                  });
                  v.dispatch(tr);
                  return true;
                }
              }
            }
          }
        }

        const toggleLi = target.closest('ul[data-toggle-list] > li') as HTMLElement | null;
        if (toggleLi) {
          const rect = toggleLi.getBoundingClientRect();
          if (event.clientX - rect.left < 24) {
            const domPos = v.posAtDOM(toggleLi, 0);
            const $pos = v.state.doc.resolve(domPos);
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type === heptaSchema.nodes.list_item) {
                const itemNode = $pos.node(d);
                event.preventDefault();
                const tr = v.state.tr.setNodeMarkup($pos.before(d), undefined, {
                  ...itemNode.attrs,
                  folded: !itemNode.attrs.folded,
                });
                v.dispatch(tr);
                return true;
              }
            }
          }
        }

        const calloutEl = target.closest('div.hepta-callout') as HTMLElement | null;
        if (calloutEl && !readOnlyRef.current) {
          const rect = calloutEl.getBoundingClientRect();
          if (event.clientX - rect.left < 34 && event.clientY - rect.top < 36) {
            const domPos = v.posAtDOM(calloutEl, 0);
            const $pos = v.state.doc.resolve(domPos);
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type === heptaSchema.nodes.callout) {
                const cNode = $pos.node(d);
                const curIdx = CALLOUT_ICONS.indexOf(cNode.attrs.icon || '💡');
                const nextIcon = CALLOUT_ICONS[(curIdx + 1) % CALLOUT_ICONS.length];
                event.preventDefault();
                v.dispatch(
                  v.state.tr.setNodeMarkup($pos.before(d), undefined, {
                    ...cNode.attrs,
                    icon: nextIcon,
                  })
                );
                return true;
              }
            }
          }
        }

        const cardChip = target.closest('.hepta-card-chip') as HTMLElement | null;
        if (cardChip) {
          const cardId = cardChip.getAttribute('data-card-id');
          if (cardId) {
            event.preventDefault();
            onOpenCardRef.current?.(cardId);
            window.dispatchEvent(
              new CustomEvent('openhepta:open-card', { detail: { cardId } })
            );
            return true;
          }
        }

        const wbChip = target.closest('.hepta-whiteboard-chip') as HTMLElement | null;
        if (wbChip) {
          const whiteboardId = wbChip.getAttribute('data-whiteboard-id');
          if (whiteboardId) {
            event.preventDefault();
            onOpenWhiteboardRef.current?.(whiteboardId);
            window.dispatchEvent(
              new CustomEvent('openhepta:open-whiteboard', { detail: { whiteboardId } })
            );
            return true;
          }
        }

        const anchor = target.closest('a.hepta-link') as HTMLAnchorElement | null;
        if (anchor) {
          event.preventDefault();
          const href = anchor.getAttribute('href') || '';
          if (event.ctrlKey || event.metaKey || readOnlyRef.current) {
            if (href && !href.startsWith('hepta://')) {
              window.open(href, '_blank', 'noopener,noreferrer');
            }
            return true;
          }

          const domPos = v.posAtDOM(anchor, 0);
          const selTr = v.state.tr.setSelection(
            Selection.near(v.state.doc.resolve(domPos))
          );
          v.dispatch(selTr);
          const linkRange = getLinkRangeAtPos(v.state);
          openLinkRef.current(linkRange);
          return true;
        }

        return false;
      },
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view || initialContent === undefined) return;
    if (view.hasFocus()) return;

    const currentText = docToPlainText(view.state.doc);
    const currentJson = docToJson(view.state.doc);

    if (currentText !== initialContent && currentJson !== initialContent) {
      const nextDoc = parseInitialDoc(initialContent);
      const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content);
      view.dispatch(tr);
    }
  }, [initialContent]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.setProps({
      editable: () => !readOnly,
      attributes: {
        class: `ProseMirror-hepta-style focus:outline-none min-h-full${
          readOnly ? ' ProseMirror-readonly' : ''
        }`,
      },
    });
    if (readOnly) {
      setActiveBlock((prev) => ({ ...prev, visible: false }));
      setBubbleState((prev) => ({ ...prev, open: false }));
      setSlashMenu((prev) => ({ ...prev, open: false }));
      setMentionMenu((prev) => ({ ...prev, open: false }));
      setBlockMenu((prev) => ({ ...prev, open: false }));
      setLinkPopover((prev) => ({ ...prev, open: false }));
      setTableToolbar((prev) => ({ ...prev, open: false }));
    }
  }, [readOnly]);

  const handleEditorMouseMove = (e: React.MouseEvent) => {
    if (readOnly || blockMenuOpenRef.current) return;
    const target = e.target as HTMLElement;
    const view = editorViewRef.current;
    const metrics = getContainerMetrics();
    if (!view || !metrics) return;

    const blockEl = target.closest('.ProseMirror > *') as HTMLElement | null;
    if (!blockEl) return;

    const blockRect = blockEl.getBoundingClientRect();
    const localTop = Math.max(0, (blockRect.top - metrics.rect.top) / metrics.scaleY + 2);

    let blockPos = 0;
    let nodeType = 'paragraph';
    try {
      const domPos = view.posAtDOM(blockEl, 0);
      const topBlock = getTopLevelBlockAtPos(view.state.doc, domPos);
      if (topBlock) {
        blockPos = topBlock.pos;
        nodeType = topBlock.node.type.name;
      }
    } catch {
      void 0;
    }

    setActiveBlock({
      visible: true,
      top: localTop,
      pos: blockPos,
      nodeType,
      text: blockEl.innerText || '',
    });
  };

  const handleEditorMouseLeave = (e: React.MouseEvent) => {
    if (blockMenuOpenRef.current) return;
    const related = e.relatedTarget as HTMLElement | null;
    if (related && related.closest('.block-drag-handle, .hepta-block-menu')) return;
    setActiveBlock((prev) => ({ ...prev, visible: false }));
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    if (!e.dataTransfer.types.includes('application/openhepta-internal-block')) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';

    const view = editorViewRef.current;
    const metrics = getContainerMetrics();
    if (!view || !metrics) return;

    const pmRoot = editorMountRef.current?.querySelector('.ProseMirror');
    if (!pmRoot) return;

    const children = Array.from(pmRoot.children) as HTMLElement[];
    if (children.length === 0) return;

    let bestTop = 0;
    let bestInsertPos = 0;
    let minDistance = Infinity;

    let docOffset = 0;
    for (let i = 0; i < view.state.doc.childCount; i++) {
      const childNode = view.state.doc.child(i);
      const childDom = view.nodeDOM(docOffset) as HTMLElement | null;
      if (childDom && childDom.getBoundingClientRect) {
        const rect = childDom.getBoundingClientRect();
        const distTop = Math.abs(e.clientY - rect.top);
        const distBottom = Math.abs(e.clientY - rect.bottom);

        if (distTop < minDistance) {
          minDistance = distTop;
          bestTop = (rect.top - metrics.rect.top) / metrics.scaleY;
          bestInsertPos = docOffset;
        }
        if (distBottom < minDistance) {
          minDistance = distBottom;
          bestTop = (rect.bottom - metrics.rect.top) / metrics.scaleY;
          bestInsertPos = docOffset + childNode.nodeSize;
        }
      }
      docOffset += childNode.nodeSize;
    }

    setDropCursor({ visible: true, top: Math.max(0, bestTop), insertPos: bestInsertPos });
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    setDropCursor((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    if (readOnly) return;

    const internalRaw = e.dataTransfer.getData('application/openhepta-internal-block');
    if (!internalRaw) return;

    try {
      const parsed = JSON.parse(internalRaw) as { editorId: string; pos: number };
      if (parsed.editorId === editorId && editorViewRef.current) {
        e.preventDefault();
        e.stopPropagation();
        moveBlock(editorViewRef.current, parsed.pos, dropCursor.insertPos, e.altKey);
      }
    } catch {
      return;
    }
  };

  const activeBlockTypeId = useMemo<BlockTypeId>(() => {
    switch (activeBlock.nodeType) {
      case 'task_list':
        return 'checkbox';
      case 'toggle_list':
        return 'toggle';
      case 'bullet_list':
        return 'ul';
      case 'ordered_list':
        return 'ol';
      case 'callout':
        return 'callout';
      case 'blockquote':
        return 'q';
      case 'code_block':
        return 'code';
      default:
        return 'text';
    }
  }, [activeBlock.nodeType]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleEditorMouseMove}
      onMouseLeave={handleEditorMouseLeave}
      onDragOver={handleContainerDragOver}
      onDragLeave={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setDropCursor((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        }
      }}
      onDrop={handleContainerDrop}
      className={`card-editor-root hepta-editor-scope relative flex flex-col h-full w-full ${className}`}
    >

      {(activeBlock.visible || blockMenu.open) && !readOnly && (
        <button
          type="button"
          draggable
          onMouseDown={(e) => {
            e.stopPropagation();
            didDragHandleRef.current = false;
          }}
          onDragStart={(e) => {
            didDragHandleRef.current = true;
            setBlockMenu((prev) => ({ ...prev, open: false }));

            e.dataTransfer.setData(
              'application/openhepta-internal-block',
              JSON.stringify({ editorId, pos: activeBlock.pos })
            );

            const text = activeBlock.text.trim();
            if (text) {
              const lines = text.split('\n').filter(Boolean);
              const title = lines[0]?.slice(0, 48) || 'Extracted Card';
              e.dataTransfer.setData(
                'application/openhepta-block',
                JSON.stringify({ title, content: text, sourceCardId })
              );
              e.dataTransfer.setData('text/plain', text);
            }
            e.dataTransfer.effectAllowed = 'copyMove';

            const ghost = document.createElement('div');
            ghost.className = 'proseMirrorDraggingPreview';
            ghost.style.position = 'absolute';
            ghost.style.top = '-9999px';
            ghost.style.padding = '6px 12px';
            ghost.style.background = 'var(--menu-bg, #2a2a2a)';
            ghost.style.color = 'var(--text-color, #ffffff)';
            ghost.style.border = '1px solid var(--active-item, #207dff)';
            ghost.style.borderRadius = '8px';
            ghost.style.fontSize = '12px';
            ghost.style.fontWeight = '500';
            ghost.style.boxShadow = 'var(--shadow-main)';
            ghost.style.maxWidth = '260px';
            ghost.style.whiteSpace = 'nowrap';
            ghost.style.overflow = 'hidden';
            ghost.style.textOverflow = 'ellipsis';
            ghost.innerText = text ? text.split('\n')[0].slice(0, 48) : 'Move block';
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 12, 12);
            setTimeout(() => ghost.remove(), 0);
          }}
          onDragEnd={() => {
            setDropCursor((prev) => ({ ...prev, visible: false }));
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (didDragHandleRef.current) return;
            const view = editorViewRef.current;
            let resolvedType = activeBlockTypeId;
            if (view) {
              const node = view.state.doc.nodeAt(activeBlock.pos);
              if (node?.type === heptaSchema.nodes.heading) {
                resolvedType = `h${Math.min(3, node.attrs.level)}` as BlockTypeId;
              }
            }
            setBlockMenu((prev) =>
              prev.open
                ? { ...prev, open: false }
                : {
                    open: true,
                    top: activeBlock.top + 22,
                    left: 2,
                    blockPos: activeBlock.pos,
                    blockType: resolvedType,
                  }
            );
          }}
          style={{
            position: 'absolute',
            left: 0,
            top: activeBlock.top,
            zIndex: 40,
          }}
          className="block-drag-handle w-5 h-5 rounded flex items-center justify-center text-middle-grey hover:text-text-color hover:bg-light-grey cursor-grab active:cursor-grabbing transition-colors select-none"
          title="Drag to move or extract to whiteboard • Click for block menu"
        >
          <GripVertical size={13} />
        </button>
      )}

      {dropCursor.visible && (
        <div
          style={{
            position: 'absolute',
            left: 24,
            right: 4,
            top: dropCursor.top - 1,
            height: 2,
            zIndex: 45,
          }}
          className="bg-active-item rounded-full pointer-events-none shadow-sm"
        />
      )}

      {blockMenu.open && !readOnly && (
        <BlockContextMenu
          top={blockMenu.top}
          left={blockMenu.left}
          currentType={blockMenu.blockType}
          onTurnInto={(typeId) => {
            if (editorViewRef.current) {
              applyBlockTypeAtPos(editorViewRef.current, blockMenu.blockPos, typeId);
            }
          }}
          onDuplicate={() => {
            if (editorViewRef.current) {
              duplicateBlockAtPos(editorViewRef.current, blockMenu.blockPos);
            }
          }}
          onCopyLink={() => {
            const link = `hepta://cards/${sourceCardId || 'card'}#block-${blockMenu.blockPos}`;
            navigator.clipboard?.writeText(link).catch(() => {});
          }}
          onDelete={() => {
            if (editorViewRef.current) {
              deleteBlockAtPos(editorViewRef.current, blockMenu.blockPos);
            }
          }}
          onClose={() => setBlockMenu((prev) => ({ ...prev, open: false }))}
        />
      )}

      {bubbleState.open && !readOnly && (
        <BubbleToolbar
          top={bubbleState.top}
          left={bubbleState.left}
          activeBlockType={bubbleState.blockType}
          activeMarks={bubbleState.marks}
          onTurnInto={(typeId) => {
            const view = editorViewRef.current;
            if (view) {
              applyBlockType(view, typeId);
              view.focus();
            }
          }}
          onToggleMark={(markName) => {
            const view = editorViewRef.current;
            if (!view) return;
            toggleMark(heptaSchema.marks[markName])(view.state, view.dispatch);
            view.focus();
          }}
          onInsertInlineMath={() => {
            const view = editorViewRef.current;
            if (!view) return;
            insertMathInline(view);
            view.focus();
          }}
          onToggleHighlight={() => {
            const view = editorViewRef.current;
            if (!view) return;
            setColor(view, 'background', bubbleState.marks.bgColor ? null : 'yellow');
            view.focus();
          }}
          onSetColor={(type, color) => {
            const view = editorViewRef.current;
            if (!view) return;
            setColor(view, type, color);
            view.focus();
          }}
          onOpenLinkPopover={() => openLinkPopoverAtSelection()}
        />
      )}

      {linkPopover.open && !readOnly && (
        <LinkPopover
          top={linkPopover.top}
          left={linkPopover.left}
          initialHref={linkPopover.href}
          hasExistingLink={linkPopover.hasExistingLink}
          onApply={(href) => {
            const view = editorViewRef.current;
            if (view) {
              setLink(view, linkPopover.from, linkPopover.to, href);
              view.focus();
            }
            setLinkPopover((prev) => ({ ...prev, open: false }));
          }}
          onRemove={() => {
            const view = editorViewRef.current;
            if (view) {
              setLink(view, linkPopover.from, linkPopover.to, null);
              view.focus();
            }
            setLinkPopover((prev) => ({ ...prev, open: false }));
          }}
          onClose={() => {
            setLinkPopover((prev) => ({ ...prev, open: false }));
            editorViewRef.current?.focus();
          }}
        />
      )}

      {slashMenu.open && !readOnly && (
        <SlashMenu
          top={slashMenu.top}
          left={slashMenu.left}
          query={slashMenu.query}
          items={filteredSlashItems}
          selectedIndex={Math.min(
            slashMenu.selectedIndex,
            Math.max(0, filteredSlashItems.length - 1)
          )}
          onHoverIndex={(idx) => setSlashMenu((prev) => ({ ...prev, selectedIndex: idx }))}
          onSelect={executeSlashCommand}
        />
      )}

      {mentionMenu.open && !readOnly && (
        <MentionMenu
          top={mentionMenu.top}
          left={mentionMenu.left}
          query={mentionMenu.query}
          items={filteredMentionItems}
          selectedIndex={Math.min(
            mentionMenu.selectedIndex,
            Math.max(0, filteredMentionItems.length - 1)
          )}
          loading={dbLoading}
          onHoverIndex={(idx) => setMentionMenu((prev) => ({ ...prev, selectedIndex: idx }))}
          onSelect={executeSelectMention}
        />
      )}

      {whiteboardPicker.open && !readOnly && (
        <WhiteboardPickerMenu
          top={whiteboardPicker.top}
          left={whiteboardPicker.left}
          items={dbWhiteboards}
          loading={wbLoading}
          onSelect={executeSelectWhiteboard}
          onClose={() => {
            setWhiteboardPicker((prev) => ({ ...prev, open: false }));
            editorViewRef.current?.focus();
          }}
        />
      )}

      {tableToolbar.open && !readOnly && (
        <TableToolbar
          top={tableToolbar.top}
          left={tableToolbar.left}
          onAddRow={() => {
            const v = editorViewRef.current;
            if (v) {
              addRowAfter(v.state, v.dispatch);
              v.focus();
            }
          }}
          onAddColumn={() => {
            const v = editorViewRef.current;
            if (v) {
              addColumnAfter(v.state, v.dispatch);
              v.focus();
            }
          }}
          onDeleteRow={() => {
            const v = editorViewRef.current;
            if (v) {
              deleteRow(v.state, v.dispatch);
              v.focus();
            }
          }}
          onDeleteColumn={() => {
            const v = editorViewRef.current;
            if (v) {
              deleteColumn(v.state, v.dispatch);
              v.focus();
            }
          }}
          onDeleteTable={() => {
            const v = editorViewRef.current;
            if (v) {
              deleteTable(v.state, v.dispatch);
              v.focus();
            }
          }}
        />
      )}

      <div
        className={`flex-1 w-full overflow-y-auto transition-[padding] duration-150 ${
          readOnly ? 'pl-0.5 pr-0.5 cursor-default' : 'pl-6 pr-1 cursor-text'
        }`}
        style={{ scrollbarGutter: 'stable' }}
      >
        <div ref={editorMountRef} className="native-prosemirror-container h-full" />
      </div>
    </div>
  );
}
