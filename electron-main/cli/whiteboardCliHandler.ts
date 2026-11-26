import type { BrowserWindow } from 'electron';
import { HEPTA_DEFAULT_DIMENSIONS, Whiteboard, WhiteboardObject } from '../../shared/types';
import { dbMaster } from '../database/dbMaster';
import { CliResponse, dispatchCliCommand, getActiveWhiteboardId, num, str } from './cliHelpers';

export async function handleWhiteboardCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'list') {
    const whiteboards = await dbMaster.query<Whiteboard>(
      `SELECT * FROM whiteboards WHERE is_deleted = 0 ORDER BY updated_at DESC`
    );
    return { status: 200, body: { ok: true, count: whiteboards.length, whiteboards } };
  }
  if (action === 'create') {
    const name = str(params.name) || 'Untitled Whiteboard';
    const parentId = str(params.parentId) || null;
    const now = Date.now();
    const id = `wb-${now}`;
    await dbMaster.execute([
      {
        sql: `INSERT INTO whiteboards (id, name, created_at, updated_at, is_deleted, viewport_pan_x, viewport_pan_y, viewport_zoom, parent_whiteboard_id)
              VALUES (?, ?, ?, ?, 0, 0.0, 0.0, 1.0, ?)`,
        params: [id, name, now, now, parentId],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, id, name, parentWhiteboardId: parentId } };
  }
  if (action === 'rename') {
    const id = str(params.id) || (await getActiveWhiteboardId(win)) || '';
    const name = str(params.name);
    if (!id || !name) {
      return { status: 400, body: { ok: false, error: 'Missing --id or --name' } };
    }
    await dbMaster.execute([
      {
        sql: `UPDATE whiteboards SET name = ?, updated_at = ? WHERE id = ?`,
        params: [name, Date.now(), id],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, id, name } };
  }
  if (action === 'delete') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    await dbMaster.execute([
      {
        sql: `UPDATE whiteboards SET is_deleted = 1, updated_at = ? WHERE id = ?`,
        params: [Date.now(), id],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, deletedId: id } };
  }
  if (action === 'open') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    await dispatchCliCommand(win, { type: 'open-whiteboard', whiteboardId: id });
    return { status: 200, body: { ok: true, action, whiteboardId: id } };
  }
  if (action === 'objects') {
    const wbId = str(params.whiteboardId) || (await getActiveWhiteboardId(win));
    if (!wbId) return { status: 404, body: { ok: false, error: 'No active whiteboard' } };
    const objects = await dbMaster.query<WhiteboardObject>(
      `SELECT * FROM whiteboard_objects WHERE whiteboard_id = ? ORDER BY rowid DESC`,
      [wbId]
    );
    return { status: 200, body: { ok: true, whiteboardId: wbId, count: objects.length, objects } };
  }
  if (action === 'add-card') {
    const wbId = str(params.whiteboardId) || (await getActiveWhiteboardId(win));
    const cardId = str(params.cardId);
    if (!wbId || !cardId) {
      return { status: 400, body: { ok: false, error: 'Missing --card-id or active whiteboard' } };
    }
    const id = `wbo-card-${Date.now()}`;
    const dim = HEPTA_DEFAULT_DIMENSIONS.card;
    await dbMaster.execute([
      {
        sql: `INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json)
              VALUES (?, ?, 'card', ?, ?, ?, ?, ?, 10, '{}')`,
        params: [id, wbId, cardId, num(params.x, 120), num(params.y, 120), dim.width, dim.height],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, objectId: id, whiteboardId: wbId, cardId } };
  }
  if (action === 'add-section') {
    const wbId = str(params.whiteboardId) || (await getActiveWhiteboardId(win));
    if (!wbId) return { status: 404, body: { ok: false, error: 'No active whiteboard' } };
    const title = str(params.title) || 'Section';
    const color = str(params.color) || 'white';
    const id = `wbo-sec-${Date.now()}`;
    const dim = HEPTA_DEFAULT_DIMENSIONS.section;
    await dbMaster.execute([
      {
        sql: `INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json)
              VALUES (?, ?, 'section', NULL, ?, ?, ?, ?, 1, ?)`,
        params: [
          id,
          wbId,
          num(params.x, 80),
          num(params.y, 80),
          dim.width,
          dim.height,
          JSON.stringify({ title, color }),
        ],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, objectId: id, whiteboardId: wbId, title } };
  }
  if (action === 'add-subwhiteboard') {
    const wbId = str(params.whiteboardId) || (await getActiveWhiteboardId(win));
    if (!wbId) return { status: 404, body: { ok: false, error: 'No active whiteboard' } };
    const name = str(params.name) || 'Sub-whiteboard';
    const now = Date.now();
    const childWbId = `wb-${now}`;
    const objId = `wbo-subwb-${now}`;
    await dbMaster.execute([
      {
        sql: `INSERT INTO whiteboards (id, name, created_at, updated_at, is_deleted, viewport_pan_x, viewport_pan_y, viewport_zoom, parent_whiteboard_id)
              VALUES (?, ?, ?, ?, 0, 0.0, 0.0, 1.0, ?)`,
        params: [childWbId, name, now, now, wbId],
      },
      {
        sql: `INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json)
              VALUES (?, ?, 'sub_whiteboard', ?, ?, ?, 640, 420, 5, ?)`,
        params: [
          objId,
          wbId,
          childWbId,
          num(params.x, 120),
          num(params.y, 120),
          JSON.stringify({ name, color: 'white', isChild: true }),
        ],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return {
      status: 200,
      body: { ok: true, action, objectId: objId, childWhiteboardId: childWbId, name },
    };
  }
  if (action === 'connect') {
    const wbId = str(params.whiteboardId) || (await getActiveWhiteboardId(win));
    const from = str(params.from);
    const to = str(params.to);
    if (!wbId || !from || !to) {
      return { status: 400, body: { ok: false, error: 'Missing --from or --to' } };
    }
    const id = `conn-${Date.now()}`;
    const label = str(params.label) || null;
    await dbMaster.execute([
      {
        sql: `INSERT INTO connections (id, whiteboard_id, source_object_id, target_object_id, label, style_json)
              VALUES (?, ?, ?, ?, ?, '{}')`,
        params: [id, wbId, from, to, label],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, connectionId: id, from, to, label } };
  }
  if (action === 'delete-object') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    await dbMaster.execute([
      {
        sql: `DELETE FROM connections WHERE source_object_id = ? OR target_object_id = ?`,
        params: [id, id],
      },
      { sql: `DELETE FROM whiteboard_objects WHERE id = ?`, params: [id] },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, deletedObjectId: id } };
  }
  if (action === 'options') {
    const wbId = str(params.whiteboardId) || (await getActiveWhiteboardId(win));
    if (!wbId) return { status: 404, body: { ok: false, error: 'No active whiteboard' } };
    const rows = await dbMaster.query<{ options_json: string }>(
      `SELECT options_json FROM whiteboards WHERE id = ? LIMIT 1`,
      [wbId]
    );
    let current: Record<string, unknown> = {};
    try {
      current = rows[0]?.options_json
        ? (JSON.parse(rows[0].options_json) as Record<string, unknown>)
        : {};
    } catch {
      current = {};
    }
    const key = str(params.key);
    if (!key) {
      return { status: 200, body: { ok: true, whiteboardId: wbId, options: current } };
    }
    let parsedVal: unknown = params.value;
    if (parsedVal === 'true') parsedVal = true;
    else if (parsedVal === 'false') parsedVal = false;
    else if (typeof parsedVal === 'string' && parsedVal !== '' && !Number.isNaN(Number(parsedVal))) {
      parsedVal = Number(parsedVal);
    }
    const next = { ...current, [key]: parsedVal };
    await dbMaster.execute([
      {
        sql: `UPDATE whiteboards SET options_json = ?, updated_at = ? WHERE id = ?`,
        params: [JSON.stringify(next), Date.now(), wbId],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, whiteboardId: wbId, options: next } };
  }
  return { status: 400, body: { ok: false, error: `Unsupported whiteboard action: ${action}` } };
}
