// Voices for "Read to me". The phone's own text-to-speech voices are used
// (free, and most work offline). The best one is picked automatically,
// preferring West African English, then other African English, then
// British; natural ("enhanced") and offline voices first. The reader can
// choose another in the Voice list.
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StoryVoice { id: string; language: string; label: string; detail: string; offline: boolean; rank: number }

const COUNTRY: Record<string, [string, number]> = {
  GH: ['Ghanaian', 0], NG: ['Nigerian', 0], KE: ['Kenyan', 1], ZA: ['South African', 1], TZ: ['Tanzanian', 1], UG: ['Ugandan', 1],
  GB: ['British', 2], IE: ['Irish', 3], IN: ['Indian', 3], AU: ['Australian', 3], NZ: ['New Zealand', 3], CA: ['Canadian', 4], US: ['American', 4],
};
const K_VOICE = 'cas_storybooks_voice';
export const AUTO = 'auto';

let cache: StoryVoice[] | null = null;

/** The phone's English voices, best first. */
export async function englishVoices(): Promise<StoryVoice[]> {
  if (cache) return cache;
  let raw: Speech.Voice[] = [];
  try { raw = await Speech.getAvailableVoicesAsync(); } catch { raw = []; }
  const seen: Record<string, number> = {};
  const list = raw
    .filter(v => /^en([-_]|$)/i.test(v.language))
    .map(v => {
      const cc = (v.language.split(/[-_]/)[1] || '').toUpperCase();
      const [country, crank] = COUNTRY[cc] ?? ['English', 5];
      const net = /network/i.test(v.identifier) || /network/i.test(v.name);
      const enhanced = String(v.quality) === Speech.VoiceQuality.Enhanced;
      return { v, country, crank, offline: !net, enhanced };
    })
    // Country first, then natural voices, then ones that work without internet.
    .sort((a, b) => a.crank - b.crank || Number(b.enhanced) - Number(a.enhanced) || Number(b.offline) - Number(a.offline) || a.v.identifier.localeCompare(b.v.identifier))
    .map(({ v, country, crank, offline, enhanced }) => {
      const base = country === 'English' ? `English (${v.language})` : `${country} English`;
      seen[base] = (seen[base] ?? 0) + 1;
      return {
        id: v.identifier, language: v.language,
        label: seen[base] > 1 ? `${base}, voice ${seen[base]}` : base,
        detail: [enhanced ? 'Natural' : null, offline ? 'Works offline' : 'Needs internet'].filter(Boolean).join(', '),
        offline, rank: crank,
      };
    });
  cache = list;
  return list;
}

export async function chosenVoiceId(): Promise<string> {
  try { return (await AsyncStorage.getItem(K_VOICE)) || AUTO; } catch { return AUTO; }
}
export async function chooseVoice(id: string) {
  await AsyncStorage.setItem(K_VOICE, id).catch(() => {});
}

/** The voice to read with: the reader's choice if the phone still has it, else the best available. */
export async function voiceToUse(): Promise<StoryVoice | null> {
  const list = await englishVoices();
  const id = await chosenVoiceId();
  return (id !== AUTO && list.find(v => v.id === id)) || list.find(v => v.offline) || list[0] || null;
}

/** Speech options for a voice (or the phone's default English when none). */
export function speechOptions(v: StoryVoice | null): Speech.SpeechOptions {
  return v ? { voice: v.id, language: v.language, rate: 0.9, pitch: 1 } : { language: 'en', rate: 0.9, pitch: 1 };
}

export const SAMPLE = 'Akwaaba. Let us read a story together.';
