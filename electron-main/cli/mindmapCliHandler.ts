import type { BrowserWindow } from 'electron';
import {
  HEPTA_DEFAULT_DIMENSIONS,
  MindMapData,
  MindMapEdgeColor,
  MindMapLayout,
  MindMapNodeData,
  MindMapNodeSide,
  MindMapNodeType,
  WhiteboardObject,
} from '../../shared/types';
import { MINDMAP_DEFAULT_BRANCH_COLORS } from '../../shared/palette';
import { dbMaster } from '../database/dbMaster';

const MINDMAP_MAX_NODES = 300;
const VALID_COLORS = new Set<MindMapEdgeColor>([
  'blue',
  'green',
  'orange',
  'purple',
  'red',
  'yellow',
  'pink',
  'gray',
]);

interface LegacyMindmapItem {
  id: string;
  text: string;
  isExpanded?: boolean;
  children?: LegacyMindmapItem[];
}

export interface MindmapCliResponse {
  status: number;
  body: Record<string, unknown>;
}

function genNodeId(): string {
  return `mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createDefaultMindMap(title = 'Mind map', layout: MindMapLayout = 'horizontal'): MindMapData {
  const now = Date.now();
  const rootId = 'mm-root';
  const c1 = 'mm-branch-1';
  const c2 = 'mm-branch-2';
  const c1a = 'mm-branch-1-1';
  return {
    version: 2,
    layout,
    rootNodeId: rootId,
    lastEditedTime: now,
    nodes: [
      {
        id: rootId,
        type: 'textNode',
        parentId: null,
        childNodeIds: [c1, c2],
        side: null,
        edgeColor: 'blue',
        isCollapsed: false,
        content: title,
        lastEditedTime: now,
      },
      {
        id: c1,
        type: 'textNode',
        parentId: rootId,
        childNodeIds: [c1a],
        side: 'right',
        edgeColor: 'blue',
        isCollapsed: false,
        content: 'Branch 1',
        lastEditedTime: now,
      },
      {
        id: c1a,
        type: 'textNode',
        parentId: c1,
        childNodeIds: [],
        side: 'right',
        edgeColor: 'blue',
        isCollapsed: false,
        content: 'Sub-topic',
        lastEditedTime: now,
      },
      {
        id: c2,
        type: 'textNode',
        parentId: rootId,
        childNodeIds: [],
        side: 'left',
        edgeColor: 'green',
        isCollapsed: false,
        content: 'Branch 2',
        lastEditedTime: now,
      },
    ],
  };
}

function migrateLegacyTree(legacy: LegacyMindmapItem): MindMapData {
  const now = Date.now();
  const nodes: MindMapNodeData[] = [];
  const visit = (
    item: LegacyMindmapItem,
    parentId: string | null,
    side: MindMapNodeSide | null,
    edgeColor: MindMapEdgeColor
  ): string => {
    const id = item.id || genNodeId();
    const children = Array.isArray(item.children) ? item.children : [];
    const childIds: string[] = [];
    nodes.push({
      id,
      type: 'textNode',
      parentId,
      childNodeIds: childIds,
      side,
      edgeColor,
      isCollapsed: item.isExpanded === false,
      content: item.text || 'Topic',
      lastEditedTime: now,
    });
    children.forEach((child, idx) => {
      const childSide: MindMapNodeSide =
        parentId === null ? (idx % 2 === 0 ? 'right' : 'left') : side ?? 'right';
      const childColor: MindMapEdgeColor =
        parentId === null
          ? MINDMAP_DEFAULT_BRANCH_COLORS[idx % MINDMAP_DEFAULT_BRANCH_COLORS.length]
          : edgeColor;
      childIds.push(visit(child, id, childSide, childColor));
    });
    return id;
  };
  const rootId = visit(legacy, null, null, 'blue');
  return {
    version: 2,
    layout: 'horizontal',
    rootNodeId: rootId,
    nodes,
    lastEditedTime: now,
  };
}

function parsePropsJson(raw?: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseMindMapFromObject(obj: WhiteboardObject): MindMapData {
  const props = parsePropsJson(obj.properties_json);
  const v2 = props.mindMapV2 as MindMapData | undefined;
  if (v2 && v2.version === 2 && Array.isArray(v2.nodes) && v2.nodes.length > 0) {
    return v2;
  }
  const legacy = props.mindmap as LegacyMindmapItem | undefined;
  if (legacy && typeof legacy === 'object') {
    return migrateLegacyTree(legacy);
  }
  return createDefaultMindMap();
}

function collectSubtree(nodeMap: Map<string, MindMapNodeData>, rootId: string): string[] {
  const result: string[] = [];
  const queue = [rootId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const node = nodeMap.get(cur);
    if (!node) continue;
    result.push(cur);
    for (const cid of node.childNodeIds) {
      if (!visited.has(cid)) queue.push(cid);
    }
  }
  return result;
}

function pickBalancedSide(
  nodeMap: Map<string, MindMapNodeData>,
  root: MindMapNodeData
): MindMapNodeSide {
  let rightCount = 0;
  let leftCount = 0;
  for (const cid of root.childNodeIds) {
    const child = nodeMap.get(cid);
    if (!child) continue;
    if (child.side === 'left') leftCount += 1;
    else rightCount += 1;
  }
  return rightCount <= leftCount ? 'right' : 'left';
}

async function getActiveWhiteboardId(win: BrowserWindow): Promise<string | null> {
  const wbId = (await win.webContents.executeJavaScript(
    `(() => {
      const el = document.querySelector('[data-whiteboard-id]');
      return el ? el.getAttribute('data-whiteboard-id') : null;
    })()`,
    true
  )) as string | null;
  if (wbId) return wbId;
  const rows = await dbMaster.query<{ id: string }>(
    'SELECT id FROM whiteboards WHERE is_deleted = 0 ORDER BY updated_at DESC LIMIT 1'
  );
  return rows[0]?.id ?? null;
}

async function notifyRendererRefresh(win: BrowserWindow): Promise<void> {
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new CustomEvent('openhepta:whiteboards-changed'));`,
    true
  );
  await new Promise((r) => setTimeout(r, 180));
}

