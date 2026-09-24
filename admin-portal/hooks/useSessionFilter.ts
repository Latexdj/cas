import { useState } from 'react';

// Persists a piece of filter state (academic year, semester, class, tab,
// etc.) in sessionStorage so an accidental page refresh restores exactly
// what the user had selected, instead of resetting to a hardcoded default
// (e.g. "current academic year") and forcing them to re-filter back to
// wherever they were. Scoped to sessionStorage rather than localStorage —
// it survives a refresh within the same tab but doesn't stick around
// forever across logins/devices, and unlike URL query params it doesn't
// require every page's routing to change.
//
// `key` must be unique per page + field (e.g. 'teacher-results:yearId') to
// avoid collisions between unrelated filters that happen to share a name.
export function useSessionFilter<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const raw = sessionStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  function setAndPersist(next: T | ((prev: T) => T)) {
    setValue(prev => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      try { sessionStorage.setItem(key, JSON.stringify(resolved)); } catch {}
      return resolved;
    });
  }

  return [value, setAndPersist] as const;
}
