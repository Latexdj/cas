'use strict';
// Reads past questions from pasted text with plain rules (no AI), for typed
// papers in the usual layout:
//
//   1. Which of the following is a non-metal?
//   A. Sodium   B. Sulphur   C. Calcium   D. Iron        (one line or one per line)
//   Answer: B                                           (optional, per question)
//   ...
//   PAPER 2 / SECTION B / THEORY                        (later questions are theory)
//   1. (a) Define photosynthesis.
//      (b) State two conditions...
//   Marking scheme: ...                                 (optional, per theory question)
//   ...
//   ANSWERS   1. B  2. C  3. D                          (optional answer key at the end)

const LETTERS = ['a', 'b', 'c', 'd', 'e'];

// "12. text" or "Q12) text"; the space after the dot keeps "2.5 kg" from reading as question 2.
const QUESTION = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.)](?:\s+|$)(.*)$/i;
const OPTION_START = /^\(?([A-Ea-e])\s*[.)]\s+(.*)$/;
const INLINE_ANSWER = /^(?:ans(?:wer)?|correct answer)\s*[:.\-)]\s*\(?([A-Ea-e])\)?\b/i;
const SCHEME = /^(?:marking\s*scheme|model\s*answer|suggested\s*answer|answer)\s*[:.\-]\s*(.*)$/i;
const THEORY_HEAD = /^(?:paper\s*(?:2|ii|two)\b|section\s*b\b|theory\b|essay\b|part\s*(?:2|ii|b)\b)/i;
const OBJECTIVE_HEAD = /^(?:paper\s*(?:1|i|one)\b|section\s*a\b|objectives?\b|multiple\s*choice\b|part\s*(?:1|i|a)\b)/i;
const KEY_HEAD = /^(?:answers?|answer\s*key|key\s*to\s*objectives|objective\s*answers?)\s*[:.\-]?\s*(.*)$/i;

// Splits "A. Sodium B. Sulphur C. Calcium D. Iron" into options. The letters
// must run in order (A, B, C...) so words like "a." inside an option are kept.
function splitOptions(line) {
  const out = [];
  let rest = line.trim();
  let expected = 0;
  const first = rest.match(OPTION_START);
  if (!first) return null;
  expected = LETTERS.indexOf(first[1].toLowerCase());
  if (expected !== 0 && expected < 0) return null;
  rest = first[2];
  for (;;) {
    const next = LETTERS[expected + 1];
    if (!next) { out.push({ k: expected, text: rest.trim() }); break; }
    const re = new RegExp(`\\s\\(?(${next}|${next.toUpperCase()})\\s*[.)]\\s+`);
    const m = rest.match(re);
    if (!m) { out.push({ k: expected, text: rest.trim() }); break; }
    out.push({ k: expected, text: rest.slice(0, m.index).trim() });
    rest = rest.slice(m.index + m[0].length);
    expected += 1;
  }
  return out;
}

/** Answer key text, such as "1. B 2. C 3) D 4-A", into { 1: 'b', ... }. */
function readKey(text) {
  const key = {};
  for (const m of text.matchAll(/(\d{1,3})\s*[.):\-]?\s*\(?([A-Ea-e])\)?(?![A-Za-z])/g)) key[Number(m[1])] = m[2].toLowerCase();
  return key;
}

