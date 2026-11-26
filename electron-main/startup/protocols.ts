import { protocol } from 'electron';
import fs from 'fs';
import { Readable } from 'stream';
import { getFileStore } from './storage';

export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'hepta-preview',
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
    {
      scheme: 'hepta-file',
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ]);
}

async function serveLocalFileProtocol(request: Request): Promise<Response> {
  try {
    const fileStore = getFileStore();
    if (!fileStore) {
      return new Response('Store not ready', { status: 500 });
    }

    const url = new URL(request.url);
    const strippedPath = url.pathname.replace(/^[\/]+/, '');
    const referenceId = decodeURIComponent(url.hostname || strippedPath);
    if (!referenceId) {
      return new Response('File not found', { status: 404 });
    }

    const ref = fileStore.getReference(referenceId);
    if (!ref || !fs.existsSync(ref.file_path)) {
      return new Response('File not found', { status: 404 });
    }

    const stat = await fs.promises.stat(ref.file_path);
    const totalSize = stat.size;
    const mimeType = ref.mime_type || 'application/octet-stream';
    const headers = new Headers({
      'accept-ranges': 'bytes',
      'content-type': mimeType,
    });

    if (request.method === 'HEAD') {
      headers.set('content-length', String(totalSize));
      return new Response(null, { status: 200, headers });
    }

    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
      if (match) {
        let start = match[1] === '' ? undefined : Number(match[1]);
        let end = match[2] === '' ? undefined : Number(match[2]);
        if (start !== undefined && Number.isNaN(start)) start = undefined;
        if (end !== undefined && Number.isNaN(end)) end = undefined;

        if (start !== undefined || end !== undefined) {
          const lastByte = totalSize - 1;
          if (start === undefined) {
            const suffixLen = end ?? 0;
            if (suffixLen <= 0 || totalSize === 0) {
              return new Response(null, {
                status: 416,
                headers: { 'Content-Range': `bytes */${totalSize}` },
              });
            }
            start = Math.max(totalSize - suffixLen, 0);
            end = lastByte;
          } else {
            if (start >= totalSize) {
              return new Response(null, {
                status: 416,
                headers: { 'Content-Range': `bytes */${totalSize}` },
              });
            }
            if (end === undefined || end > lastByte) {
              end = lastByte;
            }
            if (start > end) {
              return new Response(null, {
                status: 416,
                headers: { 'Content-Range': `bytes */${totalSize}` },
              });
            }
          }

          const chunkSize = end - start + 1;
          headers.set('content-length', String(chunkSize));
          headers.set('content-range', `bytes ${start}-${end}/${totalSize}`);
          const stream = fs.createReadStream(ref.file_path, { start, end });
          return new Response(
            Readable.toWeb(stream) as unknown as ConstructorParameters<typeof Response>[0],
            {
              status: 206,
              headers,
            }
          );
        }
      }
    }

    headers.set('content-length', String(totalSize));
    const fullStream = fs.createReadStream(ref.file_path);
    return new Response(
      Readable.toWeb(fullStream) as unknown as ConstructorParameters<typeof Response>[0],
      {
        status: 200,
        headers,
      }
    );
  } catch (err) {
    console.error('[OpenHepta] Failed to serve local file protocol request:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export function registerProtocols(): void {
  protocol.handle('hepta-preview', serveLocalFileProtocol);
  protocol.handle('hepta-file', serveLocalFileProtocol);
}
