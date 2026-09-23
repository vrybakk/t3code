// @effect-diagnostics nodeBuiltinImport:off -- Incremental O_NOFOLLOW reads keep native transcript parsing bounded and read-only.
import * as NodeFSP from "node:fs/promises";
import * as NodeFS from "node:fs";
import { Option, Schema } from "effect";
import type { ScannedHistory } from "./storageUsageScan.ts";

const codexHeader = Schema.Struct({
  type: Schema.Literal("session_meta"),
  payload: Schema.Struct({ id: Schema.String, source: Schema.optionalKey(Schema.Unknown) }),
});
const claudeHeader = Schema.Struct({ sessionId: Schema.String });
const spawn = Schema.Struct({ thread_spawn: Schema.Struct({ parent_thread_id: Schema.String }) });
const source = Schema.Struct({
  subagent: Schema.optionalKey(spawn),
  subAgent: Schema.optionalKey(spawn),
});
const decodeCodex = Schema.decodeUnknownOption(codexHeader);
const decodeClaude = Schema.decodeUnknownOption(claudeHeader);
const decodeSource = Schema.decodeUnknownOption(source);

interface Reader {
  index: number;
  offset: number;
  pending: string;
}

export async function readStorageMetadata(
  histories: ScannedHistory[],
  limits: { headerBytes: number; totalHeaderBytes: number },
  allowRead: () => boolean,
) {
  const buckets = new Map<string, Reader[]>();
  for (const [index, history] of histories.entries()) {
    const key = `${history.provider}:${history.homePath}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push({ index, offset: 0, pending: "" });
    buckets.set(key, bucket);
  }
  let bytesReadTotal = 0;
  let conflict = false;
  const queues = [...buckets.values()];
  while (queues.some((queue) => queue.length) && bytesReadTotal < limits.totalHeaderBytes) {
    for (const queue of queues) {
      const reader = queue.shift();
      if (!reader) continue;
      if (!allowRead() || bytesReadTotal >= limits.totalHeaderBytes)
        return { bytesReadTotal, conflict };
      const history = histories[reader.index]!;
      const bytes = Math.min(
        4096,
        limits.headerBytes - reader.offset,
        history.logicalBytes - reader.offset,
        limits.totalHeaderBytes - bytesReadTotal,
      );
      if (bytes <= 0) continue;
      try {
        const handle = await NodeFSP.open(
          history.filePath,
          NodeFS.constants.O_RDONLY | NodeFS.constants.O_NOFOLLOW,
        );
        let read: Buffer;
        try {
          const buffer = Buffer.alloc(bytes);
          const result = await handle.read(buffer, 0, bytes, reader.offset);
          read = buffer.subarray(0, result.bytesRead);
        } finally {
          await handle.close();
        }
        bytesReadTotal += read.length;
        reader.offset += read.length;
        reader.pending += read.toString("utf8");
        const lines = reader.pending.split("\n");
        reader.pending = lines.pop() ?? "";
        if (read.length === 0 || reader.offset >= history.logicalBytes) lines.push(reader.pending);
        for (const line of lines) {
          let value: unknown;
          try {
            value = JSON.parse(line);
          } catch {
            continue;
          }
          if (history.provider === "codex") {
            const header = decodeCodex(value);
            if (Option.isNone(header)) continue;
            const origin = decodeSource(header.value.payload.source);
            const lower = Option.isSome(origin)
              ? origin.value.subagent?.thread_spawn.parent_thread_id
              : undefined;
            const camel = Option.isSome(origin)
              ? origin.value.subAgent?.thread_spawn.parent_thread_id
              : undefined;
            const conflicting = lower !== undefined && camel !== undefined && lower !== camel;
            conflict ||= conflicting;
            histories[reader.index] = {
              ...history,
              sessionId: header.value.payload.id,
              parentSessionId: conflicting ? undefined : (lower ?? camel),
              metadataConflict: conflicting,
            };
            break;
          }
          const header = decodeClaude(value);
          if (Option.isSome(header)) {
            histories[reader.index] = { ...history, sessionId: header.value.sessionId };
            break;
          }
        }
        if (
          !histories[reader.index]!.sessionId &&
          read.length > 0 &&
          reader.offset < Math.min(limits.headerBytes, history.logicalBytes)
        )
          queue.push(reader);
      } catch {
        /* An unreadable native header does not make measured file bytes disappear. */
      }
    }
  }
  return { bytesReadTotal, conflict };
}
