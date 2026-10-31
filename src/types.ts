export type ToolId =
  | 'move'
  | 'select-quad'
  | 'select-triangle'
  | 'select-ellipse'
  | 'smart-select'
  | 'lasso'
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'eyedropper'
  | 'text'
  | 'hand'
  | 'zoom';

export type PresetCategory = 'paper' | 'web' | 'video' | 'saved';

export interface DocumentPreset {
  id: string;
  name: string;
  category: PresetCategory;
  width: number;
  height: number;
  dpi: number;
  description: string;
}

export interface Point2D {
  x: number;
  y: number;
}

export type BrushTipShape =
  | 'circle'
  | 'pixel'
  | 'calligraphy'
  | 'square'
  | 'chalk'
  | 'airbrush'
  | 'star'
  | 'custom';

export interface BrushSettings {
  size: number; // 1..300 px
  opacity: number; // 1..100 %
  flow: number; // 1..100 %
  rotation: number; // 0..360 deg
  hardness: number; // 0..100 %
  spacing: number; // 5..150 %
  roundness: number; // 10..100 %
  pixelSnap: boolean; // Pixel crisp mode
  tipShape: BrushTipShape;
  customTipDataUrl?: string;
}

export interface BrushPreset extends BrushSettings {
  id: string;
  name: string;
  packName: string;
}

export interface GradientStop {
  offset: number; // 0..1
  color: string;
}

export interface GradientPreset {
  id: string;
  name: string;
  type: 'linear' | 'radial';
  angle: number;
  stops: GradientStop[];
}

export interface GuideLine {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number; // in document pixels
}

export type TextAlignment = 'left' | 'center' | 'right';

export interface TextLayerData {
  text: string;
  fontFamily: string;
  fontSize: number;
  align: TextAlignment;
  color: string;
  bold: boolean;
  italic: boolean;
  letterSpacing: number;
  lineHeight: number;
  warpEnabled: boolean;
  // Normalized offsets from the 4 corners [TL, TR, BR, BL], default [(0,0), (1,0), (1,1), (0,1)]
  warpCorners: [Point2D, Point2D, Point2D, Point2D];
}

export type LayerKind = 'pixel' | 'text' | 'background';

export interface LayerItem {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  lockTransparentPixels: boolean;
  lockPosition: boolean;
  blendMode: GlobalCompositeOperation;
  opacity: number; // 0..100 %
  fill: number; // 0..100 % (Fill transparency)
  // Object transform segmented per layer on the canvas
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees (0, 90, 180, or free)
  canvas: HTMLCanvasElement;
  textData?: TextLayerData;
  strokeBorder?: {
    enabled: boolean;
    color: string;
    size: number;
  };
}

export type SelectionMode = 'quad' | 'triangle' | 'ellipse' | 'lasso' | 'smart';

export interface SelectionState {
  active: boolean;
  mode: SelectionMode;
  // Bounding box in document coordinates, editable after creation via handles
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  // Normalized points (0..1) inside the bounding box for lasso, triangle, smart selection, or quad
  normalizedPoints: Point2D[];
}

export interface SerializedLayerSnapshot {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  lockTransparentPixels: boolean;
  lockPosition: boolean;
  blendMode: GlobalCompositeOperation;
  opacity: number;
  fill: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  dataUrl: string;
  textData?: TextLayerData;
  strokeBorder?: {
    enabled: boolean;
    color: string;
    size: number;
  };
}

export interface HistorySnapshot {
  label: string;
  timestamp: number;
  docWidth: number;
  docHeight: number;
  activeLayerId: string;
  layers: SerializedLayerSnapshot[];
  selection: SelectionState;
}
