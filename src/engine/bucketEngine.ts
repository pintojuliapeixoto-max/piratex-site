import { GradientPreset, LayerItem, SelectionState } from '../types';
import { hexToRgb } from './brushEngine';
import { buildSelectionPath2D } from './selectionEngine';

/**
 * Paint Bucket Tool (Balde de Tinta):
 * Supports solid flood fill by tolerance OR gradient fill inside active layer / active selection.
 */
export function applyPaintBucketToLayer(
  layer: LayerItem,
  docClickX: number,
  docClickY: number,
  fillMode: 'solid' | 'gradient',
  solidHex: string,
  gradient: GradientPreset,
  tolerance: number,
  selection: SelectionState,
): void {
  if (layer.locked || layer.kind === 'text') return;
  const ctx = layer.canvas.getContext('2d');
  if (!ctx) return;

  const w = layer.canvas.width;
  const h = layer.canvas.height;

  // Map document click to layer's local canvas coordinates
  const lcx = layer.x + layer.width / 2;
  const lcy = layer.y + layer.height / 2;
  const invRad = (-layer.rotation * Math.PI) / 180;
  const dx = docClickX - lcx;
  const dy = docClickY - lcy;
  const rx = dx * Math.cos(invRad) - dy * Math.sin(invRad) + layer.width / 2;
  const ry = dx * Math.sin(invRad) + dy * Math.cos(invRad) + layer.height / 2;
  const localX = Math.floor((rx / Math.max(1, layer.width)) * w);
  const localY = Math.floor((ry / Math.max(1, layer.height)) * h);

  if (fillMode === 'gradient') {
    ctx.save();
    if (selection.active) {
      const clip = buildSelectionPath2D(selection, layer.x, layer.y);
      ctx.clip(clip);
    }
    let canvasGrad: CanvasGradient;
    if (gradient.type === 'radial') {
      const cx = localX >= 0 && localX < w ? localX : w / 2;
      const cy = localY >= 0 && localY < h ? localY : h / 2;
      canvasGrad = ctx.createRadialGradient(
        cx,
        cy,
        4,
        w / 2,
        h / 2,
        Math.hypot(w, h) * 0.6,
      );
    } else {
      const rad = (gradient.angle * Math.PI) / 180;
      const gx = Math.cos(rad) * (w / 2);
      const gy = Math.sin(rad) * (h / 2);
      canvasGrad = ctx.createLinearGradient(
        w / 2 - gx,
        h / 2 - gy,
        w / 2 + gx,
        h / 2 + gy,
      );
    }
    for (const stop of gradient.stops) {
      canvasGrad.addColorStop(stop.offset, stop.color);
    }
    ctx.fillStyle = canvasGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }

  // If a geometric/lasso selection is active and user clicks inside it with high tolerance or empty area,
  // or if we flood fill within the selection mask:
  if (selection.active && tolerance >= 120) {
    ctx.save();
    const clip = buildSelectionPath2D(selection, layer.x, layer.y);
    ctx.clip(clip);
    ctx.fillStyle = solidHex;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }

  if (localX < 0 || localX >= w || localY < 0 || localY >= h) return;

  // Build optional selection mask if selection.active
  let selMaskData: Uint8ClampedArray | null = null;
  if (selection.active) {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const mctx = maskCanvas.getContext('2d');
    if (mctx) {
      mctx.fillStyle = '#ffffff';
      const clip = buildSelectionPath2D(selection, layer.x, layer.y);
      mctx.fill(clip);
      selMaskData = mctx.getImageData(0, 0, w, h).data;
    }
  }

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const startPos = localY * w + localX;
  const startIdx = startPos * 4;

  if (selMaskData && selMaskData[startIdx + 3] === 0) {
    return;
  }

  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];

  const { r: tr, g: tg, b: tb } = hexToRgb(solidHex);
  if (sr === tr && sg === tg && sb === tb && sa === 255) return;

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  visited[startPos] = 1;
  queue[tail++] = startPos;

  const tolSq = tolerance * tolerance * 3;

  while (head < tail) {
    const curr = queue[head++];
    const pIdx = curr * 4;
    data[pIdx] = tr;
    data[pIdx + 1] = tg;
    data[pIdx + 2] = tb;
    data[pIdx + 3] = 255;

    const cx = curr % w;
    const cy = (curr / w) | 0;

    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx < w - 1 ? curr + 1 : -1,
      cy > 0 ? curr - w : -1,
      cy < h - 1 ? curr + w : -1,
    ];

    for (let i = 0; i < 4; i++) {
      const n = neighbors[i];
      if (n >= 0 && !visited[n]) {
        const nIdx = n * 4;
        if (selMaskData && selMaskData[nIdx + 3] === 0) continue;
        const dr = data[nIdx] - sr;
        const dg = data[nIdx + 1] - sg;
        const db = data[nIdx + 2] - sb;
        const da = data[nIdx + 3] - sa;
        if (dr * dr + dg * dg + db * db + da * da <= tolSq) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
