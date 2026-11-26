import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/api';
import type {
  CardPropertyValue,
  CreatePropertyInput,
  PropertyConfig,
  TagProperty,
  TagPropertyJoined,
  UpdatePropertyBindingInput,
  UpdatePropertyInput,
} from '../../shared/types';
import { dbMaster } from '../database/dbMaster';

export function registerPropertiesApiHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROPERTIES_LIST_ALL, async () => {
    const props = await dbMaster.query<TagProperty>(
      `SELECT id, name, type, config_json, created_at, updated_at
       FROM properties
       ORDER BY created_at ASC`
    );
    const bindings = await dbMaster.query<{ tag_id: string; property_id: string }>(
      `SELECT tag_id, property_id FROM tag_properties`
    );
    const tagMap = new Map<string, string[]>();
    for (const b of bindings) {
      const arr = tagMap.get(b.property_id) ?? [];
      arr.push(b.tag_id);
      tagMap.set(b.property_id, arr);
    }
    return props.map(
      (p): TagPropertyJoined => ({
        ...p,
        tag_id: tagMap.get(p.id)?.[0] ?? '',
        sort_order: 0,
        width: 160,
        should_wrap: 0,
        is_hidden: 0,
        bound_tag_ids: tagMap.get(p.id) ?? [],
      })
    );
  });

  ipcMain.handle(
    IPC_CHANNELS.PROPERTIES_LIST_BY_TAG,
    async (_event, payload: { tagId: string }) => {
      return dbMaster.query<TagPropertyJoined>(
        `SELECT p.id, p.name, p.type, p.config_json, p.created_at, p.updated_at,
                tp.tag_id, tp.sort_order, tp.width, tp.should_wrap, tp.is_hidden
         FROM properties p
         JOIN tag_properties tp ON tp.property_id = p.id
         WHERE tp.tag_id = ?
         ORDER BY tp.sort_order ASC, p.created_at ASC`,
        [payload.tagId]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROPERTIES_LIST_FOR_CARD,
    async (_event, payload: { cardId: string }) => {
      const rows = await dbMaster.query<TagPropertyJoined>(
        `SELECT p.id, p.name, p.type, p.config_json, p.created_at, p.updated_at,
                tp.tag_id, tp.sort_order, tp.width, tp.should_wrap, tp.is_hidden
         FROM properties p
         JOIN tag_properties tp ON tp.property_id = p.id
         WHERE tp.tag_id IN (
           SELECT tag_id FROM card_tags WHERE card_id = ?
           UNION
           SELECT tag_id FROM highlight_tags WHERE highlight_id = ?
         )
         ORDER BY tp.sort_order ASC, p.created_at ASC`,
        [payload.cardId, payload.cardId]
      );
      const seen = new Map<string, TagPropertyJoined>();
      for (const r of rows) {
        const existing = seen.get(r.id);
        if (!existing) {
          seen.set(r.id, { ...r, bound_tag_ids: [r.tag_id] });
        } else {
          existing.bound_tag_ids = [...(existing.bound_tag_ids ?? []), r.tag_id];
        }
      }
      return Array.from(seen.values());
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROPERTIES_CREATE_FOR_TAG,
    async (_event, payload: CreatePropertyInput) => {
      const now = Date.now();
      const id = `prop-${now}-${Math.random().toString(36).slice(2, 6)}`;
      const trimmedName = payload.name.trim() || 'Property';
      const configJson = JSON.stringify(payload.config ?? {});

      const countRows = await dbMaster.query<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM tag_properties WHERE tag_id = ?',
        [payload.tagId]
      );
      const sortOrder = countRows[0]?.cnt ?? 0;

      await dbMaster.execute([
        {
          sql: `INSERT INTO properties (id, name, type, config_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
          params: [id, trimmedName, payload.type, configJson, now, now],
        },
        {
          sql: `INSERT OR IGNORE INTO tag_properties (tag_id, property_id, sort_order, width, should_wrap, is_hidden)
                VALUES (?, ?, ?, 160, 0, 0)`,
          params: [payload.tagId, id, sortOrder],
        },
      ]);

      return {
        id,
        name: trimmedName,
        type: payload.type,
        config_json: configJson,
        created_at: now,
        updated_at: now,
        tag_id: payload.tagId,
        sort_order: sortOrder,
        width: 160,
        should_wrap: 0,
        is_hidden: 0,
        bound_tag_ids: [payload.tagId],
      } satisfies TagPropertyJoined;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROPERTIES_ATTACH_TO_TAG,
    async (_event, payload: { tagId: string; propertyId: string }) => {
      const countRows = await dbMaster.query<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM tag_properties WHERE tag_id = ?',
        [payload.tagId]
      );
      const sortOrder = countRows[0]?.cnt ?? 0;
      await dbMaster.run(
        `INSERT OR IGNORE INTO tag_properties (tag_id, property_id, sort_order, width, should_wrap, is_hidden)
         VALUES (?, ?, ?, 160, 0, 0)`,
        [payload.tagId, payload.propertyId, sortOrder]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROPERTIES_DETACH_FROM_TAG,
    async (_event, payload: { tagId: string; propertyId: string }) => {
      await dbMaster.run(
        'DELETE FROM tag_properties WHERE tag_id = ? AND property_id = ?',
        [payload.tagId, payload.propertyId]
      );
    }
  );

  ipcMain.handle(IPC_CHANNELS.PROPERTIES_UPDATE, async (_event, payload: UpdatePropertyInput) => {
    const sets: string[] = [];
    const params: Array<string | number> = [];
    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (trimmed) {
        sets.push('name = ?');
        params.push(trimmed);
      }
    }
    if (payload.config !== undefined) {
      sets.push('config_json = ?');
      params.push(JSON.stringify(payload.config));
    }
    if (sets.length === 0) return null;
    sets.push('updated_at = ?');
    params.push(Date.now());
    params.push(payload.id);

    await dbMaster.run(`UPDATE properties SET ${sets.join(', ')} WHERE id = ?`, params);
    const rows = await dbMaster.query<TagProperty>(
      'SELECT id, name, type, config_json, created_at, updated_at FROM properties WHERE id = ?',
      [payload.id]
    );
    return rows[0] ?? null;
  });

  ipcMain.handle(
    IPC_CHANNELS.PROPERTIES_UPDATE_BINDING,
    async (_event, payload: UpdatePropertyBindingInput) => {
      const sets: string[] = [];
      const params: Array<string | number> = [];
      if (payload.sortOrder !== undefined) {
        sets.push('sort_order = ?');
        params.push(payload.sortOrder);
      }
      if (payload.width !== undefined) {
        sets.push('width = ?');
        params.push(payload.width);
      }
      if (payload.shouldWrap !== undefined) {
        sets.push('should_wrap = ?');
        params.push(payload.shouldWrap);
      }
      if (payload.isHidden !== undefined) {
        sets.push('is_hidden = ?');
        params.push(payload.isHidden);
      }
      if (sets.length === 0) return;
      params.push(payload.tagId, payload.propertyId);
      await dbMaster.run(
        `UPDATE tag_properties SET ${sets.join(', ')} WHERE tag_id = ? AND property_id = ?`,
        params
      );
    }
  );

  ipcMain.handle(IPC_CHANNELS.PROPERTIES_DELETE, async (_event, payload: { propertyId: string }) => {
    await dbMaster.execute([
      { sql: 'DELETE FROM card_property_values WHERE property_id = ?', params: [payload.propertyId] },
      { sql: 'DELETE FROM tag_properties WHERE property_id = ?', params: [payload.propertyId] },
      { sql: 'DELETE FROM properties WHERE id = ?', params: [payload.propertyId] },
    ]);
  });

  ipcMain.handle(
    IPC_CHANNELS.PROPERTIES_DELETE_OPTION,
    async (
      _event,
      payload: { propertyId: string; optionId: string; deleteTaggedCards?: boolean }
    ) => {
      const rows = await dbMaster.query<TagProperty>(
        'SELECT id, name, type, config_json FROM properties WHERE id = ?',
        [payload.propertyId]
      );
      if (rows.length === 0) return;
      const prop = rows[0];
      let config: PropertyConfig = {};
      try {
        config = JSON.parse(prop.config_json || '{}');
      } catch {
        config = {};
      }
      const nextOptions = (config.options ?? []).filter((o) => o.id !== payload.optionId);
      const nextConfigJson = JSON.stringify({ ...config, options: nextOptions });
      const now = Date.now();

      const valRows = await dbMaster.query<CardPropertyValue>(
        'SELECT card_id, property_id, value_json, updated_at FROM card_property_values WHERE property_id = ?',
        [payload.propertyId]
      );

      const stmts: Array<{ sql: string; params: Array<string | number> }> = [
        {
          sql: 'UPDATE properties SET config_json = ?, updated_at = ? WHERE id = ?',
          params: [nextConfigJson, now, payload.propertyId],
        },
      ];

      for (const row of valRows) {
        try {
          const parsed = JSON.parse(row.value_json);
          if (prop.type === 'select' && parsed === payload.optionId) {
            stmts.push({
              sql: 'DELETE FROM card_property_values WHERE card_id = ? AND property_id = ?',
              params: [row.card_id, payload.propertyId],
            });
            if (payload.deleteTaggedCards) {
              stmts.push({
                sql: 'UPDATE cards SET is_deleted = 1, updated_at = ? WHERE id = ?',
                params: [now, row.card_id],
              });
            }
          } else if (prop.type === 'multiSelect' && Array.isArray(parsed)) {
            const filtered = parsed.filter((id) => id !== payload.optionId);
            if (filtered.length !== parsed.length) {
              if (filtered.length === 0) {
                stmts.push({
                  sql: 'DELETE FROM card_property_values WHERE card_id = ? AND property_id = ?',
                  params: [row.card_id, payload.propertyId],
                });
              } else {
                stmts.push({
                  sql: 'UPDATE card_property_values SET value_json = ?, updated_at = ? WHERE card_id = ? AND property_id = ?',
                  params: [JSON.stringify(filtered), now, row.card_id, payload.propertyId],
                });
              }
            }
          }
        } catch {
          continue;
        }
      }

      await dbMaster.execute(stmts);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARD_PROPERTIES_LIST_BY_TAG,
    async (_event, payload: { tagId: string }) => {
      return dbMaster.query<CardPropertyValue>(
        `SELECT cpv.card_id, cpv.property_id, cpv.value_json, cpv.updated_at
         FROM card_property_values cpv
         WHERE cpv.card_id IN (
           SELECT card_id FROM card_tags WHERE tag_id = ?
           UNION
           SELECT highlight_id FROM highlight_tags WHERE tag_id = ?
         )`,
        [payload.tagId, payload.tagId]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARD_PROPERTIES_LIST_BY_CARD,
    async (_event, payload: { cardId: string }) => {
      return dbMaster.query<CardPropertyValue>(
        `SELECT card_id, property_id, value_json, updated_at
         FROM card_property_values
         WHERE card_id = ?`,
        [payload.cardId]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARD_PROPERTIES_SET_VALUE,
    async (_event, payload: { cardId: string; propertyId: string; valueJson: string }) => {
      const now = Date.now();
      await dbMaster.run(
        `INSERT INTO card_property_values (card_id, property_id, value_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(card_id, property_id) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`,
        [payload.cardId, payload.propertyId, payload.valueJson, now]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CARD_PROPERTIES_CLEAR_VALUE,
    async (_event, payload: { cardId: string; propertyId: string }) => {
      await dbMaster.run(
        'DELETE FROM card_property_values WHERE card_id = ? AND property_id = ?',
        [payload.cardId, payload.propertyId]
      );
    }
  );
}