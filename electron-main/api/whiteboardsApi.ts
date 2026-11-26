import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/api';
import {
  Connection,
  CreateConnectionInput,
  CreateWhiteboardObjectInput,
  DbStatement,
  HEPTA_DEFAULT_DIMENSIONS,
  MoveObjectsAcrossWhiteboardsInput,
  MoveObjectsAcrossWhiteboardsResult,
  MoveWhiteboardHierarchyInput,
  MoveWhiteboardHierarchyResult,
  SubWhiteboardProperties,
  UpdateConnectionPatch,
  Whiteboard,
  WhiteboardChildItemSummary,
  WhiteboardObject,
  WhiteboardObjectPatch,
  WhiteboardOptions,
  WhiteboardStatsRow,
} from '../../shared/types';
import { dbMaster } from '../database/dbMaster';

function parseSubWhiteboardProps(raw: string | undefined): SubWhiteboardProperties & Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function buildWhiteboardChildrenMap(
  allWhiteboards: Whiteboard[],
  allShortcutObjects: WhiteboardObject[]
): Map<string, Set<string>> {
  const activeIds = new Set(allWhiteboards.filter((w) => w.is_deleted === 0).map((w) => w.id));
  const childrenMap = new Map<string, Set<string>>();

  const addEdge = (parentId: string, childId: string) => {
    if (!activeIds.has(parentId) || !activeIds.has(childId) || parentId === childId) return;
    let set = childrenMap.get(parentId);
    if (!set) {
      set = new Set<string>();
      childrenMap.set(parentId, set);
    }
    set.add(childId);
  };

  for (const wb of allWhiteboards) {
    if (wb.is_deleted === 0 && wb.parent_whiteboard_id) {
      addEdge(wb.parent_whiteboard_id, wb.id);
    }
  }

  for (const obj of allShortcutObjects) {
    if (obj.object_type !== 'whiteboard_shortcut' || !obj.target_id) continue;
    const props = parseSubWhiteboardProps(obj.properties_json);
    if (props.isChild !== false) {
      addEdge(obj.whiteboard_id, obj.target_id);
    }
  }

  return childrenMap;
}

function isDescendantOrSameWhiteboard(
  ancestorId: string,
  candidateId: string,
  childrenMap: Map<string, Set<string>>
): boolean {
  if (ancestorId === candidateId) return true;
  const visited = new Set<string>([ancestorId]);
  const queue: string[] = [ancestorId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const children = childrenMap.get(cur);
    if (!children) continue;
    for (const childId of children) {
      if (childId === candidateId) return true;
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push(childId);
      }
    }
  }
  return false;
}

function computePlacementAnchor(targetObjects: WhiteboardObject[]): { anchorX: number; anchorY: number } {
  if (targetObjects.length === 0) {
    return { anchorX: 120, anchorY: 120 };
  }
  const maxRight = Math.max(...targetObjects.map((o) => o.pos_x + o.width));
  const minY = Math.min(...targetObjects.map((o) => o.pos_y));
  return { anchorX: maxRight + 80, anchorY: minY };
}

function translateConnectionStyleJson(styleJson: string, dx: number, dy: number): string {
  if (!styleJson) return '{}';
  try {
    const parsed = JSON.parse(styleJson) as Record<string, unknown>;
    if (Array.isArray(parsed.controlPoints)) {
      parsed.controlPoints = parsed.controlPoints.map((cp: unknown) => {
        if (typeof cp === 'object' && cp !== null) {
          const pt = cp as Record<string, unknown>;
          return {
            ...pt,
            x: typeof pt.x === 'number' ? pt.x + dx : pt.x,
            y: typeof pt.y === 'number' ? pt.y + dy : pt.y,
          };
        }
        return cp;
      });
      return JSON.stringify(parsed);
    }
    return styleJson;
  } catch {
    return styleJson;
  }
}

export async function deleteWhiteboardRecursive(id: string): Promise<void> {
  const [allWhiteboards, allShortcutObjects] = await Promise.all([
    dbMaster.query<Whiteboard>('SELECT * FROM whiteboards WHERE is_deleted = 0'),
    dbMaster.query<WhiteboardObject>(
      "SELECT * FROM whiteboard_objects WHERE object_type = 'whiteboard_shortcut'"
    ),
  ]);

  const childrenMap = buildWhiteboardChildrenMap(allWhiteboards, allShortcutObjects);
  const toDeleteSet = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const children = childrenMap.get(cur);
    if (!children) continue;
    for (const childId of children) {
      if (!toDeleteSet.has(childId)) {
        toDeleteSet.add(childId);
        queue.push(childId);
      }
    }
  }

  const toDelete = Array.from(toDeleteSet);
  const referencingShortcuts = allShortcutObjects.filter(
    (obj) => obj.target_id !== null && toDeleteSet.has(obj.target_id)
  );

  const now = Date.now();
  const stmts: DbStatement[] = [];
  for (const refObj of referencingShortcuts) {
    stmts.push({
      sql: 'DELETE FROM connections WHERE source_object_id = ? OR target_object_id = ?',
      params: [refObj.id, refObj.id],
    });
  }
  for (const targetId of toDelete) {
    stmts.push(
      {
        sql: 'UPDATE whiteboards SET is_deleted = 1, updated_at = ? WHERE id = ?',
        params: [now, targetId],
      },
      {
        sql: 'DELETE FROM whiteboard_objects WHERE whiteboard_id = ?',
        params: [targetId],
      },
      {
        sql: 'DELETE FROM connections WHERE whiteboard_id = ?',
        params: [targetId],
      },
      {
        sql: 'DELETE FROM whiteboard_objects WHERE target_id = ?',
        params: [targetId],
      }
    );
  }
  await dbMaster.execute(stmts);
}

