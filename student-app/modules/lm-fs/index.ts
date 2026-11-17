// Folder creation and moves inside the app's own external folder, where
// expo-file-system refuses to create things (see LmFsModule.kt). Missing on
// web and in older builds: the calls then return false.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

interface LmFsNative { mkdirs(path: string): boolean; move(from: string, to: string): boolean }
const native = Platform.OS === 'android' ? requireOptionalNativeModule<LmFsNative>('LmFs') : null;

export const hasLmFs = () => !!native;
export function mkdirs(path: string): boolean { try { return !!native?.mkdirs(path); } catch { return false; } }
export function moveFile(from: string, to: string): boolean { try { return !!native?.move(from, to); } catch { return false; } }
