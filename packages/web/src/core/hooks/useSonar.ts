import { create, toBinary } from "@bufbuild/protobuf";
import { useToast } from "@core/hooks/useToast.ts";
import { useDevice, useNodeDB } from "@core/stores";
import { useSonarStore } from "@core/stores/sonarStore/index.ts";
import { SONAR_COOLDOWN_BUFFER_MS, sonarWindowMs } from "@core/utils/sonarTimings.ts";
import { Protobuf } from "@meshtastic/core";
import { useCallback, useEffect, useRef, useState } from "react";

const SONAR_CHANNEL = 0;

// Generates a 32-bit unsigned integer suitable for a MeshPacket.id. We can't
// reach the SDK's private generateRandId, but a uniform 32-bit random works.
function makePacketId(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0 || 1;
}

export interface SonarStatus {
  phase: "idle" | "probing" | "ready" | "enriching" | "cooldown";
  runId: string | null;
  startedAt: number | null;
  endsAt: number | null;
  windowMs: number;
}

const IDLE: SonarStatus = {
  phase: "idle",
  runId: null,
  startedAt: null,
  endsAt: null,
  windowMs: 0,
};

function makeRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sonar-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * useSonar — orchestrates the Sonar broadcast probe and follow-up enrichment.
 *
 * Phase 1 (probe): broadcasts a TraceRoute request with hop_limit=0 on the
 * primary channel and listens for responses. The request's id is the run's
 * probeId; responses are correlated via `decoded.requestId`.
 *
 * Phase 2 (enrich): for each respondent, sends unicast NodeInfo, Position, and
 * Telemetry requests to gather more info. Results are written into the
 * sonarStore as they come back.
 */
