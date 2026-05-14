import { DeviceImage } from "@components/generic/DeviceImage.tsx";
import { TimeAgo } from "@components/generic/TimeAgo.tsx";
import { Uptime } from "@components/generic/Uptime.tsx";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@components/UI/Accordion.tsx";
import { Button } from "@components/UI/Button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@components/UI/Dialog.tsx";
import { Separator } from "@components/UI/Separator.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/UI/Tabs.tsx";
import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipProvider,
  TooltipPortal,
  TooltipTrigger,
} from "@components/UI/Tooltip.tsx";
import { useFavoriteNode } from "@core/hooks/useFavoriteNode.ts";
import { useIgnoreNode } from "@core/hooks/useIgnoreNode.ts";
import { toast } from "@core/hooks/useToast.ts";
import { useAppStore, useDevice, useNodeDB } from "@core/stores";
import { cn } from "@core/utils/cn.ts";
import { RSSI_THRESHOLD, SNR_THRESHOLD } from "@core/utils/signalColor.ts";
import { Protobuf } from "@meshtastic/core";
import { numberToHexUnpadded } from "@noble/curves/abstract/utils";
import { useNavigate } from "@tanstack/react-router";
import {
  BellIcon,
  BanIcon,
  MapPinnedIcon,
  MessageSquareIcon,
  NavigationIcon,
  StarIcon,
  TrashIcon,
  UserRoundIcon,
  WaypointsIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface NodeDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const hexNodeId = (num: number): string => num.toString(16).padStart(8, "0");
const unpaddedHexNodeId = (num: number): string => numberToHexUnpadded(num);

function nodeDisplayName(node: Protobuf.Mesh.NodeInfo): string {
  const paddedNodeId = `!${hexNodeId(node.num)}`;
  const unpaddedNodeId = `!${unpaddedHexNodeId(node.num)}`;
  const longName = node.user?.longName?.trim();
  if (
    longName &&
    longName.toLowerCase() !== paddedNodeId.toLowerCase() &&
    longName.toLowerCase() !== unpaddedNodeId.toLowerCase()
  ) {
    return longName;
  }
  const shortName = node.user?.shortName?.trim();
  if (shortName) {
    return `Meshtastic ${shortName}`;
  }
  return paddedNodeId;
}

function formatRoleLabel(
  role: Protobuf.Config.Config_DeviceConfig_Role | undefined,
): string | undefined {
  if (role === undefined) return undefined;
  if (role === Protobuf.Config.Config_DeviceConfig_Role.CLIENT) return undefined;
  const name = Protobuf.Config.Config_DeviceConfig_Role[role];
  return name
    ?.toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function SignalBars({ snr, rssi }: { snr: number; rssi?: number }) {
  const level =
    snr > SNR_THRESHOLD.GOOD && (rssi == null || rssi > RSSI_THRESHOLD.GOOD)
      ? 3
      : snr > SNR_THRESHOLD.FAIR && (rssi == null || rssi > RSSI_THRESHOLD.FAIR)
        ? 2
        : 1;
  const barColor =
    level === 3
      ? "bg-green-500 dark:bg-green-400"
      : level === 2
        ? "bg-yellow-500 dark:bg-yellow-400"
        : "bg-orange-500 dark:bg-orange-400";
  const textColor =
    level === 3
      ? "text-green-600 dark:text-green-400"
      : level === 2
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-orange-600 dark:text-orange-400";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-end gap-0.5">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className={cn(
              "w-1.5 rounded-sm transition-colors",
              bar <= level ? barColor : "bg-slate-300 dark:bg-slate-600",
            )}
            style={{ height: `${bar * 5 + 4}px` }}
          />
        ))}
      </div>
      <div className={cn("text-right tabular-nums", textColor)}>
        <div className="text-xs font-medium leading-tight">{snr} dB SNR</div>
        {rssi !== undefined && <div className="text-xs leading-tight opacity-75">{rssi} dBm</div>}
      </div>
    </div>
  );
}

function StatusBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300",
        className,
      )}
    >
      {children}
    </span>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-slate-200 py-2 last:border-b-0 dark:border-slate-700 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}

