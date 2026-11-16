// The offline Past Questions pack.
//
// Lives in <documentDirectory>/quiz/:
//   manifest.json          what is on this tablet (version, per-subject hash)
//   subjects/<slug>.json   one subject's papers and questions
//   images/<id>.<ext>      diagram images, referenced as "images/<id>.<ext>"
//
// It arrives two ways, and the newer one wins:
//   online  GET /api/pasco-bank/pack/manifest, then only the changed subjects
//   USB     a "Past Questions" folder copied into the LM folder by setup-tablet.bat
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { unzipSync, strFromU8 } from 'fflate';
import { BASE_URL } from './api';

export interface PackSubjectInfo { name: string; slug: string; count: number; hash: string }
export interface PackManifest { version: number; published_at: string | null; subjects: PackSubjectInfo[]; source?: 'online' | 'usb' | 'school' }
export interface PackPaper { id: string; exam: string; year: number | null; paper_label: string | null }
export interface PackQuestion {
  id: string; paper_id: string; question_no: number | null; question_type: 'objective' | 'theory';
  question_text: string; options: string[]; correct: string | null;
  explanation: string | null; marking_scheme: string | null;
  image_url: string | null; image_src?: string | null;
  /** Question pictures, placed by [image N] markers in the text. */
  images?: (string | null)[];
  /** A picture per option (A, B, C...), or null. */
  option_images?: (string | null)[];
  /** Online address each local picture came from, so unchanged ones aren't downloaded again. */
  sources?: Record<string, string>;
  topic: string | null; difficulty: string; year: number | null;
}
export interface SubjectPack { subject: string; slug: string; hash: string; papers: PackPaper[]; questions: PackQuestion[] }

const EXAM_LABEL: Record<string, string> = { WASSCE: 'WASSCE', BECE: 'BECE', NOVDEC: 'Nov/Dec', MOCK: 'Mock', OTHER: '' };
export function paperTitle(p: { exam: string; year: number | null; paper_label: string | null }) {
  return [EXAM_LABEL[p.exam] ?? p.exam, p.year, p.paper_label].filter(Boolean).join(' ');
}

// The web build (used for previews) has no file system: JSON goes to
// localStorage and images stay as their online URLs.
const WEB = Platform.OS === 'web';
const ROOT = WEB ? 'cas_quiz/' : `${FileSystem.documentDirectory}quiz/`;
const SUBJECTS = `${ROOT}subjects/`;
const IMAGES = `${ROOT}images/`;

const USB_DIRS = [
  '/storage/emulated/0/Android/data/com.cas.student/files/LM/Past Questions',
  '/storage/emulated/0/LM/Past Questions',
  '/storage/emulated/0/Past Questions',
];

async function ensureDirs() {
  if (WEB) return;
  for (const d of [ROOT, SUBJECTS, IMAGES]) {
    const info = await FileSystem.getInfoAsync(d);
    if (!info.exists) await FileSystem.makeDirectoryAsync(d, { intermediates: true });
  }
}

async function readJson<T>(uri: string): Promise<T | null> {
  try {
    const raw = WEB ? localStorage.getItem(uri) : await FileSystem.readAsStringAsync(uri);
    return raw ? JSON.parse(raw) as T : null;
  } catch { return null; }
}

// Write to a temp file, then move into place, so a cut-off write never
// leaves a half file behind.
async function writeJson(uri: string, data: unknown) {
  if (WEB) { localStorage.setItem(uri, JSON.stringify(data)); return; }
  const tmp = `${uri}.tmp`;
  await FileSystem.writeAsStringAsync(tmp, JSON.stringify(data));
  await FileSystem.deleteAsync(uri, { idempotent: true });
  await FileSystem.moveAsync({ from: tmp, to: uri });
}

export async function localManifest(): Promise<PackManifest | null> {
  return readJson<PackManifest>(`${ROOT}manifest.json`);
}

export async function loadSubject(slug: string): Promise<SubjectPack | null> {
  return readJson<SubjectPack>(`${SUBJECTS}${slug}.json`);
}

