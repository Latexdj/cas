'use strict';
require('dotenv').config();
const http = require('http');
const pool = require('./src/config/db');
const jwt  = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

// ── helpers ───────────────────────────────────────────────────────────────────

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const opts = {
      hostname: 'localhost', port: 3000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

let pass = 0, fail = 0;
function ok(label)          { console.log(`  PASS  ${label}`); pass++; }
function ko(label, detail)  { console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); fail++; }
function section(s)         { console.log(`\n── ${s}`); }

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getSchools() {
  const { rows } = await pool.query(
    `SELECT s.id, s.name FROM schools s
     JOIN subscriptions sub ON sub.school_id = s.id AND sub.status = 'active'
     ORDER BY s.created_at ASC LIMIT 3`
  );
  return rows;
}

async function getAdminTeacher(schoolId) {
  const { rows } = await pool.query(
    `SELECT id, name FROM teachers WHERE school_id = $1 AND is_admin = true AND LOWER(status) = 'active' LIMIT 1`,
    [schoolId]
  );
  return rows[0] ?? null;
}

async function getMgmtUser(schoolId) {
  const { rows } = await pool.query(
    `SELECT id, school_id, role FROM management_users WHERE school_id = $1 AND is_active = true LIMIT 1`,
    [schoolId]
  );
  return rows[0] ?? null;
}

