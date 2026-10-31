# PhotoCraft Studio — Editor de Imagem Profissional 2D

Uma evolução web 2D construída sobre a base visual e funcional do **PhotoCraft Online** (`photocraftonline.netlify.app`) e do layout enviado na imagem de referência (`Untitled-1.png`), remodelada com a **Barra Superior Unificada**, o **Balde de Tinta**, o **menu de configurações de Pincel no clique direito**, **divisão de camadas por Laço** e **distorção de texto por linhas guias**.

## Revisão do Usuário & Decisões Confirmadas

> [!IMPORTANT]
> Este plano consolida o funcionamento do app base **PhotoCraft Online** com todas as modificações solicitadas para o novo design clean.

- **Base Funcional PhotoCraft Online + Barra Superior Unificada**: Preserva os menus superiores (`File`, `Edit`, `Image`, `Layer`, `Type`, `Select`, `Filter`, `View`, `Window`, `Help`) e move todas as ferramentas principais que antes ficavam na lateral diretamente para a **Barra Superior**, junto com o fluxo de **New Document / Document Presets (A4, Web, Filme e Vídeo, Pré-salvos)**, **Colar** e **Formatos de Exportação**.
- **Ferramentas na Barra Superior + Balde de Tinta**: Inclui **Mover/Transformar**, **Recortes (Quadrilátero, Triangular, Elipse, Seleção Inteligente)**, **Laço (`L`)**, **Pincel (`P`)**, **Borracha (`E`)**, **Balde de Tinta (Paint Bucket)**, **Conta-Gotas (Eyedropper)**, **Texto (`T`)** e **Hand Tool**, mantendo o ícone ativo destacado em azul (`#2F7BF5`) como na sua captura de tela.
- **Pincel (`P`) e Borracha (`E`) com Usabilidade PhotoCraft + Clique Direito**: A Borracha replica exatamente o formato, dinâmica e controles do Pincel base do PhotoCraft (**Size**, **Opacidade**, **Flow**, **Rotação** e **Pixels/Dureza**). O **botão direito do mouse** sobre o canvas abre instantaneamente os atalhos de configuração do Brush e o gerenciador de pacotes de pincéis de Photoshop (`.abr` / `.json`).
- **Painéis Flutuantes Clean (`Color/Swatches/Gradients/Patterns` e `Layers/Channels/Paths`)**: Reposicionados nas extremidades do canvas exatamente como na imagem enviada, com controle de *Opacity*, *Fill*, *Blend Modes*, *Visibilidade (olhinho)*, *Duplicar + Renomear*, *Nome automático para layers de Texto* e *Cortar/Dividir uma layer em duas através do Laço*.

---

## 1. Visão Geral & Conceito Central

- **O Que Faz**: Combina a experiência de edição em camadas do PhotoCraft Online com uma interface redesenhada de barra única superior para ferramentas e documentos, liberando espaço horizontal para a prancheta 2D e oferecendo manipulação direta de objetos, recortes redimensionáveis pós-criação e tipografia com distorção por linhas guias.
- **Público-Alvo**: Designers, artistas digitais e editores que utilizam o PhotoCraft na web e desejam acesso direto às ferramentas no topo, atalhos rápidos (`L`, `T`, `E`, `P`, `Ctrl+Z`) e segmentação ágil de camadas.
- **Valor Principal**: Elimina a barra lateral esquerda, mantém os painéis originais do PhotoCraft reposicionados de forma limpa e adiciona recursos de recorte geométrico ajustável, divisão de camadas por laço e distorção de texto.

---

## 2. Experiência do Usuário & Design Visual

### Fluxos Principais do Usuário
1. **Barra Superior Principal (Menus + Arquivos + Barra de Ferramentas Centralizada)**:
   - **Linha 1 — Menus do PhotoCraft & Ações Rápidas de Arquivo**: `File` (*New Document...* com abas de Presets: **Papel A4/A3**, **Web**, **Filme e Vídeo**, **Pré-salvos**; *Colar Arquivo* `Ctrl+V`; *Exportar* em PNG, JPG, WebP, SVG, PSD/PCRAFT), `Edit` (`Ctrl+Z` Desfazer/Refazer), `Image`, `Layer`, `Type`, `Select`, `Filter`, `View` (Linhas Guias, Réguas, Grade), `Window` e `Help`.
   - **Linha 2 — Barra de Ferramentas Unificada no Topo**: Disposta horizontalmente no topo do canvas (como no recorte da imagem de referência), contendo:
     - **Mover / Transformar Objeto** (segmentado por layer, com rotação livre e botões rápidos de ângulos fixos `0°`, `90°`, `180°`).
     - **Seleção e Recorte** (**Quadrilátero**, **Triangular**, **Elipse** e **Seleção Inteligente**), permitindo redimensionar a seleção pelas alças após criá-la.
     - **Laço (`L`)** (Laço livre e poligonal + ação direta **"Dividir Layer em Duas pelo Laço"**).
     - **Pincel (`P`)** e **Borracha (`E`)** com motor idêntico (Size, Opacidade, Flow, Rotação e Pixels).
     - **Balde de Tinta (Paint Bucket)** (preenchimento por tolerância ou dentro da seleção ativa com cor sólida ou gradiente).
     - **Conta-Gotas (Eyedropper)** (captura precisa de pixel atualizando o painel Color e `#Hex`).
     - **Texto (`T`)** (fontes customizadas, ângulo, centralidade, escala lateral e distorção por linhas guias).
     - **Hand Tool (Mão)** e **Zoom** para navegação fluida pelo documento.
