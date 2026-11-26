import type { BrowserWindow } from 'electron';
import { Card } from '../../shared/types';
import { dbMaster } from '../database/dbMaster';
import {
  CliResponse,
  buildProseMirrorDocJson,
  dispatchCliCommand,
  num,
  str,
} from './cliHelpers';

export async function handleCardCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'list') {
    const search = str(params.search);
    const limit = Math.max(1, Math.min(200, num(params.limit, 50)));
    const cards = search
      ? await dbMaster.query<Card>(
          `SELECT * FROM cards WHERE is_deleted = 0 AND (title LIKE ? OR content_text LIKE ?) ORDER BY updated_at DESC LIMIT ?`,
          [`%${search}%`, `%${search}%`, limit]
        )
      : await dbMaster.query<Card>(
          `SELECT * FROM cards WHERE is_deleted = 0 ORDER BY updated_at DESC LIMIT ?`,
          [limit]
        );
    return {
      status: 200,
      body: {
        ok: true,
        count: cards.length,
        cards: cards.map((c) => ({
          id: c.id,
          title: c.title,
          color: c.color,
          preview: (c.content_text || '').slice(0, 120),
          updatedAt: c.updated_at,
        })),
      },
    };
  }
  if (action === 'create') {
    const title = str(params.title) || 'Untitled';
    const content = str(params.content);
    const color = str(params.color) || null;
    const now = Date.now();
    const id = `card-${now}`;
    await dbMaster.execute([
      {
        sql: `INSERT INTO cards (id, title, content_json, content_text, created_at, updated_at, is_deleted, color)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        params: [id, title, buildProseMirrorDocJson(content), content, now, now, color],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, id, title, color } };
  }
  if (action === 'update') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    const rows = await dbMaster.query<Card>(`SELECT * FROM cards WHERE id = ? LIMIT 1`, [id]);
    const existing = rows[0];
    if (!existing) return { status: 404, body: { ok: false, error: `Card not found: ${id}` } };
    const title = params.title !== undefined ? str(params.title) : existing.title;
    const content = params.content !== undefined ? str(params.content) : existing.content_text;
    const contentJson =
      params.content !== undefined ? buildProseMirrorDocJson(content) : existing.content_json;
    const color = params.color !== undefined ? str(params.color) || null : existing.color;
    await dbMaster.execute([
      {
        sql: `UPDATE cards SET title = ?, content_json = ?, content_text = ?, color = ?, updated_at = ? WHERE id = ?`,
        params: [title, contentJson, content, color, Date.now(), id],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, id, title, color } };
  }
  if (action === 'delete') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    await dbMaster.execute([
      {
        sql: `UPDATE cards SET is_deleted = 1, updated_at = ? WHERE id = ?`,
        params: [Date.now(), id],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, deletedId: id } };
  }
  if (action === 'open') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    const full = params.full === true || params.full === 'true';
    await dispatchCliCommand(win, { type: 'open-card', cardId: id, full });
    return { status: 200, body: { ok: true, action, cardId: id, full } };
  }
  if (action === 'backlinks') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    const rows = await dbMaster.query<{ id: string; title: string }>(
      `SELECT c.id, c.title FROM card_references r JOIN cards c ON c.id = r.source_card_id WHERE r.target_card_id = ? AND c.is_deleted = 0`,
      [id]
    );
    return { status: 200, body: { ok: true, cardId: id, count: rows.length, backlinks: rows } };
  }
  return { status: 400, body: { ok: false, error: `Unsupported card action: ${action}` } };
}
