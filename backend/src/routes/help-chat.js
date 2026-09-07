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

function buildSystemPrompt(schoolName, role, entries) {
  const roleLabel = role === 'admin' ? 'school administrator' : role;
  const entriesBlock = entries.length
    ? entries.map(e => `## ${e.title}\n${e.body}`).join('\n\n---\n\n')
    : null;

  let prompt = `You are a helpful assistant embedded in CAS, a school management platform used at ${schoolName}. You are helping a ${roleLabel}.

Your job is to answer questions about how to navigate and use CAS — how to find features, what buttons do, and how to complete common tasks.

STRICT RULES:
- Answer only from the help entries provided below. Do not invent navigation paths, button names, or feature behaviour that are not described in those entries.
- If the user asks about something not covered by the entries, say so plainly. Do not guess or extrapolate.
- You explain and direct only. You never perform actions on the user's behalf. If someone asks you to "create a student record", explain how they can do it themselves — do not say you will do it.
- Keep answers concise and practical. Use plain text. No markdown headers or bullet asterisks — numbered lists are fine for steps.
- Do not discuss features that are not in the help entries below.`;

  if (entriesBlock) {
    prompt += `\n\nHELP ENTRIES — ANSWER ONLY FROM THESE:\n────────────────────────────────────\n${entriesBlock}\n────────────────────────────────────`;
  } else {
    prompt += `\n\nNo help entries are currently loaded. Tell the user plainly that the knowledge base is empty and suggest contacting an administrator.`;
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

    const [entries, schRows] = await Promise.all([
      fetchEntries(role),
      pool.query(`SELECT name FROM schools WHERE id = $1`, [req.schoolId]),
    ]);

    const schoolName = schRows.rows[0]?.name ?? 'your school';
    const systemPrompt = buildSystemPrompt(schoolName, role, entries);

    const { rows } = await pool.query(
      `INSERT INTO help_chat_sessions (school_id, created_by, role, messages)
       VALUES ($1, $2, $3, '[]')
       RETURNING id`,
      [req.schoolId, req.user.id, role]
    );

    res.status(201).json({
      session_id:      rows[0].id,
      welcome_message: 'Hi — I can help you navigate CAS. What would you like to know how to do?',
      entry_count:     entries.length,
    });

    // Store system prompt inside session for later turns (avoid re-fetching entries each turn).
    await pool.query(
      `UPDATE help_chat_sessions SET messages = $1 WHERE id = $2`,
      [JSON.stringify([{ role: 'system', content: systemPrompt }]), rows[0].id]
    );
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

    // If no entries were loaded (empty knowledge base), short-circuit.
    if (systemMsg && systemMsg.content.includes('No help entries are currently loaded')) {
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
    const reply = stripMarkdown(raw) || CANNED_NO_MATCH;

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
