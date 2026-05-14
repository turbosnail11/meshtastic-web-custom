import { Button } from "@components/UI/Button.tsx";
import { Input } from "@components/UI/Input.tsx";
import { useAppStore, useMessages } from "@core/stores";
import type { Types } from "@meshtastic/core";
import { SendIcon, XIcon } from "lucide-react";
import { startTransition, useState } from "react";
import { useTranslation } from "react-i18next";

export interface MessageInputProps {
  onSend: (message: string, replyId?: number) => void;
  to: Types.Destination;
  maxBytes: number;
}

export const MessageInput = ({ onSend, to, maxBytes }: MessageInputProps) => {
  const { setDraft, getDraft, clearDraft } = useMessages();
  const { t } = useTranslation("messages");
  const pendingReply = useAppStore((s) => s.pendingReply);
  const setPendingReply = useAppStore((s) => s.setPendingReply);

  const calculateBytes = (text: string) => new Blob([text]).size;

  const initialDraft = getDraft(to);
  const [localDraft, setLocalDraft] = useState(initialDraft);
  const [messageBytes, setMessageBytes] = useState(() => calculateBytes(initialDraft));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const byteLength = calculateBytes(newValue);

    if (byteLength <= maxBytes) {
      setLocalDraft(newValue);
      setMessageBytes(byteLength);
      setDraft(to, newValue);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localDraft.trim()) {
      return;
    }
    // Reset bytes *before* sending (consider if onSend failure needs different handling)
    setMessageBytes(0);

    const replyId = pendingReply?.messageId;
    const trimmed = localDraft.trim();
    startTransition(() => {
      if (replyId !== undefined) {
        onSend(trimmed, replyId);
      } else {
        onSend(trimmed);
      }
      setLocalDraft("");
      clearDraft(to);
      setPendingReply(null);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      {pendingReply && (
        <div className="flex items-center gap-2 rounded-md border-l-2 border-blue-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-700 dark:text-slate-200">
              {t("replyTo", { name: pendingReply.senderName })}
            </div>
            <div className="truncate text-slate-500 dark:text-slate-400">
              {pendingReply.preview}
            </div>
          </div>
          <button
            type="button"
            aria-label={t("cancelReply")}
            onClick={() => setPendingReply(null)}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <form className="w-full" name="messageInput" onSubmit={handleSubmit}>
          <div className="flex grow gap-1">
            <label className="w-full" htmlFor="messageInput">
              <Input
                minLength={1}
                name="messageInput"
                placeholder={t("sendMessage.placeholder")}
                autoComplete="off"
                value={localDraft}
                onChange={handleInputChange}
              />
            </label>

            <label
              data-testid="byte-counter"
              htmlFor="messageInput"
              className="flex items-center w-20 p-1 text-sm place-content-end"
            >
              {messageBytes}/{maxBytes}
            </label>

            <Button type="submit" variant="default">
              <SendIcon size={16} />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
