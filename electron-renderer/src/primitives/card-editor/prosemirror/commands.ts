import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { setBlockType, wrapIn, lift } from 'prosemirror-commands';
import { wrapInList, liftListItem } from 'prosemirror-schema-list';
import { MarkType, Node as PMNode, NodeType } from 'prosemirror-model';
import {
  isInTable,
  addRowAfter,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
} from 'prosemirror-tables';
import { heptaSchema } from './schema';

const { nodes, marks } = heptaSchema;

export type BlockTypeId =
  | 'text'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'checkbox'
  | 'ul'
  | 'ol'
  | 'toggle'
  | 'q'
  | 'callout'
  | 'code';

export const TURN_INTO_ITEMS: { id: BlockTypeId; label: string; shortLabel: string }[] = [
  { id: 'text', label: 'Text', shortLabel: 'Text' },
  { id: 'h1', label: 'Heading 1', shortLabel: 'H1' },
  { id: 'h2', label: 'Heading 2', shortLabel: 'H2' },
  { id: 'h3', label: 'Heading 3', shortLabel: 'H3' },
  { id: 'checkbox', label: 'Todo list', shortLabel: 'Todo' },
  { id: 'ul', label: 'Bullet list', shortLabel: 'List' },
  { id: 'ol', label: 'Number list', shortLabel: '1. List' },
  { id: 'toggle', label: 'Toggle list', shortLabel: 'Toggle' },
  { id: 'q', label: 'Quote', shortLabel: 'Quote' },
  { id: 'callout', label: 'Callout', shortLabel: 'Callout' },
  { id: 'code', label: 'Code block', shortLabel: 'Code' },
];

export function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return Boolean(type.isInSet(state.storedMarks || $from.marks()));
  return state.doc.rangeHasMark(from, to, type);
}

export function currentBlockType(state: EditorState): BlockTypeId {
  const $from = state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type === nodes.task_list) return 'checkbox';
    if (n.type === nodes.toggle_list) return 'toggle';
    if (n.type === nodes.bullet_list) return 'ul';
    if (n.type === nodes.ordered_list) return 'ol';
    if (n.type === nodes.callout) return 'callout';
    if (n.type === nodes.blockquote) return 'q';
  }
  const p = $from.parent;
  if (p.type === nodes.heading) return `h${Math.min(3, p.attrs.level)}` as BlockTypeId;
  if (p.type === nodes.code_block) return 'code';
  return 'text';
}

function unwrapAll(view: EditorView) {
  for (let i = 0; i < 8; i++) {
    const { $from } = view.state.selection;
    let wrapped = false;
    for (let d = $from.depth; d > 0; d--) {
      const t = $from.node(d).type;
      if (t === nodes.list_item || t === nodes.blockquote || t === nodes.callout) {
        wrapped = true;
      }
    }
    if (!wrapped) return;
    if (
      !liftListItem(nodes.list_item)(view.state, view.dispatch) &&
      !lift(view.state, view.dispatch)
    ) {
      return;
    }
  }
}

function wrapTaskList(view: EditorView) {
  const { state, dispatch } = view;
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to);
  if (!range) return;
  const items: PMNode[] = [];
  state.doc.nodesBetween(range.start, range.end, (node, _pos, parent) => {
    if (parent === range.parent && node.isTextblock) {
      const para =
        node.type === nodes.paragraph ? node : nodes.paragraph.create(null, node.content);
      items.push(nodes.list_item.create({ checked: false }, para));
    }
    return parent === range.parent;
  });
  if (!items.length) return;
  const tr = state.tr.replaceRangeWith(range.start, range.end, nodes.task_list.create(null, items));
  tr.setSelection(
    TextSelection.near(tr.doc.resolve(Math.min(range.start + 3, tr.doc.content.size)))
  );
  dispatch(tr.scrollIntoView());
}

export function applyBlockType(view: EditorView, id: BlockTypeId) {
  const current = currentBlockType(view.state);
  unwrapAll(view);
  if (current === id && id !== 'text') {
    setBlockType(nodes.paragraph)(view.state, view.dispatch);
    return;
  }
  setBlockType(nodes.paragraph)(view.state, view.dispatch);
  switch (id) {
    case 'text':
      break;
    case 'h1':
    case 'h2':
    case 'h3':
      setBlockType(nodes.heading, { level: Number(id[1]) })(view.state, view.dispatch);
      break;
    case 'code':
      setBlockType(nodes.code_block)(view.state, view.dispatch);
      break;
    case 'ul':
      wrapInList(nodes.bullet_list)(view.state, view.dispatch);
      break;
    case 'ol':
      wrapInList(nodes.ordered_list)(view.state, view.dispatch);
      break;
    case 'toggle':
      wrapInList(nodes.toggle_list)(view.state, view.dispatch);
      break;
    case 'q':
      wrapIn(nodes.blockquote)(view.state, view.dispatch);
      break;
    case 'callout':
      wrapIn(nodes.callout, { icon: '💡', color: 'gray' })(view.state, view.dispatch);
      break;
    case 'checkbox':
      wrapTaskList(view);
      break;
  }
}

