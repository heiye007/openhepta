import { Node, DOMSerializer } from 'prosemirror-model';
import {
  MarkdownParser,
  MarkdownSerializer,
  MarkdownSerializerState,
  defaultMarkdownParser,
  ParseSpec,
} from 'prosemirror-markdown';
import { heptaSchema } from './schema';

export function docToJson(doc: Node): string {
  return JSON.stringify(doc.toJSON());
}

export function docFromJson(jsonOrObj: string | Record<string, unknown> | null | undefined): Node {
  if (!jsonOrObj) {
    return heptaSchema.nodes.doc.create(null, [heptaSchema.nodes.paragraph.create()]);
  }

  try {
    const raw = typeof jsonOrObj === 'string' ? JSON.parse(jsonOrObj) : jsonOrObj;
    if (raw && raw.type === 'doc') {
      return Node.fromJSON(heptaSchema, raw);
    }
  } catch (err) {
    console.warn('[docFromJson] Failed to parse JSON, falling back to empty doc', err);
  }

  return heptaSchema.nodes.doc.create(null, [heptaSchema.nodes.paragraph.create()]);
}

export function docToPlainText(doc: Node): string {
  let text = '';
  doc.descendants((node, _pos, parent) => {
    if (node.isText) {
      text += node.text;
    } else if (node.type.name === 'hard_break') {
      text += '\n';
    } else if (node.type.name === 'card') {
      text += `[[${node.attrs.cardTitle || 'Untitled'}]]`;
    } else if (node.type.name === 'whiteboard') {
      text += node.attrs.whiteboardName || 'Whiteboard';
    } else if (node.type.name === 'pdf_card') {
      text += node.attrs.pdfCardTitle || 'PDF';
    } else if (node.type.name === 'date') {
      text += node.attrs.date || '';
    } else if (node.type.name === 'math_inline') {
      text += `$${node.textContent}$`;
      return false;
    } else if (node.type.name === 'math_display') {
      if (text.length > 0 && !text.endsWith('\n')) text += '\n';
      text += `$$${node.textContent}$$`;
      return false;
    } else if (node.type.name === 'table_row') {
      if (text.length > 0 && !text.endsWith('\n')) text += '\n';
    } else if (
      (node.type.name === 'table_cell' || node.type.name === 'table_header') &&
      text.length > 0 &&
      !text.endsWith('\n') &&
      !text.endsWith('\t')
    ) {
      text += '\t';
    } else if (node.isBlock && parent === doc && text.length > 0 && !text.endsWith('\n')) {
      text += '\n';
    } else if (node.type.name === 'list_item' && text.length > 0 && !text.endsWith('\n')) {
      text += '\n';
    }
    return true;
  });
  return text.trim();
}

export function docFromPlainText(text: string): Node {
  if (!text || !text.trim()) {
    return heptaSchema.nodes.doc.create(null, [heptaSchema.nodes.paragraph.create()]);
  }

  const lines = text.split('\n');
  const paragraphs = lines.map((line) => {
    if (!line) return heptaSchema.nodes.paragraph.create();
    return heptaSchema.nodes.paragraph.create(null, [heptaSchema.text(line)]);
  });

  return heptaSchema.nodes.doc.create(null, paragraphs);
}

export function docToHtml(doc: Node): string {
  const serializer = DOMSerializer.fromSchema(heptaSchema);
  const fragment = serializer.serializeFragment(doc.content);
  const div = document.createElement('div');
  div.appendChild(fragment);
  return div.innerHTML;
}

export function extractCardIdsFromDoc(doc: Node): string[] {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === 'card' && node.attrs.cardId) {
      ids.add(String(node.attrs.cardId));
    }
    return true;
  });
  return Array.from(ids);
}

interface MarkdownItToken {
  type: string;
  tag: string;
  content: string;
  info?: string;
  markup?: string;
  attrs?: Array<[string, string]> | null;
  children?: MarkdownItToken[] | null;
  attrGet(name: string): string | null;
}

interface MarkdownItStateInline {
  src: string;
  pos: number;
  posMax: number;
  push(type: string, tag: string, nesting: number): MarkdownItToken;
}

interface MarkdownItStateBlock {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  lineMax: number;
  line: number;
  push(type: string, tag: string, nesting: number): MarkdownItToken;
}

interface MarkdownItInstance {
  enable(rules: string | string[]): MarkdownItInstance;
  disable(rules: string | string[]): MarkdownItInstance;
  parse(src: string, env: Record<string, unknown>): MarkdownItToken[];
  inline: {
    ruler: {
      before(
        beforeName: string,
        ruleName: string,
        fn: (state: MarkdownItStateInline, silent: boolean) => boolean
      ): void;
    };
  };
  block: {
    ruler: {
      before(
        beforeName: string,
        ruleName: string,
        fn: (
          state: MarkdownItStateBlock,
          startLine: number,
          endLine: number,
          silent: boolean
        ) => boolean
      ): void;
    };
  };
}

