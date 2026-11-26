import type {
  MindMapData,
  MindMapEdgeColor,
  MindMapLayout,
  MindMapNodeData,
  MindMapNodeSide,
  MindMapNodeType,
  MindMapResolvedSide,
} from '@shared/types';
import { MINDMAP_DEFAULT_BRANCH_COLORS } from '@shared/palette';

export const MINDMAP_LEVEL_GAP = 100;
export const MINDMAP_SIBLING_GAP = 24;
export const MINDMAP_MAX_NODES = 300;
export const MINDMAP_PADDING = 48;

export interface MindMapNodeDimensions {
  width: number;
  height: number;
}

export interface MindMapPositionedNode {
  id: string;
  node: MindMapNodeData;
  x: number;
  y: number;
  width: number;
  height: number;
  resolvedSide: MindMapResolvedSide | null;
  hiddenDescendantCount: number;
}

export interface MindMapLayoutEdge {
  id: string;
  parentId: string;
  childId: string;
  edgeColor: MindMapEdgeColor;
  path: string;
}

export interface MindMapLayoutResult {
  layout: MindMapLayout;
  nodes: MindMapPositionedNode[];
  nodeMap: Map<string, MindMapPositionedNode>;
  edges: MindMapLayoutEdge[];
  totalWidth: number;
  totalHeight: number;
}

export type MindMapOperation =
  | {
      operation: 'addNode';
      parentId: string;
      side?: MindMapNodeSide | null;
      insertionIndex?: number;
      nodeType?: MindMapNodeType;
      content?: string;
      cardId?: string | null;
      highlightId?: string | null;
      sourceObjectId?: string | null;
      edgeColor?: MindMapEdgeColor;
      id?: string;
    }
  | {
      operation: 'moveNode';
      targetId: string;
      newParentId: string;
      side?: MindMapNodeSide | null;
      insertionIndex?: number;
    }
  | {
      operation: 'deleteSubtree';
      targetId: string;
    }
  | {
      operation: 'updateTextNode';
      targetId: string;
      content: string;
    }
  | {
      operation: 'convertNode';
      targetId: string;
      nodeType: MindMapNodeType;
      content?: string;
      cardId?: string | null;
      highlightId?: string | null;
    }
  | {
      operation: 'setCollapsed';
      targetId: string;
      isCollapsed: boolean;
    }
  | {
      operation: 'setEdgeColor';
      targetId: string;
      edgeColor: MindMapEdgeColor;
    }
  | {
      operation: 'setLayout';
      layout: MindMapLayout;
    };

export interface MindMapOperationResult {
  status: 'ok' | 'failed';
  data: MindMapData;
  createdNodeId?: string;
  failureReasonCode?:
    | 'rootMutationNotAllowed'
    | 'cyclicStructure'
    | 'nodeNotFound'
    | 'tooManyNodes';
}

interface LegacyMindmapItem {
  id: string;
  text: string;
  isExpanded?: boolean;
  children?: LegacyMindmapItem[];
}