export function getTopLevelBlockAtPos(
  doc: PMNode,
  pos: number
): { pos: number; node: PMNode; index: number } | null {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamped);
  if ($pos.depth === 0) {
    const node = doc.nodeAt(clamped);
    if (!node) return null;
    let offset = 0;
    for (let i = 0; i < doc.childCount; i++) {
      if (offset === clamped) return { pos: offset, node, index: i };
      offset += doc.child(i).nodeSize;
    }
    return null;
  }
  const blockPos = $pos.before(1);
  const blockNode = $pos.node(1);
  return { pos: blockPos, node: blockNode, index: $pos.index(0) };
}

export function applyBlockTypeAtPos(view: EditorView, blockPos: number, id: BlockTypeId) {
  const node = view.state.doc.nodeAt(blockPos);
  if (!node) return;

  if (node.type === nodes.horizontal_rule) {
    const tr = view.state.tr.replaceWith(
      blockPos,
      blockPos + node.nodeSize,
      nodes.paragraph.create()
    );
    tr.setSelection(TextSelection.near(tr.doc.resolve(blockPos + 1), 1));
    view.dispatch(tr);
  } else {
    const targetPos = Math.min(blockPos + 1, view.state.doc.content.size);
    const tr = view.state.tr.setSelection(
      TextSelection.near(view.state.doc.resolve(targetPos), 1)
    );
    view.dispatch(tr);
  }

  applyBlockType(view, id);
  view.focus();
}

