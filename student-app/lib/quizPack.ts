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
import { BASE_URL } from './api';

export interface PackSubjectInfo { name: string; slug: string; count: number; hash: string }
export interface PackManifest { version: number; published_at: string | null; subjects: PackSubjectInfo[]; source?: 'online' | 'usb' }
export interface PackPaper { id: string; exam: string; year: number | null; paper_label: string | null }
export interface PackQuestion {
  id: string; paper_id: string; question_no: number | null; question_type: 'objective' | 'theory';
  question_text: string; options: string[]; correct: string | null;
  explanation: string | null; marking_scheme: string | null;
  image_url: string | null; image_src?: string | null;
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

/** Turns a question's stored image path into something <Image> can show. */
export function imageUri(q: PackQuestion): string | null {
  if (!q.image_url) return null;
  return /^https?:|^file:/.test(q.image_url) ? q.image_url : `${ROOT}${q.image_url}`;
}

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
    pack?.questions.forEach(q => { if (q.image_url?.startsWith('images/')) used.add(q.image_url.slice(7)); });
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
  | { status: 'updated'; changed: number; manifest: PackManifest }
  | { status: 'current'; manifest: PackManifest }
  | { status: 'offline' }
  | { status: 'failed'; message: string };

/**
 * Brings the pack up to date from the server. Only subjects whose hash
 * changed are downloaded; images already on the tablet are kept.
 */
export async function updateOnline(onProgress?: (msg: string) => void): Promise<UpdateResult> {
  let remote: PackManifest;
  try { remote = await fetchJson<PackManifest>(`${BASE_URL}/api/pasco-bank/pack/manifest`, 12000); }
  catch { return { status: 'offline' }; }

  try {
    await ensureDirs();
    const local = await localManifest();
    const localHash = new Map((local?.subjects ?? []).map(s => [s.slug, s.hash]));
    const changed = remote.subjects.filter(s => localHash.get(s.slug) !== s.hash);
    const removed = (local?.subjects ?? []).some(s => !remote.subjects.find(r => r.slug === s.slug));
    if (!changed.length && !removed && local) {
      if (local.version !== remote.version) await writeJson(`${ROOT}manifest.json`, { ...remote, source: 'online' });
      return { status: 'current', manifest: { ...remote, source: 'online' } };
    }

    for (const [i, s] of changed.entries()) {
      onProgress?.(`Downloading ${s.name} (${i + 1} of ${changed.length})`);
      const pack = await fetchJson<SubjectPack>(`${BASE_URL}/api/pasco-bank/pack/subjects/${encodeURIComponent(s.slug)}`, 60000);
      const old = await loadSubject(s.slug);
      const oldSrc = new Map((old?.questions ?? []).map(q => [q.id, q]));
      for (const q of pack.questions) {
        const src = q.image_url;
        q.image_src = src;
        if (!src || WEB) continue;
        const rel = `images/${q.id}.${extOf(src)}`;
        const prev = oldSrc.get(q.id);
        const have = prev?.image_src === src && (await FileSystem.getInfoAsync(`${ROOT}${rel}`)).exists;
        if (!have) {
          try { await FileSystem.downloadAsync(src, `${ROOT}${rel}`); }
          catch { q.image_url = null; continue; }   // shown without the image; tried again next update
        }
        q.image_url = rel;
      }
      // A subject whose images failed keeps an old hash so it retries next time.
      const missing = pack.questions.some(q => q.image_src && !q.image_url);
      await writeJson(`${SUBJECTS}${s.slug}.json`, pack);
      if (missing) s.hash = `${s.hash}-partial`;
    }
    const manifest: PackManifest = { ...remote, source: 'online' };
    await writeJson(`${ROOT}manifest.json`, manifest);
    await prune(manifest);
    return { status: 'updated', changed: changed.length, manifest };
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
        if (!q.image_url?.startsWith('images/')) continue;
        const to = `${ROOT}${q.image_url}`;
        try {
          await FileSystem.deleteAsync(to, { idempotent: true });
          await FileSystem.copyAsync({ from: `file://${dir}/${q.image_url}`, to });
        } catch { q.image_url = null; }
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
