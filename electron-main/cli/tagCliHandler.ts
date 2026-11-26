import type { BrowserWindow } from 'electron';
import { Tag } from '../../shared/types';
import { dbMaster } from '../database/dbMaster';
import { CliResponse, dispatchCliCommand, str } from './cliHelpers';

export async function handleTagCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'list') {
    const tags = await dbMaster.query<Tag & { card_count: number }>(
      `SELECT t.id, t.name, t.color, COUNT(ct.card_id) as card_count
       FROM tags t LEFT JOIN card_tags ct ON ct.tag_id = t.id
       GROUP BY t.id ORDER BY t.name ASC`
    );
    return { status: 200, body: { ok: true, count: tags.length, tags } };
  }
  if (action === 'create') {
    const name = str(params.name);
    if (!name) return { status: 400, body: { ok: false, error: 'Missing --name' } };
    const color = str(params.color) || 'blue';
    const id = `tag-${Date.now()}`;
    await dbMaster.execute([
      {
        sql: `INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)`,
        params: [id, name, color],
      },
    ]);
    const rows = await dbMaster.query<Tag>(`SELECT * FROM tags WHERE name = ? LIMIT 1`, [name]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, tag: rows[0] ?? { id, name, color } } };
  }
  if (action === 'delete') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    await dbMaster.execute([
      { sql: `DELETE FROM card_tags WHERE tag_id = ?`, params: [id] },
      { sql: `DELETE FROM tags WHERE id = ?`, params: [id] },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, deletedId: id } };
  }
  if (action === 'attach' || action === 'detach') {
    const cardId = str(params.cardId);
    const tagId = str(params.tagId);
    if (!cardId || !tagId) {
      return { status: 400, body: { ok: false, error: 'Missing --card-id or --tag-id' } };
    }
    if (action === 'attach') {
      await dbMaster.execute([
        {
          sql: `INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)`,
          params: [cardId, tagId],
        },
      ]);
    } else {
      await dbMaster.execute([
        {
          sql: `DELETE FROM card_tags WHERE card_id = ? AND tag_id = ?`,
          params: [cardId, tagId],
        },
      ]);
    }
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, cardId, tagId } };
  }
  if (action === 'cards') {
    const tagId = str(params.tagId);
    if (!tagId) return { status: 400, body: { ok: false, error: 'Missing --tag-id' } };
    const cards = await dbMaster.query<{ id: string; title: string }>(
      `SELECT c.id, c.title FROM card_tags ct JOIN cards c ON c.id = ct.card_id WHERE ct.tag_id = ? AND c.is_deleted = 0`,
      [tagId]
    );
    return { status: 200, body: { ok: true, tagId, count: cards.length, cards } };
  }
  return { status: 400, body: { ok: false, error: `Unsupported tag action: ${action}` } };
}
