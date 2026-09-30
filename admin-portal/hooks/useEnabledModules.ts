'use client';

import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';

// One shared source of truth for "which licensable modules can this viewer
// use", used by all three portal shells (admin Sidebar, Principal, Teacher)
// so a super-admin toggle in Phase 2 is reflected in every nav, not just the
// admin one. Cached in memory (survives client-side navigation within the
// SPA) and in sessionStorage (survives a hard refresh within the same tab),
// keyed by schoolId AND userId — two admins in the same school can now see
// different lists (per-admin module-access scoping), so the cache can no
// longer be shared across accounts the way it could when this was purely a
// school-wide list. TTL matches the backend's own checkModuleAccess /
// clearModuleCache cache window (5 minutes), so a toggle is visible on both
// sides within the same window without needing a hard refresh.
const CACHE_KEY = 'cas_enabled_modules_cache';
const TTL_MS = 5 * 60 * 1000;

interface CacheEntry { schoolId: string; userId: string; keys: string[]; cachedAt: number; }

let memoryCache: CacheEntry | null = null;

function readCache(schoolId: string, userId: string): string[] | null {
  const candidates = [memoryCache, readSessionCache()].filter(Boolean) as CacheEntry[];
  for (const entry of candidates) {
    if (entry.schoolId === schoolId && entry.userId === userId && Date.now() - entry.cachedAt < TTL_MS) return entry.keys;
  }
  return null;
}

function readSessionCache(): CacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.schoolId !== 'string' || typeof parsed.userId !== 'string' || !Array.isArray(parsed.keys) || typeof parsed.cachedAt !== 'number') return null;
    return parsed;
  } catch { return null; }
}

function writeCache(entry: CacheEntry) {
  memoryCache = entry;
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry)); } catch {}
}

// Returns null while loading or on fetch error — every caller must treat
// null as "show everything" (fail open), matching the pre-existing
// Sidebar.tsx behavior: a transient API failure should never hide nav a
// school has already licensed.
export function useEnabledModules(apiClient: AxiosInstance, schoolId: string | null | undefined, userId: string | null | undefined): string[] | null {
  const [modules, setModules] = useState<string[] | null>(() => (schoolId && userId ? readCache(schoolId, userId) : null));

  useEffect(() => {
    if (!schoolId || !userId) { setModules(null); return; }

    const cached = readCache(schoolId, userId);
    if (cached) { setModules(cached); return; }

    let cancelled = false;
    apiClient.get<string[]>('/api/school-modules/enabled')
      .then(r => {
        if (cancelled) return;
        writeCache({ schoolId, userId, keys: r.data, cachedAt: Date.now() });
        setModules(r.data);
      })
      .catch(() => {
        if (!cancelled) setModules(null); // fail open, don't cache the failure
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, userId]);

  return modules;
}
