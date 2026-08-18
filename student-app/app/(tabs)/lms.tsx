import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import type { AcademicYear, LmsCourse, LmsAssignment } from '@/types/api';

export default function LmsScreen() {
  const C = useTheme();
  const [courses,    setCourses]    = useState<LmsCourse[]>([]);
  const [assignments,setAssignments]= useState<LmsAssignment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab,        setTab]        = useState<'courses' | 'assignments'>('courses');

  async function load() {
    try {
      const yearsRes = await api.get<AcademicYear[]>('/api/student/academic-years');
      const cur = yearsRes.data.find(y => y.is_current) ?? yearsRes.data[0];
      const params = cur ? { academic_year_id: cur.id, semester: cur.current_semester ?? 1 } : {};
      const [cRes, aRes] = await Promise.all([
        api.get<LmsCourse[]>('/api/lms/student/courses', { params }),
        api.get<LmsAssignment[]>('/api/lms/student/assignments'),
      ]);
      setCourses(cRes.data);
      setAssignments(aRes.data);
    } catch { /* non-fatal */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Spinner message="Loading LMS…" />;

  const pending = assignments.filter(a => a.status === 'pending');

  return (
    <ScrollView
      style={[s.flex, { backgroundColor: C.bg }]}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />}
    >
      {/* Tab toggle */}
      <View style={[s.tabRow, { backgroundColor: C.surface, borderColor: C.border }]}>
        {(['courses', 'assignments'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)}
            style={[s.tabBtn, tab === t && { backgroundColor: C.primary }]}>
            <Text style={[s.tabText, { color: tab === t ? '#fff' : C.textSoft }]}>
              {t === 'courses' ? `Courses (${courses.length})` : `Assignments${pending.length ? ` · ${pending.length} due` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'courses' && (
        courses.length === 0
          ? <Text style={[s.empty, { color: C.muted }]}>No courses published for this term.</Text>
          : courses.map(course => (
            <Card key={course.id} style={s.courseCard}>
              <View style={[s.courseStripe, { backgroundColor: C.primary }]} />
              <View style={s.courseBody}>
                <Text style={[s.courseTitle, { color: C.text }]}>{course.title}</Text>
                <Text style={[s.courseSubject, { color: C.accent }]}>{course.subject}</Text>
                {course.teacher_name && <Text style={[s.courseTeacher, { color: C.muted }]}>{course.teacher_name}</Text>}
                {course.description && <Text style={[s.courseDesc, { color: C.textSoft }]} numberOfLines={2}>{course.description}</Text>}
              </View>
            </Card>
          ))
      )}

      {tab === 'assignments' && (
        assignments.length === 0
          ? <Text style={[s.empty, { color: C.muted }]}>No assignments yet.</Text>
          : assignments.map(a => {
            const statusCfg = {
              pending:   { label: 'Pending',   color: '#D97706', bg: '#FEF3C7' },
              submitted: { label: 'Submitted', color: '#1D4ED8', bg: '#DBEAFE' },
              graded:    { label: 'Graded',    color: '#145C44', bg: '#DCFCE7' },
            }[a.status] ?? { label: a.status, color: C.muted, bg: C.surfaceWarm };
            const overdue = a.status === 'pending' && a.due_date && new Date(a.due_date) < new Date();
            return (
              <Card key={a.id} style={s.assignCard}>
                <View style={s.assignHeader}>
                  <View style={s.assignLeft}>
                    <Text style={[s.assignTitle, { color: C.text }]}>{a.title}</Text>
                    <Text style={[s.assignCourse, { color: C.muted }]}>{a.course_title}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: statusCfg.bg }]}>
                    <Text style={[s.badgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                  </View>
                </View>
                {a.due_date && (
                  <Text style={[s.dueDate, { color: overdue ? C.danger : C.muted }]}>
                    {overdue ? '⚠ Overdue · ' : '📅 Due: '}{formatDate(a.due_date)}
                  </Text>
                )}
                {a.status === 'graded' && a.grade != null && (
                  <Text style={[s.grade, { color: C.success }]}>
                    Grade: {a.grade}{a.max_marks ? `/${a.max_marks}` : ''}
                  </Text>
                )}
              </Card>
            );
          })
      )}
    </ScrollView>
  );
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const s = StyleSheet.create({
  flex:         { flex: 1 },
  tabRow:       { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 4, marginBottom: 16, gap: 4 },
  tabBtn:       { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabText:      { fontSize: 13, fontWeight: '700' },
  courseCard:   { marginBottom: 12, flexDirection: 'row', padding: 0, overflow: 'hidden' },
  courseStripe: { width: 5 },
  courseBody:   { flex: 1, padding: 14, gap: 3 },
  courseTitle:  { fontSize: 15, fontWeight: '800' },
  courseSubject:{ fontSize: 12, fontWeight: '700' },
  courseTeacher:{ fontSize: 12 },
  courseDesc:   { fontSize: 13, lineHeight: 18, marginTop: 4 },
  assignCard:   { marginBottom: 10 },
  assignHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  assignLeft:   { flex: 1, marginRight: 10 },
  assignTitle:  { fontSize: 14, fontWeight: '700' },
  assignCourse: { fontSize: 12, marginTop: 2 },
  badge:        { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText:    { fontSize: 11, fontWeight: '700' },
  dueDate:      { fontSize: 12, fontWeight: '600' },
  grade:        { fontSize: 13, fontWeight: '700', marginTop: 4 },
  empty:        { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
