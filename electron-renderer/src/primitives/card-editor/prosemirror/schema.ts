import { Schema, NodeSpec, MarkSpec } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

const nodes: Record<string, NodeSpec> = {
  doc: {
    content: 'block+',
  },
  paragraph: {
    content: 'inline*',
    group: 'block',
    attrs: { id: { default: null } },
    parseDOM: [{ tag: 'p' }],
    toDOM() {
      return ['p', 0];
    },
  },
  blockquote: {
    content: 'block+',
    group: 'block',
    attrs: { id: { default: null } },
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM() {
      return ['blockquote', 0];
    },
  },
  callout: {
    content: 'block+',
    group: 'block',
    defining: true,
    attrs: {
      id: { default: null },
      icon: { default: '💡' },
      color: { default: 'gray' },
    },
    parseDOM: [
      {
        tag: 'div[data-callout]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            icon: el.getAttribute('data-icon') || '💡',
            color: el.getAttribute('data-color') || 'gray',
          };
        },
      },
    ],
    toDOM(node) {
      return [
        'div',
        {
          class: 'hepta-callout',
          'data-callout': '',
          'data-icon': node.attrs.icon || '💡',
          'data-color': node.attrs.color || 'gray',
        },
        0,
      ];
    },
  },
  horizontal_rule: {
    group: 'block',
    attrs: { id: { default: null } },
    parseDOM: [{ tag: 'hr' }],
    toDOM() {
      return ['div', { class: 'hepta-hr-wrap' }, ['hr']];
    },
  },
  heading: {
    attrs: { id: { default: null }, level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h1', attrs: { level: 1 } },
      { tag: 'h2', attrs: { level: 2 } },
      { tag: 'h3', attrs: { level: 3 } },
      { tag: 'h4', attrs: { level: 4 } },
      { tag: 'h5', attrs: { level: 5 } },
      { tag: 'h6', attrs: { level: 6 } },
    ],
    toDOM(node) {
      return ['h' + node.attrs.level, 0];
    },
  },
  code_block: {
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    attrs: { id: { default: null }, params: { default: '' } },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (dom) => ({
          params: (dom as HTMLElement).getAttribute('data-params') || '',
        }),
      },
    ],
    toDOM(node) {
      return [
        'pre',
        node.attrs.params ? { 'data-params': node.attrs.params } : {},
        ['code', 0],
      ];
    },
  },
  video: {
    atom: true,
    group: 'block',
    defining: true,
    selectable: true,
    attrs: {
      id: { default: null },
      url: { default: '' },
      source: { default: 'video' },
    },
    parseDOM: [
      {
        tag: 'iframe',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            url: el.getAttribute('src') || '',
            source: el.getAttribute('data-source') || 'video',
          };
        },
      },
    ],
    toDOM(node) {
      return [
        'iframe',
        {
          src: node.attrs.url,
          'data-source': node.attrs.source,
          width: '100%',
          height: '540',
          allowfullscreen: 'true',
          frameborder: '0',
        },
      ];
    },
  },
  ...tableNodes({
    tableGroup: 'block',
    cellContent: 'block+',
    cellAttributes: {},
  }),
  toggle_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { id: { default: null }, tight: { default: false }, class: { default: '' } },
    parseDOM: [{ tag: 'ul[data-toggle-list]', priority: 1000 }],
    toDOM(node) {
      return [
        'ul',
        {
          'data-toggle-list': '',
          ...(node.attrs.tight ? { 'data-tight': 'true' } : {}),
          class: node.attrs.class ? `hepta-toggle-list ${node.attrs.class}` : 'hepta-toggle-list',
        },
        0,
      ];
    },
  },
  bullet_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { id: { default: null }, tight: { default: false }, class: { default: '' } },
    parseDOM: [
      {
        tag: 'ul',
        getAttrs: (dom) => ({
          tight: (dom as HTMLElement).hasAttribute('data-tight'),
        }),
      },
    ],
    toDOM(node) {
      return ['ul', node.attrs.tight ? { 'data-tight': 'true' } : {}, 0];
    },
  },
  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { id: { default: null }, order: { default: 1 }, tight: { default: false } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            order: el.hasAttribute('start') ? Number(el.getAttribute('start')) : 1,
            tight: el.hasAttribute('data-tight'),
          };
        },
      },
    ],
    toDOM(node) {
      const attrs: Record<string, string | number> = {};
      if (node.attrs.order !== 1) attrs.start = node.attrs.order;
      if (node.attrs.tight) attrs['data-tight'] = 'true';
      return ['ol', attrs, 0];
    },
  },
  task_list: {
    content: 'list_item*',
    group: 'block',
    attrs: { id: { default: null } },
    parseDOM: [{ tag: 'ul[data-task-list]', priority: 1000 }],
    toDOM() {
      return ['ul', { 'data-task-list': '', class: 'hepta-task-list' }, 0];
    },
  },
  list_item: {
    content: 'paragraph block*',
    defining: true,
    attrs: {
      id: { default: null },
      class: { default: '' },
      folded: { default: false },
      checked: { default: null },
    },
    parseDOM: [
      {
        tag: 'li',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const checkedAttr = el.getAttribute('data-checked');
          return {
            folded: el.getAttribute('folded') === 'true' || el.getAttribute('data-folded') === 'true',
            checked: checkedAttr !== null ? checkedAttr === 'true' : null,
          };
        },
      },
    ],
    toDOM(node) {
      const attrs: Record<string, string> = {};
      if (node.attrs.class) attrs.class = node.attrs.class;
      if (node.attrs.folded) {
        attrs.folded = 'true';
        attrs['data-folded'] = 'true';
      }
      if (node.attrs.checked !== null) {
        attrs['data-checked'] = String(node.attrs.checked);
        attrs.class = (attrs.class ? attrs.class + ' ' : '') + 'hepta-task-item';
      }
      return ['li', attrs, 0];
    },
  },
  text: {
    group: 'inline',
  },
  image: {
    attrs: {
      id: { default: null },
      src: { default: '' },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      height: { default: null },
    },
    group: 'block',
    draggable: true,
    selectable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            src: el.getAttribute('src') || '',
            title: el.getAttribute('title'),
            alt: el.getAttribute('alt'),
            width: el.getAttribute('width'),
            height: el.getAttribute('height'),
          };
        },
      },
    ],
    toDOM(node) {
      const attrs: Record<string, string> = {
        src: node.attrs.src || '',
        class: 'hepta-image',
      };
      if (node.attrs.alt) attrs.alt = node.attrs.alt;
      if (node.attrs.title) attrs.title = node.attrs.title;
      if (node.attrs.width) {
        attrs.width = String(node.attrs.width);
        attrs.style = `margin: 0 calc((100% - ${node.attrs.width}px) / 2)`;
      }
      if (node.attrs.height) attrs.height = String(node.attrs.height);
      return ['img', attrs];
    },
  },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM() {
      return ['br'];
    },
  },
  math_inline: {
    attrs: { id: { default: null } },
    group: 'inline math',
    content: 'text*',
    inline: true,
    atom: true,
    selectable: true,
    toDOM: () => ['math-inline', { class: 'math-node' }, 0],
    parseDOM: [{ tag: 'math-inline' }],
  },
  math_display: {
    attrs: { id: { default: null } },
    group: 'block math',
    content: 'text*',
    atom: true,
    code: true,
    selectable: true,
    toDOM: () => ['math-display', { class: 'math-node' }, 0],
    parseDOM: [{ tag: 'math-display' }],
  },
  date: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: { id: { default: null }, date: { default: '' } },
    leafText: (node) => node.attrs.date || '',
    parseDOM: [
      {
        tag: 'date',
        getAttrs: (dom) => ({
          date: (dom as HTMLElement).getAttribute('data-date') || '',
        }),
      },
      {
        tag: 'span[data-date]',
        getAttrs: (dom) => ({
          date: (dom as HTMLElement).getAttribute('data-date') || '',
        }),
      },
    ],
    toDOM(node) {
      return [
        'span',
        {
          class: 'hepta-date-chip date-node',
          'data-date': node.attrs.date,
        },
        node.attrs.date,
      ];
    },
  },
  whiteboard: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: { id: { default: null }, whiteboardId: { default: '' }, whiteboardName: { default: '' } },
    leafText: (node) => node.attrs.whiteboardName,
    parseDOM: [
      {
        tag: 'whiteboard',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            whiteboardId: el.getAttribute('data-whiteboardId') || '',
            whiteboardName: el.getAttribute('data-whiteboardName') || el.innerText || '',
          };
        },
      },
      {
        tag: 'span[data-whiteboard-id]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            whiteboardId: el.getAttribute('data-whiteboard-id') || '',
            whiteboardName: el.getAttribute('data-whiteboard-name') || el.innerText || '',
          };
        },
      },
    ],
    toDOM(node) {
      return [
        'span',
        {
          class: 'hepta-whiteboard-chip whiteboard-node',
          'data-whiteboard-id': node.attrs.whiteboardId,
          'data-whiteboard-name': node.attrs.whiteboardName,
        },
        node.attrs.whiteboardName || 'Whiteboard',
      ];
    },
  },
  card: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: { id: { default: null }, cardId: { default: '' }, cardTitle: { default: '' } },
    leafText: (node) => `[[${node.attrs.cardTitle || 'Untitled'}]]`,
    parseDOM: [
      {
        tag: 'card',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            cardId: el.getAttribute('data-cardId') || '',
            cardTitle: el.getAttribute('data-cardTitle') || el.innerText || '',
          };
        },
      },
      {
        tag: 'span[data-card-id]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            cardId: el.getAttribute('data-card-id') || '',
            cardTitle: el.getAttribute('data-card-title') || el.innerText || '',
          };
        },
      },
    ],
    toDOM(node) {
      return [
        'span',
        {
          class: 'hepta-card-chip card-node',
          'data-card-id': node.attrs.cardId,
          'data-card-title': node.attrs.cardTitle,
        },
        `[[${node.attrs.cardTitle || 'Untitled'}]]`,
      ];
    },
  },
  pdf_card: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: { id: { default: null }, pdfCardId: { default: '' }, pdfCardTitle: { default: '' } },
    leafText: (node) => node.attrs.pdfCardTitle || 'PDF',
    parseDOM: [
      {
        tag: 'pdf-card',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            pdfCardId: el.getAttribute('data-pdf-card-id') || '',
            pdfCardTitle: el.getAttribute('data-pdf-card-title') || el.innerText || '',
          };
        },
      },
    ],
    toDOM(node) {
      return [
        'span',
        {
          class: 'hepta-pdf-chip',
          'data-pdf-card-id': node.attrs.pdfCardId,
          'data-pdf-card-title': node.attrs.pdfCardTitle,
        },
        `PDF: ${node.attrs.pdfCardTitle || 'Document'}`,
      ];
    },
  },
};

