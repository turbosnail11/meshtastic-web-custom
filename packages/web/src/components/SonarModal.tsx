import { Avatar } from "@components/UI/Avatar.tsx";
import { Button } from "@components/UI/Button.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/UI/Dialog.tsx";
import { RadarIcon } from "@components/UI/RadarIcon.tsx";
import type { SonarRespondent, SonarRun } from "@core/stores/sonarStore/index.ts";
import { cn } from "@core/utils/cn.ts";
import { useEffect, useMemo, useState } from "react";

interface SonarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The live (or historical) run being displayed. */
  run: SonarRun | undefined;
  /** Phase indicator from useSonar; "idle" means historical view. */
  phase: "idle" | "probing" | "ready" | "enriching" | "cooldown";
  /** When the current phase ends (ms epoch); null if not active. */
  endsAt: number | null;
  /** Click handler for the "Probe Nodes" button (Phase 2 trigger). */
  onProbe?: () => void;
}

function fmtRespName(r: SonarRespondent): string {
  return r.longName ?? r.shortName ?? `!${r.nodeNum.toString(16).padStart(8, "0")}`;
}

export const SonarModal = ({
  open,
  onOpenChange,
  run,
  phase,
  endsAt,
  onProbe,
}: SonarModalProps) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase === "idle") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  const remainingMs = useMemo(() => {
    if (!endsAt || phase === "idle") return 0;
    return Math.max(0, endsAt - now);
  }, [endsAt, phase, now]);
  const remainingSec = Math.ceil(remainingMs / 1000);

  const respondents = run?.respondents ?? [];
  const newCount = respondents.filter((r) => r.wasNew).length;

  const phaseLabel =
    phase === "probing"
      ? `Listening for responses… ${remainingSec}s remaining`
      : phase === "ready"
        ? respondents.length > 0
          ? `Ready — click Probe Nodes for more info`
          : `No respondents`
        : phase === "enriching"
          ? `Probing nodes… ${remainingSec}s remaining`
          : phase === "cooldown"
            ? `Cooldown`
            : run?.finishedAt
              ? "Completed"
              : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RadarIcon active={phase === "probing" || phase === "enriching"} size={24} />
            Sonar
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {phaseLabel && (
            <div className="text-sm text-slate-600 dark:text-slate-400">{phaseLabel}</div>
          )}
          <div className="text-sm font-medium">
            Found {respondents.length} node{respondents.length === 1 ? "" : "s"}
            {newCount > 0 && (
              <span className="text-green-600 dark:text-green-400"> ({newCount} new)</span>
            )}
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto -mx-6 px-6">
          {respondents.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No respondents yet</div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {respondents.map((r) => (
                <li key={r.nodeNum} className="py-2 flex items-center gap-3">
                  <Avatar nodeNum={r.nodeNum} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{fmtRespName(r)}</span>
                      {r.wasNew && (
                        <span
                          className={cn(
                            "text-[10px] uppercase font-semibold rounded px-1.5 py-0.5",
                            "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
                          )}
                        >
                          New
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      SNR {r.snr}dB · RSSI {r.rssi}dBm
                    </div>
                  </div>
                  <div className="text-xs">
                    {r.enrichmentStatus === "pending" && (
                      <span className="text-slate-500">Pending</span>
                    )}
                    {r.enrichmentStatus === "complete" && (
                      <span className="text-green-600 dark:text-green-400">✓ Enriched</span>
                    )}
                    {r.enrichmentStatus === "partial" && (
                      <span className="text-amber-600 dark:text-amber-400">⚠ Partial</span>
                    )}
                    {r.enrichmentStatus === "failed" && (
                      <span className="text-red-600 dark:text-red-400">✗ Failed</span>
                    )}
                    {r.enrichmentStatus === "skipped" && <span className="text-slate-400">—</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          {phase === "ready" && onProbe && respondents.length > 0 && (
            <Button onClick={onProbe} data-testid="sonar-probe-button">
              Probe Nodes
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
