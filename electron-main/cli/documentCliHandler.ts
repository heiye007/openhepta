import type { BrowserWindow } from 'electron';
import { DocumentRecord } from '../../shared/types';
import { dbMaster } from '../database/dbMaster';
import { CliResponse, dispatchCliCommand, str } from './cliHelpers';

export async function handleDocumentCli(
  win: BrowserWindow,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  if (action === 'list') {
    const documents = await dbMaster.query<DocumentRecord>(
      `SELECT * FROM documents WHERE is_deleted = 0 ORDER BY updated_at DESC`
    );
    return {
      status: 200,
      body: {
        ok: true,
        count: documents.length,
        documents: documents.map((d) => ({
          id: d.id,
          docType: d.doc_type,
          title: d.title,
          totalPages: d.total_pages,
        })),
      },
    };
  }
  if (action === 'open') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    const highlightId = str(params.highlightId) || undefined;
    await dispatchCliCommand(win, { type: 'open-document', documentId: id, highlightId });
    return {
      status: 200,
      body: { ok: true, action, documentId: id, highlightId: highlightId ?? null },
    };
  }
  if (action === 'delete') {
    const id = str(params.id);
    if (!id) return { status: 400, body: { ok: false, error: 'Missing --id' } };
    await dbMaster.execute([
      {
        sql: `UPDATE documents SET is_deleted = 1, updated_at = ? WHERE id = ?`,
        params: [Date.now(), id],
      },
    ]);
    await dispatchCliCommand(win, { type: 'refresh-all' });
    return { status: 200, body: { ok: true, action, deletedId: id } };
  }
  return { status: 400, body: { ok: false, error: `Unsupported document action: ${action}` } };
}
