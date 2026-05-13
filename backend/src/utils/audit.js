const pool = require('../config/db');

async function auditLog(action, entityType, entityId, entityName, details) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, entity_name, details)
       VALUES ($1,$2,$3,$4,$5)`,
      [action, entityType, entityId || null, entityName || null, details ? JSON.stringify(details) : null]
    );
  } catch { /* non-blocking — never fails the caller */ }
}

module.exports = { auditLog };
