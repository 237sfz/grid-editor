import { create } from 'zustand';

export type GridMode = 'draw' | 'erase' | 'fill' | 'fillForward' | 'paint' | 'pan';

export type CellValue = string | null;

export type PaintPoint = {
  x: number;
  y: number;
};

export type PaintStroke = {
  color: string;
  width: number;
  points: PaintPoint[];
};

export interface PersistedGridState {
  rows: number;
  cols: number;
  grid: CellValue[][];
  zoom: number;
  selectedColor: string;
  panX: number;
  panY: number;
  paintStrokes: PaintStroke[];
}

interface StateSnapshot {
  grid: CellValue[][];
  paintStrokes: PaintStroke[];
}

interface GridStore extends PersistedGridState {
  mode: GridMode;
  history: StateSnapshot[];
  future: StateSnapshot[];
  activeStrokeIndex: number | null;
  setMode: (mode: GridMode) => void;
  setZoom: (zoom: number) => void;
  bumpZoom: (delta: number) => void;
  applyCellAction: (row: number, col: number) => void;
  startPaintStroke: (point: PaintPoint) => void;
  updatePaintStroke: (point: PaintPoint) => void;
  endPaintStroke: () => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  setSelectedColor: (color: string) => void;
  setGridSize: (rows: number, cols: number) => void;
  setPan: (x: number, y: number, persist?: boolean) => void;
  serialize: () => string;
  deserialize: (payload: string) => void;
  loadFromStorage: () => void;
}

const DEFAULT_ROWS = 32;
const DEFAULT_COLS = 32;
const MAX_HISTORY = 100;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const MIN_GRID_SIZE = 8;
const MAX_GRID_SIZE = 128;
const STORAGE_KEY = 'grid-editor-state';
const DEFAULT_COLOR = '#0ea5e9';
const DEFAULT_STROKE_WIDTH = 2;

const createEmptyGrid = (rows: number, cols: number): CellValue[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));

const cloneGrid = (grid: CellValue[][]) => grid.map((row) => [...row]);

const clonePaintStrokes = (strokes: PaintStroke[]) =>
  strokes.map((stroke) => ({
    color: stroke.color,
    width: stroke.width,
    points: stroke.points.map((point) => ({ ...point }))
  }));

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const clampGridSize = (value: number) =>
  clamp(Math.round(value), MIN_GRID_SIZE, MAX_GRID_SIZE);

const normalizeCellValue = (value: unknown): CellValue => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return value > 0 ? DEFAULT_COLOR : null;
  }
  return null;
};

const normalizeGrid = (rawGrid: unknown, rows: number, cols: number): CellValue[][] => {
  const normalized = createEmptyGrid(rows, cols);
  if (!Array.isArray(rawGrid)) {
    return normalized;
  }
  for (let r = 0; r < rows; r += 1) {
    const sourceRow = Array.isArray(rawGrid[r]) ? rawGrid[r] : [];
    for (let c = 0; c < cols; c += 1) {
      normalized[r][c] = normalizeCellValue(sourceRow[c]);
    }
  }
  return normalized;
};

const normalizePaintPoint = (point: unknown): PaintPoint | null => {
  if (!point || typeof point !== 'object') return null;
  const maybePoint = point as Record<string, unknown>;
  const x = maybePoint.x;
  const y = maybePoint.y;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
};

const normalizePaintStrokes = (raw: unknown): PaintStroke[] => {
  if (!Array.isArray(raw)) return [];
  const normalized: PaintStroke[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const stroke = entry as Record<string, unknown>;
    const pointsRaw = stroke.points;
    if (!Array.isArray(pointsRaw)) continue;
    const points: PaintPoint[] = [];
    for (const point of pointsRaw) {
      const normalizedPoint = normalizePaintPoint(point);
      if (normalizedPoint) {
        points.push(normalizedPoint);
      }
    }
    if (points.length === 0) continue;
    const width = stroke.width;
    const color = stroke.color;
    normalized.push({
      color: typeof color === 'string' ? color : DEFAULT_COLOR,
      width: typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : DEFAULT_STROKE_WIDTH,
      points
    });
  }
  return normalized;
};

const persistSnapshot = (state: PersistedGridState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist grid state', error);
  }
};

