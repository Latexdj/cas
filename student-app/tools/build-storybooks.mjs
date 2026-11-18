// Builds the Storybooks library from the African Storybook Project
// (https://africanstorybook.org), via the Global-ASP repositories:
//   global-asp/asp-source     story text in Markdown, one folder per language
//   global-asp/asp-imagebank  the pictures, medium/<id>/<nn>.jpg
//
// Only English stories whose text AND pictures are CC BY are kept (no
// NC licences), and only stories whose pictures line up with their pages:
// picture 01 is the cover, page n uses picture n+1, and an optional last
// picture is the back cover.
//
//   node tools/build-storybooks.mjs <path to an asp-source clone>
//
// Writes:
//   assets/storybooks/en.json         the library, bundled in the app
//   ../school-server/vendor/storybooks.json  the picture list the school server mirrors
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, 'en'))) { console.error('Usage: node tools/build-storybooks.mjs <asp-source clone>'); process.exit(1); }

// Pinned so a picture never changes under a story.
const IMAGEBANK_SHA = 'a56e6dbe7aeeb8ea3e53d9941664416e2e7356ad';
const IMAGE_BASE = `https://raw.githubusercontent.com/global-asp/asp-imagebank/${IMAGEBANK_SHA}/medium`;

const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r; };

// Picture counts per story, and the picture licence per story.
const tree = (await (await get(`https://api.github.com/repos/global-asp/asp-imagebank/git/trees/${IMAGEBANK_SHA}?recursive=1`)).json()).tree;
const pictures = {};
for (const t of tree) {
  const m = t.path.match(/^medium\/(\d{4})\/(\d+)\.jpg$/);
  if (m) pictures[m[1]] = Math.max(pictures[m[1]] ?? 0, Number(m[2]));
}
const bankReadme = await (await get(`https://raw.githubusercontent.com/global-asp/asp-imagebank/${IMAGEBANK_SHA}/README.md`)).text();
const pictureLicence = {};
for (const l of bankReadme.split('\n')) {
  const m = l.match(/^(\d{4}) \| _.*_ \| \*\*.*\*\* \| (.*)$/);
  if (m) pictureLicence[m[1]] = m[2].trim();
}

// Licence version and the story's page on africanstorybook.org, from en/README.md.
const textInfo = {};
for (const l of fs.readFileSync(path.join(src, 'en', 'README.md'), 'utf8').split('\n')) {
  const m = l.match(/^(\d{4}) \| \[.*\]\((http[^)]+)\) \| \[CC-BY\]\(https:\/\/creativecommons\.org\/licenses\/by\/(\d\.\d)\/\)/);
  if (m) textInfo[m[1]] = { url: m[2].replace(/^http:/, 'https:'), version: m[3] };
}

// Text is hard-wrapped like the printed page: join lines into paragraphs.
const tidy = (block) => block.split(/\n\s*\n/)
  .map(p => p.split('\n').map(x => x.trim()).filter(Boolean).join(' ').replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1').replace(/\s+/g, ' ').trim())
  .filter(Boolean).join('\n\n');

const words = (s) => s.split(/\s+/).filter(Boolean).length;
// Levels follow the African Storybook's own idea of them, from words per page.
const levelFor = (perPage) => (perPage <= 12 ? 1 : perPage <= 30 ? 2 : perPage <= 55 ? 3 : 4);

const stories = [];
const skipped = { licence: 0, pictures: 0 };
for (const file of fs.readdirSync(path.join(src, 'en')).filter(f => /^\d{4}_.*\.md$/.test(f)).sort()) {
  const id = file.slice(0, 4);
  const raw = fs.readFileSync(path.join(src, 'en', file), 'utf8').replace(/\r/g, '');
  if (!/^\* License: \[CC-BY\]\s*$/m.test(raw) || pictureLicence[id] !== 'CC BY' || !textInfo[id]) { skipped.licence++; continue; }

  const sections = raw.split(/^##\s*$/m);
  const title = sections[0].replace(/^#\s*/, '').trim();
  const body = sections.slice(1);
  const last = body.pop() ?? '';
  const meta = {}; const after = [];
  for (const l of last.split('\n')) {
    const m = l.match(/^\* (\w+): (.*)$/);
    if (m) meta[m[1].toLowerCase()] = m[2].trim(); else after.push(l);
  }
  const pages = body.map(tidy).filter(Boolean);
  const extra = tidy(after.join('\n'));   // a last page that ended up after the credits
  if (extra) pages.push(extra);

  const count = pictures[id] ?? 0;
  if (!pages.length || (count !== pages.length + 1 && count !== pages.length + 2)) { skipped.pictures++; continue; }

  const total = pages.reduce((n, p) => n + words(p), 0);
  stories.push({
    id, title,
    author: meta.text || 'Unknown',
    illustrator: meta.illustration || 'Unknown',
    licence: `CC BY ${textInfo[id].version}`,
    url: textInfo[id].url,
    level: levelFor(total / pages.length),
    words: total,
    pictures: count,
    pages,
  });
}

const library = {
  source: 'African Storybook (africanstorybook.org), via the Global-ASP project (github.com/global-asp)',
  image_base: IMAGE_BASE,
  built_at: new Date().toISOString().slice(0, 10),
  stories,
};
fs.mkdirSync(path.join(here, 'assets', 'storybooks'), { recursive: true });
fs.writeFileSync(path.join(here, 'assets', 'storybooks', 'en.json'), JSON.stringify(library));
fs.writeFileSync(path.join(here, '..', 'school-server', 'vendor', 'storybooks.json'),
  JSON.stringify({ image_base: IMAGE_BASE, pictures: Object.fromEntries(stories.map(s => [s.id, s.pictures])) }));

const byLevel = [1, 2, 3, 4].map(l => stories.filter(s => s.level === l).length);
console.log(`${stories.length} stories (levels 1-4: ${byLevel.join(', ')}); skipped ${skipped.licence} for licence, ${skipped.pictures} for pictures.`);
console.log(`en.json ${(fs.statSync(path.join(here, 'assets', 'storybooks', 'en.json')).size / 1024).toFixed(0)} KB`);
