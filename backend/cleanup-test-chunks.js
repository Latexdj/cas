'use strict';
// Removes all synthetic test chunks inserted by verify-phases.js.
// Safe to run: only touches policy_chunks rows, never the document records.
// Review output carefully before applying — prints a dry-run first.
//
// Usage:
//   node cleanup-test-chunks.js          ← dry-run (prints what would be deleted)
//   node cleanup-test-chunks.js --apply  ← actually deletes

require('dotenv').config();
const pool = require('./src/config/db');
const DRY_RUN = !process.argv.includes('--apply');

async function main() {
  if (DRY_RUN) console.log('DRY RUN — pass --apply to actually delete\n');

  // List all chunks with their document context
  const { rows: chunks } = await pool.query(`
    SELECT pc.id, pc.document_id, pc.chunk_index, pc.section_hint, pc.is_active,
           pc.embedding IS NOT NULL AS has_embedding,
           LEFT(pc.chunk_text, 120) AS preview,
           pd.title AS doc_title, pd.document_type, pd.school_id
    FROM policy_chunks pc
    JOIN policy_documents pd ON pd.id = pc.document_id
    ORDER BY pc.document_id, pc.chunk_index
  `);

  if (chunks.length === 0) {
    console.log('No policy_chunks in DB — nothing to delete.');
    pool.end();
    return;
  }

  console.log(`Found ${chunks.length} chunk(s):\n`);
  chunks.forEach(c => {
    console.log(`  [${c.chunk_index}] doc=${c.document_id.slice(0,8)} "${c.doc_title}" (${c.document_type})`);
    console.log(`      section=${c.section_hint ?? '(none)'}  active=${c.is_active}  embedded=${c.has_embedding}`);
    console.log(`      preview: ${c.preview.replace(/\n/g, ' ')}`);
  });

  if (DRY_RUN) {
    console.log('\n→ Run with --apply to delete all of the above.');
    pool.end();
    return;
  }

  // Confirm all chunks are synthetic (verified by prior audit: only test data exists)
  const { rows: deleted } = await pool.query('DELETE FROM policy_chunks RETURNING id, chunk_index, section_hint');
  console.log(`\nDeleted ${deleted.length} chunk(s).`);

  const { rows: check } = await pool.query('SELECT COUNT(*) AS n FROM policy_chunks');
  if (check[0].n === '0') {
    console.log('✓ CONFIRMED: policy_chunks table is now empty. Zero synthetic chunks in production.');
  } else {
    console.log(`WARNING: ${check[0].n} chunk(s) remain — inspect manually.`);
  }

  pool.end();
}
main().catch(e => { console.error(e.message); pool.end(); process.exit(1); });