/** Turns a stored picture path into something <Image> can show. */
export function resolveImage(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:|^file:|^data:/.test(path) ? path : `${ROOT}${path}`;
}
export function imageUri(q: PackQuestion): string | null { return resolveImage(q.image_url); }
export function questionImages(q: PackQuestion): (string | null)[] {
  return (q.images ?? (q.image_url ? [q.image_url] : [])).map(resolveImage);
}
export function optionImage(q: PackQuestion, i: number): string | null {
  return resolveImage(q.option_images?.[i]);
}

// Runs fn over every picture slot of a question (question pictures named
// <id>-<n>, option pictures <id>-o<k>) and stores what it returns.
async function eachImage(q: PackQuestion, fn: (path: string, name: string) => Promise<string | null>) {
  q.images = q.images ?? (q.image_url ? [q.image_url] : []);
  q.option_images = q.option_images ?? q.options.map(() => null);
  for (let n = 0; n < q.images.length; n++) {
    const path = q.images[n];
    if (path) q.images[n] = await fn(path, `${q.id}-${n + 1}`);
  }
  for (let k = 0; k < q.option_images.length; k++) {
    const path = q.option_images[k];
    if (path) q.option_images[k] = await fn(path, `${q.id}-o${k + 1}`);
  }
  q.image_url = q.images[0] ?? null;
}
const imagePaths = (q: PackQuestion) =>
  [...(q.images ?? (q.image_url ? [q.image_url] : [])), ...(q.option_images ?? [])].filter((x): x is string => !!x);

// Deletes subjects and images nothing refers to any more.
async function prune(manifest: PackManifest) {
  const keep = new Set(manifest.subjects.map(s => `${s.slug}.json`));
  if (WEB) {
    Object.keys(localStorage).filter(k => k.startsWith(SUBJECTS) && !keep.has(k.slice(SUBJECTS.length))).forEach(k => localStorage.removeItem(k));
    return;
  }
  const used = new Set<string>();
  for (const name of await FileSystem.readDirectoryAsync(SUBJECTS).catch(() => [] as string[])) {
    if (!keep.has(name)) { await FileSystem.deleteAsync(`${SUBJECTS}${name}`, { idempotent: true }); continue; }
    const pack = await readJson<SubjectPack>(`${SUBJECTS}${name}`);
    pack?.questions.forEach(q => imagePaths(q).forEach(x => { if (x.startsWith('images/')) used.add(x.slice(7)); }));
  }
  for (const name of await FileSystem.readDirectoryAsync(IMAGES).catch(() => [] as string[])) {
    if (!used.has(name)) await FileSystem.deleteAsync(`${IMAGES}${name}`, { idempotent: true });
  }
}

const extOf = (url: string) => (url.split('?')[0].match(/\.(png|jpe?g|webp|gif)$/i)?.[1] ?? 'png').toLowerCase();

async function fetchJson<T>(url: string, ms = 20000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally { clearTimeout(t); }
}

export type UpdateResult =
  | { status: 'updated'; changed: number; manifest: PackManifest; source: 'online' | 'school' }
  | { status: 'current'; manifest: PackManifest; source?: 'online' | 'school' }
  | { status: 'offline' }
  | { status: 'failed'; message: string };

/** Where a pack can come from: the CAS cloud or the school server on the Wi-Fi. */
interface PackSource { kind: 'online' | 'school'; manifestUrl: string; subjectUrl: (slug: string) => string }

const cloudSource: PackSource = {
  kind: 'online',
  manifestUrl: `${BASE_URL}/api/pasco-bank/pack/manifest`,
  subjectUrl: (slug) => `${BASE_URL}/api/pasco-bank/pack/subjects/${encodeURIComponent(slug)}`,
};
const schoolSource = (base: string): PackSource => ({
  kind: 'school',
  manifestUrl: `${base}/pack/manifest`,
  subjectUrl: (slug) => `${base}/pack/subjects/${encodeURIComponent(slug)}`,
});

/**
 * Brings the pack up to date from the school server (when one is on the
 * Wi-Fi) or the CAS cloud, whichever has the newer pack. Only subjects
 * whose hash changed are downloaded; images already on the tablet are kept.
 */
