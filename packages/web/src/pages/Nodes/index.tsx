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
import { Popover, PopoverContent, PopoverTrigger } from "@components/UI/Popover.tsx";
import { Avatar } from "@components/UI/Avatar.tsx";
import { Input } from "@components/UI/Input.tsx";
import { RadarIcon } from "@components/UI/RadarIcon.tsx";
import useLang from "@core/hooks/useLang.ts";
import { useSonar } from "@core/hooks/useSonar.ts";
import { useAppStore, useDevice, useNodeDB } from "@core/stores";
import { type SonarRun, useSonarStore } from "@core/stores/sonarStore/index.ts";
import { cn } from "@core/utils/cn.ts";
import { Protobuf, type Types } from "@meshtastic/core";
import { numberToHexUnpadded } from "@noble/curves/abstract/utils";
import {
  ActivityIcon,
  ClockIcon,
  CloudIcon,
  InfoIcon,
  LockKeyholeIcon,
  LockIcon,
  LockOpenIcon,
  MapPinIcon,
  MessageSquareIcon,
  PackageIcon,
  RouteIcon,
  SkullIcon,
} from "lucide-react";
import { type JSX, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { base16 } from "rfc4648";

const NODEDB_DEBOUNCE_MS = 250;
// Stable reference so the sonar runs selector doesn't churn on every render.
const EMPTY_RUNS: SonarRun[] = [];
const NODE_ICON_BUTTON_CLASS =
  "inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 dark:hover:bg-slate-700";
const NODE_ICON_POPOVER_CLASS = "w-64 text-sm";

function formatPortnum(portnum?: Protobuf.Portnums.PortNum): string {
  if (portnum === undefined) {
    return "Unknown packet";
  }
  return (
    Protobuf.Portnums.PortNum[portnum]
      ?.replace(/_APP$/, "")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase()) ?? `Packet ${portnum}`
  );
}

function PacketReasonDescription({
  packetState,
  portnum,
}: {
  packetState?: "decoded" | "encrypted" | "unknown" | "deadTransit";
  portnum?: Protobuf.Portnums.PortNum;
}): string {
  if (packetState === "deadTransit") {
    return "This packet was not for this node, and no hops remain.";
  }
  if (packetState === "encrypted") {
    return "This packet was encrypted or otherwise not decoded locally, so its app port is not visible.";
  }
  if (portnum === undefined) {
    return "The latest packet did not include a decoded app port.";
  }
  return `Latest decoded packet type: ${formatPortnum(portnum)}.`;
}

function NodeInfoPopoverIcon({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: JSX.Element;
}): JSX.Element {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={NODE_ICON_BUTTON_CLASS}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className={NODE_ICON_POPOVER_CLASS}>
        <div className="font-medium text-slate-900 dark:text-slate-100">{label}</div>
        <p className="mt-1 text-slate-600 dark:text-slate-300">{description}</p>
      </PopoverContent>
    </Popover>
  );
}

function PacketReasonIcon({
  packetState,
  portnum,
}: {
  packetState?: "decoded" | "encrypted" | "unknown" | "deadTransit";
  portnum?: Protobuf.Portnums.PortNum;
}): JSX.Element {
  const label =
    packetState === "deadTransit"
      ? "No hops left"
      : packetState === "encrypted"
        ? "Encrypted packet"
        : formatPortnum(portnum);
  const description = PacketReasonDescription({ packetState, portnum });
  const className = "mx-auto size-4";
  const wrap = (icon: JSX.Element) => (
    <NodeInfoPopoverIcon label={label} description={description}>
      {icon}
    </NodeInfoPopoverIcon>
  );

  if (packetState === "deadTransit") {
    return wrap(<SkullIcon className={className} aria-hidden="true" />);
  }
  if (packetState === "encrypted") {
    return wrap(<LockKeyholeIcon className={className} aria-hidden="true" />);
  }

  switch (portnum) {
    case Protobuf.Portnums.PortNum.TEXT_MESSAGE_APP:
    case Protobuf.Portnums.PortNum.TEXT_MESSAGE_COMPRESSED_APP:
      return wrap(<MessageSquareIcon className={className} aria-hidden="true" />);
    case Protobuf.Portnums.PortNum.POSITION_APP:
      return wrap(<MapPinIcon className={className} aria-hidden="true" />);
    case Protobuf.Portnums.PortNum.NODEINFO_APP:
      return wrap(<InfoIcon className={className} aria-hidden="true" />);
    case Protobuf.Portnums.PortNum.TELEMETRY_APP:
      return wrap(<ActivityIcon className={className} aria-hidden="true" />);
    case Protobuf.Portnums.PortNum.ROUTING_APP:
    case Protobuf.Portnums.PortNum.TRACEROUTE_APP:
      return wrap(<RouteIcon className={className} aria-hidden="true" />);
    default:
      return wrap(<PackageIcon className={className} aria-hidden="true" />);
  }
}