const readSnapshot = (): PersistedGridState | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.rows === 'number' &&
      typeof parsed.cols === 'number' &&
      Array.isArray(parsed.grid)
    ) {
      const normalizedGrid = normalizeGrid(parsed.grid, parsed.rows, parsed.cols);
      return {
        rows: parsed.rows,
        cols: parsed.cols,
        grid: normalizedGrid,
        zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1,
        selectedColor:
          typeof parsed.selectedColor === 'string' ? parsed.selectedColor : DEFAULT_COLOR,
        panX: typeof parsed.panX === 'number' ? parsed.panX : 0,
        panY: typeof parsed.panY === 'number' ? parsed.panY : 0,
        paintStrokes: normalizePaintStrokes(parsed.paintStrokes)
      };
    }
  } catch (error) {
    console.warn('Failed to parse stored grid state', error);
  }
  return null;
};

const pushHistory = (state: GridStore): StateSnapshot[] => {
  const snapshot: StateSnapshot = {
    grid: cloneGrid(state.grid),
    paintStrokes: clonePaintStrokes(state.paintStrokes)
  };
  const history = [...state.history, snapshot];
  if (history.length > MAX_HISTORY) history.shift();
  return history;
};

type Direction = [number, number];

const floodFillWithDirections = (
  grid: CellValue[][],
  row: number,
  col: number,
  newValue: CellValue,
  directions: Direction[]
) => {
  const targetValue = grid[row]?.[col];
  if (targetValue === undefined || targetValue === newValue) {
    return grid;
  }
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const stack: Array<[number, number]> = [[row, col]];
  const filled = cloneGrid(grid);
  while (stack.length) {
    const [r, c] = stack.pop()!;
    if (filled[r]?.[c] !== targetValue) continue;
    filled[r][c] = newValue;
    for (const [dr, dc] of directions) {
      const nextRow = r + dr;
      const nextCol = c + dc;
      if (nextRow < 0 || nextCol < 0 || nextRow >= rows || nextCol >= cols) {
        continue;
      }
      if (filled[nextRow]?.[nextCol] !== targetValue) {
        continue;
      }
      stack.push([nextRow, nextCol]);
    }
  }
  return filled;
};

const floodFill = (grid: CellValue[][], row: number, col: number, newValue: CellValue) =>
  floodFillWithDirections(grid, row, col, newValue, [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ]);

const forwardFill = (grid: CellValue[][], row: number, col: number, newValue: CellValue) =>
  floodFillWithDirections(grid, row, col, newValue, [
    [1, 0],
    [0, 1]
  ]);

const buildPersistedState = (
  state: GridStore,
  overrides: Partial<PersistedGridState> = {}
): PersistedGridState => ({
  rows: overrides.rows ?? state.rows,
  cols: overrides.cols ?? state.cols,
  grid: overrides.grid ?? state.grid,
  zoom: overrides.zoom ?? state.zoom,
  selectedColor: overrides.selectedColor ?? state.selectedColor,
  panX: overrides.panX ?? state.panX,
  panY: overrides.panY ?? state.panY,
  paintStrokes: overrides.paintStrokes ?? state.paintStrokes
});