export function duplicateBlockAtPos(view: EditorView, blockPos: number) {
  const node = view.state.doc.nodeAt(blockPos);
  if (!node) return;
  const insertPos = blockPos + node.nodeSize;
  const copy = node.copy(node.content);
  const tr = view.state.tr.insert(insertPos, copy);
  const nextSelPos = Math.min(insertPos + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(nextSelPos), 1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function deleteBlockAtPos(view: EditorView, blockPos: number) {
  const { state } = view;
  const node = state.doc.nodeAt(blockPos);
  if (!node) return;

  let tr = state.tr;
  if (state.doc.childCount <= 1 && blockPos === 0) {
    tr = tr.replaceWith(0, node.nodeSize, nodes.paragraph.create());
    tr.setSelection(TextSelection.near(tr.doc.resolve(1), 1));
  } else {
    tr = tr.delete(blockPos, blockPos + node.nodeSize);
    const target = Math.min(blockPos, tr.doc.content.size);
    tr.setSelection(TextSelection.near(tr.doc.resolve(target), 1));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function moveBlock(
  view: EditorView,
  fromPos: number,
  toPos: number,
  copy = false
) {
  const { state } = view;
  const sourceNode = state.doc.nodeAt(fromPos);
  if (!sourceNode) return;

  if (!copy && (toPos === fromPos || toPos === fromPos + sourceNode.nodeSize)) {
    return;
  }

  let tr = state.tr;
  let insertAt = toPos;
  if (!copy) {
    tr = tr.delete(fromPos, fromPos + sourceNode.nodeSize);
    insertAt = tr.mapping.map(toPos);
  }
  const cloned = sourceNode.copy(sourceNode.content);
  tr = tr.insert(insertAt, cloned);
  const selPos = Math.min(insertAt + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(selPos), 1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function insertHorizontalRule(view: EditorView) {
  const { state } = view;
  const { $from } = state.selection;
  const blockEnd = $from.depth > 0 ? $from.after(1) : state.selection.to;
  const emptyPara =
    $from.parent.type === nodes.paragraph && $from.parent.content.size === 0 && $from.depth === 1;
  const tr = state.tr;
  if (emptyPara) {
    tr.replaceWith($from.before(1), $from.after(1), [
      nodes.horizontal_rule.create(),
      nodes.paragraph.create(),
    ]);
  } else {
    tr.insert(blockEnd, [nodes.horizontal_rule.create(), nodes.paragraph.create()]);
  }
  const target = tr.mapping.map(blockEnd);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(target, tr.doc.content.size)), 1));
  view.dispatch(tr.scrollIntoView());
}

export function insertDateChip(view: EditorView, dateText: string) {
  const { state } = view;
  const node = nodes.date.create({ date: dateText });
  const tr = state.tr.replaceSelectionWith(node);
  tr.insertText(' ');
  view.dispatch(tr.scrollIntoView());
}

export function insertTable(view: EditorView, rows = 3, cols = 3) {
  const { state } = view;
  const headerCells: PMNode[] = [];
  for (let c = 0; c < cols; c++) {
    headerCells.push(nodes.table_header.create(null, nodes.paragraph.create()));
  }
  const tableRows: PMNode[] = [nodes.table_row.create(null, headerCells)];
  for (let r = 1; r < rows; r++) {
    const cells: PMNode[] = [];
    for (let c = 0; c < cols; c++) {
      cells.push(nodes.table_cell.create(null, nodes.paragraph.create()));
    }
    tableRows.push(nodes.table_row.create(null, cells));
  }
  const table = nodes.table.create(null, tableRows);
  const { $from } = state.selection;
  const emptyPara =
    $from.parent.type === nodes.paragraph && $from.parent.content.size === 0 && $from.depth === 1;

  const tr = state.tr;
  const insertStart = emptyPara ? $from.before(1) : $from.depth > 0 ? $from.after(1) : state.selection.to;
  if (emptyPara) {
    tr.replaceWith($from.before(1), $from.after(1), [table, nodes.paragraph.create()]);
  } else {
    tr.insert(insertStart, [table, nodes.paragraph.create()]);
  }
  const firstCellPos = Math.min(insertStart + 4, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(firstCellPos), 1));
  view.dispatch(tr.scrollIntoView());
}

export function insertMathDisplay(view: EditorView, initialLatex = '') {
  const { state } = view;
  const content = initialLatex ? [state.schema.text(initialLatex)] : [];
  const mathNode = nodes.math_display.create(null, content);
  const { $from } = state.selection;
  const emptyPara =
    $from.parent.type === nodes.paragraph && $from.parent.content.size === 0 && $from.depth === 1;
  const tr = state.tr;
  if (emptyPara) {
    tr.replaceWith($from.before(1), $from.after(1), [mathNode, nodes.paragraph.create()]);
  } else {
    const pos = $from.depth > 0 ? $from.after(1) : state.selection.to;
    tr.insert(pos, [mathNode, nodes.paragraph.create()]);
  }
  view.dispatch(tr.scrollIntoView());
}

export function insertMathInline(view: EditorView) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const selectedText = empty ? '' : state.doc.textBetween(from, to, ' ', ' ');
  const content = selectedText ? [state.schema.text(selectedText)] : [];
  const mathNode = nodes.math_inline.create(null, content);
  const tr = state.tr.replaceSelectionWith(mathNode);
  view.dispatch(tr.scrollIntoView());
}

export function insertImageBlock(view: EditorView, src = '') {
  const { state } = view;
  const imgNode = nodes.image.create({ src });
  const { $from } = state.selection;
  const emptyPara =
    $from.parent.type === nodes.paragraph && $from.parent.content.size === 0 && $from.depth === 1;
  const tr = state.tr;
  if (emptyPara) {
    tr.replaceWith($from.before(1), $from.after(1), [imgNode, nodes.paragraph.create()]);
  } else {
    const pos = $from.depth > 0 ? $from.after(1) : state.selection.to;
    tr.insert(pos, [imgNode, nodes.paragraph.create()]);
  }
  view.dispatch(tr.scrollIntoView());
}

export function insertVideoBlock(view: EditorView, url = '') {
  const { state } = view;
  const videoNode = nodes.video.create({ url });
  const { $from } = state.selection;
  const emptyPara =
    $from.parent.type === nodes.paragraph && $from.parent.content.size === 0 && $from.depth === 1;
  const tr = state.tr;
  if (emptyPara) {
    tr.replaceWith($from.before(1), $from.after(1), [videoNode, nodes.paragraph.create()]);
  } else {
    const pos = $from.depth > 0 ? $from.after(1) : state.selection.to;
    tr.insert(pos, [videoNode, nodes.paragraph.create()]);
  }
  view.dispatch(tr.scrollIntoView());
}

export { isInTable, addRowAfter, addColumnAfter, deleteRow, deleteColumn, deleteTable };

export function insertCardChip(
  view: EditorView,
  from: number,
  to: number,
  cardId: string,
  cardTitle: string
) {
  const node = nodes.card.create({ cardId, cardTitle: cardTitle || 'Untitled' });
  let tr = view.state.tr.replaceWith(from, to, [node, view.state.schema.text(' ')]);
  const endPos = Math.min(from + node.nodeSize + 1, tr.doc.content.size);
  tr = tr.setSelection(TextSelection.create(tr.doc, endPos));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function insertWhiteboardChip(
  view: EditorView,
  from: number,
  to: number,
  whiteboardId: string,
  whiteboardName: string
) {
  const node = nodes.whiteboard.create({
    whiteboardId,
    whiteboardName: whiteboardName || 'Untitled Whiteboard',
  });
  let tr = view.state.tr.replaceWith(from, to, [node, view.state.schema.text(' ')]);
  const endPos = Math.min(from + node.nodeSize + 1, tr.doc.content.size);
  tr = tr.setSelection(TextSelection.create(tr.doc, endPos));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function setColor(view: EditorView, type: 'text' | 'background', color: string | null) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  if (empty) return;
  let tr = state.tr;
  state.doc.nodesBetween(from, to, (node, pos) => {
    node.marks
      .filter((m) => m.type === marks.color && m.attrs.type === type)
      .forEach((m) => {
        tr = tr.removeMark(Math.max(pos, from), Math.min(pos + node.nodeSize, to), m);
      });
  });
  if (color) tr = tr.addMark(from, to, marks.color.create({ type, color }));
  view.dispatch(tr);
}

export function activeColor(state: EditorState, type: 'text' | 'background'): string | null {
  const { from, to, $from, empty } = state.selection;
  if (empty) {
    const m = (state.storedMarks || $from.marks()).find(
      (mark) => mark.type === marks.color && mark.attrs.type === type
    );
    return m ? (m.attrs.color as string) : null;
  }
  let found: string | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    if (found) return false;
    const m = node.marks.find((mark) => mark.type === marks.color && mark.attrs.type === type);
    if (m) found = m.attrs.color as string;
    return true;
  });
  return found;
}

