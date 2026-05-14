import { LocationResponseDialog } from "@app/components/Dialog/LocationResponseDialog.tsx";
import { TracerouteResponseDialog } from "@app/components/Dialog/TracerouteResponseDialog.tsx";
import { FilterControl } from "@components/generic/Filter/FilterControl.tsx";
import { type FilterState, useFilterNode } from "@components/generic/Filter/useFilterNode.ts";
import { Mono } from "@components/generic/Mono.tsx";
import { type DataRow, type Heading, Table } from "@components/generic/Table/index.tsx";
import { TimeAgo } from "@components/generic/TimeAgo.tsx";
import { NodeContextMenu } from "@components/NodeContextMenu.tsx";
import { PageLayout } from "@components/PageLayout.tsx";
import { Sidebar } from "@components/Sidebar.tsx";
import { SonarHistoryModal } from "@components/SonarHistoryModal.tsx";
import { SonarModal } from "@components/SonarModal.tsx";
import { Avatar } from "@components/UI/Avatar.tsx";
import { Input } from "@components/UI/Input.tsx";
import { RadarIcon } from "@components/UI/RadarIcon.tsx";
import useLang from "@core/hooks/useLang.ts";
import { useSonar } from "@core/hooks/useSonar.ts";
import { useAppStore, useDevice, useNodeDB } from "@core/stores";
import { type SonarRun, useSonarStore } from "@core/stores/sonarStore/index.ts";
import { Protobuf, type Types } from "@meshtastic/core";
import { numberToHexUnpadded } from "@noble/curves/abstract/utils";
import { ClockIcon, LockIcon, LockOpenIcon } from "lucide-react";
import { type JSX, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { base16 } from "rfc4648";

const NODEDB_DEBOUNCE_MS = 250;
// Stable reference so the sonar runs selector doesn't churn on every render.
const EMPTY_RUNS: SonarRun[] = [];

export interface DeleteNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NodesPage = (): JSX.Element => {
  const { t } = useTranslation("nodes");
  const { current } = useLang();
  const { hardware, connection, config, setDialogOpen } = useDevice();

  const { setNodeNumDetails } = useAppStore();
  const { nodeFilter, defaultFilterValues, isFilterDirty } = useFilterNode();

  // Sonar
  const sonar = useSonar();
  // Subscribe to the raw runs map slice; nullable. Using `?? []` inline would
  // create a new array on every render and cause an infinite Zustand re-render
  // loop, so the fallback is computed once outside the selector.
  const sonarRunsRaw = useSonarStore((s) => s.runsByDevice[hardware.myNodeNum]);
  const sonarRuns = sonarRunsRaw ?? EMPTY_RUNS;
  const getRun = useSonarStore((s) => s.getRun);
  const [sonarOpen, setSonarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewedRunId, setViewedRunId] = useState<string | null>(null);

  // The live run shown in the modal:
  //  1. The active sonar's current run (if a run is in progress)
  //  2. A historical run the user opened from the history table
  //  3. Otherwise the most recent run for this device (so a freshly-finished
  //     run stays visible after cooldown until the user closes the modal)
  const currentRun = useMemo(() => {
    const activeId = sonar.status.runId ?? viewedRunId;
    if (activeId) return getRun(hardware.myNodeNum, activeId);
    return sonarRunsRaw?.[0];
    // sonarRunsRaw drives memo refresh as the run updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sonar.status.runId, viewedRunId, getRun, hardware.myNodeNum, sonarRunsRaw]);

  const handleSonarClick = useCallback(() => {
    setViewedRunId(null);
    setSonarOpen(true);
    sonar.start(config.lora?.modemPreset ?? 0, hardware.myNodeNum);
  }, [sonar, config.lora?.modemPreset, hardware.myNodeNum]);

  const handleOpenHistoricalRun = useCallback((runId: string) => {
    setHistoryOpen(false);
    setViewedRunId(runId);
    setSonarOpen(true);
  }, []);

  // Sonar button label based on phase
  const sonarButtonLabel = useMemo(() => {
    const { phase, endsAt } = sonar.status;
    if (phase === "idle") return "Sonar";
    if (phase === "ready") return "Ready to probe";
    if (!endsAt) return phase;
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    if (phase === "probing") return `Listening (${remaining}s)`;
    if (phase === "enriching") return `Probing (${remaining}s)`;
    return `Cooldown (${remaining}s)`;
  }, [sonar.status]);
  // Force a re-render every 250ms while sonar is active so the label countdown updates
  const [, setTick] = useState(0);
  useEffect(() => {
    if (sonar.status.phase === "idle") return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [sonar.status.phase]);

  const [selectedTraceroute, setSelectedTraceroute] = useState<
    Types.PacketMetadata<Protobuf.Mesh.RouteDiscovery> | undefined
  >();
  const [selectedLocation, setSelectedLocation] = useState<
    Types.PacketMetadata<Protobuf.Mesh.Position> | undefined
  >();

  const [filterState, setFilterState] = useState<FilterState>(() => defaultFilterValues);
  const deferredFilterState = useDeferredValue(filterState);

  // stable predicate so the selector identity doesn’t thrash
  const predicate = useCallback(
    (node: Protobuf.Mesh.NodeInfo) => nodeFilter(node, deferredFilterState),
    [nodeFilter, deferredFilterState],
  );

  // subscribe to actual data (nodes array) and to nodeErrors ref for badge updates
  const { nodes: filteredNodes, hasNodeError } = useNodeDB(
    (db) => ({
      nodes: db.getNodes(predicate, true),
      hasNodeError: db.hasNodeError,
      _errorsRef: db.nodeErrors, // include the Map ref so UI also re-renders on error changes
    }),
    { debounce: NODEDB_DEBOUNCE_MS },
  );
  const handleTraceroute = useCallback(
    (traceroute: Types.PacketMetadata<Protobuf.Mesh.RouteDiscovery>) => {
      // Suppress the dialog for traceroute responses that are sonar replies.
      if (sonar.isSonarResponsePacket(traceroute.id)) return;
      setSelectedTraceroute(traceroute);
    },
    [sonar.isSonarResponsePacket],
  );

  const handleLocation = useCallback(
    (location: Types.PacketMetadata<Protobuf.Mesh.Position>) => {
      if (
        location.to.valueOf() !== hardware.myNodeNum ||
        location.from.valueOf() === hardware.myNodeNum
      ) {
        return;
      }
      // Sonar's Phase 2 sends unicast position requests; suppress that dialog too.
      if (sonar.isSonarResponsePacket(location.id)) return;
      setSelectedLocation(location);
    },
    [hardware.myNodeNum, sonar.isSonarResponsePacket],
  );

  function handleNodeInfoDialog(nodeNum: number): void {
    setNodeNumDetails(nodeNum);
    setDialogOpen("nodeDetails", true);
  }

  useEffect(() => {
    if (!connection) {
      return;
    }
    connection.events.onTraceRoutePacket.subscribe(handleTraceroute);
    return () => {
      connection.events.onTraceRoutePacket.unsubscribe(handleTraceroute);
    };
  }, [connection, handleTraceroute]);

  useEffect(() => {
    if (!connection) {
      return;
    }
    connection.events.onPositionPacket.subscribe(handleLocation);
    return () => {
      connection.events.onPositionPacket.unsubscribe(handleLocation);
    };
  }, [connection, handleLocation]);

  const tableHeadings: Heading[] = [
    { title: "", sortable: false },
    { title: t("nodesTable.headings.longName"), sortable: true },
    { title: t("nodesTable.headings.connection"), sortable: true },
    { title: t("nodesTable.headings.lastHeard"), sortable: true },
    { title: t("nodesTable.headings.encryption"), sortable: false },
    { title: t("unit.snr"), sortable: true },
    { title: t("nodesTable.headings.model"), sortable: true },
    { title: t("nodesTable.headings.macAddress"), sortable: true },
  ];

  const tableRows: DataRow[] = filteredNodes.map((node) => {
    const macAddress =
      base16
        .stringify(node.user?.macaddr ?? [])
        .match(/.{1,2}/g)
        ?.join(":") ?? t("unknown.shortName");

    const shortName = node.user?.shortName ?? numberToHexUnpadded(node.num).slice(-4).toUpperCase();
    const longName =
      node.user?.longName ??
      t("fallbackName", {
        last4: shortName,
      });

    return {
      id: node.num,
      isFavorite: node.isFavorite,
      rowWrapper: (tr) => (
        <NodeContextMenu node={node} isSelf={node.num === hardware.myNodeNum}>
          {tr}
        </NodeContextMenu>
      ),
      cells: [
        {
          content: (
            <Avatar
              nodeNum={node.num}
              showFavorite={node.isFavorite}
              showError={hasNodeError(node.num)}
            />
          ),
          sortValue: shortName, // Non-sortable column
        },
        {
          content: (
            <button
              type="button"
              onClick={() => handleNodeInfoDialog(node.num)}
              className="cursor-pointer underline ml-2 whitespace-break-spaces bg-transparent border-0 p-0 text-left"
            >
              {longName}
            </button>
          ),
          sortValue: longName,
        },
        {
          content: (
            <Mono className="w-16">
              {node.hopsAway !== undefined
                ? node?.viaMqtt === false && node.hopsAway === 0
                  ? t("nodesTable.connectionStatus.direct")
                  : `${node.hopsAway?.toString()} ${
                      (node.hopsAway ?? 0 > 1) ? t("unit.hop.plural") : t("unit.hops_one")
                    } ${t("nodesTable.connectionStatus.away")}`
                : t("unknown.longName")}
              {node?.viaMqtt === true ? t("nodesTable.connectionStatus.viaMqtt") : ""}
            </Mono>
          ),
          sortValue: node.hopsAway ?? Number.MAX_SAFE_INTEGER,
        },
        {
          content: (
            <Mono>
              {node.lastHeard === 0 ? (
                t("unknown.longName")
              ) : (
                <TimeAgo timestamp={node.lastHeard * 1000} locale={current?.code} />
              )}
            </Mono>
          ),
          sortValue: node.lastHeard,
        },
        {
          content: (
            <Mono>
              {node.user?.publicKey && node.user?.publicKey.length > 0 ? (
                <LockIcon className="text-green-600 mx-auto" />
              ) : (
                <LockOpenIcon className="text-yellow-300 mx-auto" />
              )}
            </Mono>
          ),
          sortValue: "", // Non-sortable column
        },
        {
          content: (
            <Mono>
              {node.snr}
              {t("unit.dbm")}/{Math.min(Math.max((node.snr + 10) * 5, 0), 100)}
              %/{/* Percentage */}
              {(node.snr + 10) * 5}
              {t("unit.raw")}
            </Mono>
          ),
          sortValue: node.snr,
        },
        {
          content: <Mono>{Protobuf.Mesh.HardwareModel[node.user?.hwModel ?? 0]}</Mono>,
          sortValue: Protobuf.Mesh.HardwareModel[node.user?.hwModel ?? 0] ?? "UNSET",
        },
        {
          content: <Mono>{macAddress}</Mono>,
          sortValue: macAddress,
        },
      ],
    };
  });

  // Build a LucideIcon-shaped wrapper so PageLayout.actions can render the radar.
  // It captures the current "active" state at render time, which is good enough —
  // we tick state every 250ms while sonar is running, forcing re-renders.
  const sonarActive = sonar.status.phase === "probing" || sonar.status.phase === "enriching";
  // biome-ignore lint/correctness/noUnusedVariables: LucideIcon-shape wrapper
  const SonarLucideIcon = ({ className }: { className?: string }) => (
    <RadarIcon active={sonarActive} className={className} size={20} />
  );

  return (
    <PageLayout
      label={t("page.title", { defaultValue: "Nodes" })}
      leftBar={<Sidebar />}
      actions={[
        {
          key: "sonar-history",
          icon: ClockIcon as unknown as typeof ClockIcon,
          ariaLabel: "Sonar history",
          onClick: () => setHistoryOpen(true),
          className:
            "hover:bg-slate-200 dark:hover:bg-slate-300 dark:hover:text-black cursor-pointer",
        },
        {
          key: "sonar",
          icon: SonarLucideIcon as unknown as typeof ClockIcon,
          onClick: handleSonarClick,
          disabled: sonar.locked || !connection,
          ariaLabel: "Sonar — broadcast probe to direct neighbors",
          label: sonarButtonLabel,
          className:
            "border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-200 dark:hover:bg-slate-300 dark:hover:text-black cursor-pointer disabled:cursor-not-allowed",
        },
      ]}
    >
      <SonarModal
        open={sonarOpen}
        onOpenChange={(o) => {
          // If the user closes the modal while a run is in "ready" state
          // (Phase 1 done, awaiting probe decision), end the run gracefully
          // so the sonar button can be used again.
          if (!o && !viewedRunId && sonar.status.phase === "ready") {
            sonar.endRun();
          }
          setSonarOpen(o);
          if (!o) setViewedRunId(null);
        }}
        run={currentRun}
        phase={viewedRunId ? "idle" : sonar.status.phase}
        endsAt={viewedRunId ? null : sonar.status.endsAt}
        onProbe={viewedRunId ? undefined : sonar.probe}
      />
      <SonarHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        runs={sonarRuns}
        onOpenRun={handleOpenHistoricalRun}
      />
      <div className="pl-2 pt-2 flex flex-row">
        <div className="flex-1 mr-2">
          <Input
            placeholder={t("search.nodes")}
            value={filterState.nodeName}
            className="bg-transparent"
            showClearButton={!!filterState.nodeName}
            onChange={(e) =>
              setFilterState((prev) => ({
                ...prev,
                nodeName: e.target.value,
              }))
            }
          />
        </div>
        <div className="flex justify-end">
          <FilterControl
            filterState={filterState}
            defaultFilterValues={defaultFilterValues}
            setFilterState={setFilterState}
            isDirty={isFilterDirty(filterState)}
            parameters={{
              popoverContentProps: {
                side: "bottom",
                align: "end",
                sideOffset: 12,
              },
              popoverTriggerClassName: "mr-1 p-2",
              showTextSearch: false,
            }}
          />
        </div>
      </div>
      <div className="overflow-y-auto">
        <Table headings={tableHeadings} rows={tableRows} />
        <TracerouteResponseDialog
          traceroute={selectedTraceroute}
          open={!!selectedTraceroute}
          onOpenChange={() => setSelectedTraceroute(undefined)}
        />
        <LocationResponseDialog
          location={selectedLocation}
          open={!!selectedLocation}
          onOpenChange={() => setSelectedLocation(undefined)}
        />
      </div>
    </PageLayout>
  );
};

export default NodesPage;