export async function updatePack(
  findSchool: () => Promise<{ base: string } | null>,
  onProgress?: (msg: string) => void,
): Promise<UpdateResult> {
  const tryManifest = async (src: PackSource, ms: number) => {
    try { return { src, remote: await fetchJson<PackManifest>(src.manifestUrl, ms) }; } catch { return null; }
  };
  const [school, cloud] = await Promise.all([
    findSchool().then(s => (s ? tryManifest(schoolSource(s.base), 8000) : null)).catch(() => null),
    tryManifest(cloudSource, 12000),
  ]);
  // The newer pack wins; on a tie the school server, which is faster.
  const best = [school, cloud].filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.remote.version - a.remote.version || (a.src.kind === 'school' ? -1 : 1))[0];
  if (!best) return { status: 'offline' };
  return applyRemote(best.src, best.remote, onProgress);
}

/** Cloud only (kept for callers that don't look for a school server). */
export async function updateOnline(onProgress?: (msg: string) => void): Promise<UpdateResult> {
  return updatePack(async () => null, onProgress);
}

async function applyRemote(src: PackSource, remote: PackManifest, onProgress?: (msg: string) => void): Promise<UpdateResult> {
  try {
    await ensureDirs();
    const local = await localManifest();
    // Never go back to an older pack (a USB pack can be newer than a source).
    if (local && remote.version < local.version) return { status: 'current', manifest: local, source: src.kind };
    const localHash = new Map((local?.subjects ?? []).map(s => [s.slug, s.hash]));
    const changed = remote.subjects.filter(s => localHash.get(s.slug) !== s.hash);
    const removed = (local?.subjects ?? []).some(s => !remote.subjects.find(r => r.slug === s.slug));
    if (!changed.length && !removed && local) {
      if (local.version !== remote.version) await writeJson(`${ROOT}manifest.json`, { ...remote, source: src.kind });
      return { status: 'current', manifest: { ...remote, source: src.kind }, source: src.kind };
    }

    for (const [i, s] of changed.entries()) {
      onProgress?.(`Downloading ${s.name} (${i + 1} of ${changed.length})`);
      const pack = await fetchJson<SubjectPack>(src.subjectUrl(s.slug), 60000);
      const old = await loadSubject(s.slug);
      const oldQ = new Map((old?.questions ?? []).map(q => [q.id, q]));
      let missing = false;
      for (const q of pack.questions) {
        if (WEB) continue;   // the web preview shows the online pictures directly
        const prev = oldQ.get(q.id)?.sources ?? {};
        const sources: Record<string, string> = {};
        await eachImage(q, async (src, name) => {
          const rel = `images/${name}.${extOf(src)}`;
          sources[name] = src;
          const have = prev[name] === src && (await FileSystem.getInfoAsync(`${ROOT}${rel}`)).exists;
          if (!have) {
            try { await FileSystem.downloadAsync(src, `${ROOT}${rel}`); }
            catch { missing = true; return null; }   // shown without it; tried again next update
          }
          return rel;
        });
        q.sources = sources;
      }
      // A subject whose images failed keeps an old hash so it retries next time.
      await writeJson(`${SUBJECTS}${s.slug}.json`, pack);
      if (missing) s.hash = `${s.hash}-partial`;
    }
    const manifest: PackManifest = { version: remote.version, published_at: remote.published_at, subjects: remote.subjects, source: src.kind };
    await writeJson(`${ROOT}manifest.json`, manifest);
    await prune(manifest);
    return { status: 'updated', changed: changed.length, manifest, source: src.kind };
  } catch (e) {
    return { status: 'failed', message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Loads a pack copied over USB, if there is one newer than what the tablet
 * already has. Returns the new manifest, or null when nothing was loaded.
 */
export async function importUsb(): Promise<PackManifest | null> {
  if (Platform.OS !== 'android') return null;
  const local = await localManifest();
  for (const dir of USB_DIRS) {
    const usb = await readJson<PackManifest>(`file://${dir}/manifest.json`);
    if (!usb || !Array.isArray(usb.subjects)) continue;
    if (local && usb.version <= local.version) return null;
    await ensureDirs();
    for (const s of usb.subjects) {
      const pack = await readJson<SubjectPack>(`file://${dir}/subjects/${s.slug}.json`);
      if (!pack) continue;
      for (const q of pack.questions) {
        await eachImage(q, async (rel) => {
          if (!rel.startsWith('images/')) return null;
          try {
            await FileSystem.deleteAsync(`${ROOT}${rel}`, { idempotent: true });
            await FileSystem.copyAsync({ from: `file://${dir}/${rel}`, to: `${ROOT}${rel}` });
            return rel;
          } catch { return null; }
        });
      }
      await writeJson(`${SUBJECTS}${s.slug}.json`, pack);
    }
    const manifest: PackManifest = { version: usb.version, published_at: usb.published_at, subjects: usb.subjects, source: 'usb' };
    await writeJson(`${ROOT}manifest.json`, manifest);
    await prune(manifest);
    return manifest;
  }
  return null;
}

// ── Pack .zip picked from a USB drive (or anywhere else) ──────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12)
      | ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
      + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=')
      + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}

export type ZipResult =
  | { status: 'loaded'; manifest: PackManifest; questions: number }
  | { status: 'older'; fileVersion: number; tabletVersion: number }
  | { status: 'invalid'; message: string };

/**
 * Loads a Past Questions pack .zip (as downloaded from Super Admin) from a
 * file the student or teacher picked, for example on a USB flash drive.
 * A pack older than, or the same as, the one on the tablet is refused unless
 * force is set.
 */
export async function importZip(uri: string, opts: { force?: boolean } = {}): Promise<ZipResult> {
  let files: Record<string, Uint8Array>;
  try {
    const bytes = WEB
      ? new Uint8Array(await (await fetch(uri)).arrayBuffer())
      : b64ToBytes(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }));
    files = unzipSync(bytes);
  } catch {
    return { status: 'invalid', message: 'That file could not be opened. Choose the .zip file downloaded from Past Questions in Super Admin.' };
  }

  // The zip holds "Past Questions/manifest.json"; accept it at any depth.
  const manifestPath = Object.keys(files).find(k => /(^|\/)manifest\.json$/.test(k) && !k.includes('__MACOSX'));
  if (!manifestPath) return { status: 'invalid', message: 'This .zip is not a Past Questions pack: it has no manifest.json.' };
  const base = manifestPath.slice(0, -'manifest.json'.length);
  let manifest: PackManifest;
  try { manifest = JSON.parse(strFromU8(files[manifestPath])); } catch { return { status: 'invalid', message: 'The pack is damaged: its manifest could not be read.' }; }
  if (!Array.isArray(manifest.subjects) || typeof manifest.version !== 'number') {
    return { status: 'invalid', message: 'This .zip is not a Past Questions pack.' };
  }

  const local = await localManifest();
  if (local && manifest.version <= local.version && !opts.force) {
    return { status: 'older', fileVersion: manifest.version, tabletVersion: local.version };
  }

  await ensureDirs();
  let questions = 0;
  const loaded: PackSubjectInfo[] = [];
  for (const s of manifest.subjects) {
    const raw = files[`${base}subjects/${s.slug}.json`];
    if (!raw) continue;
    let pack: SubjectPack;
    try { pack = JSON.parse(strFromU8(raw)); } catch { continue; }
    for (const q of pack.questions) {
      await eachImage(q, async (rel) => {
        const img = rel.startsWith('images/') ? files[`${base}${rel}`] : undefined;
        if (!img) return null;
        if (WEB) {
          const ext = rel.split('.').pop()?.toLowerCase() ?? 'png';
          return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${bytesToB64(img)}`;
        }
        await FileSystem.writeAsStringAsync(`${ROOT}${rel}`, bytesToB64(img), { encoding: FileSystem.EncodingType.Base64 });
        return rel;
      });
    }
    await writeJson(`${SUBJECTS}${s.slug}.json`, pack);
    questions += pack.questions.length;
    loaded.push(s);
  }
  if (!loaded.length) return { status: 'invalid', message: 'The pack has no subjects in it.' };

  const next: PackManifest = { version: manifest.version, published_at: manifest.published_at, subjects: loaded, source: 'usb' };
  await writeJson(`${ROOT}manifest.json`, next);
  await prune(next);
  return { status: 'loaded', manifest: next, questions };
}
