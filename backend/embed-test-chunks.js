'use strict';
// One-time: embed the test chunks inserted by verify-phases.js (they have NULL embeddings).
// Needed before live retrieval test and calibration can run.

require('dotenv').config();
const pool = require('./src/config/db');
const { embedTexts } = require('./src/utils/rag');

async function main() {
  const { rows } = await pool.query(
    `SELECT pc.id, pc.chunk_text, pc.section_hint, pd.title
     FROM policy_chunks pc
     JOIN policy_documents pd ON pd.id = pc.document_id
     WHERE pc.embedding IS NULL AND pc.is_active = true
     ORDER BY pc.document_id, pc.chunk_index`
  );

  if (rows.length === 0) {
    console.log('No unembedded active chunks found.');
    pool.end();
    return;
  }

  console.log(`Embedding ${rows.length} chunks…`);
  const texts = rows.map(r => r.chunk_text);
  const embeddings = await embedTexts(texts);
  console.log(`Got ${embeddings.length} embeddings, dim=${embeddings[0]?.length}`);

  for (let i = 0; i < rows.length; i++) {
    const embStr = `[${embeddings[i].join(',')}]`;
    await pool.query(
      'UPDATE policy_chunks SET embedding = $1::vector WHERE id = $2',
      [embStr, rows[i].id]
    );
    console.log(`  Embedded chunk id=${rows[i].id.slice(0,8)} section=${rows[i].section_hint ?? '(none)'} [${rows[i].title}]`);
  }

  const { rows: check } = await pool.query(
    'SELECT COUNT(*) AS n FROM policy_chunks WHERE embedding IS NOT NULL AND is_active = true'
  );
  console.log(`Done. Active chunks with embeddings: ${check[0].n}`);
  pool.end();
}

main().catch(e => { console.error(e.message); pool.end(); process.exit(1); });
