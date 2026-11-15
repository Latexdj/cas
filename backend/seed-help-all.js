'use strict';
// Applies every help-entry seed (seed-help-entries*.js) in turn. Each seed
// inserts new global entries and updates the text of existing ones (matched by
// title), so this is safe to re-run whenever the help content changes.
//
//   node seed-help-all.js
//
// It uses DATABASE_URL from backend/.env, like the individual seeds, so check
// which database that points at before running it.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname)
  .filter(f => /^seed-help-entries.*\.js$/.test(f))
  .sort();

let failed = 0;
for (const f of files) {
  console.log(`\n=== ${f}`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  } catch {
    failed++;
    console.error(`!!! ${f} failed`);
  }
}
console.log(`\nRan ${files.length} help seeds, ${failed} failed.`);
process.exit(failed ? 1 : 0);
