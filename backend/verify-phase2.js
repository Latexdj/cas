'use strict';
// Phase 2 verification — teacher & student portal help chatbot
// Checks: role scoping, Q&A accuracy, cross-role isolation, widget source
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const jwt  = require('jsonwebtoken');
const fs   = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const SCHOOL_ID = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5';
const ADMIN_ID  = 'f7831134-de1d-4f98-9398-34a0b65fc8f7';
const BASE      = 'http://localhost:3000';

let pass = 0, fail = 0;
const results = [];

function check(name, ok, detail) {
  const line = (ok ? '  ✓ PASS' : '  ✗ FAIL') + `  ${name}${detail ? ' — ' + detail : ''}`;
  results.push(line);
  if (ok) pass++; else fail++;
}

async function req(method, url, body, token) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${url}`, opts);
  let data; try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}

function mkToken(id, role, schoolId) {
  return jwt.sign({ id, name: `Test ${role}`, role, schoolId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

async function startSession(token) {
  const { status, data } = await req('POST', '/api/help-chat/start', null, token);
  return { status, sid: data.session_id, welcome: data.welcome_message, entryCount: data.entry_count, err: data.error };
}

async function ask(sid, content, token) {
  const { status, data } = await req('POST', `/api/help-chat/${sid}/message`, { content }, token);
  return { status, content: data.content ?? '', err: data.error };
}

function hasMarkdown(text) {
  return /\*\*/.test(text) || /\*[^*]/.test(text) || /^#{1,6} /m.test(text);
}

function mentions(text, ...terms) {
  const low = text.toLowerCase();
  return terms.some(t => low.includes(t.toLowerCase()));
}

async function run() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Phase 2 Verification                                        ');
  console.log('══════════════════════════════════════════════════════════════');

  // Get a real student ID from DB
  const { rows: sRows } = await pool.query(
    'SELECT id FROM students WHERE school_id = $1 AND status = $2 LIMIT 1',
    [SCHOOL_ID, 'Active']
  );
  const STUDENT_ID = sRows[0]?.id;
  if (!STUDENT_ID) { console.error('No active student found — aborting'); process.exit(1); }
  console.log(`\n  Using student ID: ${STUDENT_ID}`);

  const adminToken   = mkToken(ADMIN_ID,   'admin',   SCHOOL_ID);
  const teacherToken = mkToken(ADMIN_ID,   'teacher', SCHOOL_ID); // same teacher record, role=teacher
  const studentToken = mkToken(STUDENT_ID, 'student', SCHOOL_ID);

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 1: Role scoping — correct entry_count per role, no cross-contamination
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Check 1: Role scoping at /start ─────────────────────────\n');

  const admin   = await startSession(adminToken);
  const teacher = await startSession(teacherToken);
  const student = await startSession(studentToken);

  check('admin:   /start → 201',           admin.status === 201,     `status ${admin.status}`);
  check('teacher: /start → 201',           teacher.status === 201,   `status ${teacher.status}`);
  check('student: /start → 201',           student.status === 201,   `status ${student.status}`);

  check('teacher: entry_count = 5 (teacher entries only)', teacher.entryCount === 5, `entry_count=${teacher.entryCount}`);
  check('student: entry_count = 3 (student entries only)', student.entryCount === 3, `entry_count=${student.entryCount}`);
  check('admin:   entry_count ≥ 12 (admin entries)',       (admin.entryCount ?? 0) >= 12, `entry_count=${admin.entryCount}`);

  // Confirm scoping by checking DB directly
  const { rows: tRows } = await pool.query(
    `SELECT COUNT(*) FROM help_entries WHERE is_active=true AND school_id IS NULL AND applicable_roles @> ARRAY['teacher']::TEXT[]`
  );
  const { rows: stRows } = await pool.query(
    `SELECT COUNT(*) FROM help_entries WHERE is_active=true AND school_id IS NULL AND applicable_roles @> ARRAY['student']::TEXT[]`
  );
  check('DB: 5 teacher entries in help_entries', parseInt(tRows[0].count) === 5, `count=${tRows[0].count}`);
  check('DB: 3 student entries in help_entries', parseInt(stRows[0].count) === 3, `count=${stRows[0].count}`);

  if (teacher.status !== 201 || student.status !== 201) {
    console.log('\n  FATAL: sessions failed — cannot continue\n');
    results.forEach(r => console.log(r));
    await pool.end();
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 2: Teacher Q&A — 3 real questions
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Check 2: Teacher Q&A (3 questions) ──────────────────────\n');

  {
    const q = 'How do I submit my attendance?';
    console.log(`  Q: "${q}"`);
    const { status, content } = await ask(teacher.sid, q, teacherToken);
    check('T-Q1: responds 200',               status === 200, `status ${status}`);
    check('T-Q1: has content',                content.length > 40, `${content.length} chars`);
    check('T-Q1: mentions QR scan',           mentions(content, 'qr', 'scan', 'scan'), content.slice(0, 80));
    check('T-Q1: mentions two-step / Step 1', mentions(content, 'step', 'two', 'step 1', 'step-1'), '');
    check('T-Q1: mentions photo',             mentions(content, 'photo'), '');
    check('T-Q1: no markdown',                !hasMarkdown(content), content.slice(0, 60));
    console.log(`     → "${content.slice(0, 160)}"\n`);
  }

  {
    const q = 'How do I publish an LMS course so students can see it?';
    console.log(`  Q: "${q}"`);
    const { status, content } = await ask(teacher.sid, q, teacherToken);
    check('T-Q2: responds 200',           status === 200, `status ${status}`);
    check('T-Q2: has content',            content.length > 40, `${content.length} chars`);
    check('T-Q2: mentions Publish',       mentions(content, 'publish'), content.slice(0, 80));
    check('T-Q2: mentions course card or sidebar', mentions(content, 'course', 'sidebar', 'my courses'), '');
    check('T-Q2: no markdown',            !hasMarkdown(content), content.slice(0, 60));
    console.log(`     → "${content.slice(0, 160)}"\n`);
  }

  {
    const q = 'I received a query letter — where do I go to respond to it?';
    console.log(`  Q: "${q}"`);
    const { status, content } = await ask(teacher.sid, q, teacherToken);
    check('T-Q3: responds 200',              status === 200, `status ${status}`);
    check('T-Q3: has content',               content.length > 40, `${content.length} chars`);
    check('T-Q3: mentions Conduct sidebar',  mentions(content, 'conduct'), content.slice(0, 80));
    check('T-Q3: mentions Acknowledge',      mentions(content, 'acknowledge', 'acknowledg'), '');
    check('T-Q3: no markdown',               !hasMarkdown(content), content.slice(0, 60));
    console.log(`     → "${content.slice(0, 160)}"\n`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 3: Student Q&A — 3 real questions
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Check 3: Student Q&A (3 questions) ──────────────────────\n');

  {
    const q = 'How do I request an exeat to go home?';
    console.log(`  Q: "${q}"`);
    const { status, content } = await ask(student.sid, q, studentToken);
    check('S-Q1: responds 200',              status === 200, `status ${status}`);
    check('S-Q1: has content',               content.length > 40, `${content.length} chars`);
    check('S-Q1: mentions housemaster',      mentions(content, 'housemaster'), content.slice(0, 80));
    check('S-Q1: mentions type / Internal',  mentions(content, 'internal', 'external', 'type'), '');
    check('S-Q1: mentions Request button',   mentions(content, 'request', 'tap', 'click'), '');
    check('S-Q1: no markdown',               !hasMarkdown(content), content.slice(0, 60));
    console.log(`     → "${content.slice(0, 160)}"\n`);
  }

  {
    const q = 'My clearance says Action Required — what does that mean?';
    console.log(`  Q: "${q}"`);
    const { status, content } = await ask(student.sid, q, studentToken);
    check('S-Q2: responds 200',              status === 200, `status ${status}`);
    check('S-Q2: has content',               content.length > 40, `${content.length} chars`);
    check('S-Q2: mentions office/contact',   mentions(content, 'office', 'contact'), content.slice(0, 80));
    check('S-Q2: mentions Not Cleared',      mentions(content, 'not cleared', 'reason', 'flag'), '');
    check('S-Q2: no markdown',               !hasMarkdown(content), content.slice(0, 60));
    console.log(`     → "${content.slice(0, 160)}"\n`);
  }

  {
    const q = 'How do I see my exam results and print my report card?';
    console.log(`  Q: "${q}"`);
    const { status, content } = await ask(student.sid, q, studentToken);
    check('S-Q3: responds 200',              status === 200, `status ${status}`);
    check('S-Q3: has content',               content.length > 40, `${content.length} chars`);
    check('S-Q3: mentions Results sidebar',  mentions(content, 'results'), content.slice(0, 80));
    check('S-Q3: mentions Print / PDF',      mentions(content, 'print', 'pdf', 'report card'), '');
    check('S-Q3: mentions semester filter',  mentions(content, 'semester', 'academic year', 'filter', 'dropdown'), '');
    check('S-Q3: no markdown',               !hasMarkdown(content), content.slice(0, 60));
    console.log(`     → "${content.slice(0, 160)}"\n`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 4: Cross-role isolation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Check 4: Cross-role isolation ────────────────────────────\n');

  // Teacher asks an admin-only question
  {
    const q = 'How do I promote students to the next class?';
    console.log(`  Teacher asks admin question: "${q}"`);
    const { status, content } = await ask(teacher.sid, q, teacherToken);
    check('Cross: teacher→admin-Q: 200',        status === 200, `status ${status}`);
    // Should NOT give the admin answer (mentions "PEOPLE", "Promote" as a nav action)
    const gaveAdminAnswer = mentions(content, 'people →', 'people→', 'promote button', 'bulk');
    check('Cross: teacher→admin-Q: does NOT give admin nav answer',  !gaveAdminAnswer, content.slice(0, 100));
    // Should decline / redirect
    const declines = mentions(content, "don't have", "not covered", "don't know", "cannot", "only", "contact", "outside");
    check('Cross: teacher→admin-Q: declines or redirects', declines, content.slice(0, 120));
    console.log(`     → "${content.slice(0, 160)}"\n`);
  }

  // Student asks a teacher-only question
  {
    const q = 'How do I mark a student absent in my attendance submission?';
    console.log(`  Student asks teacher question: "${q}"`);
    const { status, content } = await ask(student.sid, q, studentToken);
    check('Cross: student→teacher-Q: 200',        status === 200, `status ${status}`);
    // Should NOT describe the teacher 2-step flow
    const gaveTeacherAnswer = mentions(content, 'step 1', 'step-1', 'scan qr', 'classroom photo', 'lesson slot');
    check('Cross: student→teacher-Q: does NOT give teacher flow',  !gaveTeacherAnswer, content.slice(0, 100));
    const declines = mentions(content, "don't have", "not covered", "don't know", "cannot", "only", "contact", "outside", "not able");
    check('Cross: student→teacher-Q: declines or redirects', declines, content.slice(0, 120));
    console.log(`     → "${content.slice(0, 160)}"\n`);
  }

  // Student asks a teacher-only question (second one)
  {
    const q = 'How do I use Draft with AI for form class remarks?';
    console.log(`  Student asks teacher form-class question: "${q}"`);
    const { status, content } = await ask(student.sid, q, studentToken);
    check('Cross: student→teacher-Q2: 200',       status === 200, `status ${status}`);
    const gaveTeacherAnswer = mentions(content, 'attitude', 'conduct dropdown', 'save all', 'form class');
    check('Cross: student→teacher-Q2: does NOT give form-class teacher answer', !gaveTeacherAnswer, content.slice(0, 100));
    console.log(`     → "${content.slice(0, 160)}"\n`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 5: Widget source check (can't run a browser — verify code)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n── Check 5: Widget source (code-level) ─────────────────────\n');

  const ROOT = path.join(__dirname, '..', 'admin-portal');
  const widgetSrc      = fs.readFileSync(path.join(ROOT, 'components', 'HelpWidget.tsx'), 'utf8');
  const teacherShell   = fs.readFileSync(path.join(ROOT, 'app', 'teacher', 'TeacherShell.tsx'), 'utf8');
  const studentShell   = fs.readFileSync(path.join(ROOT, 'app', 'student', 'StudentShell.tsx'), 'utf8');

  check('HelpWidget: accepts apiClient prop',            widgetSrc.includes('apiClient'), '');
  check('HelpWidget: uses client (not api) for calls',   widgetSrc.includes('client.post') && !widgetSrc.includes('api.post'), '');
  check('HelpWidget: AxiosInstance import',              widgetSrc.includes('AxiosInstance'), '');
  check('HelpWidget: still handles 410 expiry',          widgetSrc.includes('expired') && widgetSrc.includes('session_id'), '');

  check('TeacherShell: imports HelpWidget',              teacherShell.includes("from '@/components/HelpWidget'"), '');
  check('TeacherShell: renders <HelpWidget apiClient={teacherApi} />', teacherShell.includes('apiClient={teacherApi}'), '');
  check('TeacherShell: HelpWidget is outside NO_SHELL guard',
    teacherShell.indexOf('<HelpWidget') > teacherShell.indexOf('NO_SHELL_PATHS.includes'), '');

  check('StudentShell: imports studentApi',              studentShell.includes("from '@/lib/student-api'"), '');
  check('StudentShell: imports HelpWidget',              studentShell.includes("from '@/components/HelpWidget'"), '');
  check('StudentShell: renders <HelpWidget apiClient={studentApi} />', studentShell.includes('apiClient={studentApi}'), '');
  check('StudentShell: HelpWidget is outside NO_SHELL guard',
    studentShell.indexOf('<HelpWidget') > studentShell.indexOf('NO_SHELL_PATHS.includes'), '');

  // ── Final tally ──────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  Result: ${pass} passed, ${fail} failed`);
  console.log('══════════════════════════════════════════════════════════════\n');
  results.forEach(r => console.log(r));
  console.log('');

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
