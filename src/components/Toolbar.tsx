import { ChangeEvent, useEffect, useRef } from 'react';
import clsx from 'clsx';
import {
  GRID_SIZE_LIMITS,
  GridMode,
  useGridMode,
  useGridSize,
  useGridStore,
  useGridZoom,
  useSelectedColor
} from '../state/gridStore';

const modeDefinitions: Array<{ id: GridMode; label: string; shortcut: string }> = [
  { id: 'draw', label: 'Draw', shortcut: 'B' },
  { id: 'paint', label: 'Paint', shortcut: 'P' },
  { id: 'erase', label: 'Erase', shortcut: 'E' },
  { id: 'fill', label: 'Fill', shortcut: 'F' },
  { id: 'fillForward', label: 'Fill ↘', shortcut: 'G' },
  { id: 'pan', label: 'Pan', shortcut: 'Space' }
];

const QUICK_PALETTE = ['#0ea5e9', '#a855f7', '#f97316', '#f43f5e', '#22c55e', '#facc15'];

const Toolbar = () => {
  const mode = useGridMode();
  const zoom = useGridZoom();
  const { selectedColor, setSelectedColor } = useSelectedColor();
  const { rows, cols, setGridSize } = useGridSize();
  const {
    setMode,
    undo,
    redo,
    clear,
    serialize,
    deserialize,
    bumpZoom
  } = useGridStore((state) => ({
    setMode: state.setMode,
    undo: state.undo,
    redo: state.redo,
    clear: state.clear,
    serialize: state.serialize,
    deserialize: state.deserialize,
    bumpZoom: state.bumpZoom
  }));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const temporaryModeRef = useRef<GridMode | null>(null);

  const quickPalette = QUICK_PALETTE;

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      if (typeof content === 'string') {
        deserialize(content);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleExport = () => {
    const data = serialize();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'grid.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleSelectedColorChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.value) return;
    setSelectedColor(event.target.value);
  };

  const handleGridSizeInput = (dimension: 'rows' | 'cols') =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number.parseInt(event.target.value, 10);
      if (Number.isNaN(nextValue)) return;
      if (dimension === 'rows') {
        setGridSize(nextValue, cols);
      } else {
        setGridSize(rows, nextValue);
      }
    };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.metaKey || event.ctrlKey) {
        if (key === 'z') {
          if (event.shiftKey) {
            redo();
          } else {
            undo();
          }
          event.preventDefault();
          return;
        }
        if (key === 'y') {
          redo();
          event.preventDefault();
          return;
        }
      }

      switch (event.key) {
        case 'b':
        case 'B':
          setMode('draw');
          event.preventDefault();
          break;
        case 'p':
        case 'P':
          setMode('paint');
          event.preventDefault();
          break;
        case 'e':
        case 'E':
          setMode('erase');
          event.preventDefault();
          break;
        case 'f':
        case 'F':
          setMode('fill');
          event.preventDefault();
          break;
        case 'g':
        case 'G':
          setMode('fillForward');
          event.preventDefault();
          break;
        case ' ':
          if (!temporaryModeRef.current) {
            temporaryModeRef.current = mode;
            setMode('pan');
          }
          event.preventDefault();
          break;
        case '+':
        case '=':
          bumpZoom(0.1);
          event.preventDefault();
          break;
        case '-':
        case '_':
          bumpZoom(-0.1);
          event.preventDefault();
          break;
        case '0':
          event.preventDefault();
          bumpZoom(1 - zoom);
          break;
        case 'Delete':
        case 'Backspace':
          clear();
          event.preventDefault();
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' && temporaryModeRef.current) {
        setMode(temporaryModeRef.current);
        temporaryModeRef.current = null;
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [bumpZoom, clear, mode, redo, setMode, undo, zoom]);

  return (
    <header className="toolbar" aria-label="grid editor toolbar">
      <div className="toolbar-section">
        {modeDefinitions.map((modeOption) => (
          <button
            key={modeOption.id}
            type="button"
            className={clsx('toolbar-button', `mode-${modeOption.id}`, {
              active: mode === modeOption.id
            })}
            aria-pressed={mode === modeOption.id}
            onClick={() => setMode(modeOption.id)}
          >
            {modeOption.label}
            <span className="shortcut">{modeOption.shortcut}</span>
          </button>
        ))}
      </div>
      <div className="toolbar-section color-picker">
        <div className="color-picker-group" role="group" aria-label="Color presets">
          {quickPalette.map((color) => (
            <button
              key={color}
              type="button"
              className={clsx('color-swatch', { selected: selectedColor === color })}
              style={{ backgroundColor: color }}
              onClick={() => setSelectedColor(color)}
              aria-label={`Select ${color}`}
            />
          ))}
        </div>
        <label className="color-input">
          <span>Color</span>
          <input type="color" value={selectedColor} onChange={handleSelectedColorChange} />
        </label>
      </div>
      <div className="toolbar-section size-controls" role="group" aria-label="Grid size">
        <label className="size-input">
          <span>Rows</span>
          <input
            type="number"
            min={GRID_SIZE_LIMITS.min}
            max={GRID_SIZE_LIMITS.max}
            value={rows}
            onChange={handleGridSizeInput('rows')}
          />
        </label>
        <label className="size-input">
          <span>Cols</span>
          <input
            type="number"
            min={GRID_SIZE_LIMITS.min}
            max={GRID_SIZE_LIMITS.max}
            value={cols}
            onChange={handleGridSizeInput('cols')}
          />
        </label>
      </div>
      <div className="toolbar-section">
        <button type="button" className="toolbar-button" onClick={undo}>
          Undo
          <span className="shortcut">Ctrl/Cmd+Z</span>
        </button>
        <button type="button" className="toolbar-button" onClick={redo}>
          Redo
          <span className="shortcut">Shift+Ctrl/Cmd+Z</span>
        </button>
        <button type="button" className="toolbar-button" onClick={clear}>
          Clear
        </button>
      </div>
      <div className="toolbar-section">
        <button type="button" className="toolbar-button" onClick={() => bumpZoom(-0.1)}>
          Zoom -
        </button>
        <span className="zoom-indicator" aria-live="polite">
          {(zoom * 100).toFixed(0)}%
        </span>
        <button type="button" className="toolbar-button" onClick={() => bumpZoom(0.1)}>
          Zoom +
        </button>
      </div>
      <div className="toolbar-section">
        <button type="button" className="toolbar-button" onClick={openFilePicker}>
          Import
        </button>
        <button type="button" className="toolbar-button" onClick={handleExport}>
          Export
        </button>
        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept="application/json"
          onChange={handleImport}
        />
      </div>
    </header>
  );
};

export default Toolbar;
