// Questions for Cedi Climb: 15 questions across every subject, getting harder
// up the ladder. JHS and SHS draw from the past questions on the device (BECE
// or WASSCE, every subject); CTVET questions are made from the trades' tools
// and procedures.
import { examFilter, loadSubject, localManifest, optionImage, questionImages, type PackQuestion } from './quizPack';
import { TRADES } from './gameContent';
import { shuffle } from './games';

export type Band = 'easy' | 'medium' | 'hard';
export interface ClimbQ {
  id: string;
  subject: string;
  source: string | null;          // e.g. "WASSCE 2019"
  text: string;
  images: (string | null)[];
  options: string[];
  optionImages: (string | null)[];
  correct: number;                 // index into options
  explanation: string | null;
  band: Band;
}
export type ClimbPools = Record<Band, ClimbQ[]>;

/** Question n (0-14) is easy for 0-4, medium for 5-9, hard for 10-14. */
export const bandFor = (n: number): Band => (n < 5 ? 'easy' : n < 10 ? 'medium' : 'hard');

const LETTERS = ['a', 'b', 'c', 'd', 'e'];

function fromPack(q: PackQuestion, subject: string, source: string | null): ClimbQ | null {
  const k = LETTERS.indexOf(String(q.correct || '').toLowerCase());
  const opts = q.options ?? [];
  // Four or five choices, each with text or a picture, and a known answer.
  if (q.question_type !== 'objective' || k < 0 || k >= opts.length || opts.length < 4 || opts.length > 5) return null;
  if (opts.some((o, i) => !o && !optionImage(q, i))) return null;
  const band: Band = q.difficulty === 'easy' || q.difficulty === 'hard' ? q.difficulty : 'medium';
  return {
    id: q.id, subject, source, text: q.question_text, images: questionImages(q), options: opts,
    optionImages: opts.map((_, i) => optionImage(q, i)), correct: k, explanation: q.explanation, band,
  };
}

/** Every subject's past questions for one exam, sorted into easy / medium / hard. */
export async function pastQuestionPools(exam: 'BECE' | 'WASSCE'): Promise<{ pools: ClimbPools; subjects: string[] }> {
  const pools: ClimbPools = { easy: [], medium: [], hard: [] };
  const subjects: string[] = [];
  const manifest = await localManifest();
  for (const sub of manifest?.subjects ?? []) {
    const pack = await loadSubject(sub.slug);
    if (!pack) continue;
    const inExam = examFilter(pack, exam);
    const paper = new Map(pack.papers.map(p => [p.id, p]));
    let n = 0;
    for (const q of pack.questions) {
      if (!inExam(q)) continue;
      const p = paper.get(q.paper_id);
      const c = fromPack(q, pack.subject, p ? `${exam}${p.year ? ` ${p.year}` : ''}` : exam);
      if (c) { pools[c.band].push(c); n++; }
    }
    if (n) subjects.push(pack.subject);
  }
  return { pools, subjects };
}

/** CTVET questions from the tools and procedures of every trade. */
export function ctvetPools(): { pools: ClimbPools; subjects: string[] } {
  const pools: ClimbPools = { easy: [], medium: [], hard: [] };
  const allTools = TRADES.flatMap(t => t.tools.map(([tool, use]) => ({ trade: t.name, tool, use })));
  let id = 0;
  const make = (subject: string, text: string, right: string, wrong: string[], band: Band, explanation: string | null = null) => {
    const distinct = [...new Set(wrong)].filter(w => w.toLowerCase() !== right.toLowerCase());
    if (distinct.length < 3) return;
    const options = shuffle([right, ...shuffle(distinct).slice(0, 3)]);
    pools[band].push({ id: `c${id++}`, subject, source: null, text, images: [], options, optionImages: options.map(() => null),
      correct: options.indexOf(right), explanation, band });
  };
  for (const t of TRADES) {
    for (const [tool, use] of t.tools) {
      const others = allTools.filter(x => x.tool !== tool && x.use !== use);
      // Easy: what is this tool for? (wrong answers from any trade)
      make(t.name, `What is a ${tool.toLowerCase()} used for?`, use, others.map(x => x.use), 'easy');
      // Medium: which tool does this job? (wrong answers from the same trade first)
      const same = t.tools.filter(([x]) => x !== tool).map(([x]) => x);
      make(t.name, `Which tool is used for this job: ${use.charAt(0).toLowerCase()}${use.slice(1)}?`, tool,
        same.length >= 3 ? same : [...same, ...others.map(x => x.tool)], 'medium');
    }
    // Hard: the order of steps in a procedure.
    for (const p of t.procedures) {
      const s = p.steps;
      make(t.name, `${p.title}: which of these is the FIRST step?`, s[0], s.slice(1), 'hard', `The steps in order: ${s.join('; ')}.`);
      for (let k = 0; k < s.length - 1; k++) {
        make(t.name, `${p.title}: which step comes right after "${s[k]}"?`, s[k + 1], s.filter((_, j) => j !== k && j !== k + 1), 'hard',
          `The steps in order: ${s.join('; ')}.`);
      }
    }
  }
  return { pools, subjects: TRADES.map(t => t.name) };
}

/**
 * Picks the 15 questions for a climb, plus spares for Swap: one per step,
 * spreading subjects out. A band short of questions borrows from its neighbours.
 */
export function pickLadder(pools: ClimbPools): { ladder: ClimbQ[]; spares: ClimbPools } | null {
  const left: ClimbPools = { easy: shuffle(pools.easy), medium: shuffle(pools.medium), hard: shuffle(pools.hard) };
  const order: Record<Band, Band[]> = { easy: ['easy', 'medium', 'hard'], medium: ['medium', 'easy', 'hard'], hard: ['hard', 'medium', 'easy'] };
  const ladder: ClimbQ[] = [];
  const recent: string[] = [];
  for (let n = 0; n < 15; n++) {
    let got: ClimbQ | null = null;
    for (const b of order[bandFor(n)]) {
      const list = left[b];
      if (!list.length) continue;
      // Prefer a subject not used in the last few steps.
      const i = list.findIndex(q => !recent.includes(q.subject));
      got = list.splice(i >= 0 ? i : 0, 1)[0];
      break;
    }
    if (!got) return null;
    ladder.push({ ...got, band: bandFor(n) });
    recent.push(got.subject); if (recent.length > 3) recent.shift();
  }
  return { ladder, spares: left };
}
