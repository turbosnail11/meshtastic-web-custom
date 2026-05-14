import { useAppStore } from "@core/stores";

/**
 * Returns the current simpleMode preference.
 * When true (the default), advanced UI is hidden across the app.
 */
export const useSimpleMode = (): boolean => useAppStore((s) => s.simpleMode);

/**
 * Returns a setter for the simpleMode preference. Stable reference across renders.
 */
export const useSetSimpleMode = (): ((value: boolean) => void) =>
  useAppStore((s) => s.setSimpleMode);
