import { useCallback, useRef } from "react";

export interface ReaderNavigationActions {
  next: () => void;
  previous: () => void;
}

export type ReaderNavigationRegistration = (
  actions: ReaderNavigationActions | null,
) => void;

export function useReaderNavigationController() {
  const actionsRef = useRef<ReaderNavigationActions | null>(null);
  const register = useCallback<ReaderNavigationRegistration>((actions) => {
    actionsRef.current = actions;
  }, []);
  const navigate = useCallback((direction: "next" | "previous") => {
    const actions = actionsRef.current;
    if (actions === null) return false;
    actions[direction]();
    return true;
  }, []);

  return { navigate, register } as const;
}
