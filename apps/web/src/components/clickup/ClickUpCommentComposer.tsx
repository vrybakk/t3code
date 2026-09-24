import type {
  ClickUpCommentRepliesInput,
  ClickUpTaskInput,
  EnvironmentId,
} from "@t3tools/contracts";
import { useRef, useState } from "react";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export function ClickUpCommentComposer({
  environmentId,
  input,
  replyTo,
  onSent,
}: {
  environmentId: EnvironmentId;
  input: ClickUpTaskInput;
  replyTo?: ClickUpCommentRepliesInput;
  onSent: () => void;
}) {
  const createComment = useAtomCommand(serverEnvironment.clickUpCreateComment, {
    reportFailure: false,
  });
  const createReply = useAtomCommand(serverEnvironment.clickUpCreateReply, {
    reportFailure: false,
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  async function send() {
    if (sending.current || !text.trim()) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = replyTo
        ? await createReply({ environmentId, input: { ...replyTo, text } })
        : await createComment({ environmentId, input: { ...input, text } });
      if (result._tag === "Success") {
        setText("");
        onSent();
      } else
        setError(
          "Sending could not be confirmed. Refresh the conversation before retrying; your draft is still here.",
        );
    } catch {
      setError(
        "Sending could not be confirmed. Refresh the conversation before retrying; your draft is still here.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <Textarea
        aria-label={replyTo ? "Write a reply" : "Write a comment"}
        placeholder={replyTo ? "Write a reply…" : "Write a comment…"}
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={10_000}
        disabled={busy}
        className="max-h-48 overflow-y-auto"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Post to ClickUp</span>
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          {busy ? "Sending…" : replyTo ? "Send reply" : "Post comment"}
        </Button>
      </div>
    </form>
  );
}
