import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { dbMaster } from '../dbMaster';
import { LocalFileStore } from '../../local-file/LocalFileStore';
import { Card, Connection, Whiteboard, WhiteboardObject } from '../../../shared/types';
import {
  deleteWhiteboardRecursive,
  getWhiteboardStatsMap,
  moveObjectsAcrossWhiteboards,
  moveWhiteboardHierarchy,
} from '../../api/whiteboardsApi';
import { v4 as uuidv4 } from 'uuid';

async function runVerification() {
  console.log('====================================================');
  console.log('OpenHepta Phase 1: 3R1W SQLite & Storage Verification');
  console.log('====================================================');

  const testDir = path.join(process.cwd(), 'test_output_storage');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const workerScript = path.resolve(__dirname, '../dbWorker.ts');

  console.log('1. Initializing dbMaster (3 Readers, 1 Writer)...');
  dbMaster.init(testDir, workerScript);
  await dbMaster.open();
  console.log('   Database opened & migrations executed successfully.');

  console.log('2. Inserting test cards into cards table...');
  const card1Id = uuidv4();
  const card2Id = uuidv4();
  const now = Date.now();

  await dbMaster.run(
    'INSERT INTO cards (id, title, content_json, content_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [card1Id, 'Heptabase 逆向与复刻研究', '{"type":"doc"}', '这是一个用于测试 FTS5 全文搜索与双链的卡片。', now, now]
  );

  await dbMaster.run(
    'INSERT INTO cards (id, title, content_json, content_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [card2Id, 'SQLite 3R1W 多线程模型', '{"type":"doc"}', '基于 WAL 模式实现的 3 Readers + 1 Writer 队列调度。', now, now]
  );
  console.log('   2 test cards inserted.');

  console.log('3. Querying cards via reader worker...');
  const cards = await dbMaster.query<Card>('SELECT * FROM cards WHERE is_deleted = 0');
  console.log(
    `   Read query returned ${cards.length} cards:`,
    cards.map((c) => c.title)
  );

  console.log('4. Testing FTS5 Full-Text Search on virtual table cards_fts...');
  const ftsResults = await dbMaster.query<{ id: string; title: string; content_text: string }>(
    `SELECT c.id, c.title, c.content_text
     FROM cards_fts f
     JOIN cards c ON f.rowid = c.rowid
     WHERE cards_fts MATCH ?`,
    ['Heptabase']
  );
  console.log(
    `   FTS5 search matched ${ftsResults.length} records:`,
    ftsResults.map((r) => r.title)
  );

  console.log('5. Testing LocalFileStore (Shadow database & SHA-256 deduplication)...');
  const dummyFilePath = path.join(testDir, 'sample_attachment.txt');
  fs.writeFileSync(dummyFilePath, 'OpenHepta Local File Attachment Content: 123456');

  const fileStore = new LocalFileStore(testDir);
  const fileResult = await fileStore.addFile(dummyFilePath, 'sample_attachment.txt');
  console.log('   File registered:', {
    referenceId: fileResult.reference.reference_id,
    sha256: fileResult.reference.sha256,
    mimeType: fileResult.reference.mime_type,
    previewUrl: fileResult.previewUrl,
  });

  const duplicateResult = await fileStore.addFile(dummyFilePath, 'sample_attachment_renamed.txt');
  console.log('   Deduplication check:', {
    sameReferenceId: fileResult.reference.reference_id === duplicateResult.reference.reference_id,
    newInstanceId: duplicateResult.instance.instance_id,
  });

  console.log('6. Testing Sub-Whiteboard Cross-Whiteboard Move, Cycle Blocking & Hierarchy Move...');
  const wbRootId = 'wb-root-test';
  const wbChildAId = 'wb-child-a';
  const wbGrandchildA1Id = 'wb-grandchild-a1';
  const wbChildBId = 'wb-child-b';

  await dbMaster.execute([
    {
      sql: 'INSERT INTO whiteboards (id, name, created_at, updated_at, is_deleted, parent_whiteboard_id) VALUES (?, ?, ?, ?, 0, ?)',
      params: [wbRootId, 'Root Whiteboard', now, now, null],
    },
    {
      sql: 'INSERT INTO whiteboards (id, name, created_at, updated_at, is_deleted, parent_whiteboard_id) VALUES (?, ?, ?, ?, 0, ?)',
      params: [wbChildAId, 'Alpha Sub-Whiteboard', now, now, wbRootId],
    },
    {
      sql: 'INSERT INTO whiteboards (id, name, created_at, updated_at, is_deleted, parent_whiteboard_id) VALUES (?, ?, ?, ?, 0, ?)',
      params: [wbGrandchildA1Id, 'Alpha Nested Grandchild', now, now, wbChildAId],
    },
    {
      sql: 'INSERT INTO whiteboards (id, name, created_at, updated_at, is_deleted, parent_whiteboard_id) VALUES (?, ?, ?, ?, 0, ?)',
      params: [wbChildBId, 'Beta Sub-Whiteboard', now, now, wbRootId],
    },
  ]);

  await dbMaster.execute([
    {
      sql: 'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [
        'obj-subwb-a',
        wbRootId,
        'whiteboard_shortcut',
        wbChildAId,
        100,
        100,
        640,
        420,
        10,
        JSON.stringify({ name: 'Alpha Sub-Whiteboard', color: 'blue', isChild: true }),
      ],
    },
    {
      sql: 'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [
        'obj-subwb-a1',
        wbChildAId,
        'whiteboard_shortcut',
        wbGrandchildA1Id,
        120,
        120,
        640,
        420,
        10,
        JSON.stringify({ name: 'Alpha Nested Grandchild', color: 'green', isChild: true }),
      ],
    },
    {
      sql: 'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [
        'obj-subwb-b',
        wbRootId,
        'whiteboard_shortcut',
        wbChildBId,
        900,
        100,
        640,
        420,
        10,
        JSON.stringify({ name: 'Beta Sub-Whiteboard', color: 'purple', isChild: true }),
      ],
    },
    {
      sql: 'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [
        'obj-sec-1',
        wbRootId,
        'section',
        null,
        200,
        600,
        1200,
        900,
        1,
        JSON.stringify({ title: 'Research Section', color: 'yellow' }),
      ],
    },
    {
      sql: 'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: ['obj-card-1', wbRootId, 'card', card1Id, 240, 640, 520, 720, 10, '{}'],
    },
    {
      sql: 'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: ['obj-card-2', wbRootId, 'card', card2Id, 820, 640, 520, 720, 10, '{}'],
    },
    {
      sql: 'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      params: [
        'obj-outside',
        wbRootId,
        'text',
        null,
        2000,
        600,
        406,
        41.5,
        10,
        JSON.stringify({ text: 'Outside Note' }),
      ],
    },
    {
      sql: 'INSERT INTO connections (id, whiteboard_id, source_object_id, target_object_id, label, style_json) VALUES (?, ?, ?, ?, ?, ?)',
      params: [
        'conn-internal',
        wbRootId,
        'obj-card-1',
        'obj-card-2',
        'Internal Link',
        JSON.stringify({ controlPoints: [{ id: 'cp1', x: 500, y: 700 }] }),
      ],
    },
    {
      sql: 'INSERT INTO connections (id, whiteboard_id, source_object_id, target_object_id, label, style_json) VALUES (?, ?, ?, ?, ?, ?)',
      params: ['conn-external', wbRootId, 'obj-card-2', 'obj-outside', 'External Link', '{}'],
    },
  ]);

  const cycleResult = await moveObjectsAcrossWhiteboards({
    sourceWhiteboardId: wbRootId,
    targetWhiteboardId: wbGrandchildA1Id,
    objectIds: ['obj-subwb-a'],
  });
  assert.deepStrictEqual(cycleResult.cycleBlockedIds, ['obj-subwb-a']);
  assert.strictEqual(cycleResult.movedObjectIds.length, 0);

  const moveResult = await moveObjectsAcrossWhiteboards({
    sourceWhiteboardId: wbRootId,
    targetWhiteboardId: wbChildBId,
    objectIds: ['obj-sec-1'],
  });
  assert.strictEqual(moveResult.movedObjectIds.length, 3);
  assert.strictEqual(moveResult.movedConnectionCount, 1);
  assert.strictEqual(moveResult.deletedConnectionCount, 1);

  const childBObjects = await dbMaster.query<WhiteboardObject>(
    'SELECT * FROM whiteboard_objects WHERE whiteboard_id = ?',
    [wbChildBId]
  );
  assert.strictEqual(childBObjects.length, 3);

  const childBConns = await dbMaster.query<Connection>(
    'SELECT * FROM connections WHERE whiteboard_id = ?',
    [wbChildBId]
  );
  assert.strictEqual(childBConns.length, 1);
  assert.strictEqual(childBConns[0].id, 'conn-internal');

  const copyResult = await moveObjectsAcrossWhiteboards({
    sourceWhiteboardId: wbRootId,
    targetWhiteboardId: wbChildBId,
    objectIds: ['obj-subwb-a'],
    copy: true,
  });
  assert.strictEqual(copyResult.movedObjectIds.length, 1);
  const copiedShortcutRows = await dbMaster.query<WhiteboardObject>(
    'SELECT * FROM whiteboard_objects WHERE id = ?',
    [copyResult.movedObjectIds[0]]
  );
  assert.strictEqual(copiedShortcutRows.length, 1);
  assert.strictEqual(copiedShortcutRows[0].height, 128);
  assert.strictEqual(JSON.parse(copiedShortcutRows[0].properties_json).isChild, false);

  const statsMap = await getWhiteboardStatsMap();
  const childBStats = statsMap[wbChildBId];
  assert.ok(childBStats);
  assert.strictEqual(childBStats.hasOtherContent, true);
  assert.ok(childBStats.itemSummaries && childBStats.itemSummaries.length === 3);
  assert.strictEqual(childBStats.itemSummaries[0].objectType, 'whiteboard_shortcut');

  const cycleHierarchyResult = await moveWhiteboardHierarchy({
    whiteboardId: wbChildAId,
    targetParentWhiteboardId: wbGrandchildA1Id,
  });
  assert.strictEqual(cycleHierarchyResult.status, 'cycleBlocked');

  const validHierarchyResult = await moveWhiteboardHierarchy({
    whiteboardId: wbGrandchildA1Id,
    targetParentWhiteboardId: wbChildBId,
  });
  assert.strictEqual(validHierarchyResult.status, 'moved');

  const updatedGrandchild = await dbMaster.query<Whiteboard>(
    'SELECT * FROM whiteboards WHERE id = ?',
    [wbGrandchildA1Id]
  );
  assert.strictEqual(updatedGrandchild[0].parent_whiteboard_id, wbChildBId);

  await deleteWhiteboardRecursive(wbChildBId);
  const deletedWbs = await dbMaster.query<Whiteboard>(
    'SELECT * FROM whiteboards WHERE id IN (?, ?) AND is_deleted = 0',
    [wbChildBId, wbGrandchildA1Id]
  );
  assert.strictEqual(deletedWbs.length, 0);

  const survivingCards = await dbMaster.query<Card>(
    'SELECT * FROM cards WHERE is_deleted = 0'
  );
  assert.strictEqual(survivingCards.length, 2);
  console.log('   Sub-Whiteboard moveObjectsAcross, cycle detection, moveHierarchy & safe delete verified.');

  console.log('7. Cleaning up resources...');
  fileStore.close();
  dbMaster.cleanup();

  console.log('====================================================');
  console.log('Phase 1 Core Infrastructure test passed with 100% success!');
  console.log('====================================================');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
