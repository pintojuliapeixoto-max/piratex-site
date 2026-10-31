import { BrushPreset, DocumentPreset, GradientPreset } from './types';

export const DEFAULT_DOCUMENT_PRESETS: DocumentPreset[] = [
  // Papel (Print / Paper)
  {
    id: 'paper-a4-portrait',
    name: 'Papel A4 (Retrato)',
    category: 'paper',
    width: 794,
    height: 1123,
    dpi: 300,
    description: '210 × 297 mm · Padrão Internacional ISO',
  },
  {
    id: 'paper-a4-landscape',
    name: 'Papel A4 (Paisagem)',
    category: 'paper',
    width: 1123,
    height: 794,
    dpi: 300,
    description: '297 × 210 mm · Folha A4 Horizontal',
  },
  {
    id: 'paper-a3',
    name: 'Papel A3',
    category: 'paper',
    width: 1123,
    height: 1587,
    dpi: 300,
    description: '297 × 420 mm · Pôster e Ilustração',
  },
  {
    id: 'paper-letter',
    name: 'Carta (US Letter)',
    category: 'paper',
    width: 816,
    height: 1056,
    dpi: 300,
    description: '8.5 × 11 pol · Documento Padrão',
  },
  // Web
  {
    id: 'web-standard',
    name: 'Web Padrão (HD+)',
    category: 'web',
    width: 1280,
    height: 800,
    dpi: 72,
    description: '1280 × 800 px · Layout Web Clássico',
  },
  {
    id: 'web-large',
    name: 'Web Desktop (1440p)',
    category: 'web',
    width: 1440,
    height: 900,
    dpi: 72,
    description: '1440 × 900 px · Widescreen Design',
  },
  {
    id: 'web-square',
    name: 'Social / Web Quadrado',
    category: 'web',
    width: 1080,
    height: 1080,
    dpi: 72,
    description: '1080 × 1080 px · Post & Criativo Digital',
  },
  {
    id: 'web-banner',
    name: 'OpenGraph / Capa Web',
    category: 'web',
    width: 1200,
    height: 630,
    dpi: 72,
    description: '1200 × 630 px · Compartilhamento Web',
  },
  // Filme e Vídeo
  {
    id: 'video-fhd',
    name: 'Full HD 1080p (H.264/Broadcast)',
    category: 'video',
    width: 1920,
    height: 1080,
    dpi: 72,
    description: '1920 × 1080 px · Proporção 16:9',
  },
  {
    id: 'video-hd',
    name: 'HD 720p Vídeo',
    category: 'video',
    width: 1280,
    height: 720,
    dpi: 72,
    description: '1280 × 720 px · Produção Leve 16:9',
  },
  {
    id: 'video-vertical',
    name: 'Filme Vertical (Reels / Shorts)',
    category: 'video',
    width: 1080,
    height: 1920,
    dpi: 72,
    description: '1080 × 1920 px · Proporção 9:16',
  },
  {
    id: 'video-cinema',
    name: 'Cinema Anamórfico 2.39:1',
    category: 'video',
    width: 1920,
    height: 803,
    dpi: 72,
    description: '1920 × 803 px · Widescreen Escopo',
  },
  // Pré-salvos (Saved)
  {
    id: 'saved-piratex-canvas',
    name: 'Prancheta Piratex Studio',
    category: 'saved',
    width: 1100,
    height: 760,
    dpi: 96,
    description: '1100 × 760 px · Formato Base da Referência',
  },
  {
    id: 'saved-concept-art',
    name: 'Concept Art Ilustração',
    category: 'saved',
    width: 1600,
    height: 1000,
    dpi: 150,
    description: '1600 × 1000 px · Pintura Digital 16:10',
  },
];

export const DEFAULT_BRUSH_PRESETS: BrushPreset[] = [
  {
    id: 'pc-hard-round',
    name: 'Redondo Duro (Piratex Base)',
    packName: 'Piratex Core',
    size: 24,
    opacity: 100,
    flow: 100,
    rotation: 0,
    hardness: 95,
    spacing: 12,
    roundness: 100,
    pixelSnap: false,
    tipShape: 'circle',
  },
  {
    id: 'pc-soft-airbrush',
    name: 'Aerógrafo Suave (Flow Control)',
    packName: 'Piratex Core',
    size: 64,
    opacity: 85,
    flow: 35,
    rotation: 0,
    hardness: 15,
    spacing: 10,
    roundness: 100,
    pixelSnap: false,
    tipShape: 'airbrush',
  },
  {
    id: 'pc-pixel-crisp',
    name: 'Pincel de Pixels Nítido (1:1)',
    packName: 'Piratex Core',
    size: 8,
    opacity: 100,
    flow: 100,
    rotation: 0,
    hardness: 100,
    spacing: 8,
    roundness: 100,
    pixelSnap: true,
    tipShape: 'pixel',
  },
  {
    id: 'ps-calligraphy-45',
    name: 'Pena Caligráfica 45°',
    packName: 'Photoshop Classic Pack',
    size: 32,
    opacity: 100,
    flow: 90,
    rotation: 45,
    hardness: 90,
    spacing: 8,
    roundness: 28,
    pixelSnap: false,
    tipShape: 'calligraphy',
  },
  {
    id: 'ps-dry-chalk',
    name: 'Giz Seco Texturizado',
    packName: 'Photoshop Classic Pack',
    size: 42,
    opacity: 92,
    flow: 65,
    rotation: 15,
    hardness: 70,
    spacing: 18,
    roundness: 75,
    pixelSnap: false,
    tipShape: 'chalk',
  },
  {
    id: 'ps-flat-marker',
    name: 'Marcador Quadrado Angular',
    packName: 'Photoshop Classic Pack',
    size: 36,
    opacity: 80,
    flow: 75,
    rotation: 30,
    hardness: 100,
    spacing: 10,
    roundness: 60,
    pixelSnap: false,
    tipShape: 'square',
  },
  {
    id: 'ps-star-stamp',
    name: 'Estampador Estelar',
    packName: 'Photoshop Classic Pack',
    size: 48,
    opacity: 100,
    flow: 100,
    rotation: 0,
    hardness: 90,
    spacing: 45,
    roundness: 100,
    pixelSnap: false,
    tipShape: 'star',
  },
];

