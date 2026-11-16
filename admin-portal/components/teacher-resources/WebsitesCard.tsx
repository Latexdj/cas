'use client';

// Teacher-facing "Websites and tools" card on the Teaching resources page.

import { useEffect, useMemo, useState } from 'react';
import { teacherApi } from '@/lib/teacher-api';
import { SITE_CATEGORIES, siteDomain } from './categories';

interface Site { id: string; title: string; description: string | null; url: string; category: string; subjects: string[] }

const STORE = 'cas_t_websites';
function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeRecent(ids: string[]) {
  try { localStorage.setItem(STORE, JSON.stringify(ids)); } catch { /* storage unavailable */ }
}

export function WebsitesCard() {
  const [sites,    setSites]    = useState<Site[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [category, setCategory] = useState('');
  const [subject,  setSubject]  = useState('');
  const [recent,   setRecent]   = useState<string[]>([]);

  useEffect(() => {
    teacherApi.get<Site[]>('/api/teacher-resources/websites')
      .then(r => { setSites(r.data); const ids = new Set(r.data.map(s => s.id)); setRecent(readRecent().filter(id => ids.has(id))); })
      .catch(() => setError('Could not load the websites. Check your connection and try again.'))
      .finally(() => setLoading(false));
  }, []);

  const usedCategories = SITE_CATEGORIES.filter(c => sites.some(s => s.category === c.key));
  const subjects = useMemo(() => [...new Set(sites.flatMap(s => s.subjects))].sort((a, b) => a.localeCompare(b)), [sites]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sites.filter(s =>
      (!category || s.category === category) &&
      // A site with no subject tags is for every subject.
      (!subject || s.subjects.length === 0 || s.subjects.includes(subject)) &&
      (!q || s.title.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q) || siteDomain(s.url).includes(q)));
  }, [sites, search, category, subject]);

  const recentSites = recent.map(id => sites.find(s => s.id === id)).filter((s): s is Site => !!s);

  function opened(site: Site) {
    const next = [site.id, ...recent.filter(id => id !== site.id)].slice(0, 3);
    setRecent(next); writeRecent(next);
    teacherApi.post(`/api/teacher-resources/websites/${site.id}/launch`).catch(() => { /* counting only */ });
  }

  const chip = (active: boolean) =>
    `shrink-0 min-h-[40px] px-3 rounded-full text-sm font-semibold border ${active
      ? 'bg-[#145C44] border-[#145C44] text-white'
      : 'bg-white border-[#E2D9CC] text-[#4A3F32]'}`;

  return (
    <section className="bg-white rounded-2xl border border-[#E2D9CC] p-5 space-y-4" aria-labelledby="websites">
      <div>
        <h2 id="websites" className="text-lg font-bold text-[#2C2218]">Websites and tools</h2>
        <p className="text-sm text-[#6E6253] mt-0.5">Trusted sites for the curriculum, lesson planning, videos and more. They open in a new tab.</p>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true">
          <div className="h-12 rounded-xl bg-[#F4EFE6] animate-pulse" />
          <div className="h-20 rounded-xl bg-[#F4EFE6] animate-pulse" />
        </div>
      ) : error ? (
        <p className="text-sm text-[#B91C1C]">{error}</p>
      ) : sites.length === 0 ? (
        <p className="text-sm text-[#6E6253]">No websites have been added yet.</p>
      ) : (
        <>
          {recentSites.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-[#4A3F32] mb-2">Recent</p>
              <div className="flex flex-wrap gap-2">
                {recentSites.map(s => (
                  <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" onClick={() => opened(s)}
                    className="inline-flex items-center min-h-[44px] px-3 rounded-xl border border-[#145C44]/30 bg-[#E8F4EE] text-sm font-semibold text-[#145C44]">
                    {s.title}
                  </a>
                ))}
              </div>
            </div>
          )}

          <input type="search" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search websites"
            placeholder="Search websites"
            className="w-full rounded-xl border border-[#E2D9CC] bg-white px-3 min-h-[48px] text-base text-[#2C2218] focus:outline-none focus:ring-2 focus:ring-[#145C44]" />

          {usedCategories.length > 1 && (
            <div className="-mx-5 px-5 flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Category">
              <button type="button" className={chip(!category)} aria-pressed={!category} onClick={() => setCategory('')}>All</button>
              {usedCategories.map(c => (
                <button key={c.key} type="button" className={chip(category === c.key)} aria-pressed={category === c.key}
                  onClick={() => setCategory(category === c.key ? '' : c.key)}>{c.label}</button>
              ))}
            </div>
          )}

          {subjects.length > 0 && (
            <select value={subject} onChange={e => setSubject(e.target.value)} aria-label="Subject"
              className="w-full rounded-xl border border-[#E2D9CC] bg-white px-3 min-h-[48px] text-base text-[#2C2218] focus:outline-none focus:ring-2 focus:ring-[#145C44]">
              <option value="">All subjects</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {shown.length === 0 ? (
            <p className="text-sm text-[#6E6253]">No website matches. Try another word, category or subject.</p>
          ) : (
            <div className="space-y-5">
              {SITE_CATEGORIES.filter(c => shown.some(s => s.category === c.key)).map(c => (
                <div key={c.key}>
                  {!category && <h3 className="text-sm font-bold text-[#4A3F32] mb-2">{c.label}</h3>}
                  <ul className="space-y-2">
                    {shown.filter(s => s.category === c.key).map(s => (
                      <li key={s.id}>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={() => opened(s)}
                          className="flex items-start gap-3 rounded-xl border border-[#E2D9CC] px-4 py-3 hover:bg-[#F4EFE6] transition-colors">
                          <span className="flex-1 min-w-0">
                            <span className="block text-base font-semibold text-[#2C2218]">{s.title}</span>
                            {s.description && <span className="block text-sm text-[#4A3F32] mt-0.5">{s.description}</span>}
                            <span className="block text-sm text-[#6E6253] mt-1">
                              {siteDomain(s.url)}{s.subjects.length > 0 && ` · ${s.subjects.join(', ')}`}
                            </span>
                          </span>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 mt-1 shrink-0 text-[#145C44]" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
                          </svg>
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
