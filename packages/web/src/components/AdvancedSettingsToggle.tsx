import { Switch } from "@components/UI/Switch.tsx";
import { useSetSimpleMode, useSimpleMode } from "@core/hooks/useSimpleMode.ts";
import { cn } from "@core/utils/cn.ts";

interface AdvancedSettingsToggleProps {
  className?: string;
}

/**
 * Renders the global "Show advanced settings" toggle.
 * Reads and writes the simpleMode preference on the app store.
 * When advanced is on (simpleMode === false), the rest of the app reveals
 * advanced fields, sections, and tabs.
 */
export const AdvancedSettingsToggle = ({ className }: AdvancedSettingsToggleProps) => {
  const simpleMode = useSimpleMode();
  const setSimpleMode = useSetSimpleMode();
  const advanced = !simpleMode;

  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 px-3 py-2",
        "border-b border-slate-200 dark:border-slate-700",
        "bg-slate-50 dark:bg-slate-800/40",
        className,
      )}
      data-testid="advanced-settings-toggle"
    >
      <span className="text-xs text-slate-600 dark:text-slate-400">Show advanced settings</span>
      <Switch
        checked={advanced}
        onCheckedChange={(checked) => setSimpleMode(!checked)}
        aria-label="Toggle advanced settings"
        data-testid="advanced-settings-toggle-switch"
      />
    </div>
  );
};