export const DEFAULT_SWATCHES: string[] = [
  '#2196F3', // Palette Band 1: Vibrant Sky Blue
  '#6EB8F5', // Palette Band 2: Medium Sky Blue
  '#9ACEF8', // Palette Band 3: Soft Azure Blue
  '#C3E3FD', // Palette Band 4: Light Ice Blue
  '#E8F5FF', // Palette Band 5: Very Pale Cloud Blue
  '#FFFFFF', // Pure White
  '#B3E5FC', // Light Pastel Cyan-Blue
  '#81D4FA', // Soft Cerulean Sky
  '#4FC3F7', // Bright Aqua Sky
  '#29B6F6', // Clear Breeze Blue
  '#03A9F4', // Vivid Azure
  '#1E88E5', // Classic Studio Blue
  '#1976D2', // Deep Cobalt Accent
  '#BBDEFB', // Powder Blue
  '#E3F2FD', // Mist White-Blue
  '#80DEEA', // Light Lagoon
  '#4DD0E1', // Turquoise Sky
  '#90CAF9', // Periwinkle Ice
  '#64B5F6', // Cornflower Light Blue
  '#42A5F5', // Summer Sky Blue
  '#A7FFEB', // Soft Mint Ice
  '#CFD8DC', // Cool Silver Mist
  '#546E7A', // Muted Slate
  '#0D2B45', // Deep Navy Ink
];

export const DEFAULT_GRADIENTS: GradientPreset[] = [
  {
    id: 'grad-palette-full',
    name: 'Paleta Azul Clara Completa',
    type: 'linear',
    angle: 90,
    stops: [
      { offset: 0, color: '#2196F3' },
      { offset: 0.25, color: '#6EB8F5' },
      { offset: 0.5, color: '#9ACEF8' },
      { offset: 0.75, color: '#C3E3FD' },
      { offset: 1, color: '#E8F5FF' },
    ],
  },
  {
    id: 'grad-sky-cloud',
    name: 'Céu Claro → Nuvem Suave',
    type: 'linear',
    angle: 135,
    stops: [
      { offset: 0, color: '#6EB8F5' },
      { offset: 0.5, color: '#C3E3FD' },
      { offset: 1, color: '#E8F5FF' },
    ],
  },
  {
    id: 'grad-azure-radial',
    name: 'Brilho Celeste Radial',
    type: 'radial',
    angle: 0,
    stops: [
      { offset: 0, color: '#FFFFFF' },
      { offset: 0.45, color: '#E8F5FF' },
      { offset: 0.8, color: '#9ACEF8' },
      { offset: 1, color: '#2196F3' },
    ],
  },
  {
    id: 'grad-ice-horizon',
    name: 'Horizonte Cristalino',
    type: 'linear',
    angle: 180,
    stops: [
      { offset: 0, color: '#2196F3' },
      { offset: 0.5, color: '#9ACEF8' },
      { offset: 1, color: '#E8F5FF' },
    ],
  },
  {
    id: 'grad-breeze',
    name: 'Brisa Pastel Suave',
    type: 'linear',
    angle: 45,
    stops: [
      { offset: 0, color: '#9ACEF8' },
      { offset: 0.5, color: '#C3E3FD' },
      { offset: 1, color: '#FFFFFF' },
    ],
  },
];

export const DEFAULT_FONTS: string[] = [
  'Lucida Console',
  'Consolas',
  'Courier New',
  'Plus Jakarta Sans',
  'Playfair Display',
  'Oswald',
  'Bricolage Grotesque',
  'JetBrains Mono',
  'Georgia',
  'Impact',
];

export const BLEND_MODES: Array<{ label: string; value: GlobalCompositeOperation }> = [
  { label: 'Normal', value: 'source-over' },
  { label: 'Multiply', value: 'multiply' },
  { label: 'Screen', value: 'screen' },
  { label: 'Overlay', value: 'overlay' },
  { label: 'Darken', value: 'darken' },
  { label: 'Lighten', value: 'lighten' },
  { label: 'Color Dodge', value: 'color-dodge' },
  { label: 'Color Burn', value: 'color-burn' },
  { label: 'Hard Light', value: 'hard-light' },
  { label: 'Soft Light', value: 'soft-light' },
  { label: 'Difference', value: 'difference' },
  { label: 'Exclusion', value: 'exclusion' },
];
