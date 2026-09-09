'use strict';
// RAG threshold calibration script.
// Run after: (1) VOYAGE_API_KEY is set, (2) at least one real policy document has been
// processed for RAG via the admin UI and activated.
//
// Usage:  node calibrate-rag.js
//
// What it does:
//   1. Reads active chunks from the DB and identifies which document types are present.
//   2. Embeds a set of queries matched to the actual document types in the DB.
//   3. Prints similarity scores so you can see the natural gap.
//   4. Recommends a threshold value.
//
// QUERIES below are organised by document_type. Only queries matching document types
// that have active chunks are actually embedded and tested. Add or adjust entries here
// to match the offense/category vocabulary of the real documents you have processed.

require('dotenv').config();
const pool = require('./src/config/db');
const { embedTexts } = require('./src/utils/rag');

// Queries keyed by document_type (or 'any' to always include).
// Mark RELEVANT if that category has direct coverage in documents of that type.
// Mark IRRELEVANT if it genuinely has no coverage (used to set the floor).
// Keep at least 3 RELEVANT and 2 IRRELEVANT entries per type present in the DB.
const QUERY_SETS = {
  ges_teacher_code: [
    // Teacher-applicable categories — should score well against teacher code of conduct
    { label: 'teacher_query:absenteeism [RELEVANT]',      text: 'teacher query offense: absenteeism.' },
    { label: 'teacher_query:misconduct [RELEVANT]',       text: 'teacher query offense: misconduct.' },
    { label: 'teacher_query:insubordination [RELEVANT]',  text: 'teacher query offense: insubordination.' },
    { label: 'teacher_query:negligence [RELEVANT]',       text: 'teacher query offense: negligence of duty.' },
    { label: 'teacher_query:dishonesty [RELEVANT]',       text: 'teacher query offense: dishonesty.' },
    // Genuinely off-topic for a teacher conduct doc — should score low
    { label: 'teacher_query:sports_day [IRRELEVANT]',     text: 'teacher query offense: sports day mishap.' },
    { label: 'teacher_query:graduation [IRRELEVANT]',     text: 'teacher query offense: graduation ceremony.' },
  ],
  school_rules: [
    // Student-applicable categories — should score well against school rules
    { label: 'student_letter:absenteeism [RELEVANT]',     text: 'student disciplinary letter offense: absenteeism.' },
    { label: 'student_letter:insubordination [RELEVANT]', text: 'student disciplinary letter offense: insubordination.' },
    { label: 'student_letter:misconduct [RELEVANT]',      text: 'student disciplinary letter offense: misconduct.' },
    { label: 'student_letter:vandalism [RELEVANT]',       text: 'student disciplinary letter offense: vandalism.' },
    { label: 'student_letter:bullying [RELEVANT]',        text: 'student disciplinary letter offense: bullying.' },
    // Off-topic for student school rules
    { label: 'student_letter:sports_day [IRRELEVANT]',    text: 'student disciplinary letter offense: sports day mishap.' },
    { label: 'student_letter:graduation [IRRELEVANT]',    text: 'student disciplinary letter offense: graduation ceremony.' },
  ],
  ges_student_conduct: [
    { label: 'student_letter:absenteeism [RELEVANT]',     text: 'student disciplinary letter offense: absenteeism.' },
    { label: 'student_letter:insubordination [RELEVANT]', text: 'student disciplinary letter offense: insubordination.' },
    { label: 'student_letter:misconduct [RELEVANT]',      text: 'student disciplinary letter offense: misconduct.' },
    { label: 'student_letter:vandalism [RELEVANT]',       text: 'student disciplinary letter offense: vandalism.' },
    { label: 'student_letter:sports_day [IRRELEVANT]',    text: 'student disciplinary letter offense: sports day mishap.' },
    { label: 'student_letter:graduation [IRRELEVANT]',    text: 'student disciplinary letter offense: graduation ceremony.' },
  ],
};

