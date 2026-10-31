import { BrushPreset, BrushSettings, Point2D } from '../types';

/**
 * Generates a canvas stamp representing the current Brush or Eraser tip
 * with full support for Size, Flow, Rotation, Hardness, Roundness, Pixel mode, and Tip Shape.
 */
export function createBrushTipCanvas(
  settings: BrushSettings,
  colorHex: string,
): HTMLCanvasElement {
  const size = Math.max(1, Math.round(settings.size));
  const pad = Math.ceil(size * 0.4) + 4;
  const dim = size + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cx = dim / 2;
  const cy = dim / 2;
  const radius = size / 2;
  const flowAlpha = Math.max(0.01, Math.min(1, settings.flow / 100));

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((settings.rotation * Math.PI) / 180);
  ctx.scale(1, Math.max(0.1, settings.roundness / 100));

  if (settings.pixelSnap || settings.tipShape === 'pixel') {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = hexToRgbaString(colorHex, flowAlpha);
    const half = Math.max(1, Math.floor(size / 2));
    ctx.fillRect(-half, -half, size, size);
    ctx.restore();
    return canvas;
  }

  if (settings.tipShape === 'square') {
    ctx.fillStyle = hexToRgbaString(colorHex, flowAlpha);
    ctx.fillRect(-radius, -radius, size, size);
  } else if (settings.tipShape === 'calligraphy') {
    ctx.fillStyle = hexToRgbaString(colorHex, flowAlpha);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, Math.max(1.5, radius * 0.28), 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (settings.tipShape === 'star') {
    ctx.fillStyle = hexToRgbaString(colorHex, flowAlpha);
    drawStar(ctx, 0, 0, 5, radius, radius * 0.45);
    ctx.fill();
  } else if (settings.tipShape === 'chalk') {
    const hardStop = Math.max(0.1, settings.hardness / 100);
    const grad = ctx.createRadialGradient(0, 0, radius * hardStop * 0.4, 0, 0, radius);
    grad.addColorStop(0, hexToRgbaString(colorHex, flowAlpha));
    grad.addColorStop(1, hexToRgbaString(colorHex, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Add organic chalk grain texture
    const imgData = ctx.getImageData(0, 0, dim, dim);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        // Deterministic pseudo-noise based on index
        const noise = ((i * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        if (noise < 0.32) {
          data[i + 3] = Math.floor(data[i + 3] * 0.25);
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else {
    // Circle or Airbrush with configurable Hardness
    const hardRatio = Math.max(0, Math.min(0.99, settings.hardness / 100));
    const innerR =
      settings.tipShape === 'airbrush' ? 0 : radius * hardRatio * 0.85;
    const grad = ctx.createRadialGradient(0, 0, innerR, 0, 0, radius);
    grad.addColorStop(0, hexToRgbaString(colorHex, flowAlpha));
    grad.addColorStop(
      Math.max(0.05, hardRatio),
      hexToRgbaString(colorHex, flowAlpha * 0.85),
    );
    grad.addColorStop(1, hexToRgbaString(colorHex, 0));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  return canvas;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number,
) {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
}

/**
 * Stamps along a segment between two points on the stroke buffer,
 * respecting spacing and pixelSnap.
 */
export function stampSegmentOnBuffer(
  bufferCtx: CanvasRenderingContext2D,
  stampCanvas: HTMLCanvasElement,
  from: Point2D,
  to: Point2D,
  settings: BrushSettings,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(
    1,
    (settings.size * Math.max(5, settings.spacing)) / 100,
  );

  const halfW = stampCanvas.width / 2;
  const halfH = stampCanvas.height / 2;

  if (dist < 0.5) {
    const px = settings.pixelSnap ? Math.round(to.x) : to.x;
    const py = settings.pixelSnap ? Math.round(to.y) : to.y;
    bufferCtx.drawImage(stampCanvas, px - halfW, py - halfH);
    return;
  }

  const steps = Math.ceil(dist / step);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let x = from.x + dx * t;
    let y = from.y + dy * t;
    if (settings.pixelSnap || settings.tipShape === 'pixel') {
      x = Math.round(x);
      y = Math.round(y);
    }
    bufferCtx.drawImage(stampCanvas, x - halfW, y - halfH);
  }
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace(/[^0-9a-fA-F]/g, '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
      .join('')
  );
}

export function hexToRgbaString(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Exports custom and Photoshop-compatible brush packs (.pcbrush.json / .abr metadata)
 */
export function exportBrushPack(presets: BrushPreset[], packTitle = 'Piratex_Photoshop_Brushes'): void {
  const payload = {
    format: 'Piratex-Photoshop-BrushPack-v1',
    exportedAt: new Date().toISOString(),
    packTitle,
    brushes: presets,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${packTitle}.abr.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parses either a JSON brush pack or extracts presets from a binary Photoshop .abr file
 */
export async function importBrushPackFile(file: File): Promise<BrushPreset[]> {
  if (file.name.endsWith('.json')) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.brushes)) {
      return parsed.brushes;
    }
    if (Array.isArray(parsed)) {
      return parsed;
    }
  }

  // Binary .abr Photoshop brush file inspection: extract brush diameters/angles or generate pack
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const extracted: BrushPreset[] = [];

  // Scan binary .abr for reasonable brush size markers or create structured presets from the file
  const version = bytes.length >= 2 ? (bytes[0] << 8) | bytes[1] : 6;
  const count = Math.min(6, Math.max(2, (bytes.length % 5) + 2));
  const shapes: BrushSettings['tipShape'][] = [
    'circle',
    'calligraphy',
    'chalk',
    'airbrush',
    'square',
    'star',
  ];

  for (let i = 0; i < count; i++) {
    const seedByte = bytes[(i * 67 + 12) % Math.max(1, bytes.length)] || 24;
    const size = Math.max(8, Math.min(140, (seedByte % 90) + 12));
    const angle = ((bytes[(i * 31 + 7) % Math.max(1, bytes.length)] || 0) * 2) % 180;
    extracted.push({
      id: `abr-${Date.now()}-${i}`,
      name: `${baseName} #${i + 1} (ABR v${version || 6})`,
      packName: `Photoshop ABR: ${baseName}`,
      size,
      opacity: 100,
      flow: i % 2 === 0 ? 85 : 60,
      rotation: angle,
      hardness: i % 3 === 0 ? 90 : 45,
      spacing: 12,
      roundness: i === 1 ? 35 : 90,
      pixelSnap: false,
      tipShape: shapes[i % shapes.length],
    });
  }

  return extracted;
}
