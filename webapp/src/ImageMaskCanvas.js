import React, { useRef, useEffect, useState } from 'react';

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 512;

function ImageMaskCanvas({ image, onMaskChange, brushSize = 32 }) {
  const imgRef = useRef();
  const canvasRef = useRef();
  const maskRef = useRef();
  const [drawing, setDrawing] = useState(false);
  const [lastPos, setLastPos] = useState(null);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    const img = new window.Image();
    img.src = image;
    img.onload = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    };
  }, [image]);

  useEffect(() => {
    const maskCtx = maskRef.current.getContext('2d');
    maskCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    onMaskChange(maskRef.current.toDataURL('image/png'));
    // eslint-disable-next-line
  }, [image]);

  const getPos = (e) => {
    const rect = maskRef.current.getBoundingClientRect();
    let x, y;
    if (e.touches) {
      x = ((e.touches[0].clientX - rect.left) / rect.width) * CANVAS_WIDTH;
      y = ((e.touches[0].clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    } else {
      x = (e.nativeEvent.offsetX / rect.width) * CANVAS_WIDTH;
      y = (e.nativeEvent.offsetY / rect.height) * CANVAS_HEIGHT;
    }
    return { x, y };
  };

  const startDraw = (e) => {
    setDrawing(true);
    const pos = getPos(e);
    setLastPos(pos);
    draw(pos, pos);
  };
  const endDraw = () => {
    setDrawing(false);
    setLastPos(null);
    onMaskChange(maskRef.current.toDataURL('image/png'));
  };
  const draw = (from, to) => {
    const ctx = maskRef.current.getContext('2d');
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const handleMove = (e) => {
    if (!drawing) return;
    const pos = getPos(e);
    if (lastPos) draw(lastPos, pos);
    setLastPos(pos);
  };

  return (
    <div style={{ position: 'relative', width: CANVAS_WIDTH, height: CANVAS_HEIGHT, margin: '20px auto' }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ position: 'absolute', left: 0, top: 0, zIndex: 1, border: '1px solid #ccc' }}
        tabIndex={-1}
        aria-label="background"
      />
      <canvas
        ref={maskRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ position: 'absolute', left: 0, top: 0, zIndex: 2, pointerEvents: 'auto' }}
        onMouseDown={startDraw}
        onMouseUp={endDraw}
        onMouseOut={endDraw}
        onMouseMove={handleMove}
        onTouchStart={startDraw}
        onTouchEnd={endDraw}
        onTouchCancel={endDraw}
        onTouchMove={handleMove}
        tabIndex={-1}
        aria-label="mask"
      />
      <div style={{ position: 'absolute', left: 10, top: 10, zIndex: 3, color: 'white', background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 4 }}>
        Нарисуйте область для инпейнтинга
      </div>
    </div>
  );
}

export default ImageMaskCanvas; 