2. **Menu Contextual do Brush no Botão Direito**:
   - Ao clicar com o **botão direito do mouse** sobre o documento, abre-se o painel rápido de **Brush Settings** na posição do ponteiro, permitindo ajustar **Size**, **Opacidade**, **Flow**, **Rotação da ponta** e **Pixels/Dureza**, criar novos pincéis, importar pacotes de pincéis de Photoshop (`.abr` / `.json`) e exportar pincéis criados.
3. **Painel Flutuante de Cores (`Color` · `Swatches` · `Gradients` · `Patterns`)**:
   - Fiel ao painel superior esquerdo da sua imagem: quadrados de cor de primeiro plano/fundo sobrepostos, seletor 2D de saturação/brilho + barra vertical de matiz (Hue), campos editáveis `# Hex`, `R`, `G`, `B`, além das abas de **Swatches** (# de cores da paleta) e **Gradients** (criador e seletor de degradês).
4. **Painel Flutuante de Camadas (`Layers` · `Channels` · `Paths`)**:
   - Fiel ao painel inferior direito da imagem: filtro `Kind`, seletor de modo de mesclagem (`Normal`, `Multiply`, `Screen`, `Overlay`, etc.), controles numéricos de `Opacity %` e `Fill %` (transparência de preenchimento), ícones de bloqueio (`Lock`), lista de camadas com **olhinho de visibilidade**, miniatura proporcional ao tamanho da imagem na layer, **New Layer**, **Delete Layer**, **Duplicar Layer** (com renomeação imediata) e reordenação de sobreposição.
   - **Regras Especiais de Layer**:
     - As movimentações ocorrem diretamente no canvas de forma segmentada por layer (mantendo a aba de Layers limpa).
     - **Camadas de Texto** assumem automaticamente o texto digitado como nome da layer.
     - **Corte por Laço**: transforma uma layer em duas camadas separadas a partir do contorno desenhado com o Laço.
5. **Texto (`T`) e Distorção por Linhas Guias**:
   - Permite adicionar novas fontes (upload de `.ttf`/`.otf`/`.woff` ou adição rápida), alterar ângulo (`0°`, `90°`, `180°` ou livre), centralidade (esquerda, centro, direita), redimensionar puxando pelas laterais e ativar a **Distorção por Linhas Guias** (envelope interativo de 4 cantos e linhas guias para inclinar/distorcer a tipografia).

### Identidade Visual & Tema
- **Direção Estética**: Interface escura fiel ao **PhotoCraft Online** e à imagem enviada (`Untitled-1.png`).
- **Paleta de Cores**:
  - Fundo do Canvas (`--background`): `#535353` (cinza neutro médio de estúdio).
  - Painéis e Barra Superior (`--surface`): `#262626` / `#1E1E1E` com bordas `#383838` e abas ativas destacadas.
  - Ferramenta Ativa e Guias (`--primary`): `#2F7BF5` (azul PhotoCraft para o contorno de seleção da ferramenta ativa e linhas guias).
- **Tipografia**:
  - Interface: `Plus Jakarta Sans` (12px–13px).
  - Inputs numéricos (`#6F7970`, `R 111`, `G 121`, `B 112`, `Opacity 100%`, `Fill 100%`): `JetBrains Mono` (`tabular-nums`).

---

## 3. Decisões de Produto & Trade-Offs

- **Decisão 1: Replicar a Interface do PhotoCraft Online com a Barra de Ferramentas no Topo**
  - *Abordagem Escolhida*: Manter o visual exato dos painéis flutuantes *Color* e *Layers* e a barra de menus superior do PhotoCraft, posicionando a faixa de ícones de ferramentas horizontalmente no topo (logo acima da prancheta, como na sua montagem visual).
  - *Por quê*: Une a familiaridade imediata do app base em funcionamento na web com a ergonomia limpa solicitada.
- **Decisão 2: Motor Unificado para Pincel (`P`) e Borracha (`E`)**
  - *Abordagem Escolhida*: Compartilhar o mesmo pipeline de carimbo parametrizado (*Size*, *Opacity*, *Flow*, *Rotation*, *Pixel Hardness* e *Custom Tip*) entre Pincel e Borracha, alternando apenas a operação de composição (`source-over` vs `destination-out`).
  - *Por quê*: Cumpre com precisão o requisito de que a borracha tenha a mesma usabilidade, formato e controles do pincel base do PhotoCraft.

---

## 4. Arquitetura Técnica & Estratégia de Dados

### Diagrama de Arquitetura e Componentes

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                     BARRA SUPERIOR UNIFICADA (TOP BAR)                       │
│  [Menus: File · Edit · Image · Layer · Type · Select · Filter · View · Help] │
│  [Ferramentas: Move | Recortes(Quad/Tri/Elipse/Smart) | Laço(L) | Pincel(P) |│
│                Borracha(E) | Balde de Tinta | Conta-Gotas | Texto(T) | Hand] │
│  [Barra de Opções: Presets · Size/Opacity/Flow/Rotação/Pixels · Ângulos Fixos│
│                    0°/90°/180° · Dividir Layer pelo Laço · Fontes & Guias]   │
└──────────┬───────────────────────────────┬────────────────────────┬──────────┘
           │                               │                        │
           ▼                               ▼                        ▼
┌──────────────────────┐  ┌─────────────────────────────────┐  ┌───────────────┐
│ Painel Color/Swatches│  │     CANVAS 2D PHOTOCRAFT        │  │ Painel Layers │
│ • Color / Swatches / │  │ • Prancheta + Réguas + Guias    │  │ • Kind Filter │
│   Gradients / Pattern│  │ • Movimentação por Layer        │  │ • Normal/Blend│
│ • Seletor HSB 2D     │  │ • Seleção ajustável pós-criação │  │ • Opacity 100%│
│ • #Hex, R, G, B      │  │ • Laço: Cortar em 2 Layers      │  │ • Fill 100%   │
├──────────────────────┤  │ • Texto: Tamanho lateral +      │  │ • Olhinho/Lock│
│ Clique Direito Canvas│  │   Distorção por Linhas Guias    │  │ • Duplicar &  │
│ • Atalhos do Brush   │  │ • Histórico Ctrl+Z Multi-nível  │  │   Renomear    │
│ • Pacotes Photoshop  │  └─────────────────────────────────┘  └───────────────┘
└──────────────────────┘
```

### Modelo de Dados & Fluxos de Estado
- **Gerenciador de Documentos (`DocumentManager`)**:
  - Presets prontos para **Papel** (A4 2480×3508 / 794×1123, A3, Carta), **Web** (1920×1080, 1440×900, 1080×1080), **Filme e Vídeo** (1920×1080 Full HD, 3840×2160 4K, 1280×720 HD) e **Pré-salvos** (persistidos em `localStorage`).
  - Suporte a `Ctrl+V` (Colar imagens da área de transferência ou arquivos locais) criando camada independente, e exportação multi-formato (`PNG`, `JPEG`, `WebP`, `SVG`, `.pcraft`).
- **Motor de Seleção Pós-Editável & Divisão por Laço (`SelectionEngine`)**:
  - Suporta modos `quad`, `triangle`, `ellipse`, `lasso` e `smart` (Flood-fill/Magic Wand por tolerância de cor).
  - Após soltar o clique, renderiza 8 alças de redimensionamento e 1 alça de rotação sobre a própria seleção para que o usuário modifique o tamanho antes de recortar ou pintar.
  - Ação **Dividir Layer em Duas via Laço**: recorta os pixels contidos no polígono da seleção para uma nova camada superior (`<Nome> - Recorte`) e limpa a região equivalente na camada de base.
- **Motor de Texto & Distorção por Linhas Guias (`TextWarpEngine`)**:
  - Atualiza automaticamente o título da layer no painel *Layers* conforme o usuário digita.
  - Oferece controles de fonte (incluindo importação de `.ttf`/`.otf`), ângulo (`0°`, `90°`, `180°` ou livre), alinhamento (esquerda, centro, direita), redimensionamento pelas alças laterais e **modo de distorção por linhas guias** (onde arrastar as interseções das linhas guias deforma a perspectiva/inclinação do texto no canvas).
