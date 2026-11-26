import type { BrowserWindow } from 'electron';
import { Card } from '../../shared/types';
import { dbMaster } from '../database/dbMaster';
import {
  CliResponse,
  buildProseMirrorDocJson,
  dispatchCliCommand,
  str,
  todayDateKey,
} from './cliHelpers';

export async function handleJournalCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'list') {
    const journals = await dbMaster.query<Card>(
      `SELECT * FROM cards WHERE is_deleted = 0 AND id LIKE 'journal-%' ORDER BY id DESC LIMIT 30`
    );
    return {
      status: 200,
      body: {
        ok: true,
        count: journals.length,
        journals: journals.map((j) => ({
          id: j.id,
          title: j.title,
          preview: (j.content_text || '').slice(0, 120),
        })),
      },
    };
  }
  if (action === 'today') {
    const dateKey = str(params.date) || todayDateKey();
    const id = `journal-${dateKey}`;
    const content = str(params.content);
    const now = Date.now();
    const existing = await dbMaster.query<Card>(`SELECT * FROM cards WHERE id = ? LIMIT 1`, [id]);
    if (existing.length === 0) {
      await dbMaster.execute([
        {
          sql: `INSERT INTO cards (id, title, content_json, content_text, created_at, updated_at, is_deleted, color)
                VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
          params: [id, dateKey, buildProseMirrorDocJson(content), content, now, now],
        },
      ]);
    } else if (content) {
      const merged = existing[0].content_text
        ? `${existing[0].content_text}\n${content}`
        : content;
      await dbMaster.execute([
        {
          sql: `UPDATE cards SET content_json = ?, content_text = ?, updated_at = ?, is_deleted = 0 WHERE id = ?`,
          params: [buildProseMirrorDocJson(merged), merged, now, id],
        },
      ]);
    }
    await dispatchCliCommand(win, { type: 'navigate', view: 'journal' });
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, id, date: dateKey } };
  }
  if (action === 'open') {
    await dispatchCliCommand(win, { type: 'navigate', view: 'journal' });
    return { status: 200, body: { ok: true, action, view: 'journal' } };
  }
  return { status: 400, body: { ok: false, error: `Unsupported journal action: ${action}` } };
}