export const useGridStore = create<GridStore>((set, get) => ({
  rows: DEFAULT_ROWS,
  cols: DEFAULT_COLS,
  grid: createEmptyGrid(DEFAULT_ROWS, DEFAULT_COLS),
  zoom: 1,
  selectedColor: DEFAULT_COLOR,
  panX: 0,
  panY: 0,
  mode: 'draw',
  paintStrokes: [],
  history: [],
  future: [],
  activeStrokeIndex: null,
  setMode: (mode) => set({ mode }),
  setZoom: (zoom) =>
    set((state) => {
      const clamped = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
      persistSnapshot(buildPersistedState(state, { zoom: clamped }));
      return { zoom: clamped };
    }),
  bumpZoom: (delta) => {
    const { zoom, setZoom } = get();
    setZoom(zoom + delta);
  },
  applyCellAction: (row, col) =>
    set((state) => {
      if (row < 0 || col < 0 || row >= state.rows || col >= state.cols) {
        return {};
      }

      let nextGrid: CellValue[][] | null = null;
      switch (state.mode) {
        case 'draw':
          if (state.grid[row][col] !== state.selectedColor) {
            nextGrid = cloneGrid(state.grid);
            nextGrid[row][col] = state.selectedColor;
          }
          break;
        case 'erase':
          if (state.grid[row][col] !== null) {
            nextGrid = cloneGrid(state.grid);
            nextGrid[row][col] = null;
          }
          break;
        case 'fill':
          if (state.grid[row][col] !== state.selectedColor) {
            nextGrid = floodFill(state.grid, row, col, state.selectedColor);
          }
          break;
        case 'fillForward':
          if (state.grid[row][col] !== state.selectedColor) {
            nextGrid = forwardFill(state.grid, row, col, state.selectedColor);
          }
          break;
        case 'pan':
        default:
          break;
      }

      if (!nextGrid) {
        return {};
      }

      const history = pushHistory(state);

      persistSnapshot(buildPersistedState(state, { grid: nextGrid }));

      return {
        grid: nextGrid,
        history,
        future: [],
        activeStrokeIndex: null
      };
    }),
  startPaintStroke: (point) =>
    set((state) => {
      if (state.activeStrokeIndex !== null) {
        return {};
      }
      const history = pushHistory(state);
      const newStroke: PaintStroke = {
        color: state.selectedColor,
        width: DEFAULT_STROKE_WIDTH,
        points: [point]
      };
      const paintStrokes = [...state.paintStrokes, newStroke];
      return {
        paintStrokes,
        history,
        future: [],
        activeStrokeIndex: paintStrokes.length - 1
      };
    }),
  updatePaintStroke: (point) =>
    set((state) => {
      if (state.activeStrokeIndex === null) {
        return {};
      }
      const index = state.activeStrokeIndex;
      const target = state.paintStrokes[index];
      if (!target) {
        return { activeStrokeIndex: null };
      }
      const lastPoint = target.points[target.points.length - 1];
      if (lastPoint && lastPoint.x === point.x && lastPoint.y === point.y) {
        return {};
      }
      const updatedStroke: PaintStroke = {
        ...target,
        points: [...target.points, point]
      };
      const paintStrokes = state.paintStrokes.map((stroke, idx) =>
        idx === index ? updatedStroke : stroke
      );
      return { paintStrokes };
    }),
  endPaintStroke: () =>
    set((state) => {
      if (state.activeStrokeIndex === null) {
        return {};
      }
      persistSnapshot(buildPersistedState(state, { paintStrokes: state.paintStrokes }));
      return { activeStrokeIndex: null };
    }),
  undo: () =>
    set((state) => {
      if (state.history.length === 0) return {};
      const history = [...state.history];
      const previous = history.pop()!;
      const previousGrid = cloneGrid(previous.grid);
      const previousStrokes = clonePaintStrokes(previous.paintStrokes);
      const futureSnapshot: StateSnapshot = {
        grid: cloneGrid(state.grid),
        paintStrokes: clonePaintStrokes(state.paintStrokes)
      };
      const future = [futureSnapshot, ...state.future];
      persistSnapshot(
        buildPersistedState(state, { grid: previousGrid, paintStrokes: previousStrokes })
      );
      return {
        grid: previousGrid,
        paintStrokes: previousStrokes,
        history,
        future,
        activeStrokeIndex: null
      };
    }),
  redo: () =>
    set((state) => {
      if (state.future.length === 0) return {};
      const [next, ...rest] = state.future;
      const nextGrid = cloneGrid(next.grid);
      const nextStrokes = clonePaintStrokes(next.paintStrokes);
      const historySnapshot: StateSnapshot = {
        grid: cloneGrid(state.grid),
        paintStrokes: clonePaintStrokes(state.paintStrokes)
      };
      const history = [...state.history, historySnapshot];
      persistSnapshot(buildPersistedState(state, { grid: nextGrid, paintStrokes: nextStrokes }));
      return {
        grid: nextGrid,
        paintStrokes: nextStrokes,
        history,
        future: rest,
        activeStrokeIndex: null
      };
    }),
  clear: () =>
    set((state) => {
      const cleared = createEmptyGrid(state.rows, state.cols);
      persistSnapshot(buildPersistedState(state, { grid: cleared, paintStrokes: [] }));
      return {
        grid: cleared,
        paintStrokes: [],
        history: [],
        future: [],
        activeStrokeIndex: null
      };
    }),
  setSelectedColor: (color) =>
    set((state) => {
      if (!color) return {};
      persistSnapshot(buildPersistedState(state, { selectedColor: color }));
      return { selectedColor: color };
    }),
  setGridSize: (rows, cols) =>
    set((state) => {
      const nextRows = clampGridSize(rows);
      const nextCols = clampGridSize(cols);
      if (nextRows === state.rows && nextCols === state.cols) {
        return {};
      }
      const resized = createEmptyGrid(nextRows, nextCols);
      for (let r = 0; r < Math.min(nextRows, state.rows); r += 1) {
        for (let c = 0; c < Math.min(nextCols, state.cols); c += 1) {
          resized[r][c] = state.grid[r][c];
        }
      }
      persistSnapshot(
        buildPersistedState(state, {
          rows: nextRows,
          cols: nextCols,
          grid: resized,
          panX: 0,
          panY: 0,
          paintStrokes: []
        })
      );
      return {
        rows: nextRows,
        cols: nextCols,
        grid: resized,
        paintStrokes: [],
        history: [],
        future: [],
        panX: 0,
        panY: 0,
        activeStrokeIndex: null
      };
    }),
  setPan: (x, y, persist = false) =>
    set((state) => {
      if (state.panX === x && state.panY === y) {
        if (persist) {
          persistSnapshot(buildPersistedState(state, { panX: x, panY: y }));
        }
        return {};
      }
      if (persist) {
        persistSnapshot(buildPersistedState(state, { panX: x, panY: y }));
      }
      return { panX: x, panY: y };
    }),
  serialize: () => {
    const state = get();
    return JSON.stringify({
      rows: state.rows,
      cols: state.cols,
      grid: state.grid,
      zoom: state.zoom,
      selectedColor: state.selectedColor,
      panX: state.panX,
      panY: state.panY,
      paintStrokes: state.paintStrokes
    });
  },
  deserialize: (payload: string) => {
    try {
      const parsed = JSON.parse(payload);
      if (
        typeof parsed.rows === 'number' &&
        typeof parsed.cols === 'number' &&
        Array.isArray(parsed.grid)
      ) {
        const nextRows = clampGridSize(parsed.rows);
        const nextCols = clampGridSize(parsed.cols);
        const nextGrid = normalizeGrid(parsed.grid, nextRows, nextCols);
        const nextColor =
          typeof parsed.selectedColor === 'string' ? parsed.selectedColor : DEFAULT_COLOR;
        const nextPanX = typeof parsed.panX === 'number' ? parsed.panX : 0;
        const nextPanY = typeof parsed.panY === 'number' ? parsed.panY : 0;
        const nextZoom =
          typeof parsed.zoom === 'number' ? clamp(parsed.zoom, MIN_ZOOM, MAX_ZOOM) : 1;
        const nextPaintStrokes = normalizePaintStrokes(parsed.paintStrokes);
        set({
          rows: nextRows,
          cols: nextCols,
          grid: nextGrid,
          zoom: nextZoom,
          selectedColor: nextColor,
          panX: nextPanX,
          panY: nextPanY,
          paintStrokes: nextPaintStrokes,
          history: [],
          future: [],
          activeStrokeIndex: null
        });
        persistSnapshot({
          rows: nextRows,
          cols: nextCols,
          grid: nextGrid,
          zoom: nextZoom,
          selectedColor: nextColor,
          panX: nextPanX,
          panY: nextPanY,
          paintStrokes: nextPaintStrokes
        });
      }
    } catch (error) {
      console.warn('Unable to deserialize grid payload', error);
    }
  },
  loadFromStorage: () => {
    const stored = readSnapshot();
    if (!stored) return;
    const nextRows = clampGridSize(stored.rows);
    const nextCols = clampGridSize(stored.cols);
    const normalizedGrid = normalizeGrid(stored.grid, nextRows, nextCols);
    set({
      rows: nextRows,
      cols: nextCols,
      grid: normalizedGrid,
      zoom: clamp(stored.zoom ?? 1, MIN_ZOOM, MAX_ZOOM),
      selectedColor: stored.selectedColor,
      panX: stored.panX,
      panY: stored.panY,
      paintStrokes: normalizePaintStrokes(stored.paintStrokes),
      history: [],
      future: [],
      activeStrokeIndex: null
    });
  }
}));

export const useGridMode = () => useGridStore((state) => state.mode);
export const useGridZoom = () => useGridStore((state) => state.zoom);
export const useGridData = () =>
  useGridStore((state) => ({
    grid: state.grid,
    rows: state.rows,
    cols: state.cols
  }));
export const useSelectedColor = () =>
  useGridStore((state) => ({
    selectedColor: state.selectedColor,
    setSelectedColor: state.setSelectedColor
  }));
export const useGridSize = () =>
  useGridStore((state) => ({
    rows: state.rows,
    cols: state.cols,
    setGridSize: state.setGridSize
  }));
export const useGridPan = () =>
  useGridStore((state) => ({
    panX: state.panX,
    panY: state.panY,
    setPan: state.setPan
  }));

export const usePaintLayer = () =>
  useGridStore((state) => ({
    paintStrokes: state.paintStrokes,
    startPaintStroke: state.startPaintStroke,
    updatePaintStroke: state.updatePaintStroke,
    endPaintStroke: state.endPaintStroke,
    activeStrokeIndex: state.activeStrokeIndex
  }));

export const GRID_SIZE_LIMITS = {
  min: MIN_GRID_SIZE,
  max: MAX_GRID_SIZE
};
