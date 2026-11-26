import { Node as PMNode } from 'prosemirror-model';
import { EditorView, NodeView, ViewMutationRecord } from 'prosemirror-view';

const CODE_LANGUAGES = [
  { value: '', label: 'Plain Text' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'markdown', label: 'Markdown' },
];

export class HeptaCodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: () => number | undefined;
  private headerEl: HTMLElement;
  private langSelect: HTMLSelectElement;
  private copyBtn: HTMLButtonElement;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('div');
    this.dom.className = 'hepta-code-block';
    this.dom.setAttribute('data-node-type', 'code_block');

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'hepta-code-header';
    this.headerEl.contentEditable = 'false';

    this.langSelect = document.createElement('select');
    this.langSelect.className = 'hepta-code-lang';
    this.langSelect.title = 'Code language';
    for (const lang of CODE_LANGUAGES) {
      const opt = document.createElement('option');
      opt.value = lang.value;
      opt.textContent = lang.label;
      this.langSelect.appendChild(opt);
    }
    this.syncLanguageValue(String(node.attrs.params || ''));
    this.langSelect.disabled = !view.editable;

    this.langSelect.addEventListener('change', () => {
      const pos = this.getPos();
      if (pos === undefined || !this.view.editable) return;
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        params: this.langSelect.value,
      });
      this.view.dispatch(tr);
      this.view.focus();
    });

    this.copyBtn = document.createElement('button');
    this.copyBtn.type = 'button';
    this.copyBtn.className = 'hepta-code-copy';
    this.copyBtn.textContent = 'Copy';
    this.copyBtn.title = 'Copy code';
    this.copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard?.writeText(this.node.textContent || '').catch(() => {});
      this.copyBtn.textContent = 'Copied';
      this.copyBtn.classList.add('is-copied');
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.copyBtn.textContent = 'Copy';
        this.copyBtn.classList.remove('is-copied');
      }, 1500);
    });

    this.headerEl.appendChild(this.langSelect);
    this.headerEl.appendChild(this.copyBtn);

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    pre.appendChild(code);

    this.dom.appendChild(this.headerEl);
    this.dom.appendChild(pre);
    this.contentDOM = code;
  }

  private syncLanguageValue(params: string) {
    const normalized = params.trim().toLowerCase();
    const exists = Array.from(this.langSelect.options).some((o) => o.value === normalized);
    if (normalized && !exists) {
      const customOpt = document.createElement('option');
      customOpt.value = normalized;
      customOpt.textContent = params.trim();
      this.langSelect.appendChild(customOpt);
    }
    this.langSelect.value = normalized;
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.syncLanguageValue(String(node.attrs.params || ''));
    this.langSelect.disabled = !this.view.editable;
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.headerEl.contains(event.target as Node);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return this.headerEl.contains(mutation.target) || mutation.target === this.headerEl;
  }

  destroy() {
    if (this.copyTimer) clearTimeout(this.copyTimer);
  }
}