function parsePaperText(raw) {
  const lines = String(raw || '').replace(/\r/g, '').replace(/\t/g, '    ').split('\n').map(l => l.trim());

  // The answer key: from a heading such as "ANSWERS" to the end (or the next section heading).
  let key = {};
  const body = [];
  let inKey = false;
  for (const l of lines) {
    const k = l.match(KEY_HEAD);
    // "Answer: C" under a question is that question's answer, not the key.
    if (k && !QUESTION.test(l) && !INLINE_ANSWER.test(l)) { inKey = true; Object.assign(key, readKey(k[1] || '')); continue; }
    if (inKey) {
      if (THEORY_HEAD.test(l) || OBJECTIVE_HEAD.test(l)) { inKey = false; body.push(l); continue; }
      // A key line looks like "1. B 2. C"; a question line has words after the number.
      if (!l || /^(\s*\d{1,3}\s*[.):\-]?\s*\(?[A-Ea-e]\)?(?![A-Za-z])\s*[,;]?)+$/.test(l)) { Object.assign(key, readKey(l)); continue; }
      inKey = false;
    }
    body.push(l);
  }

  const questions = [];
  let mode = 'objective';
  let cur = null;
  const close = () => { if (cur) questions.push(cur); cur = null; };

  for (const line of body) {
    if (!line) { if (cur && cur.type === 'theory' && cur.text.length) cur.text.push(''); continue; }
    if (THEORY_HEAD.test(line) && !QUESTION.test(line)) { close(); mode = 'theory'; continue; }
    if (OBJECTIVE_HEAD.test(line) && !QUESTION.test(line)) { close(); mode = 'objective'; continue; }

    const q = line.match(QUESTION);
    // A number starts a question; "(a)" sub-parts in theory are part of it.
    if (q) {
      close();
      cur = { no: Number(q[1]), type: mode, text: [], options: [], answer: null, scheme: [], inScheme: false };
      const rest = q[2].trim();
      if (mode === 'objective') {
        // Options can follow the question on the same line: "... is the A. volt B. ohm".
        const at = rest.search(/\s\(?A\s*[.)]\s+/);
        if (at > 0 && /\s\(?B\s*[.)]\s+/.test(rest.slice(at))) {
          cur.text.push(rest.slice(0, at).trim());
          cur.options.push(...(splitOptions(rest.slice(at).trim()) || []));
        } else if (rest) cur.text.push(rest);
      } else if (rest) cur.text.push(rest);
      continue;
    }
    if (!cur) continue; // instructions before the first question

    if (cur.type === 'objective') {
      const ans = line.match(INLINE_ANSWER);
      if (ans) { cur.answer = ans[1].toLowerCase(); continue; }
      const opts = splitOptions(line);
      if (opts && opts.length && opts[0].k === cur.options.length) { cur.options.push(...opts); continue; }
      if (cur.options.length) cur.options[cur.options.length - 1].text += ` ${line}`;
      else cur.text.push(line);
    } else {
      const sch = line.match(SCHEME);
      if (sch) { cur.inScheme = true; if (sch[1]) cur.scheme.push(sch[1]); continue; }
      (cur.inScheme ? cur.scheme : cur.text).push(line);
    }
  }
  close();

  const rows = [];
  const problems = [];
  for (const q of questions) {
    const text = q.text.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) { problems.push(`Question ${q.no} has no text.`); continue; }
    if (q.type === 'theory') {
      const scheme = q.scheme.join('\n').trim() || null;
      rows.push({ question_no: q.no, question_type: 'theory', question_text: text, options: null,
        marking_scheme: scheme, explanation: null, topic: null, difficulty: 'medium',
        answer_source: scheme ? 'paper' : null, needs_review: !scheme, has_diagram: false });
      continue;
    }
    const opts = q.options.map(o => o.text.trim()).slice(0, 5);
    const letter = q.answer || key[q.no] || null;
    const idx = letter ? LETTERS.indexOf(letter) : -1;
    const ok = idx >= 0 && idx < opts.length;
    if (opts.length < 2) problems.push(`Question ${q.no}: options not found.`);
    else if (!ok) problems.push(`Question ${q.no}: no answer given.`);
    rows.push({ question_no: q.no, question_type: 'objective', question_text: text,
      options: opts.map((t, i) => ({ text: t, is_correct: ok && i === idx })),
      marking_scheme: null, explanation: null, topic: null, difficulty: 'medium',
      answer_source: ok ? 'paper' : null, needs_review: !ok || opts.length < 2 || opts.some(o => !o), has_diagram: false });
  }
  return { rows, problems };
}

module.exports = { parsePaperText, readKey, splitOptions };
