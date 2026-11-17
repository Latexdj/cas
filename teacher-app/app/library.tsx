import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { StudentSearch } from '@/components/StudentSearch';
import { Body, Button, Card, ChoiceChips, Chip, Empty, Field, InlineConfirm, Loading, Notice, Picker, Row, Screen, Segmented, Title, errText } from '@/components/ui/kit';

interface Stats { total_books: number; available_copies: number; active_loans: number; overdue_loans: number; returned_today: number }
interface Copy { id: string; copy_number: string; is_available: boolean; condition: string; shelf_location: string | null; status: string }
interface Book { id: string; title: string; author: string | null; isbn: string | null; subject: string | null; publisher: string | null; year_published: number | null; language: string | null; available_copies: number; total_copies: number }
interface Loan {
  id: string; book_title: string; copy_number: string; student_name: string; student_code: string; class_name: string;
  issued_at: string; due_date: string; is_overdue: boolean; fine_amount: number | string; fine_paid: boolean; fine_waived: boolean; renewed_count: number; days_overdue?: number;
}
interface Lookup { student: { id: string; name: string; student_code: string; class_name: string }; loans: { id: string; status: string }[] }
type Tab = 'overview' | 'issue' | 'return' | 'overdue' | 'catalogue';
type Msg = { text: string; tone: 'ok' | 'bad' } | null;

const CATEGORIES = ['general', 'textbook', 'reference', 'fiction', 'non-fiction', 'past_question', 'local_author'];
const LANGUAGES = ['English', 'Twi', 'Ga', 'Ewe', 'Dagbani', 'Hausa', 'French', 'Other'];
const cedi = (n: number | string) => `GH₵ ${Number(n).toFixed(2)}`;
const day = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const catLabel = (c: string) => c.replace(/_/g, ' ').replace(/^\w/, l => l.toUpperCase());

function useDebounced<T>(v: T, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
function Search({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
  const C = useTheme();
  return (
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.placeholder} accessibilityLabel={placeholder}
      style={{ minHeight: 48, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10, paddingHorizontal: 12, fontSize: 16, color: C.text, backgroundColor: C.surface }} />
  );
}

export default function LibraryScreen() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <Screen>
      <Segmented value={tab} onChange={setTab} options={[
        { key: 'overview', label: 'Overview' }, { key: 'issue', label: 'Issue' }, { key: 'return', label: 'Loans' },
        { key: 'overdue', label: 'Overdue' }, { key: 'catalogue', label: 'Catalogue' },
      ]} />
      <View key={tab} style={{ gap: 12 }}>
        {tab === 'overview' && <Overview />}
        {tab === 'issue' && <Issue />}
        {tab === 'return' && <Loans />}
        {tab === 'overdue' && <Overdue />}
        {tab === 'catalogue' && <Catalogue />}
      </View>
    </Screen>
  );
}