async function listMindmapObjects(whiteboardId: string): Promise<WhiteboardObject[]> {
  return dbMaster.query<WhiteboardObject>(
    `SELECT * FROM whiteboard_objects WHERE whiteboard_id = ? AND object_type = 'mindmap_node' ORDER BY rowid DESC`,
    [whiteboardId]
  );
}

async function resolveTargetMindmapObject(
  whiteboardId: string,
  mindmapId?: string
): Promise<WhiteboardObject | null> {
  if (mindmapId) {
    const rows = await dbMaster.query<WhiteboardObject>(
      `SELECT * FROM whiteboard_objects WHERE id = ? AND object_type = 'mindmap_node' LIMIT 1`,
      [mindmapId]
    );
    return rows[0] ?? null;
  }
  const all = await listMindmapObjects(whiteboardId);
  return all[0] ?? null;
}

async function saveMindMapObject(obj: WhiteboardObject, nextData: MindMapData): Promise<void> {
  const existing = parsePropsJson(obj.properties_json);
  const nextJson = JSON.stringify({ ...existing, mindMapV2: nextData });
  await dbMaster.execute([
    {
      sql: `UPDATE whiteboard_objects SET properties_json = ? WHERE id = ?`,
      params: [nextJson, obj.id],
    },
  ]);
}

export async function handleMindmapList(win: BrowserWindow): Promise<MindmapCliResponse> {
  const whiteboardId = await getActiveWhiteboardId(win);
  if (!whiteboardId) {
    return { status: 404, body: { ok: false, error: 'No active whiteboard found.' } };
  }
  const rows = await listMindmapObjects(whiteboardId);
  const mindmaps = rows.map((obj) => {
    const data = parseMindMapFromObject(obj);
    return {
      objectId: obj.id,
      whiteboardId: obj.whiteboard_id,
      posX: obj.pos_x,
      posY: obj.pos_y,
      layout: data.layout,
      rootNodeId: data.rootNodeId,
      nodeCount: data.nodes.length,
      nodes: data.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        parentId: n.parentId,
        childNodeIds: n.childNodeIds,
        side: n.side,
        edgeColor: n.edgeColor,
        isCollapsed: n.isCollapsed,
        content: n.content,
        cardId: n.cardId ?? null,
        highlightId: n.highlightId ?? null,
      })),
    };
  });
  return {
    status: 200,
    body: { ok: true, whiteboardId, count: mindmaps.length, mindmaps },
  };
}

