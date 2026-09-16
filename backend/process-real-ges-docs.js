'use strict';
// Downloads real GES policy PDFs, chunks and embeds them, inserts as inactive.
// Admin reviews chunk previews via the UI, then activates.
//
// Usage: node process-real-ges-docs.js [--activate]
//   Without --activate: inserts chunks inactive (safe default, requires human review)
//   With    --activate: also sets is_active=true immediately (skips manual review step)

require('dotenv').config();
const pdfParse = require('pdf-parse');
const pool     = require('./src/config/db');
const { chunkPolicyText, embedTexts } = require('./src/utils/rag');

const ACTIVATE = process.argv.includes('--activate');

// GES documents to process. Each entry maps to an existing policy_documents row.
// document_id: existing row in policy_documents (must exist).
// url:         public PDF URL.
// label:       human description for logging.
const GES_DOCS = [
  {
    document_id: '9d028ee1-eee9-4e6a-8599-fe024389fb7b', // "GES Standards for techers" [ges_teacher_code]
    url: 'https://ges.gov.gh/wp-content/uploads/2021/08/GES-CODE-OF-CONDUCT.pdf',
    label: 'GES Code of Conduct (Teacher)',
  },
  {
    document_id: '72ce44e4-75f5-4892-adec-a5f45d887746', // "GES CODE OF CONDUCT FOR STUDENTS" [school_rules]
    url: 'https://ges.gov.gh/wp-content/uploads/2024/01/CODE-OF-CONDUCT-FOR-STUDENTS-IN-THE-PRE-TERTIARY-LEVELS-OF-EDUCATION-IN-THE-GES.pdf',
    label: 'GES Code of Conduct for Students',
  },
];

async function downloadPdf(url) {
  console.log(`  Downloading ${url.split('/').pop()}…`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CAS-RAG-Processor/1.0 (school management system; policy grounding)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  const buf = await res.arrayBuffer();
  console.log(`  Downloaded ${(buf.byteLength / 1024).toFixed(0)} KB`);
  return new Uint8Array(buf);
}

async function processDoc(doc) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Processing: ${doc.label}`);
  console.log(`  document_id: ${doc.document_id}`);

  // Verify doc exists in DB
  const { rows: dbDoc } = await pool.query(
    'SELECT id, title, document_type, school_id FROM policy_documents WHERE id = $1',
    [doc.document_id]
  );
  if (!dbDoc.length) throw new Error(`policy_documents row not found for id=${doc.document_id}`);
  console.log(`  DB record: "${dbDoc[0].title}" [${dbDoc[0].document_type}] school=${dbDoc[0].school_id ?? 'NULL (GES national)'}`);

  // Download and parse PDF
  const pdfBytes = await downloadPdf(doc.url);
  const parsed   = await pdfParse(Buffer.from(pdfBytes));
  const rawText  = parsed.text;
  console.log(`  Extracted text: ${rawText.length} chars, ~${Math.round(rawText.length / 4)} tokens`);
  if (rawText.length < 200) throw new Error('PDF text too short — may be image-based or failed to parse');

  // Chunk
  const chunks = chunkPolicyText(rawText);
  console.log(`  Chunks: ${chunks.length}`);
  chunks.forEach(c => console.log(`    [${c.chunk_index}] §${c.section_hint ?? '(no heading)'} len=${c.chunk_text.length} ~${c.token_count} tok`));

  // Embed (respecting 3 RPM rate limit with delay between batches)
  console.log(`  Embedding ${chunks.length} chunks via Voyage AI…`);
  const texts = chunks.map(c => c.chunk_text);
  const embeddings = await embedTexts(texts);
  console.log(`  Embeddings received: ${embeddings.length} × dim=${embeddings[0]?.length}`);

  // Transactional upsert: delete existing, insert fresh
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount: deleted } = await client.query(
      'DELETE FROM policy_chunks WHERE document_id = $1',
      [doc.document_id]
    );
    if (deleted > 0) console.log(`  Cleared ${deleted} prior chunk(s) for this document`);

    for (let i = 0; i < chunks.length; i++) {
      const c   = chunks[i];
      const emb = `[${embeddings[i].join(',')}]`;
      await client.query(
        `INSERT INTO policy_chunks
           (document_id, chunk_index, section_hint, chunk_text, token_count, embedding, is_active)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7)`,
        [doc.document_id, c.chunk_index, c.section_hint, c.chunk_text, c.token_count, emb, ACTIVATE]
      );
    }
    await client.query('COMMIT');
    console.log(`  Inserted ${chunks.length} chunks (is_active=${ACTIVATE})`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // Print chunk previews for review
  console.log(`\n  Chunk previews (first 250 chars each):`);
  chunks.forEach(c => {
    console.log(`    [${c.chunk_index}] §${c.section_hint ?? '(none)'}`);
    console.log(`      ${c.chunk_text.slice(0, 250).replace(/\n/g, ' ')}`);
  });

  return { label: doc.label, document_id: doc.document_id, chunk_count: chunks.length };
}

async function main() {
  if (!process.env.VOYAGE_API_KEY) {
    console.error('VOYAGE_API_KEY not set'); process.exit(1);
  }

  console.log(`Mode: ${ACTIVATE ? 'INSERT + ACTIVATE' : 'INSERT INACTIVE (human review required before use)'}`);

  const results = [];
  for (const doc of GES_DOCS) {
    try {
      const r = await processDoc(doc);
      results.push({ ...r, status: 'ok' });
      // Small delay between docs to respect Voyage rate limit
      if (GES_DOCS.indexOf(doc) < GES_DOCS.length - 1) {
        console.log('\n  Pausing 20s between documents (Voyage 3 RPM limit)…');
        await new Promise(r => setTimeout(r, 20000));
      }
    } catch (e) {
      console.error(`\nFAILED: ${doc.label} — ${e.message}`);
      results.push({ label: doc.label, status: 'error', error: e.message });
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('SUMMARY:');
  results.forEach(r => {
    if (r.status === 'ok') {
      console.log(`  ✓ ${r.label}: ${r.chunk_count} chunks inserted (${ACTIVATE ? 'ACTIVE' : 'inactive — activate via admin UI'})`);
    } else {
      console.log(`  ✗ ${r.label}: FAILED — ${r.error}`);
    }
  });

  if (!ACTIVATE) {
    console.log('\nNext steps:');
    console.log('  1. Review chunk previews above');
    console.log('  2. In the admin UI: Policy Documents → select document → "Activate Chunks"');
    console.log('  OR run:  node process-real-ges-docs.js --activate  (re-processes and activates in one pass)');
    console.log('  3. Then run: node calibrate-rag.js');
  } else {
    console.log('\nChunks are active. Run: node calibrate-rag.js');
  }

  pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); pool.end(); process.exit(1); });
