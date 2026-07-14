import React, { useEffect, useRef, useState } from 'react';

export default function SplitPane({ children, storageKey, defaultPercent = 58, minLeft = 360, minRight = 300, className = '' }) {
  const rootRef = useRef(null);
  const rafRef = useRef(0);
  const [percent, setPercent] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved > 20 && saved < 80 ? saved : defaultPercent;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (root) root.style.setProperty('--split-left', `${percent}%`);
  }, [percent]);

  const beginDrag = (event) => {
    event.preventDefault();
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);
    document.body.classList.add('is-resizing');

    const move = (e) => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const available = rect.width - 10;
        const minPct = (minLeft / available) * 100;
        const maxPct = 100 - (minRight / available) * 100;
        const next = Math.max(minPct, Math.min(maxPct, ((e.clientX - rect.left) / available) * 100));
        root.style.setProperty('--split-left', `${next}%`);
        root.dataset.livePercent = String(next);
      });
    };

    const up = () => {
      cancelAnimationFrame(rafRef.current);
      const next = Number(root.dataset.livePercent || percent);
      setPercent(next);
      localStorage.setItem(storageKey, String(next));
      delete root.dataset.livePercent;
      document.body.classList.remove('is-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  };

  return (
    <div ref={rootRef} className={`split-pane ${className}`} style={{ '--split-left': `${percent}%` }}>
      <div className="split-pane__left">{children[0]}</div>
      <div className="split-pane__handle" onPointerDown={beginDrag} role="separator" aria-orientation="vertical" tabIndex={0}><span /></div>
      <div className="split-pane__right">{children[1]}</div>
    </div>
  );
}