function relayFallback(kind: "unknown" | "ambiguous", relayNode: number): string {
  const hex = `0x${(relayNode & 0xff).toString(16).padStart(2, "0").toUpperCase()}`;
  return kind === "unknown" ? `Unknown relay ${hex}` : `Ambiguous relay ${hex}`;
}

function EncryptionIndicator({ hasPublicKey }: { hasPublicKey: boolean }): JSX.Element {
  const { t } = useTranslation("nodes");
  const label = hasPublicKey
    ? t("nodesTable.encryption.publicKey.label")
    : t("nodesTable.encryption.noPublicKey.label");
  const description = hasPublicKey
    ? t("nodesTable.encryption.publicKey.description")
    : t("nodesTable.encryption.noPublicKey.description");
  const Icon = hasPublicKey ? LockIcon : LockOpenIcon;

  return (
    <NodeInfoPopoverIcon label={label} description={description}>
      <Icon
        className={hasPublicKey ? "text-green-600" : "text-yellow-500"}
        size={16}
        aria-hidden="true"
      />
    </NodeInfoPopoverIcon>
  );
}

function directSignalStrength(percent: number): {
  key: "good" | "fair" | "poor";
  bars: number;
  className: string;
} {
  if (percent >= 70) {
    return {
      key: "good",
      bars: 3,
      className: "bg-green-500",
    };
  }
  if (percent >= 35) {
    return {
      key: "fair",
      bars: 2,
      className: "bg-yellow-500",
    };
  }
  return {
    key: "poor",
    bars: 1,
    className: "bg-red-500",
  };
}

function DirectSignalStrength({ percent }: { percent: number }): JSX.Element {
  const { t } = useTranslation("nodes");
  const strength = directSignalStrength(percent);
  const label = t(`nodesTable.connectionStatus.signal.${strength.key}`);
  const roundedPercent = Math.round(percent);

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={t("nodesTable.connectionStatus.signal.title", {
        strength: label,
        percent: roundedPercent,
      })}
      aria-label={t("nodesTable.connectionStatus.signal.title", {
        strength: label,
        percent: roundedPercent,
      })}
    >
      <span className="inline-flex h-4 items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={cn(
              "w-1 rounded-sm",
              bar === 1 ? "h-1.5" : bar === 2 ? "h-2.5" : "h-4",
              bar <= strength.bars ? strength.className : "bg-slate-300 dark:bg-slate-600",
            )}
          />
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}

