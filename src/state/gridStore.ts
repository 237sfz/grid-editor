import { create } from 'zustand';

export type GridMode = 'draw' | 'erase' | 'fill' | 'pan';

export interface PersistedGridState {
  rows: number;
  cols: number;
  grid: number[][];
  zoom: number;
}

interface GridStore extends PersistedGridState {
  mode: GridMode;
  history: number[][][];
  future: number[][][];
  setMode: (mode: GridMode) => void;
  setZoom: (zoom: number) => void;
  bumpZoom: (delta: number) => void;
  applyCellAction: (row: number, col: number) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  serialize: () => string;
  deserialize: (payload: string) => void;
  loadFromStorage: () => void;
}

const DEFAULT_ROWS = 32;
const DEFAULT_COLS = 32;
const MAX_HISTORY = 100;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const STORAGE_KEY = 'grid-editor-state';

const createEmptyGrid = (rows: number, cols: number) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

const cloneGrid = (grid: number[][]) => grid.map((row) => [...row]);

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

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
      return {
        rows: parsed.rows,
        cols: parsed.cols,
        grid: parsed.grid,
        zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1
      };
    }
  } catch (error) {
    console.warn('Failed to parse stored grid state', error);
  }
  return null;
};

const pushHistory = (state: GridStore): number[][][] => {
  const snapshot = cloneGrid(state.grid);
  const history = [...state.history, snapshot];
  if (history.length > MAX_HISTORY) history.shift();
  return history;
};

const floodFill = (grid: number[][], row: number, col: number, newValue: number) => {
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
    if (r > 0) stack.push([r - 1, c]);
    if (r + 1 < rows) stack.push([r + 1, c]);
    if (c > 0) stack.push([r, c - 1]);
    if (c + 1 < cols) stack.push([r, c + 1]);
  }
  return filled;
};

export const useGridStore = create<GridStore>((set, get) => ({
  rows: DEFAULT_ROWS,
  cols: DEFAULT_COLS,
  grid: createEmptyGrid(DEFAULT_ROWS, DEFAULT_COLS),
  zoom: 1,
  mode: 'draw',
  history: [],
  future: [],
  setMode: (mode) => set({ mode }),
  setZoom: (zoom) =>
    set((state) => {
      const clamped = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
      persistSnapshot({
        rows: state.rows,
        cols: state.cols,
        grid: state.grid,
        zoom: clamped
      });
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

      let nextGrid: number[][] | null = null;
      switch (state.mode) {
        case 'draw':
          if (state.grid[row][col] !== 1) {
            nextGrid = cloneGrid(state.grid);
            nextGrid[row][col] = 1;
          }
          break;
        case 'erase':
          if (state.grid[row][col] !== 0) {
            nextGrid = cloneGrid(state.grid);
            nextGrid[row][col] = 0;
          }
          break;
        case 'fill':
          nextGrid = floodFill(
            state.grid,
            row,
            col,
            state.grid[row][col] === 1 ? 0 : 1
          );
          break;
        case 'pan':
        default:
          break;
      }

      if (!nextGrid) {
        return {};
      }

      const history = pushHistory(state);

      persistSnapshot({
        rows: state.rows,
        cols: state.cols,
        grid: nextGrid,
        zoom: state.zoom
      });

      return {
        grid: nextGrid,
        history,
        future: []
      };
    }),
  undo: () =>
    set((state) => {
      if (state.history.length === 0) return {};
      const history = [...state.history];
      const previous = history.pop()!;
      const future = [cloneGrid(state.grid), ...state.future];
      persistSnapshot({
        rows: state.rows,
        cols: state.cols,
        grid: previous,
        zoom: state.zoom
      });
      return {
        grid: previous,
        history,
        future
      };
    }),
  redo: () =>
    set((state) => {
      if (state.future.length === 0) return {};
      const [next, ...rest] = state.future;
      const history = [...state.history, cloneGrid(state.grid)];
      persistSnapshot({
        rows: state.rows,
        cols: state.cols,
        grid: next,
        zoom: state.zoom
      });
      return {
        grid: next,
        history,
        future: rest
      };
    }),
  clear: () =>
    set((state) => {
      const cleared = createEmptyGrid(state.rows, state.cols);
      persistSnapshot({
        rows: state.rows,
        cols: state.cols,
        grid: cleared,
        zoom: state.zoom
      });
      return {
        grid: cleared,
        history: [],
        future: []
      };
    }),
  serialize: () => {
    const state = get();
    return JSON.stringify({
      rows: state.rows,
      cols: state.cols,
      grid: state.grid,
      zoom: state.zoom
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
        const nextGrid = parsed.grid as number[][];
        set({
          rows: parsed.rows,
          cols: parsed.cols,
          grid: nextGrid,
          zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1,
          history: [],
          future: []
        });
        persistSnapshot({
          rows: parsed.rows,
          cols: parsed.cols,
          grid: nextGrid,
          zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1
        });
      }
    } catch (error) {
      console.warn('Unable to deserialize grid payload', error);
    }
  },
  loadFromStorage: () => {
    const stored = readSnapshot();
    if (!stored) return;
    set({
      rows: stored.rows,
      cols: stored.cols,
      grid: stored.grid,
      zoom: clamp(stored.zoom ?? 1, MIN_ZOOM, MAX_ZOOM),
      history: [],
      future: []
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
