// Catches notFound() calls from both page.tsx (unknown/unpublished school)
// and [page]/page.tsx (unknown/draft page) in this segment — Next.js
// bubbles to the nearest not-found boundary either way. Styled with CAS's
// own forest-green/gold rather than a specific school's colors, since a
// 404 has no resolved school to brand itself with.
export default function SiteNotFound() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-xl font-bold text-slate-800">Page Not Found</p>
        <p className="text-slate-500 text-sm">This link does not point to a valid school website or page.</p>
      </div>
    </div>
  );
}
