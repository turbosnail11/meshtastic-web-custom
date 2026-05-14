import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@components/UI/ContextMenu.tsx";
import { useCopyToClipboard } from "@core/hooks/useCopyToClipboard.ts";
import { useFavoriteNode } from "@core/hooks/useFavoriteNode.ts";
import { useIgnoreNode } from "@core/hooks/useIgnoreNode.ts";
import { useSimpleMode } from "@core/hooks/useSimpleMode.ts";
import { useToast } from "@core/hooks/useToast.ts";
import { useDevice } from "@core/stores";
import { Protobuf } from "@meshtastic/core";
import { useNavigate } from "@tanstack/react-router";
import {
  CopyIcon,
  MapPinIcon,
  MessageSquareIcon,
  NavigationIcon,
  Route as RouteIcon,
  StarIcon,
  Trash2Icon,
  UserRoundIcon,
  UserXIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface NodeContextMenuProps {
  node: Protobuf.Mesh.NodeInfo;
  children: ReactNode;
  /** If true, the trigger wraps an inline element (uses asChild on a span). */
  asChild?: boolean;
  /** Hide actions that are not meaningful for the user's own node. */
  isSelf?: boolean;
}

const hexNodeId = (num: number): string => `!${num.toString(16).padStart(8, "0")}`;

const nodeDisplayName = (node: Protobuf.Mesh.NodeInfo): string => {
  const nodeId = hexNodeId(node.num);
  const longName = node.user?.longName?.trim();
  if (longName && longName !== nodeId) {
    return longName;
  }

  const shortName = node.user?.shortName?.trim();
  if (shortName) {
    return `Meshtastic ${shortName}`;
  }

  return nodeId;
};

/**
 * Right-click (or long-press) context menu for a node.
 * Reusable across the Nodes table, Messages contact list, and (future) Map markers.
 *
 * Actions visible in simple mode:
 *   Send Message, Request Node Info, Request Position, Trace Route, Favorite, Copy Node ID, Show on Map
 *
 * Additional actions in advanced mode:
 *   Ignore Node, Remove from NodeDB
 */
export function NodeContextMenu({
  node,
  children,
  asChild = true,
  isSelf = false,
}: NodeContextMenuProps) {
  const { connection } = useDevice();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation("nodes");
  const simpleMode = useSimpleMode();
  const { copy } = useCopyToClipboard();
  const { updateFavorite } = useFavoriteNode();
  const { updateIgnored } = useIgnoreNode();

  const nodeNum = node.num;
  const nodeName = nodeDisplayName(node);

  const handleSendMessage = () => {
    navigate({
      to: "/messages/$type/$chatId",
      params: { type: "direct", chatId: String(nodeNum) },
    });
  };

  const handleTraceRoute = async () => {
    if (!connection) return;
    try {
      await connection.traceRoute(nodeNum);
      toast({
        title: t("toast.traceroute.sent", {
          defaultValue: `Trace route sent to ${nodeName}`,
        }),
      });
    } catch (err) {
      toast({
        title: t("toast.traceroute.failed", {
          defaultValue: "Trace route failed",
        }),
        description: String(err),
      });
    }
  };

  const handleRequestNodeInfo = async () => {
    if (!connection) return;
    try {
      await connection.sendPacket(
        new Uint8Array(),
        Protobuf.Portnums.PortNum.NODEINFO_APP,
        nodeNum,
      );
      toast({
        title: t("toast.requestNodeInfo.sent", {
          defaultValue: `Node info requested from ${nodeName}`,
        }),
      });
    } catch (err) {
      toast({
        title: t("toast.requestNodeInfo.failed", {
          defaultValue: "Node info request failed",
        }),
        description: String(err),
      });
    }
  };

  const handleRequestPosition = async () => {
    if (!connection) return;
    try {
      await connection.requestPosition(nodeNum);
      toast({
        title: t("toast.requestPosition.sent", {
          defaultValue: `Position requested from ${nodeName}`,
        }),
      });
    } catch (err) {
      toast({
        title: t("toast.requestPosition.failed", {
          defaultValue: "Position request failed",
        }),
        description: String(err),
      });
    }
  };

  const handleFavoriteToggle = () => {
    updateFavorite({ nodeNum, isFavorite: !node.isFavorite });
  };

  const handleCopyNodeId = async () => {
    await copy(hexNodeId(nodeNum));
    toast({
      title: t("toast.copyNodeId", {
        defaultValue: "Node ID copied to clipboard",
      }),
    });
  };

  const handleShowOnMap = () => {
    navigate({ to: "/map" });
  };

  const handleIgnore = () => {
    updateIgnored({ nodeNum, isIgnored: !node.isIgnored });
  };

  const handleRemove = async () => {
    if (!connection) return;
    try {
      await connection.removeNodeByNum(nodeNum);
      toast({
        title: t("toast.removeNode", {
          defaultValue: `Removed ${nodeName} from NodeDB`,
        }),
      });
    } catch (err) {
      toast({
        title: t("toast.removeNodeFailed", {
          defaultValue: "Failed to remove node",
        }),
        description: String(err),
      });
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild={asChild}>{children}</ContextMenuTrigger>
      <ContextMenuContent data-testid="node-context-menu">
        <ContextMenuLabel>{nodeName}</ContextMenuLabel>
        <ContextMenuSeparator />

        {!isSelf && (
          <ContextMenuItem onSelect={handleSendMessage} data-testid="action-send-message">
            <MessageSquareIcon className="h-4 w-4" />
            Send Message
          </ContextMenuItem>
        )}

        {!isSelf && (
          <ContextMenuItem onSelect={handleRequestNodeInfo} data-testid="action-request-node-info">
            <UserRoundIcon className="h-4 w-4" />
            Request Node Info
          </ContextMenuItem>
        )}

        {!isSelf && (
          <ContextMenuItem onSelect={handleRequestPosition} data-testid="action-request-position">
            <NavigationIcon className="h-4 w-4" />
            Request Position
          </ContextMenuItem>
        )}

        {!isSelf && (
          <ContextMenuItem onSelect={handleTraceRoute} data-testid="action-traceroute">
            <RouteIcon className="h-4 w-4" />
            Trace Route
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem onSelect={handleFavoriteToggle} data-testid="action-favorite">
          <StarIcon className="h-4 w-4" />
          {node.isFavorite ? "Unfavorite" : "Favorite"}
        </ContextMenuItem>

        <ContextMenuItem onSelect={handleCopyNodeId} data-testid="action-copy-id">
          <CopyIcon className="h-4 w-4" />
          Copy Node ID
        </ContextMenuItem>

        <ContextMenuItem onSelect={handleShowOnMap} data-testid="action-show-on-map">
          <MapPinIcon className="h-4 w-4" />
          Show on Map
        </ContextMenuItem>

        {!simpleMode && !isSelf && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={handleIgnore} data-testid="action-ignore">
              <UserXIcon className="h-4 w-4" />
              {node.isIgnored ? "Unignore" : "Ignore Node"}
            </ContextMenuItem>
            <ContextMenuItem onSelect={handleRemove} destructive data-testid="action-remove">
              <Trash2Icon className="h-4 w-4" />
              Remove from NodeDB
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
