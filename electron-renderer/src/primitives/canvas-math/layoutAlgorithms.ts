import type { WhiteboardObject, AlignmentType, ArrangeLayoutType } from '../../../../shared/types';
import type { Rect } from './coordinate';

export function computeBoundingBox(objects: WhiteboardObject[]): Rect {
  if (objects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of objects) {
    minX = Math.min(minX, obj.pos_x);
    minY = Math.min(minY, obj.pos_y);
    maxX = Math.max(maxX, obj.pos_x + obj.width);
    maxY = Math.max(maxY, obj.pos_y + obj.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function alignObjects(
  targets: WhiteboardObject[],
  alignment: AlignmentType,
  referenceBox?: Rect
): Array<{ id: string; x: number; y: number }> {
  if (targets.length === 0) return [];
  const ref = referenceBox || computeBoundingBox(targets);

  return targets.map((obj) => {
    let x = obj.pos_x;
    let y = obj.pos_y;

    switch (alignment) {
      case 'left':
        x = ref.x;
        break;
      case 'centerHorizontally':
        x = ref.x + (ref.width - obj.width) / 2;
        break;
      case 'right':
        x = ref.x + ref.width - obj.width;
        break;
      case 'top':
        y = ref.y;
        break;
      case 'centerVertically':
        y = ref.y + (ref.height - obj.height) / 2;
        break;
      case 'bottom':
        y = ref.y + ref.height - obj.height;
        break;
    }

    return { id: obj.id, x, y };
  });
}

export function arrangeObjects(
  objects: WhiteboardObject[],
  layoutType: ArrangeLayoutType,
  options: {
    gap?: number;
    columns?: number;
    anchor?: { x: number; y: number };
  } = {}
): Array<{ id: string; x: number; y: number }> {
  if (objects.length <= 1) return [];

  const gap = options.gap ?? 40;
  const startX = options.anchor?.x ?? objects[0].pos_x;
  const startY = options.anchor?.y ?? objects[0].pos_y;

  const results: Array<{ id: string; x: number; y: number }> = [];

  if (layoutType === 'row') {
    let currentX = startX;
    for (const obj of objects) {
      results.push({ id: obj.id, x: currentX, y: startY });
      currentX += obj.width + gap;
    }
  } else if (layoutType === 'column') {
    let currentY = startY;
    for (const obj of objects) {
      results.push({ id: obj.id, x: startX, y: currentY });
      currentY += obj.height + gap;
    }
  } else if (layoutType === 'grid') {
    const count = objects.length;
    const numCols = options.columns || Math.max(2, Math.ceil(Math.sqrt(count)));

    const colWidths: number[] = new Array(numCols).fill(0);
    const rowHeights: number[] = [];

    objects.forEach((obj, idx) => {
      const col = idx % numCols;
      const row = Math.floor(idx / numCols);
      colWidths[col] = Math.max(colWidths[col], obj.width);
      rowHeights[row] = Math.max(rowHeights[row] || 0, obj.height);
    });

    objects.forEach((obj, idx) => {
      const col = idx % numCols;
      const row = Math.floor(idx / numCols);

      let x = startX;
      for (let c = 0; c < col; c++) {
        x += colWidths[c] + gap;
      }

      let y = startY;
      for (let r = 0; r < row; r++) {
        y += rowHeights[r] + gap;
      }

      results.push({ id: obj.id, x, y });
    });
  }

  return results;
}

export interface LintIssue {
  type: 'overlap' | 'sectionsPartiallyOverlap' | 'partiallyInsideSection';
  objectIds: string[];
  message: string;
}

export function lintWhiteboard(objects: WhiteboardObject[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const sections = objects.filter((o) => o.object_type === 'section');
  const nonSections = objects.filter((o) => o.object_type !== 'section');

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const s1 = sections[i];
      const s2 = sections[j];

      const intersects =
        s1.pos_x < s2.pos_x + s2.width &&
        s1.pos_x + s1.width > s2.pos_x &&
        s1.pos_y < s2.pos_y + s2.height &&
        s1.pos_y + s1.height > s2.pos_y;

      if (intersects) {
        const s1ContainsS2 =
          s1.pos_x <= s2.pos_x &&
          s1.pos_y <= s2.pos_y &&
          s1.pos_x + s1.width >= s2.pos_x + s2.width &&
          s1.pos_y + s1.height >= s2.pos_y + s2.height;

        const s2ContainsS1 =
          s2.pos_x <= s1.pos_x &&
          s2.pos_y <= s1.pos_y &&
          s2.pos_x + s2.width >= s1.pos_x + s1.width &&
          s2.pos_y + s2.height >= s1.pos_y + s1.height;

        if (!s1ContainsS2 && !s2ContainsS1) {
          issues.push({
            type: 'sectionsPartiallyOverlap',
            objectIds: [s1.id, s2.id],
            message: '两个分区容器发生异常部分重叠 (应完全包含或互不相交)',
          });
        }
      }
    }
  }

  for (const card of nonSections) {
    for (const sec of sections) {
      const intersects =
        card.pos_x < sec.pos_x + sec.width &&
        card.pos_x + card.width > sec.pos_x &&
        card.pos_y < sec.pos_y + sec.height &&
        card.pos_y + card.height > sec.pos_y;

      if (intersects) {
        const fullyInside =
          card.pos_x >= sec.pos_x &&
          card.pos_y >= sec.pos_y &&
          card.pos_x + card.width <= sec.pos_x + sec.width &&
          card.pos_y + card.height <= sec.pos_y + sec.height;

        if (!fullyInside) {
          issues.push({
            type: 'partiallyInsideSection',
            objectIds: [card.id, sec.id],
            message: '卡片边缘超出分区边界',
          });
        }
      }
    }
  }

  for (let i = 0; i < nonSections.length; i++) {
    for (let j = i + 1; j < nonSections.length; j++) {
      const c1 = nonSections[i];
      const c2 = nonSections[j];

      const intersects =
        c1.pos_x < c2.pos_x + c2.width &&
        c1.pos_x + c1.width > c2.pos_x &&
        c1.pos_y < c2.pos_y + c2.height &&
        c1.pos_y + c1.height > c2.pos_y;

      if (intersects) {
        issues.push({
          type: 'overlap',
          objectIds: [c1.id, c2.id],
          message: '同层级卡片之间发生位置遮挡覆盖',
        });
      }
    }
  }

  return issues;
}

export interface AlignmentGuide {
  orientation: 'horizontal' | 'vertical';
  pos: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: AlignmentGuide[];
}

export function computeSmartGuides(
  dragging: Rect,
  referenceObjects: Array<{ pos_x: number; pos_y: number; width: number; height: number }>,
  detectionRange = 15
): SnapResult {
  let snappedX = dragging.x;
  let snappedY = dragging.y;
  const guides: AlignmentGuide[] = [];

  const dragXAxes = [
    { value: dragging.x, offset: 0 },
    { value: dragging.x + dragging.width / 2, offset: dragging.width / 2 },
    { value: dragging.x + dragging.width, offset: dragging.width },
  ];

  const dragYAxes = [
    { value: dragging.y, offset: 0 },
    { value: dragging.y + dragging.height / 2, offset: dragging.height / 2 },
    { value: dragging.y + dragging.height, offset: dragging.height },
  ];

  let minDeltaX = detectionRange + 1;
  let matchedTargetX: number | null = null;
  let matchedOffsetX = 0;

  let minDeltaY = detectionRange + 1;
  let matchedTargetY: number | null = null;
  let matchedOffsetY = 0;

  for (const ref of referenceObjects) {
    const refXAxes = [ref.pos_x, ref.pos_x + ref.width / 2, ref.pos_x + ref.width];
    const refYAxes = [ref.pos_y, ref.pos_y + ref.height / 2, ref.pos_y + ref.height];

    for (const d of dragXAxes) {
      for (const tX of refXAxes) {
        const delta = Math.abs(d.value - tX);
        if (delta <= detectionRange && delta < minDeltaX) {
          minDeltaX = delta;
          matchedTargetX = tX;
          matchedOffsetX = d.offset;
        }
      }
    }

    for (const d of dragYAxes) {
      for (const tY of refYAxes) {
        const delta = Math.abs(d.value - tY);
        if (delta <= detectionRange && delta < minDeltaY) {
          minDeltaY = delta;
          matchedTargetY = tY;
          matchedOffsetY = d.offset;
        }
      }
    }
  }

  if (matchedTargetX !== null) {
    snappedX = matchedTargetX - matchedOffsetX;
    guides.push({ orientation: 'vertical', pos: matchedTargetX });
  }

  if (matchedTargetY !== null) {
    snappedY = matchedTargetY - matchedOffsetY;
    guides.push({ orientation: 'horizontal', pos: matchedTargetY });
  }

  return { x: snappedX, y: snappedY, guides };
}