function createHeptaMarkdownTokenizer(): MarkdownItInstance {
  const MarkdownItCtor = defaultMarkdownParser.tokenizer.constructor as new (
    preset: string,
    opts?: Record<string, unknown>
  ) => MarkdownItInstance;

  const md = new MarkdownItCtor('default', {
    html: false,
    breaks: true,
    linkify: true,
  })
    .enable('strikethrough')
    .enable('table');

  md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
    const startPos = state.bMarks[startLine] + state.tShift[startLine];
    const maxPos = state.eMarks[startLine];
    const lineText = state.src.slice(startPos, maxPos).trim();
    if (!lineText.startsWith('$$')) return false;
    if (silent) return true;

    let nextLine = startLine;
    let content = '';

    if (lineText.length > 4 && lineText.endsWith('$$')) {
      content = lineText.slice(2, -2).trim();
      nextLine = startLine + 1;
    } else {
      const lines: string[] = [];
      const firstRest = lineText.slice(2).trim();
      if (firstRest) lines.push(firstRest);
      let found = false;
      for (let ln = startLine + 1; ln < endLine; ln++) {
        const lp = state.bMarks[ln] + state.tShift[ln];
        const lm = state.eMarks[ln];
        const lt = state.src.slice(lp, lm);
        if (lt.trim().endsWith('$$')) {
          const beforeEnd = lt.trim().slice(0, -2).trim();
          if (beforeEnd) lines.push(beforeEnd);
          nextLine = ln + 1;
          found = true;
          break;
        }
        lines.push(lt);
      }
      if (!found) return false;
      content = lines.join('\n').trim();
    }

    const token = state.push('math_block', 'math-display', 0);
    token.content = content;
    state.line = nextLine;
    return true;
  });

  md.inline.ruler.before('escape', 'math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$' || state.src[state.pos + 1] === '$') return false;
    const start = state.pos + 1;
    let end = start;
    while (end < state.posMax) {
      if (state.src[end] === '$' && state.src[end - 1] !== '\\') break;
      if (state.src[end] === '\n') return false;
      end++;
    }
    if (end >= state.posMax || end === start) return false;
    if (!silent) {
      const token = state.push('math_inline', 'math-inline', 0);
      token.content = state.src.slice(start, end);
    }
    state.pos = end + 1;
    return true;
  });

  md.inline.ruler.before('link', 'card_wiki_link', (state, silent) => {
    if (state.src.slice(state.pos, state.pos + 2) !== '[[') return false;
    const closeIdx = state.src.indexOf(']]', state.pos + 2);
    if (closeIdx === -1) return false;
    const title = state.src.slice(state.pos + 2, closeIdx).trim();
    if (!title || title.includes('\n')) return false;
    if (!silent) {
      const token = state.push('card', 'card', 0);
      token.content = title;
    }
    state.pos = closeIdx + 2;
    return true;
  });

  return md;
}

const heptaTokenizer = createHeptaMarkdownTokenizer();

function listIsTight(tokens: MarkdownItToken[], i: number): boolean {
  while (++i < tokens.length) {
    if (tokens[i].type !== 'list_item_open') return true;
  }
  return false;
}

const heptaMarkdownParser = new MarkdownParser(
  heptaSchema,
  heptaTokenizer as unknown as typeof defaultMarkdownParser.tokenizer,
  {
    blockquote: { block: 'blockquote' },
    paragraph: { block: 'paragraph' },
    list_item: { block: 'list_item' },
    bullet_list: {
      block: 'bullet_list',
      getAttrs: (_tok, tokens, i) => ({ tight: listIsTight(tokens as unknown as MarkdownItToken[], i) }),
    },
    ordered_list: {
      block: 'ordered_list',
      getAttrs: (tok, tokens, i) => ({
        order: tok.attrGet('start') ? Number(tok.attrGet('start')) : 1,
        tight: listIsTight(tokens as unknown as MarkdownItToken[], i),
      }),
    },
    heading: {
      block: 'heading',
      getAttrs: (tok) => ({ level: Number(tok.tag.slice(1)) || 1 }),
    },
    code_block: { block: 'code_block', noCloseToken: true },
    fence: {
      block: 'code_block',
      getAttrs: (tok) => ({ params: tok.info || '' }),
      noCloseToken: true,
    },
    hr: { node: 'horizontal_rule' },
    image: {
      node: 'image',
      getAttrs: (tok) => ({
        src: tok.attrGet('src') || '',
        title: tok.attrGet('title') || null,
        alt: tok.children?.[0]?.content || null,
      }),
    },
    hardbreak: { node: 'hard_break' },
    table: { block: 'table' },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: 'table_row' },
    th: {
      block: 'table_header',
    } as ParseSpec,
    td: {
      block: 'table_cell',
    } as ParseSpec,
    math_inline: {
      node: 'math_inline',
      getAttrs: undefined,
      noCloseToken: true,
    } as unknown as ParseSpec,
    math_block: {
      node: 'math_display',
      noCloseToken: true,
    } as unknown as ParseSpec,
    em: { mark: 'em' },
    strong: { mark: 'strong' },
    s: { mark: 'strike' },
    link: {
      mark: 'link',
      getAttrs: (tok) => ({
        href: tok.attrGet('href') || '',
        title: tok.attrGet('title') || null,
      }),
    },
    code_inline: { mark: 'code', noCloseToken: true },
  }
);

