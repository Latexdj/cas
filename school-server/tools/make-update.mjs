// Builds the update file for publishing in CAS (Super Admin › App Releases ›
// CAS School Server). It holds the server program at the VERSION in app.js:
// app.js, lms.js, server.js (the launcher), the two pages, vendor/ and tools/.
// Bump VERSION in app.js before building; servers only take a newer version.
//
//   node tools/make-update.mjs        -> dist/cas-school-server-<version>.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = (fs.readFileSync(path.join(here, 'app.js'), 'utf8').match(/const VERSION = '(\d+\.\d+\.\d+)'/) || [])[1];
if (!version) { console.error('No VERSION found in app.js'); process.exit(1); }

const files = {};
const add = (rel) => { files[rel] = fs.readFileSync(path.join(here, ...rel.split('/'))).toString('base64'); };
for (const f of ['app.js', 'lms.js', 'server.js', 'admin.html', 'teacher.html', 'README.txt']) add(f);
const walk = (rel) => {
  for (const d of fs.readdirSync(path.join(here, rel), { withFileTypes: true })) {
    const r = `${rel}/${d.name}`;
    if (d.isDirectory()) walk(r); else add(r);
  }
};
walk('vendor'); walk('tools');

fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
const out = path.join(here, 'dist', `cas-school-server-${version}.json`);
fs.writeFileSync(out, JSON.stringify({ version, built_at: new Date().toISOString(), files }));
console.log(`Built ${out} (${Object.keys(files).length} files, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
