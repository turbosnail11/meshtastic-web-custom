import { useAppStore } from "@core/stores";

export const useAdvancedInfo = (): boolean => useAppStore((s) => s.showAdvancedInfo);

export const useSetAdvancedInfo = (): ((value: boolean) => void) =>
  useAppStore((s) => s.setShowAdvancedInfo);
