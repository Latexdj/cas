'use client';

// Opens the diagram tool (public/diagram-tool.html) over the page and hands
// back the drawing as a PNG data URI.

import { useEffect, useRef } from 'react';

export function DiagramDialog({ onDone, onCancel }: { onDone: (png: string) => void; onCancel: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;   // only our own tool
      const d = e.data as { type?: string; png?: string };
      if (d?.type === 'cas-diagram' && typeof d.png === 'string' && d.png.startsWith('data:image/png;base64,')) onDone(d.png);
      else if (d?.type === 'cas-diagram-cancel') onCancel();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('message', onMsg);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('message', onMsg); window.removeEventListener('keydown', onKey); };
  }, [onDone, onCancel]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Draw a diagram"
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(11,61,46,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <iframe ref={frame} src="/diagram-tool.html" title="Draw a diagram"
        style={{ width: 'min(1000px, 100%)', height: 'min(720px, 100%)', border: 'none', borderRadius: 16, background: '#F4EFE6' }} />
    </div>
  );
}
