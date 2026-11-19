// Quiz race: past questions against the clock. A correct answer scores 100,
// plus 3 points for every second left and 20 for each answer in the streak.
import React, { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { createThemedStyles } from '@/lib/themedStyles';
import { QuestionBody } from '@/components/QuestionBody';
import { optionImage, questionImages, type PackQuestion } from '@/lib/quizPack';

const SECONDS = 30;
const LETTERS = ['a', 'b', 'c', 'd', 'e'];

export default function QuizRace({ questions, onFinish }: {
  questions: PackQuestion[];
  onFinish: (score: number, detail: { correct: number; total: number }) => void;
}) {
  const C = useTheme();
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [left, setLeft] = useState(SECONDS);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [gain, setGain] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const q = questions[i];
  const last = i === questions.length - 1;

  // The clock runs until the question is answered; at zero it counts as wrong.
  useEffect(() => {
    if (revealed) return;
    if (left <= 0) { answer(null); return; }
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left, revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  function answer(letter: string | null) {
    if (revealed) return;
    setChosen(letter); setRevealed(true);
    if (letter && letter === q.correct) {
      const g = 100 + left * 3 + streak * 20;
      setGain(g); setScore(s => s + g); setStreak(s => s + 1); setCorrect(c => c + 1);
    } else { setGain(0); setStreak(0); }
  }
  function next() {
    if (last) { onFinish(score, { correct, total: questions.length }); return; }
    setI(n => n + 1); setChosen(null); setRevealed(false); setLeft(SECONDS);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[s.bar, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Text style={[s.barText, { color: C.textSoft }]}>Question {i + 1} of {questions.length}</Text>
        <Text style={[s.barText, { color: C.text }]} accessibilityLabel={`Score ${score}`}>{score} pts{streak > 1 ? `, streak ${streak}` : ''}</Text>
        <Text style={[s.timer, { color: left <= 5 && !revealed ? C.danger : C.text }]} accessibilityLabel={`${left} seconds left`}>{revealed ? '' : `${left}s`}</Text>
      </View>
      <View style={[s.track, { backgroundColor: C.border }]}>
        <View style={{ width: `${(left / SECONDS) * 100}%`, height: 4, backgroundColor: left <= 5 ? C.danger : C.primaryText }} />
      </View>
      <ScrollView ref={scroll} contentContainerStyle={s.page}>
        <QuestionBody text={q.question_text} html={q.question_html} images={questionImages(q)} textStyle={[s.question, { color: C.text }]} imageHeight={180} />
        <View style={{ gap: 10 }}>
          {q.options.map((opt, k) => {
            const letter = LETTERS[k];
            const isRight = q.correct === letter, isChosen = chosen === letter;
            let border = C.border, bg = C.surface, fg = C.text;
            if (revealed && isRight) { border = C.success; bg = C.successLight; }
            else if (revealed && isChosen) { border = C.danger; bg = C.dangerLight; }
            else if (revealed) fg = C.textSoft;
            return (
              <TouchableOpacity key={k} disabled={revealed} onPress={() => answer(letter)} accessibilityRole="button"
                accessibilityLabel={`Option ${letter.toUpperCase()}: ${opt || 'picture'}`}
                style={[s.option, { borderColor: border, backgroundColor: bg }]}>
                <Text style={[s.letter, { color: fg }]}>{letter.toUpperCase()}</Text>
                <View style={{ flex: 1, gap: 6 }}>
                  {optionImage(q, k) && (
                    <Image source={{ uri: optionImage(q, k)! }} resizeMode="contain" accessibilityLabel={`Option ${letter.toUpperCase()} picture`}
                      style={{ width: '100%', height: 120, backgroundColor: '#FFFFFF', borderRadius: 8 }} />
                  )}
                  {!!opt && (q.options_html?.[k]
                    ? <QuestionBody text={opt} html={q.options_html[k]} images={[]} showUnplaced={false} textStyle={[s.optText, { color: fg }]} />
                    : <Text style={[s.optText, { color: fg }]}>{opt}</Text>)}
                </View>
                {revealed && isRight && <Ionicons name="checkmark-circle" size={22} color={C.success} />}
                {revealed && isChosen && !isRight && <Ionicons name="close-circle" size={22} color={C.danger} />}
              </TouchableOpacity>
            );
          })}
        </View>
        {revealed && (
          <View style={[s.feedback, { backgroundColor: gain ? C.successLight : C.dangerLight }]}>
            <Text style={[s.feedbackTitle, { color: gain ? C.success : C.danger }]}>
              {gain ? `Correct, +${gain} points` : chosen ? `Not quite. The answer is ${q.correct?.toUpperCase()}.` : `Time is up. The answer is ${q.correct?.toUpperCase()}.`}
            </Text>
            {!!q.explanation && <Text style={[s.small, { color: C.text }]}>{q.explanation}</Text>}
          </View>
        )}
      </ScrollView>
      {revealed && (
        <View style={[s.bottom, { backgroundColor: C.surface, borderColor: C.border }]}>
          <TouchableOpacity onPress={next} accessibilityRole="button" style={[s.primary, { backgroundColor: C.primary }]}>
            <Text style={s.primaryText}>{last ? 'See my score' : 'Next question'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = createThemedStyles({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  barText: { fontSize: 14, fontWeight: '600' },
  timer: { fontSize: 18, fontWeight: '800', minWidth: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
  track: { height: 4 },
  page: { padding: 16, gap: 16, paddingBottom: 32 },
  question: { fontSize: 17, lineHeight: 25, fontWeight: '600' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14, minHeight: 56 },
  letter: { fontSize: 16, fontWeight: '800', width: 20 },
  optText: { fontSize: 16, lineHeight: 22 },
  feedback: { borderRadius: 12, padding: 14, gap: 6 },
  feedbackTitle: { fontSize: 15, fontWeight: '700' },
  small: { fontSize: 14, lineHeight: 20 },
  bottom: { padding: 16, borderTopWidth: 1 },
  primary: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
