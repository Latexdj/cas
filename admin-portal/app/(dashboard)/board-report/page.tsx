'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface AcademicYear { id: string; name: string; is_current: boolean; current_semester?: number; }
interface HistoryItem { id: string; period_label: string | null; finalized_at: string | null; created_at: string; }
interface ChatMsg { role: 'user' | 'assistant'; content: string; }

const C = {
  forest: '#0B3D2E', mid: '#145C44', gold: '#C8973A',
  bg: '#F5F0E8', card: '#FDFAF5', border: '#E2D9CC',
  dark: '#2C2218', mid2: '#4A3F32', muted: '#8C7E6E',
  danger: '#B83232', dangerBg: '#FEF2F2',
};

// Renders the plain-text report with its own ALL-CAPS section headers
// styled distinctly — same header convention the PDF renderer parses on.
function ReportView({ text }: { text: string }) {
  const isHeaderLine = (line: string) => {
    const t = line.trim();
    if (!t || t.length > 70) return false;
    return /[A-Z]/.test(t) && !/[a-z]/.test(t) && /^[A-Z0-9 &\-,']+$/.test(t);
  };
  return (
    <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, lineHeight: 1.7, color: C.dark }}>
      {text.split('\n').map((line, i) => (
        isHeaderLine(line)
          ? <div key={i} style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 800, fontSize: 13, letterSpacing: '0.03em', color: C.forest, borderBottom: `1.5px solid ${C.forest}`, paddingBottom: 4, margin: line.trim() ? '18px 0 8px' : 0 }}>{line.trim()}</div>
          : line.trim()
            ? <p key={i} style={{ margin: '0 0 4px' }}>{line}</p>
            : <div key={i} style={{ height: 8 }} />
      ))}
    </div>
  );
}

