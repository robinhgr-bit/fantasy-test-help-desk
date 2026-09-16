import { useEffect, useRef, useState } from 'react';

const VIEWPORT = 260; // on-screen preview size, in CSS px
const OUTPUT = 480; // exported image size, in real px

// A small dependency-free "position and zoom, then crop to a circle/square"
// tool. Browsers only offer a blind, always-centered object-fit:cover crop
// for badges — this lets the host actually choose which part of the photo
// ends up inside the shape before it's uploaded anywhere.
export default function ImageCropModal({ file, shape = 'circle', title = 'Crop image', onCancel, onCropped }) {
  const [imgUrl, setImgUrl] = useState('');
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const dragRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // baseScale makes the image's shorter side exactly fill the viewport —
  // the same "cover" starting point the CSS crop used to lock you into.
  // The tiny *1.01 overscan absorbs sub-pixel rounding between this canvas
  // preview and the final circular clip, so no hairline of the badge's own
  // background can ever peek through at the very edge.
  const baseScale = natural.w && natural.h ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h) * 1.01 : 1;
  const scale = baseScale * zoom;
  const displayW = natural.w * scale;
  const displayH = natural.h * scale;
  // At the minimum zoom the image exactly covers the viewport with zero
  // slack, so dragging without clamping exposes a sliver of the badge's own
  // background at the edge — that's the stray "outline" this fixes.
  const maxOffsetX = Math.max(0, (displayW - VIEWPORT) / 2);
  const maxOffsetY = Math.max(0, (displayH - VIEWPORT) / 2);
  const clamp = (value, max) => Math.max(-max, Math.min(max, value));

  useEffect(() => {
    setOffset((current) => ({ x: clamp(current.x, maxOffsetX), y: clamp(current.y, maxOffsetY) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxOffsetX, maxOffsetY]);

  const onPointerDown = (event) => {
    const point = event.touches ? event.touches[0] : event;
    dragRef.current = { startX: point.clientX, startY: point.clientY, originX: offset.x, originY: offset.y };
  };
  const onPointerMove = (event) => {
    if (!dragRef.current) return;
    const point = event.touches ? event.touches[0] : event;
    const nextX = dragRef.current.originX + (point.clientX - dragRef.current.startX);
    const nextY = dragRef.current.originY + (point.clientY - dragRef.current.startY);
    setOffset({ x: clamp(nextX, maxOffsetX), y: clamp(nextY, maxOffsetY) });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const confirm = () => {
    setSaving(true);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT; canvas.height = OUTPUT;
      const ctx = canvas.getContext('2d');
      if (shape === 'circle') {
        ctx.beginPath(); ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      }
      const outScale = OUTPUT / VIEWPORT;
      const drawW = displayW * outScale;
      const drawH = displayH * outScale;
      const cx = OUTPUT / 2 + offset.x * outScale;
      const cy = OUTPUT / 2 + offset.y * outScale;
      ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
      canvas.toBlob((blob) => {
        if (!blob) { setSaving(false); return; }
        const croppedFile = new File([blob], (file.name || 'logo').replace(/\.[^.]+$/, '') + '-cropped.png', { type: 'image/png' });
        onCropped(croppedFile);
      }, 'image/png', 0.95);
    };
    img.src = imgUrl;
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-box crop-modal-box">
        <h3 className="disp" style={{ margin: '0 0 4px' }}>{title}</h3>
        <p className="hint" style={{ margin: '0 0 12px' }}>اسحب الصورة عشان تظبط مكانها، واستخدم السلايدر للتكبير.</p>
        <div
          className={`crop-viewport ${shape === 'circle' ? 'is-circle' : ''}`}
          onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
        >
          {imgUrl && (
            <img
              src={imgUrl}
              alt=""
              draggable={false}
              style={{ width: displayW, height: displayH, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
            />
          )}
        </div>
        <input type="range" className="crop-zoom" min="1" max="3" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={onCancel} disabled={saving}>إلغاء</button>
          <button className="btn small" style={{ flex: 1 }} onClick={confirm} disabled={saving || !imgUrl}>{saving ? '...' : 'قص وارفع'}</button>
        </div>
      </div>
    </div>
  );
}
