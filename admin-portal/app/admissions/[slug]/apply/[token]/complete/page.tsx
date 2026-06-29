'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  form_completed_at: string | null;
  school: {
    school_name: string; portal_primary_color: string;
    portal_logo_url: string | null; admission_year: number;
    contact_phone: string | null; contact_email: string | null;
    contact_address: string | null;
  };
}

export default function CompletePage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const router          = useRouter();
  const [app,     setApp]     = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [prospectusUrl, setProspectusUrl] = useState<string | null>(null);

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
    const doc   = new jsPDF({ unit: 'mm', format: 'a4' });
    const W     = doc.internal.pageSize.getWidth();
    const line  = (y: number) => { doc.line(15, y, W - 15, y); return y + 6; };
    const c     = app.school.portal_primary_color || '#16A34A';
    const [cr, cg, cb] = [parseInt(c.slice(1,3), 16), parseInt(c.slice(3,5), 16), parseInt(c.slice(5,7), 16)];

    doc.setFillColor(cr, cg, cb);
    doc.rect(0, 0, W, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(app.school.school_name, W / 2, 14, { align: 'center' });
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text('ADMISSION LETTER', W / 2, 23, { align: 'center' });

    doc.setTextColor(30, 30, 30);
    let y = 45;

    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('OFFER OF ADMISSION', W / 2, y, { align: 'center' }); y += 10;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    const yr = `20${String(app.school.admission_year).padStart(2,'0')}`;
    doc.text(`This is to confirm that the following student has been admitted to ${app.school.school_name} for the academic year ${yr}/${parseInt(yr)+1}.`, 15, y, { maxWidth: W - 30 }); y += 15;

    y = line(y);
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
    for (const [label, value] of rows) {
      doc.setFont('helvetica', 'bold'); doc.text(label + ':', 15, y);
      doc.setFont('helvetica', 'normal'); doc.text(value, 85, y);
      y += 7;
    }
    y = line(y) + 4;

    doc.setFont('helvetica', 'bold');
    doc.text('REQUIREMENTS:', 15, y); y += 6;
    doc.setFont('helvetica', 'normal');
    const reqs = [
      '1. Report to the school with this admission letter.',
      '2. Bring your original BECE result slip for verification.',
      '3. Bring your Ghana Card or Birth Certificate.',
      '4. Report on the designated date announced by the school.',
    ];
    for (const r of reqs) { doc.text(r, 15, y, { maxWidth: W - 30 }); y += 7; }

    y += 4;
    doc.setFillColor(cr, cg, cb);
    doc.rect(0, y, W, 12, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9);
    const contact = [app.school.contact_phone, app.school.contact_email, app.school.contact_address].filter(Boolean).join('  |  ');
    doc.text(contact || app.school.school_name, W / 2, y + 7, { align: 'center' });

    doc.save(`Admission_Letter_${app.admission_number}.pdf`);
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
    </div>
  );
  if (error || !app) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <p className="text-slate-500">{error || 'Application not found.'}</p>
    </div>
  );

  const primary = app.school.portal_primary_color || '#16A34A';
  const statusLabel = { completed: 'Submitted', reported: 'Reported to school', migrated: 'Enrolled' }[app.status] ?? app.status;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Success banner */}
        <div className="rounded-2xl text-white p-8 text-center space-y-2" style={{ backgroundColor: primary }}>
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-2xl font-bold">Application {statusLabel}!</p>
          <p className="text-white/80 text-sm">Your application has been received. Please save your admission number below.</p>
        </div>

        {/* Details card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-4">
            {app.picture_url && (
              <img src={app.picture_url} alt="Photo" className="w-20 h-20 rounded-xl object-cover border border-slate-200" />
            )}
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Admission Number</p>
              <p className="text-2xl font-bold font-mono" style={{ color: primary }}>{app.admission_number}</p>
              <p className="text-sm text-slate-600 mt-1">{app.full_name}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-t border-slate-100 pt-4">
            {[
              ['Programme',   app.program_name],
              ['House',       app.house ?? 'To be assigned'],
              ['Residential', app.residential_status],
              ['Gender',      app.gender],
              ['Guardian',    app.guardian_name],
              ['Index No.',   app.index_number],
            ].map(([label, val]) => val ? (
              <div key={String(label)}>
                <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
                <p className="font-semibold text-slate-800">{val}</p>
              </div>
            ) : null)}
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={generateAdmissionLetter}
            className="flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: primary }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Admission Letter
          </button>
          {prospectusUrl ? (
            <a href={prospectusUrl} target="_blank"
              className="flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Download Prospectus
            </a>
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 rounded-xl text-slate-400 bg-slate-50 border border-slate-200 text-sm">
              No prospectus available for your programme. Please collect from school.
            </div>
          )}
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 space-y-1">
          <p className="font-semibold">Important</p>
          <p>Please screenshot or print this page. Report to the school with your admission letter and original BECE results.</p>
        </div>

        <footer className="text-center text-xs text-slate-400 py-4">
          Powered by CAS School Management System
        </footer>
      </div>
    </div>
  );
}
