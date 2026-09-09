'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useTableControls } from '@/hooks/useTableControls';
import { Pagination, Th } from '@/components/ui/Pagination';
import jsPDF from 'jspdf';

interface Application {
  id: string; index_number: string | null; admission_number: string; form_token: string;
  full_name: string; gender: string; aggregate: number | null; program_name: string | null;
  house: string | null; residential_status: string | null; status: string;
  admission_type: string; direct_reason: string | null;
  mobile_number: string | null; date_of_birth: string | null;
  guardian_name: string | null; guardian_mobile: string | null; guardian_relationship: string | null;
  hometown: string | null; ghana_card_number: string | null; nhia_number: string | null;
  religion: string | null; picture_url: string | null; bece_results_url: string | null;
  created_at: string; form_completed_at: string | null; reported_at: string | null;
  total_count?: number;
}
interface Stats {
  total: number; pending: number; completed: number; reported: number; migrated: number;
  total_placed: number; total_registered: number; direct: number;
}
interface Program { id: string; name: string; }

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Pending',   bg: '#F1F5F9', color: '#64748B' },
  completed: { label: 'Completed', bg: '#DBEAFE', color: '#1D4ED8' },
  reported:  { label: 'Reported',  bg: '#DCFCE7', color: '#145C44' },
  migrated:  { label: 'Migrated',  bg: '#F3E8FF', color: '#7C3AED' },
};

const DIRECT_REASONS = [
  'Walk-in (student physically walked in seeking admission)',
  'Protocol/Vacancy (admitted through school protocol)',
  'Transfer from another school',
  'Other',
];

const RELIGIONS = ['Christianity', 'Islam', 'Traditional', 'Other'];

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

const BLANK_FORM = {
  full_name: '', date_of_birth: '', gender: '', hometown: '', residential_address: '',
  mobile_number: '', ghana_card_number: '', nhia_number: '', religion: '',
  religious_denomination: '', aggregate: '', residential_status: '', index_number: '',
  program_id: '', direct_reason: '',
  guardian_name: '', guardian_relationship: '', guardian_occupation: '', guardian_mobile: '',
};

