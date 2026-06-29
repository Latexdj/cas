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

export default function AdmissionsLanding() {
  const { slug }   = useParams<{ slug: string }>();
  const router     = useRouter();
  const [info,     setInfo]    = useState<PortalInfo | null>(null);
  const [loading,  setLoading] = useState(true);
  const [error,    setError]   = useState('');

  const load = useCallback(async () => {
    try { const { data } = await publicApi.get(`/api/admissions/${slug}`); setInfo(data); }
    catch { setError('This admission portal could not be found.'); }
    finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
    </div>
  );

  if (error || !info) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <p className="text-2xl font-bold text-slate-800">Portal Not Found</p>
        <p className="text-slate-500">{error || 'This link does not point to a valid admission portal.'}</p>
      </div>
    </div>
  );

  const primary = info.portal_primary_color || '#16A34A';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="relative" style={{ backgroundColor: primary }}>
        {info.banner_image_url && (
          <img src={info.banner_image_url} alt="Banner" className="absolute inset-0 w-full h-full object-cover opacity-20" />
        )}
        <div className="relative z-10 max-w-3xl mx-auto px-6 py-16 text-center text-white">
          {info.portal_logo_url && (
            <img src={info.portal_logo_url} alt="Logo" className="w-24 h-24 object-contain rounded-full bg-white/10 mx-auto mb-6" />
          )}
          <h1 className="text-3xl md:text-4xl font-bold">
            {info.website_title || `${info.school_name} Admissions`}
          </h1>
          {info.website_tagline && <p className="mt-3 text-lg text-white/80">{info.website_tagline}</p>}
          {info.application_deadline && (
            <p className="mt-2 text-sm font-semibold text-white/70">
              Application deadline: {new Date(info.application_deadline).toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}
            </p>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {!info.is_portal_open ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center space-y-3">
            <p className="text-xl font-bold text-amber-800">Portal Currently Closed</p>
            <p className="text-sm text-amber-700">The admission portal is not accepting applications at this time. Please check back later or contact the school.</p>
          </div>
        ) : (
          <>
            {info.welcome_text && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{info.welcome_text}</p>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-4">
              <h2 className="text-xl font-bold text-slate-900">Start Your Application</h2>
              <p className="text-sm text-slate-500">Click below to check your placement status and begin the admission process. You will need your 12-digit index number.</p>
              <button
                onClick={() => router.push(`/admissions/${slug}/check`)}
                className="w-full py-4 rounded-xl text-white font-bold text-lg shadow-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: primary }}>
                Check Placement & Apply
              </button>
            </div>

            {info.programs.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Available Programmes</h3>
                <div className="flex flex-wrap gap-2">
                  {info.programs.map(p => (
                    <span key={p.id} className="px-3 py-1 rounded-full text-sm font-medium text-white" style={{ backgroundColor: primary }}>
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Contact */}
        {(info.contact_email || info.contact_phone || info.contact_address) && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Contact Us</h3>
            <div className="space-y-1 text-sm text-slate-700">
              {info.contact_phone   && <p>Phone: <a href={`tel:${info.contact_phone}`}   className="font-semibold">{info.contact_phone}</a></p>}
              {info.contact_email   && <p>Email: <a href={`mailto:${info.contact_email}`} className="font-semibold">{info.contact_email}</a></p>}
              {info.contact_address && <p>Address: {info.contact_address}</p>}
            </div>
          </div>
        )}
      </div>

      <footer className="text-center py-6 text-xs text-slate-400">
        Powered by CAS School Management System
      </footer>
    </div>
  );
}
