// Notes for Tablets: teacher notes for the students' tablets. The school's
// CAS School Server downloads them at its next sync and puts them in the
// TEACHER NOTES folder for the classes picked; tablets copy them over the
// school Wi-Fi. Same as the web portal's Notes for Tablets page.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { pickFile, isPickError } from '@/lib/files';
import { Body, Button, Card, Empty, InlineConfirm, Loading, Notice, Picker, Row, Screen, SectionLabel, Title, errText } from '@/components/ui/kit';

interface Subject { subject: string; classes: string[] }
interface Note { id: string; subject: string; class_names: string; file_name: string; size: number; created_at: string }

const TYPES = [
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'image/*', 'video/mp4', 'audio/*',
];
const fmt = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function TabletNotesScreen() {
  const C = useTheme();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [subject, setSubject] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' | 'info' } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ subjects: Subject[]; notes: Note[] }>('/api/lm-notes/mine');
      setSubjects(r.data.subjects); setNotes(r.data.notes);
      setSubject(s => (s && r.data.subjects.some(x => x.subject === s)) ? s : (r.data.subjects[0]?.subject ?? null));
    } catch (e) { setSubjects(s => s ?? []); setMsg({ text: errText(e), tone: 'bad' }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const classes = subjects?.find(x => x.subject === subject)?.classes ?? [];
  useEffect(() => { setPicked(classes); }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    if (!subject) return setMsg({ text: 'Choose a subject.', tone: 'bad' });
    if (!picked.length) return setMsg({ text: 'Tick at least one class.', tone: 'bad' });
    const f = await pickFile(TYPES, 25);
    if (!f) return;
    if (isPickError(f)) return setMsg({ text: `${f.error} Upload it on the school server's teacher page instead.`, tone: 'bad' });
    setBusy(true); setMsg({ text: `Uploading ${f.name}…`, tone: 'info' });
    try {
      await api.post('/api/lm-notes', { subject, class_names: picked, file_name: f.name, data: f.data }, { timeout: 300000 });
      setMsg({ text: `Added ${f.name}. The school server picks it up within about 10 minutes when it is online, and tablets get it on the school Wi-Fi after that.`, tone: 'ok' });
    } catch (e) { setMsg({ text: errText(e, 'The upload failed. Try again.'), tone: 'bad' }); }
    setBusy(false); load();
  }

  async function remove(id: string) {
    try { await api.delete(`/api/lm-notes/${id}`); setMsg({ text: 'Removed. Tablets drop it after the school server next syncs.', tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e), tone: 'bad' }); }
    setConfirmId(null); load();
  }

  if (!subjects) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={load}>
      <Body soft>Your notes go into the TEACHER NOTES folder for the classes you tick, on every student tablet. The school server downloads them and the tablets copy them over the school Wi-Fi.</Body>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />

      {subjects.length === 0 ? (
        <Empty title="No lessons on your timetable" text="There is nothing to add notes for yet." icon="document-text-outline" />
      ) : (
        <Card>
          <Picker label="Subject" value={subject} options={subjects.map(s => ({ key: s.subject, label: s.subject }))} onChange={setSubject} />
          <View style={{ gap: 6 }}>
            <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '600' }}>Classes</Text>
            <Row>
              {classes.map(c => {
                const on = picked.includes(c);
                return (
                  <Pressable key={c} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={c}
                    onPress={() => setPicked(p => on ? p.filter(x => x !== c) : [...p, c])}
                    style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
                      borderColor: on ? C.primaryText : C.border, backgroundColor: on ? C.primaryLight : C.surface }}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? C.primaryText : C.textSoft} />
                    <Text style={{ color: on ? C.primaryText : C.text, fontSize: 14, fontWeight: '600' }}>{c}</Text>
                  </Pressable>
                );
              })}
            </Row>
          </View>
          <Button label="Choose a file to upload" icon="cloud-upload-outline" onPress={add} busy={busy} />
          <Body small soft>PDF, Word, PowerPoint, pictures or video. 25 MB each at most.</Body>
        </Card>
      )}

      <SectionLabel>My notes</SectionLabel>
      {notes.length === 0 ? <Body soft>No notes yet.</Body> : notes.map(n => (
        <Card key={n.id}>
          <Title sub={`${n.subject}, ${n.class_names}, ${fmt(n.size)}, added ${new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}>{n.file_name}</Title>
          {confirmId === n.id
            ? <InlineConfirm question="Remove it from the tablets?" confirmLabel="Remove" onConfirm={() => remove(n.id)} onCancel={() => setConfirmId(null)} />
            : <Button label="Remove" kind="secondary" icon="trash-outline" onPress={() => setConfirmId(n.id)} />}
        </Card>
      ))}
    </Screen>
  );
}
