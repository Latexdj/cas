const pool = require('../config/db');

async function logAudit(schoolId, action, actorId, actorName, targetType, targetId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO school_audit_logs
         (school_id, action, actor_id, actor_name, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [schoolId, action, actorId || null, actorName || null, targetType || null, targetId || null, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('[Audit] Failed to write log:', err.message);
  }
}

module.exports = { logAudit };
