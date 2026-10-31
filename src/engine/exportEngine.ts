import { LayerItem } from '../types';

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'pdf' | 'svg' | 'psd' | 'ps';

export interface ExportOptions {
  format: ExportFormat;
  quality: number; // 1 to 100
  scale: number; // e.g., 0.5, 1, 1.5, 2, 3, 4
  docName: string;
  docWidth: number;
  docHeight: number;
}

/**
 * Renders the composite canvas at a target resolution scale and applies quality-aware processing.
 */
export function buildScaledExportCanvas(
  sourceCanvas: HTMLCanvasElement,
  scale: number,
  quality: number,
  fillWhiteBackground: boolean,
): HTMLCanvasElement {
  const outW = Math.max(1, Math.round(sourceCanvas.width * scale));
  const outH = Math.max(1, Math.round(sourceCanvas.height * scale));
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d')!;

  if (fillWhiteBackground) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = quality >= 80 ? 'high' : quality >= 45 ? 'medium' : 'low';
  ctx.drawImage(sourceCanvas, 0, 0, outW, outH);

  // If quality < 100 on lossless formats (like PNG/PSD), apply subtle bit-depth quantization
  // so the quality setting meaningfully controls output compression and visual fidelity across ALL formats.
  if (quality < 98) {
    const levels = Math.max(8, Math.round((quality / 100) * 255));
    const step = 255 / levels;
    const imgData = ctx.getImageData(0, 0, outW, outH);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round(Math.round(d[i] / step) * step);
      d[i + 1] = Math.round(Math.round(d[i + 1] / step) * step);
      d[i + 2] = Math.round(Math.round(d[i + 2] / step) * step);
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return out;
}

/**
 * Generates a valid binary PDF 1.4 file embedding the rendered canvas JPEG image at the chosen quality.
 */
export function generatePdfBlobFromCanvas(
  canvas: HTMLCanvasElement,
  quality: number,
): Blob {
  const width = canvas.width;
  const height = canvas.height;
  const qNorm = Math.max(0.05, Math.min(1, quality / 100));

  // Ensure white background for PDF JPEG stream
  const pdfCanvas = document.createElement('canvas');
  pdfCanvas.width = width;
  pdfCanvas.height = height;
  const ctx = pdfCanvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(canvas, 0, 0);

  const dataUrl = pdfCanvas.toDataURL('image/jpeg', qNorm);
  const base64 = dataUrl.split(',')[1] || '';
  const binaryStr = atob(base64);
  const imgBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    imgBytes[i] = binaryStr.charCodeAt(i);
  }

  const encoder = new TextEncoder();
  const chunks: BlobPart[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  const pushText = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes as unknown as BlobPart);
    currentOffset += bytes.length;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes as unknown as BlobPart);
    currentOffset += bytes.length;
  };

  const startObj = (id: number) => {
    offsets[id] = currentOffset;
    pushText(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushText(`\nendobj\n`);
  };

  pushText(`%PDF-1.4\n%\xFF\xFF\xFF\xFF\n`);

  // 1: Catalog
  startObj(1);
  pushText(`<< /Type /Catalog /Pages 2 0 R >>`);
  endObj();

  // 2: Pages
  startObj(2);
  pushText(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  endObj();

  // 3: Page
  startObj(3);
  pushText(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  );
  endObj();

  // 4: Image XObject (DCTDecode JPEG stream)
  startObj(4);
  pushText(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`,
  );
  pushBytes(imgBytes);
  pushText(`\nendstream`);
  endObj();

  // 5: Page Content Stream
  const contentStream = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = encoder.encode(contentStream);
  startObj(5);
  pushText(`<< /Length ${contentBytes.length} >>\nstream\n`);
  pushBytes(contentBytes);
  pushText(`endstream`);
  endObj();

  // Cross-reference table (xref)
  const xrefOffset = currentOffset;
  pushText(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    pushText(`${offStr} 00000 n \n`);
  }

  pushText(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return new Blob(chunks, { type: 'application/pdf' });
}

/**
 * Generates a valid binary Adobe Photoshop (.PSD) file (8BPS v1) with planar RGB composite data.
 */
export function generatePsdBlobFromCanvas(canvas: HTMLCanvasElement): Blob {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, width, height).data;

  // Header (26 bytes) + Color Mode (4) + Image Resources (4) + Layer/Mask (4) + Compression (2) + Planar RGBA (width * height * 4)
  const channelPixels = width * height;
  const imageBytesLength = channelPixels * 4;
  const totalLength = 26 + 4 + 4 + 4 + 2 + imageBytesLength;

  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let pos = 0;
  // Signature '8BPS'
  bytes[pos++] = 0x38;
  bytes[pos++] = 0x42;
  bytes[pos++] = 0x50;
  bytes[pos++] = 0x53;

  // Version = 1
  view.setUint16(pos, 1, false);
  pos += 2;

  // Reserved (6 bytes = 0)
  pos += 6;

  // Channels = 4 (R, G, B, Alpha)
  view.setUint16(pos, 4, false);
  pos += 2;

  // Rows (height) & Columns (width)
  view.setUint32(pos, height, false);
  pos += 4;
  view.setUint32(pos, width, false);
  pos += 4;

  // Depth = 8 bits
  view.setUint16(pos, 8, false);
  pos += 2;

  // Color Mode = 3 (RGB)
  view.setUint16(pos, 3, false);
  pos += 2;

  // Color Mode Data Length = 0
  view.setUint32(pos, 0, false);
  pos += 4;

  // Image Resources Length = 0
  view.setUint32(pos, 0, false);
  pos += 4;

  // Layer and Mask Info Length = 0
  view.setUint32(pos, 0, false);
  pos += 4;

  // Compression = 0 (Raw Planar Data)
  view.setUint16(pos, 0, false);
  pos += 2;

  // Planar R, G, B, A channels
  const rOffset = pos;
  const gOffset = pos + channelPixels;
  const bOffset = pos + channelPixels * 2;
  const aOffset = pos + channelPixels * 3;

  for (let i = 0; i < channelPixels; i++) {
    const srcIdx = i * 4;
    bytes[rOffset + i] = imgData[srcIdx];
    bytes[gOffset + i] = imgData[srcIdx + 1];
    bytes[bOffset + i] = imgData[srcIdx + 2];
    bytes[aOffset + i] = imgData[srcIdx + 3];
  }

  return new Blob([buffer], { type: 'image/vnd.adobe.photoshop' });
}

/**
 * Serializes the full Piratex project into a `.ps` / `.psd` project JSON blob with quality-controlled layer data.
 */
export function generatePsProjectBlob(
  docName: string,
  docWidth: number,
  docHeight: number,
  layers: LayerItem[],
  quality: number,
  scale: number,
): Blob {
  const qNorm = Math.max(0.1, Math.min(1, quality / 100));
  const mime = quality < 100 ? 'image/webp' : 'image/png';

  const payload = {
    format: 'Piratex-PS-Project',
    version: '2.0',
    name: docName,
    width: Math.round(docWidth * scale),
    height: Math.round(docHeight * scale),
    quality,
    scale,
    savedAt: new Date().toISOString(),
    layers: layers.map((l) => {
      const scaledLayerCanvas = buildScaledExportCanvas(l.canvas, scale, quality, false);
      return {
        id: l.id,
        name: l.name,
        kind: l.kind,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        fill: l.fill,
        blendMode: l.blendMode,
        x: Math.round(l.x * scale),
        y: Math.round(l.y * scale),
        width: Math.round(l.width * scale),
        height: Math.round(l.height * scale),
        rotation: l.rotation,
        textData: l.textData,
        dataUrl: scaledLayerCanvas.toDataURL(mime, qNorm),
      };
    }),
  };

  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/octet-stream',
  });
}
