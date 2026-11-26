import katex from 'katex';
import { Node as PMNode } from 'prosemirror-model';
import { EditorView, NodeView, ViewMutationRecord } from 'prosemirror-view';

export class HeptaMathView implements NodeView {
  dom: HTMLElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: () => number | undefined;
  private isDisplay: boolean;
  private renderEl: HTMLElement;
  private editorEl: HTMLInputElement | HTMLTextAreaElement | null = null;
  private isEditing = false;

  constructor(
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    isDisplay: boolean
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.isDisplay = isDisplay;

    this.dom = document.createElement(isDisplay ? 'math-display' : 'math-inline');
    this.dom.className = isDisplay
      ? 'math-node hepta-math-display'
      : 'math-node hepta-math-inline';
    this.dom.contentEditable = 'false';

    this.renderEl = document.createElement(isDisplay ? 'div' : 'span');
    this.renderEl.className = 'math-render';
    this.dom.appendChild(this.renderEl);

    this.dom.addEventListener('click', (e) => {
      if (!this.view.editable || this.isEditing) return;
      e.preventDefault();
      e.stopPropagation();
      this.enterEditMode();
    });

    this.renderLatex();
  }

  private renderLatex() {
    const tex = (this.node.textContent || '').trim();
    if (!tex) {
      this.renderEl.innerHTML = `<span class="hepta-math-placeholder">${
        this.isDisplay ? '$$ LaTeX block $$' : '$ math $'
      }</span>`;
      return;
    }

    try {
      katex.render(tex, this.renderEl, {
        displayMode: this.isDisplay,
        throwOnError: false,
        errorColor: 'var(--danger-item, #e14646)',
      });
    } catch {
      this.renderEl.textContent = tex;
    }
  }

  private enterEditMode() {
    if (this.isEditing) return;
    this.isEditing = true;
    this.renderEl.style.display = 'none';

    const input = this.isDisplay
      ? document.createElement('textarea')
      : document.createElement('input');
    input.className = this.isDisplay
      ? 'hepta-math-editor-textarea'
      : 'hepta-math-editor-input';
    if (!this.isDisplay) {
      (input as HTMLInputElement).type = 'text';
    }
    input.placeholder = 'E = mc^2';
    input.value = this.node.textContent || '';
    this.editorEl = input;
    this.dom.appendChild(input);

    const commit = (refocusEditor: boolean) => {
      if (!this.isEditing) return;
      const nextVal = input.value;
      this.exitEditMode();

      const pos = this.getPos();
      if (pos !== undefined && nextVal !== this.node.textContent) {
        const schema = this.view.state.schema;
        const content = nextVal ? [schema.text(nextVal)] : [];
        const tr = this.view.state.tr.replaceWith(
          pos + 1,
          pos + this.node.nodeSize - 1,
          content
        );
        this.view.dispatch(tr);
      }
      if (refocusEditor) {
        this.view.focus();
      }
    };

    const cancel = () => {
      if (!this.isEditing) return;
      this.exitEditMode();
      this.view.focus();
    };

    input.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Escape') {
        ke.preventDefault();
        ke.stopPropagation();
        cancel();
      } else if (ke.key === 'Enter' && (!this.isDisplay || ke.metaKey || ke.ctrlKey)) {
        ke.preventDefault();
        ke.stopPropagation();
        commit(true);
      }
    });

    input.addEventListener('blur', () => {
      commit(false);
    });

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  private exitEditMode() {
    this.isEditing = false;
    if (this.editorEl) {
      this.editorEl.remove();
      this.editorEl = null;
    }
    this.renderEl.style.display = '';
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (!this.isEditing) {
      this.renderLatex();
    }
    return true;
  }

  stopEvent(event: Event): boolean {
    return this.isEditing || event.target === this.editorEl;
  }

  ignoreMutation(_mutation: ViewMutationRecord): boolean {
    return true;
  }

  destroy() {
    this.exitEditMode();
  }
}
