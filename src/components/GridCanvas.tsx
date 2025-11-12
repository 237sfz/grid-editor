import { useCallback, useEffect, useRef, useState } from 'react';
import { useGridData, useGridStore, useGridZoom } from '../state/gridStore';

const BASE_CELL_SIZE = 24;

const GridCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { grid, rows, cols } = useGridData();
  const zoom = useGridZoom();
  const applyCellAction = useGridStore((state) => state.applyCellAction);
  const [isDrawing, setIsDrawing] = useState(false);

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

    context.fillStyle = '#0ea5e9';
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (grid[r][c] === 1) {
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
    setIsDrawing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    handlePointerAction(event);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    event.preventDefault();
    handlePointerAction(event);
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    event.preventDefault();
    setIsDrawing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="grid-canvas-wrapper">
      <canvas
        ref={canvasRef}
        className="grid-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
    </div>
  );
};

export default GridCanvas;