function Overview() {
  const C = useTheme();
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get<Stats>('/api/library/dashboard').then(r => setS(r.data)).catch(e => setErr(errText(e, 'Could not load the library.'))); }, []);
  if (err) return <Notice tone="bad" text={err} />;
  if (!s) return <Loading />;
  const cards: [string, number, string][] = [
    ['Books', s.total_books, C.text], ['Copies on the shelf', s.available_copies, C.success], ['On loan', s.active_loans, C.warning],
    ['Overdue', s.overdue_loans, C.danger], ['Returned today', s.returned_today, C.text],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {cards.map(([l, v, col]) => (
        <View key={l} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14 }}>
          <Text style={{ color: col, fontSize: 26, fontWeight: '800' }}>{v}</Text>
          <Text style={{ color: C.textSoft, fontSize: 13, fontWeight: '600' }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

function Issue() {
  const C = useTheme();
  const [student, setStudent] = useState<Lookup | null>(null);
  const [lookErr, setLookErr] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [books, setBooks] = useState<Book[] | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [copies, setCopies] = useState<Copy[] | null>(null);
  const [copy, setCopy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function pick(code: string) {
    setLookErr(''); setStudent(null);
    try { const { data } = await api.get<Lookup>(`/api/library/student/${encodeURIComponent(code)}`); setStudent(data); }
    catch (e) { setLookErr(errText(e, 'Could not find that student.')); }
  }
  useEffect(() => {
    if (!dq.trim()) { setBooks(null); return; }
    api.get<Book[]>('/api/library/books', { params: { search: dq, available_only: true } }).then(r => setBooks(r.data ?? [])).catch(() => setBooks([]));
  }, [dq]);
  async function chooseBook(b: Book) {
    setBook(b); setCopies(null); setCopy(null);
    try { const { data } = await api.get<Copy[]>(`/api/library/books/${b.id}/copies`); setCopies(data.filter(c => c.is_available && c.status === 'available')); }
    catch { setCopies([]); }
  }
  async function issue() {
    if (!student || !copy) return;
    setBusy(true); setMsg(null);
    try {
      await api.post('/api/library/loans/issue', { student_id: student.student.id, copy_id: copy, notes: notes.trim() || null });
      setMsg({ text: `${book?.title ?? 'Book'} issued to ${student.student.name}.`, tone: 'ok' });
      setStudent(null); setBook(null); setCopy(null); setCopies(null); setNotes(''); setQ(''); setBooks(null);
    } catch (e) { setMsg({ text: errText(e, 'Could not issue the book.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  const active = student ? student.loans.filter(l => l.status === 'active').length : 0;

  return (
    <>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      <Card>
        <Title>1. Student</Title>
        {student ? (
          <Row style={{ alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{student.student.name}</Text>
              <Body small soft>{student.student.student_code}, {student.student.class_name}. {active} {active === 1 ? 'book' : 'books'} on loan</Body>
            </View>
            <Button label="Change" kind="quiet" onPress={() => setStudent(null)} />
          </Row>
        ) : (
          <StudentSearch endpoint="/api/library/students/search" label="Student name or ID" selected={null} onSelect={s => s && pick(s.student_code)} />
        )}
        <Notice tone="bad" text={lookErr || null} />
      </Card>
      {student && (
        <Card>
          <Title>2. Book</Title>
          {book ? (
            <Row style={{ alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{book.title}</Text>
                {!!book.author && <Body small soft>{book.author}</Body>}
              </View>
              <Button label="Change" kind="quiet" onPress={() => { setBook(null); setCopies(null); setCopy(null); }} />
            </Row>
          ) : (
            <>
              <Search value={q} onChange={setQ} placeholder="Search by title, author or ISBN" />
              {books?.length === 0 && <Body soft>No book on the shelf matches.</Body>}
              {books?.map(b => (
                <Pressable key={b.id} onPress={() => chooseBook(b)} accessibilityRole="button"
                  style={({ pressed }) => ({ minHeight: 44, padding: 10, borderRadius: 10, backgroundColor: pressed ? C.bg : 'transparent', borderTopWidth: 1, borderColor: C.border })}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '600' }}>{b.title}</Text>
                  <Body small soft>{[b.author, b.isbn ? `ISBN ${b.isbn}` : null, `${b.available_copies} on the shelf`].filter(Boolean).join(', ')}</Body>
                </Pressable>
              ))}
            </>
          )}
        </Card>
      )}
      {book && (
        <Card>
          <Title>3. Copy</Title>
          {copies === null ? <Loading /> : copies.length === 0 ? <Body style={{ color: C.danger }}>No copy of this book is on the shelf.</Body> : (
            <>
              <Picker label="Copy" value={copy} placeholder="Choose a copy" onChange={setCopy}
                options={copies.map(c => ({ key: c.id, label: `Copy ${c.copy_number}`, sub: [c.condition, c.shelf_location].filter(Boolean).join(', ') }))} />
              <Field label="Notes (optional)" value={notes} onChangeText={setNotes} />
              <Button label="Issue book" busy={busy} disabled={!copy} onPress={issue} />
            </>
          )}
        </Card>
      )}
    </>
  );
}

function LoanCard({ l, children }: { l: Loan; children?: React.ReactNode }) {
  const C = useTheme();
  const fine = Number(l.fine_amount) || 0;
  return (
    <Card accent={l.is_overdue ? C.danger : undefined}>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{l.book_title}</Text>
      <Body small soft>Copy {l.copy_number}. {l.student_name} ({l.student_code}), {l.class_name}</Body>
      <Body small style={{ color: l.is_overdue ? C.danger : C.textSoft, fontWeight: l.is_overdue ? '700' : '400' }}>
        Due {day(l.due_date)}{l.is_overdue ? (l.days_overdue ? `. ${l.days_overdue} ${l.days_overdue === 1 ? 'day' : 'days'} overdue` : '. Overdue') : ''}
        {l.renewed_count > 0 ? `. Renewed ${l.renewed_count} ${l.renewed_count === 1 ? 'time' : 'times'}` : ''}
      </Body>
      {fine > 0 && <Body small style={{ color: l.fine_paid ? C.success : C.danger, fontWeight: '700' }}>Fine {cedi(fine)}, {l.fine_waived ? 'waived' : l.fine_paid ? 'paid' : 'not paid'}</Body>}
      {children}
    </Card>
  );
}

function Loans() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [waive, setWaive] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const load = useCallback(() => {
    api.get<Loan[]>('/api/library/loans/active', { params: dq ? { search: dq } : {} }).then(r => setLoans(r.data ?? [])).catch(e => { setLoans([]); setMsg({ text: errText(e, 'Could not load the loans.'), tone: 'bad' }); });
  }, [dq]);
  useEffect(() => { load(); }, [load]);
  const patch = (id: string, p: Partial<Loan>) => setLoans(prev => prev?.map(l => (l.id === id ? { ...l, ...p } : l)) ?? prev);

  async function act(l: Loan, kind: 'return' | 'renew' | 'paid' | 'waive') {
    setBusy(`${kind}-${l.id}`); setMsg(null);
    try {
      if (kind === 'return') {
        const { data } = await api.post<{ fine_amount: number; days_overdue: number }>(`/api/library/loans/${l.id}/return`, {});
        setMsg({ text: Number(data.fine_amount) > 0 ? `Returned. Fine ${cedi(data.fine_amount)} for ${data.days_overdue} ${data.days_overdue === 1 ? 'day' : 'days'} late.` : `${l.book_title} returned.`, tone: 'ok' });
        load();
      } else if (kind === 'renew') {
        const { data } = await api.post<{ new_due_date: string; renewed_count: number }>(`/api/library/loans/${l.id}/renew`, {});
        patch(l.id, { due_date: data.new_due_date, renewed_count: data.renewed_count, is_overdue: false });
        setMsg({ text: `Renewed. Now due ${day(data.new_due_date)}.`, tone: 'ok' });
      } else if (kind === 'paid') {
        await api.post(`/api/library/loans/${l.id}/fine-paid`, {}); patch(l.id, { fine_paid: true }); setMsg({ text: 'Fine marked as paid.', tone: 'ok' });
      } else {
        await api.post(`/api/library/loans/${l.id}/fine-waive`, { reason }); patch(l.id, { fine_paid: true, fine_waived: true });
        setWaive(null); setReason(''); setMsg({ text: 'Fine waived.', tone: 'ok' });
      }
    } catch (e) { setMsg({ text: errText(e, 'That did not work. Try again.'), tone: 'bad' }); }
    finally { setBusy(null); }
  }

  return (
    <>
      <Search value={q} onChange={setQ} placeholder="Search by student name or ID" />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {loans === null ? <Loading /> : loans.length === 0 ? <Empty icon="library-outline" title="No books on loan" /> : loans.map(l => {
        const unpaid = Number(l.fine_amount) > 0 && !l.fine_paid;
        return (
          <LoanCard key={l.id} l={l}>
            <Row>
              <Button label="Returned" grow busy={busy === `return-${l.id}`} onPress={() => act(l, 'return')} />
              <Button label="Renew" kind="secondary" grow busy={busy === `renew-${l.id}`} onPress={() => act(l, 'renew')} />
            </Row>
            {unpaid && (waive === l.id ? (
              <View style={{ gap: 8 }}>
                <Field label="Why waive the fine?" value={reason} onChangeText={setReason} />
                <Row>
                  <Button label="Waive fine" kind="secondary" grow busy={busy === `waive-${l.id}`} onPress={() => act(l, 'waive')} />
                  <Button label="Cancel" kind="quiet" onPress={() => { setWaive(null); setReason(''); }} />
                </Row>
              </View>
            ) : (
              <Row>
                <Button label="Fine paid" kind="secondary" grow busy={busy === `paid-${l.id}`} onPress={() => act(l, 'paid')} />
                <Button label="Waive fine" kind="quiet" onPress={() => setWaive(l.id)} />
              </Row>
            ))}
          </LoanCard>
        );
      })}
    </>
  );
}

function Overdue() {
  const [loans, setLoans] = useState<Loan[] | null>(null);
  useEffect(() => { api.get<Loan[]>('/api/library/loans/overdue').then(r => setLoans(r.data ?? [])).catch(() => setLoans([])); }, []);
  if (loans === null) return <Loading />;
  if (loans.length === 0) return <Empty icon="happy-outline" title="Nothing overdue" />;
  return <>{loans.map(l => <LoanCard key={l.id} l={{ ...l, is_overdue: true }} />)}</>;
}

const emptyBook = { title: '', author: '', isbn: '', subject: '', category: 'general', level: '', publisher: '', year_published: '', edition: '', language: 'English' };

function Catalogue() {
  const C = useTheme();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState<typeof emptyBook | null>(null);
  const [editId, setEditId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [open, setOpen] = useState<Book | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => { api.get<Book[]>('/api/library/books').then(r => setBooks(r.data ?? [])).catch(e => { setBooks([]); setMsg({ text: errText(e, 'Could not load the catalogue.'), tone: 'bad' }); }); }, []);

  async function save() {
    if (!form) return;
    if (!form.title.trim()) { setMsg({ text: 'Give the book a title.', tone: 'bad' }); return; }
    setBusy(true); setMsg(null);
    const payload = {
      ...form, author: form.author || null, isbn: form.isbn || null, subject: form.subject || null, level: form.level || null,
      publisher: form.publisher || null, year_published: form.year_published ? parseInt(form.year_published, 10) : null, edition: form.edition || null, cover_url: null,
    };
    try {
      if (editId) { const { data } = await api.put<Book>(`/api/library/books/${editId}`, payload); setBooks(p => p?.map(b => (b.id === editId ? data : b)) ?? p); }
      else { const { data } = await api.post<Book>('/api/library/books', payload); setBooks(p => [...(p ?? []), data].sort((a, b) => a.title.localeCompare(b.title))); }
      setMsg({ text: editId ? 'Book saved.' : 'Book added. Now add its copies.', tone: 'ok' }); setForm(null);
    } catch (e) { setMsg({ text: errText(e, 'Could not save the book.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api.delete(`/api/library/books/${id}`); setBooks(p => p?.filter(b => b.id !== id) ?? p); setMsg({ text: 'Book deleted.', tone: 'ok' }); }
    catch (e) { setMsg({ text: errText(e, 'Could not delete the book.'), tone: 'bad' }); }
    setConfirm(null);
  }

  if (open) return <Copies book={open} onBack={() => setOpen(null)} />;
  if (form) {
    const set = (k: keyof typeof emptyBook) => (v: string) => setForm(p => (p ? { ...p, [k]: v } : p));
    return (
      <Card>
        <Title>{editId ? 'Edit book' : 'Add book'}</Title>
        <Field label="Title" value={form.title} onChangeText={set('title')} />
        <Field label="Author" value={form.author} onChangeText={set('author')} />
        <Field label="Publisher" value={form.publisher} onChangeText={set('publisher')} />
        <Row>
          <View style={{ flex: 1, minWidth: 140 }}><Field label="ISBN (optional)" value={form.isbn} onChangeText={set('isbn')} /></View>
          <View style={{ flex: 1, minWidth: 100 }}><Field label="Year" value={form.year_published} onChangeText={set('year_published')} keyboardType="number-pad" /></View>
        </Row>
        <Row>
          <View style={{ flex: 1, minWidth: 140 }}><Field label="Subject" value={form.subject} onChangeText={set('subject')} /></View>
          <View style={{ flex: 1, minWidth: 100 }}><Field label="Edition" value={form.edition} onChangeText={set('edition')} placeholder="For example 3rd" /></View>
        </Row>
        <Field label="Level or class" value={form.level} onChangeText={set('level')} />
        <Picker label="Category" value={form.category} options={CATEGORIES.map(c => ({ key: c, label: catLabel(c) }))} onChange={set('category')} />
        <Picker label="Language" value={form.language} options={LANGUAGES.map(l => ({ key: l, label: l }))} onChange={set('language')} />
        <Notice text={msg?.tone === 'bad' ? msg.text : null} tone="bad" />
        <Row>
          <Button label={editId ? 'Save changes' : 'Add book'} grow busy={busy} onPress={save} />
          <Button label="Cancel" kind="secondary" grow onPress={() => setForm(null)} />
        </Row>
      </Card>
    );
  }

  const s = q.toLowerCase();
  const shown = (books ?? []).filter(b => !s || b.title.toLowerCase().includes(s) || (b.author ?? '').toLowerCase().includes(s) || (b.isbn ?? '').includes(s));
  return (
    <>
      <Button label="Add book" icon="add" onPress={() => { setForm(emptyBook); setEditId(''); setMsg(null); }} />
      <Search value={q} onChange={setQ} placeholder="Search by title, author or ISBN" />
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      {books === null ? <Loading /> : shown.length === 0 ? <Empty icon="book-outline" title="No books found" /> : shown.map(b => (
        <Card key={b.id}>
          <Pressable onPress={() => setOpen(b)} accessibilityRole="button" accessibilityLabel={`${b.title}, copies`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{b.title}</Text>
              <Body small soft>{b.author ?? 'Unknown author'}{b.isbn ? `, ISBN ${b.isbn}` : ''}</Body>
            </View>
            <Chip label={`${b.available_copies} of ${b.total_copies} in`} tone={b.available_copies > 0 ? 'ok' : 'bad'} />
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </Pressable>
          {confirm === b.id ? (
            <InlineConfirm question={`Delete "${b.title}" and all its copies?`} confirmLabel="Delete" onConfirm={() => remove(b.id)} onCancel={() => setConfirm(null)} />
          ) : (
            <Row>
              <Button label="Edit" kind="quiet" onPress={() => {
                setEditId(b.id); setMsg(null);
                setForm({ ...emptyBook, title: b.title, author: b.author ?? '', isbn: b.isbn ?? '', subject: b.subject ?? '', publisher: b.publisher ?? '', year_published: b.year_published ? String(b.year_published) : '', language: b.language ?? 'English' });
              }} />
              <Button label="Delete" kind="quiet" onPress={() => setConfirm(b.id)} />
            </Row>
          )}
        </Card>
      ))}
    </>
  );
}

function Copies({ book, onBack }: { book: Book; onBack: () => void }) {
  const C = useTheme();
  const [copies, setCopies] = useState<Copy[] | null>(null);
  const [num, setNum] = useState('');
  const [cond, setCond] = useState('Good');
  const [shelf, setShelf] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'lost' | 'delete' } | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { api.get<Copy[]>(`/api/library/books/${book.id}/copies`).then(r => setCopies(r.data ?? [])).catch(() => setCopies([])); }, [book.id]);

  async function add() {
    if (!num.trim()) return;
    setBusy(true); setMsg(null);
    try { const { data } = await api.post<Copy>(`/api/library/books/${book.id}/copies`, { copy_number: num.trim(), condition: cond, shelf_location: shelf.trim() || null }); setCopies(p => [...(p ?? []), data]); setNum(''); setShelf(''); }
    catch (e) { setMsg({ text: errText(e, 'Could not add the copy.'), tone: 'bad' }); }
    finally { setBusy(false); }
  }
  async function act(c: Copy, kind: 'lost' | 'delete') {
    try {
      if (kind === 'lost') { await api.put(`/api/library/books/${book.id}/copies/${c.id}`, { status: 'lost' }); setCopies(p => p?.map(x => (x.id === c.id ? { ...x, status: 'lost', is_available: false } : x)) ?? p); }
      else { await api.delete(`/api/library/books/${book.id}/copies/${c.id}`); setCopies(p => p?.filter(x => x.id !== c.id) ?? p); }
    } catch (e) { setMsg({ text: errText(e, 'That did not work.'), tone: 'bad' }); }
    setConfirm(null);
  }
  const label = (s: string) => (s === 'available' ? 'On the shelf' : s === 'on_loan' ? 'On loan' : catLabel(s));

  return (
    <>
      <Button label="Back to the catalogue" kind="quiet" icon="chevron-back" onPress={onBack} style={{ alignSelf: 'flex-start' }} />
      <Title sub={book.author ?? undefined}>{book.title}</Title>
      <Notice text={msg?.text} tone={msg?.tone} onClose={() => setMsg(null)} />
      <Card>
        {copies === null ? <Loading /> : copies.length === 0 ? <Body soft>No copies yet.</Body> : copies.map(c => (
          <View key={c.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Copy {c.copy_number}</Text>
                <Body small soft>{c.condition}{c.shelf_location ? `, ${c.shelf_location}` : ''}</Body>
              </View>
              <Chip label={label(c.status)} tone={c.status === 'available' ? 'ok' : c.status === 'on_loan' ? 'warn' : 'bad'} />
            </View>
            {c.status === 'available' && (confirm?.id === c.id ? (
              <InlineConfirm question={confirm.kind === 'lost' ? `Mark copy ${c.copy_number} as lost? It leaves circulation.` : `Delete copy ${c.copy_number}?`}
                confirmLabel={confirm.kind === 'lost' ? 'Mark lost' : 'Delete'} onConfirm={() => act(c, confirm.kind)} onCancel={() => setConfirm(null)} />
            ) : (
              <Row>
                <Button label="Mark lost" kind="quiet" onPress={() => setConfirm({ id: c.id, kind: 'lost' })} />
                <Button label="Delete" kind="quiet" onPress={() => setConfirm({ id: c.id, kind: 'delete' })} />
              </Row>
            ))}
          </View>
        ))}
      </Card>
      <Card>
        <Title>Add a copy</Title>
        <Field label="Copy number" value={num} onChangeText={setNum} />
        <ChoiceChips label="Condition" value={cond} onChange={setCond} options={['Good', 'Fair', 'Poor'].map(x => ({ key: x, label: x }))} />
        <Field label="Shelf (optional)" value={shelf} onChangeText={setShelf} />
        <Button label="Add copy" busy={busy} disabled={!num.trim()} onPress={add} />
      </Card>
    </>
  );
}
