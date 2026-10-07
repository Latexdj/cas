'use client';
import { useState } from 'react';

interface GalleryImage { id: string; image_url: string; caption: string | null }

// The page itself stays a Server Component for SEO (same reasoning as
// SiteChrome) — only the lightbox's open/close/prev/next state needs a
// client boundary, kept as small as this.
export function GalleryGrid({ images }: { images: GalleryImage[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!images.length) {
    return <p className="text-slate-400 text-sm">No photos yet.</p>;
  }

  const current = openIndex !== null ? images[openIndex] : null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {images.map((img, i) => (
          <button key={img.id} onClick={() => setOpenIndex(i)}
            className="group relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100">
            <img src={img.image_url} alt={img.caption ?? ''} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
          </button>
        ))}
      </div>

      {current && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 sm:p-10"
          onClick={() => setOpenIndex(null)}
        >
          <button onClick={() => setOpenIndex(null)} className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none" aria-label="Close">×</button>
          {openIndex! > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setOpenIndex(i => (i ?? 0) - 1); }}
              className="absolute left-2 sm:left-6 text-white/80 hover:text-white text-4xl leading-none" aria-label="Previous"
            >‹</button>
          )}
          {openIndex! < images.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setOpenIndex(i => (i ?? 0) + 1); }}
              className="absolute right-2 sm:right-6 text-white/80 hover:text-white text-4xl leading-none" aria-label="Next"
            >›</button>
          )}
          <div className="max-w-4xl max-h-full" onClick={e => e.stopPropagation()}>
            <img src={current.image_url} alt={current.caption ?? ''} className="max-w-full max-h-[80vh] object-contain rounded-lg" />
            {current.caption && <p className="text-white/80 text-sm text-center mt-3">{current.caption}</p>}
          </div>
        </div>
      )}
    </>
  );
}