const parserHandlers = (
  heptaMarkdownParser as unknown as {
    tokenHandlers: Record<
      string,
      (state: {
        schema: typeof heptaSchema;
        openNode: (type: unknown, attrs?: Record<string, unknown>) => void;
        closeNode: () => void;
        addNode: (type: unknown, attrs?: Record<string, unknown>, content?: Node[]) => void;
      }, tok: MarkdownItToken) => void
    >;
  }
).tokenHandlers;

parserHandlers.th_open = (state) => {
  state.openNode(heptaSchema.nodes.table_header);
  state.openNode(heptaSchema.nodes.paragraph);
};
parserHandlers.th_close = (state) => {
  state.closeNode();
  state.closeNode();
};
parserHandlers.td_open = (state) => {
  state.openNode(heptaSchema.nodes.table_cell);
  state.openNode(heptaSchema.nodes.paragraph);
};
parserHandlers.td_close = (state) => {
  state.closeNode();
  state.closeNode();
};
parserHandlers.math_inline = (state, tok) => {
  const content = tok.content ? [heptaSchema.text(tok.content)] : [];
  state.addNode(heptaSchema.nodes.math_inline, undefined, content);
};
parserHandlers.math_block = (state, tok) => {
  const content = tok.content ? [heptaSchema.text(tok.content)] : [];
  state.addNode(heptaSchema.nodes.math_display, undefined, content);
};
parserHandlers.card = (state, tok) => {
  state.addNode(heptaSchema.nodes.card, { cardId: '', cardTitle: tok.content || 'Untitled' });
};

function convertCheckboxLists(node: Node): Node {
  if (node.isText || node.isLeaf) return node;

  const nextChildren: Node[] = [];
  for (let i = 0; i < node.childCount; i++) {
    nextChildren.push(convertCheckboxLists(node.child(i)));
  }

  if (node.type === heptaSchema.nodes.bullet_list && nextChildren.length > 0) {
    const allTasks = nextChildren.every((li) => {
      const firstP = li.firstChild;
      if (!firstP || firstP.type !== heptaSchema.nodes.paragraph) return false;
      return /^\[[ xX]\]\s/.test(firstP.textContent);
    });

    if (allTasks) {
      const taskItems = nextChildren.map((li) => {
        const firstP = li.firstChild!;
        const prefixMatch = firstP.textContent.match(/^\[([ xX])\]\s+/);
        const checked = prefixMatch ? prefixMatch[1].toLowerCase() === 'x' : false;
        const cutLen = prefixMatch ? prefixMatch[0].length : 0;
        const strippedContent = cutLen > 0 ? firstP.cut(cutLen) : firstP;
        const newFirstP = heptaSchema.nodes.paragraph.create(firstP.attrs, strippedContent.content);
        const restBlocks: Node[] = [];
        for (let k = 1; k < li.childCount; k++) restBlocks.push(li.child(k));
        return heptaSchema.nodes.list_item.create({ checked }, [newFirstP, ...restBlocks]);
      });
      return heptaSchema.nodes.task_list.create(null, taskItems);
    }
  }

  return node.copy(heptaSchema.nodes.doc.contentMatch.matchType(node.type) ? undefined : undefined)
    ? node.type.create(node.attrs, nextChildren, node.marks)
    : node;
}

export function docFromMarkdown(markdown: string): Node {
  if (!markdown || !markdown.trim()) {
    return heptaSchema.nodes.doc.create(null, [heptaSchema.nodes.paragraph.create()]);
  }
  try {
    const parsed = heptaMarkdownParser.parse(markdown);
    return parsed ? convertCheckboxLists(parsed) : docFromPlainText(markdown);
  } catch (err) {
    console.warn('[docFromMarkdown] Failed to parse markdown, falling back to plain text', err);
    return docFromPlainText(markdown);
  }
}

