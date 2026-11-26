import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  InputRule,
} from 'prosemirror-inputrules';
import { heptaSchema } from './schema';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';

export function buildInputRules() {
  const rules: InputRule[] = [];

  rules.push(
    textblockTypeInputRule(
      new RegExp('^(#{1,6})\\s$'),
      heptaSchema.nodes.heading,
      (match) => ({ level: match[1].length })
    )
  );

  rules.push(wrappingInputRule(/^\s*>>\s$/, heptaSchema.nodes.toggle_list));

  rules.push(wrappingInputRule(/^\s*>\s$/, heptaSchema.nodes.blockquote));

  rules.push(wrappingInputRule(/^\s*([-+*])\s$/, heptaSchema.nodes.bullet_list));

  rules.push(
    wrappingInputRule(
      /^(\d+)\.\s$/,
      heptaSchema.nodes.ordered_list,
      (match) => ({ order: +match[1] }),
      (match, node) => node.childCount + node.attrs.order === +match[1]
    )
  );

  rules.push(
    new InputRule(
      /^\s*(\[ \]|\[\])\s$/,
      (state: EditorState, _match: RegExpMatchArray, start: number, end: number): Transaction | null => {
        const { tr } = state;
        tr.delete(start, end);

        const $pos = tr.doc.resolve(start);
        const range = $pos.blockRange();
        if (!range) return null;

        const node = tr.doc.nodeAt(range.start);
        if (!node || !node.isTextblock) return null;

        const para =
          node.type === heptaSchema.nodes.paragraph
            ? node
            : heptaSchema.nodes.paragraph.create(null, node.content);

        const listItem = heptaSchema.nodes.list_item.create({ checked: false }, para);
        const taskList = heptaSchema.nodes.task_list.create(null, listItem);

        tr.replaceRangeWith(range.start, range.end, taskList);
        tr.setSelection(
          TextSelection.near(tr.doc.resolve(Math.min(range.start + 3, tr.doc.content.size)))
        );
        return tr;
      }
    )
  );

  rules.push(
    textblockTypeInputRule(
      /^```([a-zA-Z0-9_+-]*)\s$/,
      heptaSchema.nodes.code_block,
      (match) => ({ params: match[1] || '' })
    )
  );
  rules.push(textblockTypeInputRule(/^```$/, heptaSchema.nodes.code_block));

  rules.push(
    new InputRule(
      /^\$\$$/,
      (state: EditorState, _match: RegExpMatchArray, start: number, end: number): Transaction | null => {
        const { tr } = state;
        tr.delete(start, end);
        const $pos = tr.doc.resolve(start);
        const range = $pos.blockRange();
        if (!range) return null;
        const mathNode = heptaSchema.nodes.math_display.create();
        const para = heptaSchema.nodes.paragraph.create();
        tr.replaceWith(range.start, range.end, [mathNode, para]);
        return tr;
      }
    )
  );

  rules.push(
    new InputRule(
      /\$([^$\n]+)\$$/,
      (state: EditorState, match: RegExpMatchArray, start: number, end: number): Transaction | null => {
        const latex = match[1]?.trim();
        if (!latex) return null;
        const mathNode = heptaSchema.nodes.math_inline.create(null, [
          state.schema.text(latex),
        ]);
        return state.tr.replaceWith(start, end, [mathNode, state.schema.text(' ')]);
      }
    )
  );

  rules.push(
    new InputRule(
      /^(?:---|___|\*\*\*)$/,
      (state: EditorState, _match: RegExpMatchArray, start: number, end: number): Transaction | null => {
        const { tr } = state;
        tr.delete(start, end);

        const $pos = tr.doc.resolve(start);
        const range = $pos.blockRange();
        if (!range) return null;

        const hr = heptaSchema.nodes.horizontal_rule.create();
        const para = heptaSchema.nodes.paragraph.create();

        tr.replaceWith(range.start, range.end, [hr, para]);
        const target = Math.min(range.start + hr.nodeSize + 1, tr.doc.content.size);
        tr.setSelection(TextSelection.near(tr.doc.resolve(target), 1));
        return tr;
      }
    )
  );

  return inputRules({ rules });
}
