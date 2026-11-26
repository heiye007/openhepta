import { toggleMark, chainCommands } from 'prosemirror-commands';
import { splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { goToNextCell } from 'prosemirror-tables';
import { undo, redo } from 'prosemirror-history';
import { undoInputRule } from 'prosemirror-inputrules';
import { Command, Transaction } from 'prosemirror-state';
import { heptaSchema } from './schema';

export interface HeptaKeymapHandlers {
  onOpenLinkPopover?: () => boolean;
  onToggleHighlight?: () => boolean;
  onInsertInlineMath?: () => boolean;
  onOpenTurnInto?: () => boolean;
}

const splitHeptaListItem: Command = (state, dispatch) => {
  const { list_item, task_list } = heptaSchema.nodes;
  if (!dispatch) {
    return splitListItem(list_item)(state);
  }
  return splitListItem(list_item)(state, (tr: Transaction) => {
    const $head = tr.selection.$head;
    for (let d = $head.depth; d > 1; d--) {
      const node = $head.node(d);
      const parent = $head.node(d - 1);
      if (node.type === list_item && parent.type === task_list && node.attrs.checked === null) {
        tr.setNodeMarkup($head.before(d), undefined, {
          ...node.attrs,
          checked: false,
        });
        break;
      }
    }
    dispatch(tr);
  });
};

export function buildKeymap(handlers?: HeptaKeymapHandlers): Record<string, Command> {
  const { marks, nodes } = heptaSchema;
  const keys: Record<string, Command> = {};

  keys['Mod-z'] = undo;
  keys['Shift-Mod-z'] = redo;
  keys['Mod-y'] = redo;
  keys['Backspace'] = undoInputRule;

  keys['Mod-b'] = toggleMark(marks.strong);
  keys['Mod-i'] = toggleMark(marks.em);
  keys['Mod-u'] = toggleMark(marks.underline);
  keys['Shift-Mod-s'] = toggleMark(marks.strike);
  keys['Mod-e'] = toggleMark(marks.code);

  if (handlers?.onOpenLinkPopover) {
    keys['Mod-k'] = () => handlers.onOpenLinkPopover!();
  }
  if (handlers?.onToggleHighlight) {
    keys['Shift-Mod-h'] = () => handlers.onToggleHighlight!();
  }
  if (handlers?.onInsertInlineMath) {
    keys['Shift-Mod-e'] = () => handlers.onInsertInlineMath!();
  }
  if (handlers?.onOpenTurnInto) {
    keys['Mod-/'] = () => handlers.onOpenTurnInto!();
  }

  keys['Enter'] = splitHeptaListItem;
  keys['Tab'] = chainCommands(goToNextCell(1), sinkListItem(nodes.list_item));
  keys['Shift-Tab'] = chainCommands(goToNextCell(-1), liftListItem(nodes.list_item));
  keys['Mod-['] = liftListItem(nodes.list_item);
  keys['Mod-]'] = sinkListItem(nodes.list_item);
  keys['Shift-Enter'] = chainCommands((state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView());
    }
    return true;
  });

  return keys;
}