const heptaMarkdownSerializer = new MarkdownSerializer(
  {
    blockquote(state: MarkdownSerializerState, node: Node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node));
    },
    callout(state: MarkdownSerializerState, node: Node) {
      const icon = node.attrs.icon || '💡';
      state.wrapBlock(`> ${icon} `, '> ', node, () => state.renderContent(node));
    },
    code_block(state: MarkdownSerializerState, node: Node) {
      state.write('```' + (node.attrs.params || '') + '\n');
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write('```');
      state.closeBlock(node);
    },
    heading(state: MarkdownSerializerState, node: Node) {
      state.write(state.repeat('#', node.attrs.level) + ' ');
      state.renderInline(node);
      state.closeBlock(node);
    },
    horizontal_rule(state: MarkdownSerializerState, node: Node) {
      state.write('---');
      state.closeBlock(node);
    },
    bullet_list(state: MarkdownSerializerState, node: Node) {
      state.renderList(node, '  ', () => '- ');
    },
    ordered_list(state: MarkdownSerializerState, node: Node) {
      const start = node.attrs.order || 1;
      const maxW = String(start + node.childCount - 1).length;
      const space = state.repeat(' ', maxW + 2);
      state.renderList(node, space, (i) => {
        const nStr = String(start + i);
        return state.repeat(' ', maxW - nStr.length) + nStr + '. ';
      });
    },
    task_list(state: MarkdownSerializerState, node: Node) {
      state.renderList(node, '  ', (i) => {
        const item = node.child(i);
        return item.attrs.checked ? '- [x] ' : '- [ ] ';
      });
    },
    toggle_list(state: MarkdownSerializerState, node: Node) {
      state.renderList(node, '  ', () => '>> ');
    },
    list_item(state: MarkdownSerializerState, node: Node) {
      state.renderContent(node);
    },
    paragraph(state: MarkdownSerializerState, node: Node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    image(state: MarkdownSerializerState, node: Node) {
      state.write(
        `![${state.esc(node.attrs.alt || '')}](${node.attrs.src || ''}${
          node.attrs.title ? ` "${node.attrs.title.replace(/"/g, '\\"')}"` : ''
        })`
      );
      state.closeBlock(node);
    },
    video(state: MarkdownSerializerState, node: Node) {
      state.write(node.attrs.url || '');
      state.closeBlock(node);
    },
    math_display(state: MarkdownSerializerState, node: Node) {
      state.write('$$\n' + node.textContent + '\n$$');
      state.closeBlock(node);
    },
    math_inline(state: MarkdownSerializerState, node: Node) {
      state.write('$' + node.textContent + '$');
    },
    card(state: MarkdownSerializerState, node: Node) {
      state.write(`[[${node.attrs.cardTitle || 'Untitled'}]]`);
    },
    whiteboard(state: MarkdownSerializerState, node: Node) {
      state.write(node.attrs.whiteboardName || 'Whiteboard');
    },
    pdf_card(state: MarkdownSerializerState, node: Node) {
      state.write(node.attrs.pdfCardTitle || 'PDF');
    },
    date(state: MarkdownSerializerState, node: Node) {
      state.write(node.attrs.date || '');
    },
    table(state: MarkdownSerializerState, node: Node) {
      for (let r = 0; r < node.childCount; r++) {
        const row = node.child(r);
        const cells: string[] = [];
        for (let c = 0; c < row.childCount; c++) {
          cells.push(row.child(c).textContent.replace(/\|/g, '\\|').replace(/\n/g, ' '));
        }
        state.write('| ' + cells.join(' | ') + ' |\n');
        if (r === 0) {
          state.write('| ' + cells.map(() => '---').join(' | ') + ' |\n');
        }
      }
      state.closeBlock(node);
    },
    table_row() {},
    table_cell() {},
    table_header() {},
    hard_break(state: MarkdownSerializerState, node: Node, parent: Node, index: number) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write('\\\n');
          return;
        }
      }
    },
    text(state: MarkdownSerializerState, node: Node) {
      state.text(node.text || '');
    },
  },
  {
    em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    strong: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    underline: { open: '<u>', close: '</u>', mixable: true, expelEnclosingWhitespace: true },
    code: { open: '`', close: '`', escape: false },
    color: { open: '', close: '', mixable: true },
    link: {
      open: '[',
      close(_state, mark) {
        return `](${mark.attrs.href}${mark.attrs.title ? ` "${mark.attrs.title}"` : ''})`;
      },
    },
  }
);

export function docToMarkdown(doc: Node): string {
  return heptaMarkdownSerializer.serialize(doc).trim();
}
