import React, { useRef, useEffect, useState } from 'react';

function ImageMaskCanvas({ image, onMaskChange, brushSize = 32 }) {
  const canvasRef = useRef();
  const maskRef = useRef();
  const [drawing, setDrawing] = useState(false);
  const [lastPos, setLastPos] = useState(null);
  const [imgSize, setImgSize] = useState({ width: 512, height: 512 });

  // Определяем размер изображения при загрузке нового файла
  useEffect(() => {
    const img = new window.Image();
    img.src = image;
    img.onload = () => {
      setImgSize({ width: img.width, height: img.height });
    };
  }, [image]);

  // Перерисовываем изображение на canvas при изменении image или размера
  useEffect(() => {
    const img = new window.Image();
    img.src = image;
    img.onload = () => {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0, img.width, img.height);
    };
  }, [image, imgSize.width, imgSize.height]);

  // Очищаем маску только при смене изображения или размера
  useEffect(() => {
    const maskCtx = maskRef.current.getContext('2d');
    maskCtx.clearRect(0, 0, imgSize.width, imgSize.height);
    onMaskChange(maskRef.current.toDataURL('image/png'));
    // eslint-disable-next-line
  }, [image, imgSize.width, imgSize.height]);

  const getPos = (e) => {
    const rect = maskRef.current.getBoundingClientRect();
    let x, y;
    if (e.touches) {
      x = ((e.touches[0].clientX - rect.left) / rect.width) * imgSize.width;
      y = ((e.touches[0].clientY - rect.top) / rect.height) * imgSize.height;
    } else {
      x = (e.nativeEvent.offsetX / rect.width) * imgSize.width;
      y = (e.nativeEvent.offsetY / rect.height) * imgSize.height;
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
    ctx.globalAlpha = 1.0; // всегда полностью белый для маски
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

  // Для адаптивного отображения (вписываем canvas в контейнер, но сохраняем реальный размер)
  const maxDisplayWidth = 400;
  const scale = imgSize.width > maxDisplayWidth ? maxDisplayWidth / imgSize.width : 1;

  return (
    <div style={{ position: 'relative', width: imgSize.width * scale, height: imgSize.height * scale, margin: '20px auto' }}>
      <canvas
        ref={canvasRef}
        width={imgSize.width}
        height={imgSize.height}
        style={{ position: 'absolute', left: 0, top: 0, zIndex: 1, border: '1px solid #ccc', width: imgSize.width * scale, height: imgSize.height * scale }}
        tabIndex={-1}
        aria-label="background"
      />
      <canvas
        ref={maskRef}
        width={imgSize.width}
        height={imgSize.height}
        style={{ 
          position: 'absolute', 
          left: 0, 
          top: 0, 
          zIndex: 2, 
          pointerEvents: 'auto', 
          width: imgSize.width * scale, 
          height: imgSize.height * scale, 
          opacity: 0.4,
          touchAction: 'none' // Предотвращаем скролл и зум
        }}
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