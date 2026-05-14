import { featureFlags } from "@core/services/featureFlags.ts";
import { createStorage } from "@core/stores/utils/indexDB.ts";
import { produce } from "immer";
import { create as createStore, type StateCreator } from "zustand";
import { type PersistOptions, persist, subscribeWithSelector } from "zustand/middleware";

const IDB_KEY_NAME = "meshtastic-sonar-store";
const CURRENT_STORE_VERSION = 1;
const MAX_RUNS_PER_DEVICE = 50;

export type EnrichmentStatus = "skipped" | "pending" | "complete" | "partial" | "failed";

export interface SonarRespondent {
  nodeNum: number;
  shortName?: string;
  longName?: string;
  snr: number;
  rssi: number;
  wasNew: boolean;
  firstSeenAt: number;
  enrichmentStatus: EnrichmentStatus;
  /** Map of portnum string → "complete" | "failed" for each enrichment query */
  enrichmentDetails?: Partial<Record<"nodeInfo" | "telemetry" | "position", "complete" | "failed">>;
}

export interface SonarRun {
  id: string;
  gatewayNodeNum: number;
  startedAt: number;
  finishedAt?: number;
  modemPreset: number;
  windowMs: number;
  respondents: SonarRespondent[];
}

type SonarData = {
  runsByDevice: Record<number, SonarRun[]>;
};

export interface SonarState extends SonarData {
  /** Begin a new run; returns the new run id. */
  startRun: (
    run: Omit<SonarRun, "respondents" | "finishedAt"> & { respondents?: SonarRespondent[] },
  ) => void;
  /** Add or update a respondent within the active run. */
  upsertRespondent: (gatewayNodeNum: number, runId: string, respondent: SonarRespondent) => void;
  /** Update a respondent's enrichment status. */
  updateRespondentEnrichment: (
    gatewayNodeNum: number,
    runId: string,
    nodeNum: number,
    status: EnrichmentStatus,
    details?: Partial<Record<"nodeInfo" | "telemetry" | "position", "complete" | "failed">>,
  ) => void;
  /** Mark a run as finished. */
  finishRun: (gatewayNodeNum: number, runId: string) => void;
  /** Fetch all runs for a device, newest first. */
  getRuns: (gatewayNodeNum: number) => SonarRun[];
  /** Fetch a specific run. */
  getRun: (gatewayNodeNum: number, runId: string) => SonarRun | undefined;
  /** Clear all runs for a device. */
  clearRuns: (gatewayNodeNum: number) => void;
}

export const sonarStoreInitializer: StateCreator<SonarState> = (set, get) => ({
  runsByDevice: {},

  startRun: (run) => {
    set(
      produce<SonarState>((draft) => {
        const list = draft.runsByDevice[run.gatewayNodeNum] ?? [];
        const newRun: SonarRun = {
          id: run.id,
          gatewayNodeNum: run.gatewayNodeNum,
          startedAt: run.startedAt,
          modemPreset: run.modemPreset,
          windowMs: run.windowMs,
          respondents: run.respondents ?? [],
        };
        list.unshift(newRun);
        // Cap history per device
        if (list.length > MAX_RUNS_PER_DEVICE) {
          list.length = MAX_RUNS_PER_DEVICE;
        }
        draft.runsByDevice[run.gatewayNodeNum] = list;
      }),
    );
  },

  upsertRespondent: (gatewayNodeNum, runId, respondent) => {
    set(
      produce<SonarState>((draft) => {
        const list = draft.runsByDevice[gatewayNodeNum];
        if (!list) return;
        const run = list.find((r) => r.id === runId);
        if (!run) return;
        const idx = run.respondents.findIndex((r) => r.nodeNum === respondent.nodeNum);
        if (idx === -1) {
          run.respondents.push(respondent);
        } else {
          // Preserve original wasNew/firstSeenAt; update signal data
          const existing = run.respondents[idx];
          if (!existing) return;
          run.respondents[idx] = {
            ...existing,
            ...respondent,
            wasNew: existing.wasNew,
            firstSeenAt: existing.firstSeenAt,
          };
        }
      }),
    );
  },

  updateRespondentEnrichment: (gatewayNodeNum, runId, nodeNum, status, details) => {
    set(
      produce<SonarState>((draft) => {
        const list = draft.runsByDevice[gatewayNodeNum];
        if (!list) return;
        const run = list.find((r) => r.id === runId);
        if (!run) return;
        const resp = run.respondents.find((r) => r.nodeNum === nodeNum);
        if (!resp) return;
        resp.enrichmentStatus = status;
        if (details) {
          resp.enrichmentDetails = { ...(resp.enrichmentDetails ?? {}), ...details };
        }
      }),
    );
  },

  finishRun: (gatewayNodeNum, runId) => {
    set(
      produce<SonarState>((draft) => {
        const list = draft.runsByDevice[gatewayNodeNum];
        if (!list) return;
        const run = list.find((r) => r.id === runId);
        if (run) run.finishedAt = Date.now();
      }),
    );
  },

  getRuns: (gatewayNodeNum) => get().runsByDevice[gatewayNodeNum] ?? [],
  getRun: (gatewayNodeNum, runId) =>
    (get().runsByDevice[gatewayNodeNum] ?? []).find((r) => r.id === runId),
  clearRuns: (gatewayNodeNum) => {
    set(
      produce<SonarState>((draft) => {
        delete draft.runsByDevice[gatewayNodeNum];
      }),
    );
  },
});

const persistOptions: PersistOptions<SonarState, SonarData> = {
  name: IDB_KEY_NAME,
  storage: createStorage<SonarData>(),
  version: CURRENT_STORE_VERSION,
  partialize: (s): SonarData => ({
    runsByDevice: s.runsByDevice,
  }),
  onRehydrateStorage: () => (state) => {
    if (!state) return;
    console.debug("SonarStore: Rehydrating state", state);
  },
};

const persistEnabled = featureFlags.get("persistApp");
console.debug(`SonarStore: Persisting is ${persistEnabled ? "enabled" : "disabled"}`);

export const useSonarStore = persistEnabled
  ? createStore(subscribeWithSelector(persist(sonarStoreInitializer, persistOptions)))
  : createStore(subscribeWithSelector(sonarStoreInitializer));
