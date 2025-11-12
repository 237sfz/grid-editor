# Grid Editor

A browser-based grid editor built with React and Vite. The editor supports drawing, erasing, and filling cells with color choices, undo/redo history, zoom controls, grid resizing, drag-to-pan navigation, and JSON import/export so you can continue where you left off.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- [npm](https://www.npmjs.com/) (bundled with Node.js)

## Getting started

Install dependencies and launch the local development server:

```bash
npm install
npm run dev
```

The development server runs on [http://localhost:5173](http://localhost:5173). Changes to files in `src/` trigger automatic reloads.

## Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Starts the Vite development server with hot module replacement. |
| `npm run build` | Type-checks the project and produces a production build in `dist/`. |
| `npm run preview` | Serves the production build locally for smoke-testing. |

## Building for deployment

To generate an optimized bundle, run:

```bash
npm run build
```

The compiled assets are output to the `dist/` directory and can be deployed to any static hosting platform that serves HTML, CSS, and JavaScript.

## Features & shortcuts

- Draw/Erase/Fill tools with keyboard shortcuts (`B`, `E`, `F`).
- Directional Fill tool that only spreads to the right or downward (`G`).
- Hold the space bar to temporarily switch to Pan mode and drag the canvas instead of relying on scrollbars.
- Undo/Redo (`Ctrl/Cmd+Z`, `Shift+Ctrl/Cmd+Z`).
- Zoom with toolbar buttons or keyboard (`+`, `-`, `0`).
- Choose colors from quick presets or a color picker and resize the grid dimensions at any time.
- Import/Export grid data as JSON for sharing or backup.
- Automatic persistence in `localStorage` between sessions.

## Project structure

```
├── index.html
├── package.json
├── src
│   ├── App.tsx
│   ├── components
│   │   ├── GridCanvas.tsx
│   │   └── Toolbar.tsx
│   ├── main.tsx
│   ├── state
│   │   └── gridStore.ts
│   └── styles
│       └── grid.css
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## Import/Export format

The editor serializes grid data as JSON with the following shape:

```json
{
  "rows": 32,
  "cols": 32,
  "grid": [[null, "#0ea5e9", null, ...], ...],
  "zoom": 1,
  "selectedColor": "#0ea5e9",
  "panX": 0,
  "panY": 0
}
```

You can import compatible JSON files to continue editing an existing layout. Missing optional fields fall back to sensible defaults.
