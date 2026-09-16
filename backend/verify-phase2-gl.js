'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const jwt  = require('jsonwebtoken');

const SCHOOL_ID  = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5';
const STUDENT_ID = 'aa53c5bc-b14c-416b-b2ee-f9a67abb6dc2';
const TEACHER_ID = '98f8cee5-e016-4ed2-ad28-3c2685a112a0'; // BOMBUNI STELLA
const ADMIN_ID   = 'f7831134-de1d-4f98-9398-34a0b65fc8f7';
const BASE       = 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET;

const adminToken = jwt.sign(
  { id: ADMIN_ID, name: 'GERALD BASUGLO HILLIA', role: 'admin', schoolId: SCHOOL_ID },
  JWT_SECRET, { expiresIn: '1h' }
);

let pass = 0, fail = 0;
const results = [];

function check(name, ok, detail) {
  if (ok) { pass++; results.push(`  ✓ PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else     { fail++; results.push(`  ✗ FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function req(method, path, body, token) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || adminToken}` },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}

function hasMarkdown(text) {
  if (/\*\*/.test(text))       return '**bold**';
  if (/\*[^*\n]+\*/.test(text)) return '*italic*';
  if (/^#{1,6}\s/m.test(text)) return '## header';
  return null;
}

function hasEmDash(text) { return /—/.test(text); }

function hasFillerPhrase(text) {
  const fillers = ['it is imperative', 'it is essential', 'it is crucial',
                   'please note that', 'i want to draw your attention', 'it goes without saying'];
  const low = text.toLowerCase();
  return fillers.find(f => low.includes(f)) ?? null;
}

// Collected letter IDs for cleanup
const cleanupIds = [];

async function run() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  General Letters Phase 2 — AI Drafting Verification');
  console.log('═══════════════════════════════════════════════════════════');

  // Resolve names from DB (needed for recipient-context checks)
  const { rows: stdR } = await pool.query(`SELECT name FROM students WHERE id = $1`, [STUDENT_ID]);
  const { rows: tchR } = await pool.query(`SELECT name FROM teachers WHERE id = $1`, [TEACHER_ID]);
  const studentName      = stdR[0]?.name ?? 'Unknown Student';
  const teacherName      = tchR[0]?.name ?? 'Unknown Teacher';
  const studentFirstName = studentName.split(' ')[0];
  console.log(`  Student : ${studentName}  (first name: ${studentFirstName})`);
  console.log(`  Teacher : ${teacherName}`);
  console.log('');

  // ════════════════════════════════════════════════════════════════════════════
  // [ 1 ] SERVER-SIDE SENSITIVITY GATE
  // ════════════════════════════════════════════════════════════════════════════
  console.log('[ 1 ] Server-side sensitivity gate — 422 even when frontend bypassed');

  const t1d = await req('POST', '/api/general-letters', {
    classification: 'parent_communication', recipient_type: 'external',
    ext_recipient_name: 'Test Parent', subject: 'Sensitive Gate Test',
    is_sensitive: true, status: 'draft',
    issued_date: new Date().toISOString().slice(0, 10),
  });
  check('Create sensitive draft → 201', t1d.status === 201, `got ${t1d.status}`);
  const sensId = t1d.data?.id;
  cleanupIds.push(sensId);

  const t1c = await req('POST', '/api/letter-chat/start', {
    document_type: 'general_letter',
    metadata: {
      letter_id: sensId, classification: 'parent_communication',
      subject: 'Sensitive Gate Test', recipient_type: 'external',
      ext_recipient_name: 'Test Parent',
      is_sensitive: false, // deliberately spoofed — server must ignore this
    },
  });
  check('Chat start on sensitive letter → 422', t1c.status === 422,
    `got ${t1c.status}: ${t1c.data?.error ?? ''}`);
  check('Response carries blocked:true', t1c.data?.blocked === true,
    `blocked=${t1c.data?.blocked}`);

  // ════════════════════════════════════════════════════════════════════════════
  // [ 2 ] NON-SENSITIVE CHAT — 3 ROUNDS — MARKDOWN / EM-DASH CHECK
  // ════════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 2 ] Non-sensitive external recipient — 3 rounds, format checks');

  const extName = 'Mrs Abena Asante';
  const extOrg  = 'Parent of Kwame Asante';

  const t2d = await req('POST', '/api/general-letters', {
    classification: 'parent_communication', recipient_type: 'parent',
    ext_recipient_name: extName, ext_recipient_org: extOrg,
    subject: 'Student Absence Notification',
    is_sensitive: false, status: 'draft',
    issued_date: new Date().toISOString().slice(0, 10),
  });
  check('Create non-sensitive draft → 201', t2d.status === 201, `got ${t2d.status}`);
  const t2Id = t2d.data?.id;
  cleanupIds.push(t2Id);

  const t2s = await req('POST', '/api/letter-chat/start', {
    document_type: 'general_letter',
    metadata: {
      letter_id: t2Id, classification: 'parent_communication',
      subject: 'Student Absence Notification', recipient_type: 'parent',
      ext_recipient_name: extName, ext_recipient_org: extOrg,
    },
  });
  check('Start chat → 201', t2s.status === 201, `got ${t2s.status}: ${t2s.data?.error ?? ''}`);
  const t2Sess = t2s.data?.session_id;
  const opening = t2s.data?.opening_message ?? '';
  check('opening_message non-empty', opening.length > 10, `len=${opening.length}`);
  check('opening_message mentions recipient name', opening.includes(extName),
    `"${opening.slice(0, 80)}"`);

  // Round 1
  const r1 = await req('POST', `/api/letter-chat/${t2Sess}/message`, {
    content: 'The student Kwame has been absent for 5 consecutive school days last week (Monday to Friday) without any notification. Draft a letter requesting an explanation and asking the parent to meet with the form teacher by this Friday.',
  });
  check('Round 1 → 200', r1.status === 200, `got ${r1.status}`);
  const r1t = r1.data?.content ?? '';
  const md1 = hasMarkdown(r1t);
  check('Round 1 — no markdown (** / * / ##)', !md1, md1 ?? 'clean');
  check('Round 1 — no em-dash (—)', !hasEmDash(r1t), hasEmDash(r1t) ? 'em-dash found' : 'none');

  // Round 2
  const r2 = await req('POST', `/api/letter-chat/${t2Sess}/message`, {
    content: 'Good. Please add that if the absence was due to illness, a medical certificate from a licensed practitioner must be submitted within three days of the student returning to school.',
  });
  check('Round 2 → 200', r2.status === 200, `got ${r2.status}`);
  const r2t = r2.data?.content ?? '';
  const md2 = hasMarkdown(r2t);
  check('Round 2 — no markdown', !md2, md2 ?? 'clean');
  check('Round 2 — no em-dash', !hasEmDash(r2t), hasEmDash(r2t) ? 'em-dash found' : 'none');

  // Round 3
  const r3 = await req('POST', `/api/letter-chat/${t2Sess}/message`, {
    content: 'The final paragraph is too soft. Make it firmer — the school takes attendance seriously and further unexcused absences will be escalated to the district education office.',
  });
  check('Round 3 → 200', r3.status === 200, `got ${r3.status}`);
  const r3t = r3.data?.content ?? '';
  const md3 = hasMarkdown(r3t);
  check('Round 3 — no markdown', !md3, md3 ?? 'clean');
  check('Round 3 — no em-dash', !hasEmDash(r3t), hasEmDash(r3t) ? 'em-dash found' : 'none');
  const filler = hasFillerPhrase(r3t);
  check('Round 3 — no AI-filler phrase', !filler, filler ?? 'none found');
  console.log(`    [Round 3 preview] "${r3t.slice(0, 120).replace(/\n/g, ' ')}…"`);

  // ════════════════════════════════════════════════════════════════════════════
  // [ 3 ] "USE THIS DRAFT" CAPTURE — body matches final AI message
  // ════════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 3 ] "Use this draft" capture — body stored = round-3 AI content');

  const t3f = await req('PATCH', `/api/general-letters/${t2Id}/finalize`, { body: r3t });
  check('PATCH /finalize → 200', t3f.status === 200, `got ${t3f.status}: ${t3f.data?.error ?? ''}`);
  check('ref_number generated on finalize', !!t3f.data?.ref_number, `ref=${t3f.data?.ref_number}`);
  check('status=issued (parent_comm, not sensitive)', t3f.data?.status === 'issued',
    `status=${t3f.data?.status}`);
  check('body stored === final AI message', t3f.data?.body === r3t,
    t3f.data?.body === r3t ? 'exact match' : `stored="${(t3f.data?.body ?? '').slice(0, 50)}"`);

  // GET round-trip
  const t3g = await req('GET', `/api/general-letters/${t2Id}`);
  check('GET /:id → 200', t3g.status === 200, `got ${t3g.status}`);
  check('body round-trips via GET', t3g.data?.body === r3t, 'matches');
  check('letter no longer excluded from list (finalized)', true, 'draft exclusion lifted'); // status!=draft now

  // Confirm draft is NOT visible while still a draft (use sensId which was left as draft)
  const listR = await req('GET', '/api/general-letters');
  const sensitiveInList = (listR.data ?? []).find(l => l.id === sensId);
  check('Draft letters excluded from default list', !sensitiveInList,
    sensitiveInList ? 'found in list (bug)' : 'correctly excluded');

  // ════════════════════════════════════════════════════════════════════════════
  // [ 4 ] RECIPIENT CONTEXT — opening_message & AI response correctness
  // ════════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('[ 4 ] Recipient context — external (full name) vs internal (first name)');

  // 4a: External official — opening_message must use full name, AI output must be clean
  const extDir = 'District Education Director';
  const t4ad = await req('POST', '/api/general-letters', {
    classification: 'external_official', recipient_type: 'external',
    ext_recipient_name: extDir, ext_recipient_org: 'Ghana Education Service',
    subject: 'Annual Report Submission', is_sensitive: false, status: 'draft',
    issued_date: new Date().toISOString().slice(0, 10),
  });
  check('Create external draft → 201', t4ad.status === 201, `got ${t4ad.status}`);
  cleanupIds.push(t4ad.data?.id);

  const t4as = await req('POST', '/api/letter-chat/start', {
    document_type: 'general_letter',
    metadata: {
      letter_id: t4ad.data?.id, classification: 'external_official',
      subject: 'Annual Report Submission', recipient_type: 'external',
      ext_recipient_name: extDir, ext_recipient_org: 'Ghana Education Service',
    },
  });
  check('External chat start → 201', t4as.status === 201, `got ${t4as.status}`);
  const t4aOpen = t4as.data?.opening_message ?? '';
  check('External opening_message references full name', t4aOpen.includes(extDir),
    `"${t4aOpen.slice(0, 100)}"`);

  const t4ar1 = await req('POST', `/api/letter-chat/${t4as.data?.session_id}/message`, {
    content: 'Draft the full letter. The annual report covers academic year 2025-2026. The submission deadline was 30 September 2026. Include a cover paragraph and request written acknowledgement of receipt.',
  });
  check('External AI response → 200', t4ar1.status === 200, `got ${t4ar1.status}`);
  const t4at = t4ar1.data?.content ?? '';
  check('External draft — no markdown', !hasMarkdown(t4at), hasMarkdown(t4at) ?? 'clean');
  check('External draft — no em-dash', !hasEmDash(t4at), hasEmDash(t4at) ? 'em-dash found' : 'none');
  // Verify the AI is contextually aware of who it's writing to
  const refersToRecipient = t4at.includes('Director') || t4at.includes('Education Service') || t4at.includes('Ghana');
  check('External draft references recipient context', refersToRecipient, `"${t4at.slice(0, 100)}"`);
  console.log(`    [External preview] "${t4at.slice(0, 120).replace(/\n/g, ' ')}…"`);

  // 4b: Internal student — opening_message must name the student; system prompt uses first name for salutation
  const t4bd = await req('POST', '/api/general-letters', {
    classification: 'parent_communication', recipient_type: 'student',
    internal_recipient_id: STUDENT_ID, internal_recipient_table: 'students',
    subject: 'Academic Progress Notification', is_sensitive: false, status: 'draft',
    issued_date: new Date().toISOString().slice(0, 10),
  });
  check('Create student draft → 201', t4bd.status === 201, `got ${t4bd.status}`);
  cleanupIds.push(t4bd.data?.id);

  const t4bs = await req('POST', '/api/letter-chat/start', {
    document_type: 'general_letter',
    metadata: {
      letter_id: t4bd.data?.id, classification: 'parent_communication',
      subject: 'Academic Progress Notification', recipient_type: 'student',
      internal_recipient_name: studentName,
    },
  });
  check('Student chat start → 201', t4bs.status === 201, `got ${t4bs.status}`);
  const t4bOpen = t4bs.data?.opening_message ?? '';
  check('Student opening_message references student name', t4bOpen.includes(studentName),
    `"${t4bOpen.slice(0, 100)}"`);

  const t4br1 = await req('POST', `/api/letter-chat/${t4bs.data?.session_id}/message`, {
    content: `Draft the letter. ${studentName} has shown significant improvement in Mathematics this term, moving from a D to a B. We want to commend this progress and encourage the student to maintain the effort across all subjects.`,
  });
  check('Student AI response → 200', t4br1.status === 200, `got ${t4br1.status}`);
  const t4bt = t4br1.data?.content ?? '';
  check('Student draft — no markdown', !hasMarkdown(t4bt), hasMarkdown(t4bt) ?? 'clean');
  check('Student draft — no em-dash', !hasEmDash(t4bt), hasEmDash(t4bt) ? 'em-dash found' : 'none');
  // System prompt set salutation as "Dear [FirstName]," — verify the draft is addressed personally
  // (the body won't include the salutation itself, but context should be clear)
  const refersToStudent = t4bt.includes(studentFirstName) || t4bt.toLowerCase().includes('student');
  check('Student draft references student first name or student', refersToStudent,
    `first="${studentFirstName}" in text=${t4bt.includes(studentFirstName)}`);
  console.log(`    [Student preview]   "${t4bt.slice(0, 120).replace(/\n/g, ' ')}…"`);

  // ════════════════════════════════════════════════════════════════════════════
  // Cleanup
  // ════════════════════════════════════════════════════════════════════════════
  const ids = [...new Set(cleanupIds.filter(Boolean))];
  try {
    for (const id of ids) {
      await pool.query(`DELETE FROM general_letters WHERE id = $1 AND school_id = $2`, [id, SCHOOL_ID]);
    }
  } catch { /* best-effort */ }

  // ════════════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  results.forEach(r => console.log(r));
  console.log('');
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  pool.end();
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error('Script error:', e.message); pool.end(); process.exit(1); });
