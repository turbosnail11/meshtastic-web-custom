import { Button } from "@components/UI/Button.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@components/UI/Dialog.tsx";
import type { SonarRun } from "@core/stores/sonarStore/index.ts";
import { Protobuf } from "@meshtastic/core";

interface SonarHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runs: SonarRun[];
  onOpenRun: (runId: string) => void;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString();
}

function fmtPreset(p: number): string {
  const name = Protobuf.Config.Config_LoRaConfig_ModemPreset[p];
  if (!name) return `#${p}`;
  return String(name)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const SonarHistoryModal = ({
  open,
  onOpenChange,
  runs,
  onOpenRun,
}: SonarHistoryModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sonar history</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
          {runs.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">No sonar runs yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-1 text-left">Date</th>
                  <th className="py-1 text-left">Modem</th>
                  <th className="py-1 text-right">Found</th>
                  <th className="py-1 text-right">New</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const newCount = run.respondents.filter((r) => r.wasNew).length;
                  return (
                    <tr key={run.id} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="py-2 pr-3">{fmtDate(run.startedAt)}</td>
                      <td className="py-2 pr-3">{fmtPreset(run.modemPreset)}</td>
                      <td className="py-2 pr-3 text-right">{run.respondents.length}</td>
                      <td className="py-2 pr-3 text-right">{newCount}</td>
                      <td className="py-2 text-right">
                        <Button variant="outline" size="sm" onClick={() => onOpenRun(run.id)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
