import { LayerItem, Point2D, SelectionMode, SelectionState } from '../types';

export type HandleType =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'rot'
  | 'move'
  | null;

export function createEmptySelection(): SelectionState {
  return {
    active: false,
    mode: 'quad',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    normalizedPoints: [],
  };
}

/**
 * Generates normalized points (0..1) for standard geometric selection shapes
 */
export function buildNormalizedShapePoints(mode: SelectionMode): Point2D[] {
  if (mode === 'triangle') {
    return [
      { x: 0.5, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
  }
  if (mode === 'ellipse') {
    const pts: Point2D[] = [];
    const steps = 48;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      pts.push({
        x: 0.5 + 0.5 * Math.cos(angle),
        y: 0.5 + 0.5 * Math.sin(angle),
      });
    }
    return pts;
  }
  // Default quad
  return [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
}

/**
 * Converts a freehand Lasso path (in document coords) into a resizable SelectionState
 */
export function createSelectionFromLassoPoints(
  points: Point2D[],
): SelectionState {
  if (points.length < 3) return createEmptySelection();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const width = Math.max(8, maxX - minX);
  const height = Math.max(8, maxY - minY);
  const normalizedPoints = points.map((p) => ({
    x: (p.x - minX) / width,
    y: (p.y - minY) / height,
  }));

  return {
    active: true,
    mode: 'lasso',
    x: minX,
    y: minY,
    width,
    height,
    rotation: 0,
    normalizedPoints,
  };
}

/**
 * Smart Selection (Seleção Inteligente):
 * Samples the clicked pixel on the composite or active layer, floods contiguous pixels
 * within color tolerance, extracts the convex/concave boundary hull, and returns a resizable SelectionState!
 */
export function computeSmartSelection(
  compositeCanvas: HTMLCanvasElement,
  startX: number,
  startY: number,
  tolerance = 38,
): SelectionState {
  const w = compositeCanvas.width;
  const h = compositeCanvas.height;
  const sx = Math.max(0, Math.min(w - 1, Math.floor(startX)));
  const sy = Math.max(0, Math.min(h - 1, Math.floor(startY)));

  const ctx = compositeCanvas.getContext('2d');
  if (!ctx) return createEmptySelection();

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const startIdx = (sy * w + sx) * 4;
  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const startPos = sy * w + sx;
  visited[startPos] = 1;
  queue[tail++] = startPos;

  let minX = sx;
  let maxX = sx;
  let minY = sy;
  let maxY = sy;

  const minXPerRow = new Int32Array(h).fill(w);
  const maxXPerRow = new Int32Array(h).fill(-1);

  const tolSq = tolerance * tolerance * 3;

  while (head < tail) {
    const curr = queue[head++];
    const cx = curr % w;
    const cy = (curr / w) | 0;

    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
    if (cx < minXPerRow[cy]) minXPerRow[cy] = cx;
    if (cx > maxXPerRow[cy]) maxXPerRow[cy] = cx;

    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < w - 1 ? curr + 1 : -1,
      cy > 0 ? curr - w : -1,
      cy < h - 1 ? curr + w : -1,
    ];

    for (let i = 0; i < 4; i++) {
      const n = neighbors[i];
      if (n >= 0 && !visited[n]) {
        const idx = n * 4;
        const dr = data[idx] - sr;
        const dg = data[idx + 1] - sg;
        const db = data[idx + 2] - sb;
        const da = data[idx + 3] - sa;
        if (dr * dr + dg * dg + db * db + da * da <= tolSq) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }
  }

  const selW = Math.max(12, maxX - minX);
  const selH = Math.max(12, maxY - minY);

  // Build smooth contour polygon from row extrema
  const leftEdge: Point2D[] = [];
  const rightEdge: Point2D[] = [];
  const stepY = Math.max(1, Math.floor(selH / 36));

  for (let y = minY; y <= maxY; y += stepY) {
    if (maxXPerRow[y] >= minXPerRow[y]) {
      rightEdge.push({
        x: (maxXPerRow[y] - minX) / selW,
        y: (y - minY) / selH,
      });
      leftEdge.push({
        x: (minXPerRow[y] - minX) / selW,
        y: (y - minY) / selH,
      });
    }
  }

  const normalizedPoints = [...rightEdge, ...leftEdge.reverse()];
  if (normalizedPoints.length < 3) {
    return {
      active: true,
      mode: 'smart',
      x: minX,
      y: minY,
      width: selW,
      height: selH,
      rotation: 0,
      normalizedPoints: buildNormalizedShapePoints('quad'),
    };
  }

  return {
    active: true,
    mode: 'smart',
    x: minX,
    y: minY,
    width: selW,
    height: selH,
    rotation: 0,
    normalizedPoints,
  };
}

/**
 * Returns document-space polygon points for the current selection
 * taking into account x, y, width, height, and rotation.
 */
export function getSelectionPolygonDocumentPoints(
  sel: SelectionState,
): Point2D[] {
  if (!sel.active) return [];
  const cx = sel.x + sel.width / 2;
  const cy = sel.y + sel.height / 2;
  const rad = (sel.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const basePts =
    sel.normalizedPoints.length >= 3
      ? sel.normalizedPoints
      : buildNormalizedShapePoints(sel.mode);

  return basePts.map((pt) => {
    const lx = sel.x + pt.x * sel.width - cx;
    const ly = sel.y + pt.y * sel.height - cy;
    return {
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos,
    };
  });
}

/**
 * Applies a Canvas2D clipping path matching the current SelectionState
 * in either document space or a layer's local canvas space.
 */
export function buildSelectionPath2D(
  sel: SelectionState,
  offsetX = 0,
  offsetY = 0,
): Path2D {
  const path = new Path2D();
  const pts = getSelectionPolygonDocumentPoints(sel);
  if (pts.length === 0) return path;
  path.moveTo(pts[0].x - offsetX, pts[0].y - offsetY);
  for (let i = 1; i < pts.length; i++) {
    path.lineTo(pts[i].x - offsetX, pts[i].y - offsetY);
  }
  path.closePath();
  return path;
}

/**
 * Helper: Computes the intersection point of two line segments AB and CD.
 * Returns the intersection Point2D if they strictly cross, or null otherwise.
 */
function getSegmentIntersection(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
): Point2D | null {
  const rX = b.x - a.x;
  const rY = b.y - a.y;
  const sX = d.x - c.x;
  const sY = d.y - c.y;

  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-8) return null;

  const qpX = c.x - a.x;
  const qpY = c.y - a.y;

  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: a.x + t * rX,
      y: a.y + t * rY,
    };
  }
  return null;
}

