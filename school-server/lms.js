'use strict';
// Offline LMS for the CAS School Server.
//
// Students and teachers sign in with their CAS code and password (the server
// keeps the hashed passwords it copies from CAS). Teachers make tests here or
// in CAS; students take them on tablets on the school Wi-Fi; results go back
// to CAS whenever this PC is online.
//
// Data lives in data/cas.db (Node's built-in SQLite).

const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('./vendor/bcryptjs.js');

const LETTERS = ['a', 'b', 'c', 'd', 'e'];
const SESSION_HOURS = 12;
const GRACE_MS = 30 * 1000;
const SYNC_EVERY_MS = 10 * 60 * 1000;
const DEFAULT_STUDENT_PASSWORD = 'Student123';

module.exports = function createLms(ctx) {
  const { DATA, log, send, readBody } = ctx;
  const db = new DatabaseSync(path.join(DATA, 'cas.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, code TEXT, code_key TEXT, name TEXT, class_name TEXT, pin_hash TEXT);
    CREATE INDEX IF NOT EXISTS ix_students_code ON students(code_key);
    CREATE TABLE IF NOT EXISTS teachers (id TEXT PRIMARY KEY, code TEXT, code_key TEXT, name TEXT, pin_hash TEXT);
    CREATE INDEX IF NOT EXISTS ix_teachers_code ON teachers(code_key);
    CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, teacher_id TEXT, subject TEXT, class_name TEXT);
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY, origin TEXT NOT NULL, cloud_id TEXT UNIQUE, teacher_id TEXT, subject TEXT, class_name TEXT,
      title TEXT, instructions TEXT, time_limit_mins INTEGER, max_attempts INTEGER DEFAULT 1, randomise INTEGER DEFAULT 0,
      show_answers INTEGER DEFAULT 1, status TEXT NOT NULL DEFAULT 'draft', dirty INTEGER DEFAULT 0,
      created_at TEXT, updated_at TEXT, removed_in_cas INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE, sort INTEGER, type TEXT,
      text TEXT, options TEXT, correct TEXT, explanation TEXT, marks REAL DEFAULT 1, cloud_id TEXT);
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE, student_id TEXT NOT NULL,
      started_at TEXT, deadline_at TEXT, submitted_at TEXT, score REAL, max_score REAL,
      status TEXT NOT NULL DEFAULT 'in_progress', needs_marking INTEGER DEFAULT 0, dirty INTEGER DEFAULT 0, sent_at TEXT);
    CREATE INDEX IF NOT EXISTS ix_attempts_quiz ON attempts(quiz_id, student_id);
    CREATE TABLE IF NOT EXISTS answers (
      attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE, question_id TEXT NOT NULL,
      selected TEXT, text_answer TEXT, is_correct INTEGER, marks REAL, PRIMARY KEY (attempt_id, question_id));
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT, user_id TEXT, expires_at INTEGER);
    CREATE TABLE IF NOT EXISTS login_fail (code_key TEXT PRIMARY KEY, count INTEGER, until INTEGER);
  `);

  // Added for merged classes and recording in the Assessments module.
  for (const sql of ['ALTER TABLE quizzes ADD COLUMN mode_id TEXT', 'ALTER TABLE quizzes ADD COLUMN record_as TEXT',
    'ALTER TABLE quizzes ADD COLUMN record_dirty INTEGER DEFAULT 0', 'ALTER TABLE quizzes ADD COLUMN record_note TEXT',
    'ALTER TABLE questions ADD COLUMN images TEXT', 'ALTER TABLE questions ADD COLUMN option_images TEXT']) {
    try { db.exec(sql); } catch { /* already there */ }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS assignments (teacher_id TEXT, subject TEXT, class_name TEXT);
    CREATE INDEX IF NOT EXISTS ix_assignments_teacher ON assignments(teacher_id);
    CREATE TABLE IF NOT EXISTS quiz_cloud (quiz_id TEXT NOT NULL, class_key TEXT NOT NULL, class_name TEXT, cloud_id TEXT, PRIMARY KEY (quiz_id, class_key));
    CREATE TABLE IF NOT EXISTS question_cloud (question_id TEXT NOT NULL, class_key TEXT NOT NULL, cloud_id TEXT, PRIMARY KEY (question_id, class_key));
  `);

  const q = (sql) => db.prepare(sql);
  const all = (sql, ...a) => q(sql).all(...a);
  const one = (sql, ...a) => q(sql).get(...a);
  const run = (sql, ...a) => q(sql).run(...a);
  const tx = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const meta = (k) => one('SELECT value FROM meta WHERE key=?', k)?.value ?? null;

  // ── Pictures in test questions and options ──────────────────────────────────
  // Stored in data/test-images and served at /lms/img/<name>. In question text,
  // [image 1], [image 2] mark where each picture goes (as in Past Questions).
  const IMG_DIR = path.join(DATA, 'test-images');
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const IMG_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  const imgName = (u) => { const m = String(u || '').match(/^\/lms\/img\/([a-f0-9-]+\.(?:jpg|png|webp|gif))$/); return m ? m[1] : null; };
  // A picture for a question: one already uploaded here, or a Past Questions
  // picture, which is copied in so the test keeps it when the pack changes.
  function keepImage(u) {
    if (!u) return null;
    const own = imgName(u);
    if (own) return fs.existsSync(path.join(IMG_DIR, own)) ? `/lms/img/${own}` : null;
    const pk = String(u).match(/^\/pack\/images\/([A-Za-z0-9._-]+)$/);
    if (pk && ctx.packImagePath) {
      const from = ctx.packImagePath(pk[1]);
      if (!from) return null;
      const ext = (pk[1].split('.').pop() || 'jpg').toLowerCase();
      if (!IMG_MIME[ext]) return null;
      const name = `${uuid()}.${ext === 'jpeg' ? 'jpg' : ext}`;
      fs.copyFileSync(from, path.join(IMG_DIR, name));
      return `/lms/img/${name}`;
    }
    return null;
  }
  const parseList = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  const setMeta = (k, v) => run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v == null ? null : String(v));
  const nowIso = () => new Date().toISOString();
  const key = (s) => String(s || '').trim().toUpperCase();
  const uuid = () => crypto.randomUUID();

  // ── Link to CAS ─────────────────────────────────────────────────────────────

  const cloud = () => ctx.config().cloud_url.replace(/\/+$/, '');
  const link = () => {
    const token = meta('cas_token');
    return token ? { token, school: JSON.parse(meta('cas_school') || 'null') } : null;
  };

  async function casFetch(p, opts = {}) {
    const l = link();
    if (!l) throw Object.assign(new Error('Not connected to CAS.'), { code: 'NOLINK' });
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opts.timeout || 60000);
    try {
      const r = await fetch(`${cloud()}/api/school-server${p}`, {
        method: opts.method || 'GET', signal: ctl.signal,
        headers: { Authorization: `Server ${l.token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401) { setMeta('cas_revoked', '1'); throw Object.assign(new Error(data.error || 'CAS refused this server.'), { code: 'REVOKED' }); }
      if (!r.ok) throw new Error(data.error || `CAS answered ${r.status}`);
      return data;
    } finally { clearTimeout(t); }
  }

  async function pair(schoolCode, code) {
    const r = await fetch(`${cloud()}/api/school-server/pair`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_code: schoolCode, code, name: `${ctx.config().school_name || 'School server'} (${os.hostname()})` }),
    }).catch(() => null);
    if (!r) throw new Error('Could not reach CAS. This PC needs internet to connect the first time.');
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'CAS did not accept the pairing code.');
    setMeta('cas_token', data.token); setMeta('cas_school', JSON.stringify(data.school)); setMeta('cas_revoked', null);
    log(`connected to CAS for ${data.school.name}`);
    sync().catch(() => {});
    return data.school;
  }
  function disconnect() { setMeta('cas_token', null); setMeta('cas_school', null); setMeta('cas_revoked', null); }

  // ── Sync with CAS ───────────────────────────────────────────────────────────

  let syncing = false;
  let running = null;
  // A sync asked for while one is running waits for that one.
  function sync() {
    if (!link()) return Promise.resolve(null);
    if (running) return running;
    running = doSync().finally(() => { running = null; });
    return running;
  }
  async function doSync() {
    syncing = true;
    const result = { at: nowIso(), ok: false, message: '' };
    try {
      const roster = await casFetch('/roster', { timeout: 90000 });
      tx(() => {
        run('DELETE FROM students'); run('DELETE FROM teachers'); run('DELETE FROM courses');
        const st = q('INSERT INTO students(id,code,code_key,name,class_name,pin_hash) VALUES(?,?,?,?,?,?)');
        for (const s of roster.students) st.run(s.id, s.student_code, key(s.student_code), s.name, s.class_name, s.pin_hash || null);
        const tt = q('INSERT INTO teachers(id,code,code_key,name,pin_hash) VALUES(?,?,?,?,?)');
        for (const t of roster.teachers) tt.run(t.id, t.teacher_code, key(t.teacher_code), t.name, t.pin_hash || null);
        const ct = q('INSERT INTO courses(id,teacher_id,subject,class_name) VALUES(?,?,?,?)');
        for (const c of roster.courses) ct.run(c.id, c.teacher_id, c.subject_name, c.class_name);
        run('DELETE FROM assignments');
        const at = q('INSERT INTO assignments(teacher_id,subject,class_name) VALUES(?,?,?)');
        for (const a of roster.assignments || []) at.run(a.teacher_id, a.subject, a.class_name);
      });
      setMeta('modes', JSON.stringify(roster.modes || []));
      setMeta('roster_at', nowIso()); setMeta('term', JSON.stringify(roster.term));
      if (roster.school?.name) setMeta('cas_school', JSON.stringify({ ...(link().school || {}), name: roster.school.name, code: roster.school.code }));

      // Quizzes published in CAS.
      const { quizzes } = await casFetch('/lms/quizzes', { timeout: 90000 });
      const seen = new Set();
      tx(() => {
        for (const cz of quizzes) {
          seen.add(cz.id);
          if (cz.offline_ref && one('SELECT id FROM quizzes WHERE id=?', String(cz.offline_ref).split('#')[0])) continue;  // one we made here
          const local = one('SELECT id FROM quizzes WHERE cloud_id=?', cz.id);
          const id = local?.id || uuid();
          if (local) {
            run(`UPDATE quizzes SET teacher_id=?, subject=?, class_name=?, title=?, instructions=?, time_limit_mins=?, max_attempts=?,
                 randomise=?, show_answers=?, removed_in_cas=0, updated_at=? WHERE id=?`,
              cz.teacher_id, cz.subject_name, cz.class_name, cz.title, cz.instructions, cz.time_limit_mins, cz.max_attempts || 1,
              cz.randomise_questions ? 1 : 0, cz.show_answers_after ? 1 : 0, nowIso(), id);
          } else {
            run(`INSERT INTO quizzes(id,origin,cloud_id,teacher_id,subject,class_name,title,instructions,time_limit_mins,max_attempts,
                 randomise,show_answers,status,created_at,updated_at) VALUES(?, 'cloud', ?,?,?,?,?,?,?,?,?,?, 'draft', ?, ?)`,
              id, cz.id, cz.teacher_id, cz.subject_name, cz.class_name, cz.title, cz.instructions, cz.time_limit_mins,
              cz.max_attempts || 1, cz.randomise_questions ? 1 : 0, cz.show_answers_after ? 1 : 0, nowIso(), nowIso());
          }
          // Questions follow CAS until someone has answered here.
          if (!one('SELECT 1 AS x FROM attempts WHERE quiz_id=?', id)) {
            run('DELETE FROM questions WHERE quiz_id=?', id);
            const ins = q('INSERT INTO questions(id,quiz_id,sort,type,text,options,correct,explanation,marks,cloud_id) VALUES(?,?,?,?,?,?,?,?,?,?)');
            for (const x of cz.questions) ins.run(uuid(), id, x.sort, x.type, x.text, JSON.stringify(x.options || []), x.correct, x.explanation, x.marks, x.id);
          }
        }
        for (const z of all("SELECT id, cloud_id FROM quizzes WHERE origin='cloud'")) {
          if (seen.has(z.cloud_id)) continue;
          if (one('SELECT 1 AS x FROM attempts WHERE quiz_id=?', z.id)) run("UPDATE quizzes SET removed_in_cas=1, status='closed' WHERE id=?", z.id);
          else run('DELETE FROM quizzes WHERE id=?', z.id);
        }
      });

      // Tests made here (once opened) go to CAS.
      const toPush = all("SELECT * FROM quizzes WHERE origin='local' AND status<>'draft' AND (dirty=1 OR cloud_id IS NULL)");
      let pushedQuizzes = 0;
      if (toPush.length) {
        const body = { quizzes: toPush.map(z => ({
          offline_ref: z.id, teacher_id: z.teacher_id, subject: z.subject, class_name: z.class_name, class_names: classList(z.class_name),
          mode_id: z.record_as === 'ca' ? z.mode_id : null, record_as_exam: z.record_as === 'exam', title: z.title,
          instructions: z.instructions, time_limit_mins: z.time_limit_mins, randomise: !!z.randomise, show_answers_after: !!z.show_answers,
          questions: all('SELECT * FROM questions WHERE quiz_id=? ORDER BY sort', z.id).map(x => ({
            local_id: x.id, type: x.type, text: x.text, options: JSON.parse(x.options || '[]'), correct: x.correct, explanation: x.explanation, marks: x.marks,
          })),
        })) };
        const r = await casFetch('/lms/quizzes', { method: 'POST', body });
        tx(() => {
          for (const res of r.quizzes) {
            const perClass = res.classes || (res.quiz_id ? [{ class_name: one('SELECT class_name FROM quizzes WHERE id=?', res.offline_ref)?.class_name, quiz_id: res.quiz_id, question_ids: res.question_ids }] : []);
            if (!perClass.length) { if (res.error) log('CAS did not take test', res.offline_ref, res.error); continue; }
            for (const c of perClass) {
              run(`INSERT INTO quiz_cloud(quiz_id,class_key,class_name,cloud_id) VALUES(?,?,?,?)
                   ON CONFLICT(quiz_id,class_key) DO UPDATE SET cloud_id=excluded.cloud_id, class_name=excluded.class_name`,
                res.offline_ref, key(c.class_name), c.class_name, c.quiz_id);
              for (const [localId, cloudId] of Object.entries(c.question_ids || {})) {
                run(`INSERT INTO question_cloud(question_id,class_key,cloud_id) VALUES(?,?,?)
                     ON CONFLICT(question_id,class_key) DO UPDATE SET cloud_id=excluded.cloud_id`, localId, key(c.class_name), cloudId);
                run('UPDATE questions SET cloud_id=COALESCE(cloud_id, ?) WHERE id=?', cloudId, localId);
              }
            }
            run('UPDATE quizzes SET cloud_id=?, dirty=0 WHERE id=?', perClass[0].quiz_id, res.offline_ref);
            pushedQuizzes++;
          }
        });
      }

      // Results.
      const pending = all(`SELECT a.*, z.cloud_id AS quiz_cloud_id, z.origin, st.class_name AS student_class FROM attempts a
                            JOIN quizzes z ON z.id=a.quiz_id LEFT JOIN students st ON st.id=a.student_id
                            WHERE a.status='submitted' AND a.dirty=1 AND z.cloud_id IS NOT NULL LIMIT 500`)
        .map(a => {
          if (a.origin !== 'local') return a;
          const ck = key(a.student_class);
          const qc = one('SELECT cloud_id FROM quiz_cloud WHERE quiz_id=? AND class_key=?', a.quiz_id, ck);
          return { ...a, quiz_cloud_id: qc?.cloud_id || a.quiz_cloud_id, class_key: ck };
        });
      let sent = 0;
      if (pending.length) {
        const attempts = pending.map(a => ({
          offline_ref: a.id, quiz_id: a.quiz_cloud_id, student_id: a.student_id, started_at: a.started_at, submitted_at: a.submitted_at,
          score: a.score, max_score: a.max_score,
          answers: all(`SELECT an.*, COALESCE(qc.cloud_id, qu.cloud_id) AS cloud_id FROM answers an JOIN questions qu ON qu.id=an.question_id
                        LEFT JOIN question_cloud qc ON qc.question_id=qu.id AND qc.class_key=? WHERE an.attempt_id=?`, a.class_key || '', a.id)
            .filter(x => x.cloud_id)
            .map(x => ({ question_id: x.cloud_id, selected_option: x.selected, answer_text: x.text_answer,
              is_correct: x.is_correct == null ? null : !!x.is_correct, marks_awarded: x.marks || 0 })),
        }));
        const r = await casFetch('/lms/results', { method: 'POST', body: { attempts } });
        tx(() => { for (const ref of r.accepted) { run('UPDATE attempts SET dirty=0, sent_at=? WHERE id=?', nowIso(), ref); sent++; } });
        if (r.rejected?.length) log('results not accepted by CAS:', JSON.stringify(r.rejected.slice(0, 5)));
      }

      // Closed tests whose results are all sent and marked: record them in
      // the Assessments module under the chosen mode (or as the exam).
      let recorded = 0;
      const ready = all(`SELECT z.id FROM quizzes z WHERE z.origin='local' AND z.status='closed' AND z.record_dirty=1
                           AND z.record_as IN ('ca','exam') AND z.cloud_id IS NOT NULL
                           AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.quiz_id=z.id AND a.status='submitted' AND (a.dirty=1 OR a.needs_marking>0))`);
      if (ready.length) {
        const r = await casFetch('/lms/record', { method: 'POST', body: { offline_refs: ready.map(z => z.id) } });
        tx(() => {
          for (const z of ready) {
            const rows = (r.results || []).filter(x => x.offline_ref === z.id);
            if (!rows.length) continue;
            const ok = rows.filter(x => x.ok).map(x => x.class_name);
            const bad = rows.filter(x => !x.ok);
            const locked = bad.filter(x => x.code === 'LOCKED').map(x => x.class_name);
            const other = bad.filter(x => x.code !== 'LOCKED');
            const note = (ok.length ? `Recorded in Assessments for ${ok.join(', ')}.` : '')
              + (locked.length ? ` Not recorded for ${locked.join(', ')}: those results are already with the HOD, so they are locked. Once they are unlocked, open and close the test again.` : '')
              + (other.length ? ` Not recorded for ${other.map(x => `${x.class_name} (${String(x.error || '').replace(/\.$/, '')})`).join(', ')}.` : '');
            run('UPDATE quizzes SET record_dirty=0, record_note=? WHERE id=?', note.trim(), z.id);
            if (ok.length) recorded++;
          }
        });
      }

      const counts = one('SELECT (SELECT COUNT(*) FROM students) AS s, (SELECT COUNT(*) FROM teachers) AS t');
      result.ok = true;
      result.message = `Roster: ${counts.s} students, ${counts.t} teachers. ${quizzes.length} CAS test${quizzes.length === 1 ? '' : 's'}.`
        + (pushedQuizzes ? ` Sent ${pushedQuizzes} test${pushedQuizzes === 1 ? '' : 's'} made here.` : '')
        + (sent ? ` Sent ${sent} result${sent === 1 ? '' : 's'}.` : '')
        + (recorded ? ` Recorded ${recorded} test${recorded === 1 ? '' : 's'} in Assessments.` : '');
      await casFetch('/summary', { method: 'POST', body: { summary: result.message } }).catch(() => {});
    } catch (e) {
      result.message = e.code === 'REVOKED' ? 'CAS has disconnected this server. Connect it again with a new pairing code.'
        : e.name === 'AbortError' || /fetch failed|ENOTFOUND|ECONN|EAI_AGAIN/i.test(String(e.message) + String(e.cause?.code))
          ? 'No internet connection.' : `Sync stopped: ${e.message}`;
      result.offline = /internet/.test(result.message);
    } finally {
      syncing = false;
      setMeta('last_sync', JSON.stringify(result));
    }
    return result;
  }

  // ── Sessions ────────────────────────────────────────────────────────────────

  function sessionFrom(req) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+([a-f0-9]{48})$/i);
    if (!m) return null;
    const s = one('SELECT * FROM sessions WHERE token=?', m[1]);
    if (!s || s.expires_at < Date.now()) return null;
    return s;
  }

  async function login(body) {
    const role = body.role === 'teacher' ? 'teacher' : 'student';
    const k = key(body.code);
    const password = String(body.password || '');
    if (!k || !password) return { status: 400, error: 'Enter your code and password.' };
    if (!meta('roster_at')) return { status: 503, error: 'This school server is not connected to CAS yet, so it cannot check sign-ins. Ask the school admin.' };
    const lockKey = `${role}:${k}`;
    const fail = one('SELECT * FROM login_fail WHERE code_key=?', lockKey);
    if (fail && fail.until > Date.now()) return { status: 429, error: 'Too many wrong tries. Wait 5 minutes and try again.' };
    const user = role === 'teacher'
      ? one('SELECT id, name, pin_hash, NULL AS class_name FROM teachers WHERE code_key=?', k)
      : one('SELECT id, name, pin_hash, class_name FROM students WHERE code_key=?', k);
    let ok = false;
    if (user) {
      if (user.pin_hash) ok = await new Promise(res => bcrypt.compare(password, user.pin_hash, (e, r) => res(!e && r)));
      else ok = role === 'student' && password === DEFAULT_STUDENT_PASSWORD;
    }
    if (!ok) {
      const count = (fail?.count || 0) + 1;
      run('INSERT INTO login_fail(code_key,count,until) VALUES(?,?,?) ON CONFLICT(code_key) DO UPDATE SET count=excluded.count, until=excluded.until',
        lockKey, count >= 5 ? 0 : count, count >= 5 ? Date.now() + 5 * 60 * 1000 : 0);
      return { status: 401, error: role === 'teacher' ? 'Wrong teacher code or password.' : 'Wrong student ID or password.' };
    }
    run('DELETE FROM login_fail WHERE code_key=?', lockKey);
    run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
    const token = crypto.randomBytes(24).toString('hex');
    run('INSERT INTO sessions(token,role,user_id,expires_at) VALUES(?,?,?,?)', token, role, user.id, Date.now() + SESSION_HOURS * 3600 * 1000);
    return { status: 200, body: { token, role, name: user.name, class_name: user.class_name, expires_in_hours: SESSION_HOURS } };
  }

  // ── Tests: shared helpers ───────────────────────────────────────────────────

  // A test's class_name can list merged classes: "1A, 1B".
  const classList = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  const sameClass = (testClasses, cls) => classList(testClasses).some(c => key(c) === key(cls));
  const quizQuestions = (quizId) => all('SELECT * FROM questions WHERE quiz_id=? ORDER BY sort', quizId)
    .map(x => ({ ...x, options: JSON.parse(x.options || '[]'), images: parseList(x.images), option_images: parseList(x.option_images) }));
  const totalMarks = (qs) => qs.reduce((n, x) => n + (Number(x.marks) || 0), 0);

  /** Marks an attempt from its saved answers and closes it. */
  function finishAttempt(attemptId, at = nowIso()) {
    const a = one('SELECT * FROM attempts WHERE id=?', attemptId);
    if (!a || a.status === 'submitted') return a;
    const qs = quizQuestions(a.quiz_id);
    const ans = new Map(all('SELECT * FROM answers WHERE attempt_id=?', attemptId).map(x => [x.question_id, x]));
    let score = 0, needs = 0;
    tx(() => {
      for (const x of qs) {
        const an = ans.get(x.id);
        if (x.type === 'short') {
          if (an?.text_answer?.trim() && an.marks == null) needs++;
          if (an?.marks != null) score += an.marks;
          continue;
        }
        const correct = !!an?.selected && an.selected === x.correct;
        const marks = correct ? Number(x.marks) || 0 : 0;
        score += marks;
        if (an) run('UPDATE answers SET is_correct=?, marks=? WHERE attempt_id=? AND question_id=?', correct ? 1 : 0, marks, attemptId, x.id);
      }
      run(`UPDATE attempts SET status='submitted', submitted_at=?, score=?, max_score=?, needs_marking=?, dirty=1 WHERE id=?`,
        at, score, totalMarks(qs), needs, attemptId);
    });
    return one('SELECT * FROM attempts WHERE id=?', attemptId);
  }

  /** Closes attempts whose time ran out. */
  function finishExpired() {
    for (const a of all(`SELECT id, deadline_at FROM attempts WHERE status='in_progress' AND deadline_at IS NOT NULL`)) {
      if (Date.parse(a.deadline_at) + GRACE_MS < Date.now()) finishAttempt(a.id, a.deadline_at);
    }
  }

  // A fixed shuffle per attempt, so a student who reconnects sees the same order.
  const orderFor = (attemptId, qs) => [...qs].sort((x, y) =>
    crypto.createHash('md5').update(attemptId + x.id).digest('hex').localeCompare(crypto.createHash('md5').update(attemptId + y.id).digest('hex')));

  function attemptView(a, quiz) {
    let qs = quizQuestions(quiz.id);
    if (quiz.randomise) qs = orderFor(a.id, qs);
    const ans = Object.fromEntries(all('SELECT * FROM answers WHERE attempt_id=?', a.id).map(x => [x.question_id, { selected: x.selected, text: x.text_answer }]));
    return {
      attempt: { id: a.id, status: a.status, started_at: a.started_at, deadline_at: a.deadline_at, server_now: nowIso() },
      quiz: { id: quiz.id, title: quiz.title, subject: quiz.subject, instructions: quiz.instructions, time_limit_mins: quiz.time_limit_mins, total_marks: totalMarks(qs) },
      questions: qs.map(x => ({ id: x.id, type: x.type, text: x.text, options: x.type === 'mcq' ? x.options : [], marks: x.marks,
        images: x.images, option_images: x.type === 'mcq' ? x.option_images : [] })),
      answers: ans,
    };
  }

  function resultView(a, quiz) {
    const out = { attempt_id: a.id, score: a.score, max_score: a.max_score, needs_marking: !!a.needs_marking, show_answers: !!quiz.show_answers, review: null };
    if (quiz.show_answers) {
      const ans = new Map(all('SELECT * FROM answers WHERE attempt_id=?', a.id).map(x => [x.question_id, x]));
      out.review = quizQuestions(quiz.id).map(x => {
        const an = ans.get(x.id);
        return { id: x.id, type: x.type, text: x.text, options: x.options, images: x.images, option_images: x.option_images, correct: x.type === 'mcq' ? x.correct : null,
          explanation: x.explanation, marks: x.marks, your_answer: an ? (x.type === 'mcq' ? an.selected : an.text_answer) : null,
          marks_awarded: an?.marks ?? (x.type === 'mcq' ? 0 : null) };
      });
    }
    return out;
  }

  // ── Requests ────────────────────────────────────────────────────────────────

  const json = async (req) => JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}');

  async function handle(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/lms/')) return false;

    if (req.method === 'OPTIONS') {
      send(res, 204, '', { 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE' });
      return true;
    }
    const img = p.match(/^\/lms\/img\/([a-f0-9-]+\.(?:jpg|png|webp|gif))$/);
    if (req.method === 'GET' && img) {
      const f = path.join(IMG_DIR, img[1]);
      if (!fs.existsSync(f)) { send(res, 404, { error: 'Not found' }); return true; }
      res.writeHead(200, { 'Content-Type': IMG_MIME[img[1].split('.').pop()], 'Cache-Control': 'max-age=604800', 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(f).pipe(res);
      return true;
    }
    if (req.method === 'POST' && p === '/lms/login') {
      const r = await login(await json(req));
      send(res, r.status, r.status === 200 ? r.body : { error: r.error });
      return true;
    }
    const s = sessionFrom(req);
    if (!s) { send(res, 401, { error: 'Sign in again.' }); return true; }
    if (req.method === 'POST' && p === '/lms/logout') { run('DELETE FROM sessions WHERE token=?', s.token); send(res, 200, { ok: true }); return true; }

    finishExpired();

    // ── Students ──
    if (s.role === 'student') {
      const me = one('SELECT * FROM students WHERE id=?', s.user_id);
      if (!me) { send(res, 401, { error: 'Sign in again.' }); return true; }

      if (req.method === 'GET' && p === '/lms/tests') {
        const tests = all(`SELECT z.*, t.name AS teacher_name FROM quizzes z LEFT JOIN teachers t ON t.id=z.teacher_id
                            WHERE z.status IN ('open','closed') ORDER BY z.updated_at DESC`)
          .filter(z => sameClass(z.class_name, me.class_name));
        const out = [];
        for (const z of tests) {
          const atts = all('SELECT * FROM attempts WHERE quiz_id=? AND student_id=? ORDER BY started_at DESC', z.id, me.id);
          const open = z.status === 'open';
          if (!open && !atts.length) continue;   // closed tests only show if taken
          const qs = quizQuestions(z.id);
          const last = atts[0];
          const submittedCount = atts.filter(a => a.status === 'submitted').length;
          out.push({
            id: z.id, title: z.title, subject: z.subject, teacher: z.teacher_name, time_limit_mins: z.time_limit_mins,
            question_count: qs.length, total_marks: totalMarks(qs), open,
            state: last?.status === 'in_progress' ? 'in_progress' : submittedCount ? 'submitted' : 'not_started',
            can_start: open && (last?.status === 'in_progress' || submittedCount < (z.max_attempts || 1)),
            result: last?.status === 'submitted' ? { attempt_id: last.id, score: last.score, max_score: last.max_score, needs_marking: !!last.needs_marking } : null,
          });
        }
        send(res, 200, { student: { name: me.name, class_name: me.class_name }, tests: out });
        return true;
      }

      let m = p.match(/^\/lms\/tests\/([\w-]+)\/start$/);
      if (req.method === 'POST' && m) {
        const z = one('SELECT * FROM quizzes WHERE id=?', m[1]);
        if (!z || !sameClass(z.class_name, me.class_name)) { send(res, 404, { error: 'Test not found.' }); return true; }
        if (z.status !== 'open') { send(res, 409, { error: 'This test is closed.' }); return true; }
        let a = one(`SELECT * FROM attempts WHERE quiz_id=? AND student_id=? AND status='in_progress'`, z.id, me.id);
        if (!a) {
          const done = one(`SELECT COUNT(*) AS n FROM attempts WHERE quiz_id=? AND student_id=? AND status='submitted'`, z.id, me.id).n;
          if (done >= (z.max_attempts || 1)) { send(res, 409, { error: 'You have already submitted this test.' }); return true; }
          const id = uuid(); const start = new Date();
          const deadline = z.time_limit_mins ? new Date(start.getTime() + z.time_limit_mins * 60000).toISOString() : null;
          run('INSERT INTO attempts(id,quiz_id,student_id,started_at,deadline_at,status) VALUES(?,?,?,?,?,?)', id, z.id, me.id, start.toISOString(), deadline, 'in_progress');
          a = one('SELECT * FROM attempts WHERE id=?', id);
        }
        send(res, 200, attemptView(a, z));
        return true;
      }

      m = p.match(/^\/lms\/attempts\/([\w-]+)\/(answers|submit|result)$/);
      if (m) {
        const a = one('SELECT * FROM attempts WHERE id=? AND student_id=?', m[1], me.id);
        if (!a) { send(res, 404, { error: 'Not found.' }); return true; }
        const z = one('SELECT * FROM quizzes WHERE id=?', a.quiz_id);
        if (m[2] === 'result' && req.method === 'GET') {
          if (a.status !== 'submitted') { send(res, 409, { error: 'Not submitted yet.' }); return true; }
          send(res, 200, resultView(a, z)); return true;
        }
        if (req.method !== 'PUT' && req.method !== 'POST') { send(res, 405, { error: 'Method not allowed' }); return true; }
        const body = await json(req);
        if (a.status === 'submitted') {
          if (m[2] === 'submit') { send(res, 200, resultView(a, z)); return true; }
          send(res, 409, { error: 'This test has been submitted.' }); return true;
        }
        const late = a.deadline_at && Date.now() > Date.parse(a.deadline_at) + GRACE_MS;
        if (!late && Array.isArray(body.answers)) {
          const valid = new Map(quizQuestions(z.id).map(x => [x.id, x]));
          const up = q(`INSERT INTO answers(attempt_id,question_id,selected,text_answer) VALUES(?,?,?,?)
                        ON CONFLICT(attempt_id,question_id) DO UPDATE SET selected=excluded.selected, text_answer=excluded.text_answer`);
          tx(() => {
            for (const an of body.answers) {
              const x = valid.get(an.question_id);
              if (!x) continue;
              const sel = x.type === 'mcq' && LETTERS.includes(String(an.selected || '').toLowerCase()) ? String(an.selected).toLowerCase() : null;
              const txt = x.type === 'short' ? String(an.text ?? '').slice(0, 5000) : null;
              up.run(a.id, x.id, sel, txt);
            }
          });
        }
        if (m[2] === 'submit' || late) {
          const done = finishAttempt(a.id, late ? a.deadline_at : nowIso());
          send(res, 200, { ...resultView(done, z), late: !!late });
          return true;
        }
        send(res, 200, { ok: true, saved_at: nowIso(), deadline_at: a.deadline_at });
        return true;
      }
      send(res, 404, { error: 'Not found' });
      return true;
    }

    // ── Teachers ──
    const me = one('SELECT * FROM teachers WHERE id=?', s.user_id);
    if (!me) { send(res, 401, { error: 'Sign in again.' }); return true; }
    const classSize = (cls) => all('SELECT class_name FROM students').filter(x => sameClass(cls, x.class_name)).length;
    // What this teacher teaches, from the timetable: [{ subject, classes: [...] }].
    const mySubjects = () => {
      const m = new Map();
      for (const a of all('SELECT subject, class_name FROM assignments WHERE teacher_id=?', me.id)) {
        if (!m.has(a.subject)) m.set(a.subject, new Set());
        m.get(a.subject).add(a.class_name);
      }
      const byNum = (a, b) => a.localeCompare(b, undefined, { numeric: true });
      return [...m.entries()].sort(([a], [b]) => byNum(a, b)).map(([subject, set]) => ({ subject, classes: [...set].sort(byNum) }));
    };
    const modes = () => JSON.parse(meta('modes') || '[]');
    const mine = (id) => { const z = one('SELECT * FROM quizzes WHERE id=?', id); return z && z.teacher_id === me.id ? z : null; };

    if (req.method === 'POST' && p === '/lms/teacher/images') {
      const ext = IMG_TYPES[String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()];
      if (!ext) { send(res, 400, { error: 'Use a JPG, PNG, WEBP or GIF picture.' }); return true; }
      let buf;
      try { buf = await readBody(req, 6 * 1024 * 1024); } catch { send(res, 413, { error: 'That picture is too large (6 MB at most).' }); return true; }
      if (!buf.length) { send(res, 400, { error: 'The picture was empty.' }); return true; }
      const name = `${uuid()}.${ext}`;
      fs.writeFileSync(path.join(IMG_DIR, name), buf);
      send(res, 201, { url: `/lms/img/${name}` });
      return true;
    }
    if (req.method === 'GET' && p === '/lms/teacher/me') {
      send(res, 200, { name: me.name, subjects: mySubjects(), modes: modes(), online: JSON.parse(meta('last_sync') || 'null') });
      return true;
    }
    if (req.method === 'GET' && p === '/lms/teacher/tests') {
      const rows = all('SELECT * FROM quizzes WHERE teacher_id=? ORDER BY created_at DESC', me.id).map(z => {
        const atts = all('SELECT status, score, max_score, needs_marking, dirty FROM attempts WHERE quiz_id=?', z.id);
        const sub = atts.filter(a => a.status === 'submitted');
        return {
          id: z.id, origin: z.origin, title: z.title, subject: z.subject, class_name: z.class_name, status: z.status,
          record_as: z.record_as, mode_name: modes().find(m => m.id === z.mode_id)?.name || null, record_note: z.record_note,
          time_limit_mins: z.time_limit_mins, question_count: one('SELECT COUNT(*) AS n FROM questions WHERE quiz_id=?', z.id).n,
          class_size: classSize(z.class_name), started: atts.filter(a => a.status === 'in_progress').length, submitted: sub.length,
          to_mark: sub.reduce((n, a) => n + (a.needs_marking || 0), 0),
          waiting_for_cas: z.origin === 'local' && z.status !== 'draft' && !z.cloud_id ? true : atts.some(a => a.status === 'submitted' && a.dirty),
          removed_in_cas: !!z.removed_in_cas,
        };
      });
      send(res, 200, rows);
      return true;
    }
    if (req.method === 'POST' && p === '/lms/teacher/tests') {
      const b = await json(req);
      const err = validateTest(b, mySubjects(), modes());
      if (err) { send(res, 400, { error: err }); return true; }
      const id = uuid();
      tx(() => {
        run(`INSERT INTO quizzes(id,origin,teacher_id,subject,class_name,title,instructions,time_limit_mins,max_attempts,randomise,show_answers,status,created_at,updated_at,mode_id,record_as)
             VALUES(?, 'local', ?,?,?,?,?,?,1,?,?, 'draft', ?, ?, ?, ?)`,
          id, me.id, b.subject.trim(), testClasses(b).join(', '), b.title.trim(), b.instructions || null, b.time_limit_mins ? parseInt(b.time_limit_mins, 10) : null,
          b.randomise ? 1 : 0, b.show_answers === false ? 0 : 1, nowIso(), nowIso(), b.record_as === 'ca' ? b.mode_id : null, recordAs(b));
        saveQuestions(id, b.questions);
      });
      send(res, 201, { id });
      return true;
    }
    let m = p.match(/^\/lms\/teacher\/tests\/([\w-]+)(?:\/(status|results|results\.csv))?$/);
    if (m) {
      const z = mine(m[1]);
      if (!z) { send(res, 404, { error: 'Test not found.' }); return true; }
      const hasAttempts = !!one('SELECT 1 AS x FROM attempts WHERE quiz_id=?', z.id);
      if (!m[2] && req.method === 'GET') {
        send(res, 200, { ...z, class_names: classList(z.class_name), questions: quizQuestions(z.id), has_attempts: hasAttempts, editable: z.origin === 'local' && !hasAttempts });
        return true;
      }
      if (!m[2] && req.method === 'PUT') {
        if (z.origin !== 'local') { send(res, 409, { error: 'Tests from CAS are edited in CAS.' }); return true; }
        if (hasAttempts) { send(res, 409, { error: 'Students have started this test, so its questions can no longer change.' }); return true; }
        const b = await json(req);
        const err = validateTest(b, mySubjects(), modes());
        if (err) { send(res, 400, { error: err }); return true; }
        tx(() => {
          run(`UPDATE quizzes SET subject=?, class_name=?, title=?, instructions=?, time_limit_mins=?, randomise=?, show_answers=?, mode_id=?, record_as=?, dirty=1, updated_at=? WHERE id=?`,
            b.subject.trim(), testClasses(b).join(', '), b.title.trim(), b.instructions || null, b.time_limit_mins ? parseInt(b.time_limit_mins, 10) : null,
            b.randomise ? 1 : 0, b.show_answers === false ? 0 : 1, b.record_as === 'ca' ? b.mode_id : null, recordAs(b), nowIso(), z.id);
          run('DELETE FROM questions WHERE quiz_id=?', z.id);
          saveQuestions(z.id, b.questions);
        });
        send(res, 200, { ok: true });
        return true;
      }
      if (!m[2] && req.method === 'DELETE') {
        if (z.origin !== 'local' || hasAttempts) { send(res, 409, { error: hasAttempts ? 'Students have taken this test, so it cannot be deleted. Close it instead.' : 'Tests from CAS are deleted in CAS.' }); return true; }
        run('DELETE FROM quizzes WHERE id=?', z.id);
        send(res, 200, { ok: true });
        return true;
      }
      if (m[2] === 'status' && req.method === 'POST') {
        const b = await json(req);
        const status = ['open', 'closed', 'draft'].includes(b.status) ? b.status : null;
        if (!status) { send(res, 400, { error: 'Unknown status' }); return true; }
        if (status === 'open' && !one('SELECT 1 AS x FROM questions WHERE quiz_id=?', z.id)) { send(res, 400, { error: 'Add questions before opening the test.' }); return true; }
        if (status === 'draft' && hasAttempts) { send(res, 409, { error: 'Students have taken this test.' }); return true; }
        run('UPDATE quizzes SET status=?, updated_at=?, record_dirty=CASE WHEN ?=\'closed\' AND record_as IS NOT NULL THEN 1 ELSE record_dirty END WHERE id=?', status, nowIso(), status, z.id);
        if (status === 'closed') for (const a of all(`SELECT id FROM attempts WHERE quiz_id=? AND status='in_progress'`, z.id)) finishAttempt(a.id);
        if (status !== 'draft' && z.origin === 'local') sync().catch(() => {});
        send(res, 200, { ok: true, status });
        return true;
      }
      if ((m[2] === 'results' || m[2] === 'results.csv') && req.method === 'GET') {
        const r = results(z);
        if (m[2] === 'results') { send(res, 200, r); return true; }
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [['Student ID', 'Name', 'Status', 'Score', 'Out of', 'To mark'].map(esc).join(',')]
          .concat(r.students.map(x => [x.code, x.name, x.state, x.score ?? '', x.max_score ?? '', x.to_mark ? 'yes' : ''].map(esc).join(',')));
        const body = '﻿' + lines.join('\r\n');
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${z.title.replace(/[^\w .-]+/g, '')} results.csv"` });
        res.end(body);
        return true;
      }
    }
    if (req.method === 'PUT' && p === '/lms/teacher/marks') {
      const b = await json(req);
      const a = one('SELECT * FROM attempts WHERE id=?', b.attempt_id);
      const z = a && mine(a.quiz_id);
      const x = z && one(`SELECT * FROM questions WHERE id=? AND quiz_id=? AND type='short'`, b.question_id, z.id);
      if (!x) { send(res, 404, { error: 'Answer not found.' }); return true; }
      const marks = Number(b.marks);
      if (!(marks >= 0 && marks <= x.marks)) { send(res, 400, { error: `Give 0 to ${x.marks} marks.` }); return true; }
      tx(() => {
        run(`INSERT INTO answers(attempt_id,question_id,marks) VALUES(?,?,?)
             ON CONFLICT(attempt_id,question_id) DO UPDATE SET marks=excluded.marks`, a.id, x.id, marks);
      });
      // Recount the attempt: objective marks plus marked short answers.
      const sum = one('SELECT COALESCE(SUM(marks),0) AS s FROM answers WHERE attempt_id=?', a.id).s;
      const left = all(`SELECT an.text_answer FROM questions qu LEFT JOIN answers an ON an.question_id=qu.id AND an.attempt_id=?
                         WHERE qu.quiz_id=? AND qu.type='short' AND an.marks IS NULL`, a.id, z.id).filter(r => (r.text_answer || '').trim()).length;
      run('UPDATE attempts SET score=?, needs_marking=?, dirty=1 WHERE id=?', sum, left, a.id);
      if (z.status === 'closed' && z.record_as) run('UPDATE quizzes SET record_dirty=1 WHERE id=?', z.id);
      send(res, 200, { ok: true, score: sum, needs_marking: left });
      return true;
    }
    if (req.method === 'GET' && p === '/lms/teacher/pasco') {
      send(res, 200, ctx.pascoForTeachers(url.searchParams.get('subject')));
      return true;
    }
    send(res, 404, { error: 'Not found' });
    return true;
  }

  // Classes chosen for a test (ticked list, or the older single class).
  function testClasses(b) {
    const list = Array.isArray(b.class_names) ? b.class_names : classList(b.class_name);
    return [...new Set(list.map(c => String(c).trim()).filter(Boolean))];
  }
  function recordAs(b) { return b.record_as === 'ca' ? 'ca' : b.record_as === 'exam' ? 'exam' : null; }
  function validateTest(b, subjects, modeList) {
    if (!String(b.title || '').trim()) return 'Give the test a title.';
    if (!subjects.length) return 'Your timetable in CAS has no lessons yet, so there is no subject or class to choose. Ask the admin to add your lessons to the timetable.';
    const subj = subjects.find(x => x.subject === String(b.subject || '').trim());
    if (!subj) return 'Choose one of your subjects.';
    const cls = testClasses(b);
    if (!cls.length) return 'Tick at least one class.';
    const notMine = cls.filter(c => !subj.classes.some(x => key(x) === key(c)));
    if (notMine.length) return `You don't teach ${subj.subject} to ${notMine.join(', ')}.`;
    if (b.record_as === 'ca' && !modeList.some(m => m.id === b.mode_id)) return 'Choose which kind of assessment to record it as.';
    if (b.time_limit_mins && !(parseInt(b.time_limit_mins, 10) > 0 && parseInt(b.time_limit_mins, 10) <= 600)) return 'The time limit must be 1 to 600 minutes.';
    const qs = Array.isArray(b.questions) ? b.questions : [];
    for (const [i, x] of qs.entries()) {
      const n = i + 1;
      if (!String(x.text || '').trim() && !(Array.isArray(x.images) && x.images.some(Boolean))) return `Question ${n} has no text or picture.`;
      if (Array.isArray(x.images) && x.images.filter(Boolean).length > 6) return `Question ${n} has more than 6 pictures.`;
      if (!(Number(x.marks) > 0)) return `Question ${n} needs marks above 0.`;
      if (x.type !== 'short') {
        const opts = (x.options || []).map(o => String(o || '').trim());
        const oimg = Array.isArray(x.option_images) ? x.option_images : [];
        if (opts.length < 2 || opts.length > 5 || opts.some((o, k) => !o && !oimg[k])) return `Question ${n} needs 2 to 5 options, each with text or a picture.`;
        const ci = LETTERS.indexOf(String(x.correct || '').toLowerCase());
        if (ci < 0 || ci >= opts.length) return `Question ${n}: choose the correct option.`;
      }
    }
    return null;
  }
  function saveQuestions(quizId, qs) {
    const ins = q('INSERT INTO questions(id,quiz_id,sort,type,text,options,correct,explanation,marks,images,option_images) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    (qs || []).forEach((x, i) => {
      const short = x.type === 'short';
      const images = (Array.isArray(x.images) ? x.images : []).map(keepImage).filter(Boolean).slice(0, 6);
      const optImages = short ? [] : (x.options || []).map((_, k) => keepImage((x.option_images || [])[k]));
      ins.run(uuid(), quizId, i, short ? 'short' : 'mcq', String(x.text || '').trim(),
        JSON.stringify(short ? [] : x.options.map(o => String(o).trim())), short ? null : String(x.correct).toLowerCase(),
        x.explanation || null, Number(x.marks) || 1, JSON.stringify(images), JSON.stringify(optImages));
    });
  }

  function results(z) {
    const qs = quizQuestions(z.id);
    const shortQs = qs.filter(x => x.type === 'short');
    const students = all('SELECT id, code, name, class_name FROM students ORDER BY name').filter(x => sameClass(z.class_name, x.class_name));
    const byStudent = new Map();
    for (const a of all('SELECT * FROM attempts WHERE quiz_id=? ORDER BY started_at', z.id)) byStudent.set(a.student_id, a);   // latest wins
    const list = students.map(st => {
      const a = byStudent.get(st.id);
      return { id: st.id, code: st.code, name: st.name, class_name: st.class_name, state: a ? (a.status === 'submitted' ? 'Submitted' : 'Taking it') : 'Not started',
        attempt_id: a?.id || null, score: a?.score ?? null, max_score: a?.max_score ?? null, to_mark: !!a?.needs_marking, sent: a ? !a.dirty : null };
    });
    const marking = [];
    for (const x of shortQs) {
      for (const st of list) {
        if (!st.attempt_id) continue;
        const an = one('SELECT * FROM answers WHERE attempt_id=? AND question_id=?', st.attempt_id, x.id);
        if (!an?.text_answer?.trim()) continue;
        marking.push({ attempt_id: st.attempt_id, question_id: x.id, question: x.text, max: x.marks, student: st.name, answer: an.text_answer, marks: an.marks });
      }
    }
    const sub = list.filter(x => x.state === 'Submitted');
    return { test: { id: z.id, title: z.title, class_name: z.class_name, status: z.status, total_marks: totalMarks(qs),
        record_as: z.record_as, mode_name: JSON.parse(meta('modes') || '[]').find(m => m.id === z.mode_id)?.name || null, record_note: z.record_note },
      students: list, marking,
      summary: { class_size: list.length, submitted: sub.length, taking: list.filter(x => x.state === 'Taking it').length,
        average: sub.length ? sub.reduce((n, x) => n + (x.score || 0), 0) / sub.length : null } };
  }

  function status() {
    const l = link();
    const counts = one(`SELECT (SELECT COUNT(*) FROM students) AS students, (SELECT COUNT(*) FROM teachers) AS teachers,
      (SELECT COUNT(*) FROM quizzes) AS tests, (SELECT COUNT(*) FROM quizzes WHERE status='open') AS open_tests,
      (SELECT COUNT(*) FROM attempts WHERE status='submitted' AND dirty=1) AS results_waiting`);
    return { connected: !!l, revoked: meta('cas_revoked') === '1', school: l?.school || null, roster_at: meta('roster_at'),
      last_sync: JSON.parse(meta('last_sync') || 'null'), syncing, counts };
  }

  function start() {
    setTimeout(() => sync().catch(() => {}), 20 * 1000);
    setInterval(() => sync().catch(() => {}), SYNC_EVERY_MS).unref();
    setInterval(() => { try { finishExpired(); } catch { /* next time */ } }, 30 * 1000).unref();
  }

  return { handle, pair, disconnect, sync, status, start };
};