export function useSonar() {
  const { connection } = useDevice();
  const { getNode } = useNodeDB();
  const sonarStore = useSonarStore();
  const { toast } = useToast();

  const [status, setStatus] = useState<SonarStatus>(IDLE);
  const activeProbeIdRef = useRef<number | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const ownerNumRef = useRef<number>(0);
  // Metadata of the currently-active run, captured so the imperative `probe()`
  // callback can fire Phase 2 against the right run/window/owner without
  // depending on stale closure state.
  const runMetaRef = useRef<{ runId: string; ownerNum: number; windowMs: number } | null>(null);
  // Response-packet IDs we've identified as sonar replies, so other parts of
  // the app (e.g. the traceroute response dialog) can suppress them.
  const sonarResponseIdsRef = useRef<Set<number>>(new Set());
  // Outgoing probe IDs (Phase 1 broadcast + Phase 2 per-respondent unicasts).
  // We compare incoming packets' decoded.requestId against this set to detect
  // all sonar responses, not just the Phase 1 broadcast replies.
  const sonarProbeIdsRef = useRef<Set<number>>(new Set());
  // Map of Phase 2 probe id → which (run, node, request-type) it belongs to,
  // so we can resolve enrichment status by observing actual response arrivals
  // rather than relying on queue ACK behavior.
  type EnrichmentKind = "nodeInfo" | "position" | "telemetry";
  const enrichmentProbesRef = useRef<
    Map<number, { runId: string; ownerNum: number; nodeNum: number; kind: EnrichmentKind }>
  >(new Map());
  const phase1TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase2TimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (phase1TimerRef.current) clearTimeout(phase1TimerRef.current);
      if (phase2TimerRef.current) clearTimeout(phase2TimerRef.current);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  // Subscribe to incoming packets and capture responses matching the active probe.
  useEffect(() => {
    if (!connection) return;
    const handler = (pkt: Protobuf.Mesh.MeshPacket) => {
      const ownerNum = ownerNumRef.current;
      const requestId =
        pkt.payloadVariant.case === "decoded" ? pkt.payloadVariant.value.requestId : 0;

      // If this packet's requestId matches any of our outgoing sonar probes
      // (broadcast Phase 1 or unicast Phase 2), tag it as sonar-internal so
      // unrelated UI (traceroute / location dialogs) suppresses it.
      if (requestId && sonarProbeIdsRef.current.has(requestId)) {
        sonarResponseIdsRef.current.add(pkt.id);
      }

      // Phase 2: if this requestId corresponds to a known enrichment probe,
      // mark that enrichment kind as complete for that respondent.
      const enrichmentProbe = requestId ? enrichmentProbesRef.current.get(requestId) : undefined;
      if (enrichmentProbe) {
        const run = sonarStore.getRun(enrichmentProbe.ownerNum, enrichmentProbe.runId);
        const resp = run?.respondents.find((r) => r.nodeNum === enrichmentProbe.nodeNum);
        const prevDetails = resp?.enrichmentDetails ?? {};
        const merged = {
          ...prevDetails,
          [enrichmentProbe.kind]: "complete" as const,
        };
        const completedCount =
          (merged.nodeInfo === "complete" ? 1 : 0) +
          (merged.position === "complete" ? 1 : 0) +
          (merged.telemetry === "complete" ? 1 : 0);
        const overall =
          completedCount === 3 ? "complete" : completedCount > 0 ? "partial" : "pending";
        sonarStore.updateRespondentEnrichment(
          enrichmentProbe.ownerNum,
          enrichmentProbe.runId,
          enrichmentProbe.nodeNum,
          overall,
          merged,
        );
      }

      // Phase 1 capture: only the broadcast probe's responses become new
      // respondents. Phase 2 unicast responses don't add new rows.
      const probeId = activeProbeIdRef.current;
      const runId = activeRunIdRef.current;
      if (probeId === null || runId === null) return;
      if (requestId !== probeId) return;
      const nodeNum = pkt.from;
      if (!nodeNum || nodeNum === 0xffffffff || nodeNum === ownerNum) return;

      const existing = getNode(nodeNum);
      sonarStore.upsertRespondent(ownerNum, runId, {
        nodeNum,
        shortName: existing?.user?.shortName,
        longName: existing?.user?.longName,
        snr: pkt.rxSnr,
        rssi: pkt.rxRssi,
        wasNew: !existing,
        firstSeenAt: Date.now(),
        enrichmentStatus: "pending",
      });
    };
    connection.events.onMeshPacket.subscribe(handler);
    return () => {
      connection.events.onMeshPacket.unsubscribe(handler);
    };
  }, [connection, getNode, sonarStore]);

  const start = useCallback(
    async (modemPreset: number, ownerNum: number) => {
      if (!connection) {
        toast({ title: "Sonar", description: "Not connected to a device" });
        return;
      }
      if (status.phase !== "idle") return;

      const windowMs = sonarWindowMs(modemPreset as Protobuf.Config.Config_LoRaConfig_ModemPreset);
      const runId = makeRunId();
      activeRunIdRef.current = runId;
      ownerNumRef.current = ownerNum;

      const routeDiscovery = toBinary(
        Protobuf.Mesh.RouteDiscoverySchema,
        create(Protobuf.Mesh.RouteDiscoverySchema, { route: [] }),
      );

      sonarStore.startRun({
        id: runId,
        gatewayNodeNum: ownerNum,
        startedAt: Date.now(),
        modemPreset,
        windowMs,
      });

      setStatus({
        phase: "probing",
        runId,
        startedAt: Date.now(),
        endsAt: Date.now() + windowMs,
        windowMs,
      });

      // Construct the broadcast probe ourselves so we know its id up front.
      // sendPacket() awaits an ACK that never arrives (wantAck=false → queue
      // times out with NO_RESPONSE), which would otherwise hide the id from
      // us until after the timeout. We fire sendRaw and swallow the eventual
      // rejection — the packet is sent regardless of the wait outcome.
      const probeId = makePacketId();
      activeProbeIdRef.current = probeId;
      sonarProbeIdsRef.current.add(probeId);

      const meshPacket = create(Protobuf.Mesh.MeshPacketSchema, {
        payloadVariant: {
          case: "decoded",
          value: {
            payload: routeDiscovery,
            portnum: Protobuf.Portnums.PortNum.TRACEROUTE_APP,
            wantResponse: true,
          },
        },
        from: ownerNum,
        to: 0xffffffff,
        id: probeId,
        wantAck: false,
        channel: SONAR_CHANNEL,
        hopLimit: 0,
      });
      const toRadio = create(Protobuf.Mesh.ToRadioSchema, {
        payloadVariant: { case: "packet", value: meshPacket },
      });

      try {
        // Don't await — fire and forget, swallow NO_RESPONSE rejection.
        connection.sendRaw(toBinary(Protobuf.Mesh.ToRadioSchema, toRadio), probeId).catch(() => {
          // Expected: with wantAck=false on a broadcast, the queue eventually
          // rejects with NO_RESPONSE. The packet was transmitted regardless.
        });
      } catch (err) {
        const description =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Send failed";
        toast({ title: "Sonar failed", description });
        activeProbeIdRef.current = null;
        activeRunIdRef.current = null;
        setStatus(IDLE);
        return;
      }

      // Record run metadata so probe() can be invoked imperatively later.
      runMetaRef.current = { runId, ownerNum, windowMs };

      // End of Phase 1 → "ready" (await user decision). Phase 2 does NOT
      // auto-start; the user explicitly clicks "Probe Nodes" in the modal.
      phase1TimerRef.current = setTimeout(() => {
        activeProbeIdRef.current = null;
        setStatus({
          phase: "ready",
          runId,
          startedAt: Date.now(),
          endsAt: null,
          windowMs: 0,
        });
      }, windowMs);
    },
    [connection, status.phase, sonarStore, toast],
  );

  /**
   * Imperatively transitions a run from "cooldown" back to idle.
   * Used internally by probe() and endRun().
   */
  const startCooldown = useCallback(
    (runId: string, ownerNum: number) => {
      sonarStore.finishRun(ownerNum, runId);
      setStatus({
        phase: "cooldown",
        runId,
        startedAt: Date.now(),
        endsAt: Date.now() + SONAR_COOLDOWN_BUFFER_MS,
        windowMs: 0,
      });
      cooldownTimerRef.current = setTimeout(() => {
        activeRunIdRef.current = null;
        runMetaRef.current = null;
        setStatus(IDLE);
      }, SONAR_COOLDOWN_BUFFER_MS);
    },
    [sonarStore],
  );

  /**
   * Phase 2: probe each respondent for additional info (NodeInfo, Position,
   * Telemetry). Only callable when status === "ready". Transitions to
   * "enriching" → "cooldown" → "idle".
   */
  const probe = useCallback(() => {
    if (!connection) return;
    if (status.phase !== "ready") return;
    const meta = runMetaRef.current;
    if (!meta) return;
    const { runId, ownerNum, windowMs } = meta;

    const run = sonarStore.getRun(ownerNum, runId);
    const respondents = run?.respondents ?? [];
    if (respondents.length === 0) {
      startCooldown(runId, ownerNum);
      return;
    }

    setStatus({
      phase: "enriching",
      runId,
      startedAt: Date.now(),
      endsAt: Date.now() + windowMs,
      windowMs,
    });

    // Pre-generate probe ids and construct each enrichment packet manually
    // so the id is registered in sonarProbeIdsRef *before* the response can
    // possibly arrive.
    const sendEnrichment = (nodeNum: number, portnum: number, kind: EnrichmentKind) => {
      const id = makePacketId();
      sonarProbeIdsRef.current.add(id);
      enrichmentProbesRef.current.set(id, { runId, ownerNum, nodeNum, kind });

      const meshPkt = create(Protobuf.Mesh.MeshPacketSchema, {
        payloadVariant: {
          case: "decoded",
          value: {
            payload: new Uint8Array(),
            portnum,
            wantResponse: true,
          },
        },
        from: ownerNum,
        to: nodeNum,
        id,
        wantAck: false,
        channel: SONAR_CHANNEL,
      });
      const toRadio2 = create(Protobuf.Mesh.ToRadioSchema, {
        payloadVariant: { case: "packet", value: meshPkt },
      });
      connection.sendRaw(toBinary(Protobuf.Mesh.ToRadioSchema, toRadio2), id).catch(() => {});
    };

    for (const r of respondents) {
      sendEnrichment(r.nodeNum, Protobuf.Portnums.PortNum.NODEINFO_APP, "nodeInfo");
      sendEnrichment(r.nodeNum, Protobuf.Portnums.PortNum.POSITION_APP, "position");
      sendEnrichment(r.nodeNum, Protobuf.Portnums.PortNum.TELEMETRY_APP, "telemetry");
    }

    phase2TimerRef.current = setTimeout(() => {
      // Any respondent still "pending" never received an enrichment response.
      const finalRun = sonarStore.getRun(ownerNum, runId);
      if (finalRun) {
        for (const r of finalRun.respondents) {
          if (r.enrichmentStatus === "pending") {
            sonarStore.updateRespondentEnrichment(ownerNum, runId, r.nodeNum, "failed");
          }
        }
      }
      startCooldown(runId, ownerNum);
    }, windowMs);
  }, [connection, status.phase, sonarStore, startCooldown]);

  /**
   * Imperatively end a run that's in "ready" state without probing.
   * Used when the user closes the modal without clicking "Probe Nodes".
   */
  const endRun = useCallback(() => {
    if (status.phase !== "ready") return;
    const meta = runMetaRef.current;
    if (!meta) return;
    startCooldown(meta.runId, meta.ownerNum);
  }, [status.phase, startCooldown]);

  // Stable predicate the rest of the app can use to skip sonar responses.
  // We don't garbage-collect this set per run — sonar packet ids are 32-bit
  // randoms and the cap of ~50 runs × ~20 respondents puts an upper bound
  // around 1000 entries, which is fine.
  const isSonarResponsePacket = useCallback(
    (packetId: number) => sonarResponseIdsRef.current.has(packetId),
    [],
  );

  return {
    status,
    start,
    probe,
    endRun,
    locked: status.phase !== "idle",
    isSonarResponsePacket,
  };
}
