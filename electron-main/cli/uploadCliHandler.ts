import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import { HEPTA_DEFAULT_DIMENSIONS, WhiteboardObject } from '../../shared/types';
import { dbMaster } from '../database/dbMaster';
import { requireFileStore } from '../startup/storage';
import {
  CliResponse,
  buildProseMirrorDocJson,
  dispatchCliCommand,
  getActiveWhiteboardId,
  num,
  str,
} from './cliHelpers';

function detectKind(fileName: string): 'pdf' | 'epub' | 'markdown' | 'image' | 'video' | 'audio' | 'file' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.epub')) return 'epub';
  if (/\.(md|markdown|txt)$/.test(lower)) return 'markdown';
  if (/\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/.test(lower)) return 'image';
  if (/\.(mp4|webm|mov|m4v|mkv|ogv)$/.test(lower)) return 'video';
  if (/\.(mp3|wav|m4a|ogg|flac|aac|opus)$/.test(lower)) return 'audio';
  return 'file';
}

export async function handleUploadCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  const wbId = str(params.whiteboardId) || (await getActiveWhiteboardId(win));
  if (!wbId) {
    return { status: 404, body: { ok: false, error: 'No active whiteboard found.' } };
  }

  if (action === 'list') {
    const rows = await dbMaster.query<WhiteboardObject>(
      `SELECT * FROM whiteboard_objects WHERE whiteboard_id = ? AND object_type IN ('media', 'pdf', 'epub') ORDER BY rowid DESC`,
      [wbId]
    );
    return {
      status: 200,
      body: {
        ok: true,
        whiteboardId: wbId,
        count: rows.length,
        assets: rows.map((r) => {
          let props: Record<string, unknown> = {};
          try {
            props = JSON.parse(r.properties_json || '{}') as Record<string, unknown>;
          } catch {
            props = {};
          }
          return {
            objectId: r.id,
            objectType: r.object_type,
            targetId: r.target_id,
            name: props.name ?? props.title ?? null,
            mediaKind: props.mediaKind ?? r.object_type,
            posX: r.pos_x,
            posY: r.pos_y,
            width: r.width,
            height: r.height,
          };
        }),
      },
    };
  }

  if (action === 'file') {
    const rawPath = str(params.path);
    if (!rawPath) {
      return { status: 400, body: { ok: false, error: 'Missing --path <filePath>' } };
    }
    const resolvedPath = path.resolve(rawPath);
    if (!fs.existsSync(resolvedPath)) {
      return { status: 404, body: { ok: false, error: `File not found: ${resolvedPath}` } };
    }

    const fileName = path.basename(resolvedPath);
    const kind = detectKind(fileName);
    const now = Date.now();
    const x = num(params.x, 180);
    const y = num(params.y, 180);

    if (kind === 'markdown') {
      const text = fs.readFileSync(resolvedPath, 'utf8');
      const title = fileName.replace(/\.(md|markdown|txt)$/i, '').trim() || 'Untitled';
      const cardId = `card-${now}`;
      const objId = `wbo-card-${now}`;
      const dim = HEPTA_DEFAULT_DIMENSIONS.card;
      await dbMaster.execute([
        {
          sql: `INSERT INTO cards (id, title, content_json, content_text, created_at, updated_at, is_deleted, color)
                VALUES (?, ?, ?, ?, ?, ?, 0, 'white')`,
          params: [cardId, title, buildProseMirrorDocJson(text), text, now, now],
        },
        {
          sql: `INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json)
                VALUES (?, ?, 'card', ?, ?, ?, ?, ?, 10, '{}')`,
          params: [objId, wbId, cardId, x, y, dim.width, dim.height],
        },
      ]);
      await dispatchCliCommand(win, { type: 'refresh-all' });
      return {
        status: 200,
        body: { ok: true, action, kind, objectId: objId, cardId, title, whiteboardId: wbId },
      };
    }

    const store = requireFileStore();
    const added = await store.addFile(resolvedPath, fileName);
    const referenceId = added.reference.reference_id;
    const sha256 = added.reference.sha256;

    if (kind === 'pdf' || kind === 'epub') {
      const docId = `doc-${now}`;
      const objId = `wbo-doc-${now}`;
      const title = fileName.replace(/\.(pdf|epub)$/i, '').trim() || fileName;
      const dim = HEPTA_DEFAULT_DIMENSIONS[kind];
      await dbMaster.execute([
        {
          sql: `INSERT INTO documents (id, doc_type, title, file_reference_id, cover_reference_id, total_pages, last_position_json, metadata_json, created_at, updated_at, is_deleted)
                VALUES (?, ?, ?, ?, NULL, 0, '{}', '{}', ?, ?, 0)`,
          params: [docId, kind, title, referenceId, now, now],
        },
        {
          sql: `INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 10, ?)`,
          params: [objId, wbId, kind, docId, x, y, dim.width, dim.height, JSON.stringify({ title })],
        },
      ]);
      await dispatchCliCommand(win, { type: 'refresh-all' });
      return {
        status: 200,
        body: {
          ok: true,
          action,
          kind,
          objectId: objId,
          documentId: docId,
          referenceId,
          whiteboardId: wbId,
        },
      };
    }

    const width = kind === 'image' ? 420 : kind === 'video' ? 480 : kind === 'audio' ? 360 : 320;
    const height = kind === 'image' ? 315 : kind === 'video' ? 310 : kind === 'audio' ? 112 : 136;
    const objId = `wbo-file-${now}`;
    await dbMaster.execute([
      {
        sql: `INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json)
              VALUES (?, ?, 'media', ?, ?, ?, ?, ?, 10, ?)`,
        params: [
          objId,
          wbId,
          referenceId,
          x,
          y,
          width,
          height,
          JSON.stringify({ name: fileName, sha256, mediaKind: kind }),
        ],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return {
      status: 200,
      body: {
        ok: true,
        action,
        kind,
        objectId: objId,
        referenceId,
        sha256,
        whiteboardId: wbId,
      },
    };
  }

  return { status: 400, body: { ok: false, error: `Unsupported upload action: ${action}` } };
}
