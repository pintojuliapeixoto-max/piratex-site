import {
  BLEND_MODES,
  DEFAULT_BRUSH_PRESETS,
  DEFAULT_DOCUMENT_PRESETS,
  DEFAULT_FONTS,
  DEFAULT_GRADIENTS,
  DEFAULT_SWATCHES,
} from '../constants';
import {
  createBrushTipCanvas,
  exportBrushPack,
  hexToRgb,
  importBrushPackFile,
  stampSegmentOnBuffer,
} from '../engine/brushEngine';
import { applyPaintBucketToLayer } from '../engine/bucketEngine';
import {
  buildScaledExportCanvas,
  ExportFormat,
  generatePdfBlobFromCanvas,
  generatePsdBlobFromCanvas,
  generatePsProjectBlob,
} from '../engine/exportEngine';
import {
  buildNormalizedShapePoints,
  buildSelectionPath2D,
  computeSmartSelection,
  createEmptySelection,
  createSelectionFromLassoPoints,
  extractSelectionFromLayer,
  findLassoSelfCrossingLoop,
  getSelectionPolygonDocumentPoints,
  getTransformHandles,
  HandleType,
  splitLayerIntoTwoBySelection,
} from '../engine/selectionEngine';
import { createDefaultTextData, renderTextLayerCanvas } from '../engine/textWarpEngine';
import {
  BrushPreset,
  BrushSettings,
  DocumentPreset,
  GradientPreset,
  HistorySnapshot,
  LayerItem,
  Point2D,
  PresetCategory,
  SelectionMode,
  SelectionState,
  SerializedLayerSnapshot,
  ToolId,
} from '../types';
import { ICONS } from '../ui/icons';

interface ToolDescriptor {
  id: ToolId;
  label: string;
  icon: string;
  key?: string;
}

export class PhotoCraftApp {
  private root: HTMLElement;

  // Document dimensions & viewport transform
  private docWidth = 1100;
  private docHeight = 760;
  private docName = 'Untitled-1';
  private zoom = 0.82;
  private panX = 180;
  private panY = 96;

  // Independent UI View Scales & Lateral Dimensions
  private toolsBarScale = 1.0;
  private toolsBarCollapsed = false;
  private toolsBarVertical = false;
  private colorPanelCollapsed = false;
  private layersPanelCollapsed = false;
  private topZIndex = 185;

  // Reorderable / Movable Tool Icons List
  private toolItems: ToolDescriptor[] = [
    {
      id: 'move',
      label: 'Move & Resize (V) - Mover e aumentar/diminuir Objeto/Arquivo Base (Arraste para reordenar ou Alt+Arraste para destacar)',
      icon: ICONS.move,
      key: 'V',
    },
    { id: 'select-quad', label: 'Recorte Quadrilátero (R)', icon: ICONS.selectQuad, key: 'R' },
    { id: 'select-ellipse', label: 'Recorte Elipse', icon: ICONS.selectEllipse },
    { id: 'select-triangle', label: 'Recorte Triangular', icon: ICONS.selectTriangle },
    { id: 'lasso', label: 'Laço Livre / Poligonal (L)', icon: ICONS.lasso, key: 'L' },
    { id: 'smart-select', label: 'Seleção Inteligente', icon: ICONS.smartSelect },
    { id: 'eyedropper', label: 'Conta-Gotas (I)', icon: ICONS.eyedropper },
    { id: 'brush', label: 'Pincel Piratex (P)', icon: ICONS.brush, key: 'P' },
    { id: 'eraser', label: 'Borracha Dinâmica (E)', icon: ICONS.eraser, key: 'E' },
    { id: 'bucket', label: 'Balde de Tinta / Gradiente (G)', icon: ICONS.bucket },
    { id: 'text', label: 'Texto com Linhas Guias (T)', icon: ICONS.text, key: 'T' },
    {
      id: 'hand',
      label: 'Hand (M) - Movimentar Todas as Partes: Colors, Layers, Barra de Funções e Tela',
      icon: ICONS.hand,
      key: 'M',
    },
    { id: 'zoom', label: 'Zoom Tool (Z)', icon: ICONS.zoom },
  ];

  // Detached floating tool pins (user can drag any icon out onto the workspace or back)
  private floatingToolPins: Map<ToolId, HTMLElement> = new Map();

  // Active tool & sub-modes
  private activeTool: ToolId = 'brush';
  private spaceKeyDown = false;
  private activeMenuDropdown: string | null = null;

  // Color state (initialized with Primary Blue #2196f3 & Lightest Blue #e8f5ff)
  private fgColor = '#2196f3';
  private bgColor = '#e8f5ff';
  private hsv = { h: 207, s: 86, v: 95 };
  private colorTab: 'color' | 'swatches' | 'gradients' | 'patterns' = 'color';
  private swatches: string[] = [...DEFAULT_SWATCHES];
  private gradients: GradientPreset[] = [...DEFAULT_GRADIENTS];
  private activeGradientId = DEFAULT_GRADIENTS[0].id;

  // Symmetrical Brush & Eraser settings
  private brushPresets: BrushPreset[] = [...DEFAULT_BRUSH_PRESETS];
  private activeBrushPresetId = DEFAULT_BRUSH_PRESETS[0].id;
  private brushSettings: BrushSettings = { ...DEFAULT_BRUSH_PRESETS[0] };
  private eraserSettings: BrushSettings = {
    ...DEFAULT_BRUSH_PRESETS[0],
    size: 32,
  };

  // Bucket settings
  private bucketSettings = {
    mode: 'solid' as 'solid' | 'gradient',
    tolerance: 36,
    opacity: 100,
  };

  // Smart selection tolerance
  private smartTolerance = 38;

  // Fonts
  private availableFonts: string[] = [...DEFAULT_FONTS];

  // Layers & active layer
  private layers: LayerItem[] = [];
  private activeLayerId = '';
  private layerFilterKind: 'all' | 'pixel' | 'text' = 'all';
  private renamingLayerId: string | null = null;

  // Selection state (Quad, Triangle, Ellipse, Lasso, Smart Select) with post-creation resize handles
  private selection: SelectionState = createEmptySelection();
  private lassoDraftPoints: Point2D[] = [];
  private isLassoDrawing = false;
  private lassoCursorDocPt: Point2D | null = null;
  private copiedSelectionBuffer: {
    canvas: HTMLCanvasElement;
    x: number;
    y: number;
    width: number;
    height: number;
    sourceName: string;
    pasteCount: number;
  } | null = null;
  private marchingAntsOffset = 0;

  // Alignment guides
  private showGuides = true;
  private activeSnapLines: { vertical?: number; horizontal?: number } = {};

  // Undo History (Ctrl+Z)
  private history: HistorySnapshot[] = [];
  private maxHistory = 25;

  // Offscreen compositing canvas (used for flood fill / smart select / export)
  private compositeCanvas: HTMLCanvasElement;
  private compositeCtx: CanvasRenderingContext2D;

  // DOM References
  private workspaceEl!: HTMLElement;
  private viewportCanvas!: HTMLCanvasElement;
  private viewportCtx!: CanvasRenderingContext2D;
  private optionsStripEl!: HTMLElement;
  private topHandBtnEl!: HTMLButtonElement;
  private toolsBarEl!: HTMLElement;
  private colorPanelEl!: HTMLElement;
  private colorPanelBodyEl!: HTMLElement;
  private layersPanelEl!: HTMLElement;
  private layersListEl!: HTMLElement;
  private layerOpacityInput!: HTMLInputElement;
  private layerFillInput!: HTMLInputElement;
  private layerBlendSelect!: HTMLSelectElement;
  private brushPopoverEl!: HTMLElement;
  private newDocModalEl!: HTMLElement;
  private exportModalEl!: HTMLElement;
  private statusCoordsEl!: HTMLElement;
  private statusZoomEl!: HTMLElement;
  private statusToolEl!: HTMLElement;
  private hiddenImageInput!: HTMLInputElement;
  private hiddenProjectInput!: HTMLInputElement;
  private hiddenFontInput!: HTMLInputElement;
  private hiddenBrushInput!: HTMLInputElement;

  // Universal Export Quality (1-100%) & Resolution Scale (0.5x - 4x)
  private exportQuality = 95;
  private exportScale = 1;
  private exportFormat: ExportFormat = 'psd';

  // Pointer interaction state
  private isPointerDown = false;
  private dragAction:
    | 'none'
    | 'pan'
    | 'stroke'
    | 'move-layer'
    | 'resize-layer'
    | 'create-selection'
    | 'resize-selection'
    | 'move-selection'
    | 'warp-node'
    | 'scale-text-side' = 'none';
  private lastDocPt: Point2D = { x: 0, y: 0 };
  private startDocPt: Point2D = { x: 0, y: 0 };
  private startClientPt: Point2D = { x: 0, y: 0 };
  private activeSelectionHandle: HandleType = null;
  private activeLayerHandle: HandleType = null;
  private initialSelectionBox = { x: 0, y: 0, width: 0, height: 0, rotation: 0 };
  private initialLayerBox = { x: 0, y: 0, width: 0, height: 0, rotation: 0 };
  private activeWarpCornerIndex = -1;
  private activeTextSide: 'left' | 'right' | null = null;
  private currentStampCanvas: HTMLCanvasElement | null = null;

  // Saved custom presets
  private savedPresets: DocumentPreset[] = DEFAULT_DOCUMENT_PRESETS.filter(
    (p) => p.category === 'saved',
  );

  constructor(root: HTMLElement) {
    this.root = root;
    this.compositeCanvas = document.createElement('canvas');
    this.compositeCanvas.width = this.docWidth;
    this.compositeCanvas.height = this.docHeight;
    this.compositeCtx = this.compositeCanvas.getContext('2d')!;

    this.initDefaultLayers();
    this.buildDOM();
    this.bindGlobalShortcuts();
    this.centerDocumentInViewport();
    this.startRenderLoop();
  }

  private initDefaultLayers(): void {
    this.layers = [];

    // 1. Background / Base file layer (unlocked so it can be freely moved AND resized smaller/larger across the entire gray workspace)
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = this.docWidth;
    bgCanvas.height = this.docHeight;
    const bgCtx = bgCanvas.getContext('2d')!;
    bgCtx.fillStyle = '#ffffff';
    bgCtx.fillRect(0, 0, this.docWidth, this.docHeight);

    const bgLayer: LayerItem = {
      id: 'layer-bg',
      name: 'Background',
      kind: 'background',
      visible: true,
      locked: false,
      lockTransparentPixels: false,
      lockPosition: false,
      blendMode: 'source-over',
      opacity: 100,
      fill: 100,
      x: 0,
      y: 0,
      width: this.docWidth,
      height: this.docHeight,
      rotation: 0,
      canvas: bgCanvas,
    };

    // 2. Active transparent drawing layer
    const drawCanvas = document.createElement('canvas');
    drawCanvas.width = this.docWidth;
    drawCanvas.height = this.docHeight;

    const layer1: LayerItem = {
      id: 'layer-1',
      name: 'Layer 1',
      kind: 'pixel',
      visible: true,
      locked: false,
      lockTransparentPixels: false,
      lockPosition: false,
      blendMode: 'source-over',
      opacity: 100,
      fill: 100,
      x: 0,
      y: 0,
      width: this.docWidth,
      height: this.docHeight,
      rotation: 0,
      canvas: drawCanvas,
    };

    this.layers.push(bgLayer, layer1);
    this.activeLayerId = layer1.id;
  }

  private getActiveLayer(): LayerItem | undefined {
    return this.layers.find((l) => l.id === this.activeLayerId);
  }

  private getActiveBrushOrEraser(): BrushSettings {
    return this.activeTool === 'eraser' ? this.eraserSettings : this.brushSettings;
  }

  private bringToFront(el: HTMLElement): void {
    this.topZIndex += 1;
    el.style.zIndex = String(this.topZIndex);
  }

  private buildDOM(): void {
    this.root.innerHTML = '';

    // Hidden file inputs for Image, Font (.ttf/.otf), and Photoshop Brush Pack (.abr/.json)
    this.hiddenImageInput = document.createElement('input');
    this.hiddenImageInput.type = 'file';
    this.hiddenImageInput.accept = 'image/*';
    this.hiddenImageInput.style.display = 'none';
    this.hiddenImageInput.addEventListener('change', () => {
      const file = this.hiddenImageInput.files?.[0];
      if (file) this.importImageFileAsLayer(file);
      this.hiddenImageInput.value = '';
    });

    this.hiddenFontInput = document.createElement('input');
    this.hiddenFontInput.type = 'file';
    this.hiddenFontInput.accept = '.ttf,.otf,.woff,.woff2';
    this.hiddenFontInput.style.display = 'none';
    this.hiddenFontInput.addEventListener('change', () => {
      const file = this.hiddenFontInput.files?.[0];
      if (file) this.loadCustomFontFile(file);
      this.hiddenFontInput.value = '';
    });

    this.hiddenBrushInput = document.createElement('input');
    this.hiddenBrushInput.type = 'file';
    this.hiddenBrushInput.accept = '.json,.abr';
    this.hiddenBrushInput.style.display = 'none';
    this.hiddenBrushInput.addEventListener('change', async () => {
      const file = this.hiddenBrushInput.files?.[0];
      if (file) {
        const imported = await importBrushPackFile(file);
        if (imported.length > 0) {
          this.brushPresets.push(...imported);
          this.selectBrushPreset(imported[0]);
          this.renderOptionsStrip();
          this.renderBrushPopover();
        }
      }
      this.hiddenBrushInput.value = '';
    });

    this.hiddenProjectInput = document.createElement('input');
    this.hiddenProjectInput.type = 'file';
    this.hiddenProjectInput.accept = '.ps,.psd,.json,image/*';
    this.hiddenProjectInput.style.display = 'none';
    this.hiddenProjectInput.addEventListener('change', () => {
      const file = this.hiddenProjectInput.files?.[0];
      if (file) this.importProjectOrImageFile(file);
      this.hiddenProjectInput.value = '';
    });

    // 1. Principal Fixed Top Bar (File Edit Image Layer Type Select Filter View Window Help + Options)
    const topbar = this.createPrincipalTopBar();

    // 2. Main Gray Workspace
    this.workspaceEl = document.createElement('div');
    this.workspaceEl.className = 'pc-workspace';

    this.viewportCanvas = document.createElement('canvas');
    this.viewportCanvas.className = 'pc-viewport-canvas';
    this.viewportCtx = this.viewportCanvas.getContext('2d')!;
    this.workspaceEl.appendChild(this.viewportCanvas);

    // 3. Floating Horizontal/Grid Tools Bar (Freely Movable + Lateral Resizing + Movable/Reorderable Icons)
    this.toolsBarEl = this.createFloatingToolsBar();
    this.workspaceEl.appendChild(this.toolsBarEl);

    // 4. Compact Floating Color Panel (Freely Movable + Lateral Resizing on Left/Right/Bottom/Corner)
    this.colorPanelEl = this.createColorPanel();
    this.workspaceEl.appendChild(this.colorPanelEl);

    // 5. Floating Layers Panel (Freely Movable + Lateral Resizing on Left/Right/Bottom/Corner)
    this.layersPanelEl = this.createLayersPanel();
    this.workspaceEl.appendChild(this.layersPanelEl);

    // 6. Bottom Status Pill with Quick Viewport Zoom (- / + / 100%) & Object Scale Controls
    const statusBar = document.createElement('div');
    statusBar.className = 'pc-status-bar';
    this.statusToolEl = document.createElement('span');
    this.statusCoordsEl = document.createElement('span');
    this.statusZoomEl = document.createElement('span');

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'pc-scale-btn';
    zoomOutBtn.title = 'Diminuir visualização da tela (Zoom -)';
    zoomOutBtn.textContent = '-';
    zoomOutBtn.addEventListener('click', () => this.adjustZoom(0.85));

    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'pc-scale-btn';
    zoomInBtn.title = 'Aumentar visualização da tela (Zoom +)';
    zoomInBtn.textContent = '+';
    zoomInBtn.addEventListener('click', () => this.adjustZoom(1.18));

    const objSmallerBtn = document.createElement('button');
    objSmallerBtn.className = 'pc-scale-btn';
    objSmallerBtn.style.width = 'auto';
    objSmallerBtn.style.padding = '0 4px';
    objSmallerBtn.title = 'Diminuir tamanho do Objeto / Arquivo Base ativo';
    objSmallerBtn.textContent = 'Obj -';
    objSmallerBtn.addEventListener('click', () => this.scaleActiveLayerByFactor(0.88));

    const objLargerBtn = document.createElement('button');
    objLargerBtn.className = 'pc-scale-btn';
    objLargerBtn.style.width = 'auto';
    objLargerBtn.style.padding = '0 4px';
    objLargerBtn.title = 'Aumentar tamanho do Objeto / Arquivo Base ativo';
    objLargerBtn.textContent = 'Obj +';
    objLargerBtn.addEventListener('click', () => this.scaleActiveLayerByFactor(1.14));

    statusBar.append(
      this.statusToolEl,
      this.statusCoordsEl,
      zoomOutBtn,
      this.statusZoomEl,
      zoomInBtn,
      objSmallerBtn,
      objLargerBtn,
    );
    this.workspaceEl.appendChild(statusBar);

    // 7. Right-Click Brush Settings Popover
    this.brushPopoverEl = document.createElement('div');
    this.brushPopoverEl.className = 'pc-brush-popover';
    this.root.appendChild(this.brushPopoverEl);

    // 8. New Document / Presets Modal
    this.newDocModalEl = this.createNewDocModal();
    this.root.appendChild(this.newDocModalEl);

    // 9. Export & Image Quality Modal (PNG, JPEG, WebP, PDF, SVG, PSD, .PS)
    this.exportModalEl = this.createExportModal();
    this.root.appendChild(this.exportModalEl);

    this.root.append(
      this.hiddenImageInput,
      this.hiddenProjectInput,
      this.hiddenFontInput,
      this.hiddenBrushInput,
      topbar,
      this.workspaceEl,
    );

    this.bindViewportEvents();
    this.renderToolsBar();
    this.renderOptionsStrip();
    this.renderColorPanelBody();
    this.renderLayersList();
    this.renderBrushPopover();
    this.updateStatusBar();

    window.addEventListener('resize', () => this.resizeViewportCanvas());
    requestAnimationFrame(() => this.resizeViewportCanvas());
  }

