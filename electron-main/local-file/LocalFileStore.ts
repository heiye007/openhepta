import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import { LocalFileReference, LocalFileInstance } from '../../shared/types';

const PREVIEW_SCHEME_PREFIX = ['hepta-preview', ''].join(':/') + '/';

export class LocalFileStore {
  private db: DatabaseSync;
  private storageDir: string;
  private previewsDir: string;

  constructor(userDataPath: string) {
    this.storageDir = path.join(userDataPath, 'local-files');
    this.previewsDir = path.join(userDataPath, 'previews');

    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    if (!fs.existsSync(this.previewsDir)) {
      fs.mkdirSync(this.previewsDir, { recursive: true });
    }

    const dbPath = path.join(userDataPath, 'local-file-mvp.sqlite');
    this.db = new DatabaseSync(dbPath);
    this.initDb();
  }

  private initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_file_references (
        reference_id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_file_instances (
        instance_id TEXT PRIMARY KEY,
        reference_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(reference_id) REFERENCES local_file_references(reference_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_references_sha ON local_file_references(sha256);
      CREATE INDEX IF NOT EXISTS idx_instances_owner ON local_file_instances(owner_id);
    `);
  }

  public async addFile(
    filePath: string,
    originalName?: string
  ): Promise<{ reference: LocalFileReference; instance: LocalFileInstance; previewUrl: string }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const fileName = originalName || path.basename(filePath);

    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const sha256 = hashSum.digest('hex');

    const existingRef = this.db
      .prepare('SELECT * FROM local_file_references WHERE sha256 = ?')
      .get(sha256) as LocalFileReference | undefined;

    let referenceId: string;
    let targetPath: string;

    if (existingRef && fs.existsSync(existingRef.file_path)) {
      referenceId = existingRef.reference_id;
      targetPath = existingRef.file_path;
    } else {
      referenceId = uuidv4();
      const ext = path.extname(fileName);
      targetPath = path.join(this.storageDir, `${referenceId}${ext}`);
      fs.copyFileSync(filePath, targetPath);

      const mimeType = this.guessMimeType(fileName);
      const now = Date.now();

      this.db
        .prepare(
          `INSERT OR REPLACE INTO local_file_references (reference_id, sha256, file_name, file_path, file_size, mime_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(referenceId, sha256, fileName, targetPath, stats.size, mimeType, now, now);
    }

    const instanceId = uuidv4();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO local_file_instances (instance_id, reference_id, owner_id, is_deleted, created_at)
         VALUES (?, ?, ?, 0, ?)`
      )
      .run(instanceId, referenceId, 'default', now);

    const ref = this.db
      .prepare('SELECT * FROM local_file_references WHERE reference_id = ?')
      .get(referenceId) as LocalFileReference;
    const inst = this.db
      .prepare('SELECT * FROM local_file_instances WHERE instance_id = ?')
      .get(instanceId) as LocalFileInstance;

    return {
      reference: ref,
      instance: inst,
      previewUrl: `${PREVIEW_SCHEME_PREFIX}${referenceId}`,
    };
  }

  public readBuffer(referenceId: string): Uint8Array {
    const ref = this.getReference(referenceId);
    if (!ref || !fs.existsSync(ref.file_path)) {
      throw new Error(`File not found for referenceId: ${referenceId}`);
    }
    const buf = fs.readFileSync(ref.file_path);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  public saveImage(dataUrl: string, name: string): { referenceId: string; previewUrl: string } {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl.trim());
    if (!match) {
      throw new Error('Invalid image data URL');
    }

    const mimeType = match[1].toLowerCase();
    const base64Body = match[2];
    const buffer = Buffer.from(base64Body, 'base64');
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    const existingRef = this.db
      .prepare('SELECT * FROM local_file_references WHERE sha256 = ?')
      .get(sha256) as LocalFileReference | undefined;

    let referenceId: string;
    if (existingRef && fs.existsSync(existingRef.file_path)) {
      referenceId = existingRef.reference_id;
    } else {
      referenceId = uuidv4();
      const extMap: Record<string, string> = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/webp': '.webp',
        'image/gif': '.gif',
      };
      const fallbackExt = path.extname(name).toLowerCase() || '.png';
      const ext = extMap[mimeType] || fallbackExt;
      const safeName = path.extname(name) ? name : `${name}${ext}`;
      const targetPath = path.join(this.storageDir, `${referenceId}${ext}`);
      fs.writeFileSync(targetPath, buffer);

      const now = Date.now();
      this.db
        .prepare(
          `INSERT OR REPLACE INTO local_file_references (reference_id, sha256, file_name, file_path, file_size, mime_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(referenceId, sha256, safeName, targetPath, buffer.byteLength, mimeType, now, now);
    }

    const instanceId = uuidv4();
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO local_file_instances (instance_id, reference_id, owner_id, is_deleted, created_at)
         VALUES (?, ?, ?, 0, ?)`
      )
      .run(instanceId, referenceId, 'image', now);

    return {
      referenceId,
      previewUrl: `${PREVIEW_SCHEME_PREFIX}${referenceId}`,
    };
  }

  public getReference(referenceId: string): LocalFileReference | undefined {
    return this.db
      .prepare('SELECT * FROM local_file_references WHERE reference_id = ?')
      .get(referenceId) as LocalFileReference | undefined;
  }

  public getFilePath(referenceId: string): string | null {
    const ref = this.getReference(referenceId);
    return ref ? ref.file_path : null;
  }

  private guessMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const map: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.epub': 'application/epub+zip',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
    };
    return map[ext] || 'application/octet-stream';
  }

  public close() {
    this.db.close();
  }
}
