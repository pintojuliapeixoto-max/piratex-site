import { LayerItem, Point2D, TextLayerData } from '../types';

/**
 * Renders a Text Layer onto its internal canvas, applying lateral scaling
 * and Guide-Line Envelope Distortion (Distorção por Linhas Guias) when enabled.
 * Also automatically syncs the layer's name with the typed text.
 */
export function renderTextLayerCanvas(layer: LayerItem): void {
  if (layer.kind !== 'text' || !layer.textData) return;
  const td = layer.textData;

  // Automatically adopt typed text as the layer's name
  const cleanName = td.text.replace(/\s+/g, ' ').trim();
  layer.name = cleanName.length > 0 ? cleanName.slice(0, 42) : 'Texto';

  const w = Math.max(40, Math.round(layer.width));
  const h = Math.max(30, Math.round(layer.height));
  if (layer.canvas.width !== w || layer.canvas.height !== h) {
    layer.canvas.width = w;
    layer.canvas.height = h;
  }

  // Render flat text onto a source buffer first
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const sctx = srcCanvas.getContext('2d');
  if (!sctx) return;

  sctx.clearRect(0, 0, w, h);
  const weight = td.bold ? '700' : '500';
  const style = td.italic ? 'italic' : 'normal';
  sctx.font = `${style} ${weight} ${td.fontSize}px "${td.fontFamily}", "Lucida Console", "Consolas", "Courier New", monospace`;
  sctx.fillStyle = td.color;
  sctx.textBaseline = 'top';

  const lines = td.text.split('\n');
  const lineH = td.fontSize * (td.lineHeight || 1.22);
  const totalTextH = lines.length * lineH;
  const startY = Math.max(6, (h - totalTextH) / 2);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const metrics = sctx.measureText(line);
    let tx = 10;
    if (td.align === 'center') {
      tx = (w - metrics.width) / 2;
    } else if (td.align === 'right') {
      tx = Math.max(6, w - metrics.width - 10);
    }
    sctx.fillText(line, tx, startY + i * lineH);
  }

  const dstCtx = layer.canvas.getContext('2d');
  if (!dstCtx) return;
  dstCtx.clearRect(0, 0, w, h);

  if (!td.warpEnabled) {
    dstCtx.drawImage(srcCanvas, 0, 0);
    return;
  }

  // Guide-Line Distortion (Bilinear Patch Subdivision Warp)
  // Corners in local layer pixel space:
  const [tl, tr, br, bl] = td.warpCorners.map((pt) => ({
    x: pt.x * w,
    y: pt.y * h,
  }));

  const gridCols = 14;
  const gridRows = 10;

  const bilerp = (u: number, v: number): Point2D => {
    const topX = tl.x + (tr.x - tl.x) * u;
    const topY = tl.y + (tr.y - tl.y) * u;
    const botX = bl.x + (br.x - bl.x) * u;
    const botY = bl.y + (br.y - bl.y) * u;
    return {
      x: topX + (botX - topX) * v,
      y: topY + (botY - topY) * v,
    };
  };

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const u0 = c / gridCols;
      const v0 = r / gridRows;
      const u1 = (c + 1) / gridCols;
      const v1 = (r + 1) / gridRows;

      const sx0 = u0 * w;
      const sy0 = v0 * h;
      const sx1 = u1 * w;
      const sy1 = v1 * h;

      const p00 = bilerp(u0, v0);
      const p10 = bilerp(u1, v0);
      const p11 = bilerp(u1, v1);
      const p01 = bilerp(u0, v1);

      drawTexturedTriangle(
        dstCtx,
        srcCanvas,
        sx0,
        sy0,
        sx1,
        sy0,
        sx1,
        sy1,
        p00.x,
        p00.y,
        p10.x,
        p10.y,
        p11.x,
        p11.y,
      );
      drawTexturedTriangle(
        dstCtx,
        srcCanvas,
        sx0,
        sy0,
        sx1,
        sy1,
        sx0,
        sy1,
        p00.x,
        p00.y,
        p11.x,
        p11.y,
        p01.x,
        p01.y,
      );
    }
  }
}

/**
 * Draws a textured triangle using an affine 2D canvas transform
 */
function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  u2: number,
  v2: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.clip();

  const denom = u0 * (v2 - v1) - u1 * v2 + u2 * v1 + (u1 - u2) * v0;
  if (Math.abs(denom) < 1e-5) {
    ctx.restore();
    return;
  }

  const m11 = -(v0 * (x2 - x1) - v1 * x2 + v2 * x1 + (v1 - v2) * x0) / denom;
  const m12 = (v1 * y2 + v0 * (y1 - y2) - v2 * y1 + (v2 - v1) * y0) / denom;
  const m21 = (u0 * (x2 - x1) - u1 * x2 + u2 * x1 + (u1 - u2) * x0) / denom;
  const m22 = -(u1 * y2 + u0 * (y1 - y2) - u2 * y1 + (u2 - u1) * y0) / denom;
  const dx =
    (u0 * (v2 * x1 - v1 * x2) +
      v0 * (u1 * x2 - u2 * x1) +
      (u2 * v1 - u1 * v2) * x0) /
    denom;
  const dy =
    (u0 * (v2 * y1 - v1 * y2) +
      v0 * (u1 * y2 - u2 * y1) +
      (u2 * v1 - u1 * v2) * y0) /
    denom;

  ctx.transform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

export function createDefaultTextData(
  text = 'Novo Texto Piratex',
  color = '#1E293B',
): TextLayerData {
  return {
    text,
    fontFamily: 'Lucida Console',
    fontSize: 44,
    align: 'center',
    color,
    bold: true,
    italic: false,
    letterSpacing: 0,
    lineHeight: 1.2,
    warpEnabled: false,
    warpCorners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  };
}
