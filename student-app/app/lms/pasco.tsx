import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { gradeBadge } from '@/lib/grade';
import type { PascoQuestion } from '@/types/api';

type Phase = 'setup' | 'practice' | 'done';
type Difficulty = 'All' | 'Easy' | 'Medium' | 'Hard';

export default function PascoScreen() {
  const C = useTheme();
  const [phase, setPhase] = useState<Phase>('setup');

  const [subjects, setSubjects] = useState<{ label: string; value: string }[]>([]);
  const [subject, setSubject] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('All');
  const [year, setYear] = useState('');

  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<PascoQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>('/api/subjects')
      .then(({ data }) => {
        const opts = data.map(s => ({ label: s.name, value: s.name }));
        setSubjects(opts);
        if (opts.length && !subject) setSubject(opts[0].value);
      })
      .catch(() => {})
      .finally(() => setLoadingSubjects(false));
  }, []);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const params = new URLSearchParams({ subject_name: subject, limit: '20', randomise: 'true' });
      if (difficulty !== 'All') params.set('difficulty', difficulty.toLowerCase());
      if (year) params.set('year', year);
      const { data } = await api.get<PascoQuestion[]>(`/api/lms/pasco?${params.toString()}`);
      if (data.length === 0) {
        setError('No questions found for your selection. Try different filters.');
        return;
      }
      setQuestions(data);
      setCurrentIndex(0);
      setSelected(null);
      setRevealed(false);
      setCorrectCount(0);
      setPhase('practice');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not load practice questions.');
    } finally {
      setStarting(false);
    }
  }

  function handleSelect(opt: 'a' | 'b' | 'c' | 'd') {
    if (revealed) return;
    setSelected(opt);
    setRevealed(true);
    if (opt === questions[currentIndex].correct_option) setCorrectCount(c => c + 1);
  }

  function handleNext() {
    if (currentIndex === questions.length - 1) {
      setPhase('done');
      return;
    }
    setCurrentIndex(i => i + 1);
    setSelected(null);
    setRevealed(false);
  }

  function handleRestart() {
    setPhase('setup');
    setQuestions([]);
  }

  if (phase === 'setup') {
    return (
      <ScrollView style={[s.flex, { backgroundColor: C.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {loadingSubjects ? (
          <Spinner message="Loading subjects…" />
        ) : (
          <>
            <Dropdown label="Subject" options={subjects} value={subject} onChange={setSubject} placeholder="Select a subject" />

            <Text style={[s.fieldLabel, { color: C.muted }]}>Difficulty</Text>
            <View style={s.diffRow}>
              {(['All', 'Easy', 'Medium', 'Hard'] as Difficulty[]).map(d => (
                <TouchableOpacity
                  key={d}
                  style={[s.diffBtn, { borderColor: difficulty === d ? C.primary : C.border, backgroundColor: difficulty === d ? C.primary : C.surface }]}
                  onPress={() => setDifficulty(d)}
                >
                  <Text style={[s.diffText, { color: difficulty === d ? '#fff' : C.text }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input label="Year (optional)" placeholder="e.g. 2022" keyboardType="numeric" value={year} onChangeText={setYear} />

            {error && <Text style={[s.errorText, { color: C.danger }]}>{error}</Text>}

            <Button label={starting ? 'Loading…' : 'Start Practice'} loading={starting} disabled={!subject} onPress={handleStart} style={{ marginTop: 8 }} />
          </>
        )}
      </ScrollView>
    );
  }

  if (phase === 'practice') {
    const q = questions[currentIndex];
    return (
      <ScrollView style={[s.flex, { backgroundColor: C.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <View style={s.practiceHeader}>
          <Text style={[s.practiceProgress, { color: C.muted }]}>Question {currentIndex + 1} of {questions.length}</Text>
          <Text style={[s.practiceScore, { color: C.success }]}>{correctCount}/{currentIndex + (revealed ? 1 : 0)}</Text>
        </View>

        <Text style={[s.questionText, { color: C.text }]}>{q.question_text}</Text>

        {(['a', 'b', 'c', 'd'] as const).map(letter => {
          const text = q[`option_${letter}`];
          if (!text) return null;
          const isCorrect = letter === q.correct_option;
          const isSelected = letter === selected;
          let borderColor = C.border, bg = C.surface;
          if (revealed) {
            if (isCorrect) { borderColor = C.success; bg = C.successLight; }
            else if (isSelected) { borderColor = C.danger; bg = C.dangerLight; }
          }
          return (
            <TouchableOpacity key={letter} style={[s.option, { borderColor, backgroundColor: bg }]} onPress={() => handleSelect(letter)} activeOpacity={0.75}>
              <View style={[s.optionLetter, { backgroundColor: revealed && isCorrect ? C.success : revealed && isSelected ? C.danger : C.border }]}>
                <Text style={[s.optionLetterText, { color: revealed && (isCorrect || isSelected) ? '#fff' : C.muted }]}>{letter.toUpperCase()}</Text>
              </View>
              <Text style={[s.optionText, { color: C.text }]}>{text}</Text>
              {revealed && isCorrect && <Ionicons name="checkmark-circle" size={18} color={C.success} />}
              {revealed && isSelected && !isCorrect && <Ionicons name="close-circle" size={18} color={C.danger} />}
            </TouchableOpacity>
          );
        })}

        {revealed && (
          <Card style={[s.feedbackCard, { backgroundColor: selected === q.correct_option ? C.successLight : C.dangerLight }]}>
            <Text style={[s.feedbackTitle, { color: selected === q.correct_option ? C.success : C.danger }]}>
              {selected === q.correct_option ? 'Correct!' : `Incorrect. The correct answer is ${q.correct_option.toUpperCase()}.`}
            </Text>
            {q.explanation && <Text style={[s.feedbackExplanation, { color: C.textSoft }]}>{q.explanation}</Text>}
          </Card>
        )}

        {revealed && (
          <Button label={currentIndex === questions.length - 1 ? 'See Results' : 'Next Question'} onPress={handleNext} style={{ marginTop: 16 }} />
        )}
      </ScrollView>
    );
  }

  // done
  const pct = Math.round((correctCount / questions.length) * 100);
  const badge = gradeBadge(pct, 'Needs Work');
  return (
    <ScrollView style={[s.flex, { backgroundColor: C.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Card style={s.resultCard}>
        <Text style={[s.resultScore, { color: C.text }]}>{correctCount}/{questions.length}</Text>
        <Text style={[s.resultPct, { color: C.muted }]}>{pct}%</Text>
        <View style={[s.badge, { backgroundColor: badge.bg, marginTop: 8 }]}>
          <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </Card>
      <Button label="Try Again" onPress={handleStart} style={{ marginTop: 16 }} />
      <Button label="Change Subject" variant="secondary" onPress={handleRestart} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  flex:            { flex: 1 },
  fieldLabel:      { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  diffRow:         { flexDirection: 'row', gap: 8, marginBottom: 16 },
  diffBtn:         { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  diffText:        { fontSize: 13, fontWeight: '700' },
  errorText:       { fontSize: 13, fontWeight: '600', marginBottom: 8 },

  practiceHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  practiceProgress:{ fontSize: 13, fontWeight: '600' },
  practiceScore:   { fontSize: 14, fontWeight: '800' },
  questionText:    { fontSize: 17, fontWeight: '700', marginBottom: 18, lineHeight: 24 },
  option:          { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 10 },
  optionLetter:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionLetterText:{ fontSize: 13, fontWeight: '800' },
  optionText:      { fontSize: 14, flex: 1 },
  feedbackCard:    { marginTop: 4 },
  feedbackTitle:   { fontSize: 13, fontWeight: '700' },
  feedbackExplanation: { fontSize: 12, marginTop: 4 },

  resultCard:      { alignItems: 'center', paddingVertical: 24 },
  resultScore:     { fontSize: 32, fontWeight: '800' },
  resultPct:       { fontSize: 14, marginTop: 2 },
  badge:           { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeText:       { fontSize: 12, fontWeight: '700' },
});