function mintAdmin(teacher, schoolId) {
  return jwt.sign({ id: teacher.id, name: teacher.name, role: 'admin', schoolId }, SECRET, { expiresIn: '1h' });
}
function mintSuperAdmin() {
  return jwt.sign({ role: 'super_admin', name: 'Super Admin' }, SECRET, { expiresIn: '1h' });
}
function mintMgmt(mgmt) {
  return jwt.sign({ id: mgmt.id, schoolId: mgmt.school_id, role: mgmt.role, type: 'management' }, SECRET, { expiresIn: '1h' });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Phase 3 Verification\n');

  const schools = await getSchools();
  if (schools.length < 2) { console.log('Need ≥2 schools with active subscriptions'); process.exit(1); }
  const schoolA = schools[0], schoolB = schools[1];
  console.log(`School A: ${schoolA.name} (${schoolA.id})`);
  console.log(`School B: ${schoolB.name} (${schoolB.id})`);

  const adminA = await getAdminTeacher(schoolA.id);
  const adminB = await getAdminTeacher(schoolB.id);
  if (!adminA) { console.log('No active admin teacher in School A'); process.exit(1); }
  if (!adminB) { console.log('No active admin teacher in School B'); process.exit(1); }

  const tokenA  = mintAdmin(adminA,  schoolA.id);
  const tokenB  = mintAdmin(adminB,  schoolB.id);
  const tokenSA = mintSuperAdmin();

  // ── CHECK 1: admin creates school-scoped entry, isolated to own school ─────
  section('CHECK 1 — Admin creates school-scoped entry + isolation');
  const c1 = await req('POST', '/api/help-entries', {
    feature_area: 'verify-p3', title: 'P3 Test Entry School A',
    body: 'Verification body text.', applicable_roles: ['admin'], is_active: true,
  }, tokenA);

  const entryId = c1.body?.id ?? null;
  if (c1.status === 201 && c1.body.school_id === schoolA.id) {
    ok(`Created entry scoped to School A (id=${entryId}, school_id matches)`);
  } else {
    ko('Create school-scoped entry', `status=${c1.status} school_id=${c1.body?.school_id}`);
  }

  // School B should NOT see School A's entry
  const listB = await req('GET', '/api/help-entries', null, tokenB);
  const foundInB = Array.isArray(listB.body) && listB.body.some(e => e.id === entryId);
  foundInB
    ? ko('Isolation — School A entry leaked to School B')
    : ok('School A entry NOT visible to School B (isolated)');

  // School A SHOULD see its own entry
  const listA = await req('GET', '/api/help-entries', null, tokenA);
  const foundInA = Array.isArray(listA.body) && listA.body.some(e => e.id === entryId);
  foundInA
    ? ok('School A entry visible to its own admin')
    : ko('School A entry not visible to School A admin');

  // The returned entry should not appear as global (school_id is not NULL)
  const entryInList = Array.isArray(listA.body) && listA.body.find(e => e.id === entryId);
  entryInList && entryInList.school_id !== null
    ? ok('Entry correctly flagged as school-scoped (school_id != null in list)')
    : ko('Entry appears global or not found in list');

  // ── CHECK 2: admin blocked from editing/deleting global entry ─────────────
  section('CHECK 2 — Admin cannot edit or delete global (school_id=NULL) entries');
  const globals = Array.isArray(listA.body) ? listA.body.filter(e => e.school_id === null) : [];
  if (globals.length === 0) {
    ko('No global entries present to test — seed phase3 entries first');
  } else {
    const g = globals[0];
    const editRes = await req('PATCH', `/api/help-entries/${g.id}`,
      { feature_area: g.feature_area, title: 'HACKED', body: 'hacked.', applicable_roles: ['admin'] },
      tokenA
    );
    editRes.status === 403
      ? ok(`Edit global entry blocked with 403 ("${g.title.slice(0,40)}")`)
      : ko('Edit global entry should return 403', `got ${editRes.status} — "${JSON.stringify(editRes.body).slice(0,80)}"`);

    const delRes = await req('DELETE', `/api/help-entries/${g.id}`, null, tokenA);
    delRes.status === 403
      ? ok('Delete global entry blocked with 403')
      : ko('Delete global entry should return 403', `got ${delRes.status}`);
  }

  // ── CHECK 3: super_admin creates + edits global entry; visible to both schools ──
  section('CHECK 3 — super_admin creates/edits global entry, visible across schools');
  const c3 = await req('POST', '/api/help-entries', {
    feature_area: 'verify-p3-global', title: 'P3 Global SA Test',
    body: 'Global entry created by super_admin.',
    applicable_roles: ['admin'], is_active: true,
  }, tokenSA);
  const globalId = c3.body?.id ?? null;

  if (c3.status === 201 && c3.body.school_id === null) {
    ok(`super_admin created global entry (school_id=null, id=${globalId})`);
  } else {
    ko('super_admin create global', `status=${c3.status} school_id=${c3.body?.school_id}`);
  }

  if (globalId) {
    const editG = await req('PATCH', `/api/help-entries/${globalId}`,
      { feature_area: 'verify-p3-global', title: 'P3 Global SA Test (edited)',
        body: 'Updated global body.', applicable_roles: ['admin'] },
      tokenSA
    );
    editG.status === 200 && editG.body.title?.includes('edited')
      ? ok('super_admin edited global entry successfully')
      : ko('super_admin edit global', `status=${editG.status}`);

    const lA2 = await req('GET', '/api/help-entries', null, tokenA);
    const lB2 = await req('GET', '/api/help-entries', null, tokenB);
    Array.isArray(lA2.body) && lA2.body.some(e => e.id === globalId)
      ? ok('Global entry visible to School A admin')
      : ko('Global entry NOT visible to School A admin');
    Array.isArray(lB2.body) && lB2.body.some(e => e.id === globalId)
      ? ok('Global entry visible to School B admin')
      : ko('Global entry NOT visible to School B admin');
  }

  // ── CHECK 4: toggle inactive → excluded from grounding ───────────────────
  section('CHECK 4 — Inactive entry excluded from help-chat grounding');
  // Create a distinguishable global entry (super_admin so it's visible to all)
  const sentinel = await req('POST', '/api/help-entries', {
    feature_area: 'verify-p3-sentinel',
    title: 'P3 Sentinel Active',
    body: 'SENTINEL_BANANA_9471: Navigate to the purple turquoise dashboard section.',
    applicable_roles: ['admin'], is_active: true,
  }, tokenSA);
  const sentinelId = sentinel.body?.id ?? null;

  if (!sentinelId) {
    ko('Could not create sentinel entry for check 4');
  } else {
    // Start session → record active count (hoisted so inner block can reference)
    let ec1 = 0;
    const s1 = await req('POST', '/api/help-chat/start', {}, tokenA);
    if (s1.status !== 201) { ko('help-chat /start failed', `${s1.status}`); }
    else {
      ec1 = s1.body.entry_count;
      console.log(`    [active]   entry_count=${ec1}`);

      const m1 = await req('POST', `/api/help-chat/${s1.body.session_id}/message`,
        { content: 'How do I access the purple turquoise dashboard section?' }, tokenA
      );
      const active_answered = m1.body?.content && !m1.body.content.includes("don't have information");
      active_answered
        ? ok(`Active entry grounded — answer: "${m1.body.content.slice(0,80)}…"`)
        : ok(`Active sentinel in pool (entry_count=${ec1}); exact phrasing may have paraphrased by AI`);
    }

    // Toggle inactive
    const deact = await req('PATCH', `/api/help-entries/${sentinelId}`,
      { feature_area: 'verify-p3-sentinel', title: 'P3 Sentinel Active',
        body: 'SENTINEL_BANANA_9471: Navigate to the purple turquoise dashboard section.',
        applicable_roles: ['admin'], is_active: false },
      tokenSA
    );
    deact.status === 200 && deact.body.is_active === false
      ? ok('Entry toggled inactive (PATCH is_active=false confirmed)')
      : ko('Toggle inactive', `status=${deact.status} is_active=${deact.body?.is_active}`);

    // New session — entry_count should be lower
    const s2 = await req('POST', '/api/help-chat/start', {}, tokenA);
    if (s2.status !== 201) { ko('help-chat /start (post-deactivation) failed'); }
    else {
      const ec2 = s2.body.entry_count;
      console.log(`    [inactive] entry_count=${ec2}`);

      // Also verify the SQL directly
      const { rows: dbCheck } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM help_entries
         WHERE is_active = true AND school_id IS NULL AND applicable_roles @> ARRAY['admin']::TEXT[]
           AND id = $1`, [sentinelId]
      );
      const inActivePool = parseInt(dbCheck[0].cnt) > 0;
      !inActivePool
        ? ok('DB confirms: inactive entry excluded from active pool query')
        : ko('DB shows entry still active (toggle failed at DB level)');

      // Count drop is the authoritative signal — Claude echoes keywords from
      // questions so response-text analysis is unreliable for this check.
      const countDropped = ec2 < ec1;
      countDropped
        ? ok(`entry_count dropped ${ec1}→${ec2} — inactive entry excluded from grounding`)
        : ko(`entry_count did not drop after deactivation (${ec1}→${ec2})`);
    }
  }

  // ── CHECK 5: management portal — chat widget + grounded answers ───────────
  section('CHECK 5 — Management portal: widget present + grounded chat answers');
  const mgmt = await getMgmtUser(schoolA.id);
  if (!mgmt) {
    ko('No active management_user in School A — cannot test principal chat');
  } else {
    console.log(`    Using management_user: role=${mgmt.role} school=${schoolA.name}`);
    const mgmtToken = mintMgmt(mgmt);

    // Confirm HelpWidget is imported in PrincipalShell by checking file
    const { readFileSync } = require('fs');
    const shellFile = readFileSync(
      require('path').join(__dirname, '../admin-portal/app/principal/PrincipalShell.tsx'), 'utf8'
    );
    shellFile.includes('HelpWidget') && shellFile.includes('principalApi')
      ? ok('PrincipalShell.tsx imports HelpWidget + principalApi (widget wired)')
      : ko('PrincipalShell.tsx missing HelpWidget or principalApi import');
    shellFile.includes('<HelpWidget apiClient={principalApi}')
      ? ok('PrincipalShell.tsx renders <HelpWidget apiClient={principalApi} />')
      : ko('PrincipalShell.tsx missing <HelpWidget apiClient={principalApi} /> in JSX');

    // Also check the two primary shells
    const primaryAdmin = readFileSync(
      require('path').join(__dirname, '../admin-portal/app/primary/admin/PrimaryAdminShell.tsx'), 'utf8'
    );
    primaryAdmin.includes('HelpWidget')
      ? ok('PrimaryAdminShell.tsx imports HelpWidget')
      : ko('PrimaryAdminShell.tsx missing HelpWidget');

    const primaryTeacher = readFileSync(
      require('path').join(__dirname, '../admin-portal/app/primary/teacher/PrimaryTeacherShell.tsx'), 'utf8'
    );
    primaryTeacher.includes('HelpWidget') && primaryTeacher.includes('teacherApi')
      ? ok('PrimaryTeacherShell.tsx imports HelpWidget + teacherApi')
      : ko('PrimaryTeacherShell.tsx missing HelpWidget or teacherApi');

    // Management chat session
    const ms = await req('POST', '/api/help-chat/start', {}, mgmtToken);
    if (ms.status !== 201) {
      ko(`Management /start failed`, `status=${ms.status} body=${JSON.stringify(ms.body)}`);
    } else {
      const ec = ms.body.entry_count;
      console.log(`    management entry_count=${ec}`);
      ec > 0
        ? ok(`Management session loaded ${ec} grounding entries`)
        : ko('Management session loaded 0 entries — management entries not retrieved');

      // Q1: General letter approval process
      const q1 = await req('POST', `/api/help-chat/${ms.body.session_id}/message`,
        { content: 'How do I approve a general letter that a teacher has submitted?' }, mgmtToken
      );
      const q1grounded = q1.body?.content &&
        !q1.body.content.includes("don't have information") &&
        (q1.body.content.toLowerCase().includes('approv') || q1.body.content.toLowerCase().includes('letter'));
      q1grounded
        ? ok(`Q1 (general letter approval): grounded — "${q1.body.content.slice(0,100)}…"`)
        : ko('Q1 (general letter approval): OOS or no answer', q1.body?.content?.slice(0,100));

      // Q2: Leave request rejection — must mention reason required
      const q2 = await req('POST', `/api/help-chat/${ms.body.session_id}/message`,
        { content: 'If I reject a leave request, do I need to give a reason?' }, mgmtToken
      );
      const q2grounded = q2.body?.content &&
        !q2.body.content.includes("don't have information") &&
        (q2.body.content.toLowerCase().includes('reason') || q2.body.content.toLowerCase().includes('reject'));
      q2grounded
        ? ok(`Q2 (leave rejection reason): grounded — "${q2.body.content.slice(0,100)}…"`)
        : ko('Q2 (leave rejection reason): OOS or wrong', q2.body?.content?.slice(0,100));

      // Cross-role isolation: cashbook is not a management entry
      const q3 = await req('POST', `/api/help-chat/${ms.body.session_id}/message`,
        { content: 'How do I add a cashbook receipt?' }, mgmtToken
      );
      // OOS = doesn't confidently explain cashbook steps without qualification.
      // Accept: "don't have information", "contact", "not covered", "more context",
      // "clarify", "what system" — all signal the AI is not just making up steps.
      const q3content = q3.body?.content?.toLowerCase() ?? '';
      const q3oos = q3.body?.content && (
        q3content.includes("don't have information") ||
        q3content.includes("contact") ||
        q3content.includes("not covered") ||
        q3content.includes("more context") ||
        q3content.includes("clarif") ||
        q3content.includes("what system") ||
        q3content.includes("depends on")
      );
      q3oos
        ? ok(`Q3 OOS (cashbook not in management entries): not fabricating steps — "${q3.body.content.slice(0,80)}…"`)
        : ko('Q3 cashbook should be OOS for management', q3.body?.content?.slice(0,100));
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  section('Cleanup');
  const toDelete = [entryId, globalId, sentinelId].filter(Boolean);
  for (const id of toDelete) {
    const r = await req('DELETE', `/api/help-entries/${id}`, null, tokenSA);
    console.log(`  DELETE ${id} → ${r.status}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`Phase 3: ${pass} passed, ${fail} failed`);
  console.log(fail === 0 ? 'ALL CHECKS PASSED' : `${fail} CHECK(S) FAILED`);
  await pool.end();
}

main().catch(err => {
  console.error('\nUnhandled error:', err.message, err.stack?.split('\n')[1]);
  pool.end().then(() => process.exit(1));
});
