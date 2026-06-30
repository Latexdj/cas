'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { publicApi } from '@/lib/api';
import jsPDF from 'jspdf';

interface Application {
  id: string; admission_number: string; status: string;
  index_number: string; full_name: string; gender: string;
  date_of_birth: string | null; aggregate: number | null;
  residential_status: string | null; program_name: string | null;
  house: string | null; picture_url: string | null;
  guardian_name: string | null; guardian_mobile: string | null;
  mobile_number: string | null; hometown: string | null;
  bece_results_url: string | null; form_completed_at: string | null;
  school: {
    school_name: string; portal_primary_color: string; portal_accent_color: string;
    portal_logo_url: string | null; admission_year: number;
    contact_phone: string | null; contact_email: string | null;
    contact_address: string | null;
  };
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}

export default function CompletePage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const router          = useRouter();
  const [app,            setApp]           = useState<Application | null>(null);
  const [loading,        setLoading]       = useState(true);
  const [error,          setError]         = useState('');
  const [prospectusUrl,  setProspectusUrl] = useState<string | null>(null);
  const [downloading,    setDownloading]   = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await publicApi.get(`/api/admissions/${slug}/apply/${token}`);
      if (data.status === 'pending') {
        router.replace(`/admissions/${slug}/apply/${token}`);
        return;
      }
      setApp(data);
      try {
        const { data: p } = await publicApi.get(`/api/admissions/${slug}/apply/${token}/prospectus`);
        setProspectusUrl(p.file_url);
      } catch {}
    } catch { setError('Application not found.'); }
    finally { setLoading(false); }
  }, [slug, token, router]);

  useEffect(() => { load(); }, [load]);

  function generateAdmissionLetter() {
    if (!app) return;
    setDownloading(true);
    try {
      const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
      const W     = doc.internal.pageSize.getWidth();
      const c     = app.school.portal_primary_color || '#16A34A';
      const { r, g, b } = hexToRgb(c);

      // Header bar
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, W, 38, 'F');

      // Logo placeholder + school name
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text(app.school.school_name.toUpperCase(), W / 2, 18, { align: 'center' });
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text('ONLINE ADMISSION PORTAL', W / 2, 28, { align: 'center' });

      // Thin accent line
      doc.setFillColor(255, 255, 255, 0.3);
      doc.rect(0, 36, W, 2, 'F');

      doc.setTextColor(30, 30, 30);
      let y = 52;

      // Title
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.setTextColor(r, g, b);
      doc.text('OFFER OF ADMISSION', W / 2, y, { align: 'center' }); y += 3;

      // Divider
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(0.5);
      doc.line(W/2 - 40, y, W/2 + 40, y); y += 10;

      // Intro text
      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      const yr = `20${String(app.school.admission_year).padStart(2,'0')}`;
      const intro = `This is to certify that the following student has been offered admission to ${app.school.school_name} for the ${yr}/${parseInt(yr)+1} academic year, subject to verification of the information provided.`;
      doc.text(intro, 15, y, { maxWidth: W - 30, align: 'justify' }); y += 18;

      // Info card background
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(12, y - 3, W - 24, 68, 3, 3, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(12, y - 3, W - 24, 68, 3, 3, 'S');

      const rows: [string, string][] = [
        ['Admission Number', app.admission_number],
        ['Full Name',        app.full_name],
        ['Index Number',     app.index_number],
        ['Programme',        app.program_name ?? '—'],
        ['House',            app.house ?? 'To be assigned'],
        ['Residential Status', app.residential_status ?? '—'],
        ['Gender',           app.gender],
        ['Aggregate',        String(app.aggregate ?? '—')],
      ];

      const col1 = 18, col2 = 85;
      doc.setFontSize(9);
      let ry = y + 5;
      for (let i = 0; i < rows.length; i++) {
        const [label, value] = rows[i];
        if (i % 2 === 0 && i > 0) doc.setFillColor(241, 245, 249), doc.rect(12, ry - 3, W - 24, 8, 'F');
        doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
        doc.text(label, col1, ry);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
        doc.text(value, col2, ry);
        ry += 8;
      }
      y += 72;

      // Requirements
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(r, g, b);
      doc.text('REPORTING REQUIREMENTS', 15, y); y += 6;
      doc.setDrawColor(r, g, b); doc.setLineWidth(0.3);
      doc.line(15, y, W - 15, y); y += 6;

      const reqs = [
        'Report to the school on the designated reporting date with this admission letter.',
        'Bring your original BECE result slip for verification.',
        'Bring your Ghana Card or Birth Certificate (original and photocopy).',
        'Pay the required fees at the Finance Office upon arrival.',
        'Report on the date announced by the school authorities.',
      ];
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(50, 50, 50);
      for (const req of reqs) {
        doc.text(`•  ${req}`, 18, y, { maxWidth: W - 33 }); y += 8;
      }

      y += 4;
      // Signature line
      doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
      doc.line(15, y, 80, y);
      doc.setFontSize(8); doc.setTextColor(120, 120, 120);
      doc.text('Admissions Office', 15, y + 5);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, W - 15, y + 5, { align: 'right' });

      // Footer
      y += 18;
      doc.setFillColor(r, g, b);
      doc.rect(0, y, W, 16, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      const contact = [app.school.contact_phone, app.school.contact_email, app.school.contact_address].filter(Boolean).join('   |   ');
      doc.text(contact || app.school.school_name, W / 2, y + 7, { align: 'center' });
      doc.setFontSize(7); doc.setTextColor(255,255,255,0.7);
      doc.text('Powered by CAS School Management System', W / 2, y + 13, { align: 'center' });

      doc.save(`Admission_Letter_${app.admission_number}.pdf`);
    } finally { setDownloading(false); }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)' }}>
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-green-600 border-t-transparent animate-spin mx-auto" />
        <p className="text-sm text-slate-500 font-medium">Loading your application…</p>
      </div>
    </div>
  );
  if (error || !app) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <p className="text-slate-500">{error || 'Application not found.'}</p>
    </div>
  );

  const primary = app.school.portal_primary_color || '#16A34A';
  const accent  = app.school.portal_accent_color  || '#15803D';
  const { r, g, b } = hexToRgb(primary);
  const statusLabel = { completed: 'Submitted', reported: 'Reported to school', migrated: 'Enrolled' }[app.status] ?? app.status;

  const nextSteps = [
    { done: true,  text: 'Placement verified with CSSPS' },
    { done: true,  text: 'Admission form completed' },
    { done: true,  text: 'Documents uploaded' },
    { done: !!app.picture_url && !!app.bece_results_url, text: 'All documents verified' },
    { done: app.status === 'reported' || app.status === 'migrated', text: 'Reported to school' },
    { done: app.status === 'migrated', text: 'Enrolled & student account created' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Hero success banner */}
      <div className="relative overflow-hidden py-16 px-6" style={{ background: `linear-gradient(135deg, rgba(${r},${g},${b},0.97) 0%, rgba(${Math.max(0,r-20)},${Math.max(0,g-20)},${Math.max(0,b-20)},0.95) 100%)` }}>
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-white/5 blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          {/* Success icon */}
          <div className="inline-flex w-20 h-20 rounded-full bg-white/15 items-center justify-center mb-6 border-2 border-white/30 shadow-2xl">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-white/70 text-sm font-bold uppercase tracking-widest mb-2">Application {statusLabel}</p>
          <h1 className="text-3xl md:text-4xl font-black text-white">Congratulations, {app.full_name.split(' ')[0]}!</h1>
          <p className="mt-3 text-white/75 text-base max-w-md mx-auto">Your application has been received. Please save your admission number and download your documents below.</p>

          {/* Admission number badge */}
          <div className="mt-8 inline-flex flex-col items-center gap-1 px-8 py-4 rounded-3xl bg-white/15 backdrop-blur-sm border border-white/25 shadow-2xl">
            <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Your Admission Number</p>
            <p className="text-3xl font-black font-mono text-white tracking-widest">{app.admission_number}</p>
            <button onClick={() => navigator.clipboard.writeText(app.admission_number)} className="text-white/50 text-xs hover:text-white/80 transition-colors mt-1 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Tap to copy
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* Summary card */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-4 p-6 border-b border-slate-100">
            {app.picture_url
              ? <img src={app.picture_url} alt="Photo" className="w-20 h-20 rounded-2xl object-cover border border-slate-200 shadow-sm flex-shrink-0" />
              : <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0 text-2xl font-black text-slate-300">{app.full_name[0]}</div>
            }
            <div className="min-w-0">
              <p className="font-black text-xl text-slate-900">{app.full_name}</p>
              <p className="text-sm text-slate-400 font-mono mt-0.5">{app.index_number}</p>
              {app.house && (
                <span className="inline-flex items-center mt-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: primary }}>
                  {app.house} House
                </span>
              )}
            </div>
          </div>
          <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-4">
            {[
              ['Programme',        app.program_name],
              ['Residential',      app.residential_status],
              ['Gender',           app.gender],
              ['House',            app.house ?? 'To be assigned'],
              ['Guardian',         app.guardian_name],
              ['Guardian Mobile',  app.guardian_mobile],
            ].filter(([,v]) => v).map(([label, val]) => (
              <div key={String(label)}>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">{label}</p>
                <p className="font-bold text-slate-800 mt-0.5 text-sm">{val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Download buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={generateAdmissionLetter} disabled={downloading}
            className="flex items-center gap-3 p-4 rounded-3xl text-white font-bold shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-70"
            style={{ background: `linear-gradient(135deg,${primary},${accent})` }}>
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="font-black text-sm">Admission Letter</p>
              <p className="text-white/70 text-xs font-normal">Download PDF</p>
            </div>
          </button>

          {prospectusUrl ? (
            <a href={prospectusUrl} target="_blank"
              className="flex items-center gap-3 p-4 rounded-3xl font-bold bg-white border-2 border-slate-200 hover:border-slate-300 shadow-sm transition-all duration-200 hover:-translate-y-0.5">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `rgba(${r},${g},${b},0.1)` }}>
                <svg className="w-5 h-5" style={{ color: primary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-black text-sm text-slate-800">Prospectus</p>
                <p className="text-slate-400 text-xs font-normal">View & Download PDF</p>
              </div>
            </a>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-3xl bg-slate-50 border border-slate-200">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-sm text-slate-500">No Prospectus</p>
                <p className="text-slate-400 text-xs">Collect from school on arrival</p>
              </div>
            </div>
          )}
        </div>

        {/* Progress tracker */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h3 className="font-black text-slate-900 mb-5">Admission Progress</h3>
          <div className="space-y-3">
            {nextSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${s.done ? 'text-white' : 'bg-slate-100'}`}
                  style={s.done ? { backgroundColor: primary } : {}}>
                  {s.done
                    ? <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    : <div className="w-2 h-2 rounded-full bg-slate-300" />
                  }
                </div>
                {i < nextSteps.length - 1 && i === 0 && <div />}
                <p className={`text-sm font-semibold ${s.done ? 'text-slate-800' : 'text-slate-400'}`}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Important notice */}
        <div className="flex items-start gap-3 p-5 rounded-3xl bg-amber-50 border border-amber-200">
          <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <p className="font-black text-amber-800 text-sm mb-1">Important Reminder</p>
            <ul className="text-xs text-amber-700 space-y-1">
              <li>• Screenshot or print this page and your admission letter.</li>
              <li>• Report to the school with your original BECE results and Ghana Card.</li>
              <li>• Check the school notice board or website for the official reporting date.</li>
            </ul>
          </div>
        </div>

        <footer className="text-center text-xs text-slate-400 py-4">
          Powered by <span className="font-semibold text-slate-500">CAS School Management System</span>
        </footer>
      </div>
    </div>
  );
}