/**
 * Checks if the freehand lasso path has closed by having one end cross an earlier segment
 * or touch the starting tip. Returns the closed loop points if crossed, or null if still open.
 */
export function findLassoSelfCrossingLoop(
  points: Point2D[],
  closeRadiusDoc = 10,
  minLoopSpanDoc = 12,
): Point2D[] | null {
  const n = points.length;
  if (n < 6) return null;

  const lastPt = points[n - 1];
  const prevPt = points[n - 2];

  // 1. Check if the newest segment (prevPt -> lastPt) crosses any non-adjacent earlier segment
  for (let i = 0; i <= n - 4; i++) {
    const segA = points[i];
    const segB = points[i + 1];
    const hit = getSegmentIntersection(segA, segB, prevPt, lastPt);
    if (hit) {
      const candidateLoop = [hit, ...points.slice(i + 1, n - 1), hit];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of candidateLoop) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      // Ignore tiny accidental micro-kinks from hand jitter; require a real enclosed loop
      if (maxX - minX >= minLoopSpanDoc && maxY - minY >= minLoopSpanDoc) {
        return candidateLoop;
      }
    }
  }

  // 2. Check if the current tip reached/crossed the starting point after traveling away
  const startPt = points[0];
  let maxDistFromStart = 0;
  for (let i = 1; i < n - 1; i++) {
    const d = Math.hypot(points[i].x - startPt.x, points[i].y - startPt.y);
    if (d > maxDistFromStart) maxDistFromStart = d;
  }

  if (maxDistFromStart >= minLoopSpanDoc * 1.4) {
    const distToStart = Math.hypot(lastPt.x - startPt.x, lastPt.y - startPt.y);
    if (distToStart <= closeRadiusDoc) {
      return [...points, { ...startPt }];
    }
  }

  return null;
}