const marks: Record<string, MarkSpec> = {
  em: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
    toDOM() {
      return ['em', 0];
    },
  },
  strong: {
    parseDOM: [
      { tag: 'b' },
      { tag: 'strong' },
      {
        style: 'font-weight',
        getAttrs: (val) => /^(bold(er)?|[5-9]\d{2,})$/.test(val as string) && null,
      },
    ],
    toDOM() {
      return ['strong', 0];
    },
  },
  link: {
    attrs: {
      href: {},
      title: { default: null },
      'data-internal-href': { default: null },
      edited: { default: false },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            href: el.getAttribute('href'),
            title: el.getAttribute('title'),
            'data-internal-href': el.getAttribute('data-internal-href'),
          };
        },
      },
    ],
    toDOM(node) {
      return [
        'a',
        {
          href: node.attrs.href,
          title: node.attrs.title,
          ...(node.attrs['data-internal-href']
            ? { 'data-internal-href': node.attrs['data-internal-href'] }
            : {}),
          class: 'hepta-link',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        0,
      ];
    },
  },
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM() {
      return ['code', 0];
    },
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
    toDOM() {
      return ['s', 0];
    },
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM() {
      return ['u', 0];
    },
  },

  color: {
    attrs: { type: { default: 'text' }, color: { default: null } },
    parseDOM: [
      {
        tag: 'span[data-color]',
        getAttrs: (dom) => ({
          type: (dom as HTMLElement).getAttribute('data-color-type') || 'text',
          color: (dom as HTMLElement).getAttribute('data-color'),
        }),
      },
      {
        tag: 'mark',
        getAttrs: () => ({ type: 'background', color: 'yellow' }),
      },
    ],
    toDOM(mark) {
      const { type, color } = mark.attrs;
      const fallback = EDITOR_PALETTE[color as string] || EDITOR_PALETTE.yellow;
      const style =
        type === 'text'
          ? `color: var(--text-${color}-editor, ${fallback.text})`
          : `background-color: var(--bg-${color}-editor, ${fallback.bg}); border-radius: 2px; padding: 0 2px;`;
      return ['span', { 'data-color': color, 'data-color-type': type, style }, 0];
    },
  },
};

export const EDITOR_PALETTE: Record<string, { label: string; text: string; bg: string }> = {
  gray: { label: 'Gray', text: '#73787a', bg: '#ebebe5' },
  brown: { label: 'Brown', text: '#915e42', bg: '#f0e0cf' },
  orange: { label: 'Orange', text: '#e55403', bg: '#ffe3bf' },
  yellow: { label: 'Yellow', text: '#b5801a', bg: '#faf5c4' },
  green: { label: 'Green', text: '#0f8f40', bg: '#cff5db' },
  blue: { label: 'Blue', text: '#3b63e0', bg: '#dbeafe' },
  purple: { label: 'Purple', text: '#9333ea', bg: '#ede5fc' },
  pink: { label: 'Pink', text: '#d63085', bg: '#fce3f5' },
  red: { label: 'Red', text: '#de242b', bg: '#fee2e2' },
};

export const heptaSchema = new Schema({ nodes, marks });
