import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/api';
import {
  Card,
  HighlightJoinedRow,
  Tag,
  TagGroup,
  TagWithCountRow,
  UpdateTagInput,
} from '../../shared/types';
import { dbMaster } from '../database/dbMaster';

const DEFAULT_TAG_COLORS = ['#207dff', '#75c33a', '#e89b3d', '#c28dfd', '#fa776b', '#52aff3'];

export function registerTagsApiHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.TAGS_LIST_WITH_COUNTS, async () => {
    return dbMaster.query<TagWithCountRow>(
      `SELECT t.id, t.name, t.color, t.tag_group_id, t.parent_tag_id,
              t.sort_order, t.is_folded, t.kanban_group_by_property_id,
              COUNT(DISTINCT c.id) as card_count,
              COUNT(DISTINCT h.id) as highlight_count
       FROM tags t
       LEFT JOIN card_tags ct ON ct.tag_id = t.id
       LEFT JOIN cards c ON c.id = ct.card_id AND c.is_deleted = 0
       LEFT JOIN highlight_tags ht ON ht.tag_id = t.id
       LEFT JOIN highlight_elements h ON h.id = ht.highlight_id AND h.is_deleted = 0
       GROUP BY t.id
       ORDER BY t.sort_order ASC, t.name ASC`
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.TAGS_CREATE,
    async (
      _event,
      payload: {
        name: string;
        color?: string | null;
        tagGroupId?: string | null;
        parentTagId?: string | null;
      }
    ) => {
      const trimmed = payload.name.trim().replace(/^#/, '');
      if (!trimmed) {
        throw new Error('Tag name cannot be empty');
      }

      const existing = await dbMaster.query<Tag>(
        `SELECT id, name, color, tag_group_id, parent_tag_id, sort_order, is_folded, kanban_group_by_property_id
         FROM tags WHERE LOWER(name) = LOWER(?) LIMIT 1`,
        [trimmed]
      );
      if (existing.length > 0) {
        return existing[0];
      }

      const countRows = await dbMaster.query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM tags');
      const count = countRows[0]?.cnt ?? 0;
      const id = `tag-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const color = payload.color ?? DEFAULT_TAG_COLORS[count % DEFAULT_TAG_COLORS.length];
      const tagGroupId = payload.tagGroupId ?? null;
      const parentTagId = payload.parentTagId ?? null;

      await dbMaster.run(
        `INSERT OR IGNORE INTO tags (id, name, color, tag_group_id, parent_tag_id, sort_order, is_folded)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [id, trimmed, color, tagGroupId, parentTagId, count]
      );

      return {
        id,
        name: trimmed,
        color,
        tag_group_id: tagGroupId,
        parent_tag_id: parentTagId,
        sort_order: count,
        is_folded: 0,
        kanban_group_by_property_id: null,
      } satisfies Tag;
    }
  );

  ipcMain.handle(IPC_CHANNELS.TAGS_UPDATE, async (_event, payload: UpdateTagInput) => {
    const sets: string[] = [];
    const params: Array<string | number | null> = [];

    if (payload.name !== undefined) {
      const trimmed = payload.name.trim().replace(/^#/, '');
      if (trimmed) {
        sets.push('name = ?');
        params.push(trimmed);
      }
    }
    if (payload.color !== undefined) {
      sets.push('color = ?');
      params.push(payload.color);
    }
    if (payload.tagGroupId !== undefined) {
      sets.push('tag_group_id = ?');
      params.push(payload.tagGroupId);
    }
    if (payload.parentTagId !== undefined) {
      sets.push('parent_tag_id = ?');
      params.push(payload.parentTagId);
    }
    if (payload.sortOrder !== undefined) {
      sets.push('sort_order = ?');
      params.push(payload.sortOrder);
    }
    if (payload.isFolded !== undefined) {
      sets.push('is_folded = ?');
      params.push(payload.isFolded);
    }
    if (payload.kanbanGroupByPropertyId !== undefined) {
      sets.push('kanban_group_by_property_id = ?');
      params.push(payload.kanbanGroupByPropertyId);
    }

    if (sets.length === 0) return;
    params.push(payload.id);
    await dbMaster.run(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`, params);
  });

  ipcMain.handle(IPC_CHANNELS.TAGS_DELETE, async (_event, payload: { id: string } | string) => {
    const id = typeof payload === 'string' ? payload : payload.id;
    await dbMaster.execute([
      { sql: 'UPDATE tags SET parent_tag_id = NULL WHERE parent_tag_id = ?', params: [id] },
      { sql: 'DELETE FROM card_tags WHERE tag_id = ?', params: [id] },
      { sql: 'DELETE FROM highlight_tags WHERE tag_id = ?', params: [id] },
      { sql: 'DELETE FROM tag_properties WHERE tag_id = ?', params: [id] },
      { sql: 'DELETE FROM tags WHERE id = ?', params: [id] },
    ]);
  });

  ipcMain.handle(
    IPC_CHANNELS.TAGS_LIST_CARDS_BY_TAG,
    async (_event, payload: { tagId: string } | string) => {
      const tagId = typeof payload === 'string' ? payload : payload.tagId;
      return dbMaster.query<Card>(
        `SELECT c.* FROM cards c
         JOIN card_tags ct ON ct.card_id = c.id
         WHERE ct.tag_id = ? AND c.is_deleted = 0
         ORDER BY c.updated_at DESC`,
        [tagId]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TAGS_LIST_HIGHLIGHTS_BY_TAG,
    async (_event, payload: { tagId: string } | string) => {
      const tagId = typeof payload === 'string' ? payload : payload.tagId;
      return dbMaster.query<HighlightJoinedRow>(
        `SELECT h.*, d.title as doc_title, d.doc_type as doc_type
         FROM highlight_elements h
         JOIN highlight_tags ht ON ht.highlight_id = h.id
         LEFT JOIN documents d ON d.id = h.source_id
         WHERE ht.tag_id = ? AND h.is_deleted = 0
         ORDER BY h.updated_at DESC`,
        [tagId]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TAGS_ASSIGN_TO_CARD,
    async (_event, payload: { cardId: string; tagId: string }) => {
      await dbMaster.run('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)', [
        payload.cardId,
        payload.tagId,
      ]);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TAGS_REMOVE_FROM_CARD,
    async (_event, payload: { cardId: string; tagId: string }) => {
      await dbMaster.run('DELETE FROM card_tags WHERE card_id = ? AND tag_id = ?', [
        payload.cardId,
        payload.tagId,
      ]);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TAG_GROUPS_LIST, async () => {
    return dbMaster.query<TagGroup>(
      `SELECT id, name, sort_order, is_folded, created_at, updated_at
       FROM tag_groups
       ORDER BY sort_order ASC, created_at ASC`
    );
  });

  ipcMain.handle(IPC_CHANNELS.TAG_GROUPS_CREATE, async (_event, payload: { name: string }) => {
    const trimmed = payload.name.trim() || 'New Group';
    const now = Date.now();
    const countRows = await dbMaster.query<{ cnt: number }>('SELECT COUNT(*) as cnt FROM tag_groups');
    const sortOrder = countRows[0]?.cnt ?? 0;
    const id = `taggrp-${now}-${Math.random().toString(36).slice(2, 6)}`;

    await dbMaster.run(
      `INSERT INTO tag_groups (id, name, sort_order, is_folded, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [id, trimmed, sortOrder, now, now]
    );

    return {
      id,
      name: trimmed,
      sort_order: sortOrder,
      is_folded: 0,
      created_at: now,
      updated_at: now,
    } satisfies TagGroup;
  });

  ipcMain.handle(
    IPC_CHANNELS.TAG_GROUPS_UPDATE,
    async (
      _event,
      payload: { id: string; name?: string; isFolded?: number; sortOrder?: number }
    ) => {
      const sets: string[] = [];
      const params: Array<string | number> = [];

      if (payload.name !== undefined) {
        const trimmed = payload.name.trim();
        if (trimmed) {
          sets.push('name = ?');
          params.push(trimmed);
        }
      }
      if (payload.isFolded !== undefined) {
        sets.push('is_folded = ?');
        params.push(payload.isFolded);
      }
      if (payload.sortOrder !== undefined) {
        sets.push('sort_order = ?');
        params.push(payload.sortOrder);
      }
      if (sets.length === 0) return;

      sets.push('updated_at = ?');
      params.push(Date.now());
      params.push(payload.id);

      await dbMaster.run(`UPDATE tag_groups SET ${sets.join(', ')} WHERE id = ?`, params);
    }
  );

  ipcMain.handle(IPC_CHANNELS.TAG_GROUPS_DELETE, async (_event, payload: { id: string }) => {
    await dbMaster.execute([
      { sql: 'UPDATE tags SET tag_group_id = NULL WHERE tag_group_id = ?', params: [payload.id] },
      { sql: 'DELETE FROM tag_groups WHERE id = ?', params: [payload.id] },
    ]);
  });
}