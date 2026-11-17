import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { downloadAndShare, isPickError, pickFile, uploadSheet } from '@/lib/files';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, Loading, Notice, Picker, Row, Screen, Title, errText } from '@/components/ui/kit';

interface Year { id: string; name: string }
interface ExamRow { student_id: string; student_code: string; name: string; score: number | null; max_score: number | null }
interface Remark { student_id: string; name: string; remarks: string }
import type { UploadResult as Upload } from '@/lib/files';
const LOCKED = ['submitted', 'hod_approved', 'final_approved', 'published'];
const STATUS_TEXT: Record<string, string> = { submitted: 'submitted to your HOD', hod_approved: 'approved by your HOD', final_approved: 'given final approval', published: 'published' };
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function ExamScoresScreen() {
  const C = useTheme();
  const p = useLocalSearchParams<{ subject: string; class_name: string; year_id: string; semester: string; year_name: string }>();
  const { subject, class_name } = p;
  const [years, setYears] = useState<Year[]>([]);
  const [yearId, setYearId] = useState(p.year_id);
  const [sem, setSem] = useState(p.semester || '1');
  const [rows, setRows] = useState<ExamRow[] | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [max, setMax] = useState('');
  const [status, setStatus] = useState('draft');
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [remarksDirty, setRemarksDirty] = useState(false);
  const [showRemarks, setShowRemarks] = useState(false);
  const [ai, setAi] = useState<Record<string, { busy?: boolean; text?: string; err?: string }>>({});
  const [aiUsed, setAiUsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const refs = useRef<Record<string, TextInput | null>>({});
  const locked = LOCKED.includes(status);

  const load = useCallback(async () => {
    if (!yearId || !sem || !subject || !class_name) return;
    setRows(null);
    try {
      const { data } = await api.get<ExamRow[]>('/api/exam-scores', { params: { academic_year_id: yearId, semester: sem, subject, class_name } });
      setRows(data ?? []);
      setScores(Object.fromEntries((data ?? []).map(r => [r.student_id, r.score != null ? String(r.score) : ''])));
      const m = (data ?? []).find(r => r.max_score != null)?.max_score; setMax(m != null ? String(m) : '');
    } catch (e) { setRows([]); setMsg({ text: errText(e, 'Could not load exam scores.'), tone: 'bad' }); }
    api.get<{ subject: string; class_name: string; status: string }[]>('/api/result-submissions/my-status', { params: { academic_year_id: yearId, semester: sem } })
      .then(r => setStatus(r.data.find(s => s.subject === subject && s.class_name === class_name)?.status ?? 'draft')).catch(() => {});
    api.get<Remark[]>('/api/assessments/subject-remarks', { params: { academic_year_id: yearId, semester: sem, subject, class_name } })
      .then(r => { setRemarks(r.data.map(x => ({ ...x, remarks: x.remarks ?? '' }))); setRemarksDirty(false); }).catch(() => {});
  }, [yearId, sem, subject, class_name]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get<Year[]>('/api/academic-years').then(r => setYears(r.data ?? [])).catch(() => {}); }, []);

  async function save() {
    if (!max || parseFloat(max) <= 0) { setMsg({ text: 'Enter the highest score for the exam first.', tone: 'bad' }); return; }
    setBusy('save'); setMsg(null);
    try {
      await api.post('/api/exam-scores', {
        academic_year_id: yearId, semester: parseInt(sem, 10), subject, class_name, max_score: parseFloat(max),
        scores: (rows ?? []).map(r => ({ student_id: r.student_id, score: scores[r.student_id] !== '' ? parseFloat(scores[r.student_id]) : null })),
      });
      setMsg({ text: `Exam scores saved at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`, tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not save the scores.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function template() {
    setBusy('template');
    const qs = new URLSearchParams({ academic_year_id: yearId, semester: sem, subject, class_name }).toString();
    const e = await downloadAndShare(`/api/exam-scores/template?${qs}`, `${subject}_${class_name}_sem${sem}_exam.xlsx`.replace(/[^\w.]+/g, '_'), XLSX);
    if (e) setMsg({ text: e, tone: 'bad' });
    setBusy(null);
  }
  async function uploadFile() {
    const f = await pickFile([XLSX, 'application/vnd.ms-excel'], 10);
    if (isPickError(f)) { setMsg({ text: f.error, tone: 'bad' }); return; }
    if (!f) return;
    setBusy('upload'); setMsg(null); setUpload(null);
    try {
      const { data } = await uploadSheet('/api/exam-scores/upload-scores', f, { academic_year_id: yearId, semester: sem, subject, class_name });
      setUpload(data); load();
    } catch (e) {
      const body = (e as { response?: { data?: Partial<Upload> & { error?: string } } }).response?.data;
      setMsg({ text: body?.error ?? errText(e, 'The upload did not work.'), tone: 'bad' });
      if (body?.errors?.length) setUpload({ saved: body.saved ?? 0, skipped: body.skipped ?? 0, errors: body.errors });
    } finally { setBusy(null); }
  }
  async function draft(id: string) {
    setAi(p => ({ ...p, [id]: { busy: true } }));
    try { const { data } = await api.post<{ draft: string }>('/api/ai/draft-remark', { student_id: id, academic_year_id: yearId, semester: parseInt(sem, 10), track: 'secondary_subject', subject }); setAi(p => ({ ...p, [id]: { text: data.draft } })); }
    catch (e) { setAi(p => ({ ...p, [id]: { err: errText(e, 'No draft available. Write the remark yourself.') } })); }
  }
  async function saveRemarks() {
    setBusy('remarks');
    try {
      await api.post('/api/assessments/subject-remarks', { academic_year_id: yearId, semester: sem, subject, class_name, remarks: remarks.map(r => ({ student_id: r.student_id, remarks: r.remarks || null, ai_drafted: aiUsed.has(r.student_id) })) });
      setRemarksDirty(false); setMsg({ text: 'Remarks saved.', tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'Could not save the remarks.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }
  const setRemark = (id: string, v: string) => { setRemarks(rs => rs.map(r => (r.student_id === id ? { ...r, remarks: v } : r))); setRemarksDirty(true); };

  return (
    <Screen>
      <Title sub={`${subject}, ${class_name}`}>End-of-semester exam</Title>
      <Card>
        {years.length > 0 && <Picker label="Academic year" value={yearId} options={years.map(y => ({ key: y.id, label: y.name }))} onChange={setYearId} />}
        <ChoiceChips label="Semester" value={sem} onChange={setSem} options={[{ key: '1', label: 'Semester 1' }, { key: '2', label: 'Semester 2' }]} />
        <Field label="Highest score for the exam" value={max} onChangeText={setMax} keyboardType="decimal-pad" editable={!locked} placeholder="For example 100" />
      </Card>
      {locked && <Notice tone="info" text={`These scores are locked because the results are ${STATUS_TEXT[status] ?? status}. Ask your HOD or the admin to unlock them.`} />}
      <Row>
        <Button label="Excel template" kind="secondary" icon="download-outline" grow busy={busy === 'template'} onPress={template} />
        <Button label="Upload filled sheet" kind="secondary" icon="cloud-upload-outline" grow busy={busy === 'upload'} disabled={locked} onPress={uploadFile} />
      </Row>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {upload && (
        <Card>
          <Row>
            <Chip label={`${upload.saved} saved`} tone="ok" />
            {upload.skipped > 0 && <Chip label={`${upload.skipped} empty rows skipped`} />}
            {upload.errors.length > 0 && <Chip label={`${upload.errors.length} problems`} tone="bad" />}
          </Row>
          {upload.errors.map((e, i) => <Body key={i} small style={{ color: C.danger }}>Row {e.row}: {e.message}</Body>)}
          <Button label="Close" kind="quiet" onPress={() => setUpload(null)} style={{ alignSelf: 'flex-start' }} />
        </Card>
      )}
      {rows === null ? <Loading /> : rows.length === 0 ? <Empty icon="people-outline" title="No students found" /> : (
        <>
          <Card>
            {rows.map((r, i) => (
              <View key={r.student_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderColor: C.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{r.name}</Text>
                  <Body small soft>{r.student_code}</Body>
                </View>
                <TextInput ref={x => { refs.current[r.student_id] = x; }} value={scores[r.student_id] ?? ''} editable={!locked}
                  onChangeText={v => setScores(s => ({ ...s, [r.student_id]: v }))} keyboardType="decimal-pad" placeholder={max ? `of ${max}` : ''} placeholderTextColor={C.placeholder}
                  accessibilityLabel={`Score for ${r.name}`} returnKeyType={i < rows.length - 1 ? 'next' : 'done'}
                  onSubmitEditing={() => { const n = rows[i + 1]; if (n) refs.current[n.student_id]?.focus(); }}
                  style={{ width: 84, minHeight: 44, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, textAlign: 'center', fontSize: 16, fontWeight: '700', color: C.text, backgroundColor: locked ? C.bg : C.surface }} />
              </View>
            ))}
          </Card>
          {!locked && <Button label="Save scores" busy={busy === 'save'} onPress={save} />}
          <Card>
            <Row style={{ alignItems: 'center' }}>
              <View style={{ flex: 1 }}><Title sub="Optional feedback students see with their results.">Subject remarks</Title></View>
              <Button label={showRemarks ? 'Hide' : 'Show'} kind="quiet" onPress={() => setShowRemarks(v => !v)} />
            </Row>
            {showRemarks && remarks.map(r => {
              const a = ai[r.student_id] ?? {};
              return (
                <View key={r.student_id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderColor: C.border }}>
                  <Field label={r.name} value={r.remarks} editable={!locked} onChangeText={v => setRemark(r.student_id, v)} multiline placeholder="Remark" />
                  {!locked && <Button label={a.busy ? 'Drafting…' : 'Draft with AI'} kind="quiet" icon="sparkles-outline" busy={a.busy} onPress={() => draft(r.student_id)} style={{ alignSelf: 'flex-start' }} />}
                  {!!a.err && <Body small style={{ color: C.danger }}>{a.err}</Body>}
                  {!!a.text && (
                    <View style={{ gap: 6, padding: 10, borderRadius: 10, backgroundColor: C.successLight }}>
                      <Text style={{ color: C.success, fontSize: 13, fontWeight: '700' }}>AI draft. Read it before you use it.</Text>
                      <Body>{a.text}</Body>
                      <Row>
                        <Button label="Use this draft" onPress={() => { setRemark(r.student_id, a.text!); setAiUsed(s => new Set(s).add(r.student_id)); setAi(p => ({ ...p, [r.student_id]: {} })); }} />
                        <Button label="Dismiss" kind="quiet" onPress={() => setAi(p => ({ ...p, [r.student_id]: {} }))} />
                      </Row>
                    </View>
                  )}
                </View>
              );
            })}
            {showRemarks && !locked && <Button label="Save remarks" busy={busy === 'remarks'} disabled={!remarksDirty} onPress={saveRemarks} />}
          </Card>
        </>
      )}
    </Screen>
  );
}
