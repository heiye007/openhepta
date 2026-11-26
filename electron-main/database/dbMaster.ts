import path from 'path';
import { Worker } from 'worker_threads';
import { v4 as uuidv4 } from 'uuid';
import { DbRunResult, DbStatement } from '../../shared/types';

interface JobRequest {
  id: string;
  name: string;
  param?: unknown;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timestamp: number;
}

interface WorkerHandle {
  worker: Worker;
  busy: boolean;
  type: 'reader' | 'writer';
}

class DbMaster {
  private readQueue: JobRequest[] = [];
  private writeQueue: JobRequest[] = [];
  private readers: WorkerHandle[] = [];
  private writers: WorkerHandle[] = [];
  private pendingJobs = new Map<string, JobRequest>();
  private userDataPath: string = process.cwd();
  private workerScriptPath: string;

  constructor() {
    this.workerScriptPath = path.join(__dirname, 'dbWorker.js');
  }

  public init(userDataPath: string, customWorkerPath?: string) {
    this.userDataPath = userDataPath;
    if (customWorkerPath) {
      this.workerScriptPath = customWorkerPath;
    }

    for (let i = 0; i < 3; i++) {
      this.spawnWorker('reader');
    }
    this.spawnWorker('writer');
  }

  private spawnWorker(type: 'reader' | 'writer') {
    const worker = new Worker(this.workerScriptPath);
    const handle: WorkerHandle = { worker, busy: false, type };

    worker.postMessage({ id: uuidv4(), name: 'setUserPath', param: this.userDataPath });

    worker.on('message', (msg: { id: string; result?: unknown; error?: { message: string } }) => {
      const job = this.pendingJobs.get(msg.id);
      if (job) {
        this.pendingJobs.delete(msg.id);
        const latency = Date.now() - job.timestamp;
        if (latency > 30000) {
          console.warn(`[dbMaster] Job ${job.name} took excessively long: ${latency}ms`);
        }

        if (msg.error) {
          job.reject(new Error(msg.error.message));
        } else {
          job.resolve(msg.result);
        }
      }

      handle.busy = false;
      this.drainQueue(type);
    });

    worker.on('error', (err) => {
      console.error(`[dbMaster] Worker error (${type}):`, err);
    });

    worker.on('exit', (code) => {
      console.warn(`[dbMaster] Worker exited (${type}) with code: ${code}`);
      if (type === 'reader') {
        this.readers = this.readers.filter((r) => r !== handle);
      } else {
        this.writers = this.writers.filter((w) => w !== handle);
      }
      if (code !== 0) {
        this.spawnWorker(type);
      }
    });

    if (type === 'reader') {
      this.readers.push(handle);
    } else {
      this.writers.push(handle);
    }
  }

  private drainQueue(type: 'reader' | 'writer') {
    const queue = type === 'reader' ? this.readQueue : this.writeQueue;
    const pool = type === 'reader' ? this.readers : this.writers;

    while (queue.length > 0) {
      const availableWorker = pool.find((w) => !w.busy);
      if (!availableWorker) {
        break;
      }

      const job = queue.shift()!;
      availableWorker.busy = true;
      this.pendingJobs.set(job.id, job);
      availableWorker.worker.postMessage({ id: job.id, name: job.name, param: job.param });
    }
  }

  private pushJob<T>(name: string, param?: unknown, isWrite: boolean = false): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const job: JobRequest = {
        id,
        name,
        param,
        resolve: resolve as (value: unknown) => void,
        reject,
        timestamp: Date.now(),
      };

      if (isWrite) {
        this.writeQueue.push(job);
        this.drainQueue('writer');
      } else {
        this.readQueue.push(job);
        this.drainQueue('reader');
      }
    });
  }

  public open(): Promise<boolean> {
    return this.pushJob<boolean>('open', undefined, true);
  }

  public close(): Promise<boolean> {
    return this.pushJob<boolean>('close', undefined, true);
  }

  public query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.pushJob<T[]>('query', { sql, params }, false);
  }

  public run(sql: string, params: unknown[] = []): Promise<DbRunResult> {
    return this.pushJob<DbRunResult>('run', { sql, params }, true);
  }

  public execute(statements: DbStatement[]): Promise<void> {
    return this.pushJob<void>('execute', { statements }, true);
  }

  public cleanup() {
    [...this.readers, ...this.writers].forEach((h) => {
      h.worker.postMessage({ id: 'cleanup', name: 'cleanup' });
      h.worker.terminate();
    });
    this.readers = [];
    this.writers = [];
  }
}

export const dbMaster = new DbMaster();