export function setLink(view: EditorView, from: number, to: number, href: string | null) {
  let tr = view.state.tr.removeMark(from, to, marks.link);
  if (href && href.trim()) {
    const trimmed = href.trim();
    const normalized =
      /^[a-z][\w+.-]*:/i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('#')
        ? trimmed
        : `https://${trimmed}`;
    const isInternal = normalized.startsWith('hepta://');
    tr = tr.addMark(
      from,
      to,
      marks.link.create({
        href: normalized,
        'data-internal-href': isInternal ? normalized : null,
        edited: true,
      })
    );
  }
  view.dispatch(tr);
}

export function activeLinkHref(state: EditorState): string {
  const { $from, from, to } = state.selection;
  let href = '';
  state.doc.nodesBetween(from, Math.max(to, from + 1), (node) => {
    const m = marks.link.isInSet(node.marks);
    if (m && !href) href = m.attrs.href;
  });
  if (!href) {
    const m = marks.link.isInSet($from.marks());
    if (m) href = m.attrs.href;
  }
  return href;
}

export function getLinkRangeAtPos(state: EditorState): { from: number; to: number; href: string } {
  const { from, to, empty, $from } = state.selection;
  if (!empty) {
    return { from, to, href: activeLinkHref(state) };
  }

  const parent = $from.parent;
  const parentStart = $from.start();
  let offset = 0;
  let targetRange: { from: number; to: number; href: string } | null = null;

  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const childStart = parentStart + offset;
    const childEnd = childStart + child.nodeSize;
    const linkMark = marks.link.isInSet(child.marks);

    if (linkMark && from >= childStart && from <= childEnd) {

      let rangeFrom = childStart;
      let rangeTo = childEnd;
      let leftOffset = offset;
      for (let j = i - 1; j >= 0; j--) {
        const prev = parent.child(j);
        const prevMark = marks.link.isInSet(prev.marks);
        if (prevMark && prevMark.attrs.href === linkMark.attrs.href) {
          leftOffset -= prev.nodeSize;
          rangeFrom = parentStart + leftOffset;
        } else {
          break;
        }
      }
      let rightOffset = offset + child.nodeSize;
      for (let j = i + 1; j < parent.childCount; j++) {
        const next = parent.child(j);
        const nextMark = marks.link.isInSet(next.marks);
        if (nextMark && nextMark.attrs.href === linkMark.attrs.href) {
          rightOffset += next.nodeSize;
          rangeTo = parentStart + rightOffset;
        } else {
          break;
        }
      }
      targetRange = { from: rangeFrom, to: rangeTo, href: linkMark.attrs.href };
      break;
    }

    offset += child.nodeSize;
  }

  return targetRange || { from, to, href: '' };
}

export function isNodeType(type: NodeType, name: string) {
  return type.name === name;
}
