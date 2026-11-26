import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/api';
import { CreateDocumentInput, DocumentRecord } from '../../shared/types';
import { dbMaster } from '../database/dbMaster';

export function registerDocumentsApiHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DOCUMENTS_LIST, async () => {
    return dbMaster.query<DocumentRecord>(
      'SELECT * FROM documents WHERE is_deleted = 0 ORDER BY updated_at DESC'
    );
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENTS_GET, async (_event, payload: { id: string } | string) => {
    const id = typeof payload === 'string' ? payload : payload.id;
    const rows = await dbMaster.query<DocumentRecord>(
      'SELECT * FROM documents WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [id]
    );
    return rows[0] ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.DOCUMENTS_CREATE, async (_event, input: CreateDocumentInput) => {
    const now = Date.now();
    const id = input.id || `doc-${now}-${Math.random().toString(36).slice(2, 7)}`;
    const totalPages = input.totalPages ?? 0;
    const lastPositionJson = input.lastPositionJson ?? '{}';
    const metadataJson = input.metadataJson ?? '{}';
    const coverReferenceId = input.coverReferenceId ?? null;

    await dbMaster.run(
      `INSERT INTO documents (id, doc_type, title, file_reference_id, cover_reference_id, total_pages, last_position_json, metadata_json, created_at, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        input.docType,
        input.title,
        input.fileReferenceId,
        coverReferenceId,
        totalPages,
        lastPositionJson,
        metadataJson,
        now,
        now,
      ]
    );

    return {
      id,
      doc_type: input.docType,
      title: input.title,
      file_reference_id: input.fileReferenceId,
      cover_reference_id: coverReferenceId,
      total_pages: totalPages,
      last_position_json: lastPositionJson,
      metadata_json: metadataJson,
      created_at: now,
      updated_at: now,
      is_deleted: 0,
    } satisfies DocumentRecord;
  });

  ipcMain.handle(
    IPC_CHANNELS.DOCUMENTS_UPDATE_POSITION,
    async (
      _event,
      payload: { id: string; lastPositionJson: string; totalPages?: number }
    ) => {
      const now = Date.now();
      if (payload.totalPages !== undefined && payload.totalPages > 0) {
        await dbMaster.run(
          'UPDATE documents SET last_position_json = ?, total_pages = ?, updated_at = ? WHERE id = ?',
          [payload.lastPositionJson, payload.totalPages, now, payload.id]
        );
      } else {
        await dbMaster.run(
          'UPDATE documents SET last_position_json = ?, updated_at = ? WHERE id = ?',
          [payload.lastPositionJson, now, payload.id]
        );
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DOCUMENTS_UPDATE_COVER,
    async (_event, payload: { id: string; coverReferenceId: string }) => {
      await dbMaster.run(
        'UPDATE documents SET cover_reference_id = ?, updated_at = ? WHERE id = ?',
        [payload.coverReferenceId, Date.now(), payload.id]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DOCUMENTS_DELETE,
    async (_event, payload: { id: string } | string) => {
      const id = typeof payload === 'string' ? payload : payload.id;
      await dbMaster.execute([
        {
          sql: 'UPDATE documents SET is_deleted = 1, updated_at = ? WHERE id = ?',
          params: [Date.now(), id],
        },
        {
          sql: 'DELETE FROM whiteboard_objects WHERE target_id = ?',
          params: [id],
        },
      ]);
    }
  );
}
