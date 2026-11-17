import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { downloadAndShare, isPickError, pickFile, uploadSheet } from '@/lib/files';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, InlineConfirm, Loading, Notice, Row, Screen, Title, errText } from '@/components/ui/kit';

interface Mode { id: string; name: string; ca_contribution: number }
interface Assessment { id: string; mode_id: string; mode_name: string; title: string | null; date: string | null; max_score: number | string; score_count: number }
type Status = 'draft' | 'submitted' | 'hod_approved' | 'final_approved' | 'published' | 'rejected';
interface SubStatus { status: Status; submitted_at: string | null; hod_comment: string | null; rejected_reason: string | null }
interface Readiness {
  totalStudents: number; examScoredCount: number; examComplete: boolean; missingModes: string[];
  incompleteAssessments: { id: string; label: string; modeName: string; actedOn: number; teacherName: string; isOwn: boolean }[]; canSubmit: boolean;
}
type Upload = { saved: number; skipped: number; errors: { row: number; message: string }[] };

const STATUS: Record<Status, { label: string; tone: 'warn' | 'ok' | 'neutral' | 'bad' | 'brand'; desc: string }> = {
  draft: { label: 'Draft', tone: 'warn', desc: 'You can still change scores. Submit to your HOD when they are complete.' },
  submitted: { label: 'Submitted', tone: 'brand', desc: 'With your HOD for review. Scores are locked.' },
  hod_approved: { label: 'HOD approved', tone: 'ok', desc: 'Your HOD approved them. Waiting for final review by management.' },
  final_approved: { label: 'Final approval', tone: 'neutral', desc: 'Approved by management. Waiting to be published.' },
  published: { label: 'Published', tone: 'ok', desc: 'Published. Students can see them.' },
  rejected: { label: 'Sent back', tone: 'bad', desc: 'Sent back for correction. Change the scores and submit again.' },
};
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function Check({ ok, label, blocking = true }: { ok: boolean; label: string; blocking?: boolean }) {
  const C = useTheme();
  const col = ok ? C.success : blocking ? C.danger : C.warning;
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 10, backgroundColor: ok ? C.successLight : blocking ? C.dangerLight : C.warningLight }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={18} color={col} />
      <Text style={{ flex: 1, color: C.text, fontSize: 14 }}>{label}</Text>
    </View>
  );
}

