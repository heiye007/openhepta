import type { BrowserWindow } from 'electron';
import {
  AnnotationColor,
  HEPTA_DEFAULT_DIMENSIONS,
  HighlightElement,
  HighlightSourceType,
} from '../../shared/types';
import { dbMaster } from '../database/dbMaster';
import { CliResponse, dispatchCliCommand, getActiveWhiteboardId, num, str } from './cliHelpers';

const VALID_ANNOTATION_COLORS = new Set<AnnotationColor>([
  'yellow',
  'red',
  'green',
  'blue',
  'purple',
  'orange',
  'pink',
]);

export async function handleHighlightCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'list') {
    const sourceType = str(params.sourceType);
    const color = str(params.color);
    const clauses = ['is_deleted = 0'];
    const sqlParams: unknown[] = [];
    if (sourceType && sourceType !== 'all') {
      clauses.push('source_type = ?');
      sqlParams.push(sourceType);
    }
    if (color && color !== 'all') {
      clauses.push('color = ?');
      sqlParams.push(color);
    }
    const highlights = await dbMaster.query<HighlightElement>(
      `SELECT * FROM highlight_elements WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC LIMIT 100`,
      sqlParams
    );
    return {
      status: 200,
      body: {
        ok: true,
        count: highlights.length,
        highlights: highlights.map((h) => ({
          id: h.id,
          sourceId: h.source_id,
          sourceType: h.source_type,
          color: h.color,
          pageNumber: h.page_number,
          text: (h.text_content || '').slice(0, 140),
          note: h.note_text,
        })),
      },
    };
  }
  if (action === 'create') {
    const sourceId = str(params.sourceId);
    const rawSourceType = str(params.sourceType) as HighlightSourceType;
    const sourceType: HighlightSourceType =
      rawSourceType === 'pdf' || rawSourceType === 'epub' || rawSourceType === 'card'
        ? rawSourceType
        : 'pdf';
    const text = str(params.text);
    if (!sourceId || !text) {
      return { status: 400, body: { ok: false, error: 'Missing --source-id or --text' } };
    }
    const rawColor = str(params.color) as AnnotationColor;
    const color: AnnotationColor = VALID_ANNOTATION_COLORS.has(rawColor) ? rawColor : 'yellow';
    const pageNumber = params.page !== undefined ? num(params.page, 1) : null;
    const note = str(params.note);
    const now = Date.now();
    const id = `hl-${now}`;
    await dbMaster.execute([
      {
        sql: `INSERT INTO highlight_elements (id, source_id, source_type, highlight_type, page_number, epub_cfi, rects_json, text_content, image_reference_id, note_json, note_text, color, created_at, updated_at, is_deleted)
              VALUES (?, ?, ?, 'text', ?, NULL, '[]', ?, NULL, '{}', ?, ?, ?, ?, 0)`,
        params: [id, sourceId, sourceType, pageNumber, text, note, color, now, now],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, id, sourceId, sourceType, color } };
  }
  if (action === 'update') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    const rows = await dbMaster.query<HighlightElement>(
      `SELECT * FROM highlight_elements WHERE id = ? LIMIT 1`,
      [id]
    );
    const existing = rows[0];
    if (!existing) return { status: 404, body: { ok: false, error: `Highlight not found: ${id}` } };
    const rawColor = str(params.color) as AnnotationColor;
    const color = VALID_ANNOTATION_COLORS.has(rawColor) ? rawColor : existing.color;
    const note = params.note !== undefined ? str(params.note) : existing.note_text;
    await dbMaster.execute([
      {
        sql: `UPDATE highlight_elements SET color = ?, note_text = ?, updated_at = ? WHERE id = ?`,
        params: [color, note, Date.now(), id],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, id, color, note } };
  }
  if (action === 'delete') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    await dbMaster.execute([
      {
        sql: `UPDATE highlight_elements SET is_deleted = 1, updated_at = ? WHERE id = ?`,
        params: [Date.now(), id],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, deletedId: id } };
  }
  if (action === 'add-to-whiteboard') {
    const id = str(params.id);
    const wbId = str(params.whiteboardId) || (await getActiveWhiteboardId(win));
    if (!id || !wbId) {
      return { status: 400, body: { ok: false, error: 'Missing --id or active whiteboard' } };
    }
    const objId = `wbo-hl-${Date.now()}`;
    const dim = HEPTA_DEFAULT_DIMENSIONS.highlight;
    await dbMaster.execute([
      {
        sql: `INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json)
              VALUES (?, ?, 'highlight', ?, ?, ?, ?, ?, 12, '{}')`,
        params: [objId, wbId, id, num(params.x, 160), num(params.y, 160), dim.width, dim.height],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return {
      status: 200,
      body: { ok: true, action, objectId: objId, highlightId: id, whiteboardId: wbId },
    };
  }
  return { status: 400, body: { ok: false, error: `Unsupported highlight action: ${action}` } };
}
