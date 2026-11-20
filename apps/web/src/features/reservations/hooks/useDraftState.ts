import { useCallback, useState } from "react";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * State mirrored into sessionStorage, so a visitor who leaves to sign in mid-booking
 * returns to exactly where they were. Storage failures (private mode) are ignored.
 */
export function useDraftState<T extends object>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => read(key, initial));

  const update = useCallback(
    (patch: Partial<T> | ((current: T) => Partial<T>)) => {
      setState((current) => {
        const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
        return next;
      });
    },
    [key],
  );

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
    setState(initial);
    // `initial` is a per-mount literal; only the key identifies the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [state, update, reset] as const;
}