export default function SubjectAssessmentsScreen() {
  const C = useTheme();
  const { subject, class_name, year_id, semester, year_name } = useLocalSearchParams<{ subject: string; class_name: string; year_id: string; semester: string; year_name: string }>();
  const q = { academic_year_id: year_id, semester, subject, class_name };
  const [list, setList] = useState<Assessment[] | null>(null);
  const [modes, setModes] = useState<Mode[]>([]);
  const [sub, setSub] = useState<SubStatus>({ status: 'draft', submitted_at: null, hod_comment: null, rejected_reason: null });
  const [ready, setReady] = useState<Readiness | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ mode: '', title: '', date: '', max: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [upload, setUpload] = useState<Upload | null>(null);
  const locked = !['draft', 'rejected'].includes(sub.status);

  const load = useCallback(async () => {
    try {
      const [a, m] = await Promise.all([api.get<Assessment[]>('/api/assessments', { params: q }), api.get<Mode[]>('/api/assessment-modes')]);
      setList(a.data ?? []); setModes(m.data ?? []); setForm(f => ({ ...f, mode: f.mode || m.data?.[0]?.id || '' }));
    } catch (e) { setList(prev => prev ?? []); setMsg({ text: errText(e, 'Could not load the assessments.'), tone: 'bad' }); }
    api.get<(SubStatus & { subject: string; class_name: string })[]>('/api/result-submissions/my-status', { params: { academic_year_id: year_id, semester } })
      .then(r => { const s = r.data.find(x => x.subject === subject && x.class_name === class_name); setSub(s ?? { status: 'draft', submitted_at: null, hod_comment: null, rejected_reason: null }); }).catch(() => {});
    api.get<Readiness>('/api/result-submissions/readiness-check', { params: q }).then(r => setReady(r.data)).catch(() => {});
  }, [year_id, semester, subject, class_name]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function create() {
    if (!form.mode) { setMsg({ text: 'Choose the kind of assessment.', tone: 'bad' }); return; }
    if (!form.max || parseFloat(form.max) <= 0) { setMsg({ text: 'Enter the highest score.', tone: 'bad' }); return; }
    if (form.date && !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { setMsg({ text: 'Write the date like 2026-11-14.', tone: 'bad' }); return; }
    setBusy('create'); setMsg(null);
    try {
      await api.post('/api/assessments', { ...q, semester: parseInt(semester, 10), mode_id: form.mode, title: form.title.trim() || null, date: form.date || null, max_score: parseFloat(form.max) });
      setAdding(false); setForm(f => ({ ...f, title: '', date: '', max: '' })); load();
    } catch (e) { setMsg({ text: errText(e, 'Could not create the assessment.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }
  async function remove(id: string) {
    try { await api.delete(`/api/assessments/${id}`); setList(p => p?.filter(a => a.id !== id) ?? p); load(); }
    catch (e) { setMsg({ text: errText(e, 'Could not delete the assessment.'), tone: 'bad' }); }
    setConfirm(null);
  }
  async function submit() {
    setBusy('submit'); setMsg(null);
    try {
      await api.post('/api/result-submissions/submit', { academic_year_id: year_id, semester: Number(semester), subject, class_name });
      setSubmitting(false); setMsg({ text: 'Results submitted to your HOD.', tone: 'ok' }); load();
    } catch (e) { setMsg({ text: errText(e, 'Could not submit the results.'), tone: 'bad' }); load(); }
    finally { setBusy(null); }
  }
  async function template() {
    setBusy('template');
    const e = await downloadAndShare(`/api/assessments/class-template?${new URLSearchParams(q).toString()}`, `${subject}_${class_name}_sem${semester}_CAs.xlsx`.replace(/[^\w.]+/g, '_'), XLSX);
    if (e) setMsg({ text: e, tone: 'bad' });
    setBusy(null);
  }
  async function uploadFile() {
    const f = await pickFile([XLSX, 'application/vnd.ms-excel'], 10);
    if (isPickError(f)) { setMsg({ text: f.error, tone: 'bad' }); return; }
    if (!f) return;
    setBusy('upload'); setMsg(null); setUpload(null);
    try { const { data } = await uploadSheet('/api/assessments/class-upload-scores', f, q); setUpload(data); load(); }
    catch (e) {
      const body = (e as { response?: { data?: Partial<Upload> & { error?: string } } }).response?.data;
      setMsg({ text: body?.error ?? errText(e, 'The upload did not work.'), tone: 'bad' });
      if (body?.errors?.length) setUpload({ saved: body.saved ?? 0, skipped: body.skipped ?? 0, errors: body.errors });
    } finally { setBusy(null); }
  }

  const st = STATUS[sub.status] ?? STATUS.draft;
  const go = (pathname: '/(tabs)/assessments/exam' | '/(tabs)/assessments/scores', extra: Record<string, string> = {}) =>
    router.push({ pathname, params: { subject, class_name, year_id, semester, year_name, ...extra } });

  return (
    <Screen onRefresh={load}>
      <Title sub={`${class_name}, ${year_name}, semester ${semester}`}>{subject}</Title>
      <Card accent={sub.status === 'rejected' ? C.danger : undefined}>
        <Row style={{ alignItems: 'center' }}><Text style={{ flex: 1, color: C.textSoft, fontSize: 13, fontWeight: '700' }}>Results</Text><Chip label={st.label} tone={st.tone} /></Row>
        <Body small>{st.desc}</Body>
        {sub.status === 'rejected' && !!sub.rejected_reason && <Body small style={{ color: C.danger }}>Reason: {sub.rejected_reason}</Body>}
        {!!sub.hod_comment && <Body small soft>HOD's comment: {sub.hod_comment}</Body>}
        {!locked && !submitting && <Button label="Submit to HOD" icon="send-outline" onPress={() => { setSubmitting(true); setMsg(null); load(); }} />}
        {submitting && (
          <View style={{ gap: 8 }}>
            {!ready ? <Loading label="Checking your scores…" /> : (
              <>
                <Check ok={ready.examComplete} label={`End-of-semester exam: ${ready.examScoredCount} of ${ready.totalStudents} students scored`} />
                {ready.missingModes.map(n => <Check key={n} ok={false} label={`${n}: no assessment created yet`} />)}
                {ready.incompleteAssessments.map(a => <Check key={a.id} ok={false}
                  label={`${a.label} (${a.modeName})${a.isOwn ? '' : ` by ${a.teacherName}`}: ${a.actedOn} of ${ready.totalStudents} scored or marked absent`} />)}
                {ready.canSubmit ? <Body small style={{ color: C.success, fontWeight: '700' }}>Everything is in. You can submit.</Body> : <Body small soft>Finish the items above, then submit.</Body>}
              </>
            )}
            <Row>
              <Button label="Submit now" grow busy={busy === 'submit'} disabled={!ready?.canSubmit} onPress={submit} />
              <Button label="Cancel" kind="secondary" grow onPress={() => setSubmitting(false)} />
            </Row>
          </View>
        )}
      </Card>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />

      <Pressable onPress={() => go('/(tabs)/assessments/exam')} accessibilityRole="button"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.accent, backgroundColor: pressed ? C.bg : C.surface })}>
        <Ionicons name="document-text-outline" size={20} color={C.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>End-of-semester exam</Text>
          {ready && <Body small soft>{ready.examScoredCount} of {ready.totalStudents} scored</Body>}
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.muted} />
      </Pressable>

      <Row>
        <Button label="CA template" kind="secondary" icon="download-outline" grow busy={busy === 'template'} onPress={template} />
        <Button label="Upload CA sheet" kind="secondary" icon="cloud-upload-outline" grow busy={busy === 'upload'} disabled={locked} onPress={uploadFile} />
      </Row>
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

      {adding ? (
        <Card>
          <Title>New assessment</Title>
          <ChoiceChips label="Kind" value={form.mode} onChange={v => setForm(f => ({ ...f, mode: v }))} options={modes.map(m => ({ key: m.id, label: m.name }))} />
          <Field label="Title (optional)" value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} placeholder="For example, week 3 test" />
          <Field label="Date (optional)" value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} placeholder="2026-11-14" />
          <Field label="Highest score" value={form.max} onChangeText={v => setForm(f => ({ ...f, max: v }))} keyboardType="decimal-pad" placeholder="For example 50" />
          <Row>
            <Button label="Create" grow busy={busy === 'create'} onPress={create} />
            <Button label="Cancel" kind="secondary" grow onPress={() => setAdding(false)} />
          </Row>
        </Card>
      ) : !locked && <Button label="New assessment" icon="add" onPress={() => { setAdding(true); setMsg(null); }} />}

      {list === null ? <Loading /> : list.length === 0 ? <Empty icon="clipboard-outline" title="No assessments yet" text="Add class tests, exercises and projects here." /> : list.map(a => {
        const label = a.title ?? a.mode_name;
        return (
          <Card key={a.id}>
            <Pressable onPress={() => go('/(tabs)/assessments/scores', { assessment_id: a.id, assessment_label: label })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Row><Chip label={a.mode_name} tone="brand" />{!!a.date && <Body small soft>{new Date(a.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Body>}</Row>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{label}</Text>
                <Body small soft>Out of {Number(a.max_score)}. {a.score_count} {a.score_count === 1 ? 'score' : 'scores'} entered</Body>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
            {!locked && (confirm === a.id
              ? <InlineConfirm question={`Delete "${label}"? All its scores are lost.`} confirmLabel="Delete" onConfirm={() => remove(a.id)} onCancel={() => setConfirm(null)} />
              : <Button label="Delete" kind="quiet" onPress={() => setConfirm(a.id)} style={{ alignSelf: 'flex-start' }} />)}
          </Card>
        );
      })}
    </Screen>
  );
}