// CLIENT is the protobuf default — every node we receive will report it
// unless their config says otherwise, so suppress the label for plain Clients
// to keep the table uncluttered. All other roles are surfaced.
function formatRoleLabel(
  role: Protobuf.Config.Config_DeviceConfig_Role | undefined,
): string | undefined {
  if (role === undefined) return undefined;
  if (role === Protobuf.Config.Config_DeviceConfig_Role.CLIENT) return undefined;
  const name = Protobuf.Config.Config_DeviceConfig_Role[role];
  if (!name) return undefined;
  return name
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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
  const {
    nodes: filteredNodes,
    hasNodeError,
    getNodePacketMetadata,
  } = useNodeDB(
    (db) => ({
      nodes: db.getNodes(predicate, true),
      hasNodeError: db.hasNodeError,
      getNodePacketMetadata: db.getNodePacketMetadata,
      _metadataRef: db.nodePacketMetadata,
      _errorsRef: db.nodeErrors, // include the Map ref so UI also re-renders on error changes
    }),
    { debounce: NODEDB_DEBOUNCE_MS },
  );
  const visibleNodes = useMemo(
    () => filteredNodes.filter((node) => node.num !== hardware.myNodeNum),
    [filteredNodes, hardware.myNodeNum],
  );
  const handleTraceroute = useCallback(
    (traceroute: Types.PacketMetadata<Protobuf.Mesh.RouteDiscovery>) => {
      // Suppress the dialog for traceroute responses that are sonar replies.
      if (sonar.isSonarResponsePacket(traceroute.id)) return;
      setSelectedTraceroute(traceroute);
    },
    [sonar],
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
    [hardware.myNodeNum, sonar],
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
    {
      title: t("nodesTable.headings.longName"),
      sortable: true,
      className: "pl-5",
    },
    {
      title: t("nodesTable.headings.packetReason", { defaultValue: "Packet" }),
      sortable: true,
    },
    { title: t("nodesTable.headings.connection"), sortable: true },
    {
      title: t("nodesTable.headings.relayedBy", { defaultValue: "Relayed by" }),
      sortable: true,
    },
    { title: t("nodesTable.headings.lastHeard"), sortable: true },
    { title: t("unit.snr"), sortable: true },
    { title: t("nodesTable.headings.model"), sortable: true },
    { title: t("nodesTable.headings.macAddress"), sortable: true },
  ];

  const tableRows: DataRow[] = visibleNodes.map((node) => {
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
    const roleLabel = formatRoleLabel(node.user?.role);
    const metadata = getNodePacketMetadata(node.num);
    const hopsAway = metadata?.hopsAway ?? node.hopsAway;
    const viaMqtt = metadata?.viaMqtt ?? node.viaMqtt;
    const directSnr = metadata?.directSnr;
    const relayText =
      metadata?.relay.status === "resolved"
        ? metadata.relay.nodeName
        : metadata?.relay.status === "unknown" || metadata?.relay.status === "ambiguous"
          ? relayFallback(metadata.relay.status, metadata.relay.relayNode)
          : "";
    const directSignalPercent =
      directSnr === undefined ? undefined : Math.min(Math.max((directSnr + 10) * 5, 0), 100);
    const hasFreshDirectSignal =
      viaMqtt === false &&
      hopsAway === 0 &&
      directSignalPercent !== undefined &&
      !metadata?.directSignalStale;

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
            <div className="ml-2 flex items-center gap-2">
              <EncryptionIndicator hasPublicKey={!!node.user?.publicKey?.length} />
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => handleNodeInfoDialog(node.num)}
                  className="cursor-pointer underline whitespace-break-spaces bg-transparent border-0 p-0 text-left"
                >
                  {longName}
                </button>
                {roleLabel && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">{roleLabel}</span>
                )}
              </div>
            </div>
          ),
          sortValue: longName,
        },
        {
          content: (
            <Mono>
              <PacketReasonIcon packetState={metadata?.packetState} portnum={metadata?.portnum} />
            </Mono>
          ),
          sortValue:
            metadata?.packetState === "deadTransit"
              ? "No hops left"
              : metadata?.packetState === "encrypted"
                ? "Encrypted packet"
                : formatPortnum(metadata?.portnum),
        },
        {
          content: (
            <Mono className="w-16">
              {hasFreshDirectSignal ? (
                <DirectSignalStrength percent={directSignalPercent} />
              ) : hopsAway !== undefined ? (
                viaMqtt === false && hopsAway === 0 ? (
                  t("nodesTable.connectionStatus.direct")
                ) : (
                  `${hopsAway.toString()} ${
                    hopsAway > 1 ? t("unit.hop.plural") : t("unit.hop.one")
                  }`
                )
              ) : (
                t("unknown.longName")
              )}
              {viaMqtt === true && (
                <CloudIcon
                  className="ml-1 inline-block size-4 align-text-bottom"
                  aria-label={t("nodesTable.connectionStatus.mqtt")}
                />
              )}
            </Mono>
          ),
          sortValue: hopsAway ?? Number.MAX_SAFE_INTEGER,
        },
        {
          content: <Mono>{relayText}</Mono>,
          sortValue: relayText,
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
            <Mono
              className={metadata?.directSignalStale ? "text-yellow-600 dark:text-yellow-300" : ""}
              title={
                metadata?.directSignalStale
                  ? t("nodesTable.signal.staleTitle", {
                      defaultValue: "Last direct signal is stale",
                    })
                  : undefined
              }
            >
              {directSnr === undefined || directSignalPercent === undefined ? (
                t("nodesTable.signal.none", {
                  defaultValue: "No direct signal",
                })
              ) : (
                <>
                  {directSnr}
                  {t("unit.dbm")}/{directSignalPercent}%/{(directSnr + 10) * 5}
                  {t("unit.raw")}
                  {metadata?.directSignalStale
                    ? ` ${t("nodesTable.signal.stale", { defaultValue: "(stale)" })}`
                    : ""}
                </>
              )}
            </Mono>
          ),
          sortValue: directSnr ?? Number.NEGATIVE_INFINITY,
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
