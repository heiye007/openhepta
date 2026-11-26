import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'path';
import { z } from 'zod';
import { IPC_CHANNELS } from '../../shared/api';
import { DocumentType } from '../../shared/types';
import { getFileStore, requireFileStore } from '../startup/storage';
import { getMainWindow } from '../startup/windowManager';

const PREVIEW_SCHEME_PREFIX = ['hepta-preview', ''].join(':/') + '/';

const readBufferPayloadSchema = z.object({
  referenceId: z.string().min(1),
});

const saveImagePayloadSchema = z.object({
  dataUrl: z.string().min(1),
  name: z.string().min(1),
});

export function registerLocalFileApiHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.LOCAL_FILE_ADD,
    async (_event, payload: { path: string; name?: string }) => {
      const fileStore = requireFileStore();
      const result = await fileStore.addFile(payload.path, payload.name);
      return {
        referenceId: result.reference.reference_id,
        sha256: result.reference.sha256,
        previewUrl: result.previewUrl,
        reference: result.reference,
        instance: result.instance,
      };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_FILE_ACQUIRE_PREVIEW,
    async (_event, payload: { referenceId: string } | string) => {
      const referenceId = typeof payload === 'string' ? payload : payload.referenceId;
      return { previewUrl: `${PREVIEW_SCHEME_PREFIX}${referenceId}` };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_FILE_OPEN_EXTERNAL,
    async (_event, payload: { referenceId: string } | string) => {
      const fileStore = getFileStore();
      if (!fileStore) return;
      const referenceId = typeof payload === 'string' ? payload : payload.referenceId;
      const filePath = fileStore.getFilePath(referenceId);
      if (filePath) {
        await shell.openPath(filePath);
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.LOCAL_FILE_PICK_DOCUMENTS, async (event) => {
    const ownerWindow =
      BrowserWindow.fromWebContents(event.sender) ?? getMainWindow() ?? undefined;
    const dialogOptions: Electron.OpenDialogOptions = {
      title: 'Import PDF or EPUB Documents',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents (PDF, EPUB)', extensions: ['pdf', 'epub'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'EPUB Files', extensions: ['epub'] },
      ],
    };
    const result = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled) return [];

    return result.filePaths
      .map((filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const docType: DocumentType | null =
          ext === '.pdf' ? 'pdf' : ext === '.epub' ? 'epub' : null;
        if (!docType) return null;
        return {
          path: filePath,
          name: path.basename(filePath),
          docType,
        };
      })
      .filter((item): item is { path: string; name: string; docType: DocumentType } => item !== null);
  });

  ipcMain.handle(IPC_CHANNELS.LOCAL_FILE_READ_BUFFER, async (_event, payload: unknown) => {
    const fileStore = requireFileStore();
    const { referenceId } =
      typeof payload === 'string'
        ? { referenceId: payload }
        : readBufferPayloadSchema.parse(payload);
    return fileStore.readBuffer(referenceId);
  });

  ipcMain.handle(IPC_CHANNELS.LOCAL_FILE_SAVE_IMAGE, async (_event, payload: unknown) => {
    const fileStore = requireFileStore();
    const { dataUrl, name } = saveImagePayloadSchema.parse(payload);
    return fileStore.saveImage(dataUrl, name);
  });
}
