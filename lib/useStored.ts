"use client";

import { useCallback, useSyncExternalStore } from "react";

// A localStorage-backed string value that is safe during server rendering and
// keeps working (in memory) when the browser blocks storage.

const listeners = new Set<() => void>();
const fallback = new Map<string, string>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): string | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    // storage blocked: fall through to memory
  }
  return fallback.get(key) ?? null;
}

function write(key: string, value: string | null): void {
  if (value === null) fallback.delete(key);
  else fallback.set(key, value);
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage blocked or full: the in-memory copy still serves this session
  }
  listeners.forEach((notify) => notify());
}

export function useStored(
  key: string
): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null
  );
  const set = useCallback(
    (next: string | null) => write(key, next),
    [key]
  );
  return [value, set];
}