/**
 * Extracts the pixels inside the active SelectionState into a cropped canvas
 * without erasing the source layer (used for Copy / Paste of Lasso selection).
 */
export function extractSelectionFromLayer(
  sourceLayer: LayerItem,
  selection: SelectionState,
  fallbackCompositeCanvas?: HTMLCanvasElement,
): {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (!selection.active) return null;
  const polyPts = getSelectionPolygonDocumentPoints(selection);
  if (polyPts.length < 3) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polyPts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  minX = Math.floor(minX);
  minY = Math.floor(minY);
  const cutW = Math.max(4, Math.ceil(maxX - minX));
  const cutH = Math.max(4, Math.ceil(maxY - minY));

  const newCanvas = document.createElement('canvas');
  newCanvas.width = cutW;
  newCanvas.height = cutH;
  const newCtx = newCanvas.getContext('2d');
  if (!newCtx) return null;

  const clipNew = buildSelectionPath2D(selection, minX, minY);

  // Draw from active sourceLayer
  newCtx.save();
  newCtx.clip(clipNew);
  const scx = sourceLayer.x + sourceLayer.width / 2 - minX;
  const scy = sourceLayer.y + sourceLayer.height / 2 - minY;
  newCtx.translate(scx, scy);
  newCtx.rotate((sourceLayer.rotation * Math.PI) / 180);
  newCtx.drawImage(
    sourceLayer.canvas,
    -sourceLayer.width / 2,
    -sourceLayer.height / 2,
    sourceLayer.width,
    sourceLayer.height,
  );
  newCtx.restore();

  // Check if sourceLayer had any non-transparent pixels in the selection; if not, fallback to composite canvas
  if (fallbackCompositeCanvas) {
    const imgData = newCtx.getImageData(0, 0, cutW, cutH).data;
    let hasOpaquePixel = false;
    for (let i = 3; i < imgData.length; i += 16) {
      if (imgData[i] > 0) {
        hasOpaquePixel = true;
        break;
      }
    }
    if (!hasOpaquePixel) {
      newCtx.save();
      newCtx.clip(clipNew);
      newCtx.drawImage(fallbackCompositeCanvas, -minX, -minY);
      newCtx.restore();
    }
  }

  return {
    canvas: newCanvas,
    x: minX,
    y: minY,
    width: cutW,
    height: cutH,
  };
}

/**
 * Splits a layer into TWO independent layers using the active Lasso or Geometric selection!
 * Returns { updatedOriginal, newCutLayer }
 */
