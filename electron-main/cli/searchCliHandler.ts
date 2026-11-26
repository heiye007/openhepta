import type { BrowserWindow } from 'electron';
import { dbMaster } from '../database/dbMaster';
import { CliResponse, dispatchCliCommand, num, str } from './cliHelpers';

export async function handleSearchCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'query') {
    const text = str(params.text);
    const limit = Math.max(1, Math.min(100, num(params.limit, 20)));
    if (!text) return { status: 400, body: { ok: false, error: 'Missing --text' } };
    const cards = await dbMaster.query<{ id: string; title: string; content_text: string }>(
      `SELECT id, title, content_text FROM cards WHERE is_deleted = 0 AND (title LIKE ? OR content_text LIKE ?) ORDER BY updated_at DESC LIMIT ?`,
      [`%${text}%`, `%${text}%`, limit]
    );
    const whiteboards = await dbMaster.query<{ id: string; name: string }>(
      `SELECT id, name FROM whiteboards WHERE is_deleted = 0 AND name LIKE ? ORDER BY updated_at DESC LIMIT ?`,
      [`%${text}%`, limit]
    );
    return {
      status: 200,
      body: {
        ok: true,
        query: text,
        cards: cards.map((c) => ({
          id: c.id,
          title: c.title,
          preview: (c.content_text || '').slice(0, 100),
        })),
        whiteboards,
      },
    };
  }
  if (action === 'open') {
    await dispatchCliCommand(win, { type: 'toggle-search', open: true });
    return { status: 200, body: { ok: true, action, searchModalOpen: true } };
  }
  if (action === 'close') {
    await dispatchCliCommand(win, { type: 'toggle-search', open: false });
    return { status: 200, body: { ok: true, action, searchModalOpen: false } };
  }
  return { status: 400, body: { ok: false, error: `Unsupported search action: ${action}` } };
}