export function generateMindMapNodeId(): string {
  return `mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function resolveMindMapSide(
  layout: MindMapLayout,
  side: MindMapNodeSide | null
): MindMapResolvedSide | null {
  if (side == null) return null;
  if (layout === 'horizontal') return side;
  return side === 'left' ? 'top' : 'bottom';
}

export function createDefaultMindMapData(): MindMapData {
  const now = Date.now();
  const rootId = 'mm-root';
  const c1 = 'mm-branch-1';
  const c2 = 'mm-branch-2';
  const c1a = 'mm-branch-1-1';
  return {
    version: 2,
    layout: 'horizontal',
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
        content: 'Mind map',
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
    const id = item.id || generateMindMapNodeId();
    const children = Array.isArray(item.children) ? item.children : [];
    const childIds: string[] = [];

    const node: MindMapNodeData = {
      id,
      type: 'textNode',
      parentId,
      childNodeIds: childIds,
      side,
      edgeColor,
      isCollapsed: item.isExpanded === false,
      content: item.text || 'Topic',
      lastEditedTime: now,
    };
    nodes.push(node);

    children.forEach((child, idx) => {
      const childSide: MindMapNodeSide =
        parentId === null ? (idx % 2 === 0 ? 'right' : 'left') : side ?? 'right';
      const childColor: MindMapEdgeColor =
        parentId === null
          ? MINDMAP_DEFAULT_BRANCH_COLORS[idx % MINDMAP_DEFAULT_BRANCH_COLORS.length]
          : edgeColor;
      const cid = visit(child, id, childSide, childColor);
      childIds.push(cid);
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

export function parseOrMigrateMindMapData(propertiesJson?: string | null): MindMapData {
  if (!propertiesJson) return createDefaultMindMapData();
  try {
    const parsed = JSON.parse(propertiesJson) as {
      mindMapV2?: MindMapData;
      mindmap?: LegacyMindmapItem;
    };
    if (
      parsed.mindMapV2 &&
      parsed.mindMapV2.version === 2 &&
      Array.isArray(parsed.mindMapV2.nodes) &&
      parsed.mindMapV2.nodes.length > 0
    ) {
      return parsed.mindMapV2;
    }
    if (parsed.mindmap && typeof parsed.mindmap === 'object') {
      return migrateLegacyTree(parsed.mindmap);
    }
  } catch {
    return createDefaultMindMapData();
  }
  return createDefaultMindMapData();
}

export function collectSubtreeIds(
  nodeMap: Map<string, MindMapNodeData>,
  rootId: string
): string[] {
  const result: string[] = [];
  const queue: string[] = [rootId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const node = nodeMap.get(currentId);
    if (!node) continue;
    result.push(currentId);
    for (const cid of node.childNodeIds) {
      if (!visited.has(cid)) queue.push(cid);
    }
  }
  return result;
}

export function estimateMindMapNodeDimensions(
  node: MindMapNodeData,
  isRoot: boolean
): MindMapNodeDimensions {
  if (node.type === 'cardNode') {
    return {
      width: node.width ?? 240,
      height: node.height ?? 108,
    };
  }
  if (node.type === 'highlightElementNode') {
    return {
      width: node.width ?? 240,
      height: node.height ?? 86,
    };
  }
  const text = (node.content || '').trim();
  const charUnits = Array.from(text).reduce(
    (sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 1.7 : 1),
    0
  );
  const minW = isRoot ? 156 : 120;
  const maxW = 240;
  const computedW = Math.min(maxW, Math.max(minW, Math.ceil(charUnits * 8.2) + 40));
  const charsPerLine = Math.max(12, Math.floor((computedW - 32) / 8.2));
  const lines = Math.max(1, Math.ceil(Math.max(1, charUnits) / charsPerLine));
  const baseH = isRoot ? 46 : 38;
  const computedH = baseH + (lines - 1) * 20;
  return {
    width: node.width ?? computedW,
    height: node.height ?? computedH,
  };
}

export function getMindMapEdgePath(
  parent: MindMapPositionedNode,
  child: MindMapPositionedNode,
  layout: MindMapLayout
): string {
  if (layout === 'vertical') {
    const isTop = child.resolvedSide === 'top';
    const x1 = parent.x + parent.width / 2;
    const y1 = isTop ? parent.y : parent.y + parent.height;
    const x2 = child.x + child.width / 2;
    const y2 = isTop ? child.y + child.height : child.y;
    const dy = (y2 - y1) * 0.5;
    return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
  }

  const isLeft = child.resolvedSide === 'left';
  const x1 = isLeft ? parent.x : parent.x + parent.width;
  const y1 = parent.y + parent.height / 2;
  const x2 = isLeft ? child.x + child.width : child.x;
  const y2 = child.y + child.height / 2;
  const dx = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

interface LayoutWorkNode {
  id: string;
  parentId: string | null;
  width: number;
  height: number;
  rawWidth: number;
  rawHeight: number;
  side: MindMapResolvedSide | null;
  childNodeIds: string[];
  x: number;
  y: number;
  startX: number;
  startY: number;
  totalWidth: number;
  totalHeight: number;
}

export function computeMindMapLayout(
  data: MindMapData,
  measuredSizes?: Map<string, MindMapNodeDimensions>
): MindMapLayoutResult {
  const allNodeMap = new Map<string, MindMapNodeData>(data.nodes.map((n) => [n.id, n]));
  const root = allNodeMap.get(data.rootNodeId) ?? data.nodes.find((n) => n.parentId === null);

  if (!root) {
    return {
      layout: data.layout,
      nodes: [],
      nodeMap: new Map(),
      edges: [],
      totalWidth: 320,
      totalHeight: 160,
    };
  }

  const visibleIds = new Set<string>();
  const hiddenDescendantCountMap = new Map<string, number>();

  const walkVisible = (nodeId: string) => {
    const node = allNodeMap.get(nodeId);
    if (!node) return;
    visibleIds.add(nodeId);
    if (node.isCollapsed && node.childNodeIds.length > 0) {
      const subtree = collectSubtreeIds(allNodeMap, nodeId);
      hiddenDescendantCountMap.set(nodeId, Math.max(0, subtree.length - 1));
      return;
    }
    hiddenDescendantCountMap.set(nodeId, 0);
    for (const cid of node.childNodeIds) {
      walkVisible(cid);
    }
  };
  walkVisible(root.id);

  const isVertical = data.layout === 'vertical';

  const coordsById = new Map<string, { x: number; y: number }>();
  const rawDimById = new Map<string, MindMapNodeDimensions>();
  const resolvedSideById = new Map<string, MindMapResolvedSide | null>();

  for (const id of visibleIds) {
    const node = allNodeMap.get(id)!;
    const dim = measuredSizes?.get(id) ?? estimateMindMapNodeDimensions(node, id === root.id);
    rawDimById.set(id, dim);
    resolvedSideById.set(id, resolveMindMapSide(data.layout, node.side));
    coordsById.set(id, { x: 0, y: 0 });
  }

  const layoutOneSide = (targetSide: MindMapResolvedSide) => {
    const workMap = new Map<string, LayoutWorkNode>();

    for (const id of visibleIds) {
      const node = allNodeMap.get(id)!;
      const rSide = resolvedSideById.get(id) ?? null;
      if (rSide !== null && rSide !== targetSide) continue;
      const dim = rawDimById.get(id)!;
      const visibleChildren = node.isCollapsed
        ? []
        : node.childNodeIds.filter((cid) => {
            if (!visibleIds.has(cid)) return false;
            const cSide = resolvedSideById.get(cid);
            return cSide === targetSide;
          });

      workMap.set(id, {
        id,
        parentId: node.parentId,
        rawWidth: dim.width,
        rawHeight: dim.height,
        width: isVertical ? dim.width + MINDMAP_SIBLING_GAP : dim.width,
        height: isVertical ? dim.height : dim.height + MINDMAP_SIBLING_GAP,
        side: rSide,
        childNodeIds: visibleChildren,
        x: 0,
        y: 0,
        startX: 0,
        startY: 0,
        totalWidth: 0,
        totalHeight: 0,
      });
    }

    const workRoot = workMap.get(root.id);
    if (!workRoot) return;

    const bfs = (startId: string, fn: (n: LayoutWorkNode) => void) => {
      const q: string[] = [startId];
      while (q.length > 0) {
        const cur = workMap.get(q.shift()!);
        if (!cur) continue;
        fn(cur);
        for (const cid of cur.childNodeIds) q.push(cid);
      }
    };

    const dfs = (startId: string, fn: (n: LayoutWorkNode) => void) => {
      const stack: string[] = [startId];
      while (stack.length > 0) {
        const cur = workMap.get(stack.pop()!);
        if (!cur) continue;
        fn(cur);
        for (let i = cur.childNodeIds.length - 1; i >= 0; i -= 1) {
          stack.push(cur.childNodeIds[i]);
        }
      }
    };

    if (isVertical) {
      bfs(workRoot.id, (n) => {
        if (n.parentId == null) return;
        const p = workMap.get(n.parentId);
        if (p) n.y = p.y + p.height + MINDMAP_LEVEL_GAP;
      });

      const calcWidth = (n: LayoutWorkNode): number => {
        let sum = 0;
        if (n.childNodeIds.length === 0) {
          sum = n.width;
        } else {
          for (const cid of n.childNodeIds) {
            const c = workMap.get(cid);
            if (c) sum += calcWidth(c);
          }
        }
        n.totalWidth = Math.max(n.width, sum);
        return n.totalWidth;
      };
      calcWidth(workRoot);

      dfs(workRoot.id, (n) => {
        const children = n.childNodeIds
          .map((cid) => workMap.get(cid))
          .filter((c): c is LayoutWorkNode => Boolean(c));
        if (children.length === 0) return;
        const first = children[0];
        first.startX = n.startX;
        if (children.length === 1) {
          first.x = n.x + n.width / 2 - first.width / 2;
        } else {
          first.x = first.startX + first.totalWidth / 2 - first.width / 2;
          for (let i = 1; i < children.length; i += 1) {
            const cur = children[i];
            const prev = children[i - 1];
            cur.startX = prev.startX + prev.totalWidth;
            cur.x = cur.startX + cur.totalWidth / 2 - cur.width / 2;
          }
        }
      });

      const centerParent = (n: LayoutWorkNode) => {
        const children = n.childNodeIds
          .map((cid) => workMap.get(cid))
          .filter((c): c is LayoutWorkNode => Boolean(c));
        if (children.length === 0) return;
        children.forEach(centerParent);
        const first = children[0];
        const last = children[children.length - 1];
        const span = last.x - first.x + last.width;
        const total = children.reduce((acc, c) => acc + c.totalWidth, 0);
        if (span > n.width) {
          n.x = first.x + span / 2 - n.width / 2;
        } else if (children.length !== 1 || n.width > total) {
          const shift = n.x + (n.width - span) / 2 - first.x;
          children.forEach((c) => {
            dfs(c.id, (sub) => {
              sub.x += shift;
            });
          });
        } else {
          n.x = (first.x + first.width / 2 + last.x + last.width / 2) / 2 - n.width / 2;
        }
      };
      centerParent(workRoot);

      const offsetX = -workRoot.x - workRoot.rawWidth / 2;
      const offsetY = -workRoot.rawHeight / 2;
      dfs(workRoot.id, (n) => {
        const finalX = n.x + offsetX + (n.id === workRoot.id ? 0 : MINDMAP_SIBLING_GAP / 2);
        const finalY =
          n.side === 'top' ? -(n.y + offsetY + n.rawHeight) : n.y + offsetY;
        coordsById.set(n.id, { x: finalX, y: finalY });
      });
    } else {
      bfs(workRoot.id, (n) => {
        if (n.parentId == null) return;
        const p = workMap.get(n.parentId);
        if (p) n.x = p.x + p.width + MINDMAP_LEVEL_GAP;
      });

      const calcHeight = (n: LayoutWorkNode): number => {
        let sum = 0;
        if (n.childNodeIds.length === 0) {
          sum = n.height;
        } else {
          for (const cid of n.childNodeIds) {
            const c = workMap.get(cid);
            if (c) sum += calcHeight(c);
          }
        }
        n.totalHeight = Math.max(n.height, sum);
        return n.totalHeight;
      };
      calcHeight(workRoot);

      dfs(workRoot.id, (n) => {
        const children = n.childNodeIds
          .map((cid) => workMap.get(cid))
          .filter((c): c is LayoutWorkNode => Boolean(c));
        if (children.length === 0) return;
        const first = children[0];
        first.startY = n.startY;
        if (children.length === 1) {
          first.y = n.y + n.height / 2 - first.height / 2;
        } else {
          first.y = first.startY + first.totalHeight / 2 - first.height / 2;
          for (let i = 1; i < children.length; i += 1) {
            const cur = children[i];
            const prev = children[i - 1];
            cur.startY = prev.startY + prev.totalHeight;
            cur.y = cur.startY + cur.totalHeight / 2 - cur.height / 2;
          }
        }
      });

      const centerParent = (n: LayoutWorkNode) => {
        const children = n.childNodeIds
          .map((cid) => workMap.get(cid))
          .filter((c): c is LayoutWorkNode => Boolean(c));
        if (children.length === 0) return;
        children.forEach(centerParent);
        const first = children[0];
        const last = children[children.length - 1];
        const span = last.y - first.y + last.height;
        const total = children.reduce((acc, c) => acc + c.totalHeight, 0);
        if (span > n.height) {
          n.y = first.y + span / 2 - n.height / 2;
        } else if (children.length !== 1 || n.height > total) {
          const shift = n.y + (n.height - span) / 2 - first.y;
          children.forEach((c) => {
            dfs(c.id, (sub) => {
              sub.y += shift;
            });
          });
        } else {
          n.y = (first.y + first.height / 2 + last.y + last.height / 2) / 2 - n.height / 2;
        }
      };
      centerParent(workRoot);

      const offsetY = -workRoot.y - workRoot.rawHeight / 2;
      const offsetX = -workRoot.rawWidth / 2;
      dfs(workRoot.id, (n) => {
        const finalY = n.y + offsetY + (n.id === workRoot.id ? 0 : MINDMAP_SIBLING_GAP / 2);
        const finalX =
          n.side === 'left' ? -(n.x + offsetX + n.rawWidth) : n.x + offsetX;
        coordsById.set(n.id, { x: finalX, y: finalY });
      });
    }
  };

  if (isVertical) {
    layoutOneSide('top');
    layoutOneSide('bottom');
  } else {
    layoutOneSide('left');
    layoutOneSide('right');
  }

  const rootDim = rawDimById.get(root.id)!;
  coordsById.set(root.id, { x: -rootDim.width / 2, y: -rootDim.height / 2 });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of visibleIds) {
    const pt = coordsById.get(id)!;
    const dim = rawDimById.get(id)!;
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x + dim.width);
    maxY = Math.max(maxY, pt.y + dim.height);
  }

  const shiftX = MINDMAP_PADDING - minX;
  const shiftY = MINDMAP_PADDING - minY;

  const positionedNodes: MindMapPositionedNode[] = [];
  const positionedMap = new Map<string, MindMapPositionedNode>();

  for (const id of visibleIds) {
    const node = allNodeMap.get(id)!;
    const pt = coordsById.get(id)!;
    const dim = rawDimById.get(id)!;
    const item: MindMapPositionedNode = {
      id,
      node,
      x: pt.x + shiftX,
      y: pt.y + shiftY,
      width: dim.width,
      height: dim.height,
      resolvedSide: resolvedSideById.get(id) ?? null,
      hiddenDescendantCount: hiddenDescendantCountMap.get(id) ?? 0,
    };
    positionedNodes.push(item);
    positionedMap.set(id, item);
  }

  const edges: MindMapLayoutEdge[] = [];
  for (const childBox of positionedNodes) {
    if (!childBox.node.parentId) continue;
    const parentBox = positionedMap.get(childBox.node.parentId);
    if (!parentBox) continue;
    edges.push({
      id: `${parentBox.id}->${childBox.id}`,
      parentId: parentBox.id,
      childId: childBox.id,
      edgeColor: childBox.node.edgeColor,
      path: getMindMapEdgePath(parentBox, childBox, data.layout),
    });
  }

  return {
    layout: data.layout,
    nodes: positionedNodes,
    nodeMap: positionedMap,
    edges,
    totalWidth: Math.max(320, Math.ceil(maxX - minX + MINDMAP_PADDING * 2)),
    totalHeight: Math.max(180, Math.ceil(maxY - minY + MINDMAP_PADDING * 2)),
  };
}

function pickBalancedRootSide(
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

export function applyMindMapOperation(
  data: MindMapData,
  op: MindMapOperation
): MindMapOperationResult {
  const now = Date.now();
  const nodeMap = new Map<string, MindMapNodeData>(
    data.nodes.map((n) => [n.id, { ...n, childNodeIds: [...n.childNodeIds] }])
  );

  const finalize = (
    layout: MindMapLayout = data.layout,
    createdNodeId?: string
  ): MindMapOperationResult => ({
    status: 'ok',
    createdNodeId,
    data: {
      ...data,
      layout,
      nodes: Array.from(nodeMap.values()),
      lastEditedTime: now,
    },
  });

  switch (op.operation) {
    case 'setLayout': {
      return finalize(op.layout);
    }

    case 'addNode': {
      if (nodeMap.size >= MINDMAP_MAX_NODES) {
        return { status: 'failed', data, failureReasonCode: 'tooManyNodes' };
      }
      const parent = nodeMap.get(op.parentId);
      if (!parent) {
        return { status: 'failed', data, failureReasonCode: 'nodeNotFound' };
      }
      const id = op.id ?? generateMindMapNodeId();
      const side: MindMapNodeSide =
        parent.parentId === null
          ? op.side ?? pickBalancedRootSide(nodeMap, parent)
          : parent.side ?? 'right';
      const edgeColor: MindMapEdgeColor =
        op.edgeColor ??
        (parent.parentId === null
          ? MINDMAP_DEFAULT_BRANCH_COLORS[
              parent.childNodeIds.length % MINDMAP_DEFAULT_BRANCH_COLORS.length
            ]
          : parent.edgeColor);

      const newNode: MindMapNodeData = {
        id,
        type: op.nodeType ?? 'textNode',
        parentId: parent.id,
        childNodeIds: [],
        side,
        edgeColor,
        isCollapsed: false,
        content: op.content ?? '',
        cardId: op.cardId ?? null,
        highlightId: op.highlightId ?? null,
        sourceObjectId: op.sourceObjectId ?? null,
        lastEditedTime: now,
      };
      nodeMap.set(id, newNode);

      const nextChildren = [...parent.childNodeIds];
      if (
        typeof op.insertionIndex === 'number' &&
        op.insertionIndex >= 0 &&
        op.insertionIndex <= nextChildren.length
      ) {
        nextChildren.splice(op.insertionIndex, 0, id);
      } else {
        nextChildren.push(id);
      }
      nodeMap.set(parent.id, {
        ...parent,
        isCollapsed: false,
        childNodeIds: nextChildren,
        lastEditedTime: now,
      });
      return finalize(data.layout, id);
    }

    case 'moveNode': {
      const target = nodeMap.get(op.targetId);
      const newParent = nodeMap.get(op.newParentId);
      if (!target || !newParent) {
        return { status: 'failed', data, failureReasonCode: 'nodeNotFound' };
      }
      if (target.parentId === null) {
        return { status: 'failed', data, failureReasonCode: 'rootMutationNotAllowed' };
      }
      const subtreeIds = collectSubtreeIds(nodeMap, target.id);
      if (subtreeIds.includes(newParent.id)) {
        return { status: 'failed', data, failureReasonCode: 'cyclicStructure' };
      }
      const oldParent = nodeMap.get(target.parentId);
      if (oldParent) {
        nodeMap.set(oldParent.id, {
          ...oldParent,
          childNodeIds: oldParent.childNodeIds.filter((cid) => cid !== target.id),
          lastEditedTime: now,
        });
      }
      const updatedNewParent = nodeMap.get(newParent.id)!;
      const nextChildren = updatedNewParent.childNodeIds.filter((cid) => cid !== target.id);
      if (
        typeof op.insertionIndex === 'number' &&
        op.insertionIndex >= 0 &&
        op.insertionIndex <= nextChildren.length
      ) {
        nextChildren.splice(op.insertionIndex, 0, target.id);
      } else {
        nextChildren.push(target.id);
      }
      nodeMap.set(updatedNewParent.id, {
        ...updatedNewParent,
        isCollapsed: false,
        childNodeIds: nextChildren,
        lastEditedTime: now,
      });

      const resolvedSide: MindMapNodeSide =
        updatedNewParent.parentId === null
          ? op.side ?? target.side ?? pickBalancedRootSide(nodeMap, updatedNewParent)
          : updatedNewParent.side ?? 'right';
      const resolvedColor: MindMapEdgeColor =
        updatedNewParent.parentId === null ? target.edgeColor : updatedNewParent.edgeColor;

      for (const sid of subtreeIds) {
        const sub = nodeMap.get(sid)!;
        nodeMap.set(sid, {
          ...sub,
          parentId: sid === target.id ? updatedNewParent.id : sub.parentId,
          side: resolvedSide,
          edgeColor: resolvedColor,
          lastEditedTime: now,
        });
      }
      return finalize();
    }

    case 'deleteSubtree': {
      const target = nodeMap.get(op.targetId);
      if (!target) {
        return { status: 'failed', data, failureReasonCode: 'nodeNotFound' };
      }
      if (target.parentId === null) {
        return { status: 'failed', data, failureReasonCode: 'rootMutationNotAllowed' };
      }
      const parent = nodeMap.get(target.parentId);
      if (parent) {
        nodeMap.set(parent.id, {
          ...parent,
          childNodeIds: parent.childNodeIds.filter((cid) => cid !== target.id),
          lastEditedTime: now,
        });
      }
      const subtreeIds = collectSubtreeIds(nodeMap, target.id);
      for (const sid of subtreeIds) {
        nodeMap.delete(sid);
      }
      return finalize();
    }

    case 'updateTextNode': {
      const target = nodeMap.get(op.targetId);
      if (!target) {
        return { status: 'failed', data, failureReasonCode: 'nodeNotFound' };
      }
      nodeMap.set(target.id, {
        ...target,
        content: op.content,
        lastEditedTime: now,
      });
      return finalize();
    }

    case 'convertNode': {
      const target = nodeMap.get(op.targetId);
      if (!target) {
        return { status: 'failed', data, failureReasonCode: 'nodeNotFound' };
      }
      nodeMap.set(target.id, {
        ...target,
        type: op.nodeType,
        content: op.content ?? target.content,
        cardId: op.cardId !== undefined ? op.cardId : target.cardId,
        highlightId: op.highlightId !== undefined ? op.highlightId : target.highlightId,
        lastEditedTime: now,
      });
      return finalize();
    }

    case 'setCollapsed': {
      const target = nodeMap.get(op.targetId);
      if (!target) {
        return { status: 'failed', data, failureReasonCode: 'nodeNotFound' };
      }
      nodeMap.set(target.id, {
        ...target,
        isCollapsed: op.isCollapsed,
        lastEditedTime: now,
      });
      return finalize();
    }

    case 'setEdgeColor': {
      const target = nodeMap.get(op.targetId);
      if (!target) {
        return { status: 'failed', data, failureReasonCode: 'nodeNotFound' };
      }
      if (target.parentId === null) {
        return { status: 'failed', data, failureReasonCode: 'rootMutationNotAllowed' };
      }
      const subtreeIds = collectSubtreeIds(nodeMap, target.id);
      for (const sid of subtreeIds) {
        const sub = nodeMap.get(sid)!;
        nodeMap.set(sid, {
          ...sub,
          edgeColor: op.edgeColor,
          lastEditedTime: now,
        });
      }
      return finalize();
    }
  }
}

export function navigateMindMapByArrow(
  layoutResult: MindMapLayoutResult,
  currentNodeId: string,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
): string | null {
  const current = layoutResult.nodeMap.get(currentNodeId);
  if (!current) return null;
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;

  let bestId: string | null = null;
  let bestScore = Infinity;

  for (const candidate of layoutResult.nodes) {
    if (candidate.id === currentNodeId) continue;
    const tx = candidate.x + candidate.width / 2;
    const ty = candidate.y + candidate.height / 2;
    const dx = tx - cx;
    const dy = ty - cy;

    let primary = 0;
    let secondary = 0;
    if (key === 'ArrowRight') {
      if (dx <= 10) continue;
      primary = dx;
      secondary = Math.abs(dy);
    } else if (key === 'ArrowLeft') {
      if (dx >= -10) continue;
      primary = -dx;
      secondary = Math.abs(dy);
    } else if (key === 'ArrowDown') {
      if (dy <= 10) continue;
      primary = dy;
      secondary = Math.abs(dx);
    } else if (key === 'ArrowUp') {
      if (dy >= -10) continue;
      primary = -dy;
      secondary = Math.abs(dx);
    }

    const score = primary + secondary * 2.2;
    if (score < bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }

  return bestId;
}
