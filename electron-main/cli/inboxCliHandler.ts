import type { BrowserWindow } from 'electron';
import { Card } from '../../shared/types';
import { dbMaster } from '../database/dbMaster';
import { CliResponse, buildProseMirrorDocJson, dispatchCliCommand, str } from './cliHelpers';

export async function handleInboxCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'list') {
    const cards = await dbMaster.query<Card>(
      `SELECT c.* FROM cards c
       WHERE c.is_deleted = 0
         AND c.id NOT LIKE 'journal-%'
         AND NOT EXISTS (SELECT 1 FROM whiteboard_objects wo WHERE wo.object_type = 'card' AND wo.target_id = c.id)
       ORDER BY c.updated_at DESC LIMIT 50`
    );
    return {
      status: 200,
      body: {
        ok: true,
        count: cards.length,
        items: cards.map((c) => ({
          id: c.id,
          title: c.title,
          preview: (c.content_text || '').slice(0, 100),
        })),
      },
    };
  }
  if (action === 'capture') {
    const title = str(params.title) || 'Inbox Note';
    const content = str(params.content);
    const now = Date.now();
    const id = `card-${now}`;
    await dbMaster.execute([
      {
        sql: `INSERT INTO cards (id, title, content_json, content_text, created_at, updated_at, is_deleted, color)
              VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
        params: [id, title, buildProseMirrorDocJson(content), content, now, now],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, id, title } };
  }
  return { status: 400, body: { ok: false, error: `Unsupported inbox action: ${action}` } };
}