  private createPrincipalTopBar(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'pc-topbar';

    const menuRow = document.createElement('div');
    menuRow.className = 'pc-menubar-row';

    const brand = document.createElement('div');
    brand.className = 'pc-brand';
    brand.innerHTML = `<span class="pc-brand-badge"><img class="pc-brand-icon" src="/assets/aistudio/Untitled-1__1__08686f0b.png" alt="Piratex App Icon" referrerpolicy="no-referrer" /></span><span>Piratex</span>`;
    menuRow.appendChild(brand);

    const menus: Array<{
      id: string;
      label: string;
      items: Array<{ label: string; shortcut?: string; action?: () => void; divider?: boolean }>;
    }> = [
      {
        id: 'file',
        label: 'File',
        items: [
          { label: 'New Document / Presets...', shortcut: 'Ctrl+N', action: () => this.openNewDocModal() },
          { label: 'Open / Import Image or Project (.ps / .psd)...', shortcut: 'Ctrl+O', action: () => this.hiddenProjectInput.click() },
          { label: 'Colar Imagem / Objeto', shortcut: 'Ctrl+V', action: () => this.pasteClipboardOrSample() },
          { divider: true, label: '' },
          { label: 'Save Project (.ps)', shortcut: 'Ctrl+S', action: () => this.exportDocument('ps') },
          { label: 'Export PSD (.psd)', action: () => this.exportDocument('psd') },
          { label: 'Export PDF (.pdf)', action: () => this.exportDocument('pdf') },
          { label: 'Export PNG (.png)', action: () => this.exportDocument('png') },
          { label: 'Export JPEG (.jpg)', action: () => this.exportDocument('jpeg') },
          { label: 'Export WebP (.webp)', action: () => this.exportDocument('webp') },
          { label: 'Export SVG (.svg)', action: () => this.exportDocument('svg') },
          { divider: true, label: '' },
          { label: 'Opções de Qualidade de Imagem & Exportação...', shortcut: 'Ctrl+Shift+S', action: () => this.openExportModal() },
        ],
      },
      {
        id: 'edit',
        label: 'Edit',
        items: [
          { label: 'Desfazer (Undo)', shortcut: 'Ctrl+Z', action: () => this.undo() },
          { label: 'Copiar Seleção / Objeto (Copy)', shortcut: 'Ctrl+C', action: () => this.copySelectionOrActiveLayer() },
          { label: 'Recortar Seleção (Cut)', shortcut: 'Ctrl+X', action: () => this.cutSelectionFromActiveLayer() },
          { label: 'Colar Objeto Selecionado (Paste)', shortcut: 'Ctrl+V', action: () => this.pasteClipboardOrSample() },
          { divider: true, label: '' },
          { label: 'Aumentar Objeto / Arquivo Base (+15%)', action: () => this.scaleActiveLayerByFactor(1.15) },
          { label: 'Diminuir Objeto / Arquivo Base (-15%)', action: () => this.scaleActiveLayerByFactor(0.85) },
          { divider: true, label: '' },
          { label: 'Rotate Layer 0°', action: () => this.setActiveLayerAngle(0) },
          { label: 'Rotate Layer 90°', action: () => this.setActiveLayerAngle(90) },
          { label: 'Rotate Layer 180°', action: () => this.setActiveLayerAngle(180) },
        ],
      },
      {
        id: 'image',
        label: 'Image',
        items: [
          { label: 'Document Size / Presets...', action: () => this.openNewDocModal() },
          { label: 'Center View on Workspace', action: () => this.centerDocumentInViewport() },
        ],
      },
      {
        id: 'layer',
        label: 'Layer',
        items: [
          { label: 'New Pixel Layer', action: () => this.createNewPixelLayer() },
          { label: 'Duplicate Active Layer (+ Rename)', shortcut: 'Ctrl+J', action: () => this.duplicateActiveLayer() },
          { label: 'Cortar / Simplificar em 2 Layers (Laço)', action: () => this.splitActiveLayerWithSelection() },
          { divider: true, label: '' },
          { label: 'Delete Active Layer', shortcut: 'Del', action: () => this.deleteActiveLayer() },
        ],
      },
      {
        id: 'type',
        label: 'Type',
        items: [
          { label: 'Add Text Layer (T)', shortcut: 'T', action: () => this.setTool('text') },
          { label: 'Load Custom Font (.ttf / .otf)...', action: () => this.hiddenFontInput.click() },
          { label: 'Toggle Guide-Line Distortion (Warp)', action: () => this.toggleActiveTextWarp() },
        ],
      },
      {
        id: 'select',
        label: 'Select',
        items: [
          { label: 'Select All Document', shortcut: 'Ctrl+A', action: () => this.selectAll() },
          { label: 'Deselect', shortcut: 'Ctrl+D', action: () => this.clearSelection() },
          { label: 'Smart Selection (Seleção Inteligente)', action: () => this.setTool('smart-select') },
          { label: 'Split Layer by Selection (Cortar em 2)', action: () => this.splitActiveLayerWithSelection() },
        ],
      },
      {
        id: 'filter',
        label: 'Filter',
        items: [
          { label: 'Import Photoshop Brushes (.abr / .json)...', action: () => this.hiddenBrushInput.click() },
          { label: 'Export Brush Pack (.json)', action: () => exportBrushPack(this.brushPresets) },
        ],
      },
      {
        id: 'view',
        label: 'View',
        items: [
          { label: 'Aumentar Visualização (Zoom +)', action: () => this.adjustZoom(1.2) },
          { label: 'Diminuir Visualização (Zoom -)', action: () => this.adjustZoom(0.8) },
          { label: 'Reset 100% Zoom', action: () => { this.zoom = 1; this.centerDocumentInViewport(); } },
          { divider: true, label: '' },
          { label: 'Toggle Alignment Guides', action: () => { this.showGuides = !this.showGuides; } },
        ],
      },
      {
        id: 'window',
        label: 'Window',
        items: [
          { label: 'Alternar Barra de Funções Horizontal / Vertical', action: () => this.toggleToolsBarOrientation() },
          { label: 'Reagrupar Todos os Ícones na Barra de Funções', action: () => this.dockAllFloatingToolPins() },
          { label: 'Reset Floating Tools & Panels Position / Size', action: () => this.resetFloatingPositions() },
          { label: 'Open Brush Settings Popover (Right-Click)', action: () => this.openBrushPopoverAt(window.innerWidth / 2 - 130, 110) },
        ],
      },
      {
        id: 'help',
        label: 'Help',
        items: [
          { label: 'Arraste as laterais de Color, Layers ou Barra de Funções para redimensionar', action: () => {} },
          { label: 'Arraste qualquer ícone para reordenar ou Alt+Arraste para destacar livremente', action: () => {} },
        ],
      },
    ];

    menus.forEach((menu) => {
      const itemWrap = document.createElement('div');
      itemWrap.className = 'pc-menu-item';

      const btn = document.createElement('button');
      btn.className = 'pc-menu-btn';
      btn.textContent = menu.label;

      const dropdown = document.createElement('div');
      dropdown.className = 'pc-dropdown';
      dropdown.dataset.menuId = menu.id;

      menu.items.forEach((entry) => {
        if (entry.divider) {
          const div = document.createElement('div');
          div.className = 'pc-dropdown-divider';
          dropdown.appendChild(div);
          return;
        }
        const row = document.createElement('button');
        row.className = 'pc-dropdown-item';
        row.innerHTML = `<span>${entry.label}</span>${
          entry.shortcut ? `<span class="pc-dropdown-shortcut">${entry.shortcut}</span>` : ''
        }`;
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeAllDropdowns();
          entry.action?.();
        });
        dropdown.appendChild(row);
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = this.activeMenuDropdown === menu.id;
        this.closeAllDropdowns();
        if (!isOpen) {
          this.activeMenuDropdown = menu.id;
          dropdown.classList.add('open');
          btn.classList.add('active');
        }
      });

      itemWrap.append(btn, dropdown);
      menuRow.appendChild(itemWrap);
    });

    const quickRight = document.createElement('div');
    quickRight.style.marginLeft = 'auto';
    quickRight.style.display = 'flex';
    quickRight.style.alignItems = 'center';
    quickRight.style.gap = '5px';

    this.topHandBtnEl = document.createElement('button');
    this.topHandBtnEl.className = `pc-btn ${this.activeTool === 'hand' ? 'pc-btn-active' : ''}`;
    this.topHandBtnEl.title =
      'Hand (Atalho: M) — Movimentar todas as partes: Colors, Layers, Barra de Funções e Tela';
    this.topHandBtnEl.innerHTML = `${ICONS.hand}<span>Hand (M - Mover Tudo)</span>`;
    this.topHandBtnEl.addEventListener('click', () => {
      this.setTool(this.activeTool === 'hand' ? 'move' : 'hand');
    });

    const newBtn = document.createElement('button');
    newBtn.className = 'pc-btn';
    newBtn.innerHTML = `${ICONS.plus}<span>New / Presets</span>`;
    newBtn.addEventListener('click', () => this.openNewDocModal());

    const copyBtn = document.createElement('button');
    copyBtn.className = 'pc-btn';
    copyBtn.title = 'Copiar Objeto Selecionado via Laço (Ctrl+C)';
    copyBtn.innerHTML = `${ICONS.duplicate}<span>Copiar</span>`;
    copyBtn.addEventListener('click', () => this.copySelectionOrActiveLayer());

    const pasteBtn = document.createElement('button');
    pasteBtn.className = 'pc-btn';
    pasteBtn.title = 'Colar Objeto Selecionado (Ctrl+V)';
    pasteBtn.innerHTML = `${ICONS.paste}<span>Colar</span>`;
    pasteBtn.addEventListener('click', () => this.pasteClipboardOrSample());

    const undoBtn = document.createElement('button');
    undoBtn.className = 'pc-btn';
    undoBtn.title = 'Desfazer ação / colagem (Ctrl+Z)';
    undoBtn.innerHTML = `${ICONS.undo}<span>Ctrl+Z</span>`;
    undoBtn.addEventListener('click', () => this.undo());

    const qualitySelect = document.createElement('select');
    qualitySelect.className = 'pc-select';
    qualitySelect.title = 'Qualidade da Imagem para todos os formatos (PSD, .PS, PDF, PNG, JPEG, WebP, SVG)';
    qualitySelect.innerHTML = `
      <option value="100">Qualidade: 100% (Máx)</option>
      <option value="95" selected>Qualidade: 95% (Alta)</option>
      <option value="85">Qualidade: 85% (Boa)</option>
      <option value="70">Qualidade: 70% (Média)</option>
      <option value="50">Qualidade: 50% (Leve)</option>
      <option value="30">Qualidade: 30% (Baixa)</option>
    `;
    qualitySelect.addEventListener('change', () => {
      this.exportQuality = Number(qualitySelect.value) || 95;
    });

    const exportSelect = document.createElement('select');
    exportSelect.className = 'pc-select';
    exportSelect.innerHTML = `
      <option value="">Exportar / Salvar...</option>
      <option value="psd">PSD (.psd)</option>
      <option value="ps">Save Project (.ps)</option>
      <option value="pdf">PDF (.pdf)</option>
      <option value="png">PNG (.png)</option>
      <option value="jpeg">JPEG (.jpg)</option>
      <option value="webp">WebP (.webp)</option>
      <option value="svg">SVG (.svg)</option>
      <option value="modal">Opções de Qualidade...</option>
    `;
    exportSelect.addEventListener('change', () => {
      const val = exportSelect.value;
      if (val === 'modal') {
        this.openExportModal();
        exportSelect.value = '';
        return;
      }
      if (val) {
        this.exportDocument(val as ExportFormat);
        exportSelect.value = '';
      }
    });

    quickRight.append(
      this.topHandBtnEl,
      newBtn,
      copyBtn,
      pasteBtn,
      undoBtn,
      qualitySelect,
      exportSelect,
    );
    menuRow.appendChild(quickRight);

    this.optionsStripEl = document.createElement('div');
    this.optionsStripEl.className = 'pc-options-strip';

    header.append(menuRow, this.optionsStripEl);

    document.addEventListener('click', () => this.closeAllDropdowns());
    return header;
  }

  private createFloatingToolsBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'pc-floating-toolsbar';
    bar.id = 'pc-floating-toolsbar';
    bar.style.top = '10px';
    bar.style.left = '50%';
    bar.style.setProperty('--pc-tools-scale', String(this.toolsBarScale));

    // Allow fluid free movement from anywhere on the bar (except when reordering icons or dragging lateral resizers)
    this.setupFluidFreeMove(bar, bar);
    return bar;
  }

  private toggleToolsBarOrientation(): void {
    this.toolsBarVertical = !this.toolsBarVertical;
    if (this.toolsBarEl) {
      this.toolsBarEl.style.width = 'max-content';
    }
    this.renderToolsBar();

    // Ensure the bar remains fully visible inside the workspace when switching from vertical to horizontal
    if (this.toolsBarEl && this.workspaceEl) {
      requestAnimationFrame(() => {
        const wsRect = this.workspaceEl.getBoundingClientRect();
        const barRect = this.toolsBarEl.getBoundingClientRect();
        if (this.toolsBarEl.style.transform === 'none') {
          const curLeft = barRect.left - wsRect.left;
          const curTop = barRect.top - wsRect.top;
          const clampedLeft = Math.max(8, Math.min(wsRect.width - barRect.width - 8, curLeft));
          const clampedTop = Math.max(6, Math.min(wsRect.height - barRect.height - 8, curTop));
          this.toolsBarEl.style.left = `${Math.round(clampedLeft)}px`;
          this.toolsBarEl.style.top = `${Math.round(clampedTop)}px`;
        }
      });
    }
  }

  private renderToolsBar(): void {
    if (!this.toolsBarEl) return;
    this.toolsBarEl.innerHTML = '';
    this.toolsBarEl.classList.toggle('collapsed', this.toolsBarCollapsed);
    this.toolsBarEl.classList.toggle('is-vertical', this.toolsBarVertical);
    this.toolsBarEl.classList.toggle('is-horizontal', !this.toolsBarVertical);
    this.toolsBarEl.style.width = 'max-content';
    this.toolsBarEl.style.setProperty('--pc-tools-scale', String(this.toolsBarScale));

    // Lateral Left & Right Resize Handles on the Functions Bar (resize width or scale via lateral drag!)
    const leftSideResizer = document.createElement('div');
    leftSideResizer.className = 'pc-side-resizer-left';
    leftSideResizer.title = 'Arraste a lateral para aumentar/diminuir ou ajustar layout da barra de funções';

    const rightSideResizer = document.createElement('div');
    rightSideResizer.className = 'pc-side-resizer-right';
    rightSideResizer.title = 'Arraste a lateral para aumentar/diminuir ou ajustar layout da barra de funções';

    this.setupToolsBarLateralResize(this.toolsBarEl, leftSideResizer, 'left');
    this.setupToolsBarLateralResize(this.toolsBarEl, rightSideResizer, 'right');

    // Drag Grip Handle (for instant free movement anywhere on the workspace)
    const grip = document.createElement('div');
    grip.className = 'pc-toolsbar-grip';
    grip.title = 'Arraste livremente para mover a barra de funções (Duplo clique: alternar Horizontal/Vertical)';
    grip.innerHTML = `<svg viewBox="0 0 10 16" width="10" height="14" fill="currentColor"><circle cx="3" cy="3" r="1.2"/><circle cx="7" cy="3" r="1.2"/><circle cx="3" cy="8" r="1.2"/><circle cx="7" cy="8" r="1.2"/><circle cx="3" cy="13" r="1.2"/><circle cx="7" cy="13" r="1.2"/></svg>`;
    grip.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.toggleToolsBarOrientation();
    });

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'pc-toolsbar-items';

    let draggedIdx: number | null = null;

    this.toolItems.forEach((t, idx) => {
      // Skip if currently detached as an independent floating pin
      if (this.floatingToolPins.has(t.id)) return;

      const btn = document.createElement('button');
      btn.className = `pc-tool-btn ${this.activeTool === t.id ? 'active' : ''}`;
      btn.title = `${t.label} — Arraste para mover a posição do ícone ou Alt+Arraste para destacar`;
      btn.innerHTML = `${t.icon}${t.key ? `<span class="pc-key-hint">${t.key}</span>` : ''}`;
      btn.draggable = true;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setTool(t.id);
      });

      // Drag-and-drop to move/reorder icons inside the functions bar OR detach icon onto the workspace if dropped outside!
      btn.addEventListener('dragstart', (e) => {
        draggedIdx = idx;
        btn.classList.add('dragging-icon');
        e.dataTransfer?.setData('text/plain', t.id);
      });

      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        btn.classList.add('drag-over-icon');
      });

      btn.addEventListener('dragleave', () => {
        btn.classList.remove('drag-over-icon');
      });

      btn.addEventListener('drop', (e) => {
        e.preventDefault();
        btn.classList.remove('drag-over-icon');
        if (draggedIdx !== null && draggedIdx !== idx) {
          const [moved] = this.toolItems.splice(draggedIdx, 1);
          this.toolItems.splice(idx, 0, moved);
          draggedIdx = null;
          this.renderToolsBar();
        }
      });

      btn.addEventListener('dragend', (e) => {
        btn.classList.remove('dragging-icon');
        const barRect = this.toolsBarEl.getBoundingClientRect();
        const outsideBar =
          e.clientX < barRect.left - 28 ||
          e.clientX > barRect.right + 28 ||
          e.clientY < barRect.top - 28 ||
          e.clientY > barRect.bottom + 28;

        // If user dragged the icon outside the bar with Alt key or far away, spawn a free-floating icon pin!
        if (outsideBar && e.altKey && e.clientX > 0 && e.clientY > 0) {
          this.spawnFloatingToolPin(t, e.clientX, e.clientY);
        }
        draggedIdx = null;
      });

      itemsWrap.appendChild(btn);
    });

    // View Size & Orientation Controls (- / % / + / Rotate / Minimize)
    const scaleControls = document.createElement('div');
    scaleControls.className = 'pc-scale-controls';

    const decBtn = document.createElement('button');
    decBtn.className = 'pc-scale-btn';
    decBtn.title = 'Diminuir visualização do painel de funções';
    decBtn.textContent = '-';
    decBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toolsBarScale = Math.max(0.7, Math.round((this.toolsBarScale - 0.1) * 100) / 100);
      this.renderToolsBar();
    });

    const badge = document.createElement('span');
    badge.className = 'pc-scale-badge';
    badge.textContent = `${Math.round(this.toolsBarScale * 100)}%`;

    const incBtn = document.createElement('button');
    incBtn.className = 'pc-scale-btn';
    incBtn.title = 'Aumentar visualização do painel de funções';
    incBtn.textContent = '+';
    incBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toolsBarScale = Math.min(1.75, Math.round((this.toolsBarScale + 0.1) * 100) / 100);
      this.renderToolsBar();
    });

    const orientBtn = document.createElement('button');
    orientBtn.className = 'pc-scale-btn';
    orientBtn.title = 'Alternar orientação Horizontal / Vertical';
    orientBtn.textContent = this.toolsBarVertical ? '↔' : '↕';
    orientBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleToolsBarOrientation();
    });

    const minBtn = document.createElement('button');
    minBtn.className = 'pc-scale-btn';
    minBtn.title = this.toolsBarCollapsed
      ? 'Expandir painel de funções'
      : 'Minimizar painel de funções';
    minBtn.textContent = this.toolsBarCollapsed ? '□' : '—';
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toolsBarCollapsed = !this.toolsBarCollapsed;
      this.renderToolsBar();
    });

    scaleControls.append(decBtn, badge, incBtn, orientBtn, minBtn);
    this.toolsBarEl.append(leftSideResizer, grip, itemsWrap, scaleControls, rightSideResizer);
  }

  /**
   * Allows detaching an individual tool icon into a freely movable floating button on the workspace
   */
  private spawnFloatingToolPin(tool: ToolDescriptor, clientX: number, clientY: number): void {
    if (this.floatingToolPins.has(tool.id)) return;
    const wsRect = this.workspaceEl.getBoundingClientRect();

    const pin = document.createElement('div');
    pin.className = 'pc-floating-tool-pin';
    pin.style.left = `${Math.max(4, clientX - wsRect.left - 16)}px`;
    pin.style.top = `${Math.max(4, clientY - wsRect.top - 16)}px`;

    const btn = document.createElement('button');
    btn.className = `pc-tool-btn ${this.activeTool === tool.id ? 'active' : ''}`;
    btn.title = `${tool.label} (Arraste livremente; Duplo clique para devolver à barra)`;
    btn.innerHTML = `${tool.icon}${tool.key ? `<span class="pc-key-hint">${tool.key}</span>` : ''}`;
    btn.addEventListener('click', () => this.setTool(tool.id));
    btn.addEventListener('dblclick', () => {
      pin.remove();
      this.floatingToolPins.delete(tool.id);
      this.renderToolsBar();
    });

    pin.appendChild(btn);
    this.setupFluidFreeMove(pin, pin);
    this.workspaceEl.appendChild(pin);
    this.floatingToolPins.set(tool.id, pin);
    this.renderToolsBar();
  }

  private dockAllFloatingToolPins(): void {
    this.floatingToolPins.forEach((el) => el.remove());
    this.floatingToolPins.clear();
    this.renderToolsBar();
  }

  private renderOptionsStrip(): void {
    if (!this.optionsStripEl) return;
    this.optionsStripEl.innerHTML = '';

    const appendQuickScaleControls = () => {
      const rightGroup = document.createElement('div');
      rightGroup.style.marginLeft = 'auto';
      rightGroup.style.display = 'flex';
      rightGroup.style.alignItems = 'center';
      rightGroup.style.gap = '4px';

      const layer = this.getActiveLayer();
      const objLabel = document.createElement('span');
      objLabel.className = 'pc-opt-label';
      objLabel.textContent = `Tam. ${layer?.name ?? 'Objeto'}:`;

      const objDec = document.createElement('button');
      objDec.className = 'pc-btn';
      objDec.style.padding = '1px 6px';
      objDec.title = 'Diminuir tamanho do objeto / arquivo base';
      objDec.textContent = '-';
      objDec.addEventListener('click', () => this.scaleActiveLayerByFactor(0.88));

      const objInc = document.createElement('button');
      objInc.className = 'pc-btn';
      objInc.style.padding = '1px 6px';
      objInc.title = 'Aumentar tamanho do objeto / arquivo base';
      objInc.textContent = '+';
      objInc.addEventListener('click', () => this.scaleActiveLayerByFactor(1.14));

      const viewLabel = document.createElement('span');
      viewLabel.className = 'pc-opt-label';
      viewLabel.style.marginLeft = '4px';
      viewLabel.textContent = 'Zoom:';

      const zDec = document.createElement('button');
      zDec.className = 'pc-btn';
      zDec.style.padding = '1px 6px';
      zDec.textContent = '-';
      zDec.addEventListener('click', () => this.adjustZoom(0.85));

      const zInc = document.createElement('button');
      zInc.className = 'pc-btn';
      zInc.style.padding = '1px 6px';
      zInc.textContent = '+';
      zInc.addEventListener('click', () => this.adjustZoom(1.18));

      rightGroup.append(objLabel, objDec, objInc, viewLabel, zDec, zInc);
      this.optionsStripEl.appendChild(rightGroup);
    };

    if (this.activeTool === 'brush' || this.activeTool === 'eraser') {
      const settings = this.getActiveBrushOrEraser();
      const modeTitle = this.activeTool === 'brush' ? 'Pincel (P)' : 'Borracha (E)';

      const badge = document.createElement('span');
      badge.className = 'pc-opt-label';
      badge.style.color = '#ffffff';
      badge.style.fontWeight = '600';
      badge.textContent = modeTitle;
      this.optionsStripEl.appendChild(badge);

      const presetSelect = document.createElement('select');
      presetSelect.className = 'pc-select';
      this.brushPresets.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.size}px)`;
        if (p.id === this.activeBrushPresetId) opt.selected = true;
        presetSelect.appendChild(opt);
      });
      presetSelect.addEventListener('change', () => {
        const found = this.brushPresets.find((b) => b.id === presetSelect.value);
        if (found) this.selectBrushPreset(found);
      });
      this.optionsStripEl.appendChild(presetSelect);

      this.optionsStripEl.append(
        this.createSliderOption('Size', settings.size, 1, 200, 'px', (v) => {
          settings.size = v;
        }),
        this.createSliderOption('Opacity', settings.opacity, 1, 100, '%', (v) => {
          settings.opacity = v;
        }),
        this.createSliderOption('Flow', settings.flow, 1, 100, '%', (v) => {
          settings.flow = v;
        }),
        this.createSliderOption('Rotação', settings.rotation, 0, 360, '°', (v) => {
          settings.rotation = v;
        }),
      );

      const pixelBtn = document.createElement('button');
      pixelBtn.className = `pc-btn ${settings.pixelSnap ? 'pc-btn-active' : ''}`;
      pixelBtn.textContent = 'Pixels 1:1';
      pixelBtn.title = 'Modo Pixel Art sem suavização';
      pixelBtn.addEventListener('click', () => {
        settings.pixelSnap = !settings.pixelSnap;
        this.renderOptionsStrip();
      });
      this.optionsStripEl.appendChild(pixelBtn);

      const importAbrBtn = document.createElement('button');
      importAbrBtn.className = 'pc-btn';
      importAbrBtn.textContent = 'Import .ABR';
      importAbrBtn.addEventListener('click', () => this.hiddenBrushInput.click());

      const exportAbrBtn = document.createElement('button');
      exportAbrBtn.className = 'pc-btn';
      exportAbrBtn.textContent = 'Export Pack';
      exportAbrBtn.addEventListener('click', () => exportBrushPack(this.brushPresets));

      this.optionsStripEl.append(importAbrBtn, exportAbrBtn);
      appendQuickScaleControls();
      return;
    }

    if (this.activeTool === 'move') {
      const layer = this.getActiveLayer();
      const info = document.createElement('span');
      info.className = 'pc-opt-label';
      info.textContent = `Ativo: ${layer ? `${layer.name} (${Math.round(layer.width)}×${Math.round(layer.height)}px)` : 'Nenhum'} — Arraste o centro para mover ou as laterais/cantos para aumentar/diminuir`;
      this.optionsStripEl.appendChild(info);

      [0, 90, 180].forEach((deg) => {
        const btn = document.createElement('button');
        btn.className = `pc-btn ${layer?.rotation === deg ? 'pc-btn-active' : ''}`;
        btn.textContent = `${deg}°`;
        btn.addEventListener('click', () => this.setActiveLayerAngle(deg));
        this.optionsStripEl.appendChild(btn);
      });

      const guideBtn = document.createElement('button');
      guideBtn.className = `pc-btn ${this.showGuides ? 'pc-btn-active' : ''}`;
      guideBtn.innerHTML = `${ICONS.guides}<span>Linhas Guias</span>`;
      guideBtn.addEventListener('click', () => {
        this.showGuides = !this.showGuides;
        this.renderOptionsStrip();
      });
      this.optionsStripEl.appendChild(guideBtn);
      appendQuickScaleControls();
      return;
    }

    if (
      this.activeTool === 'select-quad' ||
      this.activeTool === 'select-triangle' ||
      this.activeTool === 'select-ellipse' ||
      this.activeTool === 'lasso' ||
      this.activeTool === 'smart-select'
    ) {
      if (this.activeTool === 'smart-select') {
        this.optionsStripEl.appendChild(
          this.createSliderOption('Tolerância IA', this.smartTolerance, 1, 128, '', (v) => {
            this.smartTolerance = v;
          }),
        );
      }

      const copySelBtn = document.createElement('button');
      copySelBtn.className = 'pc-btn pc-btn-primary';
      copySelBtn.title = 'Copiar objeto selecionado pelo laço (Ctrl+C)';
      copySelBtn.innerHTML = `${ICONS.duplicate}<span>Copiar Seleção (Ctrl+C)</span>`;
      copySelBtn.addEventListener('click', () => this.copySelectionOrActiveLayer());

      const pasteSelBtn = document.createElement('button');
      pasteSelBtn.className = 'pc-btn pc-btn-primary';
      pasteSelBtn.title = 'Colar objeto copiado em nova layer (Ctrl+V)';
      pasteSelBtn.innerHTML = `${ICONS.paste}<span>Colar (Ctrl+V)</span>`;
      pasteSelBtn.addEventListener('click', () => this.pasteClipboardOrSample());

      const undoSelBtn = document.createElement('button');
      undoSelBtn.className = 'pc-btn';
      undoSelBtn.title = 'Desfazer (Ctrl+Z)';
      undoSelBtn.innerHTML = `${ICONS.undo}<span>Desfazer (Ctrl+Z)</span>`;
      undoSelBtn.addEventListener('click', () => this.undo());

      const splitBtn = document.createElement('button');
      splitBtn.className = 'pc-btn';
      splitBtn.innerHTML = `${ICONS.scissors}<span>Cortar em 2 Layers</span>`;
      splitBtn.addEventListener('click', () => this.splitActiveLayerWithSelection());

      const clearSelBtn = document.createElement('button');
      clearSelBtn.className = 'pc-btn';
      clearSelBtn.textContent = 'Limpar (Ctrl+D)';
      clearSelBtn.addEventListener('click', () => this.clearSelection());

      const hint = document.createElement('span');
      hint.className = 'pc-opt-label';
      hint.textContent =
        this.activeTool === 'lasso'
          ? this.isLassoDrawing
            ? 'Laço Livre ativo: continue desenhando até uma ponta cruzar a outra para fechar!'
            : 'Desenhe livremente e cruze uma ponta na outra para fechar (Ctrl+C / Ctrl+V / Ctrl+Z)'
          : 'Redimensione a seleção criada pelas 8 alças laterais';

      this.optionsStripEl.append(
        copySelBtn,
        pasteSelBtn,
        undoSelBtn,
        splitBtn,
        clearSelBtn,
        hint,
      );
      appendQuickScaleControls();
      return;
    }

    if (this.activeTool === 'bucket') {
      const solidBtn = document.createElement('button');
      solidBtn.className = `pc-btn ${this.bucketSettings.mode === 'solid' ? 'pc-btn-active' : ''}`;
      solidBtn.textContent = 'Cor Sólida';
      solidBtn.addEventListener('click', () => {
        this.bucketSettings.mode = 'solid';
        this.renderOptionsStrip();
      });

      const gradBtn = document.createElement('button');
      gradBtn.className = `pc-btn ${this.bucketSettings.mode === 'gradient' ? 'pc-btn-active' : ''}`;
      gradBtn.textContent = 'Gradiente';
      gradBtn.addEventListener('click', () => {
        this.bucketSettings.mode = 'gradient';
        this.renderOptionsStrip();
      });

      this.optionsStripEl.append(
        solidBtn,
        gradBtn,
        this.createSliderOption('Tolerância', this.bucketSettings.tolerance, 0, 200, '', (v) => {
          this.bucketSettings.tolerance = v;
        }),
      );
      appendQuickScaleControls();
      return;
    }

    if (this.activeTool === 'text') {
      const activeLayer = this.getActiveLayer();
      const textData = activeLayer?.kind === 'text' ? activeLayer.textData : null;

      const textInput = document.createElement('input');
      textInput.className = 'pc-input';
      textInput.style.width = '145px';
      textInput.placeholder = 'Digite o texto da layer...';
      textInput.value = textData?.text ?? 'Novo Texto';
      textInput.addEventListener('input', () => {
        const layer = this.ensureActiveTextLayer();
        if (layer.textData) {
          layer.textData.text = textInput.value || 'Texto';
          renderTextLayerCanvas(layer);
          this.renderLayersList();
        }
      });

      const fontSelect = document.createElement('select');
      fontSelect.className = 'pc-select';
      this.availableFonts.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        if ((textData?.fontFamily ?? this.availableFonts[0]) === f) {
          opt.selected = true;
        }
        fontSelect.appendChild(opt);
      });
      fontSelect.addEventListener('change', () => {
        const layer = this.ensureActiveTextLayer();
        if (layer.textData) {
          layer.textData.fontFamily = fontSelect.value;
          renderTextLayerCanvas(layer);
        }
      });

      const addFontBtn = document.createElement('button');
      addFontBtn.className = 'pc-btn';
      addFontBtn.textContent = '+ Fonte (.ttf)';
      addFontBtn.addEventListener('click', () => this.hiddenFontInput.click());

      const sizeSlider = this.createSliderOption(
        'Tam',
        textData?.fontSize ?? 44,
        10,
        180,
        'px',
        (v) => {
          const layer = this.ensureActiveTextLayer();
          if (layer.textData) {
            layer.textData.fontSize = v;
            renderTextLayerCanvas(layer);
          }
        },
      );

      const alignGroup = document.createElement('div');
      alignGroup.className = 'pc-opt-group';
      (['left', 'center', 'right'] as const).forEach((al) => {
        const btn = document.createElement('button');
        btn.className = `pc-btn ${(textData?.align ?? 'center') === al ? 'pc-btn-active' : ''}`;
        btn.textContent = al === 'left' ? 'Esq' : al === 'center' ? 'Centro' : 'Dir';
        btn.addEventListener('click', () => {
          const layer = this.ensureActiveTextLayer();
          if (layer.textData) {
            layer.textData.align = al;
            renderTextLayerCanvas(layer);
          }
          this.renderOptionsStrip();
        });
        alignGroup.appendChild(btn);
      });

      [0, 90, 180].forEach((deg) => {
        const btn = document.createElement('button');
        btn.className = `pc-btn ${activeLayer?.rotation === deg ? 'pc-btn-active' : ''}`;
        btn.textContent = `${deg}°`;
        btn.addEventListener('click', () => this.setActiveLayerAngle(deg));
        alignGroup.appendChild(btn);
      });

      const warpBtn = document.createElement('button');
      warpBtn.className = `pc-btn ${textData?.warpEnabled ? 'pc-btn-active' : ''}`;
      warpBtn.innerHTML = `${ICONS.warpGrid}<span>Distorcer (Guias)</span>`;
      warpBtn.addEventListener('click', () => this.toggleActiveTextWarp());

      this.optionsStripEl.append(
        textInput,
        fontSelect,
        addFontBtn,
        sizeSlider,
        alignGroup,
        warpBtn,
      );
      appendQuickScaleControls();
      return;
    }

    if (this.activeTool === 'hand') {
      const badge = document.createElement('span');
      badge.className = 'pc-opt-label';
      badge.style.color = 'var(--pc-text-bright)';
      badge.style.fontWeight = '700';
      badge.textContent = 'HAND (M) ATIVO:';

      const info = document.createElement('span');
      info.className = 'pc-opt-label';
      info.textContent =
        'Clique e arraste em QUALQUER parte de Colors, Layers, Barra de Funções ou da Tela para movimentar livremente!';

      const resetPanelsBtn = document.createElement('button');
      resetPanelsBtn.className = 'pc-btn';
      resetPanelsBtn.textContent = 'Resetar Posição Colors & Layers';
      resetPanelsBtn.addEventListener('click', () => this.resetFloatingPositions());

      const fitBtn = document.createElement('button');
      fitBtn.className = 'pc-btn';
      fitBtn.textContent = 'Centralizar Tela';
      fitBtn.addEventListener('click', () => this.centerDocumentInViewport());

      this.optionsStripEl.append(badge, info, resetPanelsBtn, fitBtn);
      appendQuickScaleControls();
      return;
    }

    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'pc-btn';
    zoomInBtn.textContent = 'Zoom +';
    zoomInBtn.addEventListener('click', () => this.adjustZoom(1.2));

    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'pc-btn';
    zoomOutBtn.textContent = 'Zoom -';
    zoomOutBtn.addEventListener('click', () => this.adjustZoom(0.8));

    const fitBtn = document.createElement('button');
    fitBtn.className = 'pc-btn';
    fitBtn.textContent = 'Centralizar Tela';
    fitBtn.addEventListener('click', () => this.centerDocumentInViewport());

    this.optionsStripEl.append(zoomInBtn, zoomOutBtn, fitBtn);
    appendQuickScaleControls();
  }

  private createSliderOption(
    label: string,
    initialValue: number,
    min: number,
    max: number,
    unit: string,
    onChange: (val: number) => void,
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'pc-opt-group';

    const lbl = document.createElement('span');
    lbl.className = 'pc-opt-label';
    lbl.textContent = `${label}:`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'pc-slider';
    slider.min = String(min);
    slider.max = String(max);
    slider.value = String(initialValue);

    const num = document.createElement('input');
    num.type = 'number';
    num.className = 'pc-input pc-input-num';
    num.min = String(min);
    num.max = String(max);
    num.value = String(Math.round(initialValue));

    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      num.value = String(v);
      onChange(v);
    });

    num.addEventListener('change', () => {
      const v = Math.max(min, Math.min(max, Number(num.value) || min));
      num.value = String(v);
      slider.value = String(v);
      onChange(v);
    });

    wrap.append(lbl, slider, num);
    if (unit) {
      const u = document.createElement('span');
      u.className = 'pc-opt-label';
      u.textContent = unit;
      wrap.appendChild(u);
    }
    return wrap;
  }

  private createColorPanel(): HTMLElement {
    const panel = document.createElement('aside');
    panel.className = 'pc-floating-panel';
    panel.id = 'pc-color-panel';
    panel.style.left = '18px';
    panel.style.top = '14px';
    panel.style.width = '224px';

    const header = document.createElement('div');
    header.className = 'pc-panel-header';

    const grip = document.createElement('span');
    grip.className = 'pc-panel-drag-grip';
    grip.title = 'Arrastar painel de Cor livremente';
    grip.innerHTML = `<svg viewBox="0 0 10 16" width="10" height="14" fill="currentColor"><circle cx="3" cy="3" r="1.2"/><circle cx="7" cy="3" r="1.2"/><circle cx="3" cy="8" r="1.2"/><circle cx="7" cy="8" r="1.2"/><circle cx="3" cy="13" r="1.2"/><circle cx="7" cy="13" r="1.2"/></svg>`;

    const tabs = document.createElement('div');
    tabs.className = 'pc-panel-tabs';

    (['color', 'swatches', 'gradients', 'patterns'] as const).forEach((tabId) => {
      const btn = document.createElement('button');
      btn.className = `pc-panel-tab ${this.colorTab === tabId ? 'active' : ''}`;
      btn.textContent = tabId.charAt(0).toUpperCase() + tabId.slice(1);
      btn.addEventListener('click', () => {
        this.colorTab = tabId;
        tabs.querySelectorAll('.pc-panel-tab').forEach((el) => el.classList.remove('active'));
        btn.classList.add('active');
        this.renderColorPanelBody();
      });
      tabs.appendChild(btn);
    });

    // Quick +/- width buttons + minimize
    const scaleWrap = document.createElement('div');
    scaleWrap.className = 'pc-scale-controls';

    const decBtn = document.createElement('button');
    decBtn.className = 'pc-scale-btn';
    decBtn.title = 'Diminuir largura/tamanho do painel Color';
    decBtn.textContent = '-';
    decBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resizePanelByDelta(panel, -24, -14);
    });

    const incBtn = document.createElement('button');
    incBtn.className = 'pc-scale-btn';
    incBtn.title = 'Aumentar largura/tamanho do painel Color';
    incBtn.textContent = '+';
    incBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resizePanelByDelta(panel, 24, 14);
    });

    const minBtn = document.createElement('button');
    minBtn.className = 'pc-scale-btn';
    minBtn.title = 'Minimizar / Expandir painel Color';
    minBtn.textContent = '—';
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.colorPanelCollapsed = !this.colorPanelCollapsed;
      panel.classList.toggle('collapsed', this.colorPanelCollapsed);
      minBtn.textContent = this.colorPanelCollapsed ? '□' : '—';
    });

    scaleWrap.append(decBtn, incBtn, minBtn);
    header.append(grip, tabs, scaleWrap);

    this.colorPanelBodyEl = document.createElement('div');
    this.colorPanelBodyEl.className = 'pc-panel-body';

    // Lateral Left, Right, Bottom, and Corner Resize Handles for Color Panel
    this.attachPanelLateralResizers(panel, 168, 460);

    panel.append(header, this.colorPanelBodyEl);
    this.setupFluidFreeMove(panel, panel);
    return panel;
  }

  private renderColorPanelBody(): void {
    if (!this.colorPanelBodyEl) return;
    this.colorPanelBodyEl.innerHTML = '';

    if (this.colorTab === 'color') {
      const row = document.createElement('div');
      row.className = 'pc-color-picker-layout';

      const cluster = document.createElement('div');
      cluster.className = 'pc-fg-bg-Cluster';

      const fgBox = document.createElement('div');
      fgBox.className = 'pc-swatch-fg';
      fgBox.style.background = this.fgColor;
      fgBox.title = 'Foreground Color (Click to swap with Background)';

      const bgBox = document.createElement('div');
      bgBox.className = 'pc-swatch-bg';
      bgBox.style.background = this.bgColor;
      bgBox.title = 'Background Color';

      cluster.addEventListener('click', () => {
        const tmp = this.fgColor;
        this.fgColor = this.bgColor;
        this.bgColor = tmp;
        this.syncHsvFromHex(this.fgColor);
        this.renderColorPanelBody();
      });
      cluster.append(fgBox, bgBox);

      const svBox = document.createElement('div');
      svBox.className = 'pc-sv-box';
      svBox.style.background = `
        linear-gradient(to top, #000, transparent),
        linear-gradient(to right, #fff, hsl(${this.hsv.h}, 100%, 50%))
      `;

      const svCursor = document.createElement('div');
      svCursor.className = 'pc-sv-cursor';
      svCursor.style.left = `${this.hsv.s}%`;
      svCursor.style.top = `${100 - this.hsv.v}%`;
      svBox.appendChild(svCursor);

      const updateSV = (e: MouseEvent) => {
        const rect = svBox.getBoundingClientRect();
        this.hsv.s = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        this.hsv.v = Math.max(
          0,
          Math.min(100, 100 - ((e.clientY - rect.top) / rect.height) * 100),
        );
        this.fgColor = this.hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);
        this.applyColorToActiveTextIfSelected();
        this.renderColorPanelBody();
      };

      svBox.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        updateSV(e);
        const move = (ev: MouseEvent) => updateSV(ev);
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      });

      const hueStrip = document.createElement('div');
      hueStrip.className = 'pc-hue-strip';

      const hueThumb = document.createElement('div');
      hueThumb.className = 'pc-hue-thumb';
      hueThumb.style.top = `${(this.hsv.h / 360) * 100}%`;
      hueStrip.appendChild(hueThumb);

      const updateHue = (e: MouseEvent) => {
        const rect = hueStrip.getBoundingClientRect();
        this.hsv.h = Math.max(0, Math.min(360, ((e.clientY - rect.top) / rect.height) * 360));
        this.fgColor = this.hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);
        this.applyColorToActiveTextIfSelected();
        this.renderColorPanelBody();
      };

      hueStrip.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        updateHue(e);
        const move = (ev: MouseEvent) => updateHue(ev);
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      });

      row.append(cluster, svBox, hueStrip);
      this.colorPanelBodyEl.appendChild(row);

      const rgb = hexToRgb(this.fgColor);
      const rgbRow = document.createElement('div');
      rgbRow.className = 'pc-rgb-row';
      rgbRow.innerHTML = `
        <label>#</label>
        <input type="text" class="pc-input" id="pc-hex-inp" value="${this.fgColor.replace('#', '').toUpperCase()}" style="width:52px;font-family:var(--pc-font-mono);padding:1px 3px;" />
        <label>R</label>
        <input type="number" class="pc-input pc-input-num" id="pc-r-inp" min="0" max="255" value="${rgb.r}" style="width:32px;padding:1px 2px;" />
        <label>G</label>
        <input type="number" class="pc-input pc-input-num" id="pc-g-inp" min="0" max="255" value="${rgb.g}" style="width:32px;padding:1px 2px;" />
        <label>B</label>
        <input type="number" class="pc-input pc-input-num" id="pc-b-inp" min="0" max="255" value="${rgb.b}" style="width:32px;padding:1px 2px;" />
      `;

      const hexInp = rgbRow.querySelector('#pc-hex-inp') as HTMLInputElement;
      const rInp = rgbRow.querySelector('#pc-r-inp') as HTMLInputElement;
      const gInp = rgbRow.querySelector('#pc-g-inp') as HTMLInputElement;
      const bInp = rgbRow.querySelector('#pc-b-inp') as HTMLInputElement;

      hexInp.addEventListener('change', () => {
        const clean = hexInp.value.replace(/[^0-9a-fA-F]/g, '');
        if (clean.length === 6) {
          this.fgColor = `#${clean.toLowerCase()}`;
          this.syncHsvFromHex(this.fgColor);
          this.applyColorToActiveTextIfSelected();
          this.renderColorPanelBody();
        }
      });

      const onRgbChange = () => {
        const r = Math.max(0, Math.min(255, Number(rInp.value) || 0));
        const g = Math.max(0, Math.min(255, Number(gInp.value) || 0));
        const b = Math.max(0, Math.min(255, Number(bInp.value) || 0));
        this.fgColor = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
        this.syncHsvFromHex(this.fgColor);
        this.applyColorToActiveTextIfSelected();
        this.renderColorPanelBody();
      };
      rInp.addEventListener('change', onRgbChange);
      gInp.addEventListener('change', onRgbChange);
      bInp.addEventListener('change', onRgbChange);

      this.colorPanelBodyEl.appendChild(rgbRow);
      return;
    }

    if (this.colorTab === 'swatches') {
      const grid = document.createElement('div');
      grid.className = 'pc-swatches-grid';
      this.swatches.forEach((hex) => {
        const cell = document.createElement('div');
        cell.className = 'pc-swatch-cell';
        cell.style.background = hex;
        cell.title = hex;
        cell.addEventListener('click', () => {
          this.fgColor = hex;
          this.syncHsvFromHex(hex);
          this.applyColorToActiveTextIfSelected();
        });
        grid.appendChild(cell);
      });
      this.colorPanelBodyEl.appendChild(grid);
      return;
    }

    if (this.colorTab === 'gradients') {
      const list = document.createElement('div');
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '4px';
      this.gradients.forEach((g) => {
        const item = document.createElement('div');
        item.style.height = '22px';
        item.style.borderRadius = '3px';
        item.style.cursor = 'pointer';
        item.style.border =
          g.id === this.activeGradientId ? '2px solid var(--pc-accent)' : '1px solid #141414';
        const stopsCss = g.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ');
        item.style.background = `linear-gradient(90deg, ${stopsCss})`;
        item.title = g.name;
        item.addEventListener('click', () => {
          this.activeGradientId = g.id;
          this.bucketSettings.mode = 'gradient';
          this.renderColorPanelBody();
          this.renderOptionsStrip();
        });
        list.appendChild(item);
      });
      this.colorPanelBodyEl.appendChild(list);
      return;
    }

    const patInfo = document.createElement('div');
    patInfo.style.color = 'var(--pc-text-muted)';
    patInfo.style.fontSize = '11px';
    patInfo.textContent = 'Selecione um padrão para preencher a layer ativa:';
    this.colorPanelBodyEl.appendChild(patInfo);

    const patBtn = document.createElement('button');
    patBtn.className = 'pc-btn';
    patBtn.textContent = 'Aplicar Grid Técnico';
    patBtn.addEventListener('click', () => this.applyCheckerPatternToLayer());
    this.colorPanelBodyEl.appendChild(patBtn);
  }

  private createLayersPanel(): HTMLElement {
    const panel = document.createElement('aside');
    panel.className = 'pc-floating-panel';
    panel.id = 'pc-layers-panel';
    panel.style.width = '268px';
    panel.style.right = '22px';
    panel.style.bottom = '24px';

    const header = document.createElement('div');
    header.className = 'pc-panel-header';

    const grip = document.createElement('span');
    grip.className = 'pc-panel-drag-grip';
    grip.title = 'Arrastar painel de Layers livremente';
    grip.innerHTML = `<svg viewBox="0 0 10 16" width="10" height="14" fill="currentColor"><circle cx="3" cy="3" r="1.2"/><circle cx="7" cy="3" r="1.2"/><circle cx="3" cy="8" r="1.2"/><circle cx="7" cy="8" r="1.2"/><circle cx="3" cy="13" r="1.2"/><circle cx="7" cy="13" r="1.2"/></svg>`;

    const tabs = document.createElement('div');
    tabs.className = 'pc-panel-tabs';
    tabs.innerHTML = `
      <button class="pc-panel-tab active">Layers</button>
      <button class="pc-panel-tab">Channels</button>
      <button class="pc-panel-tab">Paths</button>
    `;

    // Quick +/- width/height buttons + minimize for Layers Panel
    const scaleWrap = document.createElement('div');
    scaleWrap.className = 'pc-scale-controls';

    const decBtn = document.createElement('button');
    decBtn.className = 'pc-scale-btn';
    decBtn.title = 'Diminuir largura/tamanho do painel Layers';
    decBtn.textContent = '-';
    decBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resizePanelByDelta(panel, -26, -24);
    });

    const incBtn = document.createElement('button');
    incBtn.className = 'pc-scale-btn';
    incBtn.title = 'Aumentar largura/tamanho do painel Layers';
    incBtn.textContent = '+';
    incBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resizePanelByDelta(panel, 26, 24);
    });

    const minBtn = document.createElement('button');
    minBtn.className = 'pc-scale-btn';
    minBtn.title = 'Minimizar / Expandir painel Layers';
    minBtn.textContent = '—';
    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.layersPanelCollapsed = !this.layersPanelCollapsed;
      panel.classList.toggle('collapsed', this.layersPanelCollapsed);
      minBtn.textContent = this.layersPanelCollapsed ? '□' : '—';
    });

    scaleWrap.append(decBtn, incBtn, minBtn);
    header.append(grip, tabs, scaleWrap);

    const body = document.createElement('div');
    body.className = 'pc-panel-body';

    const filterRow = document.createElement('div');
    filterRow.className = 'pc-layers-filter-row';
    filterRow.innerHTML = `<span class="pc-opt-label">Kind</span>`;

    const filterBtns = document.createElement('div');
    filterBtns.style.display = 'flex';
    filterBtns.style.gap = '3px';
    (['all', 'pixel', 'text'] as const).forEach((kind) => {
      const b = document.createElement('button');
      b.className = `pc-btn ${this.layerFilterKind === kind ? 'pc-btn-active' : ''}`;
      b.style.padding = '1px 5px';
      b.textContent = kind === 'all' ? 'All' : kind === 'pixel' ? 'Pixel' : 'T';
      b.addEventListener('click', () => {
        this.layerFilterKind = kind;
        this.renderLayersList();
      });
      filterBtns.appendChild(b);
    });
    filterRow.appendChild(filterBtns);

    const blendRow = document.createElement('div');
    blendRow.className = 'pc-layers-blend-row';

    this.layerBlendSelect = document.createElement('select');
    this.layerBlendSelect.className = 'pc-select';
    this.layerBlendSelect.style.flex = '1';
    BLEND_MODES.forEach((bm) => {
      const opt = document.createElement('option');
      opt.value = bm.value;
      opt.textContent = bm.label;
      this.layerBlendSelect.appendChild(opt);
    });
    this.layerBlendSelect.addEventListener('change', () => {
      const layer = this.getActiveLayer();
      if (layer) layer.blendMode = this.layerBlendSelect.value as GlobalCompositeOperation;
    });

    const opLabel = document.createElement('span');
    opLabel.className = 'pc-opt-label';
    opLabel.textContent = 'Opacity:';

    this.layerOpacityInput = document.createElement('input');
    this.layerOpacityInput.type = 'number';
    this.layerOpacityInput.className = 'pc-input pc-input-num';
    this.layerOpacityInput.min = '0';
    this.layerOpacityInput.max = '100';
    this.layerOpacityInput.value = '100';
    this.layerOpacityInput.addEventListener('input', () => {
      const layer = this.getActiveLayer();
      if (layer) {
        layer.opacity = Math.max(0, Math.min(100, Number(this.layerOpacityInput.value) || 0));
      }
    });

    blendRow.append(this.layerBlendSelect, opLabel, this.layerOpacityInput);

    const lockRow = document.createElement('div');
    lockRow.className = 'pc-layers-lock-row';

    const lockBtn = document.createElement('button');
    lockBtn.className = 'pc-btn';
    lockBtn.innerHTML = `${ICONS.lock}<span>Lock</span>`;
    lockBtn.addEventListener('click', () => {
      const layer = this.getActiveLayer();
      if (layer) {
        layer.locked = !layer.locked;
        this.renderLayersList();
      }
    });

    const fillWrap = document.createElement('div');
    fillWrap.className = 'pc-opt-group';
    const fillLabel = document.createElement('span');
    fillLabel.className = 'pc-opt-label';
    fillLabel.textContent = 'Fill:';

    this.layerFillInput = document.createElement('input');
    this.layerFillInput.type = 'number';
    this.layerFillInput.className = 'pc-input pc-input-num';
    this.layerFillInput.min = '0';
    this.layerFillInput.max = '100';
    this.layerFillInput.value = '100';
    this.layerFillInput.addEventListener('input', () => {
      const layer = this.getActiveLayer();
      if (layer) {
        layer.fill = Math.max(0, Math.min(100, Number(this.layerFillInput.value) || 0));
      }
    });

    fillWrap.append(fillLabel, this.layerFillInput);
    lockRow.append(lockBtn, fillWrap);

    this.layersListEl = document.createElement('div');
    this.layersListEl.className = 'pc-layers-list';

    const footer = document.createElement('div');
    footer.className = 'pc-layers-footer';

    const scaleDownBtn = document.createElement('button');
    scaleDownBtn.className = 'pc-tool-btn';
    scaleDownBtn.title = 'Diminuir tamanho da Layer / Arquivo Base ativo (-)';
    scaleDownBtn.textContent = '−';
    scaleDownBtn.addEventListener('click', () => this.scaleActiveLayerByFactor(0.88));

    const scaleUpBtn = document.createElement('button');
    scaleUpBtn.className = 'pc-tool-btn';
    scaleUpBtn.title = 'Aumentar tamanho da Layer / Arquivo Base ativo (+)';
    scaleUpBtn.textContent = '+';
    scaleUpBtn.addEventListener('click', () => this.scaleActiveLayerByFactor(1.14));

    const splitBtn = document.createElement('button');
    splitBtn.className = 'pc-tool-btn';
    splitBtn.title = 'Cortar / Simplificar Layer em 2 pelo Laço';
    splitBtn.innerHTML = ICONS.scissors;
    splitBtn.addEventListener('click', () => this.splitActiveLayerWithSelection());

    const upBtn = document.createElement('button');
    upBtn.className = 'pc-tool-btn';
    upBtn.title = 'Mover Layer para Cima (Sobreposição)';
    upBtn.innerHTML = ICONS.arrowUp;
    upBtn.addEventListener('click', () => this.moveActiveLayerOrder(1));

    const downBtn = document.createElement('button');
    downBtn.className = 'pc-tool-btn';
    downBtn.title = 'Mover Layer para Baixo';
    downBtn.innerHTML = ICONS.arrowDown;
    downBtn.addEventListener('click', () => this.moveActiveLayerOrder(-1));

    const dupBtn = document.createElement('button');
    dupBtn.className = 'pc-tool-btn';
    dupBtn.title = 'Duplicar e Renomear Layer (Ctrl+J)';
    dupBtn.innerHTML = ICONS.duplicate;
    dupBtn.addEventListener('click', () => this.duplicateActiveLayer());

    const addBtn = document.createElement('button');
    addBtn.className = 'pc-tool-btn';
    addBtn.title = 'Nova Layer';
    addBtn.innerHTML = ICONS.plus;
    addBtn.addEventListener('click', () => this.createNewPixelLayer());

    const delBtn = document.createElement('button');
    delBtn.className = 'pc-tool-btn';
    delBtn.title = 'Deletar Layer Ativa';
    delBtn.innerHTML = ICONS.trash;
    delBtn.addEventListener('click', () => this.deleteActiveLayer());

    footer.append(scaleDownBtn, scaleUpBtn, splitBtn, upBtn, downBtn, dupBtn, addBtn, delBtn);

    // Lateral Left, Right, Bottom, and Corner Resize Handles for Layers Panel
    this.attachPanelLateralResizers(panel, 190, 520);

    body.append(filterRow, blendRow, lockRow, this.layersListEl, footer);
    panel.append(header, body);

    this.setupFluidFreeMove(panel, panel);
    return panel;
  }

  /**
   * Attaches Left, Right, Bottom, and Corner drag-resizers so Color and Layers panels
   * can be smoothly widened, narrowed, or heightened from their sides ("via lateral").
   */
  private attachPanelLateralResizers(
    panel: HTMLElement,
    minW: number,
    maxW: number,
  ): void {
    const leftEdge = document.createElement('div');
    leftEdge.className = 'pc-side-resizer-left';
    leftEdge.title = 'Arraste a lateral esquerda para aumentar ou diminuir o tamanho';

    const rightEdge = document.createElement('div');
    rightEdge.className = 'pc-side-resizer-right';
    rightEdge.title = 'Arraste a lateral direita para aumentar ou diminuir o tamanho';

    const bottomEdge = document.createElement('div');
    bottomEdge.className = 'pc-side-resizer-bottom';
    bottomEdge.title = 'Arraste a borda inferior para aumentar ou diminuir a altura';

    const corner = document.createElement('div');
    corner.className = 'pc-panel-resizer';
    corner.title = 'Arraste o canto para redimensionar';

    const bindEdge = (
      el: HTMLElement,
      mode: 'left' | 'right' | 'bottom' | 'corner',
    ) => {
      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.bringToFront(panel);

        const parentRect = panel.parentElement!.getBoundingClientRect();
        const rect = panel.getBoundingClientRect();

        // Anchor panel in explicit left/top coordinates before resizing
        const startLeft = rect.left - parentRect.left;
        const startTop = rect.top - parentRect.top;
        const startW = rect.width;
        const startX = e.clientX;
        const startY = e.clientY;

        panel.style.left = `${startLeft}px`;
        panel.style.top = `${startTop}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';

        const currentSvH =
          parseFloat(panel.style.getPropertyValue('--pc-sv-height')) || 108;
        const currentListH =
          parseFloat(panel.style.getPropertyValue('--pc-layers-list-height')) || 210;

        el.classList.add('dragging');

        const onMove = (ev: MouseEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;

          if (mode === 'right' || mode === 'corner') {
            const nextW = Math.max(minW, Math.min(maxW, Math.round(startW + dx)));
            panel.style.width = `${nextW}px`;
            if (panel.id === 'pc-color-panel') {
              const nextSv = Math.max(78, Math.min(240, Math.round((nextW - 58) * 0.78)));
              panel.style.setProperty('--pc-sv-height', `${nextSv}px`);
            }
          } else if (mode === 'left') {
            const nextW = Math.max(minW, Math.min(maxW, Math.round(startW - dx)));
            const appliedDx = startW - nextW;
            panel.style.left = `${Math.round(startLeft + appliedDx)}px`;
            panel.style.width = `${nextW}px`;
            if (panel.id === 'pc-color-panel') {
              const nextSv = Math.max(78, Math.min(240, Math.round((nextW - 58) * 0.78)));
              panel.style.setProperty('--pc-sv-height', `${nextSv}px`);
            }
          }

          if (mode === 'bottom' || mode === 'corner') {
            if (panel.id === 'pc-color-panel') {
              const nextSv = Math.max(78, Math.min(260, Math.round(currentSvH + dy)));
              panel.style.setProperty('--pc-sv-height', `${nextSv}px`);
            } else if (panel.id === 'pc-layers-panel') {
              const nextList = Math.max(90, Math.min(480, Math.round(currentListH + dy)));
              panel.style.setProperty('--pc-layers-list-height', `${nextList}px`);
            }
          }
        };

        const onUp = () => {
          el.classList.remove('dragging');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    };

    bindEdge(leftEdge, 'left');
    bindEdge(rightEdge, 'right');
    bindEdge(bottomEdge, 'bottom');
    bindEdge(corner, 'corner');

    panel.append(leftEdge, rightEdge, bottomEdge, corner);
  }

  private resizePanelByDelta(panel: HTMLElement, dw: number, dh: number): void {
    const rect = panel.getBoundingClientRect();
    const minW = panel.id === 'pc-color-panel' ? 168 : 190;
    const maxW = panel.id === 'pc-color-panel' ? 460 : 520;
    const nextW = Math.max(minW, Math.min(maxW, Math.round(rect.width + dw)));
    panel.style.width = `${nextW}px`;

    if (panel.id === 'pc-color-panel') {
      const curH = parseFloat(panel.style.getPropertyValue('--pc-sv-height')) || 108;
      panel.style.setProperty(
        '--pc-sv-height',
        `${Math.max(78, Math.min(260, Math.round(curH + dh)))}px`,
      );
    } else if (panel.id === 'pc-layers-panel') {
      const curH = parseFloat(panel.style.getPropertyValue('--pc-layers-list-height')) || 210;
      panel.style.setProperty(
        '--pc-layers-list-height',
        `${Math.max(90, Math.min(480, Math.round(curH + dh)))}px`,
      );
    }
  }

  /**
   * Lateral resize on the Functions/Tools bar: dragging the left or right edge
   * smoothly scales the icons AND/OR wraps the bar width!
   */
  private setupToolsBarLateralResize(
    bar: HTMLElement,
    handleEl: HTMLElement,
    side: 'left' | 'right',
  ): void {
    handleEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.bringToFront(bar);

      const startX = e.clientX;
      const startScale = this.toolsBarScale;
      handleEl.classList.add('dragging');

      const onMove = (ev: MouseEvent) => {
        const dx = side === 'right' ? ev.clientX - startX : startX - ev.clientX;
        const nextScale = Math.max(
          0.7,
          Math.min(1.75, Math.round((startScale + dx / 220) * 100) / 100),
        );
        this.toolsBarScale = nextScale;
        bar.style.setProperty('--pc-tools-scale', String(this.toolsBarScale));
        const badge = bar.querySelector('.pc-scale-badge');
        if (badge) badge.textContent = `${Math.round(this.toolsBarScale * 100)}%`;
      };

      const onUp = () => {
        handleEl.classList.remove('dragging');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  /**
   * Ultra-fluid free movement across the entire workspace for Tools Bar, Color Panel, Layers Panel, and Floating Tool Pins.
   * When the Hand Tool (M / H) or Spacebar is active, clicking and dragging ANYWHERE inside Colors, Layers, or the Tools Bar
   * immediately grabs and moves that panel, AND scrolling the mouse wheel while holding the panel increases/decreases its size!
   */
  private setupFluidFreeMove(container: HTMLElement, handleEl: HTMLElement): void {
    let dragging = false;
    let pendingDrag = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    handleEl.addEventListener(
      'mousedown',
      (e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;

        // Always allow lateral/corner resize edges to resize the panel
        if (
          target.classList.contains('pc-panel-resizer') ||
          target.classList.contains('pc-side-resizer-left') ||
          target.classList.contains('pc-side-resizer-right') ||
          target.classList.contains('pc-side-resizer-bottom')
        ) {
          return;
        }

        const isHandMode = this.activeTool === 'hand' || this.spaceKeyDown;

        if (!isHandMode) {
          // In normal tool modes, only drag panels from their header, grip, or non-interactive background areas
          if (
            target.tagName === 'INPUT' ||
            target.tagName === 'SELECT' ||
            target.tagName === 'BUTTON' ||
            target.classList.contains('pc-scale-btn') ||
            target.closest('.pc-tool-btn') ||
            target.closest('.pc-sv-box') ||
            target.closest('.pc-hue-strip') ||
            target.closest('.pc-swatch-cell') ||
            target.closest('.pc-fg-bg-Cluster') ||
            target.closest('.pc-layer-row') ||
            target.closest('.pc-panel-tab')
          ) {
            return;
          }
        } else {
          // In Hand Tool (M / H / Space) mode: clicking & dragging ANYWHERE inside Colors, Layers, or Tools Bar moves the entire panel!
          e.stopPropagation();
          e.preventDefault();
        }

        this.bringToFront(container);

        const parentRect = container.parentElement!.getBoundingClientRect();
        const rect = container.getBoundingClientRect();

        startX = e.clientX;
        startY = e.clientY;
        origLeft = rect.left - parentRect.left;
        origTop = rect.top - parentRect.top;
        pendingDrag = true;
        dragging = false;

        // Anchor explicit left/top coordinates so wheel resizing and movement work together seamlessly
        container.style.transform = 'none';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
        container.style.left = `${origLeft}px`;
        container.style.top = `${origTop}px`;

        const onMove = (ev: MouseEvent) => {
          if (!pendingDrag) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (!dragging && Math.hypot(dx, dy) > 2) {
            dragging = true;
          }
          if (dragging) {
            const curRect = container.getBoundingClientRect();
            const minLeft = -curRect.width + 48;
            const maxLeft = parentRect.width - 36;
            const minTop = 0;
            const maxTop = parentRect.height - 24;
            container.style.left = `${Math.max(minLeft, Math.min(maxLeft, origLeft + dx))}px`;
            container.style.top = `${Math.max(minTop, Math.min(maxTop, origTop + dy))}px`;
          }
        };

        // While holding Color, Layers, or Tools Bar with the mouse, scrolling the wheel resizes it!
        const onWheelWhileHeld = (ev: WheelEvent) => {
          if (!pendingDrag) return;
          ev.preventDefault();
          ev.stopPropagation();

          const dir = ev.deltaY < 0 ? 1 : -1;
          if (container.id === 'pc-color-panel' || container.id === 'pc-layers-panel') {
            this.resizePanelByDelta(container, dir * 18, dir * 14);
          } else if (container.id === 'pc-floating-toolsbar') {
            this.toolsBarScale = Math.max(
              0.7,
              Math.min(1.75, Math.round((this.toolsBarScale + dir * 0.08) * 100) / 100),
            );
            this.renderToolsBar();
          }
        };

        const onUp = (ev: MouseEvent) => {
          if (dragging) {
            ev.stopPropagation();
          }
          pendingDrag = false;
          dragging = false;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('wheel', onWheelWhileHeld, true);
          window.removeEventListener('mouseup', onUp, true);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('wheel', onWheelWhileHeld, { passive: false, capture: true });
        window.addEventListener('mouseup', onUp, true);
      },
      true,
    );
  }

  private renderLayersList(): void {
    if (!this.layersListEl) return;
    this.layersListEl.innerHTML = '';

    const active = this.getActiveLayer();
    if (active) {
      this.layerOpacityInput.value = String(Math.round(active.opacity));
      this.layerFillInput.value = String(Math.round(active.fill));
      this.layerBlendSelect.value = active.blendMode;
    }

    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (this.layerFilterKind === 'pixel' && layer.kind === 'text') continue;
      if (this.layerFilterKind === 'text' && layer.kind !== 'text') continue;

      const row = document.createElement('div');
      row.className = `pc-layer-row ${layer.id === this.activeLayerId ? 'active' : ''}`;

      const eyeBtn = document.createElement('button');
      eyeBtn.className = `pc-layer-eye ${layer.visible ? '' : 'hidden-layer'}`;
      eyeBtn.innerHTML = layer.visible ? ICONS.eyeOpen : ICONS.eyeClosed;
      eyeBtn.title = 'Visibilidade (Olhinho)';
      eyeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        this.renderLayersList();
      });

      const thumb = document.createElement('div');
      thumb.className = 'pc-layer-thumb';
      if (layer.kind === 'text') {
        thumb.innerHTML = `<span style="font-weight:700;color:#111;font-size:12px;">T</span>`;
      } else {
        const mini = document.createElement('canvas');
        mini.width = 30;
        mini.height = 22;
        const mCtx = mini.getContext('2d')!;
        mCtx.drawImage(layer.canvas, 0, 0, 30, 22);
        thumb.appendChild(mini);
      }

      const nameWrap = document.createElement('div');
      nameWrap.className = 'pc-layer-name';

      if (this.renamingLayerId === layer.id) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'pc-layer-name-input';
        inp.value = layer.name;
        const commitRename = () => {
          const val = inp.value.trim();
          if (val) {
            layer.name = val;
            if (layer.kind === 'text' && layer.textData) {
              layer.textData.text = val;
              renderTextLayerCanvas(layer);
            }
          }
          this.renamingLayerId = null;
          this.renderLayersList();
          this.renderOptionsStrip();
        };
        inp.addEventListener('blur', commitRename);
        inp.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') commitRename();
          if (ev.key === 'Escape') {
            this.renamingLayerId = null;
            this.renderLayersList();
          }
        });
        nameWrap.appendChild(inp);
        requestAnimationFrame(() => {
          inp.focus();
          inp.select();
        });
      } else {
        nameWrap.textContent = layer.name;
        nameWrap.title = 'Duplo clique para renomear';
        nameWrap.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this.renamingLayerId = layer.id;
          this.renderLayersList();
        });
      }

      row.addEventListener('click', () => {
        this.activeLayerId = layer.id;
        this.renderLayersList();
        this.renderOptionsStrip();
      });

      row.append(eyeBtn, thumb, nameWrap);

      if (layer.locked) {
        const lockIcon = document.createElement('span');
        lockIcon.style.opacity = '0.65';
        lockIcon.innerHTML = ICONS.lock;
        row.appendChild(lockIcon);
      }

      this.layersListEl.appendChild(row);
    }
  }

  private renderBrushPopover(): void {
    if (!this.brushPopoverEl) return;
    const settings = this.getActiveBrushOrEraser();
    const isEraser = this.activeTool === 'eraser';

    this.brushPopoverEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--pc-border);padding-bottom:6px;">
        <strong style="color:#fff;font-size:12px;">${
          isEraser ? 'Configurações da Borracha (E)' : 'Configurações do Pincel (P)'
        }</strong>
        <button class="pc-btn" id="pc-close-brush-pop" style="padding:1px 6px;">✕</button>
      </div>
    `;

    this.brushPopoverEl
      .querySelector('#pc-close-brush-pop')
      ?.addEventListener('click', () => this.closeBrushPopover());

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.flexDirection = 'column';
    controls.style.gap = '6px';

    controls.append(
      this.createSliderOption('Size', settings.size, 1, 200, 'px', (v) => {
        settings.size = v;
        this.renderOptionsStrip();
      }),
      this.createSliderOption('Opacity', settings.opacity, 1, 100, '%', (v) => {
        settings.opacity = v;
        this.renderOptionsStrip();
      }),
      this.createSliderOption('Flow', settings.flow, 1, 100, '%', (v) => {
        settings.flow = v;
        this.renderOptionsStrip();
      }),
      this.createSliderOption('Rotação', settings.rotation, 0, 360, '°', (v) => {
        settings.rotation = v;
        this.renderOptionsStrip();
      }),
    );

    const grid = document.createElement('div');
    grid.className = 'pc-brush-presets-grid';

    this.brushPresets.forEach((preset) => {
      const card = document.createElement('div');
      card.className = `pc-brush-preset-card ${
        preset.id === this.activeBrushPresetId ? 'active' : ''
      }`;

      const preview = createBrushTipCanvas({ ...preset, size: 22 }, '#ffffff');
      preview.style.width = '24px';
      preview.style.height = '24px';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = preset.name;

      card.append(preview, nameSpan);
      card.addEventListener('click', () => {
        this.selectBrushPreset(preset);
        this.renderBrushPopover();
        this.renderOptionsStrip();
      });
      grid.appendChild(card);
    });

    this.brushPopoverEl.append(controls, grid);
  }

  private selectBrushPreset(preset: BrushPreset): void {
    this.activeBrushPresetId = preset.id;
    const settings = this.getActiveBrushOrEraser();
    settings.size = preset.size;
    settings.opacity = preset.opacity;
    settings.flow = preset.flow;
    settings.rotation = preset.rotation;
    settings.hardness = preset.hardness;
    settings.spacing = preset.spacing;
    settings.roundness = preset.roundness;
    settings.pixelSnap = preset.pixelSnap;
    settings.tipShape = preset.tipShape;
  }

  private createNewDocModal(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'pc-modal-backdrop';

    let selectedCat: PresetCategory = 'paper';
    let selectedPreset: DocumentPreset = DEFAULT_DOCUMENT_PRESETS[0];

    const modal = document.createElement('div');
    modal.className = 'pc-modal';

    const renderModalContent = () => {
      const list =
        selectedCat === 'saved'
          ? this.savedPresets
          : DEFAULT_DOCUMENT_PRESETS.filter((p) => p.category === selectedCat);

      modal.innerHTML = `
        <div class="pc-modal-header">
          <span>New Document & Document Presets</span>
          <button class="pc-btn" id="pc-modal-close">✕</button>
        </div>
        <div class="pc-modal-tabs">
          <button class="pc-btn ${selectedCat === 'paper' ? 'pc-btn-active' : ''}" data-cat="paper">Paper (A4 / A3 / Letter)</button>
          <button class="pc-btn ${selectedCat === 'web' ? 'pc-btn-active' : ''}" data-cat="web">Web</button>
          <button class="pc-btn ${selectedCat === 'video' ? 'pc-btn-active' : ''}" data-cat="video">Filme e Vídeo</button>
          <button class="pc-btn ${selectedCat === 'saved' ? 'pc-btn-active' : ''}" data-cat="saved">Saved (${this.savedPresets.length})</button>
        </div>
        <div class="pc-modal-body">
          <div class="pc-preset-cards" id="pc-preset-cards"></div>
          <div style="display:flex;flex-direction:column;gap:8px;background:var(--pc-bg-panel-dark);padding:12px;border-radius:4px;border:1px solid var(--pc-border-subtle);">
            <strong style="color:var(--pc-text-bright);">Detalhes do Documento</strong>
            <label class="pc-opt-label">Nome</label>
            <input type="text" class="pc-input" id="pc-doc-title" value="${this.docName}" />
            <label class="pc-opt-label">Largura (px)</label>
            <input type="number" class="pc-input" id="pc-doc-w" value="${selectedPreset.width}" />
            <label class="pc-opt-label">Altura (px)</label>
            <input type="number" class="pc-input" id="pc-doc-h" value="${selectedPreset.height}" />
            <button class="pc-btn" id="pc-save-preset-btn" style="margin-top:4px;">+ Salvar em Saved</button>
            <button class="pc-btn pc-btn-primary" id="pc-create-doc-btn" style="margin-top:auto;height:28px;justify-content:center;">Criar Documento</button>
          </div>
        </div>
      `;

      const cardsContainer = modal.querySelector('#pc-preset-cards')!;
      list.forEach((p: DocumentPreset) => {
        const card = document.createElement('div');
        card.className = `pc-preset-card ${p.id === selectedPreset.id ? 'active' : ''}`;
        card.innerHTML = `
          <strong style="color:#fff;">${p.name}</strong>
          <span style="color:var(--pc-text-muted);font-size:11px;">${p.description}</span>
          <span style="color:var(--pc-accent);font-family:var(--pc-font-mono);font-size:10px;">${p.width} × ${p.height} px @ ${p.dpi}dpi</span>
        `;
        card.addEventListener('click', () => {
          selectedPreset = p;
          renderModalContent();
        });
        cardsContainer.appendChild(card);
      });

      modal.querySelectorAll('[data-cat]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedCat = (btn as HTMLElement).dataset.cat as PresetCategory;
          const first =
            selectedCat === 'saved'
              ? this.savedPresets[0]
              : DEFAULT_DOCUMENT_PRESETS.find((p) => p.category === selectedCat);
          if (first) selectedPreset = first;
          renderModalContent();
        });
      });

      modal.querySelector('#pc-modal-close')?.addEventListener('click', () => {
        backdrop.classList.remove('open');
      });

      modal.querySelector('#pc-save-preset-btn')?.addEventListener('click', () => {
        const w = Number((modal.querySelector('#pc-doc-w') as HTMLInputElement).value) || 1280;
        const h = Number((modal.querySelector('#pc-doc-h') as HTMLInputElement).value) || 720;
        const title =
          (modal.querySelector('#pc-doc-title') as HTMLInputElement).value || 'Custom';
        const custom: DocumentPreset = {
          id: `saved-${Date.now()}`,
          name: title,
          category: 'saved',
          width: w,
          height: h,
          dpi: 300,
          description: `${w} × ${h} px Custom`,
        };
        this.savedPresets.push(custom);
        selectedCat = 'saved';
        selectedPreset = custom;
        renderModalContent();
      });

      modal.querySelector('#pc-create-doc-btn')?.addEventListener('click', () => {
        const w = Math.max(
          64,
          Math.min(
            4096,
            Number((modal.querySelector('#pc-doc-w') as HTMLInputElement).value) || 1100,
          ),
        );
        const h = Math.max(
          64,
          Math.min(
            4096,
            Number((modal.querySelector('#pc-doc-h') as HTMLInputElement).value) || 760,
          ),
        );
        this.docName =
          (modal.querySelector('#pc-doc-title') as HTMLInputElement).value || 'Untitled-1';
        this.resetDocumentWithSize(w, h);
        backdrop.classList.remove('open');
      });
    };

    renderModalContent();
    backdrop.appendChild(modal);
    return backdrop;
  }

  private openNewDocModal(): void {
    this.newDocModalEl.classList.add('open');
  }

  private applyDocumentPreset(preset: DocumentPreset): void {
    this.docName = preset.name;
    this.resetDocumentWithSize(preset.width, preset.height);
  }

  private resetDocumentWithSize(w: number, h: number): void {
    this.pushHistory('New Document');
    this.docWidth = w;
    this.docHeight = h;
    this.compositeCanvas.width = w;
    this.compositeCanvas.height = h;
    this.clearSelection();
    this.initDefaultLayers();
    this.centerDocumentInViewport();
    this.renderLayersList();
    this.renderOptionsStrip();
  }

  private scaleActiveLayerByFactor(factor: number): void {
    const layer = this.getActiveLayer();
    if (!layer || layer.locked) return;
    this.pushHistory('Scale Layer');

    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    const nw = Math.max(24, Math.min(6000, Math.round(layer.width * factor)));
    const nh = Math.max(24, Math.min(6000, Math.round(layer.height * factor)));
    layer.width = nw;
    layer.height = nh;
    layer.x = Math.round(cx - nw / 2);
    layer.y = Math.round(cy - nh / 2);

    if (layer.kind === 'text' && layer.textData) {
      layer.textData.fontSize = Math.max(
        8,
        Math.min(300, Math.round(layer.textData.fontSize * factor)),
      );
      renderTextLayerCanvas(layer);
    }

    this.renderOptionsStrip();
    this.renderLayersList();
  }

  private resetFloatingPositions(): void {
    this.toolsBarScale = 1.0;
    this.toolsBarCollapsed = false;
    this.toolsBarVertical = false;
    this.colorPanelCollapsed = false;
    this.layersPanelCollapsed = false;
    this.dockAllFloatingToolPins();

    if (this.toolsBarEl) {
      this.toolsBarEl.style.left = '50%';
      this.toolsBarEl.style.top = '10px';
      this.toolsBarEl.style.width = 'auto';
      this.toolsBarEl.style.transform = 'translateX(-50%)';
      this.renderToolsBar();
    }
    if (this.colorPanelEl) {
      this.colorPanelEl.classList.remove('collapsed');
      this.colorPanelEl.style.left = '18px';
      this.colorPanelEl.style.top = '14px';
      this.colorPanelEl.style.right = 'auto';
      this.colorPanelEl.style.bottom = 'auto';
      this.colorPanelEl.style.width = '224px';
      this.colorPanelEl.style.setProperty('--pc-sv-height', '108px');
    }
    if (this.layersPanelEl) {
      this.layersPanelEl.classList.remove('collapsed');
      this.layersPanelEl.style.left = 'auto';
      this.layersPanelEl.style.top = 'auto';
      this.layersPanelEl.style.right = '22px';
      this.layersPanelEl.style.bottom = '24px';
      this.layersPanelEl.style.width = '268px';
      this.layersPanelEl.style.setProperty('--pc-layers-list-height', '210px');
    }
  }

  private bindGlobalShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName;
      const inInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (this.isLassoDrawing) {
          this.cancelLassoDraft();
        } else {
          this.undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !inInput) {
        e.preventDefault();
        this.copySelectionOrActiveLayer();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && !inInput) {
        e.preventDefault();
        this.cutSelectionFromActiveLayer();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && !inInput) {
        e.preventDefault();
        this.pasteClipboardOrSample();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && !inInput) {
        e.preventDefault();
        if (this.selection.active) {
          this.copySelectionOrActiveLayer();
          this.pasteClipboardOrSample();
        } else {
          this.duplicateActiveLayer();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !inInput) {
        e.preventDefault();
        this.clearSelection();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          this.openExportModal();
        } else {
          this.exportDocument('ps');
        }
        return;
      }

      if (inInput) return;

      if (e.code === 'Space') {
        this.spaceKeyDown = true;
        document.body.classList.add('pc-hand-mode-active');
      }

      const k = e.key.toLowerCase();
      if (k === 'p' || k === 'b') this.setTool('brush');
      else if (k === 'e') this.setTool('eraser');
      else if (k === 'l') this.setTool('lasso');
      else if (k === 't') this.setTool('text');
      else if (k === 'v') this.setTool('move');
      else if (k === 'g') this.setTool('bucket');
      else if (k === 'i') this.setTool('eyedropper');
      else if (k === 'm' || k === 'h') this.setTool('hand');
      else if (k === 'r') this.setTool('select-quad');
      else if (e.key === '+' || e.key === '=') this.scaleActiveLayerByFactor(1.12);
      else if (e.key === '-') this.scaleActiveLayerByFactor(0.88);
      else if (e.key === 'Escape') {
        if (this.isLassoDrawing) {
          this.cancelLassoDraft();
        }
        this.closeBrushPopover();
        this.closeAllDropdowns();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceKeyDown = false;
        document.body.classList.toggle('pc-hand-mode-active', this.activeTool === 'hand');
      }
    });

    window.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            this.importImageFileAsLayer(blob, `Colado ${new Date().toLocaleTimeString()}`);
            return;
          }
        }
      }
    });
  }

  private setTool(tool: ToolId): void {
    if (tool !== 'lasso' && this.isLassoDrawing) {
      this.cancelLassoDraft();
    }
    this.activeTool = tool;
    document.body.classList.toggle(
      'pc-hand-mode-active',
      this.activeTool === 'hand' || this.spaceKeyDown,
    );
    if (this.topHandBtnEl) {
      this.topHandBtnEl.classList.toggle('pc-btn-active', this.activeTool === 'hand');
    }
    this.renderToolsBar();
    this.floatingToolPins.forEach((pin, id) => {
      const btn = pin.querySelector('.pc-tool-btn');
      if (btn) btn.classList.toggle('active', id === tool);
    });
    this.renderOptionsStrip();
    this.renderBrushPopover();
    this.updateStatusBar();
  }

  private cancelLassoDraft(): void {
    this.isLassoDrawing = false;
    this.lassoDraftPoints = [];
    this.lassoCursorDocPt = null;
    this.dragAction = 'none';
    this.isPointerDown = false;
    this.renderOptionsStrip();
  }

  /**
   * Appends a new point to the freehand lasso and checks if one end crossed the other.
   * Only finalizes the selection when the path self-intersects or crosses the start tip!
   */
  private appendLassoPointAndCheckCrossing(docPt: Point2D): void {
    this.lassoCursorDocPt = { ...docPt };
    const n = this.lassoDraftPoints.length;
    if (n === 0) {
      this.lassoDraftPoints.push({ ...docPt });
      return;
    }

    const lastPt = this.lassoDraftPoints[n - 1];
    const dist = Math.hypot(docPt.x - lastPt.x, docPt.y - lastPt.y);
    if (dist < 2 / this.zoom) return;

    this.lassoDraftPoints.push({ ...docPt });

    const crossedLoop = findLassoSelfCrossingLoop(
      this.lassoDraftPoints,
      11 / this.zoom,
      10 / this.zoom,
    );

    if (crossedLoop && crossedLoop.length >= 3) {
      this.selection = createSelectionFromLassoPoints(crossedLoop);
      this.isLassoDrawing = false;
      this.lassoDraftPoints = [];
      this.lassoCursorDocPt = null;
      this.dragAction = 'none';
      this.isPointerDown = false;
      // Automatically capture the selected object so Ctrl+C / Ctrl+V works immediately
      this.copySelectionOrActiveLayer(true);
      this.renderOptionsStrip();
    }
  }

  private pickTopmostLayerAtPoint(docPt: Point2D): LayerItem | undefined {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i];
      if (!l.visible || l.locked) continue;
      if (
        docPt.x >= l.x &&
        docPt.x <= l.x + l.width &&
        docPt.y >= l.y &&
        docPt.y <= l.y + l.height
      ) {
        return l;
      }
    }
    return undefined;
  }

  private hitTestBoxHandlesAt(
    box: { x: number; y: number; width: number; height: number; rotation: number },
    docPt: Point2D,
  ): HandleType {
    const handles = getTransformHandles(box);
    const radius = 9 / this.zoom;
    for (const h of handles) {
      if (Math.hypot(docPt.x - h.x, docPt.y - h.y) <= radius) {
        return h.type;
      }
    }
    return null;
  }

  private isInsideSelectionBox(docPt: Point2D): boolean {
    if (!this.selection.active) return false;
    return (
      docPt.x >= this.selection.x &&
      docPt.x <= this.selection.x + this.selection.width &&
      docPt.y >= this.selection.y &&
      docPt.y <= this.selection.y + this.selection.height
    );
  }

  private bindViewportEvents(): void {
    this.viewportCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.openBrushPopoverAt(e.clientX, e.clientY);
    });

    this.viewportCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || this.activeTool === 'zoom') {
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        this.adjustZoom(factor, e.clientX, e.clientY);
      } else if (e.shiftKey) {
        this.scaleActiveLayerByFactor(e.deltaY < 0 ? 1.08 : 0.92);
      } else {
        const factor = e.deltaY < 0 ? 1.08 : 0.92;
        this.adjustZoom(factor, e.clientX, e.clientY);
      }
    });

    this.viewportCanvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) return;
      this.closeBrushPopover();
      this.closeAllDropdowns();

      const docPt = this.screenToDoc(e.clientX, e.clientY);
      this.isPointerDown = true;
      this.startDocPt = { ...docPt };
      this.lastDocPt = { ...docPt };
      this.startClientPt = { x: e.clientX, y: e.clientY };

      if (this.spaceKeyDown || this.activeTool === 'hand' || e.button === 1) {
        this.dragAction = 'pan';
        return;
      }

      if (this.activeTool === 'zoom') {
        this.adjustZoom(e.altKey ? 0.8 : 1.25, e.clientX, e.clientY);
        this.isPointerDown = false;
        return;
      }

      if (this.activeTool === 'eyedropper') {
        this.sampleColorAt(docPt);
        this.isPointerDown = false;
        return;
      }

      if (this.selection.active) {
        const handle = this.hitTestBoxHandlesAt(this.selection, docPt);
        if (handle) {
          this.dragAction = 'resize-selection';
          this.activeSelectionHandle = handle;
          this.initialSelectionBox = {
            x: this.selection.x,
            y: this.selection.y,
            width: this.selection.width,
            height: this.selection.height,
            rotation: this.selection.rotation,
          };
          return;
        }
      }

      const activeLayer = this.getActiveLayer();
      if (this.activeTool === 'text' && activeLayer?.kind === 'text' && activeLayer.textData) {
        const td = activeLayer.textData;
        if (td.warpEnabled) {
          for (let i = 0; i < td.warpCorners.length; i++) {
            const nodeX = activeLayer.x + td.warpCorners[i].x * activeLayer.width;
            const nodeY = activeLayer.y + td.warpCorners[i].y * activeLayer.height;
            if (Math.hypot(docPt.x - nodeX, docPt.y - nodeY) <= 10 / this.zoom) {
              this.pushHistory('Warp Text Guide');
              this.dragAction = 'warp-node';
              this.activeWarpCornerIndex = i;
              return;
            }
          }
        }
        const leftMid = { x: activeLayer.x, y: activeLayer.y + activeLayer.height / 2 };
        const rightMid = {
          x: activeLayer.x + activeLayer.width,
          y: activeLayer.y + activeLayer.height / 2,
        };
        if (Math.hypot(docPt.x - leftMid.x, docPt.y - leftMid.y) <= 10 / this.zoom) {
          this.pushHistory('Scale Text Lateral');
          this.dragAction = 'scale-text-side';
          this.activeTextSide = 'left';
          this.initialLayerBox = {
            x: activeLayer.x,
            y: activeLayer.y,
            width: activeLayer.width,
            height: activeLayer.height,
            rotation: activeLayer.rotation,
          };
          return;
        }
        if (Math.hypot(docPt.x - rightMid.x, docPt.y - rightMid.y) <= 10 / this.zoom) {
          this.pushHistory('Scale Text Lateral');
          this.dragAction = 'scale-text-side';
          this.activeTextSide = 'right';
          this.initialLayerBox = {
            x: activeLayer.x,
            y: activeLayer.y,
            width: activeLayer.width,
            height: activeLayer.height,
            rotation: activeLayer.rotation,
          };
          return;
        }

        if (
          docPt.x >= activeLayer.x &&
          docPt.x <= activeLayer.x + activeLayer.width &&
          docPt.y >= activeLayer.y &&
          docPt.y <= activeLayer.y + activeLayer.height
        ) {
          this.pushHistory('Move Text Layer');
          this.dragAction = 'move-layer';
          this.initialLayerBox = {
            x: activeLayer.x,
            y: activeLayer.y,
            width: activeLayer.width,
            height: activeLayer.height,
            rotation: activeLayer.rotation,
          };
        } else {
          this.createTextLayerAt(docPt);
          this.isPointerDown = false;
        }
        return;
      }

      if (this.activeTool === 'move') {
        let targetLayer = activeLayer;

        if (targetLayer && !targetLayer.locked) {
          const handle = this.hitTestBoxHandlesAt(targetLayer, docPt);
          if (handle) {
            this.pushHistory('Resize Layer');
            this.dragAction = 'resize-layer';
            this.activeLayerHandle = handle;
            this.initialLayerBox = {
              x: targetLayer.x,
              y: targetLayer.y,
              width: targetLayer.width,
              height: targetLayer.height,
              rotation: targetLayer.rotation,
            };
            return;
          }
        }

        if (
          !targetLayer ||
          docPt.x < targetLayer.x ||
          docPt.x > targetLayer.x + targetLayer.width ||
          docPt.y < targetLayer.y ||
          docPt.y > targetLayer.y + targetLayer.height
        ) {
          const hit = this.pickTopmostLayerAtPoint(docPt);
          if (hit) {
            this.activeLayerId = hit.id;
            targetLayer = hit;
            this.renderLayersList();
            this.renderOptionsStrip();
          }
        }
        if (!targetLayer || targetLayer.locked || targetLayer.lockPosition) return;
        this.pushHistory('Move Layer');
        this.dragAction = 'move-layer';
        this.initialLayerBox = {
          x: targetLayer.x,
          y: targetLayer.y,
          width: targetLayer.width,
          height: targetLayer.height,
          rotation: targetLayer.rotation,
        };
        return;
      }

      if (
        this.activeTool === 'select-quad' ||
        this.activeTool === 'select-triangle' ||
        this.activeTool === 'select-ellipse' ||
        this.activeTool === 'lasso' ||
        this.activeTool === 'smart-select'
      ) {
        if (this.activeTool === 'smart-select') {
          this.updateCompositeCanvas();
          this.selection = computeSmartSelection(
            this.compositeCanvas,
            docPt.x,
            docPt.y,
            this.smartTolerance,
          );
          this.copySelectionOrActiveLayer(true);
          this.isPointerDown = false;
          return;
        }

        if (this.activeTool === 'lasso') {
          // If already drawing a freehand lasso (haven't crossed ends yet), continue drawing
          if (this.isLassoDrawing) {
            this.dragAction = 'create-selection';
            this.appendLassoPointAndCheckCrossing(docPt);
            return;
          }

          if (this.selection.active && this.isInsideSelectionBox(docPt)) {
            this.dragAction = 'move-selection';
            this.initialSelectionBox = {
              x: this.selection.x,
              y: this.selection.y,
              width: this.selection.width,
              height: this.selection.height,
              rotation: this.selection.rotation,
            };
            return;
          }

          // Start a new continuous freehand lasso drawing
          this.pushHistory('Lasso Selection');
          this.isLassoDrawing = true;
          this.lassoDraftPoints = [{ ...docPt }];
          this.lassoCursorDocPt = { ...docPt };
          this.selection = createEmptySelection();
          this.dragAction = 'create-selection';
          this.renderOptionsStrip();
          return;
        }

        if (this.selection.active && this.isInsideSelectionBox(docPt)) {
          this.dragAction = 'move-selection';
          this.initialSelectionBox = {
            x: this.selection.x,
            y: this.selection.y,
            width: this.selection.width,
            height: this.selection.height,
            rotation: this.selection.rotation,
          };
          return;
        }

        this.dragAction = 'create-selection';
        const modeMap: Record<string, SelectionMode> = {
          'select-quad': 'quad',
          'select-triangle': 'triangle',
          'select-ellipse': 'ellipse',
        };
        const mode = modeMap[this.activeTool] || 'quad';
        this.selection = {
          active: true,
          mode,
          x: docPt.x,
          y: docPt.y,
          width: 4,
          height: 4,
          rotation: 0,
          normalizedPoints: buildNormalizedShapePoints(mode),
        };
        return;
      }

      if (this.activeTool === 'bucket') {
        if (!activeLayer || activeLayer.locked) return;
        if (activeLayer.kind === 'text') this.rasterizeLayer(activeLayer);
        this.pushHistory('Paint Bucket');

        const grad =
          this.gradients.find((g) => g.id === this.activeGradientId) || this.gradients[0];
        applyPaintBucketToLayer(
          activeLayer,
          docPt.x,
          docPt.y,
          this.bucketSettings.mode,
          this.fgColor,
          grad,
          this.bucketSettings.tolerance,
          this.selection,
        );
        this.renderLayersList();
        this.isPointerDown = false;
        return;
      }

      if (this.activeTool === 'brush' || this.activeTool === 'eraser') {
        if (!activeLayer || activeLayer.locked) return;
        if (activeLayer.kind === 'text') this.rasterizeLayer(activeLayer);
        this.pushHistory(this.activeTool === 'brush' ? 'Brush Stroke' : 'Eraser Stroke');
        this.dragAction = 'stroke';
        const settings = this.getActiveBrushOrEraser();
        this.currentStampCanvas = createBrushTipCanvas(
          settings,
          this.activeTool === 'eraser' ? '#000000' : this.fgColor,
        );
        this.applyBrushSegment(docPt, docPt);
      }
    });

    window.addEventListener('mousemove', (e) => {
      const docPt = this.screenToDoc(e.clientX, e.clientY);
      this.statusCoordsEl.textContent = `X: ${Math.round(docPt.x)} Y: ${Math.round(docPt.y)}`;

      // Continuous freehand lasso: keeps drawing even if mouse button was released, until one end crosses the other!
      if (this.activeTool === 'lasso' && this.isLassoDrawing) {
        this.appendLassoPointAndCheckCrossing(docPt);
        return;
      }

      if (!this.isPointerDown) return;

      if (this.dragAction === 'pan') {
        this.panX += e.clientX - this.startClientPt.x;
        this.panY += e.clientY - this.startClientPt.y;
        this.startClientPt = { x: e.clientX, y: e.clientY };
        return;
      }

      if (this.dragAction === 'stroke') {
        this.applyBrushSegment(this.lastDocPt, docPt);
        this.lastDocPt = { ...docPt };
        return;
      }

      if (this.dragAction === 'move-layer') {
        const layer = this.getActiveLayer();
        if (!layer) return;
        let nextX = this.initialLayerBox.x + (docPt.x - this.startDocPt.x);
        let nextY = this.initialLayerBox.y + (docPt.y - this.startDocPt.y);

        this.activeSnapLines = {};
        if (this.showGuides) {
          const snapThreshold = 6 / this.zoom;
          const centerX = nextX + layer.width / 2;
          const centerY = nextY + layer.height / 2;
          if (Math.abs(centerX - this.docWidth / 2) < snapThreshold) {
            nextX = this.docWidth / 2 - layer.width / 2;
            this.activeSnapLines.vertical = this.docWidth / 2;
          }
          if (Math.abs(centerY - this.docHeight / 2) < snapThreshold) {
            nextY = this.docHeight / 2 - layer.height / 2;
            this.activeSnapLines.horizontal = this.docHeight / 2;
          }
        }

        layer.x = Math.round(nextX);
        layer.y = Math.round(nextY);
        return;
      }

      if (this.dragAction === 'resize-layer' && this.activeLayerHandle) {
        const layer = this.getActiveLayer();
        if (!layer) return;
        const dx = docPt.x - this.startDocPt.x;
        const dy = docPt.y - this.startDocPt.y;
        const b = { ...this.initialLayerBox };
        const h = this.activeLayerHandle;

        if (h === 'rot') {
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height / 2;
          layer.rotation = Math.round(
            (Math.atan2(docPt.y - cy, docPt.x - cx) * 180) / Math.PI + 90,
          );
          return;
        }

        if (h.includes('e')) b.width = Math.max(24, this.initialLayerBox.width + dx);
        if (h.includes('s')) b.height = Math.max(24, this.initialLayerBox.height + dy);
        if (h.includes('w')) {
          const nw = Math.max(24, this.initialLayerBox.width - dx);
          b.x = this.initialLayerBox.x + (this.initialLayerBox.width - nw);
          b.width = nw;
        }
        if (h.includes('n')) {
          const nh = Math.max(24, this.initialLayerBox.height - dy);
          b.y = this.initialLayerBox.y + (this.initialLayerBox.height - nh);
          b.height = nh;
        }

        layer.x = Math.round(b.x);
        layer.y = Math.round(b.y);
        layer.width = Math.round(b.width);
        layer.height = Math.round(b.height);
        return;
      }

      if (this.dragAction === 'create-selection') {
        this.selection.x = Math.min(this.startDocPt.x, docPt.x);
        this.selection.y = Math.min(this.startDocPt.y, docPt.y);
        this.selection.width = Math.max(4, Math.abs(docPt.x - this.startDocPt.x));
        this.selection.height = Math.max(4, Math.abs(docPt.y - this.startDocPt.y));
        return;
      }

      if (this.dragAction === 'resize-selection' && this.activeSelectionHandle) {
        const dx = docPt.x - this.startDocPt.x;
        const dy = docPt.y - this.startDocPt.y;
        const b = { ...this.initialSelectionBox };
        const h = this.activeSelectionHandle;

        if (h === 'rot') {
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height / 2;
          this.selection.rotation =
            (Math.atan2(docPt.y - cy, docPt.x - cx) * 180) / Math.PI + 90;
          return;
        }

        if (h.includes('e')) b.width = Math.max(8, this.initialSelectionBox.width + dx);
        if (h.includes('s')) b.height = Math.max(8, this.initialSelectionBox.height + dy);
        if (h.includes('w')) {
          const nw = Math.max(8, this.initialSelectionBox.width - dx);
          b.x = this.initialSelectionBox.x + (this.initialSelectionBox.width - nw);
          b.width = nw;
        }
        if (h.includes('n')) {
          const nh = Math.max(8, this.initialSelectionBox.height - dy);
          b.y = this.initialSelectionBox.y + (this.initialSelectionBox.height - nh);
          b.height = nh;
        }

        this.selection.x = b.x;
        this.selection.y = b.y;
        this.selection.width = b.width;
        this.selection.height = b.height;
        return;
      }

      if (this.dragAction === 'move-selection') {
        const dx = docPt.x - this.startDocPt.x;
        const dy = docPt.y - this.startDocPt.y;
        this.selection.x = this.initialSelectionBox.x + dx;
        this.selection.y = this.initialSelectionBox.y + dy;
        return;
      }

      if (this.dragAction === 'warp-node') {
        const layer = this.getActiveLayer();
        if (layer?.kind === 'text' && layer.textData && this.activeWarpCornerIndex >= 0) {
          const nx = (docPt.x - layer.x) / Math.max(1, layer.width);
          const ny = (docPt.y - layer.y) / Math.max(1, layer.height);
          layer.textData.warpCorners[this.activeWarpCornerIndex] = {
            x: Math.max(-0.5, Math.min(1.5, nx)),
            y: Math.max(-0.8, Math.min(1.8, ny)),
          };
          renderTextLayerCanvas(layer);
        }
        return;
      }

      if (this.dragAction === 'scale-text-side') {
        const layer = this.getActiveLayer();
        if (layer?.kind === 'text' && layer.textData) {
          const dx = docPt.x - this.startDocPt.x;
          if (this.activeTextSide === 'right') {
            layer.width = Math.max(60, Math.round(this.initialLayerBox.width + dx));
          } else {
            const nw = Math.max(60, Math.round(this.initialLayerBox.width - dx));
            layer.x = Math.round(this.initialLayerBox.x + (this.initialLayerBox.width - nw));
            layer.width = nw;
          }
          renderTextLayerCanvas(layer);
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (!this.isPointerDown) return;

      if (
        this.dragAction === 'stroke' ||
        this.dragAction === 'move-layer' ||
        this.dragAction === 'resize-layer'
      ) {
        this.activeSnapLines = {};
        this.renderLayersList();
        this.renderOptionsStrip();
      }

      if (
        (this.dragAction === 'create-selection' ||
          this.dragAction === 'resize-selection' ||
          this.dragAction === 'move-selection') &&
        this.selection.active
      ) {
        this.copySelectionOrActiveLayer(true);
      }

      this.isPointerDown = false;
      this.dragAction = 'none';
      this.activeSelectionHandle = null;
      this.activeLayerHandle = null;
      this.activeWarpCornerIndex = -1;
      this.activeTextSide = null;
      this.currentStampCanvas = null;
    });
  }

  private applyBrushSegment(fromDoc: Point2D, toDoc: Point2D): void {
    const layer = this.getActiveLayer();
    if (!layer || !this.currentStampCanvas) return;

    const isEraser = this.activeTool === 'eraser';
    const settings = this.getActiveBrushOrEraser();

    const ctx = layer.canvas.getContext('2d')!;
    ctx.save();

    if (this.selection.active) {
      const clipPath = buildSelectionPath2D(this.selection, layer.x, layer.y);
      ctx.clip(clipPath);
    }

    ctx.globalAlpha = Math.max(0.01, Math.min(1, settings.opacity / 100));
    ctx.globalCompositeOperation = isEraser
      ? 'destination-out'
      : layer.lockTransparentPixels
        ? 'source-atop'
        : 'source-over';

    const scaleX = layer.canvas.width / Math.max(1, layer.width);
    const scaleY = layer.canvas.height / Math.max(1, layer.height);

    stampSegmentOnBuffer(
      ctx,
      this.currentStampCanvas,
      { x: (fromDoc.x - layer.x) * scaleX, y: (fromDoc.y - layer.y) * scaleY },
      { x: (toDoc.x - layer.x) * scaleX, y: (toDoc.y - layer.y) * scaleY },
      settings,
    );

    ctx.restore();
  }

  private createTextLayerAt(docPt: Point2D): LayerItem {
    this.pushHistory('Create Text Layer');
    const initialText = 'Novo Texto';
    const textData = createDefaultTextData(initialText, this.fgColor);
    textData.fontFamily = this.availableFonts[0];

    const w = 320;
    const h = 110;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const layer: LayerItem = {
      id: `layer-text-${Date.now()}`,
      name: initialText,
      kind: 'text',
      visible: true,
      locked: false,
      lockTransparentPixels: false,
      lockPosition: false,
      blendMode: 'source-over',
      opacity: 100,
      fill: 100,
      x: Math.round(docPt.x - w / 2),
      y: Math.round(docPt.y - h / 2),
      width: w,
      height: h,
      rotation: 0,
      canvas,
      textData,
    };

    renderTextLayerCanvas(layer);
    this.layers.push(layer);
    this.activeLayerId = layer.id;
    this.renderLayersList();
    this.renderOptionsStrip();
    return layer;
  }

  private ensureActiveTextLayer(): LayerItem {
    const active = this.getActiveLayer();
    if (active?.kind === 'text' && active.textData) return active;
    return this.createTextLayerAt({ x: this.docWidth / 2, y: this.docHeight / 2 });
  }

  private toggleActiveTextWarp(): void {
    const layer = this.ensureActiveTextLayer();
    if (layer.textData) {
      layer.textData.warpEnabled = !layer.textData.warpEnabled;
      renderTextLayerCanvas(layer);
      this.renderOptionsStrip();
    }
  }

  private applyColorToActiveTextIfSelected(): void {
    const layer = this.getActiveLayer();
    if (layer?.kind === 'text' && layer.textData) {
      layer.textData.color = this.fgColor;
      renderTextLayerCanvas(layer);
    }
  }

  private rasterizeLayer(layer: LayerItem): void {
    layer.kind = 'pixel';
    delete layer.textData;
  }

  private createNewPixelLayer(): void {
    this.pushHistory('New Layer');
    const c = document.createElement('canvas');
    c.width = this.docWidth;
    c.height = this.docHeight;

    const newLayer: LayerItem = {
      id: `layer-${Date.now()}`,
      name: `Layer ${this.layers.length}`,
      kind: 'pixel',
      visible: true,
      locked: false,
      lockTransparentPixels: false,
      lockPosition: false,
      blendMode: 'source-over',
      opacity: 100,
      fill: 100,
      x: 0,
      y: 0,
      width: this.docWidth,
      height: this.docHeight,
      rotation: 0,
      canvas: c,
    };
    this.layers.push(newLayer);
    this.activeLayerId = newLayer.id;
    this.renderLayersList();
    this.renderOptionsStrip();
  }

  private duplicateActiveLayer(): void {
    const src = this.getActiveLayer();
    if (!src) return;
    this.pushHistory('Duplicate Layer');

    const c = document.createElement('canvas');
    c.width = src.canvas.width;
    c.height = src.canvas.height;
    c.getContext('2d')!.drawImage(src.canvas, 0, 0);

    const dup: LayerItem = {
      ...src,
      id: `layer-dup-${Date.now()}`,
      name: `${src.name} copy`,
      locked: false,
      lockPosition: false,
      x: src.x + 18,
      y: src.y + 18,
      canvas: c,
      textData: src.textData
        ? {
            ...src.textData,
            warpCorners: [
              { ...src.textData.warpCorners[0] },
              { ...src.textData.warpCorners[1] },
              { ...src.textData.warpCorners[2] },
              { ...src.textData.warpCorners[3] },
            ],
          }
        : undefined,
    };

    const idx = this.layers.findIndex((l) => l.id === src.id);
    this.layers.splice(idx + 1, 0, dup);
    this.activeLayerId = dup.id;
    this.renamingLayerId = dup.id;
    this.renderLayersList();
    this.renderOptionsStrip();
  }

  private deleteActiveLayer(): void {
    if (this.layers.length <= 1) return;
    const idx = this.layers.findIndex((l) => l.id === this.activeLayerId);
    if (idx < 0) return;
    this.pushHistory('Delete Layer');
    this.layers.splice(idx, 1);
    this.activeLayerId = this.layers[Math.max(0, idx - 1)].id;
    this.renderLayersList();
    this.renderOptionsStrip();
  }

  private moveActiveLayerOrder(dir: 1 | -1): void {
    const idx = this.layers.findIndex((l) => l.id === this.activeLayerId);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= this.layers.length) return;
    const [item] = this.layers.splice(idx, 1);
    this.layers.splice(targetIdx, 0, item);
    this.renderLayersList();
  }

  private setActiveLayerAngle(deg: number): void {
    const layer = this.getActiveLayer();
    if (!layer || layer.locked) return;
    this.pushHistory(`Rotate ${deg}°`);
    layer.rotation = deg;
    this.renderOptionsStrip();
  }

  private splitActiveLayerWithSelection(): void {
    const layer = this.getActiveLayer();
    if (!layer || !this.selection.active) return;
    this.pushHistory('Split Layer via Lasso');

    if (layer.kind === 'text') {
      this.rasterizeLayer(layer);
    }

    const { newCutLayer } = splitLayerIntoTwoBySelection(layer, this.selection);
    if (!newCutLayer) return;

    const idx = this.layers.findIndex((l) => l.id === layer.id);
    this.layers.splice(idx + 1, 0, newCutLayer);
    this.activeLayerId = newCutLayer.id;
    this.clearSelection();
    this.setTool('move');
    this.renderLayersList();
  }

  private selectAll(): void {
    this.selection = {
      active: true,
      mode: 'quad',
      x: 0,
      y: 0,
      width: this.docWidth,
      height: this.docHeight,
      rotation: 0,
      normalizedPoints: buildNormalizedShapePoints('quad'),
    };
  }

  private clearSelection(): void {
    this.isLassoDrawing = false;
    this.lassoDraftPoints = [];
    this.lassoCursorDocPt = null;
    this.selection = createEmptySelection();
    this.renderOptionsStrip();
  }

  /**
   * Copies the currently selected region (via Lasso or Geometric/Smart selection)
   * or the active layer into the internal clipboard buffer for instant Ctrl+V pasting.
   */
  private copySelectionOrActiveLayer(silent = false): void {
    const activeLayer = this.getActiveLayer();
    if (!activeLayer) return;

    if (this.selection.active) {
      this.updateCompositeCanvas();
      const extracted = extractSelectionFromLayer(
        activeLayer,
        this.selection,
        this.compositeCanvas,
      );
      if (extracted) {
        this.copiedSelectionBuffer = {
          ...extracted,
          sourceName: activeLayer.name,
          pasteCount: 0,
        };
        if (!silent && navigator.clipboard && 'write' in navigator.clipboard) {
          extracted.canvas.toBlob((blob) => {
            if (blob) {
              navigator.clipboard
                .write([new ClipboardItem({ 'image/png': blob })])
                .catch(() => {});
            }
          });
        }
        return;
      }
    }

    // If no active selection, copy the entire active layer
    if (!silent) {
      const c = document.createElement('canvas');
      c.width = activeLayer.width;
      c.height = activeLayer.height;
      c.getContext('2d')?.drawImage(
        activeLayer.canvas,
        0,
        0,
        activeLayer.width,
        activeLayer.height,
      );
      this.copiedSelectionBuffer = {
        canvas: c,
        x: activeLayer.x,
        y: activeLayer.y,
        width: activeLayer.width,
        height: activeLayer.height,
        sourceName: activeLayer.name,
        pasteCount: 0,
      };
    }
  }

  /**
   * Cuts the selected region from the active layer into the clipboard buffer (with Ctrl+Z support).
   */
  private cutSelectionFromActiveLayer(): void {
    const layer = this.getActiveLayer();
    if (!layer || layer.locked || !this.selection.active) return;

    this.copySelectionOrActiveLayer(false);
    this.pushHistory('Cut Selection');

    if (layer.kind === 'text') {
      this.rasterizeLayer(layer);
    }

    const polyPts = getSelectionPolygonDocumentPoints(this.selection);
    if (polyPts.length < 3) return;

    const srcCtx = layer.canvas.getContext('2d');
    if (!srcCtx) return;

    srcCtx.save();
    const lcx = layer.x + layer.width / 2;
    const lcy = layer.y + layer.height / 2;
    const invRad = (-layer.rotation * Math.PI) / 180;
    const cos = Math.cos(invRad);
    const sin = Math.sin(invRad);
    const scaleX = layer.canvas.width / Math.max(1, layer.width);
    const scaleY = layer.canvas.height / Math.max(1, layer.height);

    srcCtx.beginPath();
    polyPts.forEach((pt, index) => {
      const dx = pt.x - lcx;
      const dy = pt.y - lcy;
      const rx = dx * cos - dy * sin + layer.width / 2;
      const ry = dx * sin + dy * cos + layer.height / 2;
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

    this.clearSelection();
    this.renderLayersList();
  }

  private sampleColorAt(docPt: Point2D): void {
    this.updateCompositeCanvas();
    const x = Math.max(0, Math.min(this.docWidth - 1, Math.floor(docPt.x)));
    const y = Math.max(0, Math.min(this.docHeight - 1, Math.floor(docPt.y)));
    const pixel = this.compositeCtx.getImageData(x, y, 1, 1).data;
    this.fgColor = `#${[pixel[0], pixel[1], pixel[2]]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')}`;
    this.syncHsvFromHex(this.fgColor);
    this.renderColorPanelBody();
  }

  private async pasteClipboardOrSample(): Promise<void> {
    // 1. If a selection is currently active on canvas, make sure it is captured in copiedSelectionBuffer
    if (this.selection.active && !this.copiedSelectionBuffer) {
      this.copySelectionOrActiveLayer(true);
    }

    // 2. Paste the Lasso / Selection copied object as a new movable & resizable layer (with Ctrl+Z undo!)
    if (this.copiedSelectionBuffer) {
      this.pushHistory('Paste Selection Object');
      this.copiedSelectionBuffer.pasteCount += 1;
      const offset = 18 * this.copiedSelectionBuffer.pasteCount;

      const c = document.createElement('canvas');
      c.width = this.copiedSelectionBuffer.width;
      c.height = this.copiedSelectionBuffer.height;
      c.getContext('2d')!.drawImage(this.copiedSelectionBuffer.canvas, 0, 0);

      const pastedLayer: LayerItem = {
        id: `layer-lasso-paste-${Date.now()}`,
        name: `${this.copiedSelectionBuffer.sourceName} (Colado ${this.copiedSelectionBuffer.pasteCount})`,
        kind: 'pixel',
        visible: true,
        locked: false,
        lockTransparentPixels: false,
        lockPosition: false,
        blendMode: 'source-over',
        opacity: 100,
        fill: 100,
        x: Math.round(this.copiedSelectionBuffer.x + offset),
        y: Math.round(this.copiedSelectionBuffer.y + offset),
        width: this.copiedSelectionBuffer.width,
        height: this.copiedSelectionBuffer.height,
        rotation: 0,
        canvas: c,
      };

      const activeIdx = this.layers.findIndex((l) => l.id === this.activeLayerId);
      if (activeIdx >= 0) {
        this.layers.splice(activeIdx + 1, 0, pastedLayer);
      } else {
        this.layers.push(pastedLayer);
      }

      this.activeLayerId = pastedLayer.id;
      this.clearSelection();
      this.setTool('move');
      this.renderLayersList();
      this.renderOptionsStrip();
      return;
    }

    // 3. Otherwise try reading external image from system clipboard
    try {
      if (navigator.clipboard && 'read' in navigator.clipboard) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            this.importImageFileAsLayer(blob, `Captura colada ${this.layers.length}`);
            return;
          }
        }
      }
    } catch {
      // Fallback if clipboard permission is blocked in iframe
    }

    this.pushHistory('Paste Layer');
    const w = 360;
    const h = 240;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, this.fgColor);
    grad.addColorStop(1, '#498a6e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#faf7f2';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = '#faf7f2';
    ctx.font = 'bold 20px "Lucida Console", "Consolas", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Captura / Imagem Colada', w / 2, h / 2 + 8);

    const layer: LayerItem = {
      id: `layer-paste-${Date.now()}`,
      name: `Captura de tela ${new Date().toLocaleTimeString()}`,
      kind: 'pixel',
      visible: true,
      locked: false,
      lockTransparentPixels: false,
      lockPosition: false,
      blendMode: 'source-over',
      opacity: 100,
      fill: 100,
      x: Math.round((this.docWidth - w) / 2),
      y: Math.round((this.docHeight - h) / 2),
      width: w,
      height: h,
      rotation: 0,
      canvas: c,
    };
    this.layers.push(layer);
    this.activeLayerId = layer.id;
    this.setTool('move');
    this.renderLayersList();
  }

  private importImageFileAsLayer(file: Blob, customName?: string): void {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.pushHistory('Import Image');
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const name = customName || (file instanceof File ? file.name : 'Imagem Colada');
      const layer: LayerItem = {
        id: `layer-img-${Date.now()}`,
        name,
        kind: 'pixel',
        visible: true,
        locked: false,
        lockTransparentPixels: false,
        lockPosition: false,
        blendMode: 'source-over',
        opacity: 100,
        fill: 100,
        x: Math.round((this.docWidth - img.width) / 2),
        y: Math.round((this.docHeight - img.height) / 2),
        width: img.width,
        height: img.height,
        rotation: 0,
        canvas: c,
      };
      this.layers.push(layer);
      this.activeLayerId = layer.id;
      this.setTool('move');
      this.renderLayersList();
    };
    img.src = url;
  }

  private async loadCustomFontFile(file: File): Promise<void> {
    try {
      const buffer = await file.arrayBuffer();
      const fontName = file.name.replace(/\.[^/.]+$/, '');
      const fontFace = new FontFace(fontName, buffer);
      await fontFace.load();
      document.fonts.add(fontFace);
      if (!this.availableFonts.includes(fontName)) {
        this.availableFonts.unshift(fontName);
      }
      const active = this.getActiveLayer();
      if (active?.kind === 'text' && active.textData) {
        active.textData.fontFamily = fontName;
        renderTextLayerCanvas(active);
      }
      this.renderOptionsStrip();
    } catch (err) {
      console.error('Erro ao carregar fonte:', err);
    }
  }

  private applyCheckerPatternToLayer(): void {
    const layer = this.getActiveLayer();
    if (!layer || layer.locked) return;
    this.pushHistory('Pattern Fill');
    const ctx = layer.canvas.getContext('2d')!;
    ctx.save();
    ctx.strokeStyle = this.fgColor;
    ctx.globalAlpha = 0.35;
    for (let x = 0; x < layer.width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, layer.height);
      ctx.stroke();
    }
    for (let y = 0; y < layer.height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(layer.width, y);
      ctx.stroke();
    }
    ctx.restore();
    this.renderLayersList();
  }

  private pushHistory(label: string): void {
    const serializedLayers: SerializedLayerSnapshot[] = this.layers.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      visible: l.visible,
      locked: l.locked,
      lockTransparentPixels: l.lockTransparentPixels,
      lockPosition: l.lockPosition,
      blendMode: l.blendMode,
      opacity: l.opacity,
      fill: l.fill,
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      rotation: l.rotation,
      dataUrl: l.canvas.toDataURL('image/png'),
      textData: l.textData
        ? {
            ...l.textData,
            warpCorners: [
              { ...l.textData.warpCorners[0] },
              { ...l.textData.warpCorners[1] },
              { ...l.textData.warpCorners[2] },
              { ...l.textData.warpCorners[3] },
            ],
          }
        : undefined,
    }));

    this.history.push({
      label,
      timestamp: Date.now(),
      docWidth: this.docWidth,
      docHeight: this.docHeight,
      activeLayerId: this.activeLayerId,
      layers: serializedLayers,
      selection: {
        ...this.selection,
        normalizedPoints: this.selection.normalizedPoints.map((p) => ({ ...p })),
      },
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  private undo(): void {
    const snap = this.history.pop();
    if (!snap) return;
    this.docWidth = snap.docWidth;
    this.docHeight = snap.docHeight;
    this.activeLayerId = snap.activeLayerId;
    this.selection = snap.selection;

    this.layers = snap.layers.map((sl) => {
      const c = document.createElement('canvas');
      c.width = sl.width;
      c.height = sl.height;
      const img = new Image();
      img.onload = () => {
        c.getContext('2d')?.drawImage(img, 0, 0);
        this.renderLayersList();
      };
      img.src = sl.dataUrl;

      return {
        id: sl.id,
        name: sl.name,
        kind: sl.kind,
        visible: sl.visible,
        locked: sl.locked,
        lockTransparentPixels: sl.lockTransparentPixels,
        lockPosition: sl.lockPosition,
        blendMode: sl.blendMode,
        opacity: sl.opacity,
        fill: sl.fill,
        x: sl.x,
        y: sl.y,
        width: sl.width,
        height: sl.height,
        rotation: sl.rotation,
        canvas: c,
        textData: sl.textData,
      };
    });

    this.renderLayersList();
    this.renderOptionsStrip();
  }

  private createExportModal(): HTMLElement {
    const backdrop = document.createElement('div');
    backdrop.className = 'pc-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'pc-modal';
    modal.style.width = '540px';

    const renderContent = () => {
      const outW = Math.round(this.docWidth * this.exportScale);
      const outH = Math.round(this.docHeight * this.exportScale);

      modal.innerHTML = `
        <div class="pc-modal-header">
          <span>Exportar Arquivo / Salvar Projeto (.PS / .PSD / PDF / Imagem)</span>
          <button class="pc-btn" id="pc-export-modal-close">✕</button>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="display:flex;flex-direction:column;gap:4px;">
              <label class="pc-opt-label">Nome do Arquivo</label>
              <input type="text" class="pc-input" id="pc-exp-name" value="${this.docName}" style="height:26px;" />
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <label class="pc-opt-label">Formato de Arquivo / Projeto</label>
              <select class="pc-select" id="pc-exp-format" style="height:26px;">
                <option value="psd" ${this.exportFormat === 'psd' ? 'selected' : ''}>Adobe Photoshop (.psd)</option>
                <option value="ps" ${this.exportFormat === 'ps' ? 'selected' : ''}>Save Project (.ps)</option>
                <option value="pdf" ${this.exportFormat === 'pdf' ? 'selected' : ''}>Documento PDF (.pdf)</option>
                <option value="png" ${this.exportFormat === 'png' ? 'selected' : ''}>Imagem PNG (.png)</option>
                <option value="jpeg" ${this.exportFormat === 'jpeg' ? 'selected' : ''}>Imagem JPEG (.jpg)</option>
                <option value="webp" ${this.exportFormat === 'webp' ? 'selected' : ''}>Imagem WebP (.webp)</option>
                <option value="svg" ${this.exportFormat === 'svg' ? 'selected' : ''}>Vetor / Imagem SVG (.svg)</option>
              </select>
            </div>
          </div>

          <div style="background:var(--pc-bg-panel-dark);padding:12px;border-radius:4px;border:1px solid var(--pc-border-subtle);display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="color:var(--pc-text-bright);">Qualidade da Imagem (Aplicada a Qualquer Formato)</strong>
              <span id="pc-exp-q-badge" style="font-weight:700;color:var(--pc-accent);">${this.exportQuality}%</span>
            </div>
            <input type="range" class="pc-slider" id="pc-exp-q-slider" min="5" max="100" value="${this.exportQuality}" style="width:100%;" />
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="pc-btn ${this.exportQuality === 40 ? 'pc-btn-active' : ''}" data-q="40">Baixa (40%)</button>
              <button class="pc-btn ${this.exportQuality === 70 ? 'pc-btn-active' : ''}" data-q="70">Média (70%)</button>
              <button class="pc-btn ${this.exportQuality === 90 ? 'pc-btn-active' : ''}" data-q="90">Alta (90%)</button>
              <button class="pc-btn ${this.exportQuality === 100 ? 'pc-btn-active' : ''}" data-q="100">Máxima / Sem Perda (100%)</button>
            </div>
          </div>

          <div style="background:var(--pc-bg-panel-dark);padding:12px;border-radius:4px;border:1px solid var(--pc-border-subtle);display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="color:var(--pc-text-bright);">Escala de Resolução de Saída</strong>
              <span id="pc-exp-res-badge" style="font-weight:700;color:var(--pc-text-bright);">${outW} × ${outH} px (${this.exportScale}x)</span>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${[0.5, 1, 1.5, 2, 3, 4]
                .map(
                  (sc) =>
                    `<button class="pc-btn ${this.exportScale === sc ? 'pc-btn-active' : ''}" data-sc="${sc}">${sc}x (${Math.round(this.docWidth * sc)}×${Math.round(this.docHeight * sc)})</button>`,
                )
                .join('')}
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
            <button class="pc-btn" id="pc-exp-cancel">Cancelar</button>
            <button class="pc-btn pc-btn-primary" id="pc-exp-confirm" style="height:28px;padding:0 14px;">Baixar / Salvar Agora</button>
          </div>
        </div>
      `;

      const nameInp = modal.querySelector('#pc-exp-name') as HTMLInputElement;
      const fmtSel = modal.querySelector('#pc-exp-format') as HTMLSelectElement;
      const qSlider = modal.querySelector('#pc-exp-q-slider') as HTMLInputElement;
      const qBadge = modal.querySelector('#pc-exp-q-badge') as HTMLElement;

      nameInp.addEventListener('input', () => {
        this.docName = nameInp.value.trim() || 'Untitled-1';
      });

      fmtSel.addEventListener('change', () => {
        this.exportFormat = fmtSel.value as ExportFormat;
      });

      qSlider.addEventListener('input', () => {
        this.exportQuality = Number(qSlider.value) || 95;
        qBadge.textContent = `${this.exportQuality}%`;
      });

      modal.querySelectorAll('[data-q]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.exportQuality = Number((btn as HTMLElement).dataset.q) || 95;
          renderContent();
        });
      });

      modal.querySelectorAll('[data-sc]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.exportScale = Number((btn as HTMLElement).dataset.sc) || 1;
          renderContent();
        });
      });

      modal.querySelector('#pc-export-modal-close')?.addEventListener('click', () => {
        backdrop.classList.remove('open');
      });
      modal.querySelector('#pc-exp-cancel')?.addEventListener('click', () => {
        backdrop.classList.remove('open');
      });
      modal.querySelector('#pc-exp-confirm')?.addEventListener('click', () => {
        this.docName = nameInp.value.trim() || this.docName;
        this.exportFormat = fmtSel.value as ExportFormat;
        this.exportDocument(this.exportFormat, this.exportQuality, this.exportScale);
        backdrop.classList.remove('open');
      });
    };

    (backdrop as HTMLElement & { refreshModal?: () => void }).refreshModal = renderContent;
    renderContent();
    backdrop.appendChild(modal);
    return backdrop;
  }

  private openExportModal(): void {
    const fn = (this.exportModalEl as HTMLElement & { refreshModal?: () => void }).refreshModal;
    fn?.();
    this.exportModalEl.classList.add('open');
  }

  private importProjectOrImageFile(file: File): void {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.ps') || lower.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (parsed && Array.isArray(parsed.layers)) {
            this.pushHistory('Load .PS Project');
            this.docName = parsed.name || file.name.replace(/\.[^/.]+$/, '');
            this.docWidth = Number(parsed.width) || 1100;
            this.docHeight = Number(parsed.height) || 760;
            this.compositeCanvas.width = this.docWidth;
            this.compositeCanvas.height = this.docHeight;
            this.layers = parsed.layers.map((sl: SerializedLayerSnapshot) => {
              const c = document.createElement('canvas');
              c.width = sl.width || this.docWidth;
              c.height = sl.height || this.docHeight;
              if (sl.dataUrl) {
                const img = new Image();
                img.onload = () => {
                  c.getContext('2d')?.drawImage(img, 0, 0);
                  this.renderLayersList();
                };
                img.src = sl.dataUrl;
              }
              return {
                id: sl.id || `layer-${Date.now()}-${Math.random()}`,
                name: sl.name || 'Layer',
                kind: sl.kind || 'pixel',
                visible: sl.visible !== false,
                locked: Boolean(sl.locked),
                lockTransparentPixels: Boolean(sl.lockTransparentPixels),
                lockPosition: Boolean(sl.lockPosition),
                blendMode: sl.blendMode || 'source-over',
                opacity: sl.opacity ?? 100,
                fill: sl.fill ?? 100,
                x: sl.x ?? 0,
                y: sl.y ?? 0,
                width: sl.width || this.docWidth,
                height: sl.height || this.docHeight,
                rotation: sl.rotation ?? 0,
                canvas: c,
                textData: sl.textData,
              };
            });
            if (this.layers.length > 0) {
              this.activeLayerId = this.layers[this.layers.length - 1].id;
            }
            this.centerDocumentInViewport();
            this.renderLayersList();
            this.renderOptionsStrip();
            return;
          }
        } catch {
          // If not JSON, fallback to image import
        }
        this.importImageFileAsLayer(file);
      };
      reader.readAsText(file);
      return;
    }
    this.importImageFileAsLayer(file);
  }

  private exportDocument(
    format: ExportFormat,
    quality = this.exportQuality,
    scale = this.exportScale,
  ): void {
    this.updateCompositeCanvas();
    const a = document.createElement('a');
    const qNorm = Math.max(0.05, Math.min(1, quality / 100));

    if (format === 'ps') {
      const blob = generatePsProjectBlob(
        this.docName,
        this.docWidth,
        this.docHeight,
        this.layers,
        quality,
        scale,
      );
      a.href = URL.createObjectURL(blob);
      a.download = `${this.docName}.ps`;
      a.click();
      return;
    }

    const scaledCanvas = buildScaledExportCanvas(
      this.compositeCanvas,
      scale,
      quality,
      format === 'jpeg' || format === 'pdf',
    );

    if (format === 'psd') {
      const psdBlob = generatePsdBlobFromCanvas(scaledCanvas);
      a.href = URL.createObjectURL(psdBlob);
      a.download = `${this.docName}.psd`;
      a.click();
      return;
    }

    if (format === 'pdf') {
      const pdfBlob = generatePdfBlobFromCanvas(scaledCanvas, quality);
      a.href = URL.createObjectURL(pdfBlob);
      a.download = `${this.docName}.pdf`;
      a.click();
      return;
    }

    if (format === 'svg') {
      const embeddedMime = quality < 100 ? 'image/webp' : 'image/png';
      const imgData = scaledCanvas.toDataURL(embeddedMime, qNorm);
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${scaledCanvas.width}" height="${scaledCanvas.height}" viewBox="0 0 ${scaledCanvas.width} ${scaledCanvas.height}">
        <image href="${imgData}" width="${scaledCanvas.width}" height="${scaledCanvas.height}" />
      </svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      a.href = URL.createObjectURL(blob);
      a.download = `${this.docName}.svg`;
      a.click();
      return;
    }

    const mime =
      format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : format;
    a.href = scaledCanvas.toDataURL(mime, qNorm);
    a.download = `${this.docName}.${ext}`;
    a.click();
  }

  private openBrushPopoverAt(clientX: number, clientY: number): void {
    this.renderBrushPopover();
    const x = Math.min(window.innerWidth - 280, Math.max(12, clientX));
    const y = Math.min(window.innerHeight - 340, Math.max(52, clientY));
    this.brushPopoverEl.style.left = `${x}px`;
    this.brushPopoverEl.style.top = `${y}px`;
    this.brushPopoverEl.classList.add('open');
  }

  private closeBrushPopover(): void {
    this.brushPopoverEl?.classList.remove('open');
  }

  private closeAllDropdowns(): void {
    this.activeMenuDropdown = null;
    document.querySelectorAll('.pc-dropdown.open').forEach((el) => el.classList.remove('open'));
    document.querySelectorAll('.pc-menu-btn.active').forEach((el) => el.classList.remove('active'));
  }

  private resizeViewportCanvas(): void {
    if (!this.viewportCanvas) return;
    const rect = this.viewportCanvas.parentElement!.getBoundingClientRect();
    this.viewportCanvas.width = rect.width;
    this.viewportCanvas.height = rect.height;
  }

  private centerDocumentInViewport(): void {
    if (!this.viewportCanvas) return;
    const rect = this.viewportCanvas.parentElement?.getBoundingClientRect() ?? {
      width: window.innerWidth,
      height: window.innerHeight - 56,
    };
    this.panX = Math.round((rect.width - this.docWidth * this.zoom) / 2);
    this.panY = Math.round((rect.height - this.docHeight * this.zoom) / 2) + 22;
    this.updateStatusBar();
  }

  private adjustZoom(factor: number, pivotClientX?: number, pivotClientY?: number): void {
    const prevZoom = this.zoom;
    const nextZoom = Math.max(0.1, Math.min(8, prevZoom * factor));
    if (pivotClientX !== undefined && pivotClientY !== undefined) {
      const rect = this.viewportCanvas.getBoundingClientRect();
      const vx = pivotClientX - rect.left;
      const vy = pivotClientY - rect.top;
      const docX = (vx - this.panX) / prevZoom;
      const docY = (vy - this.panY) / prevZoom;
      this.panX = vx - docX * nextZoom;
      this.panY = vy - docY * nextZoom;
    }
    this.zoom = nextZoom;
    this.updateStatusBar();
  }

  private screenToDoc(clientX: number, clientY: number): Point2D {
    const rect = this.viewportCanvas.getBoundingClientRect();
    const vx = clientX - rect.left;
    const vy = clientY - rect.top;
    return {
      x: (vx - this.panX) / this.zoom,
      y: (vy - this.panY) / this.zoom,
    };
  }

  private updateStatusBar(): void {
    if (!this.statusZoomEl || !this.statusToolEl) return;
    this.statusToolEl.textContent = `Tool: ${this.activeTool.toUpperCase()}`;
    this.statusZoomEl.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  private updateCompositeCanvas(): void {
    const ctx = this.compositeCtx;
    ctx.clearRect(0, 0, this.docWidth, this.docHeight);

    for (const layer of this.layers) {
      if (!layer.visible) continue;
      const effectiveAlpha = (layer.opacity / 100) * (layer.fill / 100);
      if (effectiveAlpha <= 0) continue;

      ctx.save();
      ctx.globalAlpha = effectiveAlpha;
      ctx.globalCompositeOperation = layer.blendMode;

      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.drawImage(
        layer.canvas,
        -layer.width / 2,
        -layer.height / 2,
        layer.width,
        layer.height,
      );
      ctx.restore();
    }
  }

  private startRenderLoop(): void {
    const tick = () => {
      this.marchingAntsOffset = (this.marchingAntsOffset + 0.35) % 16;
      this.renderViewport();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private renderViewport(): void {
    if (!this.viewportCtx || !this.viewportCanvas) return;
    const ctx = this.viewportCtx;
    const w = this.viewportCanvas.width;
    const h = this.viewportCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Lighter sky blue (#9acef8) as the base workspace background from the palette
    ctx.fillStyle = '#9acef8';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    const anyPixelMode =
      this.brushSettings.pixelSnap || this.eraserSettings.pixelSnap || this.zoom >= 3;
    ctx.imageSmoothingEnabled = !anyPixelMode;

    ctx.save();
    ctx.strokeStyle = '#2196f3';
    ctx.lineWidth = 1.2 / this.zoom;
    ctx.strokeRect(0, 0, this.docWidth, this.docHeight);
    ctx.restore();

    for (const layer of this.layers) {
      if (!layer.visible) continue;
      const effectiveAlpha = (layer.opacity / 100) * (layer.fill / 100);
      if (effectiveAlpha <= 0) continue;

      ctx.save();
      ctx.globalAlpha = effectiveAlpha;
      ctx.globalCompositeOperation = layer.blendMode;

      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((layer.rotation * Math.PI) / 180);

      if (layer.id === 'layer-bg') {
        ctx.save();
        ctx.shadowColor = 'rgba(13, 43, 69, 0.28)';
        ctx.shadowBlur = 20 / this.zoom;
        ctx.shadowOffsetY = 5 / this.zoom;
        ctx.drawImage(
          layer.canvas,
          -layer.width / 2,
          -layer.height / 2,
          layer.width,
          layer.height,
        );
        ctx.restore();
      } else {
        ctx.drawImage(
          layer.canvas,
          -layer.width / 2,
          -layer.height / 2,
          layer.width,
          layer.height,
        );
      }

      ctx.restore();
    }

    const activeLayer = this.getActiveLayer();
    if (activeLayer && (this.activeTool === 'move' || this.activeTool === 'text')) {
      ctx.save();
      ctx.strokeStyle = '#2196f3';
      ctx.lineWidth = 1.4 / this.zoom;
      ctx.strokeRect(activeLayer.x, activeLayer.y, activeLayer.width, activeLayer.height);

      const layerHandles = getTransformHandles(activeLayer);
      const hs = 6.5 / this.zoom;
      layerHandles.forEach((h) => {
        ctx.fillStyle = h.type === 'rot' ? '#9acef8' : '#e8f5ff';
        ctx.strokeStyle = '#2196f3';
        ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
      });

      if (activeLayer.kind === 'text' && activeLayer.textData && activeLayer.textData.warpEnabled) {
        const corners = activeLayer.textData.warpCorners.map((pt) => ({
          x: activeLayer.x + pt.x * activeLayer.width,
          y: activeLayer.y + pt.y * activeLayer.height,
        }));
        ctx.strokeStyle = '#2196f3';
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.stroke();

        corners.forEach((c) => {
          ctx.fillStyle = '#e8f5ff';
          ctx.strokeStyle = '#2196f3';
          ctx.beginPath();
          ctx.arc(c.x, c.y, 4.5 / this.zoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.restore();
    }

    if (this.showGuides) {
      ctx.save();
      ctx.strokeStyle = '#2196f3';
      ctx.lineWidth = 1 / this.zoom;
      if (this.activeSnapLines.vertical !== undefined) {
        ctx.beginPath();
        ctx.moveTo(this.activeSnapLines.vertical, -2000);
        ctx.lineTo(this.activeSnapLines.vertical, this.docHeight + 2000);
        ctx.stroke();
      }
      if (this.activeSnapLines.horizontal !== undefined) {
        ctx.beginPath();
        ctx.moveTo(-2000, this.activeSnapLines.horizontal);
        ctx.lineTo(this.docWidth + 2000, this.activeSnapLines.horizontal);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Render live open Freehand Lasso path while drawing (before one end crosses the other)
    if (this.isLassoDrawing && this.lassoDraftPoints.length > 0) {
      ctx.save();
      ctx.lineWidth = 1.5 / this.zoom;

      // Dark base stroke for contrast
      ctx.strokeStyle = '#0d2b45';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(this.lassoDraftPoints[0].x, this.lassoDraftPoints[0].y);
      for (let i = 1; i < this.lassoDraftPoints.length; i++) {
        ctx.lineTo(this.lassoDraftPoints[i].x, this.lassoDraftPoints[i].y);
      }
      if (this.lassoCursorDocPt) {
        ctx.lineTo(this.lassoCursorDocPt.x, this.lassoCursorDocPt.y);
      }
      ctx.stroke();

      // Animated blue/ice marching dashes over the open lasso line
      ctx.strokeStyle = '#e8f5ff';
      ctx.setLineDash([5 / this.zoom, 4 / this.zoom]);
      ctx.lineDashOffset = -this.marchingAntsOffset / this.zoom;
      ctx.stroke();

      // Highlight the starting tip so the user knows where the lasso began
      const startPt = this.lassoDraftPoints[0];
      ctx.setLineDash([]);
      ctx.fillStyle = '#2196f3';
      ctx.strokeStyle = '#e8f5ff';
      ctx.lineWidth = 1.2 / this.zoom;
      ctx.beginPath();
      ctx.arc(startPt.x, startPt.y, 4.5 / this.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (this.selection.active) {
      const pts = getSelectionPolygonDocumentPoints(this.selection);
      if (pts.length >= 3) {
        ctx.save();
        ctx.lineWidth = 1.2 / this.zoom;

        ctx.strokeStyle = '#0d2b45';
        ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
        ctx.lineDashOffset = 0;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.stroke();

        ctx.strokeStyle = '#e8f5ff';
        ctx.lineDashOffset = this.marchingAntsOffset / this.zoom;
        ctx.stroke();

        const handles = getTransformHandles(this.selection);
        const hs = 6 / this.zoom;
        ctx.setLineDash([]);
        handles.forEach((h) => {
          ctx.fillStyle = h.type === 'rot' ? '#9acef8' : '#e8f5ff';
          ctx.strokeStyle = '#2196f3';
          ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
          ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        });
        ctx.restore();
      }
    }

    ctx.restore();
  }

  private hsvToHex(h: number, s: number, v: number): string {
    const sNorm = s / 100;
    const vNorm = v / 100;
    const c = vNorm * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = vNorm - c;
    let r = 0,
      g = 0,
      b = 0;
    if (h >= 0 && h < 60) [r, g, b] = [c, x, 0];
    else if (h >= 60 && h < 120) [r, g, b] = [x, c, 0];
    else if (h >= 120 && h < 180) [r, g, b] = [0, c, x];
    else if (h >= 180 && h < 240) [r, g, b] = [0, x, c];
    else if (h >= 240 && h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    const toHex = (n: number) =>
      Math.round((n + m) * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private syncHsvFromHex(hex: string): void {
    const { r, g, b } = hexToRgb(hex);
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rNorm) h = ((gNorm - bNorm) / d) % 6;
      else if (max === gNorm) h = (bNorm - rNorm) / d + 2;
      else h = (rNorm - gNorm) / d + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : (d / max) * 100;
    const v = max * 100;
    this.hsv = { h, s, v };
  }
}