export default function BoardReportPage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [ayId, setAyId] = useState('');
  const [semester, setSemester] = useState<string>(''); // '' = full year
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const [sessionId, setSessionId] = useState('');
  const [report, setReport] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function load() {
      const [ayRes, histRes] = await Promise.allSettled([
        api.get<AcademicYear[]>('/api/academic-years'),
        api.get<HistoryItem[]>('/api/board-report/history'),
      ]);
      if (ayRes.status === 'fulfilled') {
        setAcademicYears(ayRes.value.data);
        const current = ayRes.value.data.find(a => a.is_current) ?? ayRes.value.data[0];
        if (current) setAyId(current.id);
      }
      if (histRes.status === 'fulfilled') setHistory(histRes.value.data);
    }
    load();
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, report]);

  async function generate() {
    if (!ayId) return;
    setGenerating(true); setError(''); setReport(''); setSessionId(''); setChatMessages([]);
    try {
      // Computing facts for a full academic year (two semesters' worth of
      // per-class result aggregation) plus the Claude call easily exceeds
      // the global 15s axios timeout — this used to surface as a generic
      // "Report generation failed" even when the backend was still working
      // (and often had already finished by the time the client gave up).
      const { data } = await api.post('/api/board-report/generate', {
        academic_year_id: ayId,
        semester: semester || undefined,
      }, { timeout: 120000 });
      setSessionId(data.session_id);
      setReport(data.report);
      setPeriodLabel(data.facts?.period?.period_label ?? '');
      const histRes = await api.get<HistoryItem[]>('/api/board-report/history');
      setHistory(histRes.data);
    } catch (err) {
      const e = err as { code?: string; response?: { data?: { error?: string } } };
      const msg = e.response?.data?.error
        ?? (e.code === 'ECONNABORTED' ? 'This is taking longer than expected. The report may still finish on the server — check Past Reports in a moment before generating again.' : undefined);
      setError(msg ?? 'Report generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function openPastSession(id: string) {
    setError(''); setChatMessages([]);
    try {
      const { data } = await api.get(`/api/letter-chat/${id}`);
      const lastAssistant = [...(data.messages ?? [])].reverse().find((m: ChatMsg) => m.role === 'assistant');
      setSessionId(id);
      setReport(lastAssistant?.content ?? '');
      setPeriodLabel(data.metadata?.period_label ?? '');
    } catch {
      setError('Could not open this report.');
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !sessionId) return;
    const content = chatInput.trim();
    setChatMessages(m => [...m, { role: 'user', content }]);
    setChatInput(''); setChatLoading(true); setChatError('');
    try {
      const { data } = await api.post(`/api/letter-chat/${sessionId}/message`, { content }, { timeout: 60000 });
      setChatMessages(m => [...m, { role: 'assistant', content: data.content }]);
      setReport(data.content);
    } catch {
      setChatError('Could not get a response. Please try again.');
      setChatMessages(m => m.slice(0, -1));
    } finally {
      setChatLoading(false);
    }
  }

  async function exportPdf() {
    if (!sessionId) return;
    setExporting(true);
    try {
      const response = await api.get(`/api/board-report/${sessionId}/pdf`, { responseType: 'blob', timeout: 60000 });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Board_Report_${(periodLabel || 'report').replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch {
      setError('Could not export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: C.forest, margin: '0 0 4px' }}>Board Report</h1>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 20px' }}>
        AI-drafted report for board discussion, grounded entirely in this school&apos;s own recorded data.
      </p>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 300px', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, background: C.card }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Period</p>
          <label style={{ display: 'block', fontSize: 12, color: C.mid2, marginBottom: 4 }}>Academic Year</label>
          <select value={ayId} onChange={e => setAyId(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, marginBottom: 12, color: C.dark, background: '#fff' }}>
            {academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name}{ay.is_current ? ' (Current)' : ''}</option>)}
          </select>

          <label style={{ display: 'block', fontSize: 12, color: C.mid2, marginBottom: 4 }}>Semester</label>
          <select value={semester} onChange={e => setSemester(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, marginBottom: 14, color: C.dark, background: '#fff' }}>
            <option value="">Full Academic Year</option>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>

          <button onClick={generate} disabled={generating || !ayId}
            style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: C.forest, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: (generating || !ayId) ? 0.6 : 1 }}>
            {generating ? 'Generating…' : 'Generate Report'}
          </button>
          {error && <p style={{ fontSize: 12, color: C.danger, marginTop: 10 }}>{error}</p>}

          {history.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Past Reports</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                {history.map(h => (
                  <button key={h.id} onClick={() => openPastSession(h.id)}
                    style={{ textAlign: 'left', padding: '7px 9px', borderRadius: 7, border: `1px solid ${sessionId === h.id ? C.forest : C.border}`, background: sessionId === h.id ? '#E8F4EE' : '#fff', fontSize: 12, color: C.dark, cursor: 'pointer' }}>
                    {h.period_label ?? 'Report'}
                    <div style={{ fontSize: 10, color: C.muted }}>{new Date(h.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {!report && !generating && (
            <div style={{ border: `1px dashed ${C.border}`, borderRadius: 12, padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>
              Choose a period and click Generate Report to draft a board report from this school&apos;s own data.
            </div>
          )}
          {generating && (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 40, textAlign: 'center', color: C.muted, fontSize: 13, background: C.card }}>
              Analysing the period and drafting the report. This can take a little while.
            </div>
          )}
          {report && (
            <>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 22px', background: '#fff', marginBottom: 14 }}>
                <ReportView text={report} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <button onClick={exportPdf} disabled={exporting}
                  style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.forest}`, background: '#fff', color: C.forest, fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: exporting ? 0.6 : 1 }}>
                  {exporting ? 'Exporting…' : 'Export PDF'}
                </button>
              </div>

              <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 320 }}>
                <div style={{ background: C.mid, padding: '8px 12px' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Refine with AI</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: C.bg }}>
                  {chatMessages.length === 0 && (
                    <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                      Ask for changes, e.g. &quot;shorten the discipline section&quot; or &quot;emphasize the pass rate improvement&quot;.
                    </p>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '85%', padding: '8px 11px', borderRadius: 10, fontSize: 12, lineHeight: 1.6,
                        background: m.role === 'user' ? C.mid : '#fff',
                        color: m.role === 'user' ? '#fff' : C.dark,
                        border: m.role === 'assistant' ? `1px solid ${C.border}` : 'none',
                        whiteSpace: 'pre-wrap',
                      }}>{m.role === 'assistant' ? 'Report updated above.' : m.content}</div>
                    </div>
                  ))}
                  {chatLoading && <div style={{ alignSelf: 'flex-start', fontSize: 12, color: C.muted }}>Revising…</div>}
                  <div ref={endRef} />
                </div>
                {chatError && <div style={{ padding: '4px 12px', background: C.dangerBg, fontSize: 11, color: C.danger }}>{chatError}</div>}
                <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: `1px solid ${C.border}`, background: '#fff' }}>
                  <textarea
                    value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder="Ask for a change… (Shift+Enter for new line)"
                    rows={1}
                    style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12, outline: 'none', color: C.dark, background: C.bg, resize: 'none', fontFamily: 'inherit' }}
                  />
                  <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: C.mid, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: (chatLoading || !chatInput.trim()) ? 0.5 : 1 }}>
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
