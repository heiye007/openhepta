import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/api';
import {
  Card,
  CardBacklinkCountRow,
  CardBacklinkRow,
  CardReferenceRow,
  CardTagBindingRow,
  CardWhiteboardBindingRow,
  CardWhiteboardRow,
  CreateCardInput,
  Tag,
} from '../../shared/types';
import { dbMaster } from '../database/dbMaster';

export function registerCardsApiHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CARDS_LIST, async (_event, payload?: { search?: string } | string) => {
    const search = typeof payload === 'string' ? payload : payload?.search;
    const trimmed = search?.trim() ?? '';
    if (trimmed) {
      return dbMaster.query<Card>(
        'SELECT * FROM cards WHERE (title LIKE ? OR content_text LIKE ?) AND is_deleted = 0 ORDER BY updated_at DESC',
        [`%${trimmed}%`, `%${trimmed}%`]
      );
    }
    return dbMaster.query<Card>('SELECT * FROM cards WHERE is_deleted = 0 ORDER BY updated_at DESC');
  });

  ipcMain.handle(IPC_CHANNELS.CARDS_GET, async (_event, payload: { id: string } | string) => {
    const id = typeof payload === 'string' ? payload : payload.id;
    const rows = await dbMaster.query<Card>(
      'SELECT * FROM cards WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [id]
    );
    return rows[0] ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.CARDS_CREATE, async (_event, input?: CreateCardInput) => {
    const now = Date.now();
    const id = input?.id || `card-${now}-${Math.random().toString(36).slice(2, 6)}`;
    const title = input?.title ?? 'Untitled Card';
    const contentJson = input?.contentJson ?? '{}';
    const contentText = input?.contentText ?? '';
    const color = input?.color ?? null;

    await dbMaster.run(
      'INSERT INTO cards (id, title, content_json, content_text, created_at, updated_at, is_deleted, color) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [id, title, contentJson, contentText, now, now, color]
    );

    return {
      id,
      title,
      content_json: contentJson,
      content_text: contentText,
      created_at: now,
      updated_at: now,
      is_deleted: 0,
      color,
    } satisfies Card;
  });

  ipcMain.handle(
    IPC_CHANNELS.CARDS_UPDATE_TITLE,
    async (_event, payload: { id: string; title: string }) => {
      await dbMaster.run('UPDATE cards SET title = ?, updated_at = ? WHERE id = ?', [
        payload.title,
        Date.now(),
        payload.id,
      ]);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARDS_UPDATE_CONTENT,
    async (_event, payload: { id: string; contentJson: string; contentText: string }) => {
      await dbMaster.run(
        'UPDATE cards SET content_json = ?, content_text = ?, updated_at = ? WHERE id = ?',
        [payload.contentJson, payload.contentText, Date.now(), payload.id]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARDS_UPDATE_COLOR,
    async (_event, payload: { id: string; color: string | null }) => {
      await dbMaster.run('UPDATE cards SET color = ?, updated_at = ? WHERE id = ?', [
        payload.color,
        Date.now(),
        payload.id,
      ]);
    }
  );

  ipcMain.handle(IPC_CHANNELS.CARDS_DELETE, async (_event, payload: { id: string } | string) => {
    const id = typeof payload === 'string' ? payload : payload.id;
    await dbMaster.execute([
      {
        sql: 'UPDATE cards SET is_deleted = 1, updated_at = ? WHERE id = ?',
        params: [Date.now(), id],
      },
      {
        sql: 'DELETE FROM whiteboard_objects WHERE target_id = ?',
        params: [id],
      },
    ]);
  });

  ipcMain.handle(IPC_CHANNELS.CARDS_DUPLICATE, async (_event, payload: { id: string } | string) => {
    const id = typeof payload === 'string' ? payload : payload.id;
    const rows = await dbMaster.query<Card>(
      'SELECT * FROM cards WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [id]
    );
    const source = rows[0];
    if (!source) return null;

    const now = Date.now();
    const newId = `card-${now}-${Math.random().toString(36).slice(2, 6)}`;
    const newTitle = `${source.title || 'Untitled'} (Copy)`;

    await dbMaster.run(
      'INSERT INTO cards (id, title, content_json, content_text, created_at, updated_at, is_deleted, color) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      [newId, newTitle, source.content_json, source.content_text, now, now, source.color ?? null]
    );

    const existingTagRows = await dbMaster.query<{ tag_id: string }>(
      'SELECT tag_id FROM card_tags WHERE card_id = ?',
      [id]
    );
    if (existingTagRows.length > 0) {
      await dbMaster.execute(
        existingTagRows.map((row) => ({
          sql: 'INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)',
          params: [newId, row.tag_id],
        }))
      );
    }

    return {
      id: newId,
      title: newTitle,
      content_json: source.content_json,
      content_text: source.content_text,
      created_at: now,
      updated_at: now,
      is_deleted: 0,
      color: source.color ?? null,
    } satisfies Card;
  });

  ipcMain.handle(
    IPC_CHANNELS.CARDS_LIST_TAGS,
    async (_event, payload: { cardId: string } | string) => {
      const cardId = typeof payload === 'string' ? payload : payload.cardId;
      return dbMaster.query<Tag>(
        'SELECT t.id, t.name, t.color FROM tags t JOIN card_tags ct ON ct.tag_id = t.id WHERE ct.card_id = ? ORDER BY t.name ASC',
        [cardId]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARDS_ADD_TAG,
    async (_event, payload: { cardId: string; tagName: string }) => {
      const trimmed = payload.tagName.trim().replace(/^#/, '');
      if (!trimmed) {
        throw new Error('Tag name cannot be empty');
      }

      const existing = await dbMaster.query<Tag>(
        'SELECT id, name, color FROM tags WHERE LOWER(name) = LOWER(?) LIMIT 1',
        [trimmed]
      );

      let tag: Tag;
      if (existing.length > 0) {
        tag = existing[0];
      } else {
        const tagId = `tag-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        tag = { id: tagId, name: trimmed, color: '#207dff' };
        await dbMaster.run('INSERT OR IGNORE INTO tags (id, name, color) VALUES (?, ?, ?)', [
          tag.id,
          tag.name,
          tag.color,
        ]);
      }

      await dbMaster.run('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', [
        payload.cardId,
        tag.id,
      ]);
      return tag;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARDS_REMOVE_TAG,
    async (_event, payload: { cardId: string; tagId: string }) => {
      await dbMaster.run('DELETE FROM card_tags WHERE card_id = ? AND tag_id = ?', [
        payload.cardId,
        payload.tagId,
      ]);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARDS_LIST_BACKLINKS,
    async (_event, payload: { cardId: string } | string) => {
      const cardId = typeof payload === 'string' ? payload : payload.cardId;
      return dbMaster.query<CardBacklinkRow>(
        `SELECT DISTINCT c.id, c.title, c.content_text, c.updated_at
         FROM cards c
         JOIN card_references cr ON cr.source_card_id = c.id
         WHERE cr.target_card_id = ? AND c.is_deleted = 0
         ORDER BY c.updated_at DESC`,
        [cardId]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARDS_LIST_UNLINKED_MENTIONS,
    async (_event, payload: { cardId: string } | string) => {
      const cardId = typeof payload === 'string' ? payload : payload.cardId;
      const targetRows = await dbMaster.query<Card>(
        'SELECT * FROM cards WHERE id = ? AND is_deleted = 0 LIMIT 1',
        [cardId]
      );
      const target = targetRows[0];
      if (!target || (target.title || '').trim().length < 2) {
        return [];
      }
      const needle = target.title.trim();
      return dbMaster.query<Card>(
        `SELECT c.*
         FROM cards c
         WHERE c.is_deleted = 0
           AND c.id != ?
           AND LOWER(c.content_text) LIKE LOWER(?)
           AND NOT EXISTS (
             SELECT 1 FROM card_references cr
             WHERE cr.source_card_id = c.id AND cr.target_card_id = ?
           )
         ORDER BY c.updated_at DESC`,
        [cardId, `%${needle}%`, cardId]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARDS_LINK_REFERENCE,
    async (_event, payload: { sourceCardId: string; targetCardId: string }) => {
      await dbMaster.run(
        'INSERT OR IGNORE INTO card_references (source_card_id, target_card_id) VALUES (?, ?)',
        [payload.sourceCardId, payload.targetCardId]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARDS_UNLINK_REFERENCE,
    async (_event, payload: { sourceCardId: string; targetCardId: string }) => {
      await dbMaster.run(
        'DELETE FROM card_references WHERE source_card_id = ? AND target_card_id = ?',
        [payload.sourceCardId, payload.targetCardId]
      );
    }
  );

  ipcMain.handle(IPC_CHANNELS.CARDS_LIST_ALL_REFERENCES, async () => {
    return dbMaster.query<CardReferenceRow>('SELECT source_card_id, target_card_id FROM card_references');
  });

  ipcMain.handle(
    IPC_CHANNELS.CARDS_LIST_WHITEBOARDS,
    async (_event, payload: { cardId: string } | string) => {
      const cardId = typeof payload === 'string' ? payload : payload.cardId;
      return dbMaster.query<CardWhiteboardRow>(
        `SELECT DISTINCT w.id, w.name, w.updated_at
         FROM whiteboards w
         JOIN whiteboard_objects wo ON wo.whiteboard_id = w.id
         WHERE wo.target_id = ? AND w.is_deleted = 0
         ORDER BY w.updated_at DESC`,
        [cardId]
      );
    }
  );

  ipcMain.handle(IPC_CHANNELS.CARDS_LIST_ALL_CARD_TAGS, async () => {
    return dbMaster.query<CardTagBindingRow>(
      'SELECT ct.card_id, t.id as tag_id, t.name, t.color FROM card_tags ct JOIN tags t ON t.id = ct.tag_id'
    );
  });

  ipcMain.handle(IPC_CHANNELS.CARDS_LIST_ALL_CARD_WHITEBOARDS, async () => {
    return dbMaster.query<CardWhiteboardBindingRow>(
      "SELECT DISTINCT wo.target_id, w.id as whiteboard_id, w.name FROM whiteboard_objects wo JOIN whiteboards w ON w.id = wo.whiteboard_id WHERE wo.object_type = 'card' AND wo.target_id IS NOT NULL AND w.is_deleted = 0"
    );
  });

  ipcMain.handle(IPC_CHANNELS.CARDS_LIST_BACKLINK_COUNTS, async () => {
    return dbMaster.query<CardBacklinkCountRow>(
      'SELECT target_card_id, COUNT(DISTINCT source_card_id) as cnt FROM card_references GROUP BY target_card_id'
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.CARDS_SEARCH_FTS,
    async (_event, payload: { query: string; limit?: number }) => {
      const trimmed = (payload.query || '').trim();
      const limit = payload.limit ?? 20;
      if (!trimmed) return [];

      const sanitized = trimmed.replace(/["'*]/g, ' ').trim();
      let rows: Card[] = [];
      if (sanitized) {
        try {
          const ftsExpr = sanitized
            .split(/\s+/)
            .map((w) => `"${w}"*`)
            .join(' ');
          rows = await dbMaster.query<Card>(
            `SELECT c.* FROM cards c
             JOIN cards_fts f ON c.rowid = f.rowid
             WHERE cards_fts MATCH ? AND c.is_deleted = 0
             ORDER BY c.updated_at DESC LIMIT ?`,
            [ftsExpr, limit]
          );
        } catch {
          rows = [];
        }
      }
      if (rows.length === 0) {
        rows = await dbMaster.query<Card>(
          `SELECT * FROM cards
           WHERE (title LIKE ? OR content_text LIKE ?) AND is_deleted = 0
           ORDER BY updated_at DESC LIMIT ?`,
          [`%${trimmed}%`, `%${trimmed}%`, limit]
        );
      }
      return rows;
    }
  );

  ipcMain.handle(IPC_CHANNELS.CARDS_LIST_INBOX, async () => {
    return dbMaster.query<Card>(
      `SELECT c.* FROM cards c
       WHERE c.is_deleted = 0
         AND c.id NOT LIKE 'journal-%'
         AND NOT EXISTS (
           SELECT 1 FROM whiteboard_objects wo
           WHERE wo.target_id = c.id AND wo.object_type = 'card'
         )
       ORDER BY c.updated_at DESC`
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.CARDS_UPSERT_JOURNAL,
    async (_event, payload: { dateKey: string; contentJson: string; contentText: string }) => {
      const journalId = `journal-${payload.dateKey}`;
      const now = Date.now();
      const existing = await dbMaster.query<Card>('SELECT * FROM cards WHERE id = ? LIMIT 1', [
        journalId,
      ]);
      if (existing.length === 0) {
        if (!payload.contentText.trim()) return null;
        await dbMaster.run(
          'INSERT INTO cards (id, title, content_json, content_text, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, 0)',
          [journalId, payload.dateKey, payload.contentJson, payload.contentText, now, now]
        );
      } else {
        await dbMaster.run(
          'UPDATE cards SET content_json = ?, content_text = ?, updated_at = ?, is_deleted = 0 WHERE id = ?',
          [payload.contentJson, payload.contentText, now, journalId]
        );
      }
      const updated = await dbMaster.query<Card>(
        'SELECT * FROM cards WHERE id = ? AND is_deleted = 0 LIMIT 1',
        [journalId]
      );
      return updated[0] ?? null;
    }
  );
}
