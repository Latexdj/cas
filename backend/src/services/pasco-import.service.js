'use strict';
// Turns an uploaded past-question paper (PDF, Word, or photos of pages) into
// draft questions with Claude. Nothing is published here: every question the
// model had to guess an answer for, and every question with a diagram, is
// flagged needs_review for the super admin to check.

const Anthropic = require('@anthropic-ai/sdk');
const mammoth   = require('mammoth');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL      = 'claude-sonnet-5-5';
const BATCH      = 25;   // questions asked for per call, keeps output well under max_tokens
const MAX_CALLS  = 12;   // 300 questions is more than any real paper

const PDF_MIME   = 'application/pdf';
const DOCX_MIME  = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function extractText(content) {
  return content?.find(b => b.type === 'text')?.text ?? '';
}

// Builds the content blocks that carry the paper itself.
async function sourceBlocks(files) {
  const blocks = [];
  for (const f of files) {
    if (f.mimetype === PDF_MIME) {
      blocks.push({ type: 'document', source: { type: 'base64', media_type: PDF_MIME, data: f.buffer.toString('base64') } });
    } else if (IMAGE_MIME.includes(f.mimetype)) {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: f.mimetype, data: f.buffer.toString('base64') } });
    } else if (f.mimetype === DOCX_MIME || /\.docx$/i.test(f.originalname || '')) {
      const { value } = await mammoth.extractRawText({ buffer: f.buffer });
      blocks.push({ type: 'text', text: `<paper_text file="${(f.originalname || 'paper.docx').replace(/"/g, '')}">\n${value}\n</paper_text>` });
    } else {
      throw new Error(`Unsupported file type: ${f.originalname || f.mimetype}`);
    }
  }
  return blocks;
}

const SYSTEM = `You convert scanned or typed examination past-question papers (WASSCE, BECE and school exams in Ghana) into structured data.

Rules:
- Copy each question's wording exactly as printed. Fix only obvious scanning errors. Keep maths readable in plain text (x^2, sqrt(x), 3/4).
- "objective" = multiple choice with lettered options. "theory" = written answer (essay, calculation, structured question). Keep a theory question's sub-parts (a), (b), (i) together in one question_text, on separate lines.
- options: the option texts in order A, B, C, D (and E if printed), without the letters. Empty array for theory.
- correct_letter: the answer if an answer key or marked answer appears on the paper; otherwise your own best answer. answer_found_on_paper says which.
- For theory, marking_scheme: if the paper has one, copy it; otherwise write a concise model answer with the key points a marker would expect. answer_found_on_paper says which.
- explanation: one or two sentences on why the objective answer is right. Null for theory.
- has_diagram: true when the question depends on a figure, graph, table image or map that text cannot carry.
- topic: a short syllabus topic name. difficulty: easy, medium or hard.
- Never invent questions that are not on the paper.

Reply with JSON only, no prose and no code fences:
{"questions":[{"question_no":1,"question_type":"objective","question_text":"...","options":["...","...","...","..."],"correct_letter":"B","answer_found_on_paper":false,"marking_scheme":null,"explanation":"...","has_diagram":false,"topic":"...","difficulty":"medium"}],"more_after":true}
more_after is true when the paper has further questions after the last one you returned.`;

function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

const LETTERS = ['a', 'b', 'c', 'd', 'e'];

// Normalises one model question into a row for lms_pasco_questions, or null.
function toRow(q) {
  const type = q?.question_type === 'theory' ? 'theory' : 'objective';
  // The number lives in question_no; drop a printed "1." or "1)" from the text.
  const text = String(q?.question_text || '').trim().replace(/^\d{1,3}\s*[.)]\s+/, '');
  if (!text) return null;
  const found = q.answer_found_on_paper === true;
  const diagram = q.has_diagram === true;
  const difficulty = ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium';
  const base = {
    question_no:   Number.isInteger(q.question_no) ? q.question_no : null,
    question_type: type,
    question_text: text,
    explanation:   type === 'objective' && q.explanation ? String(q.explanation).trim() : null,
    topic:         q.topic ? String(q.topic).trim().slice(0, 120) : null,
    difficulty,
    has_diagram:   diagram,
  };
  if (type === 'theory') {
    const scheme = q.marking_scheme ? String(q.marking_scheme).trim() : null;
    return { ...base, options: null, marking_scheme: scheme,
      answer_source: found ? 'paper' : 'ai', needs_review: !found || diagram || !scheme };
  }
  const opts = (Array.isArray(q.options) ? q.options : []).map(o => String(o ?? '').trim()).filter(Boolean).slice(0, 5);
  const idx = LETTERS.indexOf(String(q.correct_letter || '').trim().toLowerCase());
  const okIdx = idx >= 0 && idx < opts.length;
  return { ...base,
    options: opts.map((t, i) => ({ text: t, is_correct: okIdx && i === idx })),
    marking_scheme: null,
    answer_source: found && okIdx ? 'paper' : 'ai',
    // Fewer than 2 options or no answer means the read went wrong somewhere.
    needs_review: !found || !okIdx || diagram || opts.length < 2 };
}

/**
 * Reads the paper in batches of questions. Returns { rows, note }, where note
 * explains anything that went wrong part way so it is never silently dropped.
 */
async function importPaper(files, { exam, subject, year, paperLabel }) {
  const paper = await sourceBlocks(files);
  const label = [exam, subject, year, paperLabel].filter(Boolean).join(' ');
  const rows = [];
  let next = 1, note = null;

  for (let call = 0; call < MAX_CALLS; call++) {
    const ask = rows.length === 0
      ? `This is ${label || 'a past-question paper'}. Return the first ${BATCH} questions, starting from the first question on the paper.`
      : `Return the next ${BATCH} questions, starting from question ${next}. Do not repeat earlier questions.`;
    let response;
    try {
      response = await anthropic.messages.create({
        model: MODEL, max_tokens: 16000, system: SYSTEM,
        messages: [{ role: 'user', content: [...paper, { type: 'text', text: ask }] }],
      });
    } catch (e) {
      note = `Stopped after ${rows.length} questions: the AI request failed (${e.message}).`;
      break;
    }
    const data = parseJson(extractText(response.content));
    if (!data || !Array.isArray(data.questions)) {
      note = `Stopped after ${rows.length} questions: the AI reply could not be read. Add any missing questions by hand.`;
      break;
    }
    const seen = new Set(rows.map(r => `${r.question_type}:${r.question_no}`));
    let added = 0;
    for (const q of data.questions) {
      const row = toRow(q);
      if (!row) continue;
      const key = `${row.question_type}:${row.question_no}`;
      if (row.question_no != null && seen.has(key)) continue;
      seen.add(key); rows.push(row); added++;
    }
    const lastNo = Math.max(0, ...rows.map(r => r.question_no || 0));
    next = lastNo + 1;
    if (!data.more_after || added === 0) break;
    if (call === MAX_CALLS - 1) note = `Stopped at ${rows.length} questions (the import limit). Add any missing questions by hand.`;
  }
  if (rows.length === 0 && !note) note = 'No questions were found in the file.';
  return { rows, note };
}

module.exports = { importPaper, PDF_MIME, DOCX_MIME, IMAGE_MIME };
