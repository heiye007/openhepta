import { EditorState, Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { heptaSchema } from './schema';

const placeholderKey = new PluginKey('hepta-placeholder');
const inlineTagKey = new PluginKey('hepta-inline-tag');

export function placeholderPlugin(placeholderText: string, isReadOnly?: () => boolean) {
  return new Plugin({
    key: placeholderKey,
    props: {
      decorations(state: EditorState) {
        if (isReadOnly?.()) return DecorationSet.empty;

        const { doc, selection } = state;
        const decorations: Decoration[] = [];

        const isSingleEmptyPara =
          doc.childCount === 1 &&
          doc.firstChild?.type === heptaSchema.nodes.paragraph &&
          doc.firstChild.content.size === 0;

        if (isSingleEmptyPara) {
          decorations.push(
            Decoration.node(0, doc.firstChild!.nodeSize, {
              class: 'is-empty',
              'data-placeholder': placeholderText,
            })
          );
          return DecorationSet.create(doc, decorations);
        }

        if (selection.empty) {
          const { $from } = selection;
          if (
            $from.depth === 1 &&
            $from.parent.type === heptaSchema.nodes.paragraph &&
            $from.parent.content.size === 0
          ) {
            const pos = $from.before(1);
            decorations.push(
              Decoration.node(pos, pos + $from.parent.nodeSize, {
                class: 'is-empty is-focused-empty',
                'data-placeholder': "Type '/' for commands, '[[' to link...",
              })
            );
          }
        }

        return DecorationSet.create(doc, decorations);
      },
    },
  });
}

export function inlineTagHighlightPlugin() {
  const tagRegex = /(^|\s)(#[a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5/-]*)/g;

  return new Plugin({
    key: inlineTagKey,
    props: {
      decorations(state: EditorState) {
        const decorations: Decoration[] = [];
        const { code, link } = heptaSchema.marks;

        state.doc.descendants((node, pos, parent) => {
          if (node.type === heptaSchema.nodes.code_block) return false;
          if (!node.isText || !node.text) return true;
          if (parent && parent.type === heptaSchema.nodes.code_block) return false;
          if (code.isInSet(node.marks) || link.isInSet(node.marks)) return true;

          tagRegex.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = tagRegex.exec(node.text)) !== null) {
            const leadLen = match[1].length;
            const tagStart = pos + match.index + leadLen;
            const tagEnd = tagStart + match[2].length;
            decorations.push(
              Decoration.inline(tagStart, tagEnd, {
                class: 'hepta-inline-tag',
              })
            );
          }
          return true;
        });

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

export type EditorTrigger =
  | { type: 'slash'; query: string; from: number; to: number }
  | { type: 'mention'; query: string; from: number; to: number }
  | null;

export function detectEditorTrigger(state: EditorState): EditorTrigger {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock || $from.parent.type === heptaSchema.nodes.code_block) {
    return null;
  }

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\ufffc', '\ufffc');

  const mentionMatch = textBefore.match(/\[\[([^\[\]\n\ufffc]*)$/);
  if (mentionMatch) {
    const fullMatch = mentionMatch[0];
    return {
      type: 'mention',
      query: mentionMatch[1] || '',
      from: $from.pos - fullMatch.length,
      to: $from.pos,
    };
  }

  const slashMatch = textBefore.match(/(?:^|\s)(\/([^\s\/\ufffc]*))$/);
  if (slashMatch) {
    const slashToken = slashMatch[1];
    const query = slashMatch[2] || '';
    return {
      type: 'slash',
      query,
      from: $from.pos - slashToken.length,
      to: $from.pos,
    };
  }

  return null;
}
