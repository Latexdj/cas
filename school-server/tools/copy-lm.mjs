// Copies a school's LM folder into the school server's LM, tidying as it goes:
//   - VIDEOS folders become VIDEO
//   - a programme folder directly under ELECTIVE SUBJECTS goes under TEXTBOOKS
//     (FORM 3/ELECTIVE SUBJECTS/General Arts -> FORM 3/ELECTIVE SUBJECTS/TEXTBOOKS/General Arts)
//   - app installers (.apk) and unfinished downloads (.crdownload, .part) are left out
// Empty folders are copied too. Files already there with the same size are skipped.
//
//   node tools/copy-lm.mjs <from LM folder> <to LM folder> [--dirs-only] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';

const [from, to] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DIRS_ONLY = process.argv.includes('--dirs-only');
const DRY = process.argv.includes('--dry-run');
if (!from || !to) { console.error('Usage: node tools/copy-lm.mjs <from> <to> [--dirs-only] [--dry-run]'); process.exit(1); }

const TYPES = /^(TEXTBOOKS|VIDEO|VIDEOS|PICTURES|TEACHER NOTES)$/i;
const SKIP = /(\.apk|\.crdownload|\.part|\.partial|\.tmp)$|^(desktop\.ini|thumbs\.db)$/i;

function tidy(parts) {
  const out = parts.map(p => (/^videos$/i.test(p) ? 'VIDEO' : p));
  const i = out.findIndex(p => /^elective subjects$/i.test(p));
  if (i >= 0 && out[i + 1] && !TYPES.test(out[i + 1])) out.splice(i + 1, 0, 'TEXTBOOKS');
  return out;
}

let dirs = 0, files = 0, skipped = 0, same = 0, bytes = 0;
const renamed = new Set();
function walk(rel) {
  const abs = path.join(from, ...rel);
  for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue;
    const parts = [...rel, d.name];
    const destParts = tidy(parts);
    if (destParts.join('/') !== parts.join('/')) renamed.add(`${parts.slice(0, -1).join('/')} -> ${destParts.slice(0, -1).join('/')}`);
    const dest = path.join(to, ...destParts);
    if (d.isDirectory()) {
      dirs++;
      if (!DRY) fs.mkdirSync(dest, { recursive: true });
      walk(parts);
    } else if (d.isFile()) {
      if (SKIP.test(d.name) || DIRS_ONLY) { if (SKIP.test(d.name)) skipped++; continue; }
      const st = fs.statSync(path.join(abs, d.name));
      let have = null; try { have = fs.statSync(dest); } catch { /* new */ }
      if (have && have.size === st.size) { same++; continue; }
      files++; bytes += st.size;
      if (!DRY) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(abs, d.name), `${dest}.copying`);
        fs.renameSync(`${dest}.copying`, dest);
        fs.utimesSync(dest, st.atime, st.mtime);
      }
    }
  }
}
walk([]);
console.log(`${DRY ? 'Would copy' : 'Copied'} ${dirs} folders and ${files} files (${(bytes / 1073741824).toFixed(2)} GB); ${same} already there; ${skipped} left out.`);
console.log('Tidied:', [...new Set([...renamed].map(x => x.split(' -> ').map(s => s.split('/').slice(0, 4).join('/')).join(' -> ')))].join('\n  '));
