#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOLS_DIR = path.join(__dirname, '.tools');
const JAR_PATH = path.join(TOOLS_DIR, 'tla2tools.jar');
const TLA_JAR_URL =
  process.env.TLA2TOOLS_URL ||
  'https://github.com/tlaplus/tlaplus/releases/latest/download/tla2tools.jar';

const SPECS = [
  { name: 'DbMaster3R1W', tla: 'DbMaster3R1W.tla', cfg: 'DbMaster3R1W.cfg' },
  { name: 'WhiteboardHierarchy', tla: 'WhiteboardHierarchy.tla', cfg: 'WhiteboardHierarchy.cfg' },
  { name: 'MindMapTree', tla: 'MindMapTree.tla', cfg: 'MindMapTree.cfg' },
  { name: 'CrossWhiteboardMove', tla: 'CrossWhiteboardMove.tla', cfg: 'CrossWhiteboardMove.cfg' },
  { name: 'LocalFileStoreCAS', tla: 'LocalFileStoreCAS.tla', cfg: 'LocalFileStoreCAS.cfg' },
  {
    name: 'CardTagHighlightLifecycle',
    tla: 'CardTagHighlightLifecycle.tla',
    cfg: 'CardTagHighlightLifecycle.cfg',
  },
  {
    name: 'ReferencesDrawerStack',
    tla: 'ReferencesDrawerStack.tla',
    cfg: 'ReferencesDrawerStack.cfg',
  },
];

function downloadFile(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects while downloading tla2tools.jar'));
      return;
    }
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'OpenHepta-TLA-Runner' } },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          resolve(downloadFile(res.headers.location, dest, redirects + 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
          return;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const tmp = `${dest}.tmp`;
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            fs.renameSync(tmp, dest);
            resolve();
          });
        });
        out.on('error', reject);
      }
    );
    req.on('error', reject);
  });
}

async function ensureTlaJar() {
  if (fs.existsSync(JAR_PATH) && fs.statSync(JAR_PATH).size > 100000) {
    return JAR_PATH;
  }
  console.log(`[TLA+] Downloading tla2tools.jar from ${TLA_JAR_URL} ...`);
  await downloadFile(TLA_JAR_URL, JAR_PATH);
  console.log(`[TLA+] Saved tla2tools.jar (${fs.statSync(JAR_PATH).size} bytes)`);
  return JAR_PATH;
}

function runSpec(jarPath, spec) {
  const tlaPath = path.join(__dirname, spec.tla);
  const cfgPath = path.join(__dirname, spec.cfg);
  const metaDir = path.join(__dirname, 'states', spec.name);
  fs.mkdirSync(metaDir, { recursive: true });

  console.log(`\n========================================`);
  console.log(`[TLA+] Checking ${spec.name} ...`);
  console.log(`========================================`);

  const res = spawnSync(
    'java',
    [
      '-XX:+UseParallelGC',
      '-cp',
      jarPath,
      'tlc2.TLC',
      '-workers',
      'auto',
      '-cleanup',
      '-metadir',
      metaDir,
      '-config',
      cfgPath,
      tlaPath,
    ],
    {
      cwd: __dirname,
      stdio: 'inherit',
    }
  );

  return res.status === 0;
}

async function main() {
  const filter = process.argv[2]?.trim();
  const targets = filter
    ? SPECS.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
    : SPECS;

  if (targets.length === 0) {
    console.error(`No TLA+ spec matching "${filter}". Available: ${SPECS.map((s) => s.name).join(', ')}`);
    process.exit(1);
  }

  const javaCheck = spawnSync('java', ['-version'], { stdio: 'pipe', encoding: 'utf8' });
  if (javaCheck.error || javaCheck.status !== 0) {
    console.error('Java runtime (JDK 11+) is required to run TLC.');
    process.exit(1);
  }

  const jarPath = await ensureTlaJar();
  let failed = 0;

  for (const spec of targets) {
    const ok = runSpec(jarPath, spec);
    if (!ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`\n[TLA+] FAILED: ${failed}/${targets.length} specification(s) reported errors.`);
    process.exit(1);
  }

  console.log(`\n[TLA+] ALL ${targets.length} SPECIFICATION(S) PASSED MODEL CHECKING.`);
}

main().catch((err) => {
  console.error('[TLA+] Runner error:', err.message);
  process.exit(1);
});
