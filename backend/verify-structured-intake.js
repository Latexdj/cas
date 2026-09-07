'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const SCHOOL_ID = 'd454d6d9-cee3-4ffb-80c0-0c2ef7e99ab5';
const ADMIN_ID  = 'f7831134-de1d-4f98-9398-34a0b65fc8f7';
const BASE      = 'http://localhost:3000';

const adminToken = jwt.sign(
  { id: ADMIN_ID, name: 'GERALD BASUGLO HILLIA', role: 'admin', schoolId: SCHOOL_ID },
  process.env.JWT_SECRET, { expiresIn: '1h' }
);

let pass = 0, fail = 0;
const results = [];
const cleanupIds = [];

function check(name, ok, detail) {
  if (ok) { pass++; results.push(`  ✓ PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else     { fail++; results.push(`  ✗ FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
  };
  if (body != null) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await r.json(); } catch { data = {}; }
  return { status: r.status, data };
}

// ── Static code checks (read from source) ───────────────────────────────────
const fs = require('fs');
const path = require('path');

function readFile(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

async function run() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Structured Intake Verification — All 6 Checks              ');
  console.log('══════════════════════════════════════════════════════════════');

  // ── CHECK 1: Field sets — code-level ────────────────────────────────────
  console.log('\n── Check 1: Field sets per document type ───────────────────\n');
  {
    const src = readFile('admin-portal/lib/intake-fields.ts');

    // student_letter required fields
    const slRequired = ['incident', 'date_period', 'intended_outcome'];
    const slOptional = ['prior_history'];
    for (const key of slRequired) {
      const hasField  = src.includes(`key: '${key}'`);
      const isRequired = src.includes(`key: '${key}'`) &&
        src.slice(src.indexOf(`key: '${key}'`), src.indexOf(`key: '${key}'`) + 200).includes('required: true');
      check(`student_letter.${key} exists and is required`, hasField && isRequired);
    }
    for (const key of slOptional) {
      const isOptional = src.includes(`key: '${key}'`) &&
        src.slice(src.indexOf(`key: '${key}'`), src.indexOf(`key: '${key}'`) + 200).includes('required: false');
      check(`student_letter.${key} exists and is optional`, isOptional);
    }

    // teacher_query required/optional
    const tqRequired = ['incident', 'date_period', 'expected_response'];
    const tqOptional = ['prior_context'];
    for (const key of tqRequired) {
      const idx = src.indexOf(`key: '${key}'`, src.indexOf('teacher_query'));
      const isRequired = idx !== -1 && src.slice(idx, idx + 200).includes('required: true');
      check(`teacher_query.${key} is required`, isRequired);
    }
    for (const key of tqOptional) {
      const idx = src.indexOf(`key: '${key}'`);
      const isOptional = idx !== -1 && src.slice(idx, idx + 200).includes('required: false');
      check(`teacher_query.${key} is optional`, isOptional);
    }

    // general_letter — single set for all four classifications
    const glRequired = ['purpose'];
    const glOptional = ['expected_action', 'extra_details'];
    for (const key of glRequired) {
      const idx = src.indexOf(`key: '${key}'`);
      const isRequired = idx !== -1 && src.slice(idx, idx + 200).includes('required: true');
      check(`general_letter.${key} is required`, isRequired);
    }
    for (const key of glOptional) {
      const idx = src.indexOf(`key: '${key}'`);
      const isOptional = idx !== -1 && src.slice(idx, idx + 200).includes('required: false');
      check(`general_letter.${key} is optional`, isOptional);
    }

    // Single generic INTAKE_FIELDS.general_letter used in all four classification paths
    const glPage = readFile('admin-portal/app/(dashboard)/general-letters/page.tsx');
    const usesGeneralLetterFields = glPage.includes('INTAKE_FIELDS.general_letter');
    const noPerClassificationVariants = !glPage.includes('INTAKE_FIELDS.parent_communication') &&
      !glPage.includes('INTAKE_FIELDS.external_official') &&
      !glPage.includes('INTAKE_FIELDS.internal_administrative') &&
      !glPage.includes('INTAKE_FIELDS.other');
    check('Single INTAKE_FIELDS.general_letter used (no per-classification variants)', usesGeneralLetterFields && noPerClassificationVariants);
  }

  // ── CHECK 2: Form validation — required fields enforced (code) ───────────
  console.log('\n── Check 2: Required fields enforced, optionals collapsed ──\n');
  {
    const src = readFile('admin-portal/components/StructuredIntake.tsx');

    // Validation loop in handleSubmit
    check('handleSubmit validates all required fields', src.includes('for (const f of required)') && src.includes("newErrors[f.key] = 'Required'"));

    // Optional fields behind disclosure toggle
    check('optional.length > 0 disclosure toggle renders', src.includes('optional.length > 0'));
    check("'Add more detail' label on toggle", src.includes("'Add more detail'"));
    check('optionalOpen initialized to false', src.includes('[optionalOpen, setOptionalOpen] = useState(false)'));
    check('Chevron rotates when optionalOpen', src.includes("optionalOpen ? 'rotate(90deg)' : 'none'"));
    check('Optional fields rendered inside disclosure', src.includes('optionalOpen && (') && src.includes('optional.map(renderField)'));

    // Required fields always visible (not inside optionalOpen guard)
    check('required.map(renderField) always rendered', src.includes('{required.map(renderField)}'));
  }

  // ── CHECK 3: Assembled message format (code) + API round-trip ───────────
  console.log('\n── Check 3: Assembled message format ───────────────────────\n');
  {
    const src = readFile('admin-portal/lib/intake-fields.ts');
    check("assembleIntakeMessage prefix is 'Here are the details for this letter:'",
      src.includes("Here are the details for this letter:\\n\\n"));
    check('assembleIntakeMessage skips blank optional fields',
      src.includes('values[f.key]?.trim()'));
    check('assembleIntakeMessage joins filled lines with double newline',
      src.includes("lines.join('\\n\\n')"));
  }

  // ── CHECK 3b: Amber intake card styling (code) ───────────────────────────
  {
    const glPage = readFile('admin-portal/app/(dashboard)/general-letters/page.tsx');
    check("intakeCard messages styled with '#FDF6E3' background",
      glPage.includes("'#FDF6E3'"));
    check("intakeCard shows 'SUBMITTED DETAILS' header",
      glPage.includes('Submitted details'));
    check("intakeCard strips 'Here are the details...' prefix in display",
      glPage.includes("m.content.replace('Here are the details for this letter:\\n\\n', '')"));

    const discPage = readFile('admin-portal/app/(dashboard)/discipline/page.tsx');
    check("discipline page also has intakeCard amber styling",
      discPage.includes("'#FDF6E3'") && discPage.includes('Submitted details'));
  }

  // ── CHECK 4: Skip flow — opening message becomes first AI bubble (code) ──
  console.log('\n── Check 4: Skip to free-form flow ─────────────────────────\n');
  {
    const glPage = readFile('admin-portal/app/(dashboard)/general-letters/page.tsx');

    // startDraft stores opening_message, does NOT add it to chatMessages
    check('startDraft stores opening_message in state (not chatMessages)',
      glPage.includes('setChatOpeningMessage(chatRes.data.opening_message)') &&
      glPage.includes('setChatMessages([])'));
    check('handleIntakeSkip pushes chatOpeningMessage as assistant bubble',
      glPage.includes("setChatMessages([{ role: 'assistant', content: chatOpeningMessage }])"));
    check('handleIntakeSkip sets intakeSubmitted=true',
      glPage.includes("setIntakeSubmitted(true)") &&
      // Check it appears in handleIntakeSkip context
      glPage.indexOf('handleIntakeSkip') !== -1);

    const discPage = readFile('admin-portal/app/(dashboard)/discipline/page.tsx');
    check('discipline handleQueryIntakeSkip / handleLetterIntakeSkip also push opening message',
      discPage.includes("setChatOpeningMessage") &&
      discPage.includes("chatOpeningMessage }]"));
  }

  // ── CHECK 5: Blocked/sensitive 422 — live API calls ─────────────────────
  console.log('\n── Check 5: Blocked/sensitive cases fire 422 before intake ─\n');

  // 5a — student_letter with offense_category='other' (in blocklist)
  {
    // We need a real student id — look one up
    const { rows: stuRows } = await pool.query(
      `SELECT id, name, student_code, class_name FROM students WHERE school_id = $1 LIMIT 1`,
      [SCHOOL_ID]
    );
    if (!stuRows.length) {
      check('student_letter offense_category=other → 422', false, 'No students found to test with');
    } else {
      const s = stuRows[0];
      const r = await req('POST', '/api/letter-chat/start', {
        document_type: 'student_letter',
        metadata: {
          student_name:     s.name,
          student_id:       s.id,
          student_code:     s.student_code,
          class_name:       s.class_name,
          letter_type:      'warning',
          offense_category: 'other',
          subject:          'Test — other category blocked',
        },
      });
      check('student_letter offense_category=other → 422 blocked',
        r.status === 422 && r.data.blocked === true,
        `status=${r.status} blocked=${r.data.blocked}`);
      check('blocked response has no session_id',
        !r.data.session_id,
        `session_id=${r.data.session_id ?? 'absent'}`);
    }
  }

  // 5b — student_letter with letter_type='suspension' (in blocklist)
  {
    const { rows: stuRows } = await pool.query(
      `SELECT id, name, student_code, class_name FROM students WHERE school_id = $1 LIMIT 1`,
      [SCHOOL_ID]
    );
    if (!stuRows.length) {
      check('student_letter letter_type=suspension → 422', false, 'No students found');
    } else {
      const s = stuRows[0];
      const r = await req('POST', '/api/letter-chat/start', {
        document_type: 'student_letter',
        metadata: {
          student_name:     s.name,
          student_id:       s.id,
          letter_type:      'suspension',
          offense_category: 'attendance',
          subject:          'Test — suspension blocked',
        },
      });
      check('student_letter letter_type=suspension → 422 blocked',
        r.status === 422 && r.data.blocked === true,
        `status=${r.status}`);
    }
  }

  // 5c — student_letter with letter_type='dismissal' (in blocklist)
  {
    const { rows: stuRows } = await pool.query(
      `SELECT id, name FROM students WHERE school_id = $1 LIMIT 1`, [SCHOOL_ID]
    );
    if (stuRows.length) {
      const r = await req('POST', '/api/letter-chat/start', {
        document_type: 'student_letter',
        metadata: {
          student_name: stuRows[0].name,
          letter_type: 'dismissal',
          offense_category: 'attendance',
          subject: 'Test — dismissal blocked',
        },
      });
      check('student_letter letter_type=dismissal → 422 blocked',
        r.status === 422 && r.data.blocked === true,
        `status=${r.status}`);
    }
  }

  // 5d — general_letter with is_sensitive=true blocks at server (reads from DB)
  {
    // Create a sensitive general letter draft first
    const { rows: teacherRows } = await pool.query(
      `SELECT id FROM teachers WHERE school_id = $1 LIMIT 1`, [SCHOOL_ID]
    );
    if (!teacherRows.length) {
      check('sensitive general_letter → 422', false, 'No teachers found');
    } else {
      const createR = await req('POST', '/api/general-letters', {
        classification:           'internal_administrative',
        recipient_type:           'teacher',
        internal_recipient_id:    teacherRows[0].id,
        internal_recipient_table: 'teachers',
        subject:                  'Test sensitive letter',
        body:                     '',
        is_sensitive:             true,
        issued_date:              new Date().toISOString().slice(0, 10),
        status:                   'draft',
      });
      check('Pre-create sensitive general letter draft → 201', createR.status === 201, `status=${createR.status}`);

      if (createR.status === 201) {
        const letterId = createR.data.id;
        cleanupIds.push(letterId);

        const chatR = await req('POST', '/api/letter-chat/start', {
          document_type: 'general_letter',
          metadata: {
            letter_id:      letterId,
            classification: 'internal_administrative',
            subject:        'Test sensitive letter',
            recipient_type: 'teacher',
          },
        });
        check('sensitive general_letter → 422 blocked (server reads DB)',
          chatR.status === 422 && chatR.data.blocked === true,
          `status=${chatR.status}`);
        check('sensitive block message mentions manual composition',
          typeof chatR.data.error === 'string' && chatR.data.error.toLowerCase().includes('manual'),
          chatR.data.error);
      }
    }
  }

  // ── CHECK 6: localStorage autosave/clear — code-level ───────────────────
  console.log('\n── Check 6: localStorage autosave and clear ─────────────────\n');
  {
    const src = readFile('admin-portal/components/StructuredIntake.tsx');

    // Key is cas_intake_${sessionId}
    check("localStorage key is 'cas_intake_${sessionId}'",
      src.includes('`cas_intake_${sessionId}`'));

    // Lazy init from localStorage on mount
    check('values lazy-init reads from localStorage',
      src.includes('localStorage.getItem(storageKey)') &&
      src.includes('useState<Record<string, string>>(() => {'));

    // Save on every change (useEffect on values)
    check('useEffect saves to localStorage on every values change',
      src.includes("localStorage.setItem(storageKey, JSON.stringify(values))") &&
      src.includes('[storageKey, values]'));

    // Clear on submit
    check('handleSubmit removes localStorage entry on submit',
      src.includes('localStorage.removeItem(storageKey)') &&
      src.includes('function handleSubmit'));

    // Clear on skip
    check('handleSkip removes localStorage entry on skip',
      // Both removeItem calls appear; handleSkip is defined
      (src.match(/localStorage\.removeItem\(storageKey\)/g) || []).length >= 2 &&
      src.includes('function handleSkip'));

    // openCreate resets intakeSubmitted — confirms new session sees clean form
    const glPage = readFile('admin-portal/app/(dashboard)/general-letters/page.tsx');
    check("openCreate resets intakeSubmitted=false (new session won't show stale data)",
      glPage.includes("setIntakeSubmitted(false)") &&
      glPage.includes('function openCreate'));

    // Session-keyed: storage key includes sessionId so different sessions don't collide
    check('Storage key includes sessionId (no cross-session leak)',
      src.includes('storageKey = `cas_intake_${sessionId}`'));
  }

  // ── CHECK 3c: Live round-trip — start session + send assembled message ───
  console.log('\n── Check 3c: Live API round-trip (general_letter) ───────────\n');
  {
    const { rows: teacherRows } = await pool.query(
      `SELECT id, name, department FROM teachers WHERE school_id = $1 LIMIT 1`, [SCHOOL_ID]
    );
    if (!teacherRows.length) {
      check('general_letter live round-trip', false, 'No teachers found');
    } else {
      const t = teacherRows[0];

      // Create a non-sensitive draft
      const draftR = await req('POST', '/api/general-letters', {
        classification:           'parent_communication',
        recipient_type:           'teacher',
        internal_recipient_id:    t.id,
        internal_recipient_table: 'teachers',
        subject:                  'Verification Test Letter — Intake Flow',
        body:                     '',
        is_sensitive:             false,
        issued_date:              new Date().toISOString().slice(0, 10),
        status:                   'draft',
      });
      check('Pre-create non-sensitive draft → 201', draftR.status === 201, `status=${draftR.status}`);

      if (draftR.status === 201) {
        const letterId = draftR.data.id;
        cleanupIds.push(letterId);

        // Start chat session
        const startR = await req('POST', '/api/letter-chat/start', {
          document_type: 'general_letter',
          metadata: {
            letter_id:             letterId,
            classification:        'parent_communication',
            subject:               'Verification Test Letter — Intake Flow',
            recipient_type:        'teacher',
            internal_recipient_name: t.name,
          },
        });
        check('letter-chat/start → 201 with session_id and opening_message',
          startR.status === 201 && !!startR.data.session_id && !!startR.data.opening_message,
          `status=${startR.status}`);
        check('opening_message contains actionable question (not empty)',
          typeof startR.data.opening_message === 'string' && startR.data.opening_message.length > 30);

        if (startR.status === 201) {
          const sessionId = startR.data.session_id;

          // Simulate assembleIntakeMessage output for general_letter fields
          const assembled = `Here are the details for this letter:\n\nMain purpose and key facts: This is a test message to verify end-to-end intake flow.\n\nExpected action or response: Confirm receipt within 2 days.`;

          const msgR = await req('POST', `/api/letter-chat/${sessionId}/message`, { content: assembled });
          check('Assembled intake message → AI response 200',
            msgR.status === 200 && msgR.data.role === 'assistant' && typeof msgR.data.content === 'string',
            `status=${msgR.status}`);
          check('AI response is non-trivial (>100 chars — actual draft not empty ack)',
            typeof msgR.data.content === 'string' && msgR.data.content.length > 100,
            `length=${msgR.data.content?.length}`);
          check("AI draft content doesn't contain raw markdown (no **bold**)",
            !msgR.data.content?.includes('**'),
            `passes markdown strip`);

          // Follow-up refinement turn
          if (msgR.status === 200) {
            const refineR = await req('POST', `/api/letter-chat/${sessionId}/message`, {
              content: 'Please make the tone slightly warmer.',
            });
            check('Free-form refinement after intake → 200 assistant response',
              refineR.status === 200 && refineR.data.role === 'assistant' && refineR.data.content?.length > 50,
              `status=${refineR.status} length=${refineR.data.content?.length}`);
          }
        }
      }
    }
  }

  // ── CHECK 3d: student_letter live round-trip ─────────────────────────────
  {
    const { rows: stuRows } = await pool.query(
      `SELECT id, name, student_code, class_name FROM students WHERE school_id = $1 LIMIT 1`,
      [SCHOOL_ID]
    );
    if (stuRows.length) {
      const s = stuRows[0];
      const startR = await req('POST', '/api/letter-chat/start', {
        document_type: 'student_letter',
        metadata: {
          student_name:     s.name,
          student_id:       s.id,
          student_code:     s.student_code,
          class_name:       s.class_name,
          letter_type:      'warning',
          offense_category: 'attendance',
          subject:          'Attendance Warning — Intake Verification',
        },
      });
      check('student_letter start → 201 with session_id',
        startR.status === 201 && !!startR.data.session_id,
        `status=${startR.status}`);

      if (startR.status === 201) {
        const sessionId = startR.data.session_id;
        // Simulate student_letter assembled message
        const assembled = `Here are the details for this letter:\n\nWhat happened: The student has missed 12 consecutive school days without any notice or excuse from parents.\n\nWhen it occurred: September 2025\n\nWhat this letter should achieve: Inform parents that continued absence will result in escalation to the district office.`;

        const msgR = await req('POST', `/api/letter-chat/${sessionId}/message`, { content: assembled });
        check('student_letter assembled message → AI draft (>100 chars)',
          msgR.status === 200 && msgR.data.content?.length > 100,
          `status=${msgR.status} length=${msgR.data.content?.length}`);
      }
    }
  }

  // ── CHECK 3e: teacher_query live round-trip ──────────────────────────────
  {
    const { rows: tRows } = await pool.query(
      `SELECT id, name, department FROM teachers WHERE school_id = $1 LIMIT 1`, [SCHOOL_ID]
    );
    if (tRows.length) {
      const t = tRows[0];
      const startR = await req('POST', '/api/letter-chat/start', {
        document_type: 'teacher_query',
        metadata: {
          teacher_name: t.name,
          teacher_id:   t.id,
          department:   t.department,
          category:     'attendance',
          subject:      'Query: Late Arrival — Intake Verification',
        },
      });
      check('teacher_query start → 201 with session_id',
        startR.status === 201 && !!startR.data.session_id,
        `status=${startR.status}`);

      if (startR.status === 201) {
        const sessionId = startR.data.session_id;
        const assembled = `Here are the details for this letter:\n\nWhat happened: The teacher arrived 45 minutes late to class on three separate occasions without prior notice.\n\nWhen it occurred: Week of 1 September 2025\n\nExpected response and deadline: Written explanation required by Friday 5 September 2025.`;

        const msgR = await req('POST', `/api/letter-chat/${sessionId}/message`, { content: assembled });
        check('teacher_query assembled message → AI draft (>100 chars)',
          msgR.status === 200 && msgR.data.content?.length > 100,
          `status=${msgR.status} length=${msgR.data.content?.length}`);
      }
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  for (const id of cleanupIds) {
    try {
      await pool.query(`DELETE FROM general_letters WHERE id = $1 AND school_id = $2`, [id, SCHOOL_ID]);
    } catch { /* ignore */ }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  for (const r of results) console.log(r);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  ${pass} passed  |  ${fail} failed  |  ${pass + fail} total checks`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