export default function ApplicationsPage() {
  const [rows,       setRows]       = useState<Application[]>([]);
  const [total,      setTotal]      = useState(0);
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [programs,   setPrograms]   = useState<Program[]>([]);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [statusF,    setStatusF]    = useState('');
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<Application | null>(null);
  const [migModal,   setMigModal]   = useState(false);
  const [defClass,   setDefClass]   = useState('1');
  const [migrating,  setMigrating]  = useState(false);
  const [migResult,  setMigResult]  = useState<{ migrated: number; skipped: number; errors: { name: string; error: string }[] } | null>(null);

  const [printingId,   setPrintingId]  = useState<string | null>(null);

  // Direct admission modal state
  const [directModal, setDirectModal] = useState(false);
  const [directForm,  setDirectForm]  = useState(BLANK_FORM);
  const [directSaving, setDirectSaving] = useState(false);
  const [directError,  setDirectError]  = useState('');

  const loadStats = useCallback(async () => {
    try { const { data } = await api.get('/api/admin/admissions/stats'); setStats(data); } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/admissions/applications', {
        params: { search, status: statusF || undefined, page },
      });
      setRows(data.data); setTotal(data.total);
    } finally { setLoading(false); }
  }, [search, statusF, page]);

  useEffect(() => { load(); loadStats(); }, [load, loadStats]);

  useEffect(() => {
    api.get('/api/programs').then(({ data }) => setPrograms(data)).catch(() => {});
  }, []);

  async function markReported(id: string) {
    await api.patch(`/api/admin/admissions/applications/${id}`, { status: 'reported' });
    load(); loadStats();
    if (selected?.id === id) setSelected(s => s ? { ...s, status: 'reported' } : s);
  }

  async function del(id: string) {
    if (!confirm('Delete this application? This cannot be undone.')) return;
    await api.delete(`/api/admin/admissions/applications/${id}`);
    setSelected(null); load(); loadStats();
  }

  async function migrateSingle(id: string) {
    setMigrating(true);
    try {
      await api.post(`/api/admin/admissions/applications/${id}/migrate`, { default_class: defClass });
      load(); loadStats(); setSelected(null); setMigModal(false);
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Migration failed');
    } finally { setMigrating(false); }
  }

  async function migrateBulk() {
    setMigrating(true); setMigResult(null);
    try {
      const { data } = await api.post('/api/admin/admissions/applications/migrate-bulk', { default_class: defClass });
      setMigResult(data); load(); loadStats();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Migration failed');
    } finally { setMigrating(false); }
  }

  async function submitDirect() {
    setDirectError('');
    setDirectSaving(true);
    try {
      await api.post('/api/admin/admissions/applications/manual', directForm);
      setDirectModal(false);
      setDirectForm(BLANK_FORM);
      load(); loadStats();
    } catch (err: unknown) {
      setDirectError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save admission.');
    } finally { setDirectSaving(false); }
  }

  function setDF(field: string, value: string) {
    setDirectForm(f => ({ ...f, [field]: value }));
  }

  async function printLetter(appId: string) {
    setPrintingId(appId);
    try {
      const { data } = await api.get(`/api/admin/admissions/applications/${appId}/letter-data`);
      const { application: a, school: sch, prospectus_url } = data;

      const hexToRgb = (hex: string) => {
        const h = (hex || '#16A34A').replace('#', '');
        return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
      };
      const { r, g, b } = hexToRgb(sch.primary_color);

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const W   = doc.internal.pageSize.getWidth();

      // Header bar
      doc.setFillColor(r, g, b);
      doc.rect(0, 0, W, 38, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18); doc.setFont('helvetica', 'bold');
      doc.text((sch.school_name ?? 'School').toUpperCase(), W / 2, 18, { align: 'center' });
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text('ADMISSION OFFICE', W / 2, 28, { align: 'center' });

      doc.setTextColor(30, 30, 30);
      let y = 52;

      // Title
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.setTextColor(r, g, b);
      doc.text('OFFER OF ADMISSION', W / 2, y, { align: 'center' }); y += 3;
      doc.setDrawColor(r, g, b); doc.setLineWidth(0.5);
      doc.line(W/2 - 40, y, W/2 + 40, y); y += 10;

      // Intro text
      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      const yr = `20${String(sch.admission_year).padStart(2,'0')}`;
      doc.text(
        `This is to certify that the following student has been offered admission to ${sch.school_name} for the ${yr}/${parseInt(yr)+1} academic year, subject to verification of the information provided.`,
        15, y, { maxWidth: W - 30, align: 'justify' }
      ); y += 18;

      // Info card
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(12, y - 3, W - 24, 72, 3, 3, 'F');
      doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
      doc.roundedRect(12, y - 3, W - 24, 72, 3, 3, 'S');

      const rows: [string, string][] = [
        ['Admission Number',   a.admission_number],
        ['Full Name',          a.full_name],
        ['Index Number',       a.index_number ?? (a.admission_type === 'direct' ? 'N/A (Direct Admission)' : '—')],
        ['Programme',          a.program_name ?? '—'],
        ['House',              a.house ?? 'To be assigned'],
        ['Residential Status', a.residential_status ?? '—'],
        ['Gender',             a.gender],
        ['Aggregate',          String(a.aggregate ?? '—')],
      ];
      const col1 = 18, col2 = 88;
      doc.setFontSize(9);
      let ry = y + 5;
      for (let i = 0; i < rows.length; i++) {
        const [label, value] = rows[i];
        if (i % 2 === 0 && i > 0) { doc.setFillColor(241, 245, 249); doc.rect(12, ry - 3, W - 24, 8, 'F'); }
        doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
        doc.text(label, col1, ry);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
        doc.text(value, col2, ry);
        ry += 8;
      }
      y += 76;

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
      for (const req of reqs) { doc.text(`•  ${req}`, 18, y, { maxWidth: W - 33 }); y += 8; }

      y += 4;
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
      const contact = [sch.contact_phone, sch.contact_email, sch.contact_address].filter(Boolean).join('   |   ');
      doc.text(contact || (sch.school_name ?? ''), W / 2, y + 7, { align: 'center' });
      doc.setFontSize(7);
      doc.text('Powered by CAS School Management System', W / 2, y + 13, { align: 'center' });

      doc.save(`Admission_Letter_${a.admission_number}.pdf`);

      if (prospectus_url) window.open(prospectus_url, '_blank');
    } catch {
      alert('Failed to load letter data. Please try again.');
    } finally {
      setPrintingId(null);
    }
  }

  const pages = Math.ceil(total / 50);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Applications</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage admission applications from prospective students.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setDirectForm(BLANK_FORM); setDirectError(''); setDirectModal(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            + Add Direct Admission
          </button>
          <Button onClick={() => setMigModal(true)} disabled={!stats?.reported}>
            Migrate Reported → Students
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: 'Placed',      val: stats.total_placed,     color: '#64748B' },
            { label: 'Registered',  val: stats.total_registered, color: '#0284C7' },
            { label: 'Pending',     val: stats.pending,          color: '#94A3B8' },
            { label: 'Completed',   val: stats.completed,        color: '#1D4ED8' },
            { label: 'Reported',    val: stats.reported,         color: '#145C44' },
            { label: 'Migrated',    val: stats.migrated,         color: '#7C3AED' },
            { label: 'Direct',      val: stats.direct,           color: '#D97706' },
            { label: 'Total Apps',  val: stats.total,            color: '#1C1208' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 text-center">
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search name, index, admission no…"
          className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
        <select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="reported">Reported</option>
          <option value="migrated">Migrated</option>
        </select>
        <span className="text-xs text-slate-400">{total} application{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>{['Admission No.','Name','Index No.','Program','House','Status','Date','Actions'].map(h =>
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold font-medium text-slate-400">{h}</th>
            )}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center">
                <div className="w-6 h-6 rounded-full border-4 border-green-600 border-t-transparent animate-spin mx-auto" />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">No applications found.</td></tr>
            ) : rows.map(r => {
              const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.pending;
              const isDirect = r.admission_type === 'direct';
              return (
                <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{r.admission_number || '—'}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{r.full_name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.index_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.program_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.house || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                      {isDirect && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Direct</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 flex-wrap">
                      {r.status === 'completed' && (
                        <Button size="sm" onClick={() => markReported(r.id)}>Reported</Button>
                      )}
                      {r.status === 'reported' && (
                        <Button size="sm" onClick={() => { setSelected(r); setMigModal(true); }}>Migrate</Button>
                      )}
                      {['completed','reported','migrated'].includes(r.status) && (
                        <Button size="sm" variant="secondary" onClick={() => printLetter(r.id)} loading={printingId === r.id}>Letter</Button>
                      )}
                      <Button variant="danger" size="sm" onClick={() => del(r.id)}>Del</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}>Prev</Button>
          <span className="text-xs text-slate-500">Page {page} of {pages}</span>
          <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.min(pages,p+1))} disabled={page===pages}>Next</Button>
        </div>
      )}

      {/* Detail modal */}
      <Modal open={!!selected && !migModal} onClose={() => setSelected(null)} title="Application Detail" maxWidth="max-w-2xl">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {selected.picture_url && (
                <img src={selected.picture_url} alt="Photo" className="w-20 h-20 rounded-xl object-cover border border-slate-200" />
              )}
              <div>
                <p className="text-xl font-bold text-slate-900">{selected.full_name}</p>
                <p className="text-sm text-slate-500 font-mono">{selected.admission_number}</p>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: STATUS_CFG[selected.status]?.bg, color: STATUS_CFG[selected.status]?.color }}>
                    {STATUS_CFG[selected.status]?.label}
                  </span>
                  {selected.admission_type === 'direct' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Direct Admission</span>
                  )}
                </div>
                {selected.direct_reason && (
                  <p className="text-xs text-amber-700 mt-1">Reason: {selected.direct_reason}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ['Index Number', selected.index_number],
                ['Gender', selected.gender],
                ['Date of Birth', fmtDate(selected.date_of_birth)],
                ['Program', selected.program_name],
                ['House', selected.house],
                ['Residential Status', selected.residential_status],
                ['Mobile', selected.mobile_number],
                ['Hometown', selected.hometown],
                ['Ghana Card', selected.ghana_card_number],
                ['NHIA No.', selected.nhia_number],
                ['Religion', selected.religion],
                ['Aggregate', selected.aggregate],
                ['Guardian', selected.guardian_name],
                ['Guardian Rel.', selected.guardian_relationship],
                ['Guardian Mobile', selected.guardian_mobile],
                ['Applied', fmtDate(selected.created_at)],
              ].map(([label, val]) => val ? (
                <div key={String(label)}>
                  <p className="text-xs text-slate-400 font-medium">{label}</p>
                  <p className="font-medium text-slate-800">{val}</p>
                </div>
              ) : null)}
            </div>
            {selected.bece_results_url && (
              <a href={selected.bece_results_url} target="_blank" className="text-sm text-[#145C44] underline">View BECE Results Slip</a>
            )}
            <div className="flex gap-2 pt-2 flex-wrap">
              {selected.status === 'completed' && (
                <Button onClick={() => markReported(selected.id)}>Mark as Reported</Button>
              )}
              {selected.status === 'reported' && (
                <Button onClick={() => setMigModal(true)}>Migrate to Students</Button>
              )}
              {['completed','reported','migrated'].includes(selected.status) && (
                <Button variant="secondary" onClick={() => printLetter(selected.id)} loading={printingId === selected.id}>
                  Print Admission Letter
                </Button>
              )}
              <Button variant="danger" onClick={() => del(selected.id)}>Delete Application</Button>
              <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Migration modal */}
      <Modal open={migModal} onClose={() => { setMigModal(false); setMigResult(null); }} title="Migrate to Students" maxWidth="max-w-md">
        <div className="space-y-4">
          {selected?.status === 'reported' ? (
            <p className="text-sm text-slate-600">Migrate <strong>{selected.full_name}</strong> to the main students table.</p>
          ) : (
            <p className="text-sm text-slate-600">Migrate <strong>all {stats?.reported ?? 0} reported</strong> students to the main students table. Students will receive login credentials (default password: <span className="font-mono">Student123</span>).</p>
          )}
          <div>
            <label className="text-xs font-semibold font-medium text-slate-500">Default Class Assignment</label>
            <input value={defClass} onChange={e => setDefClass(e.target.value)}
              placeholder="e.g. 1A or 1"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" />
            <p className="mt-1 text-xs text-slate-400">Students can be moved to specific classes in the Student roster afterwards.</p>
          </div>
          {migResult && (
            <div className="rounded-lg bg-[#E8F4EE] border border-[#B8D9C8] px-4 py-3 text-sm text-[#0B3D2E]">
              <p className="font-semibold">{migResult.migrated} student{migResult.migrated !== 1 ? 's' : ''} migrated successfully.</p>
              {migResult.skipped > 0 && <p className="text-amber-700">{migResult.skipped} skipped.</p>}
              {migResult.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e.name}: {e.error}</p>)}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setMigModal(false); setMigResult(null); }}>Close</Button>
            <Button onClick={selected?.status === 'reported' ? () => migrateSingle(selected.id) : migrateBulk} loading={migrating}>
              {selected?.status === 'reported' ? 'Migrate Student' : 'Migrate All Reported'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Direct Admission modal */}
      <Modal open={directModal} onClose={() => setDirectModal(false)} title="Add Direct Admission" maxWidth="max-w-2xl">
        <div className="space-y-5">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            For students who physically walked in for admission or were admitted through protocol/vacancy. An admission number will be auto-generated. Status is set to <strong>Completed</strong> since the student has collected their admission letter.
          </div>

          {/* Personal Info */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Personal Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-500">Full Name <span className="text-red-500">*</span></label>
                <input value={directForm.full_name} onChange={e => setDF('full_name', e.target.value)}
                  placeholder="e.g. Kwame Mensah"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Gender <span className="text-red-500">*</span></label>
                <select value={directForm.gender} onChange={e => setDF('gender', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Date of Birth</label>
                <input type="date" value={directForm.date_of_birth} onChange={e => setDF('date_of_birth', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Hometown</label>
                <input value={directForm.hometown} onChange={e => setDF('hometown', e.target.value)}
                  placeholder="e.g. Accra"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Mobile Number</label>
                <input value={directForm.mobile_number} onChange={e => setDF('mobile_number', e.target.value)}
                  placeholder="e.g. 0244000000"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Ghana Card No.</label>
                <input value={directForm.ghana_card_number} onChange={e => setDF('ghana_card_number', e.target.value)}
                  placeholder="GHA-XXXXXXXXX-X"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">NHIA No.</label>
                <input value={directForm.nhia_number} onChange={e => setDF('nhia_number', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Religion</label>
                <select value={directForm.religion} onChange={e => setDF('religion', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Select religion</option>
                  {RELIGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Residential Address</label>
                <input value={directForm.residential_address} onChange={e => setDF('residential_address', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>
          </div>

          {/* Academic */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Academic Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Program <span className="text-red-500">*</span></label>
                <select value={directForm.program_id} onChange={e => setDF('program_id', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Select program</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Residential Status <span className="text-red-500">*</span></label>
                <select value={directForm.residential_status} onChange={e => setDF('residential_status', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Select status</option>
                  <option value="Boarding">Boarding</option>
                  <option value="Day">Day</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Aggregate</label>
                <input type="number" min="6" max="36" value={directForm.aggregate} onChange={e => setDF('aggregate', e.target.value)}
                  placeholder="e.g. 12"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">BECE Index No. <span className="text-xs text-slate-400">(optional)</span></label>
                <input value={directForm.index_number} onChange={e => setDF('index_number', e.target.value)}
                  placeholder="12-character index number"
                  maxLength={12}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>
          </div>

          {/* Guardian */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Guardian / Parent</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Guardian Name</label>
                <input value={directForm.guardian_name} onChange={e => setDF('guardian_name', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Relationship</label>
                <input value={directForm.guardian_relationship} onChange={e => setDF('guardian_relationship', e.target.value)}
                  placeholder="e.g. Father, Mother, Uncle"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Guardian Mobile</label>
                <input value={directForm.guardian_mobile} onChange={e => setDF('guardian_mobile', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Occupation</label>
                <input value={directForm.guardian_occupation} onChange={e => setDF('guardian_occupation', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>
          </div>

          {/* Admission Reason */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Admission Details</p>
            <div>
              <label className="text-xs font-semibold text-slate-500">Reason for Direct Admission <span className="text-red-500">*</span></label>
              <select value={directForm.direct_reason} onChange={e => setDF('direct_reason', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">Select reason</option>
                {DIRECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {directError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{directError}</div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setDirectModal(false)}>Cancel</Button>
            <button
              onClick={submitDirect}
              disabled={directSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {directSaving ? 'Saving…' : 'Create Admission'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
