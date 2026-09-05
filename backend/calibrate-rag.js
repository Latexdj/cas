'use strict';
// RAG threshold calibration script.
// Run after: (1) VOYAGE_API_KEY is set, (2) at least one GES document has been
// processed for RAG via the admin UI.
//
// Usage:  node calibrate-rag.js
//
// What it does:
//   1. Embeds a set of known-relevant and known-irrelevant query strings.
//   2. Runs cosine similarity against all active chunks in the DB.
//   3. Prints a similarity table so you can see the natural gap.
//   4. Recommends a threshold value.
//
// Adjust the QUERIES array below to match your actual GES document categories.

require('dotenv').config();
const pool = require('./src/config/db');
const { embedTexts } = require('./src/utils/rag');

// Edit these to match your document content and your known offense categories.
const QUERIES = [
  // Known-relevant (should return chunks)
  { label: 'teacher_query:absenteeism [RELEVANT]',     text: 'teacher query offense: absenteeism.' },
  { label: 'teacher_query:misconduct [RELEVANT]',      text: 'teacher query offense: misconduct.' },
  { label: 'student_letter:insubordination [RELEVANT]',text: 'student disciplinary letter offense: insubordination.' },
  { label: 'student_letter:vandalism [RELEVANT]',      text: 'student disciplinary letter offense: vandalism.' },
  // Known-irrelevant (should NOT match policy content — these categories have no policy clauses)
  { label: 'teacher_query:resignation [IRRELEVANT]',   text: 'teacher query offense: resignation.' },
  { label: 'student_letter:sports [IRRELEVANT]',       text: 'student disciplinary letter offense: sports day.' },
];

async function main() {
  if (!process.env.VOYAGE_API_KEY) {
    console.error('VOYAGE_API_KEY not set — add it to .env first.');
    process.exit(1);
  }

  // Check for active chunks
  const { rows: chunkCount } = await pool.query(
    `SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE is_active) AS active FROM policy_chunks`
  );
  console.log(`Chunks in DB: total=${chunkCount[0].n}  active=${chunkCount[0].active}`);
  if (parseInt(chunkCount[0].active) === 0) {
    console.error('No active chunks — process and activate at least one GES document first.');
    process.exit(1);
  }

  const queryTexts = QUERIES.map(q => q.text);
  console.log(`\nEmbedding ${queryTexts.length} queries…`);
  const embeddings = await embedTexts(queryTexts);

  console.log('\n=== Similarity scores per query (top 5 chunks) ===\n');

  const results = [];
  for (let i = 0; i < QUERIES.length; i++) {
    const q   = QUERIES[i];
    const emb = embeddings[i];
    const embStr = `[${emb.join(',')}]`;

    const { rows } = await pool.query(
      `SELECT pc.section_hint, pd.title AS document_title,
              1 - (pc.embedding <=> $1::vector) AS similarity
       FROM policy_chunks pc
       JOIN policy_documents pd ON pd.id = pc.document_id
       WHERE pc.is_active = true AND pc.embedding IS NOT NULL
       ORDER BY similarity DESC
       LIMIT 5`,
      [embStr]
    );

    const top = rows[0]?.similarity ?? 0;
    const low = rows[rows.length - 1]?.similarity ?? 0;
    results.push({ label: q.label, top, low });

    console.log(`${q.label}`);
    rows.forEach((r, j) => {
      const hint = r.section_hint ? `§${r.section_hint}` : '(no heading)';
      console.log(`  ${j + 1}. ${r.similarity.toFixed(4)}  ${hint}  [${r.document_title}]`);
    });
    console.log();
  }

  // Recommendation
  console.log('=== Threshold recommendation ===\n');
  const relevant   = results.filter(r => r.label.includes('[RELEVANT]'));
  const irrelevant = results.filter(r => r.label.includes('[IRRELEVANT]'));

  const minRelevant   = Math.min(...relevant.map(r => r.top));
  const maxIrrelevant = Math.max(...irrelevant.map(r => r.top));

  console.log(`Lowest top-similarity for RELEVANT queries:   ${minRelevant.toFixed(4)}`);
  console.log(`Highest top-similarity for IRRELEVANT queries: ${maxIrrelevant.toFixed(4)}`);

  if (minRelevant > maxIrrelevant) {
    const suggested = ((minRelevant + maxIrrelevant) / 2).toFixed(2);
    console.log(`\nGap is clear — suggested threshold: ${suggested}`);
    console.log(`Set RAG_SIMILARITY_THRESHOLD=${suggested} in Render environment.`);
  } else {
    console.log(`\nWARNING: No clean gap between relevant and irrelevant.`);
    console.log('Consider: (a) checking chunk quality, (b) adjusting queries above.');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
