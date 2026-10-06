'use strict';
const router    = require('express').Router();
const pool      = require('../config/db');
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CANNED_NO_MATCH =
  "I don't have information on that in my current knowledge base. " +
  "For help with this, please contact your school administrator or the CAS support team.";

// Reuse the same markdown stripper as letter-chat to keep responses clean.
function stripMarkdown(text) {
  return text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

// Records a question Alex genuinely couldn't answer, so whoever maintains
// help_entries has a concrete, prioritized list of what to write next
// instead of relying on someone noticing a bad answer by chance. Logging
// failure must never break the chat response itself.
async function logGap(schoolId, role, question) {
  try {
    await pool.query(
      `INSERT INTO help_chat_gaps (school_id, role, question) VALUES ($1, $2, $3)`,
      [schoolId, role, question.slice(0, 1000)]
    );
  } catch (e) { console.error('[help-chat] failed to log gap:', e.message); }
}

// Retrieve active help entries applicable to the given role.
// Returns global entries (school_id IS NULL) that match the role.
async function fetchEntries(role) {
  const { rows } = await pool.query(
    `SELECT feature_area, title, body
     FROM help_entries
     WHERE is_active = true
       AND school_id IS NULL
       AND applicable_roles @> ARRAY[$1]::TEXT[]
     ORDER BY feature_area ASC`,
    [role]
  );
  return rows;
}

// navItems: [{ section, label, href }] — the exact, already module-gated nav
// list the frontend is currently rendering for this user (see each portal
// shell's visibleSections). This is NOT a substitute for the curated help
// entries below — it carries no explanation of how a feature works, only
// that it exists and where it lives. Grounding Alex in it closes the
// "feature shipped, nobody wrote a help entry yet" gap without claiming
// knowledge Alex doesn't actually have.
function buildNavBlock(navItems) {
  if (!Array.isArray(navItems) || !navItems.length) return null;
  const bySection = new Map();
  for (const item of navItems) {
    if (!item?.label || !item?.href) continue;
    const section = item.section || 'Menu';
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(item);
  }
  return [...bySection.entries()]
    .map(([section, items]) => `${section}:\n${items.map(i => `  - ${i.label} (${i.href})`).join('\n')}`)
    .join('\n');
}

function buildSystemPrompt(schoolName, role, entries, navItems) {
  const roleLabel = role === 'admin' ? 'school administrator' : role;
  const entriesBlock = entries.length
    ? entries.map(e => `## ${e.title}\n${e.body}`).join('\n\n---\n\n')
    : null;
  const navBlock = buildNavBlock(navItems);

  let prompt = `You are Alex, the help guide built into CAS, a school management platform used at ${schoolName}. You are helping a ${roleLabel}.

Your job is to answer questions about how to navigate and use CAS — how to find features, what buttons do, and how to complete common tasks.

If a user asks who you are or what your name is, tell them you are Alex, the CAS help guide. Do not invent any other backstory or role.

STRICT RULES:
- Answer in detail only from the help entries provided below. Do not invent navigation paths, button names, or feature behaviour that are not described in those entries.
- You are also given the user's actual current navigation menu (sections, labels, hrefs). If a feature is named there but has no matching help entry, you may confirm it exists and tell the user which menu section and label to look under — that is real, current information, not a guess. But do not describe how that feature works, what it contains, or what steps to take beyond its name and location; say the detailed guide for it isn't written yet and suggest contacting the school administrator for anything beyond that.
- If something is not in the help entries AND not in the navigation menu, say so plainly. Do not guess or extrapolate.
- You explain and direct only. You never perform actions on the user's behalf. If someone asks you to "create a student record", explain how they can do it themselves — do not say you will do it.
- Keep answers concise and practical.

FORMATTING AND TONE:
- Write plain text only. Do not use markdown: no asterisks, no bold, no italics, no headers, no bullet symbols.
- Numbered lists are acceptable (1. 2. 3.) for steps; otherwise use plain paragraph breaks.
- Do not use em dashes (—). Use a comma, semicolon, or full stop instead.
- Write in plain, direct sentences. Avoid filler phrases such as "it is important to note", "it is essential that", "it is crucial that", "please note that", "I want to draw your attention to", or "it goes without saying".
- Write like a person giving a straight answer, not a formal document.
- If you cannot help because the topic is genuinely outside both the help entries and the navigation menu below, start your reply with the exact text "NOINFO: " (including the space) followed by your plain-text explanation. Use this prefix only in that genuine no-match case, never otherwise — it is used internally to track real gaps in the knowledge base, not shown to the user as-is.`;

  if (entriesBlock) {
    prompt += `\n\nHELP ENTRIES — ANSWER IN DETAIL ONLY FROM THESE:\n────────────────────────────────────\n${entriesBlock}\n────────────────────────────────────`;
  } else {
    prompt += `\n\nNo detailed help entries are currently loaded.`;
  }

  if (navBlock) {
    prompt += `\n\nUSER'S CURRENT NAVIGATION MENU — you may confirm a feature exists and say where it is from this list, but never describe how it works beyond its name:\n────────────────────────────────────\n${navBlock}\n────────────────────────────────────`;
  }

  if (!entriesBlock && !navBlock) {
    prompt += `\n\nTell the user plainly that the knowledge base is empty and suggest contacting an administrator.`;
  }

  return prompt;
}

// POST /api/help-chat/start
// Body: (none required — role comes from JWT)
// Returns: { session_id, welcome_message }
router.post('/start', async (req, res, next) => {
  try {
    // Management JWTs carry type:'management' with role=management_role (e.g. 'principal').
    // Normalise to 'management' so entries tagged applicable_roles=['management'] match.
    const role = req.user.type === 'management' ? 'management' : (req.user.role ?? 'admin');
    // {section, label, href} triples from the frontend's own already
    // module-gated nav list — see buildNavBlock() for why this is trusted.
    const navItems = Array.isArray(req.body?.nav_items) ? req.body.nav_items.slice(0, 200) : [];

    const [entries, schRows] = await Promise.all([
      fetchEntries(role),
      pool.query(`SELECT name FROM schools WHERE id = $1`, [req.schoolId]),
    ]);

    const schoolName = schRows.rows[0]?.name ?? 'your school';
    const systemPrompt = buildSystemPrompt(schoolName, role, entries, navItems);

    // The system prompt is written in the same INSERT that creates the
    // session, not a follow-up UPDATE after responding to the client — a
    // fast enough client could send its first message before a fire-and-
    // forget UPDATE landed, reading back an empty messages array and
    // getting an ungrounded response from Claude with no CAS context at
    // all. One INSERT with the full initial state has no such window.
    const { rows } = await pool.query(
      `INSERT INTO help_chat_sessions (school_id, created_by, role, messages)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [req.schoolId, req.user.id, role, JSON.stringify([{ role: 'system', content: systemPrompt }])]
    );

    res.status(201).json({
      session_id:      rows[0].id,
      welcome_message: 'Hi, I am Alex, your guide. Ask any question concerning your CAS portal.',
      entry_count:     entries.length,
    });
  } catch (err) { next(err); }
});

// POST /api/help-chat/:session_id/message
// Body: { content }
// Returns: { role: 'assistant', content }
router.post('/:session_id/message', async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'content is required' });

    const { rows: sRows } = await pool.query(
      `SELECT * FROM help_chat_sessions
       WHERE id = $1 AND school_id = $2 AND created_by = $3`,
      [req.params.session_id, req.schoolId, req.user.id]
    );
    if (!sRows.length) return res.status(404).json({ error: 'Session not found' });

    const session = sRows[0];

    if (new Date(session.expires_at) < new Date()) {
      // Expired — signal the client to start a fresh session silently.
      return res.status(410).json({ error: 'session_expired', expired: true });
    }

    const storedMessages = session.messages ?? [];
    const systemMsg = storedMessages.find(m => m.role === 'system');

    // If neither entries nor nav were loaded (empty knowledge base), short-circuit.
    if (systemMsg && systemMsg.content.includes('Tell the user plainly that the knowledge base is empty')) {
      await logGap(session.school_id, session.role, content.trim());
      return res.json({ role: 'assistant', content: CANNED_NO_MATCH });
    }

    // Build message history (exclude the system message — passed separately to Anthropic).
    const history = storedMessages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    const userMsg = { role: 'user', content: content.trim() };
    const newHistory = [...history, userMsg];

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:     systemMsg?.content ?? '',
      messages:   newHistory,
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    let reply = stripMarkdown(raw) || CANNED_NO_MATCH;

    // The model is instructed to prefix genuine no-match replies with
    // "NOINFO: " so real knowledge-base gaps are logged for content owners
    // to review, instead of silently disappearing. Stripped before the
    // user ever sees it — the rest of the reply is still shown as normal.
    if (reply.startsWith('NOINFO:')) {
      reply = reply.slice('NOINFO:'.length).trim();
      await logGap(session.school_id, session.role, content.trim());
    }

    const assistantMsg = { role: 'assistant', content: reply };

    await pool.query(
      `UPDATE help_chat_sessions
       SET messages = $1
       WHERE id = $2`,
      [JSON.stringify([...(session.messages ?? []), userMsg, assistantMsg]), session.id]
    );

    res.json({ role: 'assistant', content: reply });
  } catch (err) { next(err); }
});

module.exports = router;