async function main() {
  if (!process.env.VOYAGE_API_KEY) {
    console.error('VOYAGE_API_KEY not set — add it to .env first.');
    process.exit(1);
  }

  // Check for active embedded chunks, grouped by document_type
  const { rows: docTypes } = await pool.query(`
    SELECT DISTINCT pd.document_type,
           COUNT(pc.id) AS active_chunks
    FROM policy_chunks pc
    JOIN policy_documents pd ON pd.id = pc.document_id
    WHERE pc.is_active = true AND pc.embedding IS NOT NULL
    GROUP BY pd.document_type
  `);

  if (docTypes.length === 0) {
    console.error('No active embedded chunks — process and activate at least one real policy document first.');
    process.exit(1);
  }

  const { rows: totalCheck } = await pool.query(
    'SELECT COUNT(*) AS n FROM policy_chunks WHERE is_active = true AND embedding IS NOT NULL'
  );
  console.log(`Active embedded chunks: ${totalCheck[0].n}`);
  console.log('Document types with active chunks:');
  docTypes.forEach(r => console.log(`  ${r.document_type}: ${r.active_chunks} chunks`));

  // Build the query list for types that are actually present
  const queries = [];
  for (const { document_type } of docTypes) {
    const qset = QUERY_SETS[document_type];
    if (!qset) {
      console.log(`\nNote: no QUERY_SETS entry for document_type "${document_type}" — skipping calibration for it.`);
      console.log(`Add entries to QUERY_SETS["${document_type}"] in calibrate-rag.js to include it.`);
      continue;
    }
    queries.push(...qset.map(q => ({ ...q, document_type })));
  }

  if (queries.length === 0) {
    console.error('No queries to test — add entries to QUERY_SETS for the document types above.');
    process.exit(1);
  }

  console.log(`\nEmbedding ${queries.length} queries…`);
  const queryTexts = queries.map(q => q.text);
  const embeddings = await embedTexts(queryTexts);

  console.log('\n=== Similarity scores per query (top 5 chunks) ===\n');

  const results = [];
  for (let i = 0; i < queries.length; i++) {
    const q   = queries[i];
    const emb = embeddings[i];
    const embStr = `[${emb.join(',')}]`;

    const { rows } = await pool.query(
      `SELECT pc.section_hint, pd.title AS document_title, pd.document_type,
              1 - (pc.embedding <=> $1::vector) AS similarity
       FROM policy_chunks pc
       JOIN policy_documents pd ON pd.id = pc.document_id
       WHERE pc.is_active = true AND pc.embedding IS NOT NULL
         AND pd.document_type = $2
       ORDER BY similarity DESC
       LIMIT 5`,
      [embStr, q.document_type]
    );

    const top = rows[0] ? Number(rows[0].similarity) : 0;
    const low = rows.length > 0 ? Number(rows[rows.length - 1].similarity) : 0;
    results.push({ label: q.label, document_type: q.document_type, top, low });

    console.log(`${q.label}  [${q.document_type}]`);
    rows.forEach((r, j) => {
      const hint = r.section_hint ? `§${r.section_hint}` : '(no heading)';
      console.log(`  ${j + 1}. ${Number(r.similarity).toFixed(4)}  ${hint}  [${r.document_title}]`);
    });
    console.log();
  }

  // Recommendation — computed per document_type
  console.log('=== Threshold recommendation ===\n');

  const byType = {};
  for (const r of results) {
    if (!byType[r.document_type]) byType[r.document_type] = { relevant: [], irrelevant: [] };
    if (r.label.includes('[RELEVANT]')) byType[r.document_type].relevant.push(r.top);
    else                                byType[r.document_type].irrelevant.push(r.top);
  }

  let overallMin = Infinity, overallMax = -Infinity;
  for (const [dtype, { relevant, irrelevant }] of Object.entries(byType)) {
    if (relevant.length === 0 || irrelevant.length === 0) {
      console.log(`${dtype}: not enough data (need both RELEVANT and IRRELEVANT queries)`);
      continue;
    }
    const minR = Math.min(...relevant);
    const maxI = Math.max(...irrelevant);
    console.log(`${dtype}:`);
    console.log(`  Lowest top-similarity for RELEVANT:   ${minR.toFixed(4)}`);
    console.log(`  Highest top-similarity for IRRELEVANT: ${maxI.toFixed(4)}`);

    if (minR > maxI) {
      const suggested = ((minR + maxI) / 2).toFixed(2);
      console.log(`  Gap is clear — suggested threshold: ${suggested}`);
      overallMin = Math.min(overallMin, parseFloat(suggested));
      overallMax = Math.max(overallMax, parseFloat(suggested));
    } else {
      console.log(`  WARNING: No clean gap. minRelevant (${minR.toFixed(4)}) <= maxIrrelevant (${maxI.toFixed(4)}).`);
      console.log(`  Investigate: (a) chunk quality too low, (b) IRRELEVANT query overlaps real content.`);
    }
    console.log();
  }

  if (overallMin !== Infinity) {
    // Use the more conservative (lower) suggested threshold when multiple types present
    const finalSuggested = overallMin.toFixed(2);
    console.log(`Overall recommended RAG_SIMILARITY_THRESHOLD=${finalSuggested}`);
    console.log(`Set this in Render environment → backend service → Environment Variables.`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
