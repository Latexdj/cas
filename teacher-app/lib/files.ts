// Pick a file and get it as a data URI, ready to send to the CAS API.
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

export interface PickedFile { name: string; mime: string; size: number; data: string; uri: string }

export async function pickFile(types: string[] = ['*/*'], maxMb = 10): Promise<PickedFile | { error: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.size && a.size > maxMb * 1024 * 1024) return { error: `That file is larger than ${maxMb} MB.` };
  const mime = a.mimeType || 'application/octet-stream';
  let base64: string;
  if (Platform.OS === 'web') {
    const blob = await (await fetch(a.uri)).blob();
    base64 = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = bad; r.readAsDataURL(blob); });
  } else {
    base64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
  }
  return { name: a.name, mime, size: a.size ?? 0, uri: a.uri, data: `data:${mime};base64,${base64}` };
}

export const isPickError = (x: unknown): x is { error: string } => !!x && typeof (x as { error?: unknown }).error === 'string';