export async function moveObjectsAcrossWhiteboards(
  input: MoveObjectsAcrossWhiteboardsInput
): Promise<MoveObjectsAcrossWhiteboardsResult> {
  const { sourceWhiteboardId, targetWhiteboardId, objectIds, copy = false } = input;
  if (!objectIds || objectIds.length === 0 || sourceWhiteboardId === targetWhiteboardId) {
    return {
      movedObjectIds: [],
      cycleBlockedIds: [],
      movedConnectionCount: 0,
      deletedConnectionCount: 0,
    };
  }

  const [sourceObjects, targetObjects, sourceConnections, allWhiteboards, allShortcutObjects] =
    await Promise.all([
      dbMaster.query<WhiteboardObject>(
        'SELECT * FROM whiteboard_objects WHERE whiteboard_id = ? ORDER BY z_index ASC',
        [sourceWhiteboardId]
      ),
      dbMaster.query<WhiteboardObject>(
        'SELECT * FROM whiteboard_objects WHERE whiteboard_id = ? ORDER BY z_index ASC',
        [targetWhiteboardId]
      ),
      dbMaster.query<Connection>('SELECT * FROM connections WHERE whiteboard_id = ?', [
        sourceWhiteboardId,
      ]),
      dbMaster.query<Whiteboard>('SELECT * FROM whiteboards WHERE is_deleted = 0'),
      dbMaster.query<WhiteboardObject>(
        "SELECT * FROM whiteboard_objects WHERE object_type = 'whiteboard_shortcut'"
      ),
    ]);

  const sourceObjMap = new Map<string, WhiteboardObject>();
  for (const obj of sourceObjects) {
    sourceObjMap.set(obj.id, obj);
  }

  const expandedIds = new Set<string>();
  const sectionQueue: WhiteboardObject[] = [];

  for (const id of objectIds) {
    const obj = sourceObjMap.get(id);
    if (!obj || expandedIds.has(obj.id)) continue;
    expandedIds.add(obj.id);
    if (obj.object_type === 'section') {
      sectionQueue.push(obj);
    }
  }

  while (sectionQueue.length > 0) {
    const sec = sectionQueue.shift()!;
    const secLeft = sec.pos_x;
    const secRight = sec.pos_x + sec.width;
    const secTop = sec.pos_y;
    const secBottom = sec.pos_y + sec.height;

    for (const candidate of sourceObjects) {
      if (expandedIds.has(candidate.id)) continue;
      if (
        candidate.object_type === 'whiteboard_shortcut' &&
        candidate.target_id === targetWhiteboardId
      ) {
        continue;
      }
      const cx = candidate.pos_x + candidate.width / 2;
      const cy = candidate.pos_y + candidate.height / 2;
      if (cx >= secLeft && cx <= secRight && cy >= secTop && cy <= secBottom) {
        expandedIds.add(candidate.id);
        if (candidate.object_type === 'section') {
          sectionQueue.push(candidate);
        }
      }
    }
  }

  const childrenMap = buildWhiteboardChildrenMap(allWhiteboards, allShortcutObjects);
  const cycleBlockedIds: string[] = [];
  const validMovingIds = new Set<string>();

  for (const id of expandedIds) {
    const obj = sourceObjMap.get(id);
    if (!obj) continue;
    if (obj.object_type === 'whiteboard_shortcut' && obj.target_id) {
      if (isDescendantOrSameWhiteboard(obj.target_id, targetWhiteboardId, childrenMap)) {
        cycleBlockedIds.push(obj.id);
        continue;
      }
    }
    validMovingIds.add(obj.id);
  }

  const movingObjects = sourceObjects.filter((o) => validMovingIds.has(o.id));
  if (movingObjects.length === 0) {
    return {
      movedObjectIds: [],
      cycleBlockedIds,
      movedConnectionCount: 0,
      deletedConnectionCount: 0,
    };
  }

  const minX = Math.min(...movingObjects.map((o) => o.pos_x));
  const minY = Math.min(...movingObjects.map((o) => o.pos_y));
  const { anchorX, anchorY } = computePlacementAnchor(targetObjects);
  const dx = anchorX - minX;
  const dy = anchorY - minY;

  const internalConnections: Connection[] = [];
  const externalConnections: Connection[] = [];

  for (const conn of sourceConnections) {
    const srcMoving = validMovingIds.has(conn.source_object_id);
    const dstMoving = validMovingIds.has(conn.target_object_id);
    if (srcMoving && dstMoving) {
      internalConnections.push(conn);
    } else if (srcMoving !== dstMoving) {
      externalConnections.push(conn);
    }
  }

  const now = Date.now();
  const statements: DbStatement[] = [];

  if (copy) {
    const idMap = new Map<string, string>();
    movingObjects.forEach((obj, idx) => {
      idMap.set(
        obj.id,
        `wbo-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`
      );
    });

    const clonedIds: string[] = [];
    for (const obj of movingObjects) {
      const newId = idMap.get(obj.id)!;
      clonedIds.push(newId);
      let nextHeight = obj.height;
      let nextPropsJson = obj.properties_json;

      const parsedProps = parseSubWhiteboardProps(obj.properties_json);
      let propsChanged = false;

      if (obj.object_type === 'whiteboard_shortcut') {
        parsedProps.isChild = false;
        nextHeight = HEPTA_DEFAULT_DIMENSIONS.whiteboard_shortcut.height;
        propsChanged = true;
      }
      if (typeof parsedProps.parentId === 'string' && idMap.has(parsedProps.parentId)) {
        parsedProps.parentId = idMap.get(parsedProps.parentId);
        propsChanged = true;
      }
      if (propsChanged) {
        nextPropsJson = JSON.stringify(parsedProps);
      }

      statements.push({
        sql: 'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [
          newId,
          targetWhiteboardId,
          obj.object_type,
          obj.target_id,
          obj.pos_x + dx,
          obj.pos_y + dy,
          obj.width,
          nextHeight,
          obj.z_index,
          nextPropsJson,
        ],
      });
    }

    internalConnections.forEach((conn, idx) => {
      const newSrc = idMap.get(conn.source_object_id);
      const newDst = idMap.get(conn.target_object_id);
      if (!newSrc || !newDst) return;
      const newConnId = `conn-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
      statements.push({
        sql: 'INSERT INTO connections (id, whiteboard_id, source_object_id, target_object_id, label, style_json) VALUES (?, ?, ?, ?, ?, ?)',
        params: [
          newConnId,
          targetWhiteboardId,
          newSrc,
          newDst,
          conn.label ?? null,
          translateConnectionStyleJson(conn.style_json, dx, dy),
        ],
      });
    });

    statements.push({
      sql: 'UPDATE whiteboards SET updated_at = ? WHERE id = ?',
      params: [now, targetWhiteboardId],
    });

    await dbMaster.execute(statements);
    return {
      movedObjectIds: clonedIds,
      cycleBlockedIds,
      movedConnectionCount: internalConnections.length,
      deletedConnectionCount: 0,
    };
  }

  for (const obj of movingObjects) {
    statements.push({
      sql: 'UPDATE whiteboard_objects SET whiteboard_id = ?, pos_x = ?, pos_y = ? WHERE id = ?',
      params: [targetWhiteboardId, obj.pos_x + dx, obj.pos_y + dy, obj.id],
    });
    if (obj.object_type === 'whiteboard_shortcut' && obj.target_id) {
      const props = parseSubWhiteboardProps(obj.properties_json);
      if (props.isChild !== false) {
        statements.push({
          sql: 'UPDATE whiteboards SET parent_whiteboard_id = ?, updated_at = ? WHERE id = ?',
          params: [targetWhiteboardId, now, obj.target_id],
        });
      }
    }
  }

  for (const conn of internalConnections) {
    statements.push({
      sql: 'UPDATE connections SET whiteboard_id = ?, style_json = ? WHERE id = ?',
      params: [targetWhiteboardId, translateConnectionStyleJson(conn.style_json, dx, dy), conn.id],
    });
  }

  for (const conn of externalConnections) {
    statements.push({
      sql: 'DELETE FROM connections WHERE id = ?',
      params: [conn.id],
    });
  }

  statements.push(
    {
      sql: 'UPDATE whiteboards SET updated_at = ? WHERE id = ?',
      params: [now, sourceWhiteboardId],
    },
    {
      sql: 'UPDATE whiteboards SET updated_at = ? WHERE id = ?',
      params: [now, targetWhiteboardId],
    }
  );

  await dbMaster.execute(statements);
  return {
    movedObjectIds: movingObjects.map((o) => o.id),
    cycleBlockedIds,
    movedConnectionCount: internalConnections.length,
    deletedConnectionCount: externalConnections.length,
  };
}

export async function moveWhiteboardHierarchy(
  input: MoveWhiteboardHierarchyInput
): Promise<MoveWhiteboardHierarchyResult> {
  const { whiteboardId, targetParentWhiteboardId } = input;
  const targetParentId = targetParentWhiteboardId || null;

  const [allWhiteboards, allShortcutObjects] = await Promise.all([
    dbMaster.query<Whiteboard>('SELECT * FROM whiteboards WHERE is_deleted = 0'),
    dbMaster.query<WhiteboardObject>(
      "SELECT * FROM whiteboard_objects WHERE object_type = 'whiteboard_shortcut'"
    ),
  ]);

  const wb = allWhiteboards.find((w) => w.id === whiteboardId);
  if (!wb) {
    return { status: 'notFound' };
  }

  if (targetParentId !== null) {
    const targetParent = allWhiteboards.find((w) => w.id === targetParentId);
    if (!targetParent) {
      return { status: 'notFound' };
    }
    const childrenMap = buildWhiteboardChildrenMap(allWhiteboards, allShortcutObjects);
    if (isDescendantOrSameWhiteboard(whiteboardId, targetParentId, childrenMap)) {
      return { status: 'cycleBlocked' };
    }
  }

  const currentParentId = wb.parent_whiteboard_id || null;
  if (currentParentId === targetParentId) {
    return { status: 'alreadyAtTarget' };
  }

  const childShortcuts = allShortcutObjects.filter((obj) => {
    if (obj.target_id !== whiteboardId) return false;
    const props = parseSubWhiteboardProps(obj.properties_json);
    return props.isChild !== false;
  });

  const now = Date.now();
  const statements: DbStatement[] = [
    {
      sql: 'UPDATE whiteboards SET parent_whiteboard_id = ?, updated_at = ? WHERE id = ?',
      params: [targetParentId, now, whiteboardId],
    },
  ];

  for (const childObj of childShortcuts) {
    statements.push({
      sql: 'DELETE FROM connections WHERE source_object_id = ? OR target_object_id = ?',
      params: [childObj.id, childObj.id],
    });
  }

  if (targetParentId === null) {
    for (const childObj of childShortcuts) {
      statements.push({
        sql: 'DELETE FROM whiteboard_objects WHERE id = ?',
        params: [childObj.id],
      });
    }
  } else {
    const targetParentObjects = await dbMaster.query<WhiteboardObject>(
      'SELECT * FROM whiteboard_objects WHERE whiteboard_id = ?',
      [targetParentId]
    );
    const { anchorX, anchorY } = computePlacementAnchor(
      targetParentObjects.filter((o) => !childShortcuts.some((c) => c.id === o.id))
    );

    if (childShortcuts.length > 0) {
      const primary = childShortcuts[0];
      const props = parseSubWhiteboardProps(primary.properties_json);
      props.isChild = true;
      props.name = wb.name;
      if (!props.color) props.color = 'white';

      statements.push({
        sql: 'UPDATE whiteboard_objects SET whiteboard_id = ?, pos_x = ?, pos_y = ?, properties_json = ? WHERE id = ?',
        params: [targetParentId, anchorX, anchorY, JSON.stringify(props), primary.id],
      });

      for (let i = 1; i < childShortcuts.length; i += 1) {
        statements.push({
          sql: 'DELETE FROM whiteboard_objects WHERE id = ?',
          params: [childShortcuts[i].id],
        });
      }
    } else {
      const dims = HEPTA_DEFAULT_DIMENSIONS.sub_whiteboard;
      const newObjId = `wbo-${now}-${Math.random().toString(36).slice(2, 6)}`;
      statements.push({
        sql: 'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [
          newObjId,
          targetParentId,
          'whiteboard_shortcut',
          whiteboardId,
          anchorX,
          anchorY,
          dims.width,
          dims.height,
          10,
          JSON.stringify({ name: wb.name, color: 'white', isChild: true }),
        ],
      });
    }
  }

  await dbMaster.execute(statements);
  return { status: 'moved' };
}

export async function getWhiteboardStatsMap(): Promise<Record<string, WhiteboardStatsRow>> {
  const [objs, conns, cardRows, docRows, hlRows, wbRows] = await Promise.all([
    dbMaster.query<WhiteboardObject>(
      'SELECT id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json FROM whiteboard_objects'
    ),
    dbMaster.query<Connection>(
      'SELECT id, whiteboard_id, source_object_id, target_object_id, label, style_json FROM connections'
    ),
    dbMaster.query<{ id: string; title: string; content_text: string; color: string | null }>(
      'SELECT id, title, content_text, color FROM cards WHERE is_deleted = 0'
    ),
    dbMaster.query<{ id: string; title: string; doc_type: string }>(
      'SELECT id, title, doc_type FROM documents WHERE is_deleted = 0'
    ),
    dbMaster.query<{ id: string; text_content: string; note_text: string; color: string }>(
      'SELECT id, text_content, note_text, color FROM highlight_elements WHERE is_deleted = 0'
    ),
    dbMaster.query<{ id: string; name: string }>(
      'SELECT id, name FROM whiteboards WHERE is_deleted = 0'
    ),
  ]);

  const globalCardColors: Record<string, string | null> = {};
  const cardMap = new Map<string, { id: string; title: string; content_text: string; color: string | null }>();
  for (const c of cardRows) {
    globalCardColors[c.id] = c.color;
    cardMap.set(c.id, c);
  }

  const docMap = new Map<string, { id: string; title: string; doc_type: string }>();
  for (const d of docRows) {
    docMap.set(d.id, d);
  }

  const globalHlColors: Record<string, string> = {};
  const hlMap = new Map<string, { id: string; text_content: string; note_text: string; color: string }>();
  for (const h of hlRows) {
    globalHlColors[h.id] = h.color;
    hlMap.set(h.id, h);
  }

  const wbMap = new Map<string, { id: string; name: string }>();
  for (const w of wbRows) {
    wbMap.set(w.id, w);
  }

  const statsMap: Record<string, WhiteboardStatsRow> = {};
  const ensure = (wbId: string): WhiteboardStatsRow => {
    if (!statsMap[wbId]) {
      statsMap[wbId] = {
        cards: 0,
        sections: 0,
        mindmaps: 0,
        media: 0,
        subWhiteboards: 0,
        connections: 0,
        totalObjects: 0,
        objects: [],
        connList: [],
        cardColorMap: globalCardColors,
        highlightColorMap: globalHlColors,
        itemSummaries: [],
        hasOtherContent: false,
      };
    }
    return statsMap[wbId];
  };

  for (const w of wbRows) {
    ensure(w.id);
  }

  for (const obj of objs) {
    const s = ensure(obj.whiteboard_id);
    s.totalObjects += 1;
    s.objects.push(obj);
    if (obj.object_type === 'card') s.cards += 1;
    else if (obj.object_type === 'section') s.sections += 1;
    else if (obj.object_type === 'mindmap_node') s.mindmaps += 1;
    else if (
      obj.object_type === 'media' ||
      obj.object_type === 'pdf' ||
      obj.object_type === 'epub'
    ) {
      s.media += 1;
    } else if (obj.object_type === 'whiteboard_shortcut') {
      s.subWhiteboards += 1;
    }

    if (obj.object_type === 'section') {
      continue;
    }

    const props = parseSubWhiteboardProps(obj.properties_json);
    const propColor = typeof props.color === 'string' && props.color ? props.color : '';
    let rawTitle = '';
    let color = propColor || 'white';
    let isChildWhiteboard: boolean | undefined;

    if (obj.object_type === 'whiteboard_shortcut') {
      const targetWb = obj.target_id ? wbMap.get(obj.target_id) : undefined;
      if (obj.target_id && !targetWb) {
        continue;
      }
      rawTitle =
        targetWb?.name ||
        (typeof props.name === 'string' ? props.name : '') ||
        (typeof props.title === 'string' ? props.title : '');
      color = propColor || 'white';
      isChildWhiteboard = props.isChild !== false;
    } else if (obj.object_type === 'card' || obj.object_type === 'journal') {
      const card = obj.target_id ? cardMap.get(obj.target_id) : undefined;
      if (obj.target_id && !card) {
        continue;
      }
      const fallbackText = card?.content_text
        ? card.content_text.split('\n')[0]?.slice(0, 60) || ''
        : '';
      rawTitle =
        card?.title ||
        (typeof props.title === 'string' ? props.title : '') ||
        (typeof props.dateKey === 'string' ? props.dateKey : '') ||
        fallbackText;
      color = card?.color || propColor || 'white';
    } else if (obj.object_type === 'mindmap_node') {
      rawTitle =
        (typeof props.title === 'string' ? props.title : '') ||
        (typeof props.text === 'string' ? props.text : '') ||
        (typeof props.label === 'string' ? props.label : '');
      color = propColor || 'white';
    } else if (obj.object_type === 'text') {
      rawTitle =
        (typeof props.text === 'string' ? props.text : '') ||
        (typeof props.title === 'string' ? props.title : '');
      color = propColor || 'white';
    } else if (obj.object_type === 'pdf' || obj.object_type === 'epub') {
      const doc = obj.target_id ? docMap.get(obj.target_id) : undefined;
      rawTitle =
        doc?.title ||
        (typeof props.title === 'string' ? props.title : '') ||
        (typeof props.fileName === 'string' ? props.fileName : '') ||
        (typeof props.name === 'string' ? props.name : '');
      color = propColor || 'white';
    } else if (obj.object_type === 'highlight') {
      const hl = obj.target_id ? hlMap.get(obj.target_id) : undefined;
      rawTitle =
        hl?.text_content ||
        hl?.note_text ||
        (typeof props.text === 'string' ? props.text : '') ||
        (typeof props.title === 'string' ? props.title : '');
      color = hl?.color || propColor || 'yellow';
    } else if (obj.object_type === 'media') {
      rawTitle =
        (typeof props.title === 'string' ? props.title : '') ||
        (typeof props.fileName === 'string' ? props.fileName : '') ||
        (typeof props.name === 'string' ? props.name : '');
      color = propColor || 'white';
    }

    const cleanedTitle =
      rawTitle.replace(/\s+/g, ' ').trim() ||
      (obj.object_type === 'whiteboard_shortcut'
        ? 'Untitled Whiteboard'
        : obj.object_type === 'card'
          ? 'Untitled Card'
          : obj.object_type === 'journal'
            ? 'Journal'
            : obj.object_type === 'pdf' || obj.object_type === 'epub'
              ? 'Document'
              : obj.object_type === 'highlight'
                ? 'Highlight'
                : '');
    if (!cleanedTitle) {
      continue;
    }

    const summary: WhiteboardChildItemSummary = {
      id: obj.id,
      objectType: obj.object_type,
      title: cleanedTitle,
      color,
      ...(isChildWhiteboard !== undefined ? { isChildWhiteboard } : {}),
    };
    s.itemSummaries!.push(summary);
  }

  for (const conn of conns) {
    const s = ensure(conn.whiteboard_id);
    s.connections += 1;
    s.connList.push(conn);
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  for (const wbId of Object.keys(statsMap)) {
    const row = statsMap[wbId];
    row.hasOtherContent = row.totalObjects > 0;
    if (row.itemSummaries && row.itemSummaries.length > 1) {
      row.itemSummaries.sort((a, b) => {
        const aIsWb = a.objectType === 'whiteboard_shortcut' ? 1 : 0;
        const bIsWb = b.objectType === 'whiteboard_shortcut' ? 1 : 0;
        if (bIsWb !== aIsWb) return bIsWb - aIsWb;
        const cmp = collator.compare(a.title, b.title);
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      });
    }
  }

  return statsMap;
}

export function registerWhiteboardsApiHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WHITEBOARDS_LIST, async () => {
    let wbs = await dbMaster.query<Whiteboard>(
      'SELECT * FROM whiteboards WHERE is_deleted = 0 ORDER BY created_at ASC'
    );
    if (wbs.length === 0) {
      const now = Date.now();
      await dbMaster.run(
        'INSERT INTO whiteboards (id, name, created_at, updated_at, viewport_pan_x, viewport_pan_y, viewport_zoom) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['wb-main', 'Main Space', now, now, 0, 0, 1.0]
      );
      wbs = await dbMaster.query<Whiteboard>(
        'SELECT * FROM whiteboards WHERE is_deleted = 0 ORDER BY created_at ASC'
      );
    }
    return wbs;
  });

  ipcMain.handle(IPC_CHANNELS.WHITEBOARDS_GET, async (_event, payload: { id: string } | string) => {
    const id = typeof payload === 'string' ? payload : payload.id;
    const rows = await dbMaster.query<Whiteboard>(
      'SELECT * FROM whiteboards WHERE id = ? AND is_deleted = 0 LIMIT 1',
      [id]
    );
    return rows[0] ?? null;
  });

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_CREATE,
    async (_event, payload?: { name?: string; parentWhiteboardId?: string | null } | string) => {
      const rawName = typeof payload === 'string' ? payload : payload?.name;
      const parentWhiteboardId =
        typeof payload === 'object' && payload !== null ? payload.parentWhiteboardId || null : null;
      const now = Date.now();
      const id = `wb-${now}`;
      let name = rawName?.trim() || '';
      if (!name) {
        const countRows = await dbMaster.query<{ cnt: number }>(
          'SELECT COUNT(*) as cnt FROM whiteboards WHERE is_deleted = 0'
        );
        const count = countRows[0]?.cnt ?? 0;
        name = `Whiteboard ${count + 1}`;
      }

      await dbMaster.run(
        'INSERT INTO whiteboards (id, name, created_at, updated_at, is_deleted, viewport_pan_x, viewport_pan_y, viewport_zoom, parent_whiteboard_id) VALUES (?, ?, ?, ?, 0, 0, 0, 1.0, ?)',
        [id, name, now, now, parentWhiteboardId]
      );

      return {
        id,
        name,
        created_at: now,
        updated_at: now,
        is_deleted: 0,
        viewport_pan_x: 0,
        viewport_pan_y: 0,
        viewport_zoom: 1.0,
        parent_whiteboard_id: parentWhiteboardId,
      } satisfies Whiteboard;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_RENAME,
    async (_event, payload: { id: string; name: string }) => {
      const trimmed = payload.name.trim();
      if (!trimmed) return;
      await dbMaster.run('UPDATE whiteboards SET name = ?, updated_at = ? WHERE id = ?', [
        trimmed,
        Date.now(),
        payload.id,
      ]);
      const shortcutObjs = await dbMaster.query<WhiteboardObject>(
        "SELECT id, properties_json FROM whiteboard_objects WHERE object_type = 'whiteboard_shortcut' AND target_id = ?",
        [payload.id]
      );
      if (shortcutObjs.length > 0) {
        const stmts: DbStatement[] = shortcutObjs.map((obj) => {
          const props = parseSubWhiteboardProps(obj.properties_json);
          props.name = trimmed;
          return {
            sql: 'UPDATE whiteboard_objects SET properties_json = ? WHERE id = ?',
            params: [JSON.stringify(props), obj.id],
          };
        });
        await dbMaster.execute(stmts);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_DELETE,
    async (_event, payload: { id: string } | string) => {
      const id = typeof payload === 'string' ? payload : payload.id;
      await deleteWhiteboardRecursive(id);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_DUPLICATE,
    async (_event, payload: { id: string } | string) => {
      const id = typeof payload === 'string' ? payload : payload.id;
      const wbRows = await dbMaster.query<Whiteboard>(
        'SELECT * FROM whiteboards WHERE id = ? AND is_deleted = 0 LIMIT 1',
        [id]
      );
      const wb = wbRows[0];
      if (!wb) return null;

      const [objs, conns] = await Promise.all([
        dbMaster.query<WhiteboardObject>(
          'SELECT * FROM whiteboard_objects WHERE whiteboard_id = ?',
          [id]
        ),
        dbMaster.query<Connection>('SELECT * FROM connections WHERE whiteboard_id = ?', [id]),
      ]);

      const now = Date.now();
      const newWbId = `wb-${now}`;
      const newName = `${wb.name} (Copy)`;
      const idMap = new Map<string, string>();
      const statements: DbStatement[] = [
        {
          sql: 'INSERT INTO whiteboards (id, name, created_at, updated_at, is_deleted, viewport_pan_x, viewport_pan_y, viewport_zoom) VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
          params: [
            newWbId,
            newName,
            now,
            now,
            wb.viewport_pan_x,
            wb.viewport_pan_y,
            wb.viewport_zoom,
          ],
        },
      ];

      objs.forEach((obj, idx) => {
        const newObjId = `wbo-${now}-${idx}`;
        idMap.set(obj.id, newObjId);
        statements.push({
          sql: 'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          params: [
            newObjId,
            newWbId,
            obj.object_type,
            obj.target_id,
            obj.pos_x,
            obj.pos_y,
            obj.width,
            obj.height,
            obj.z_index,
            obj.properties_json,
          ],
        });
      });

      conns.forEach((conn, idx) => {
        const newSrc = idMap.get(conn.source_object_id);
        const newDst = idMap.get(conn.target_object_id);
        if (!newSrc || !newDst) return;
        statements.push({
          sql: 'INSERT INTO connections (id, whiteboard_id, source_object_id, target_object_id, label, style_json) VALUES (?, ?, ?, ?, ?, ?)',
          params: [
            `conn-${now}-${idx}`,
            newWbId,
            newSrc,
            newDst,
            conn.label ?? null,
            conn.style_json,
          ],
        });
      });

      await dbMaster.execute(statements);

      return {
        id: newWbId,
        name: newName,
        created_at: now,
        updated_at: now,
        is_deleted: 0,
        viewport_pan_x: wb.viewport_pan_x,
        viewport_pan_y: wb.viewport_pan_y,
        viewport_zoom: wb.viewport_zoom,
      } satisfies Whiteboard;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_UPDATE_VIEWPORT,
    async (_event, payload: { id: string; panX: number; panY: number; zoom: number }) => {
      await dbMaster.run(
        'UPDATE whiteboards SET viewport_pan_x = ?, viewport_pan_y = ?, viewport_zoom = ?, updated_at = ? WHERE id = ?',
        [payload.panX, payload.panY, payload.zoom, Date.now(), payload.id]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_UPDATE_OPTIONS,
    async (_event, payload: { id: string; options: Partial<WhiteboardOptions> }) => {
      const rows = await dbMaster.query<{ options_json?: string }>(
        'SELECT options_json FROM whiteboards WHERE id = ? LIMIT 1',
        [payload.id]
      );
      let existing: Record<string, unknown> = {};
      if (rows[0]?.options_json) {
        try {
          existing = JSON.parse(rows[0].options_json) as Record<string, unknown>;
        } catch {
          existing = {};
        }
      }
      const merged = { ...existing, ...payload.options };
      await dbMaster.run(
        'UPDATE whiteboards SET options_json = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(merged), Date.now(), payload.id]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_LIST_OBJECTS,
    async (_event, payload: { whiteboardId: string } | string) => {
      const whiteboardId = typeof payload === 'string' ? payload : payload.whiteboardId;
      const rows = await dbMaster.query<WhiteboardObject>(
        'SELECT * FROM whiteboard_objects WHERE whiteboard_id = ? ORDER BY z_index ASC',
        [whiteboardId]
      );
      const upgrades: DbStatement[] = [];
      const normalized = rows.map((row) => {
        if (row.object_type === 'whiteboard_shortcut' && row.height < 128) {
          const props = parseSubWhiteboardProps(row.properties_json);
          const isChild = props.isChild !== false;
          const nextWidth = Math.max(row.width, HEPTA_DEFAULT_DIMENSIONS.sub_whiteboard.width);
          const nextHeight = isChild
            ? HEPTA_DEFAULT_DIMENSIONS.sub_whiteboard.height
            : HEPTA_DEFAULT_DIMENSIONS.whiteboard_shortcut.height;
          upgrades.push({
            sql: 'UPDATE whiteboard_objects SET width = ?, height = ? WHERE id = ?',
            params: [nextWidth, nextHeight, row.id],
          });
          return { ...row, width: nextWidth, height: nextHeight };
        }
        return row;
      });
      if (upgrades.length > 0) {
        await dbMaster.execute(upgrades);
      }
      return normalized;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_CREATE_OBJECT,
    async (_event, input: CreateWhiteboardObjectInput) => {
      let defaultDimKey: string = input.objectType;
      if (input.objectType === 'whiteboard_shortcut') {
        const parsed = parseSubWhiteboardProps(input.propertiesJson);
        defaultDimKey = parsed.isChild === false ? 'whiteboard_shortcut' : 'sub_whiteboard';
      }
      const dims = HEPTA_DEFAULT_DIMENSIONS[defaultDimKey] ?? HEPTA_DEFAULT_DIMENSIONS.card;
      const id = input.id || `wbo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const width = input.width ?? dims.width;
      const height = input.height ?? dims.height;
      const zIndex = input.zIndex ?? 10;
      const propertiesJson = input.propertiesJson ?? '{}';
      const targetId = input.targetId ?? null;

      await dbMaster.run(
        'INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          input.whiteboardId,
          input.objectType,
          targetId,
          input.posX,
          input.posY,
          width,
          height,
          zIndex,
          propertiesJson,
        ]
      );

      return {
        id,
        whiteboard_id: input.whiteboardId,
        object_type: input.objectType,
        target_id: targetId,
        pos_x: input.posX,
        pos_y: input.posY,
        width,
        height,
        z_index: zIndex,
        properties_json: propertiesJson,
      } satisfies WhiteboardObject;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_UPDATE_OBJECT_RECT,
    async (
      _event,
      payload: { id: string; posX: number; posY: number; width: number; height: number }
    ) => {
      await dbMaster.run(
        'UPDATE whiteboard_objects SET pos_x = ?, pos_y = ?, width = ?, height = ? WHERE id = ?',
        [payload.posX, payload.posY, payload.width, payload.height, payload.id]
      );
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_UPDATE_OBJECT_POSITION,
    async (_event, payload: { id: string; posX: number; posY: number }) => {
      await dbMaster.run('UPDATE whiteboard_objects SET pos_x = ?, pos_y = ? WHERE id = ?', [
        payload.posX,
        payload.posY,
        payload.id,
      ]);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_UPDATE_OBJECT_SIZE,
    async (_event, payload: { id: string; width: number; height: number }) => {
      await dbMaster.run('UPDATE whiteboard_objects SET width = ?, height = ? WHERE id = ?', [
        payload.width,
        payload.height,
        payload.id,
      ]);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_UPDATE_OBJECT_PROPERTIES,
    async (_event, payload: { id: string; propertiesJson: string }) => {
      await dbMaster.run('UPDATE whiteboard_objects SET properties_json = ? WHERE id = ?', [
        payload.propertiesJson,
        payload.id,
      ]);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_UPDATE_OBJECT_Z_INDEX,
    async (_event, payload: { id: string; zIndex: number }) => {
      await dbMaster.run('UPDATE whiteboard_objects SET z_index = ? WHERE id = ?', [
        payload.zIndex,
        payload.id,
      ]);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_BATCH_UPDATE_OBJECTS,
    async (_event, payload: { updates: WhiteboardObjectPatch[] } | WhiteboardObjectPatch[]) => {
      const updates = Array.isArray(payload) ? payload : payload.updates;
      const statements: DbStatement[] = [];

      for (const patch of updates) {
        const sets: string[] = [];
        const params: unknown[] = [];

        if (patch.posX !== undefined) {
          sets.push('pos_x = ?');
          params.push(patch.posX);
        }
        if (patch.posY !== undefined) {
          sets.push('pos_y = ?');
          params.push(patch.posY);
        }
        if (patch.width !== undefined) {
          sets.push('width = ?');
          params.push(patch.width);
        }
        if (patch.height !== undefined) {
          sets.push('height = ?');
          params.push(patch.height);
        }
        if (patch.zIndex !== undefined) {
          sets.push('z_index = ?');
          params.push(patch.zIndex);
        }
        if (patch.propertiesJson !== undefined) {
          sets.push('properties_json = ?');
          params.push(patch.propertiesJson);
        }
        if (sets.length > 0) {
          params.push(patch.id);
          statements.push({
            sql: `UPDATE whiteboard_objects SET ${sets.join(', ')} WHERE id = ?`,
            params,
          });
        }
      }

      if (statements.length > 0) {
        await dbMaster.execute(statements);
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_DELETE_OBJECT,
    async (_event, payload: { id: string } | string) => {
      const id = typeof payload === 'string' ? payload : payload.id;
      await dbMaster.execute([
        { sql: 'DELETE FROM whiteboard_objects WHERE id = ?', params: [id] },
        {
          sql: 'DELETE FROM connections WHERE source_object_id = ? OR target_object_id = ?',
          params: [id, id],
        },
      ]);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_BATCH_DELETE_OBJECTS,
    async (_event, payload: { ids: string[] } | string[]) => {
      const ids = Array.isArray(payload) ? payload : payload.ids;
      if (!ids || ids.length === 0) return;
      const statements: DbStatement[] = ids.flatMap((id) => [
        { sql: 'DELETE FROM whiteboard_objects WHERE id = ?', params: [id] },
        {
          sql: 'DELETE FROM connections WHERE source_object_id = ? OR target_object_id = ?',
          params: [id, id],
        },
      ]);
      await dbMaster.execute(statements);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_LIST_CONNECTIONS,
    async (_event, payload: { whiteboardId: string } | string) => {
      const whiteboardId = typeof payload === 'string' ? payload : payload.whiteboardId;
      return dbMaster.query<Connection>('SELECT * FROM connections WHERE whiteboard_id = ?', [
        whiteboardId,
      ]);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_CREATE_CONNECTION,
    async (_event, input: CreateConnectionInput) => {
      const id = input.id || `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const label = input.label ?? null;
      const styleJson = input.styleJson ?? '{}';

      await dbMaster.run(
        'INSERT INTO connections (id, whiteboard_id, source_object_id, target_object_id, label, style_json) VALUES (?, ?, ?, ?, ?, ?)',
        [id, input.whiteboardId, input.sourceObjectId, input.targetObjectId, label, styleJson]
      );

      return {
        id,
        whiteboard_id: input.whiteboardId,
        source_object_id: input.sourceObjectId,
        target_object_id: input.targetObjectId,
        label,
        style_json: styleJson,
      } satisfies Connection;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_UPDATE_CONNECTION,
    async (_event, payload: { id: string; patch: UpdateConnectionPatch }) => {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (payload.patch.label !== undefined) {
        sets.push('label = ?');
        params.push(payload.patch.label);
      }
      if (payload.patch.styleJson !== undefined) {
        sets.push('style_json = ?');
        params.push(payload.patch.styleJson);
      }
      if (sets.length === 0) return;
      params.push(payload.id);
      await dbMaster.run(`UPDATE connections SET ${sets.join(', ')} WHERE id = ?`, params);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_DELETE_CONNECTION,
    async (_event, payload: { id: string } | string) => {
      const id = typeof payload === 'string' ? payload : payload.id;
      await dbMaster.run('DELETE FROM connections WHERE id = ?', [id]);
    }
  );

  ipcMain.handle(IPC_CHANNELS.WHITEBOARDS_GET_STATS_MAP, async () => {
    return getWhiteboardStatsMap();
  });

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_LIST_IDS_BY_TARGET,
    async (_event, payload: { targetId: string } | string) => {
      const targetId = typeof payload === 'string' ? payload : payload.targetId;
      const rows = await dbMaster.query<{ whiteboard_id: string }>(
        'SELECT DISTINCT wo.whiteboard_id FROM whiteboard_objects wo JOIN whiteboards w ON w.id = wo.whiteboard_id WHERE wo.target_id = ? AND w.is_deleted = 0',
        [targetId]
      );
      return rows.map((r) => r.whiteboard_id);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_MOVE_OBJECTS_ACROSS,
    async (_event, input: MoveObjectsAcrossWhiteboardsInput) => {
      return moveObjectsAcrossWhiteboards(input);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.WHITEBOARDS_MOVE_HIERARCHY,
    async (_event, input: MoveWhiteboardHierarchyInput) => {
      return moveWhiteboardHierarchy(input);
    }
  );
}
