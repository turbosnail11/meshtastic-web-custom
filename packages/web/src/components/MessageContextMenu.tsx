import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@components/UI/ContextMenu.tsx";
import { useCopyToClipboard } from "@core/hooks/useCopyToClipboard.ts";
import { useToast } from "@core/hooks/useToast.ts";
import { MessageType, useAppStore, useDevice, useMessages, useNodeDB } from "@core/stores";
import type { Message } from "@core/stores/messageStore/types.ts";
import { useNavigate } from "@tanstack/react-router";
import { CopyIcon, MessageSquareIcon, ReplyIcon, RouteIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

const PRIORITY_LABELS: Record<number, string> = {
  0: "Unset",
  1: "Min",
  10: "Background",
  64: "Default",
  70: "Reliable",
  120: "Ack",
  127: "Max",
};

function priorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? String(priority);
}

interface MessageContextMenuProps {
  message: Message;
  children: ReactNode;
}

export const MessageContextMenu = ({ message, children }: MessageContextMenuProps) => {
  const { t } = useTranslation("messages");
  const { connection } = useDevice();
  const { getMyNode, getNode } = useNodeDB();
  const messageStore = useMessages();
  const { toast } = useToast();
  const { copy } = useCopyToClipboard();
  const navigate = useNavigate();

  const setPendingReply = useAppStore((s) => s.setPendingReply);

  const packetHex = `!${message.messageId.toString(16).padStart(8, "0")}`;
  const myNodeNum = getMyNode()?.num;
  const isOwnMessage = myNodeNum !== undefined && message.from === myNodeNum;
  const senderNode = getNode(message.from);
  const senderShortName =
    senderNode?.user?.shortName ??
    `!${message.from.toString(16).padStart(8, "0").slice(-4).toUpperCase()}`;
  const senderLongName = senderNode?.user?.longName ?? senderShortName;

  const handleReply = () => {
    setPendingReply({
      messageId: message.messageId,
      senderName: senderLongName,
      preview: message.message,
    });
  };

  const handleDirectMessage = () => {
    navigate({ to: `/messages/direct/${message.from}` });
  };

  const handleCopyText = () => {
    copy(message.message);
    toast({ title: t("contextMenu.copyText"), description: message.message.slice(0, 60) });
  };

  const handleCopyPacketId = () => {
    copy(packetHex);
    toast({ title: t("contextMenu.copyPacketId"), description: packetHex });
  };

  const handleTraceRoute = async () => {
    if (!connection) return;
    try {
      await connection.traceRoute(message.from);
      toast({ title: t("contextMenu.traceRoute") });
    } catch {
      toast({ title: t("contextMenu.traceRoute"), description: "Failed" });
    }
  };

  const handleDelete = () => {
    const myNode = getMyNode();
    if (!myNode) return;
    if (message.type === MessageType.Direct) {
      const nodeA = Math.min(message.from, message.to);
      const nodeB = Math.max(message.from, message.to);
      messageStore.clearMessageByMessageId({
        type: MessageType.Direct,
        nodeA,
        nodeB,
        messageId: message.messageId,
      });
    } else {
      messageStore.clearMessageByMessageId({
        type: MessageType.Broadcast,
        channelId: message.channel,
        messageId: message.messageId,
      });
    }
  };

  const pkiEncrypted =
    message.type === MessageType.Direct && (senderNode?.user?.publicKey?.length ?? 0) > 0;

  const flags: string[] = [];
  if (message.wantAck) flags.push(t("advancedInfo.ackRequested"));
  if (pkiEncrypted) flags.push(t("advancedInfo.pkiEncrypted"));

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {!isOwnMessage && (
          <ContextMenuItem onSelect={handleReply}>
            <ReplyIcon className="h-4 w-4" />
            {t("contextMenu.reply")}
          </ContextMenuItem>
        )}
        {message.type === MessageType.Broadcast && !isOwnMessage && (
          <ContextMenuItem onSelect={handleDirectMessage}>
            <MessageSquareIcon className="h-4 w-4" />
            {t("contextMenu.directMessage", { name: senderShortName })}
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={handleCopyText}>
          <CopyIcon className="h-4 w-4" />
          {t("contextMenu.copyText")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleCopyPacketId}>
          <CopyIcon className="h-4 w-4" />
          {t("contextMenu.copyPacketId")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleTraceRoute} disabled={!connection}>
          <RouteIcon className="h-4 w-4" />
          {t("contextMenu.traceRoute")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleDelete} destructive>
          <Trash2Icon className="h-4 w-4" />
          {t("contextMenu.deleteMessage")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuLabel>{t("contextMenu.packetInfo")}</ContextMenuLabel>
        <div className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400 space-y-0.5 select-text">
          <div>
            <span className="font-medium">{t("contextMenu.packetId")}: </span>
            {packetHex}
          </div>
          {message.priority !== undefined && (
            <div>
              <span className="font-medium">{t("contextMenu.priority")}: </span>
              {message.priority} ({priorityLabel(message.priority)})
            </div>
          )}
          {flags.length > 0 && (
            <div>
              <span className="font-medium">{t("contextMenu.flags")}: </span>
              {flags.join(", ")}
            </div>
          )}
        </div>
      </ContextMenuContent>
    </ContextMenu>
  );
};
