'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';

interface SiteInfo {
  school_name: string; logo_url: string | null; primary_color: string; accent_color: string;
  motto: string | null; vision: string | null; mission: string | null; core_values: string | null;
  address: string | null; phone: string | null; email: string | null;
  hero_image_url: string | null; hero_tagline: string | null;
  show_programs: boolean; show_admissions_cta: boolean;
  programs: { id: string; name: string }[];
  admissions_slug: string | null;
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}

export default function SchoolWebsitePage() {
  const { slug }  = useParams<{ slug: string }>();
  const [info,    setInfo]    = useState<SiteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [scrolled, setScrolled] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await publicApi.get(`/api/website/${slug}`); setInfo(data); }
    catch { setError('This school website could not be found.'); }
    finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)' }}>
      <div className="text-center space-y-4">
        <div className="w-14 h-14 rounded-full border-4 border-green-600 border-t-transparent animate-spin mx-auto" />
        <p className="text-sm text-slate-500 font-medium">Loading site…</p>
      </div>
    </div>
  );

  if (error || !info) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-xl font-bold text-slate-800">Site Not Found</p>
        <p className="text-slate-500 text-sm">{error || 'This link does not point to a valid school website.'}</p>
      </div>
    </div>
  );

  const primary = info.primary_color || '#16A34A';
  const accent  = info.accent_color  || '#145C44';
  const { r, g, b } = hexToRgb(primary);
  const hasAbout   = Boolean(info.motto || info.vision || info.mission || info.core_values);
  const hasContact = Boolean(info.phone || info.email || info.address);

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* Sticky Navbar */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-100' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {info.logo_url
              ? <img src={info.logo_url} alt="Logo" className="w-9 h-9 object-contain rounded-lg" />
              : <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: primary }}>{info.school_name[0]}</div>
            }
            <span className={`font-bold text-sm truncate max-w-[200px] ${scrolled ? 'text-slate-900' : 'text-white'}`}>{info.school_name}</span>
          </div>
          <nav className="flex items-center gap-6">
            {hasAbout && <a href="#about" className={`text-sm font-semibold hidden sm:inline ${scrolled ? 'text-slate-600' : 'text-white/90'}`}>About</a>}
            {info.show_programs && info.programs.length > 0 && <a href="#academics" className={`text-sm font-semibold hidden sm:inline ${scrolled ? 'text-slate-600' : 'text-white/90'}`}>Academics</a>}
            {hasContact && <a href="#contact" className={`text-sm font-semibold hidden sm:inline ${scrolled ? 'text-slate-600' : 'text-white/90'}`}>Contact</a>}
            {info.admissions_slug && (
              <a href={`/admissions/${info.admissions_slug}`}
                className="px-5 py-2 rounded-full text-sm font-bold text-white shadow-lg transition-transform"
                style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
                Apply Now
              </a>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, rgba(${r},${g},${b},0.97) 0%, rgba(${r},${g},${b},0.85) 60%, rgba(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)},0.95) 100%)` }} />
        {info.hero_image_url && (
          <img src={info.hero_image_url} alt="Banner" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30" />
        )}
        <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-white/5 blur-3xl" />

        <div className="relative z-10 text-center px-6 max-w-3xl mx-auto pt-20">
          {info.logo_url && (
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 mb-8 shadow-2xl">
              <img src={info.logo_url} alt="Logo" className="w-16 h-16 object-contain" />
            </div>
          )}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight">
            {info.school_name}
          </h1>
          {(info.hero_tagline || info.motto) && (
            <p className="mt-5 text-lg md:text-xl text-white/75 leading-relaxed max-w-xl mx-auto">{info.hero_tagline || info.motto}</p>
          )}
          {info.admissions_slug && (
            <div className="mt-10">
              <a href={`/admissions/${info.admissions_slug}`}
                className="inline-flex items-center px-8 py-4 rounded-xl text-base font-bold text-white shadow-2xl transition-all duration-200"
                style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.25),rgba(255,255,255,0.10))', border: '1.5px solid rgba(255,255,255,0.35)' }}>
                Apply Now
                <svg className="inline-block w-5 h-5 ml-2 -mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </a>
            </div>
          )}
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* About */}
      {hasAbout && (
        <section id="about" className="bg-white py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-bold mb-2" style={{ color: primary }}>Who We Are</p>
              <h2 className="text-3xl font-black text-slate-900">About {info.school_name}</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {info.vision && (
                <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
                  <h3 className="font-bold text-slate-900 mb-3">Our Vision</h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{info.vision}</p>
                </div>
              )}
              {info.mission && (
                <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100">
                  <h3 className="font-bold text-slate-900 mb-3">Our Mission</h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{info.mission}</p>
                </div>
              )}
              {info.core_values && (
                <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 md:col-span-2">
                  <h3 className="font-bold text-slate-900 mb-3">Our Core Values</h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{info.core_values}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Academics */}
      {info.show_programs && info.programs.length > 0 && (
        <section id="academics" className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-bold mb-2" style={{ color: primary }}>What We Offer</p>
              <h2 className="text-3xl font-black text-slate-900">Academic Programmes</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {info.programs.map((p, i) => (
                <div key={p.id} className="flex items-center gap-4 p-5 rounded-xl border border-slate-100 bg-white hover:shadow-lg transition-all duration-200">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
                    {String(i + 1).padStart(2,'0')}
                  </div>
                  <p className="font-semibold text-slate-800">{p.name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact */}
      {hasContact && (
        <section id="contact" className="bg-white py-16 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-bold mb-2" style={{ color: primary }}>Get In Touch</p>
              <h2 className="text-3xl font-black text-slate-900">Contact Us</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {info.phone && (
                <a href={`tel:${info.phone}`} className="flex flex-col items-center gap-3 p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:shadow-md transition-shadow text-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                    <svg className="w-6 h-6" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">Phone</p>
                    <p className="font-bold text-slate-800 mt-0.5">{info.phone}</p>
                  </div>
                </a>
              )}
              {info.email && (
                <a href={`mailto:${info.email}`} className="flex flex-col items-center gap-3 p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:shadow-md transition-shadow text-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                    <svg className="w-6 h-6" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">Email</p>
                    <p className="font-bold text-slate-800 mt-0.5 text-sm break-all">{info.email}</p>
                  </div>
                </a>
              )}
              {info.address && (
                <div className="flex flex-col items-center gap-3 p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                    <svg className="w-6 h-6" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">Address</p>
                    <p className="font-semibold text-slate-800 mt-0.5 text-sm">{info.address}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {info.logo_url
              ? <img src={info.logo_url} alt="Logo" className="w-7 h-7 object-contain rounded" />
              : <div className="w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: primary }}>{info.school_name[0]}</div>
            }
            <span className="text-sm font-semibold text-slate-700">{info.school_name}</span>
          </div>
          <p className="text-xs text-slate-400">Powered by <span className="font-semibold text-slate-500">CAS School Management System</span></p>
        </div>
      </footer>
    </div>
  );
}
