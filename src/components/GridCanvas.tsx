import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useGridData,
  useGridMode,
  useGridPan,
  useGridStore,
  useGridZoom,
  usePaintLayer
} from '../state/gridStore';

const BASE_CELL_SIZE = 24;

const GridCanvas = () => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const { grid, rows, cols } = useGridData();
  const zoom = useGridZoom();
  const mode = useGridMode();
  const applyCellAction = useGridStore((state) => state.applyCellAction);
  const { panX, panY, setPan } = useGridPan();
  const { paintStrokes, startPaintStroke, updatePaintStroke, endPaintStroke } = usePaintLayer();
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isPainting, setIsPainting] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const panOriginRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null
  );

  const drawLayers = useCallback(() => {
    const gridCanvas = gridCanvasRef.current;
    const paintCanvas = paintCanvasRef.current;
    if (!gridCanvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cellSize = BASE_CELL_SIZE * zoom;
    const displayWidth = cols * cellSize;
    const displayHeight = rows * cellSize;

    const prepareCanvas = (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return null;
      const context = canvas.getContext('2d');
      if (!context) return null;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, displayWidth, displayHeight);
      return context;
    };

    const gridContext = prepareCanvas(gridCanvas);
    if (gridContext) {
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const cellColor = grid[r][c];
          if (cellColor) {
            gridContext.fillStyle = cellColor;
            gridContext.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          }
        }
      }

      gridContext.lineWidth = Math.max(1, zoom);
      gridContext.strokeStyle = 'rgba(148, 163, 184, 0.4)';

      for (let r = 0; r <= rows; r += 1) {
        const y = r * cellSize;
        gridContext.beginPath();
        gridContext.moveTo(0, y);
        gridContext.lineTo(displayWidth, y);
        gridContext.stroke();
      }

      for (let c = 0; c <= cols; c += 1) {
        const x = c * cellSize;
        gridContext.beginPath();
        gridContext.moveTo(x, 0);
        gridContext.lineTo(x, displayHeight);
        gridContext.stroke();
      }
    }

    const paintContext = prepareCanvas(paintCanvas);
    if (paintContext) {
      paintContext.lineCap = 'round';
      paintContext.lineJoin = 'round';
      for (const stroke of paintStrokes) {
        if (!stroke || stroke.points.length === 0) continue;
        const points = stroke.points;
        const strokeWidth = stroke.width * zoom;
        if (points.length === 1) {
          const [point] = points;
          const x = point.x * cellSize;
          const y = point.y * cellSize;
          paintContext.fillStyle = stroke.color;
          paintContext.beginPath();
          paintContext.arc(x, y, strokeWidth / 2, 0, Math.PI * 2);
          paintContext.fill();
          continue;
        }
        paintContext.strokeStyle = stroke.color;
        paintContext.lineWidth = strokeWidth;
        paintContext.beginPath();
        const first = points[0];
        paintContext.moveTo(first.x * cellSize, first.y * cellSize);
        for (let i = 1; i < points.length; i += 1) {
          const point = points[i];
          paintContext.lineTo(point.x * cellSize, point.y * cellSize);
        }
        paintContext.stroke();
      }
    }
  }, [cols, grid, paintStrokes, rows, zoom]);

  useEffect(() => {
    drawLayers();
  }, [drawLayers]);

  useEffect(() => {
    const updateViewport = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };

    updateViewport();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateViewport);
      if (wrapperRef.current) {
        resizeObserver.observe(wrapperRef.current);
      }
    }

    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  const clampPan = useCallback(
    (x: number, y: number) => {
      const contentWidth = cols * BASE_CELL_SIZE * zoom;
      const contentHeight = rows * BASE_CELL_SIZE * zoom;
      const viewWidth = viewportSize.width || contentWidth;
      const viewHeight = viewportSize.height || contentHeight;
      const boundedViewWidth = Math.min(viewWidth, contentWidth);
      const boundedViewHeight = Math.min(viewHeight, contentHeight);
      const minVisible = 48; // keep at least a small strip visible so the canvas never leaves view
      const minX = minVisible - contentWidth;
      const maxX = boundedViewWidth - minVisible;
      const minY = minVisible - contentHeight;
      const maxY = boundedViewHeight - minVisible;
      return {
        x: Math.min(Math.max(x, minX), maxX),
        y: Math.min(Math.max(y, minY), maxY)
      };
    },
    [cols, rows, viewportSize.height, viewportSize.width, zoom]
  );

  useEffect(() => {
    const clamped = clampPan(panX, panY);
    if (clamped.x !== panX || clamped.y !== panY) {
      setPan(clamped.x, clamped.y);
    }
  }, [clampPan, panX, panY, setPan]);

  const getCellFromEvent = useCallback(
    (event: PointerEvent | React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = gridCanvasRef.current;
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

  const getPaintPointFromEvent = useCallback(
    (event: PointerEvent | React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = paintCanvasRef.current ?? gridCanvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const dpr = window.devicePixelRatio || 1;
      const x = ((event.clientX - rect.left) * scaleX) / dpr;
      const y = ((event.clientY - rect.top) * scaleY) / dpr;
      const cellSize = BASE_CELL_SIZE * zoom;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x: x / cellSize, y: y / cellSize };
    },
    [zoom]
  );

  const handlePointerAction = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (mode === 'paint') return;
      const cell = getCellFromEvent(event.nativeEvent);
      if (!cell) return;
      applyCellAction(cell.row, cell.col);
    },
    [applyCellAction, getCellFromEvent, mode]
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (mode === 'paint') {
      return;
    }
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
    if (mode === 'paint') {
      return;
    }
    if (isPanning) {
      event.preventDefault();
      const origin = panOriginRef.current;
      if (!origin) return;
      const deltaX = event.clientX - origin.x;
      const deltaY = event.clientY - origin.y;
      const clamped = clampPan(origin.panX + deltaX, origin.panY + deltaY);
      setPan(clamped.x, clamped.y);
      return;
    }

    if (!isDrawing) return;
    event.preventDefault();
    handlePointerAction(event);
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning || isDrawing || isPainting) {
      event.preventDefault();
    }

    if (isPanning) {
      setIsPanning(false);
      panOriginRef.current = null;
      const clamped = clampPan(panX, panY);
      setPan(clamped.x, clamped.y, true);
    }

    if (isDrawing) {
      setIsDrawing(false);
    }

    if (isPainting) {
      setIsPainting(false);
      endPaintStroke();
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePaintPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || mode !== 'paint') return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPaintPointFromEvent(event.nativeEvent);
    if (!point) return;
    setIsPainting(true);
    startPaintStroke(point);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePaintPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPainting || mode !== 'paint') return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPaintPointFromEvent(event.nativeEvent);
    if (!point) return;
    updatePaintStroke(point);
  };

  const stopPainting = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPainting) return;
    event.preventDefault();
    event.stopPropagation();
    setIsPainting(false);
    endPaintStroke();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    if (mode !== 'paint' && isPainting) {
      setIsPainting(false);
      endPaintStroke();
    }
  }, [endPaintStroke, isPainting, mode]);

  const cursor = mode === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair';

  const paintCanvasPointerEvents: 'auto' | 'none' = mode === 'paint' ? 'auto' : 'none';
  const paintCursor = mode === 'paint' ? 'crosshair' : cursor;
  const gridPointerEvents: 'auto' | 'none' = mode === 'paint' ? 'none' : 'auto';

  return (
    <div ref={wrapperRef} className="grid-canvas-wrapper">
      <canvas
        ref={gridCanvasRef}
        className="grid-canvas"
        style={{
          transform: `translate(${panX}px, ${panY}px)`,
          cursor,
          pointerEvents: gridPointerEvents
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        onPointerCancel={stopDrawing}
        data-mode={mode}
        data-active={isPanning ? 'panning' : isDrawing ? 'drawing' : 'idle'}
      />
      <canvas
        ref={paintCanvasRef}
        className="paint-canvas"
        style={{
          transform: `translate(${panX}px, ${panY}px)`,
          pointerEvents: paintCanvasPointerEvents,
          cursor: paintCursor
        }}
        onPointerDown={handlePaintPointerDown}
        onPointerMove={handlePaintPointerMove}
        onPointerUp={stopPainting}
        onPointerLeave={stopPainting}
        onPointerCancel={stopPainting}
      />
    </div>
  );
};

export default GridCanvas;
