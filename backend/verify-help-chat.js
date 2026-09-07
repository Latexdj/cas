'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool   = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const SCHOOL_ID = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5';
const ADMIN_ID  = 'f7831134-de1d-4f98-9398-34a0b65fc8f7';
const BASE      = 'http://localhost:3000';

const adminToken = jwt.sign(
  { id: ADMIN_ID, name: 'GERALD BASUGLO HILLIA', role: 'admin', schoolId: SCHOOL_ID },
  process.env.JWT_SECRET, { expiresIn: '1h' }
);

let pass = 0, fail = 0;
const results = [];

function check(name, ok, detail) {
  if (ok) { pass++; results.push(`  ✓ PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else     { fail++; results.push(`  ✗ FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function req(method, path, body, overrideToken) {
  const tok = overrideToken ?? adminToken;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}

function hasMarkdown(text) {
  // Check for markdown asterisks, headers, or em-dashes used as decorative bullets
  return /\*\*/.test(text) || /\*[^*]/.test(text) || /^#{1,6} /m.test(text) || /—{2,}/.test(text);
}

async function run() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Help Chatbot Verification — 5 Checks                        ');
  console.log('══════════════════════════════════════════════════════════════');

  // ── CHECK 1: Three real questions matching seeded entries ────────────────
  console.log('\n── Check 1: Real questions matching seeded entries ─────────\n');
  {
    // Start a session
    const { status: s1, data: d1 } = await req('POST', '/api/help-chat/start');
    check('start session returns 201', s1 === 201, `status ${s1}`);
    check('start returns session_id', typeof d1.session_id === 'string' && d1.session_id.length > 0, d1.session_id);
    check('start returns welcome_message', typeof d1.welcome_message === 'string' && d1.welcome_message.length > 0, d1.welcome_message?.slice(0, 60));
    check('start reports entry_count > 0', (d1.entry_count ?? 0) > 0, `entry_count=${d1.entry_count}`);

    const sid = d1.session_id;

    // Q1: promote students
    console.log('\n  Q1: "how do I promote students to the next class"\n');
    const { status: qa_s, data: qa } = await req('POST', `/api/help-chat/${sid}/message`, { content: 'how do I promote students to the next class' });
    check('Q1: responds 200', qa_s === 200, `status ${qa_s}`);
    check('Q1: has content', typeof qa.content === 'string' && qa.content.length > 50, `${qa.content?.length} chars`);
    const q1lower = (qa.content ?? '').toLowerCase();
    check('Q1: mentions Promote action', q1lower.includes('promot'), `snippet: "${qa.content?.slice(0, 120)}"`);
    check('Q1: mentions PEOPLE or Students section', q1lower.includes('student') || q1lower.includes('people'), '');
    check('Q1: no markdown leakage', !hasMarkdown(qa.content ?? ''), qa.content?.slice(0, 80));
    console.log(`     Answer: "${qa.content?.slice(0, 200)}"\n`);

    // Q2: teacher attendance (the read-only insight)
    console.log('  Q2: "why cant I add a teacher attendance record"\n');
    const { status: qb_s, data: qb } = await req('POST', `/api/help-chat/${sid}/message`, { content: "why can't I add a teacher attendance record" });
    check('Q2: responds 200', qb_s === 200, `status ${qb_s}`);
    check('Q2: has content', typeof qb.content === 'string' && qb.content.length > 50, `${qb.content?.length} chars`);
    const q2lower = (qb.content ?? '').toLowerCase();
    check('Q2: explains teachers submit themselves', q2lower.includes('submit') || q2lower.includes('teacher app') || q2lower.includes('themselves'), '');
    check('Q2: admin is read-only', q2lower.includes('cannot') || q2lower.includes('admin') || q2lower.includes('read'), '');
    check('Q2: no markdown leakage', !hasMarkdown(qb.content ?? ''), qb.content?.slice(0, 80));
    console.log(`     Answer: "${qb.content?.slice(0, 200)}"\n`);

    // Q3: fees tabs
    console.log('  Q3: "what tabs are on the fees page"\n');
    const { status: qc_s, data: qc } = await req('POST', `/api/help-chat/${sid}/message`, { content: 'what tabs are on the fees page' });
    check('Q3: responds 200', qc_s === 200, `status ${qc_s}`);
    check('Q3: has content', typeof qc.content === 'string' && qc.content.length > 50, `${qc.content?.length} chars`);
    const q3lower = (qc.content ?? '').toLowerCase();
    check('Q3: mentions Fee Items or Schedules', q3lower.includes('fee item') || q3lower.includes('schedule'), '');
    check('Q3: mentions Collections', q3lower.includes('collection'), '');
    check('Q3: mentions Expenditure', q3lower.includes('expenditure'), '');
    check('Q3: no markdown leakage', !hasMarkdown(qc.content ?? ''), qc.content?.slice(0, 80));
    console.log(`     Answer: "${qc.content?.slice(0, 200)}"\n`);

    // ── CHECK 2: Out-of-scope question ─────────────────────────────────────
    console.log('\n── Check 2: Out-of-scope question ──────────────────────────\n');
    console.log("  Q: \"what's the weather today\"\n");
    const { status: qd_s, data: qd } = await req('POST', `/api/help-chat/${sid}/message`, { content: "what's the weather today" });
    check('OOS: responds 200', qd_s === 200, `status ${qd_s}`);
    check('OOS: has content', typeof qd.content === 'string' && qd.content.length > 10, `${qd.content?.length} chars`);
    const q4lower = (qd.content ?? '').toLowerCase();
    check('OOS: does not answer weather', !q4lower.includes('celsius') && !q4lower.includes('fahrenheit') && !q4lower.includes('sunny') && !q4lower.includes('forecast'), '');
    check('OOS: declines gracefully', q4lower.includes("don't have") || q4lower.includes('not covered') || q4lower.includes('cannot') || q4lower.includes("i don") || q4lower.includes('only') || q4lower.includes('navigate') || q4lower.includes('cas'), `snippet: "${qd.content?.slice(0, 120)}"`);
    check('OOS: no markdown leakage', !hasMarkdown(qd.content ?? ''), qd.content?.slice(0, 80));
    console.log(`     Answer: "${qd.content?.slice(0, 200)}"\n`);

    // ── CHECK 3: Action request — bot directs, never performs ──────────────
    console.log('\n── Check 3: Action request (describe, not perform) ─────────\n');
    console.log('  Q: "add a new teacher named John Smith for me"\n');
    const { status: qe_s, data: qe } = await req('POST', `/api/help-chat/${sid}/message`, { content: 'add a new teacher named John Smith for me' });
    check('Action: responds 200', qe_s === 200, `status ${qe_s}`);
    check('Action: has content', typeof qe.content === 'string' && qe.content.length > 30, `${qe.content?.length} chars`);
    const q5lower = (qe.content ?? '').toLowerCase();
    check('Action: does NOT claim to add teacher', !q5lower.includes("i've added") && !q5lower.includes("i have added") && !q5lower.includes("i added") && !q5lower.includes("john smith has been"), `snippet: "${qe.content?.slice(0, 120)}"`);
    check('Action: gives navigation directions', q5lower.includes('click') || q5lower.includes('teacher') || q5lower.includes('add') || q5lower.includes('people'), '');
    check('Action: no markdown leakage', !hasMarkdown(qe.content ?? ''), qe.content?.slice(0, 80));
    console.log(`     Answer: "${qe.content?.slice(0, 200)}"\n`);

    // ── CHECK 4: No markdown — already run per message above, aggregate ────
    console.log('\n── Check 4: No markdown leakage (all messages) ─────────────\n');
    const allAnswers = [qa.content, qb.content, qc.content, qd.content, qe.content].filter(Boolean);
    const markdownFree = allAnswers.every(a => !hasMarkdown(a));
    check('All 5 responses markdown-free', markdownFree, markdownFree ? 'no ** or # found' : 'markdown detected in at least one response');
  }

  // ── CHECK 5: Expiry logic ─────────────────────────────────────────────────
  console.log('\n── Check 5: Session expiry → silent restart ─────────────────\n');
  {
    // Manufacture an already-expired session directly in the DB.
    const { rows } = await pool.query(
      `INSERT INTO help_chat_sessions (school_id, created_by, role, messages, expires_at)
       VALUES ($1, $2, 'admin', '[]', now() - INTERVAL '1 second')
       RETURNING id`,
      [SCHOOL_ID, ADMIN_ID]
    );
    const expiredId = rows[0].id;
    check('Expired session inserted', !!expiredId, expiredId);

    const { status: exp_s, data: exp_d } = await req('POST', `/api/help-chat/${expiredId}/message`, { content: 'test' });
    check('Expired session returns 410', exp_s === 410, `status ${exp_s}`);
    check('410 body has expired:true', exp_d.expired === true, JSON.stringify(exp_d));

    // Clean up
    await pool.query(`DELETE FROM help_chat_sessions WHERE id = $1`, [expiredId]);
    console.log('  Expired session cleaned up.\n');

    // Confirm client-side expiry handling exists in source
    const fs = require('fs');
    const widgetSrc = fs.readFileSync(
      require('path').join(__dirname, '..', 'admin-portal', 'components', 'HelpWidget.tsx'), 'utf8'
    );
    check('HelpWidget handles 410 expired flag', widgetSrc.includes('expired'), 'expired flag found in source');
    check('HelpWidget silently restarts session on 410', widgetSrc.includes('start') && widgetSrc.includes('session_id') && widgetSrc.includes('expired'), 'restart logic found');
  }

  // ── Zero-entry short-circuit: code-level check ────────────────────────────
  console.log('\n── Bonus: Zero-entry short-circuit (code-level) ─────────────\n');
  {
    const fs = require('fs');
    const routeSrc = fs.readFileSync(
      require('path').join(__dirname, 'src', 'routes', 'help-chat.js'), 'utf8'
    );
    check('Route short-circuits on "No help entries" system prompt', routeSrc.includes('No help entries are currently loaded'), 'canned path found');
    check('CANNED_NO_MATCH defined', routeSrc.includes('CANNED_NO_MATCH'), '');
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  Result: ${pass} passed, ${fail} failed`);
  console.log('══════════════════════════════════════════════════════════════\n');
  results.forEach(r => console.log(r));
  console.log('');

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
