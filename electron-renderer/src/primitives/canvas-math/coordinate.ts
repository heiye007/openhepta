export interface ViewportState {
  panX: number;
  panY: number;
  zoom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function screenToWorld(screenPoint: Point, viewport: ViewportState): Point {
  return {
    x: (screenPoint.x - viewport.panX) / viewport.zoom,
    y: (screenPoint.y - viewport.panY) / viewport.zoom,
  };
}

export function worldToScreen(worldPoint: Point, viewport: ViewportState): Point {
  return {
    x: worldPoint.x * viewport.zoom + viewport.panX,
    y: worldPoint.y * viewport.zoom + viewport.panY,
  };
}

export function getVisibleWorldBounds(viewport: ViewportState, screenWidth: number, screenHeight: number): Rect {
  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
  const bottomRight = screenToWorld({ x: screenWidth, y: screenHeight }, viewport);

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

export function isObjectInViewport(objectRect: Rect, visibleBounds: Rect, padding = 150): boolean {
  return !(
    objectRect.x + objectRect.width < visibleBounds.x - padding ||
    objectRect.x > visibleBounds.x + visibleBounds.width + padding ||
    objectRect.y + objectRect.height < visibleBounds.y - padding ||
    objectRect.y > visibleBounds.y + visibleBounds.height + padding
  );
}

export function getCubicBezierPath(
  start: Point,
  end: Point,
  startDirection: 'top' | 'bottom' | 'left' | 'right' = 'right',
  endDirection: 'top' | 'bottom' | 'left' | 'right' = 'left'
): string {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const curvature = Math.max(dx * 0.5, dy * 0.3, 40);

  const cp1 = { ...start };
  const cp2 = { ...end };

  switch (startDirection) {
    case 'right': cp1.x += curvature; break;
    case 'left': cp1.x -= curvature; break;
    case 'top': cp1.y -= curvature; break;
    case 'bottom': cp1.y += curvature; break;
  }

  switch (endDirection) {
    case 'right': cp2.x += curvature; break;
    case 'left': cp2.x -= curvature; break;
    case 'top': cp2.y -= curvature; break;
    case 'bottom': cp2.y += curvature; break;
  }

  return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
}

export function getStraightPath(start: Point, end: Point): string {
  return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
}

export function getElbowPath(
  start: Point,
  end: Point,
  startDirection: 'top' | 'bottom' | 'left' | 'right' = 'right',
  endDirection: 'top' | 'bottom' | 'left' | 'right' = 'left',
  radius = 8
): string {
  const isHorizontalStart = startDirection === 'left' || startDirection === 'right';
  const isHorizontalEnd = endDirection === 'left' || endDirection === 'right';

  if (isHorizontalStart && isHorizontalEnd) {
    const midX = (start.x + end.x) / 2;
    const dy = end.y - start.y;
    const dx1 = midX - start.x;
    const dx2 = end.x - midX;
    const r = Math.min(radius, Math.abs(dx1) / 2, Math.abs(dx2) / 2, Math.abs(dy) / 2);

    if (r < 2 || Math.abs(dy) < 4) {
      return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    }

    const signY = dy > 0 ? 1 : -1;
    const signX1 = dx1 > 0 ? 1 : -1;
    const signX2 = dx2 > 0 ? 1 : -1;

    return [
      `M ${start.x} ${start.y}`,
      `L ${midX - signX1 * r} ${start.y}`,
      `Q ${midX} ${start.y} ${midX} ${start.y + signY * r}`,
      `L ${midX} ${end.y - signY * r}`,
      `Q ${midX} ${end.y} ${midX + signX2 * r} ${end.y}`,
      `L ${end.x} ${end.y}`,
    ].join(' ');
  } else if (!isHorizontalStart && !isHorizontalEnd) {
    const midY = (start.y + end.y) / 2;
    const dx = end.x - start.x;
    const dy1 = midY - start.y;
    const dy2 = end.y - midY;
    const r = Math.min(radius, Math.abs(dy1) / 2, Math.abs(dy2) / 2, Math.abs(dx) / 2);

    if (r < 2 || Math.abs(dx) < 4) {
      return `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`;
    }

    const signX = dx > 0 ? 1 : -1;
    const signY1 = dy1 > 0 ? 1 : -1;
    const signY2 = dy2 > 0 ? 1 : -1;

    return [
      `M ${start.x} ${start.y}`,
      `L ${start.x} ${midY - signY1 * r}`,
      `Q ${start.x} ${midY} ${start.x + signX * r} ${midY}`,
      `L ${end.x - signX * r} ${midY}`,
      `Q ${end.x} ${midY} ${end.x} ${midY + signY2 * r}`,
      `L ${end.x} ${end.y}`,
    ].join(' ');
  } else if (isHorizontalStart) {
    const cornerX = end.x;
    const cornerY = start.y;
    const dx = cornerX - start.x;
    const dy = end.y - cornerY;
    const r = Math.min(radius, Math.abs(dx) / 2, Math.abs(dy) / 2);

    if (r < 2) {
      return `M ${start.x} ${start.y} L ${cornerX} ${cornerY} L ${end.x} ${end.y}`;
    }
    const signX = dx > 0 ? 1 : -1;
    const signY = dy > 0 ? 1 : -1;
    return `M ${start.x} ${start.y} L ${cornerX - signX * r} ${cornerY} Q ${cornerX} ${cornerY} ${cornerX} ${cornerY + signY * r} L ${end.x} ${end.y}`;
  } else {
    const cornerX = start.x;
    const cornerY = end.y;
    const dy = cornerY - start.y;
    const dx = end.x - cornerX;
    const r = Math.min(radius, Math.abs(dy) / 2, Math.abs(dx) / 2);

    if (r < 2) {
      return `M ${start.x} ${start.y} L ${cornerX} ${cornerY} L ${end.x} ${end.y}`;
    }
    const signY = dy > 0 ? 1 : -1;
    const signX = dx > 0 ? 1 : -1;
    return `M ${start.x} ${start.y} L ${cornerX} ${cornerY - signY * r} Q ${cornerX} ${cornerY} ${cornerX + signX * r} ${cornerY} L ${end.x} ${end.y}`;
  }
}

export function getConnectionPath(
  type: 'curve' | 'straight' | 'elbow' = 'curve',
  start: Point,
  end: Point,
  startDirection: 'top' | 'bottom' | 'left' | 'right' = 'right',
  endDirection: 'top' | 'bottom' | 'left' | 'right' = 'left'
): string {
  switch (type) {
    case 'straight':
      return getStraightPath(start, end);
    case 'elbow':
      return getElbowPath(start, end, startDirection, endDirection);
    case 'curve':
    default:
      return getCubicBezierPath(start, end, startDirection, endDirection);
  }
}