export async function handleMindmapAction(
  win: BrowserWindow,
  body: Record<string, unknown>
): Promise<MindmapCliResponse> {
  const action = typeof body.action === 'string' ? body.action.trim() : '';
  const whiteboardId = await getActiveWhiteboardId(win);
  if (!whiteboardId) {
    return { status: 404, body: { ok: false, error: 'No active whiteboard found.' } };
  }

  if (action === 'create') {
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Mind map';
    const layout: MindMapLayout = body.layout === 'vertical' ? 'vertical' : 'horizontal';
    const now = Date.now();
    const objId = `wbo-mm-${now}`;
    const dim = HEPTA_DEFAULT_DIMENSIONS.mindmap_node;
    const posX = typeof body.x === 'number' && Number.isFinite(body.x) ? body.x : 160;
    const posY = typeof body.y === 'number' && Number.isFinite(body.y) ? body.y : 160;
    const data = createDefaultMindMap(title, layout);
    const propsJson = JSON.stringify({ mindMapV2: data });

    await dbMaster.execute([
      {
        sql: `INSERT INTO whiteboard_objects (id, whiteboard_id, object_type, target_id, pos_x, pos_y, width, height, z_index, properties_json)
       VALUES (?, ?, 'mindmap_node', NULL, ?, ?, ?, ?, 15, ?)`,
        params: [objId, whiteboardId, posX, posY, dim.width, dim.height, propsJson],
      },
    ]);
    await notifyRendererRefresh(win);
    return {
      status: 200,
      body: {
        ok: true,
        action,
        objectId: objId,
        whiteboardId,
        layout: data.layout,
        rootNodeId: data.rootNodeId,
        nodeCount: data.nodes.length,
      },
    };
  }

  const mindmapId = typeof body.mindmapId === 'string' && body.mindmapId.trim() ? body.mindmapId.trim() : undefined;
  const targetObj = await resolveTargetMindmapObject(whiteboardId, mindmapId);
  if (!targetObj) {
    return {
      status: 404,
      body: { ok: false, error: mindmapId ? `Mindmap not found: ${mindmapId}` : 'No mindmap on active whiteboard.' },
    };
  }

  if (action === 'delete') {
    await dbMaster.execute([
      {
        sql: `DELETE FROM whiteboard_objects WHERE id = ?`,
        params: [targetObj.id],
      },
    ]);
    await notifyRendererRefresh(win);
    return { status: 200, body: { ok: true, action, deletedObjectId: targetObj.id } };
  }

  if (action === 'select-node') {
    const nodeId = typeof body.nodeId === 'string' && body.nodeId.trim() ? body.nodeId.trim() : '';
    const data = parseMindMapFromObject(targetObj);
    const resolvedNodeId = nodeId || data.rootNodeId;
    const found = (await win.webContents.executeJavaScript(
      `(() => {
        const root = document.querySelector('[data-object-id=${JSON.stringify(targetObj.id)}]');
        if (!root) return { found: false };
        const el = root.querySelector('[data-mindmap-node-id=${JSON.stringify(resolvedNodeId)}]');
        if (!el) return { found: false };
        const rect = el.getBoundingClientRect();
        return {
          found: rect.width > 0 && rect.height > 0,
          cx: Math.round(rect.left + rect.width / 2),
          cy: Math.round(rect.top + rect.height / 2),
          rect: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
        };
      })()`,
      true
    )) as { found: boolean; cx?: number; cy?: number; rect?: Record<string, number> };

    if (!found.found || typeof found.cx !== 'number' || typeof found.cy !== 'number') {
      return {
        status: 404,
        body: { ok: false, error: `Mindmap node not visible in viewport: ${resolvedNodeId}` },
      };
    }
    win.focus();
    win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'mouseMove', x: found.cx, y: found.cy });
    win.webContents.sendInputEvent({ type: 'mouseDown', x: found.cx, y: found.cy, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: found.cx, y: found.cy, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 150));
    return {
      status: 200,
      body: { ok: true, action, objectId: targetObj.id, nodeId: resolvedNodeId, rect: found.rect },
    };
  }

  const data = parseMindMapFromObject(targetObj);
  const now = Date.now();
  const nodeMap = new Map<string, MindMapNodeData>(
    data.nodes.map((n) => [n.id, { ...n, childNodeIds: [...n.childNodeIds] }])
  );

  if (action === 'set-layout') {
    const layout: MindMapLayout = body.layout === 'vertical' ? 'vertical' : 'horizontal';
    const nextData: MindMapData = { ...data, layout, lastEditedTime: now };
    await saveMindMapObject(targetObj, nextData);
    await notifyRendererRefresh(win);
    return { status: 200, body: { ok: true, action, objectId: targetObj.id, layout } };
  }

  if (action === 'add-node') {
    if (nodeMap.size >= MINDMAP_MAX_NODES) {
      return { status: 400, body: { ok: false, error: 'tooManyNodes' } };
    }
    const parentId =
      typeof body.parentId === 'string' && body.parentId.trim()
        ? body.parentId.trim()
        : data.rootNodeId;
    const parent = nodeMap.get(parentId);
    if (!parent) {
      return { status: 404, body: { ok: false, error: `Parent node not found: ${parentId}` } };
    }
    const newId = genNodeId();
    const rawSide = body.side === 'left' || body.side === 'right' ? body.side : null;
    const side: MindMapNodeSide =
      parent.parentId === null ? rawSide ?? pickBalancedSide(nodeMap, parent) : parent.side ?? 'right';
    const rawColor =
      typeof body.color === 'string' && VALID_COLORS.has(body.color as MindMapEdgeColor)
        ? (body.color as MindMapEdgeColor)
        : null;
    const edgeColor: MindMapEdgeColor =
      rawColor ??
      (parent.parentId === null
        ? MINDMAP_DEFAULT_BRANCH_COLORS[parent.childNodeIds.length % MINDMAP_DEFAULT_BRANCH_COLORS.length]
        : parent.edgeColor);
    const nodeType: MindMapNodeType =
      body.nodeType === 'cardNode' ||
      body.nodeType === 'highlightElementNode' ||
      body.nodeType === 'textElementNode'
        ? body.nodeType
        : 'textNode';
    const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : 'New topic';
    const cardId = typeof body.cardId === 'string' && body.cardId.trim() ? body.cardId.trim() : null;
    const highlightId =
      typeof body.highlightId === 'string' && body.highlightId.trim() ? body.highlightId.trim() : null;

    const newNode: MindMapNodeData = {
      id: newId,
      type: nodeType,
      parentId: parent.id,
      childNodeIds: [],
      side,
      edgeColor,
      isCollapsed: false,
      content: text,
      cardId,
      highlightId,
      lastEditedTime: now,
    };
    nodeMap.set(newId, newNode);
    nodeMap.set(parent.id, {
      ...parent,
      isCollapsed: false,
      childNodeIds: [...parent.childNodeIds, newId],
      lastEditedTime: now,
    });
    const nextData: MindMapData = {
      ...data,
      nodes: Array.from(nodeMap.values()),
      lastEditedTime: now,
    };
    await saveMindMapObject(targetObj, nextData);
    await notifyRendererRefresh(win);
    return {
      status: 200,
      body: {
        ok: true,
        action,
        objectId: targetObj.id,
        node: newNode,
        nodeCount: nextData.nodes.length,
      },
    };
  }

  const nodeId = typeof body.nodeId === 'string' ? body.nodeId.trim() : '';
  const targetNode = nodeId ? nodeMap.get(nodeId) : undefined;
  if (!targetNode) {
    return { status: 404, body: { ok: false, error: `Node not found: ${nodeId || '(missing --node-id)'}` } };
  }

  if (action === 'edit-node') {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return { status: 400, body: { ok: false, error: 'Missing --text' } };
    }
    nodeMap.set(targetNode.id, { ...targetNode, content: text, lastEditedTime: now });
    const nextData: MindMapData = { ...data, nodes: Array.from(nodeMap.values()), lastEditedTime: now };
    await saveMindMapObject(targetObj, nextData);
    await notifyRendererRefresh(win);
    return { status: 200, body: { ok: true, action, objectId: targetObj.id, nodeId: targetNode.id, content: text } };
  }

  if (action === 'collapse' || action === 'expand') {
    const isCollapsed = action === 'collapse';
    nodeMap.set(targetNode.id, { ...targetNode, isCollapsed, lastEditedTime: now });
    const nextData: MindMapData = { ...data, nodes: Array.from(nodeMap.values()), lastEditedTime: now };
    await saveMindMapObject(targetObj, nextData);
    await notifyRendererRefresh(win);
    return { status: 200, body: { ok: true, action, objectId: targetObj.id, nodeId: targetNode.id, isCollapsed } };
  }

  if (action === 'set-color') {
    if (targetNode.parentId === null) {
      return { status: 400, body: { ok: false, error: 'rootMutationNotAllowed' } };
    }
    const color =
      typeof body.color === 'string' && VALID_COLORS.has(body.color as MindMapEdgeColor)
        ? (body.color as MindMapEdgeColor)
        : null;
    if (!color) {
      return { status: 400, body: { ok: false, error: 'Invalid --color (blue|green|orange|purple|red|yellow|pink|gray)' } };
    }
    const subtree = collectSubtree(nodeMap, targetNode.id);
    for (const sid of subtree) {
      const sub = nodeMap.get(sid)!;
      nodeMap.set(sid, { ...sub, edgeColor: color, lastEditedTime: now });
    }
    const nextData: MindMapData = { ...data, nodes: Array.from(nodeMap.values()), lastEditedTime: now };
    await saveMindMapObject(targetObj, nextData);
    await notifyRendererRefresh(win);
    return {
      status: 200,
      body: { ok: true, action, objectId: targetObj.id, nodeId: targetNode.id, color, updatedCount: subtree.length },
    };
  }

  if (action === 'move-node') {
    if (targetNode.parentId === null) {
      return { status: 400, body: { ok: false, error: 'rootMutationNotAllowed' } };
    }
    const newParentId = typeof body.parentId === 'string' ? body.parentId.trim() : '';
    const newParent = newParentId ? nodeMap.get(newParentId) : undefined;
    if (!newParent) {
      return { status: 404, body: { ok: false, error: `New parent node not found: ${newParentId}` } };
    }
    const subtree = collectSubtree(nodeMap, targetNode.id);
    if (subtree.includes(newParent.id)) {
      return { status: 400, body: { ok: false, error: 'cyclicStructure' } };
    }
    const oldParent = nodeMap.get(targetNode.parentId);
    if (oldParent) {
      nodeMap.set(oldParent.id, {
        ...oldParent,
        childNodeIds: oldParent.childNodeIds.filter((cid) => cid !== targetNode.id),
        lastEditedTime: now,
      });
    }
    const refreshedNewParent = nodeMap.get(newParent.id)!;
    nodeMap.set(refreshedNewParent.id, {
      ...refreshedNewParent,
      isCollapsed: false,
      childNodeIds: [...refreshedNewParent.childNodeIds.filter((cid) => cid !== targetNode.id), targetNode.id],
      lastEditedTime: now,
    });
    const rawSide = body.side === 'left' || body.side === 'right' ? body.side : null;
    const resolvedSide: MindMapNodeSide =
      refreshedNewParent.parentId === null
        ? rawSide ?? targetNode.side ?? pickBalancedSide(nodeMap, refreshedNewParent)
        : refreshedNewParent.side ?? 'right';
    const resolvedColor: MindMapEdgeColor =
      refreshedNewParent.parentId === null ? targetNode.edgeColor : refreshedNewParent.edgeColor;
    for (const sid of subtree) {
      const sub = nodeMap.get(sid)!;
      nodeMap.set(sid, {
        ...sub,
        parentId: sid === targetNode.id ? refreshedNewParent.id : sub.parentId,
        side: resolvedSide,
        edgeColor: resolvedColor,
        lastEditedTime: now,
      });
    }
    const nextData: MindMapData = { ...data, nodes: Array.from(nodeMap.values()), lastEditedTime: now };
    await saveMindMapObject(targetObj, nextData);
    await notifyRendererRefresh(win);
    return {
      status: 200,
      body: {
        ok: true,
        action,
        objectId: targetObj.id,
        nodeId: targetNode.id,
        newParentId: refreshedNewParent.id,
        side: resolvedSide,
      },
    };
  }

  if (action === 'delete-node') {
    if (targetNode.parentId === null) {
      return { status: 400, body: { ok: false, error: 'rootMutationNotAllowed' } };
    }
    const parent = nodeMap.get(targetNode.parentId);
    if (parent) {
      nodeMap.set(parent.id, {
        ...parent,
        childNodeIds: parent.childNodeIds.filter((cid) => cid !== targetNode.id),
        lastEditedTime: now,
      });
    }
    const subtree = collectSubtree(nodeMap, targetNode.id);
    for (const sid of subtree) {
      nodeMap.delete(sid);
    }
    const nextData: MindMapData = { ...data, nodes: Array.from(nodeMap.values()), lastEditedTime: now };
    await saveMindMapObject(targetObj, nextData);
    await notifyRendererRefresh(win);
    return {
      status: 200,
      body: {
        ok: true,
        action,
        objectId: targetObj.id,
        deletedNodeIds: subtree,
        nodeCount: nextData.nodes.length,
      },
    };
  }

  return { status: 400, body: { ok: false, error: `Unknown mindmap action: ${action}` } };
}
