const cron = require('node-cron');
const pool = require('../config/db');
const { auditLog } = require('../utils/audit');

async function runExpiryCheck() {
  try {
    // Find all paid subscriptions whose end date has passed
    const { rows: expired } = await pool.query(`
      SELECT s.id AS school_id, s.name AS school_name,
             sub.id AS sub_id, sub.teacher_limit
      FROM subscriptions sub
      JOIN schools s ON s.id = sub.school_id
      WHERE sub.status = 'active'
        AND sub.ends_at IS NOT NULL
        AND sub.ends_at < now()
    `);

    if (!expired.length) return;

    const { rows: planRows } = await pool.query(
      `SELECT id FROM plans WHERE name = 'trial' LIMIT 1`
    );
    const trialPlanId = planRows[0]?.id;
    if (!trialPlanId) return;

    for (const row of expired) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE id = $1`,
          [row.sub_id]
        );

        const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        await client.query(
          `INSERT INTO subscriptions (school_id, plan_id, status, ends_at, teacher_limit)
           VALUES ($1, $2, 'trial', $3, $4)`,
          [row.school_id, trialPlanId, trialEnd, row.teacher_limit]
        );

        await client.query('COMMIT');

        await auditLog('subscription_auto_expired', 'school', row.school_id, row.school_name, {
          message: 'Paid subscription expired — automatically reverted to 14-day trial',
          trial_ends: trialEnd,
        });

        console.log(`[expiry] ${row.school_name} reverted to trial (paid plan expired)`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[expiry] Failed for school ${row.school_id}:`, err.message);
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error('[expiry] Subscription expiry check failed:', err.message);
  }
}

function startSubscriptionExpiryJob() {
  // Run once at startup to catch anything that expired while the server was down,
  // then every hour at :00
  runExpiryCheck();
  cron.schedule('0 * * * *', runExpiryCheck);
  console.log('Subscription expiry job scheduled (hourly)');
}

module.exports = { startSubscriptionExpiryJob };
