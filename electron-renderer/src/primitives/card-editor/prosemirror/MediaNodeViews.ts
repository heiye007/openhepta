import { Node as PMNode } from 'prosemirror-model';
import { EditorView, NodeView, ViewMutationRecord } from 'prosemirror-view';

export class HeptaImageView implements NodeView {
  dom: HTMLElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: () => number | undefined;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('figure');
    this.dom.className = 'hepta-image-wrap';
    this.dom.contentEditable = 'false';
    this.render();
  }

  private updateSrc(newSrc: string) {
    const pos = this.getPos();
    if (pos === undefined || !this.view.editable) return;
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
      ...this.node.attrs,
      src: newSrc.trim(),
    });
    this.view.dispatch(tr);
    this.view.focus();
  }

  private render() {
    this.dom.innerHTML = '';
    const src = String(this.node.attrs.src || '').trim();

    if (!src) {
      this.renderPlaceholder('Paste an image URL or local asset path...');
      return;
    }

    const img = document.createElement('img');
    img.src = src;
    if (this.node.attrs.alt) img.alt = String(this.node.attrs.alt);
    if (this.node.attrs.title) img.title = String(this.node.attrs.title);
    if (this.node.attrs.width) {
      img.style.width = `${this.node.attrs.width}px`;
    }

    img.addEventListener('error', () => {
      this.renderPlaceholder(`Image unavailable offline (${src})`);
    });

    this.dom.appendChild(img);
  }

  private renderPlaceholder(message: string) {
    this.dom.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'hepta-media-fallback';

    const label = document.createElement('span');
    label.textContent = message;
    box.appendChild(label);

    if (this.view.editable) {
      const form = document.createElement('form');
      form.style.display = 'flex';
      form.style.gap = '6px';
      form.style.width = '100%';
      form.style.maxWidth = '320px';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'https://... or hepta-file://...';
      input.value = String(this.node.attrs.src || '');
      input.style.flex = '1';
      input.style.padding = '4px 8px';
      input.style.borderRadius = '6px';
      input.style.border = '1px solid var(--light-grey)';
      input.style.background = 'var(--background-secondary)';
      input.style.color = 'var(--text-color)';
      input.style.fontSize = '12px';
      input.style.outline = 'none';

      const btn = document.createElement('button');
      btn.type = 'submit';
      btn.textContent = 'Set';
      btn.style.padding = '4px 10px';
      btn.style.borderRadius = '6px';
      btn.style.background = 'var(--active-item)';
      btn.style.color = '#fff';
      btn.style.fontSize = '12px';
      btn.style.fontWeight = '500';
      btn.style.cursor = 'pointer';

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value.trim()) {
          this.updateSrc(input.value);
        }
      });

      form.appendChild(input);
      form.appendChild(btn);
      box.appendChild(form);
    }

    this.dom.appendChild(box);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    const tag = (event.target as HTMLElement)?.tagName;
    return tag === 'INPUT' || tag === 'BUTTON' || tag === 'FORM';
  }

  ignoreMutation(_mutation: ViewMutationRecord): boolean {
    return true;
  }
}

function toEmbedUrl(rawUrl: string): { kind: 'video' | 'iframe'; src: string } | null {
  const url = rawUrl.trim();
  if (!url) return null;
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url) || url.startsWith('hepta-file://')) {
    return { kind: 'video', src: url };
  }
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  if (ytMatch) {
    return { kind: 'iframe', src: `https://www.youtube.com/embed/${ytMatch[1]}` };
  }
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }
  if (/^https?:\/\//i.test(url)) {
    return { kind: 'iframe', src: url };
  }
  return null;
}

export class HeptaVideoView implements NodeView {
  dom: HTMLElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: () => number | undefined;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('div');
    this.dom.className = 'hepta-video-wrap';
    this.dom.contentEditable = 'false';
    this.render();
  }

  private updateUrl(newUrl: string) {
    const pos = this.getPos();
    if (pos === undefined || !this.view.editable) return;
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
      ...this.node.attrs,
      url: newUrl.trim(),
    });
    this.view.dispatch(tr);
    this.view.focus();
  }

  private render() {
    this.dom.innerHTML = '';
    const url = String(this.node.attrs.url || '').trim();
    const resolved = toEmbedUrl(url);

    if (!resolved) {
      const box = document.createElement('div');
      box.className = 'hepta-media-fallback';
      const label = document.createElement('span');
      label.textContent = url ? `Video embed: ${url}` : 'Embed a video URL (YouTube, Vimeo, MP4)...';
      box.appendChild(label);

      if (this.view.editable) {
        const form = document.createElement('form');
        form.style.display = 'flex';
        form.style.gap = '6px';
        form.style.width = '100%';
        form.style.maxWidth = '320px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'https://youtube.com/watch?v=...';
        input.value = url;
        input.style.flex = '1';
        input.style.padding = '4px 8px';
        input.style.borderRadius = '6px';
        input.style.border = '1px solid var(--light-grey)';
        input.style.background = 'var(--background-secondary)';
        input.style.color = 'var(--text-color)';
        input.style.fontSize = '12px';
        input.style.outline = 'none';

        const btn = document.createElement('button');
        btn.type = 'submit';
        btn.textContent = 'Embed';
        btn.style.padding = '4px 10px';
        btn.style.borderRadius = '6px';
        btn.style.background = 'var(--active-item)';
        btn.style.color = '#fff';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = '500';
        btn.style.cursor = 'pointer';

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (input.value.trim()) this.updateUrl(input.value);
        });

        form.appendChild(input);
        form.appendChild(btn);
        box.appendChild(form);
      }

      this.dom.appendChild(box);
      return;
    }

    if (resolved.kind === 'video') {
      const video = document.createElement('video');
      video.src = resolved.src;
      video.controls = true;
      this.dom.appendChild(video);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = resolved.src;
      iframe.allowFullscreen = true;
      iframe.setAttribute('loading', 'lazy');
      this.dom.appendChild(iframe);
    }
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    const tag = (event.target as HTMLElement)?.tagName;
    return tag === 'INPUT' || tag === 'BUTTON' || tag === 'FORM';
  }

  ignoreMutation(_mutation: ViewMutationRecord): boolean {
    return true;
  }
}
