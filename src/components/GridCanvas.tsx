import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useGridData,
  useGridMode,
  useGridPan,
  useGridStore,
  useGridZoom
} from '../state/gridStore';

const BASE_CELL_SIZE = 24;

const GridCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { grid, rows, cols } = useGridData();
  const zoom = useGridZoom();
  const mode = useGridMode();
  const applyCellAction = useGridStore((state) => state.applyCellAction);
  const { panX, panY, setPan } = useGridPan();
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panOriginRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null
  );

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = cols * BASE_CELL_SIZE * zoom;
    const displayHeight = rows * BASE_CELL_SIZE * zoom;

    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, displayWidth, displayHeight);

    const cellSize = BASE_CELL_SIZE * zoom;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const cellColor = grid[r][c];
        if (cellColor) {
          context.fillStyle = cellColor;
          context.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }

    context.lineWidth = Math.max(1, zoom);
    context.strokeStyle = 'rgba(148, 163, 184, 0.4)';

    for (let r = 0; r <= rows; r += 1) {
      const y = r * cellSize;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(displayWidth, y);
      context.stroke();
    }

    for (let c = 0; c <= cols; c += 1) {
      const x = c * cellSize;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, displayHeight);
      context.stroke();
    }
  }, [cols, grid, rows, zoom]);

  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  const getCellFromEvent = useCallback(
    (event: PointerEvent | React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      const cellSize = BASE_CELL_SIZE * zoom * (window.devicePixelRatio || 1);
      const col = Math.floor(x / cellSize);
      const row = Math.floor(y / cellSize);
      if (Number.isNaN(row) || Number.isNaN(col)) return null;
      return { row, col };
    },
    [zoom]
  );

  const handlePointerAction = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const cell = getCellFromEvent(event.nativeEvent);
      if (!cell) return;
      applyCellAction(cell.row, cell.col);
    },
    [applyCellAction, getCellFromEvent]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (mode === 'pan') {
      setIsPanning(true);
      panOriginRef.current = {
        x: event.clientX,
        y: event.clientY,
        panX,
        panY
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      setIsDrawing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      handlePointerAction(event);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      event.preventDefault();
      const origin = panOriginRef.current;
      if (!origin) return;
      const deltaX = event.clientX - origin.x;
      const deltaY = event.clientY - origin.y;
      setPan(origin.panX + deltaX, origin.panY + deltaY);
      return;
    }

    if (!isDrawing) return;
    event.preventDefault();
    handlePointerAction(event);
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning || isDrawing) {
      event.preventDefault();
    }

    if (isPanning) {
      setIsPanning(false);
      panOriginRef.current = null;
      setPan(panX, panY, true);
    }

    if (isDrawing) {
      setIsDrawing(false);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cursor = mode === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair';

  return (
    <div className="grid-canvas-wrapper">
      <canvas
        ref={canvasRef}
        className="grid-canvas"
        style={{ transform: `translate(${panX}px, ${panY}px)`, cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        onPointerCancel={stopDrawing}
        data-mode={mode}
        data-active={isPanning ? 'panning' : isDrawing ? 'drawing' : 'idle'}
      />
    </div>
  );
};

export default GridCanvas;
