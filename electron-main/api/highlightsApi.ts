import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { IPC_CHANNELS } from '../../shared/api';
import {
  AnnotationColor,
  CreateHighlightElementInput,
  HighlightElement,
  HighlightJoinedRow,
  HighlightListFilter,
  HighlightRect,
  Tag,
} from '../../shared/types';
import { dbMaster } from '../database/dbMaster';

async function attachTagsToHighlights<T extends { id: string; tags?: Tag[] }>(
  rows: T[]
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const bindings = await dbMaster.query<Tag & { highlight_id: string }>(
    `SELECT ht.highlight_id, t.id, t.name, t.color
     FROM highlight_tags ht
     JOIN tags t ON t.id = ht.tag_id
     WHERE ht.highlight_id IN (${placeholders})
     ORDER BY t.name ASC`,
    ids
  );
  const map = new Map<string, Tag[]>();
  for (const row of bindings) {
    const arr = map.get(row.highlight_id);
    const tag: Tag = { id: row.id, name: row.name, color: row.color };
    if (arr) arr.push(tag);
    else map.set(row.highlight_id, [tag]);
  }
  return rows.map((r) => ({ ...r, tags: map.get(r.id) ?? [] }));
}

export function registerHighlightsApiHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.HIGHLIGHTS_LIST,
    async (_event, filter?: HighlightListFilter) => {
      const conditions: string[] = ['h.is_deleted = 0'];
      const params: unknown[] = [];

      if (filter?.sourceType && filter.sourceType !== 'all') {
        conditions.push('h.source_type = ?');
        params.push(filter.sourceType);
      }
      if (filter?.color && filter.color !== 'all') {
        conditions.push('h.color = ?');
        params.push(filter.color);
      }
      if (filter?.search && filter.search.trim()) {
        const q = `%${filter.search.trim()}%`;
        conditions.push('(h.text_content LIKE ? OR h.note_text LIKE ? OR d.title LIKE ?)');
        params.push(q, q, q);
      }

      const rows = await dbMaster.query<HighlightJoinedRow>(
        `SELECT h.*, d.title as doc_title, d.doc_type as doc_type
         FROM highlight_elements h
         LEFT JOIN documents d ON d.id = h.source_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY h.updated_at DESC`,
        params
      );
      return attachTagsToHighlights(rows);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.HIGHLIGHTS_LIST_BY_SOURCE,
    async (_event, payload: { sourceId: string } | string) => {
      const sourceId = typeof payload === 'string' ? payload : payload.sourceId;
      const rows = await dbMaster.query<HighlightElement>(
        `SELECT * FROM highlight_elements
         WHERE source_id = ? AND is_deleted = 0
         ORDER BY COALESCE(page_number, 0) ASC, created_at ASC`,
        [sourceId]
      );
      return attachTagsToHighlights(rows);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.HIGHLIGHTS_CREATE,
    async (_event, input: CreateHighlightElementInput) => {
      const now = Date.now();
      const id = input.id || uuidv4();
      const highlightType = input.highlightType ?? 'text';
      const rectsJson = input.rectsJson ?? JSON.stringify(input.rects ?? []);
      const noteJson = input.noteJson ?? '{}';
      const noteText = (input.noteText ?? '').trim();
      const pageNumber = input.pageNumber ?? null;
      const epubCfi = input.epubCfi ?? null;
      const imageReferenceId = input.imageReferenceId ?? null;

      await dbMaster.run(
        `INSERT INTO highlight_elements (
          id, source_id, source_type, highlight_type, page_number, epub_cfi,
          rects_json, text_content, image_reference_id, note_json, note_text,
          color, created_at, updated_at, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          id,
          input.sourceId,
          input.sourceType,
          highlightType,
          pageNumber,
          epubCfi,
          rectsJson,
          input.textContent,
          imageReferenceId,
          noteJson,
          noteText,
          input.color,
          now,
          now,
        ]
      );

      return {
        id,
        source_id: input.sourceId,
        source_type: input.sourceType,
        highlight_type: highlightType,
        page_number: pageNumber,
        epub_cfi: epubCfi,
        rects_json: rectsJson,
        text_content: input.textContent,
        image_reference_id: imageReferenceId,
        note_json: noteJson,
        note_text: noteText,
        color: input.color,
        created_at: now,
        updated_at: now,
        is_deleted: 0,
      } satisfies HighlightElement;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.HIGHLIGHTS_UPDATE_NOTE,
    async (_event, payload: { id: string; noteText: string; noteJson?: string }) => {
      const now = Date.now();
      if (payload.noteJson !== undefined) {
        await dbMaster.run(
          'UPDATE highlight_elements SET note_text = ?, note_json = ?, updated_at = ? WHERE id = ?',
          [payload.noteText, payload.noteJson, now, payload.id]
        );
      } else {
        await dbMaster.run(
          'UPDATE highlight_elements SET note_text = ?, updated_at = ? WHERE id = ?',
          [payload.noteText, now, payload.id]
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.HIGHLIGHTS_UPDATE_COLOR,
    async (_event, payload: { id: string; color: AnnotationColor }) => {
      await dbMaster.run(
        'UPDATE highlight_elements SET color = ?, updated_at = ? WHERE id = ?',
        [payload.color, Date.now(), payload.id]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.HIGHLIGHTS_UPDATE_RECTS,
    async (
      _event,
      payload: { id: string; rects: HighlightRect[]; imageReferenceId?: string }
    ) => {
      const rectsJson = JSON.stringify(payload.rects);
      if (payload.imageReferenceId !== undefined) {
        await dbMaster.run(
          'UPDATE highlight_elements SET rects_json = ?, image_reference_id = ?, updated_at = ? WHERE id = ?',
          [rectsJson, payload.imageReferenceId, Date.now(), payload.id]
        );
      } else {
        await dbMaster.run(
          'UPDATE highlight_elements SET rects_json = ?, updated_at = ? WHERE id = ?',
          [rectsJson, Date.now(), payload.id]
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.HIGHLIGHTS_DELETE,
    async (_event, payload: { id: string } | string) => {
      const id = typeof payload === 'string' ? payload : payload.id;
      await dbMaster.execute([
        {
          sql: 'UPDATE highlight_elements SET is_deleted = 1, updated_at = ? WHERE id = ?',
          params: [Date.now(), id],
        },
        {
          sql: 'DELETE FROM highlight_tags WHERE highlight_id = ?',
          params: [id],
        },
        {
          sql: 'DELETE FROM whiteboard_objects WHERE target_id = ?',
          params: [id],
        },
      ]);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.HIGHLIGHTS_LIST_TAGS,
    async (_event, payload: { highlightId: string } | string) => {
      const highlightId = typeof payload === 'string' ? payload : payload.highlightId;
      return dbMaster.query<Tag>(
        'SELECT t.id, t.name, t.color FROM tags t JOIN highlight_tags ht ON ht.tag_id = t.id WHERE ht.highlight_id = ? ORDER BY t.name ASC',
        [highlightId]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.HIGHLIGHTS_ADD_TAG,
    async (_event, payload: { highlightId: string; tagName: string }) => {
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

      await dbMaster.run(
        'INSERT OR IGNORE INTO highlight_tags (highlight_id, tag_id) VALUES (?, ?)',
        [payload.highlightId, tag.id]
      );

      return tag;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.HIGHLIGHTS_REMOVE_TAG,
    async (_event, payload: { highlightId: string; tagId: string }) => {
      await dbMaster.run(
        'DELETE FROM highlight_tags WHERE highlight_id = ? AND tag_id = ?',
        [payload.highlightId, payload.tagId]
      );
    }
  );
}