export const NodeDetailsDialog = ({ open, onOpenChange }: NodeDetailsDialogProps) => {
  const { t } = useTranslation("dialog");
  const { setDialogOpen, connection } = useDevice();
  const { getNode, getNodePacketMetadata } = useNodeDB();
  const navigate = useNavigate();
  const { setNodeNumToBeRemoved, nodeNumDetails } = useAppStore();
  const { updateFavorite } = useFavoriteNode();
  const { updateIgnored } = useIgnoreNode();

  const node = getNode(nodeNumDetails);

  const [isFavoriteState, setIsFavoriteState] = useState<boolean>(node?.isFavorite ?? false);
  const [isIgnoredState, setIsIgnoredState] = useState<boolean>(node?.isIgnored ?? false);

  useEffect(() => {
    if (!node) return;
    setIsFavoriteState(node.isFavorite);
    setIsIgnoredState(node.isIgnored);
  }, [node]);

  if (!node) return;

  function handleDirectMessage() {
    if (!node) return;
    navigate({ to: `/messages/direct/${node.num}` });
    setDialogOpen("nodeDetails", false);
  }

  function handleRequestPosition() {
    if (!node) return;
    toast({ title: t("toast.requestingPosition.title", { ns: "ui" }) });
    connection
      ?.requestPosition(node.num)
      .then(() => toast({ title: t("toast.positionRequestSent.title", { ns: "ui" }) }));
    onOpenChange(false);
  }

  function handleRequestNodeInfo() {
    if (!node) return;
    connection?.sendPacket(new Uint8Array(), Protobuf.Portnums.PortNum.NODEINFO_APP, node.num);
  }

  function handleTraceroute() {
    if (!node) return;
    toast({ title: t("toast.sendingTraceroute.title", { ns: "ui" }) });
    connection
      ?.traceRoute(node.num)
      .then(() => toast({ title: t("toast.tracerouteSent.title", { ns: "ui" }) }));
    onOpenChange(false);
  }

  function handleNodeRemove() {
    if (!node) return;
    setNodeNumToBeRemoved(node.num);
    setDialogOpen("nodeRemoval", true);
    onOpenChange(false);
  }

  function handleToggleFavorite() {
    if (!node) return;
    updateFavorite({ nodeNum: node.num, isFavorite: !isFavoriteState });
    setIsFavoriteState(!isFavoriteState);
  }

  function handleToggleIgnored() {
    if (!node) return;
    updateIgnored({ nodeNum: node.num, isIgnored: !isIgnoredState });
    setIsIgnoredState(!isIgnoredState);
  }

  const deviceMetricsMap = [
    {
      key: "airUtilTx",
      label: t("nodeDetails.airTxUtilization"),
      value: node.deviceMetrics?.airUtilTx,
      format: (val: number) => `${val.toFixed(2)}%`,
    },
    {
      key: "channelUtilization",
      label: t("nodeDetails.channelUtilization"),
      value: node.deviceMetrics?.channelUtilization,
      format: (val: number) => `${val.toFixed(2)}%`,
    },
    {
      key: "batteryLevel",
      label: t("nodeDetails.batteryLevel"),
      value: node.deviceMetrics?.batteryLevel,
      format: (val: number) => (val === 101 ? t("batteryStatus.pluggedIn") : `${val.toFixed(2)}%`),
    },
    {
      key: "voltage",
      label: t("nodeDetails.voltage"),
      value:
        typeof node.deviceMetrics?.voltage === "number"
          ? Math.abs(node.deviceMetrics.voltage)
          : undefined,
      format: (val: number) => `${val.toFixed(2)}V`,
    },
  ];

  const packetMeta = getNodePacketMetadata(node.num);
  const directSnr = packetMeta?.directSnr;
  const directRssi = packetMeta?.directRssi;

  const roleLabel = formatRoleLabel(node.user?.role);
  const hwLabel = (
    Protobuf.Mesh.HardwareModel[node.user?.hwModel ?? 0] ?? t("unknown.shortName")
  ).replace(/_/g, " ");
  const nodeId = hexNodeId(node.num);
  const displayName = nodeDisplayName(node);
  const hasCoordinates = !!node.position?.latitudeI && !!node.position?.longitudeI;
  const hasAltitude = node.position?.altitude !== undefined && node.position.altitude !== 0;
  const hasDeviceMetricRows =
    deviceMetricsMap.some((m) => m.value !== undefined) || !!node.deviceMetrics?.uptimeSeconds;
  const hasPublicKey = !!node.user?.publicKey && node.user.publicKey.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl bg-[#101729] text-slate-100">
        <DialogClose />

        {/* Identity header */}
        <DialogHeader>
          <div className="flex items-start gap-4 pr-6">
            <DeviceImage
              className="h-14 w-14 shrink-0 rounded-lg object-contain"
              deviceType={Protobuf.Mesh.HardwareModel[node.user?.hwModel ?? 0] ?? "UNKNOWN"}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="truncate leading-tight">{displayName}</DialogTitle>
                {directSnr !== undefined && <SignalBars snr={directSnr} rssi={directRssi} />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {node.user?.shortName && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {node.user.shortName}
                  </span>
                )}
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {nodeId}
                </span>
                {roleLabel && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">· {roleLabel}</span>
                )}
              </div>
            </div>
          </div>

          {/* Status badges */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <StatusBadge>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  node.lastHeard === 0 ? "bg-slate-400" : "bg-green-500",
                )}
              />
              {node.lastHeard === 0 ? (
                t("nodesTable.lastHeardStatus.never", { ns: "nodes" })
              ) : (
                <>
                  {t("nodeDetails.heard")} <TimeAgo timestamp={node.lastHeard * 1000} />
                </>
              )}
            </StatusBadge>
            {node.user?.hwModel !== undefined &&
              node.user.hwModel !== Protobuf.Mesh.HardwareModel.UNSET && (
                <StatusBadge>{hwLabel}</StatusBadge>
              )}
            {!node.user?.isUnmessagable && (
              <StatusBadge>{t("nodeDetails.messageable")}</StatusBadge>
            )}
            <StatusBadge>
              {node.isKeyManuallyVerified
                ? t("nodeDetails.keyVerified")
                : t("nodeDetails.keyUnverified")}
            </StatusBadge>
          </div>
        </DialogHeader>

        {/* Primary action buttons — equal-width grid */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            onClick={handleDirectMessage}
            icon={<MessageSquareIcon size={15} />}
          >
            {t("nodeDetails.message")}
          </Button>
          <Button
            variant="outline"
            onClick={handleRequestNodeInfo}
            icon={<UserRoundIcon size={15} />}
          >
            {t("nodeDetails.requestNodeInfo")}
          </Button>
          <Button
            variant="outline"
            onClick={handleRequestPosition}
            icon={<NavigationIcon size={15} />}
          >
            {t("nodeDetails.requestPosition")}
          </Button>
        </div>

        {/* Secondary action row */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTraceroute}
            icon={<WaypointsIcon size={14} />}
          >
            {t("nodeDetails.traceRoute")}
          </Button>
          <div className="flex-1" />
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    isFavoriteState
                      ? t("nodeDetails.unfavoriteNode")
                      : t("nodeDetails.favoriteNode")
                  }
                  onClick={handleToggleFavorite}
                >
                  <StarIcon
                    size={16}
                    className={cn(isFavoriteState ? "fill-yellow-400 stroke-yellow-400" : "")}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent className="rounded bg-slate-800 px-3 py-1 text-xs text-white dark:bg-slate-600">
                  {isFavoriteState
                    ? t("nodeDetails.unfavoriteNode")
                    : t("nodeDetails.favoriteNode")}
                  <TooltipArrow className="fill-slate-800 dark:fill-slate-600" />
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    isIgnoredState ? t("nodeDetails.unignoreNode") : t("nodeDetails.ignoreNode")
                  }
                  onClick={handleToggleIgnored}
                  className={cn(
                    isIgnoredState
                      ? "text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      : "",
                  )}
                >
                  {isIgnoredState ? <BellIcon size={16} /> : <BanIcon size={16} />}
                </Button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent className="rounded bg-slate-800 px-3 py-1 text-xs text-white dark:bg-slate-600">
                  {isIgnoredState ? t("nodeDetails.unignoreNode") : t("nodeDetails.ignoreNode")}
                  <TooltipArrow className="fill-slate-800 dark:fill-slate-600" />
                </TooltipContent>
              </TooltipPortal>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Separator />

        {/* Tabbed content */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start bg-[#101729] dark:bg-[#101729]">
            <TabsTrigger
              value="overview"
              className="bg-[#101729] text-slate-100 data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:bg-[#101729] dark:text-slate-100 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900"
            >
              {t("nodeDetails.overview")}
            </TabsTrigger>
            <TabsTrigger
              value="location"
              className="bg-[#101729] text-slate-100 data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:bg-[#101729] dark:text-slate-100 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900"
            >
              {t("nodeDetails.location")}
            </TabsTrigger>
            <TabsTrigger
              value="diagnostics"
              className="bg-[#101729] text-slate-100 data-[state=active]:bg-white data-[state=active]:text-slate-900 dark:bg-[#101729] dark:text-slate-100 dark:data-[state=active]:bg-white dark:data-[state=active]:text-slate-900"
            >
              {t("nodeDetails.diagnostics")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3 border-0 bg-[#101729] p-4">
            <dl>
              <InfoRow label={t("nodeDetails.nodeNumber")}>{node.num}</InfoRow>
              <InfoRow label={t("nodeDetails.nodeHex")}>
                <span className="font-mono">{nodeId}</span>
              </InfoRow>
              <InfoRow label={t("nodeDetails.role")}>
                {Protobuf.Config.Config_DeviceConfig_Role[node.user?.role ?? 0]?.replace(/_/g, " ")}
              </InfoRow>
              <InfoRow label={t("nodeDetails.lastHeard")}>
                {node.lastHeard === 0 ? (
                  t("nodesTable.lastHeardStatus.never", { ns: "nodes" })
                ) : (
                  <TimeAgo timestamp={node.lastHeard * 1000} />
                )}
              </InfoRow>
              <InfoRow label={t("nodeDetails.hardware")}>{hwLabel}</InfoRow>
              <InfoRow label={t("nodeDetails.messageable")}>
                {node.user?.isUnmessagable ? t("no") : t("yes")}
              </InfoRow>
              <InfoRow label={t("nodeDetails.publicKey")}>
                {hasPublicKey
                  ? t("nodeDetails.publicKeyPresent")
                  : t("nodeDetails.publicKeyMissing")}
              </InfoRow>
              <InfoRow label={t("nodeDetails.verification")}>
                {node.isKeyManuallyVerified
                  ? t("nodeDetails.keyVerified")
                  : t("nodeDetails.keyUnverified")}
              </InfoRow>
            </dl>
          </TabsContent>

          <TabsContent value="location" className="mt-3 border-0 bg-[#101729] p-4">
            {hasCoordinates || hasAltitude ? (
              <dl className="mb-3">
                {hasCoordinates && (
                  <InfoRow label={t("locationResponse.coordinates")}>
                    <a
                      className="text-blue-500 hover:underline dark:text-blue-400"
                      href={`https://www.openstreetmap.org/?mlat=${
                        node.position!.latitudeI! / 1e7
                      }&mlon=${node.position!.longitudeI! / 1e7}&layers=N`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {node.position!.latitudeI! / 1e7}, {node.position!.longitudeI! / 1e7}
                    </a>
                  </InfoRow>
                )}
                {hasAltitude && (
                  <InfoRow label={t("locationResponse.altitude")}>
                    {node.position!.altitude}
                    {t("unit.meter.suffix")}
                  </InfoRow>
                )}
              </dl>
            ) : (
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                {t("nodeDetails.noPosition")}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRequestPosition}
              icon={<MapPinnedIcon size={14} />}
            >
              {t("nodeDetails.requestPosition")}
            </Button>
          </TabsContent>

          <TabsContent value="diagnostics" className="mt-3 border-0 bg-[#101729] p-4">
            <div className="space-y-5">
              {node.deviceMetrics && hasDeviceMetricRows ? (
                <dl>
                  {node.deviceMetrics.uptimeSeconds && (
                    <InfoRow label={t("nodeDetails.uptime")}>
                      <Uptime seconds={node.deviceMetrics.uptimeSeconds} />
                    </InfoRow>
                  )}
                  {deviceMetricsMap
                    .filter((m) => m.value !== undefined)
                    .map((m) => (
                      <InfoRow key={m.key} label={m.label}>
                        {m.format(m.value ?? 0)}
                      </InfoRow>
                    ))}
                </dl>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("nodeDetails.noDeviceMetrics")}
                </p>
              )}

              <Accordion type="single" collapsible>
                <AccordionItem value="raw" className="border-slate-200 dark:border-slate-700">
                  <AccordionTrigger className="py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:no-underline dark:text-slate-500">
                    {t("nodeDetails.allRawMetrics")}
                  </AccordionTrigger>
                  <AccordionContent>
                    <pre className="overflow-x-auto rounded-md bg-slate-50 p-3 text-xs leading-relaxed dark:bg-slate-900">
                      {JSON.stringify(node, null, 2)}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </TabsContent>
        </Tabs>

        <Separator />

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleNodeRemove}
            icon={<TrashIcon size={15} />}
            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950"
          >
            {t("nodeDetails.removeNode")}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("button.close", { ns: "common" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
