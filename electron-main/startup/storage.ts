import { dbMaster } from '../database/dbMaster';
import { LocalFileStore } from '../local-file/LocalFileStore';

let fileStoreInstance: LocalFileStore | null = null;

export async function initStorage(userDataPath: string): Promise<LocalFileStore> {
  dbMaster.init(userDataPath);
  await dbMaster.open();
  fileStoreInstance = new LocalFileStore(userDataPath);
  return fileStoreInstance;
}

export function getFileStore(): LocalFileStore | null {
  return fileStoreInstance;
}

export function requireFileStore(): LocalFileStore {
  if (!fileStoreInstance) {
    throw new Error('FileStore is not initialized');
  }
  return fileStoreInstance;
}

export function cleanupStorage(): void {
  dbMaster.cleanup();
  if (fileStoreInstance) {
    fileStoreInstance.close();
    fileStoreInstance = null;
  }
}
