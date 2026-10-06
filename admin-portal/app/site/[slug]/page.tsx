'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { publicApi } from '@/lib/api';

interface SiteInfo {
  school_name: string; logo_url: string | null; primary_color: string; accent_color: string;
  motto: string | null; vision: string | null; mission: string | null; core_values: string | null;
  address: string | null; phone: string | null; email: string | null;
  school_type: string | null; headmaster_name: string | null; region: string | null; district: string | null;
  hero_image_url: string | null; hero_tagline: string | null;
  show_programs: boolean; show_admissions_cta: boolean; show_stats: boolean;
  programs: { id: string; name: string }[];
  stats: { students: number; faculty: number; programmes: number } | null;
  admissions_slug: string | null;
}

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  Primary: 'Primary School', JHS: 'Junior High School', SHS: 'Senior High School',
  Technical: 'Technical School', University: 'University', Other: 'School',
};

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}

// Readable text color against a given background hex (basic luminance check).
function readableOn(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1A1A1A' : '#FFFFFF';
}

function splitList(text: string | null): string[] {
  if (!text) return [];
  let parts = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) parts = text.split(';').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) parts = text.split(',').map(s => s.trim()).filter(Boolean);
  return parts.slice(0, 8);
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function SchoolWebsitePage() {
  const { slug }  = useParams<{ slug: string }>();
  const [info,    setInfo]    = useState<SiteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8]">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-[#145C44] border-b-transparent animate-spin mx-auto" />
        <p className="text-sm text-slate-500 font-medium">Loading site…</p>
      </div>
    </div>
  );

  if (error || !info) return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-6">
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

  const primary = info.primary_color || '#0B3D2E';
  const accent  = info.accent_color  || '#C8973A';
  const onPrimary = readableOn(primary);
  const { r, g, b } = hexToRgb(primary);
  const typeLabel = info.school_type ? SCHOOL_TYPE_LABELS[info.school_type] ?? info.school_type : null;
  const coreValues = splitList(info.core_values);
  const hasAbout   = Boolean(info.mission || info.vision || info.motto || coreValues.length);
  const hasContact = Boolean(info.phone || info.email || info.address);
  const canApply   = Boolean(info.show_admissions_cta && info.admissions_slug);

  const navLinks = [
    hasAbout && { href: '#about', label: 'About' },
    info.show_programs && info.programs.length > 0 && { href: '#academics', label: 'Academics' },
    hasContact && { href: '#contact', label: 'Contact' },
  ].filter(Boolean) as { href: string; label: string }[];

  return (
    <div className="min-h-screen bg-[#F5F0E8] font-sans">

      {/* Nav */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${scrolled ? 'bg-white shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {info.logo_url
              ? <img src={info.logo_url} alt="" className="w-9 h-9 object-contain rounded-lg flex-shrink-0" />
              : <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ backgroundColor: accent, color: readableOn(accent) }}>{info.school_name[0]}</div>
            }
            <span className={`font-bold text-sm truncate ${scrolled ? 'text-slate-900' : 'text-white'}`}>{info.school_name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map(l => (
              <a key={l.href} href={l.href} className={`text-sm font-semibold transition-colors ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-white/85 hover:text-white'}`}>{l.label}</a>
            ))}
            {canApply && (
              <a href={`/admissions/${info.admissions_slug}`}
                className="px-5 py-2 rounded-lg text-sm font-bold shadow-sm transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: accent, color: readableOn(accent) }}>
                Apply Now
              </a>
            )}
          </nav>
          <button
            className={`md:hidden p-2 rounded-lg ${scrolled ? 'text-slate-700' : 'text-white'}`}
            onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 shadow-sm">
            <div className="px-6 py-4 flex flex-col gap-3">
              {navLinks.map(l => (
                <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-slate-700">{l.label}</a>
              ))}
              {canApply && (
                <a href={`/admissions/${info.admissions_slug}`}
                  className="px-5 py-2.5 rounded-lg text-sm font-bold text-center"
                  style={{ backgroundColor: accent, color: readableOn(accent) }}>
                  Apply Now
                </a>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 px-6 overflow-hidden" style={{ backgroundColor: primary }}>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center relative z-10">
          <div>
            {typeLabel && (
              <div className="inline-flex items-center gap-2 mb-5">
                <span className="w-6 h-px" style={{ backgroundColor: accent }} />
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: accent }}>{typeLabel}{info.region ? ` in ${info.region}` : ''}</span>
              </div>
            )}
            <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight" style={{ color: onPrimary }}>
              {info.school_name}
            </h1>
            {info.hero_tagline ? (
              <p className="mt-4 text-xl md:text-2xl font-bold" style={{ color: accent }}>{info.hero_tagline}</p>
            ) : info.motto ? (
              <p className="mt-4 text-lg italic" style={{ color: onPrimary, opacity: 0.85 }}>&ldquo;{info.motto}&rdquo;</p>
            ) : null}
            <div className="mt-9 flex flex-wrap gap-3">
              {canApply ? (
                <a href={`/admissions/${info.admissions_slug}`}
                  className="px-7 py-3.5 rounded-lg text-base font-bold shadow-lg transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: accent, color: readableOn(accent) }}>
                  Apply Now
                </a>
              ) : hasContact && (
                <a href="#contact"
                  className="px-7 py-3.5 rounded-lg text-base font-bold shadow-lg transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: accent, color: readableOn(accent) }}>
                  Contact Us
                </a>
              )}
              {info.show_programs && info.programs.length > 0 && (
                <a href="#academics"
                  className="px-7 py-3.5 rounded-lg text-base font-bold border transition-colors"
                  style={{ borderColor: `rgba(${onPrimary === '#FFFFFF' ? '255,255,255' : '0,0,0'},0.3)`, color: onPrimary }}>
                  View Programmes
                </a>
              )}
            </div>
          </div>

          <div className="relative">
            {info.hero_image_url ? (
              <div className="rounded-2xl overflow-hidden shadow-2xl aspect-[4/3]">
                <img src={info.hero_image_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="rounded-2xl aspect-[4/3] flex items-center justify-center" style={{ backgroundColor: `rgba(${r},${g},${b},0.4)`, border: `1px solid rgba(${onPrimary === '#FFFFFF' ? '255,255,255' : '0,0,0'},0.15)` }}>
                {info.logo_url
                  ? <img src={info.logo_url} alt="" className="w-28 h-28 object-contain opacity-90" />
                  : <span className="text-7xl font-black" style={{ color: onPrimary, opacity: 0.25 }}>{info.school_name[0]}</span>
                }
              </div>
            )}
            {info.show_stats && info.stats && (
              <div className="absolute -bottom-6 -left-6 bg-white rounded-xl shadow-xl px-5 py-4 hidden sm:block">
                <p className="text-3xl font-black text-slate-900">{info.stats.students}+</p>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">Active Students</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Stats bar */}
      {info.show_stats && info.stats && (
        <section className="py-8 px-6" style={{ backgroundColor: accent }}>
          <div className="max-w-6xl mx-auto grid grid-cols-3 gap-6 text-center">
            {[
              { n: info.stats.students, label: 'Active Students' },
              { n: info.stats.faculty, label: 'Faculty Members' },
              { n: info.stats.programmes, label: 'Programmes' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-3xl md:text-4xl font-black" style={{ color: readableOn(accent) }}>{s.n}</p>
                <p className="text-xs md:text-sm font-semibold mt-1" style={{ color: readableOn(accent), opacity: 0.85 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* About */}
      {hasAbout && (
        <section id="about" className="py-20 px-6 bg-white">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-start">
            <div className="relative">
              {info.hero_image_url ? (
                <div className="rounded-2xl overflow-hidden shadow-lg aspect-[4/3]">
                  <img src={info.hero_image_url} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="rounded-2xl aspect-[4/3] flex items-center justify-center" style={{ backgroundColor: `rgba(${r},${g},${b},0.08)` }}>
                  {info.logo_url && <img src={info.logo_url} alt="" className="w-24 h-24 object-contain opacity-70" />}
                </div>
              )}
              {info.headmaster_name && (
                <div className="absolute -bottom-5 left-6 bg-white rounded-xl shadow-lg px-5 py-3">
                  <p className="text-xs text-slate-400 font-semibold">Led by</p>
                  <p className="font-bold text-slate-800 text-sm">{info.headmaster_name}</p>
                </div>
              )}
            </div>

            <div>
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="w-6 h-px" style={{ backgroundColor: primary }} />
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: primary }}>Who We Are</span>
              </div>
              <h2 className="text-3xl font-black text-slate-900">About {info.school_name}</h2>
              {(info.mission || info.vision) && (
                <p className="mt-4 text-slate-600 leading-relaxed whitespace-pre-wrap">{info.mission || info.vision}</p>
              )}
              {coreValues.length > 0 && (
                <ul className="mt-7 space-y-3">
                  {coreValues.map(v => (
                    <li key={v} className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `rgba(${r},${g},${b},0.12)` }}>
                        <CheckIcon className="w-3 h-3" />
                      </span>
                      <span className="text-sm text-slate-700 font-medium">{v}</span>
                    </li>
                  ))}
                </ul>
              )}
              {info.mission && info.vision && (
                <div className="mt-7 rounded-xl p-5 border-l-4" style={{ borderColor: accent, backgroundColor: `rgba(${r},${g},${b},0.04)` }}>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Our Vision</p>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{info.vision}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Academics */}
      {info.show_programs && info.programs.length > 0 && (
        <section id="academics" className="py-20 px-6" style={{ backgroundColor: '#F5F0E8' }}>
          <div className="max-w-6xl mx-auto">
            <div className="mb-12">
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="w-6 h-px" style={{ backgroundColor: primary }} />
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: primary }}>What We Offer</span>
              </div>
              <h2 className="text-3xl font-black text-slate-900">Academic Programmes</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {info.programs.map(p => (
                <div key={p.id} className="flex items-center gap-4 p-5 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: primary }}>
                    <svg className="w-5 h-5" style={{ color: onPrimary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.42A12.083 12.083 0 0112 21.5a12.083 12.083 0 01-6.16-10.92L12 14z" />
                    </svg>
                  </div>
                  <p className="font-semibold text-slate-800">{p.name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Apply CTA banner */}
      {canApply && (
        <section className="px-6 py-14" style={{ backgroundColor: primary }}>
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
            <div>
              <h3 className="text-2xl font-black" style={{ color: onPrimary }}>Ready to join {info.school_name}?</h3>
              <p className="mt-1.5 text-sm" style={{ color: onPrimary, opacity: 0.75 }}>Start your application through our admissions portal.</p>
            </div>
            <a href={`/admissions/${info.admissions_slug}`}
              className="px-8 py-3.5 rounded-lg text-base font-bold shadow-lg whitespace-nowrap transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: accent, color: readableOn(accent) }}>
              Apply Now
            </a>
          </div>
        </section>
      )}

      {/* Contact */}
      {hasContact && (
        <section id="contact" className="bg-white py-20 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-12">
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="w-6 h-px" style={{ backgroundColor: primary }} />
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: primary }}>Get In Touch</span>
              </div>
              <h2 className="text-3xl font-black text-slate-900">Contact Us</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
              {info.phone && (
                <a href={`tel:${info.phone}`} className="flex items-center gap-4 p-5 rounded-xl border border-slate-100 bg-[#F5F0E8]/60 hover:shadow-md transition-shadow">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                    <svg className="w-5 h-5" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold">Phone</p>
                    <p className="font-bold text-slate-800 text-sm truncate">{info.phone}</p>
                  </div>
                </a>
              )}
              {info.email && (
                <a href={`mailto:${info.email}`} className="flex items-center gap-4 p-5 rounded-xl border border-slate-100 bg-[#F5F0E8]/60 hover:shadow-md transition-shadow">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                    <svg className="w-5 h-5" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold">Email</p>
                    <p className="font-bold text-slate-800 text-sm truncate">{info.email}</p>
                  </div>
                </a>
              )}
              {info.address && (
                <div className="flex items-center gap-4 p-5 rounded-xl border border-slate-100 bg-[#F5F0E8]/60">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                    <svg className="w-5 h-5" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold">Address</p>
                    <p className="font-semibold text-slate-800 text-sm">{info.address}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="pt-16 pb-8 px-6" style={{ backgroundColor: primary }}>
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10 mb-10">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-3">
              {info.logo_url
                ? <img src={info.logo_url} alt="" className="w-8 h-8 object-contain rounded" />
                : <div className="w-8 h-8 rounded flex items-center justify-center font-bold text-xs" style={{ backgroundColor: accent, color: readableOn(accent) }}>{info.school_name[0]}</div>
              }
              <span className="font-bold" style={{ color: onPrimary }}>{info.school_name}</span>
            </div>
            {info.motto && <p className="text-sm italic max-w-xs" style={{ color: onPrimary, opacity: 0.65 }}>&ldquo;{info.motto}&rdquo;</p>}
          </div>
          {navLinks.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: accent }}>Quick Links</p>
              <ul className="space-y-2.5">
                {navLinks.map(l => (
                  <li key={l.href}><a href={l.href} className="text-sm hover:underline" style={{ color: onPrimary, opacity: 0.75 }}>{l.label}</a></li>
                ))}
              </ul>
            </div>
          )}
          {hasContact && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: accent }}>Contact</p>
              <ul className="space-y-2.5 text-sm" style={{ color: onPrimary, opacity: 0.75 }}>
                {info.phone && <li>{info.phone}</li>}
                {info.email && <li className="break-all">{info.email}</li>}
                {info.address && <li>{info.address}</li>}
              </ul>
            </div>
          )}
        </div>
        <div className="max-w-6xl mx-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderTop: `1px solid rgba(${onPrimary === '#FFFFFF' ? '255,255,255' : '0,0,0'},0.12)` }}>
          <p className="text-xs" style={{ color: onPrimary, opacity: 0.55 }}>© {new Date().getFullYear()} {info.school_name}. All rights reserved.</p>
          <p className="text-xs" style={{ color: onPrimary, opacity: 0.55 }}>Powered by <span className="font-semibold" style={{ opacity: 0.85 }}>CAS School Management System</span></p>
        </div>
      </footer>
    </div>
  );
}
