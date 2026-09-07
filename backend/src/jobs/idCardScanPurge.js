'use strict';
const cron = require('node-cron');
const pool = require('../config/db');

// Purge ip_address from id_card_scans older than 90 days.
// Runs daily at 03:15 UTC. Nulls the column rather than deleting rows so
// the scan count and audit trail are preserved without retaining personal IP data.
function startIdCardScanPurgeJob() {
  cron.schedule('15 3 * * *', async () => {
    try {
      const { rowCount } = await pool.query(
        `UPDATE id_card_scans
         SET ip_address = NULL
         WHERE ip_address IS NOT NULL
           AND scanned_at < NOW() - INTERVAL '90 days'`
      );
      if (rowCount > 0) {
        console.log(`[idCardScanPurge] Nulled ip_address on ${rowCount} scan row(s) older than 90 days`);
      }
    } catch (err) {
      console.error('[idCardScanPurge] Error:', err.message);
    }
  });
  console.log('[idCardScanPurge] Scheduled — daily at 03:15 UTC');
}

module.exports = { startIdCardScanPurgeJob };
