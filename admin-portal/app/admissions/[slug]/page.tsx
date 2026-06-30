'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { publicApi } from '@/lib/api';

interface PortalInfo {
  school_name: string; website_title: string; website_tagline: string; welcome_text: string;
  banner_image_url: string | null; portal_logo_url: string | null;
  is_portal_open: boolean; application_deadline: string | null;
  contact_email: string | null; contact_phone: string | null; contact_address: string | null;
  portal_primary_color: string; portal_accent_color: string;
  programs: { id: string; name: string }[];
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}

export default function AdmissionsLanding() {
  const { slug }   = useParams<{ slug: string }>();
  const router     = useRouter();
  const [info,     setInfo]    = useState<PortalInfo | null>(null);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState('');
  const [scrolled, setScrolled] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await publicApi.get(`/api/admissions/${slug}`); setInfo(data); }
    catch { setError('This admission portal could not be found.'); }
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
        <p className="text-sm text-slate-500 font-medium">Loading portal…</p>
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
        <p className="text-xl font-bold text-slate-800">Portal Not Found</p>
        <p className="text-slate-500 text-sm">{error || 'This link does not point to a valid admission portal.'}</p>
      </div>
    </div>
  );

  const primary = info.portal_primary_color || '#16A34A';
  const accent  = info.portal_accent_color  || '#15803D';
  const { r, g, b } = hexToRgb(primary);

  const steps = [
    { num: '01', title: 'Check Placement', desc: 'Enter your 12-digit BECE index number to verify your CSSPS placement.' },
    { num: '02', title: 'Fill Your Form',  desc: 'Complete the admission form with your personal, academic and guardian details.' },
    { num: '03', title: 'Upload Documents', desc: 'Upload your passport photo and BECE results slip for verification.' },
    { num: '04', title: 'Get Admitted',    desc: 'Download your admission letter and prospectus immediately after submission.' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* Sticky Navbar */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-100' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {info.portal_logo_url
              ? <img src={info.portal_logo_url} alt="Logo" className="w-9 h-9 object-contain rounded-lg" />
              : <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: primary }}>{info.school_name[0]}</div>
            }
            <span className={`font-bold text-sm truncate max-w-[200px] ${scrolled ? 'text-slate-900' : 'text-white'}`}>{info.school_name}</span>
          </div>
          {info.is_portal_open && (
            <button
              onClick={() => router.push(`/admissions/${slug}/check`)}
              className="px-5 py-2 rounded-full text-sm font-bold text-white shadow-lg transition-transform hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
              Apply Now
            </button>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, rgba(${r},${g},${b},0.97) 0%, rgba(${r},${g},${b},0.85) 60%, rgba(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)},0.95) 100%)` }} />
        {info.banner_image_url && (
          <img src={info.banner_image_url} alt="Banner" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30" />
        )}
        {/* Decorative circles */}
        <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-white/5 blur-3xl" />

        <div className="relative z-10 text-center px-6 max-w-3xl mx-auto pt-20">
          {info.portal_logo_url && (
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 mb-8 shadow-2xl">
              <img src={info.portal_logo_url} alt="Logo" className="w-16 h-16 object-contain" />
            </div>
          )}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white/90 text-xs font-semibold uppercase tracking-widest mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
            {info.is_portal_open ? 'Applications Open' : 'Portal Closed'}
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight">
            {info.website_title || `${info.school_name} Admissions`}
          </h1>
          {info.website_tagline && (
            <p className="mt-5 text-lg md:text-xl text-white/75 leading-relaxed max-w-xl mx-auto">{info.website_tagline}</p>
          )}
          {info.application_deadline && (
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white/80 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Deadline: {new Date(info.application_deadline).toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}
            </div>
          )}
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            {info.is_portal_open ? (
              <>
                <button
                  onClick={() => router.push(`/admissions/${slug}/check`)}
                  className="px-8 py-4 rounded-2xl text-base font-bold text-white shadow-2xl transition-all duration-200 hover:scale-105 hover:shadow-green-900/30"
                  style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.25),rgba(255,255,255,0.10))', border: '1.5px solid rgba(255,255,255,0.35)' }}>
                  Check Placement & Apply
                  <svg className="inline-block w-5 h-5 ml-2 -mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
                <a href="#how-it-works" className="px-8 py-4 rounded-2xl text-base font-semibold text-white/80 bg-white/10 border border-white/20 hover:bg-white/20 transition-colors">
                  Learn More
                </a>
              </>
            ) : (
              <div className="px-8 py-4 rounded-2xl text-base font-bold text-white/60 bg-white/10 border border-white/20">
                Portal currently closed — check back later
              </div>
            )}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <svg className="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* Closed notice */}
      {!info.is_portal_open && (
        <section className="max-w-2xl mx-auto px-6 py-12">
          <div className="rounded-3xl bg-amber-50 border border-amber-200 p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-xl font-bold text-amber-800">Applications Are Closed</p>
            <p className="text-amber-700">The admission portal is not accepting applications at this time. Please contact the school for more information.</p>
          </div>
        </section>
      )}

      {/* Welcome message */}
      {info.welcome_text && info.is_portal_open && (
        <section className="bg-white py-16">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">A Message From Us</p>
            <p className="text-slate-700 text-lg leading-relaxed whitespace-pre-wrap">{info.welcome_text}</p>
          </div>
        </section>
      )}

      {/* How it works */}
      {info.is_portal_open && (
        <section id="how-it-works" className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: primary }}>The Process</p>
              <h2 className="text-3xl font-black text-slate-900">How to Apply</h2>
              <p className="text-slate-500 mt-3 max-w-md mx-auto">Complete your admission in four simple steps — the entire process takes less than 10 minutes.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((s, i) => (
                <div key={s.num} className="relative bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg mb-4 shadow-lg" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
                    {s.num}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="hidden lg:block absolute top-10 -right-3 w-6 h-0.5 bg-slate-200" />
                  )}
                  <h3 className="font-bold text-slate-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-10">
              <button
                onClick={() => router.push(`/admissions/${slug}/check`)}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-white font-bold text-sm shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5"
                style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
                Get Started Now
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Programmes */}
      {info.programs.length > 0 && (
        <section className="bg-white py-16 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: primary }}>What We Offer</p>
              <h2 className="text-3xl font-black text-slate-900">Available Programmes</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {info.programs.map((p, i) => (
                <div key={p.id} className="group flex items-center gap-4 p-5 rounded-2xl border border-slate-100 hover:border-transparent hover:shadow-lg transition-all duration-200 cursor-default"
                  style={{ '--hover-bg': `rgba(${r},${g},${b},0.05)` } as React.CSSProperties}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = `rgba(${r},${g},${b},0.05)`)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
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
      {(info.contact_email || info.contact_phone || info.contact_address) && (
        <section className="py-16 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: primary }}>Get In Touch</p>
              <h2 className="text-3xl font-black text-slate-900">Contact Us</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {info.contact_phone && (
                <a href={`tel:${info.contact_phone}`} className="flex flex-col items-center gap-3 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                    <svg className="w-6 h-6" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Phone</p>
                    <p className="font-bold text-slate-800 mt-0.5">{info.contact_phone}</p>
                  </div>
                </a>
              )}
              {info.contact_email && (
                <a href={`mailto:${info.contact_email}`} className="flex flex-col items-center gap-3 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                    <svg className="w-6 h-6" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Email</p>
                    <p className="font-bold text-slate-800 mt-0.5 text-sm break-all">{info.contact_email}</p>
                  </div>
                </a>
              )}
              {info.contact_address && (
                <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm text-center">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                    <svg className="w-6 h-6" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Address</p>
                    <p className="font-semibold text-slate-800 mt-0.5 text-sm">{info.contact_address}</p>
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
            {info.portal_logo_url
              ? <img src={info.portal_logo_url} alt="Logo" className="w-7 h-7 object-contain rounded" />
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
