import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { LibraryBook, LibraryLoan, LibraryResource } from '@/types/api';

type Tab = 'books' | 'loans' | 'resources';

export default function LibraryScreen() {
  const C = useTheme();
  const [tab,        setTab]        = useState<Tab>('books');
  const [books,      setBooks]      = useState<LibraryBook[]>([]);
  const [loans,      setLoans]      = useState<LibraryLoan[]>([]);
  const [resources,  setResources]  = useState<LibraryResource[]>([]);
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const [bRes, lRes, rRes] = await Promise.all([
        api.get<LibraryBook[]>('/api/student/library/books'),
        api.get<LibraryLoan[]>('/api/student/library/my-loans'),
        api.get<LibraryResource[]>('/api/student/library/resources'),
      ]);
      setBooks(bRes.data);
      setLoans(lRes.data);
      setResources(rRes.data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleRenew(loanId: string) {
    try {
      await api.post(`/api/student/library/loans/${loanId}/renew`);
      load();
    } catch { /* non-fatal */ }
  }

  if (loading) return <Spinner message="Loading library…" />;

  const filteredBooks = books.filter(b =>
    !search || b.title.toLowerCase().includes(search.toLowerCase()) || (b.author ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const activeLoans   = loans.filter(l => l.status === 'active');
  const returnedLoans = loans.filter(l => l.status === 'returned');

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
    >
      {/* Tabs */}
      <View style={[s.tabRow, { backgroundColor: C.surface, borderColor: C.border }]}>
        {([['books', `Books`], ['loans', `My Loans${activeLoans.length ? ` (${activeLoans.length})` : ''}`], ['resources', 'Resources']] as const).map(([t, label]) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={[s.tabBtn, tab === t && { backgroundColor: C.primary }]}>
            <Text style={[s.tabText, { color: tab === t ? '#fff' : C.textSoft }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'books' && (
        <>
          <View style={[s.searchBox, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={[s.searchInput, { color: C.text }]}
              placeholder="Search title or author…"
              placeholderTextColor={C.placeholder}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          {filteredBooks.map(book => (
            <Card key={book.id} style={s.bookCard}>
              <View style={s.bookRow}>
                <View style={[s.bookIcon, { backgroundColor: C.primaryLight }]}>
                  <Text style={s.bookEmoji}>📖</Text>
                </View>
                <View style={s.bookBody}>
                  <Text style={[s.bookTitle, { color: C.text }]}>{book.title}</Text>
                  {book.author && <Text style={[s.bookAuthor, { color: C.muted }]}>{book.author}</Text>}
                  {book.subject && <Text style={[s.bookSubject, { color: C.accent }]}>{book.subject}</Text>}
                </View>
                <View style={[s.availBadge, { backgroundColor: book.available > 0 ? '#DCFCE7' : '#FEE2E2' }]}>
                  <Text style={[s.availText, { color: book.available > 0 ? '#145C44' : '#DC2626' }]}>
                    {book.available > 0 ? `${book.available} avail.` : 'Unavail.'}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
          {filteredBooks.length === 0 && <Text style={[s.empty, { color: C.muted }]}>No books found.</Text>}
        </>
      )}

      {tab === 'loans' && (
        <>
          {activeLoans.length > 0 && (
            <>
              <Text style={[s.subHeading, { color: C.textSoft }]}>Currently Borrowed</Text>
              {activeLoans.map(loan => (
                <Card key={loan.id} style={[s.loanCard, loan.is_overdue && { borderColor: C.danger, borderWidth: 1.5 }]}>
                  <View style={s.loanHeader}>
                    <Text style={[s.loanTitle, { color: C.text }]} numberOfLines={2}>{loan.book_title}</Text>
                    {loan.is_overdue && (
                      <View style={s.overdueBadge}><Text style={s.overdueText}>OVERDUE</Text></View>
                    )}
                  </View>
                  <Text style={[s.loanDate, { color: C.muted }]}>Borrowed: {formatDate(loan.borrowed_at)}</Text>
                  {loan.due_date && <Text style={[s.loanDue, { color: loan.is_overdue ? C.danger : C.textSoft }]}>Due: {formatDate(loan.due_date)}</Text>}
                  {loan.fine_amount != null && loan.fine_amount > 0 && (
                    <Text style={[s.fine, { color: C.danger }]}>Fine: GH₵{loan.fine_amount.toFixed(2)}</Text>
                  )}
                  <TouchableOpacity onPress={() => handleRenew(loan.id)} style={[s.renewBtn, { borderColor: C.primary }]}>
                    <Text style={[s.renewText, { color: C.primary }]}>Renew</Text>
                  </TouchableOpacity>
                </Card>
              ))}
            </>
          )}
          {returnedLoans.length > 0 && (
            <>
              <Text style={[s.subHeading, { color: C.textSoft }]}>Return History</Text>
              {returnedLoans.map(loan => (
                <Card key={loan.id} style={s.loanCard}>
                  <Text style={[s.loanTitle, { color: C.muted }]}>{loan.book_title}</Text>
                  <Text style={[s.loanDate, { color: C.muted }]}>Returned: {loan.returned_at ? formatDate(loan.returned_at) : '—'}</Text>
                </Card>
              ))}
            </>
          )}
          {loans.length === 0 && <Text style={[s.empty, { color: C.muted }]}>You have no loan history.</Text>}
        </>
      )}

      {tab === 'resources' && (
        resources.length === 0
          ? <Text style={[s.empty, { color: C.muted }]}>No digital resources available.</Text>
          : resources.map(res => (
            <Card key={res.id} style={s.resCard}>
              <View style={s.resRow}>
                <Text style={s.resIcon}>{res.resource_type === 'past_question' ? '📝' : res.resource_type === 'ebook' ? '📕' : '📄'}</Text>
                <View style={s.resBody}>
                  <Text style={[s.resTitle, { color: C.text }]}>{res.title}</Text>
                  {res.subject && <Text style={[s.resSubject, { color: C.accent }]}>{res.subject}</Text>}
                  {res.description && <Text style={[s.resDesc, { color: C.muted }]} numberOfLines={2}>{res.description}</Text>}
                </View>
                <View style={[s.resTypeBadge, { backgroundColor: C.primaryLight }]}>
                  <Text style={[s.resTypeText, { color: C.primary }]}>{res.resource_type.replace('_', ' ')}</Text>
                </View>
              </View>
            </Card>
          ))
      )}
    </ScrollView>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const s = StyleSheet.create({
  flex:         { flex: 1 },
  tabRow:       { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, marginBottom: 14, gap: 4 },
  tabBtn:       { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabText:      { fontSize: 12, fontWeight: '700' },
  searchBox:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, gap: 8 },
  searchIcon:   { fontSize: 15 },
  searchInput:  { flex: 1, fontSize: 14 },
  bookCard:     { marginBottom: 10 },
  bookRow:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bookIcon:     { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  bookEmoji:    { fontSize: 22 },
  bookBody:     { flex: 1 },
  bookTitle:    { fontSize: 14, fontWeight: '700' },
  bookAuthor:   { fontSize: 12, marginTop: 2 },
  bookSubject:  { fontSize: 11, marginTop: 2, fontWeight: '600' },
  availBadge:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  availText:    { fontSize: 11, fontWeight: '700' },
  subHeading:   { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginTop: 4 },
  loanCard:     { marginBottom: 10 },
  loanHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  loanTitle:    { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  overdueBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  overdueText:  { fontSize: 10, fontWeight: '800', color: '#DC2626' },
  loanDate:     { fontSize: 12, marginTop: 2 },
  loanDue:      { fontSize: 12, fontWeight: '600', marginTop: 2 },
  fine:         { fontSize: 13, fontWeight: '700', marginTop: 4 },
  renewBtn:     { marginTop: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  renewText:    { fontSize: 13, fontWeight: '700' },
  resCard:      { marginBottom: 10 },
  resRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  resIcon:      { fontSize: 28, marginTop: 2 },
  resBody:      { flex: 1 },
  resTitle:     { fontSize: 14, fontWeight: '700' },
  resSubject:   { fontSize: 12, fontWeight: '600', marginTop: 2 },
  resDesc:      { fontSize: 12, lineHeight: 17, marginTop: 4 },
  resTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  resTypeText:  { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  empty:        { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