export function splitLayerIntoTwoBySelection(
  sourceLayer: LayerItem,
  selection: SelectionState,
): { newCutLayer: LayerItem | null } {
  if (!selection.active || sourceLayer.locked) {
    return { newCutLayer: null };
  }

  // Create a document-sized work canvas to render source layer in document space
  const polyPts = getSelectionPolygonDocumentPoints(selection);
  if (polyPts.length < 3) return { newCutLayer: null };

  // Compute tight bounding box of the selection in document coordinates
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polyPts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  minX = Math.floor(minX);
  minY = Math.floor(minY);
  const cutW = Math.max(4, Math.ceil(maxX - minX));
  const cutH = Math.max(4, Math.ceil(maxY - minY));

  const newCanvas = document.createElement('canvas');
  newCanvas.width = cutW;
  newCanvas.height = cutH;
  const newCtx = newCanvas.getContext('2d');
  const srcCtx = sourceLayer.canvas.getContext('2d');
  if (!newCtx || !srcCtx) return { newCutLayer: null };

  // 1. Draw the selected portion onto newCanvas
  newCtx.save();
  const clipNew = buildSelectionPath2D(selection, minX, minY);
  newCtx.clip(clipNew);

  // Transform from sourceLayer space to newCanvas space
  const scx = sourceLayer.x + sourceLayer.width / 2 - minX;
  const scy = sourceLayer.y + sourceLayer.height / 2 - minY;
  newCtx.translate(scx, scy);
  newCtx.rotate((sourceLayer.rotation * Math.PI) / 180);
  newCtx.drawImage(
    sourceLayer.canvas,
    -sourceLayer.width / 2,
    -sourceLayer.height / 2,
    sourceLayer.width,
    sourceLayer.height,
  );
  newCtx.restore();

  // 2. Erase the selected portion from the sourceLayer's own canvas
  srcCtx.save();
  // Map selection points into sourceLayer's local unrotated canvas coordinates
  const lcx = sourceLayer.x + sourceLayer.width / 2;
  const lcy = sourceLayer.y + sourceLayer.height / 2;
  const invRad = (-sourceLayer.rotation * Math.PI) / 180;
  const cos = Math.cos(invRad);
  const sin = Math.sin(invRad);
  const scaleX = sourceLayer.canvas.width / Math.max(1, sourceLayer.width);
  const scaleY = sourceLayer.canvas.height / Math.max(1, sourceLayer.height);

  srcCtx.beginPath();
  polyPts.forEach((pt, index) => {
    const dx = pt.x - lcx;
    const dy = pt.y - lcy;
    const rx = dx * cos - dy * sin + sourceLayer.width / 2;
    const ry = dx * sin + dy * cos + sourceLayer.height / 2;
    const cx = rx * scaleX;
    const cy = ry * scaleY;
    if (index === 0) srcCtx.moveTo(cx, cy);
    else srcCtx.lineTo(cx, cy);
  });
  srcCtx.closePath();
  srcCtx.globalCompositeOperation = 'destination-out';
  srcCtx.fillStyle = '#000000';
  srcCtx.fill();
  srcCtx.restore();

  const newCutLayer: LayerItem = {
    id: `layer-${Date.now()}-split`,
    name: `${sourceLayer.name} (Corte Laço)`,
    kind: 'pixel',
    visible: true,
    locked: false,
    lockTransparentPixels: false,
    lockPosition: false,
    blendMode: sourceLayer.blendMode,
    opacity: sourceLayer.opacity,
    fill: sourceLayer.fill,
    x: minX,
    y: minY,
    width: cutW,
    height: cutH,
    rotation: 0,
    canvas: newCanvas,
    strokeBorder: sourceLayer.strokeBorder
      ? { ...sourceLayer.strokeBorder }
      : undefined,
  };

  return { newCutLayer };
}

/**
 * Returns the 8 resize handles + rotation handle for any bounding box (x, y, width, height, rotation)
 */
export function getTransformHandles(box: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}): Array<{ type: HandleType; x: number; y: number }> {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hw = box.width / 2;
  const hh = box.height / 2;
  const rad = (box.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const localHandles: Array<{ type: HandleType; lx: number; ly: number }> = [
    { type: 'nw', lx: -hw, ly: -hh },
    { type: 'n', lx: 0, ly: -hh },
    { type: 'ne', lx: hw, ly: -hh },
    { type: 'e', lx: hw, ly: 0 },
    { type: 'se', lx: hw, ly: hh },
    { type: 's', lx: 0, ly: hh },
    { type: 'sw', lx: -hw, ly: hh },
    { type: 'w', lx: -hw, ly: 0 },
    { type: 'rot', lx: 0, ly: -hh - 26 },
  ];

  return localHandles.map((h) => ({
    type: h.type,
    x: cx + h.lx * cos - h.ly * sin,
    y: cy + h.lx * sin + h.ly * cos,
  }));
}
