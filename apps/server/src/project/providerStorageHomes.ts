import * as NodeOS from "node:os";
import {
  ClaudeSettings,
  CodexSettings,
  ProviderDriverKind,
  type ServerSettings,
} from "@t3tools/contracts";
import { Effect, Option, Path, Schema } from "effect";
import { resolveCodexHomeLayout } from "../provider/Drivers/CodexHomeLayout.ts";
import { expandHomePath } from "../pathExpansion.ts";

export interface ProviderStorageHome {
  readonly provider: "codex" | "claudeAgent";
  readonly homePath: string;
  readonly instanceIds: ReadonlyArray<string>;
}

const decodeCodex = Schema.decodeUnknownOption(CodexSettings);
const decodeClaude = Schema.decodeUnknownOption(ClaudeSettings);

export const resolveProviderStorageHomes = Effect.fn("resolveProviderStorageHomes")(function* (
  settings: ServerSettings,
  environment: Readonly<Record<string, string | undefined>>,
) {
  const path = yield* Path.Path;
  const homes = new Map<string, ProviderStorageHome>();
  for (const provider of ["codex", "claudeAgent"] as const) {
    const instances = Object.entries(settings.providerInstances).filter(
      ([, instance]) => instance.driver === provider,
    );
    if (!Object.hasOwn(settings.providerInstances, provider)) {
      instances.push([
        provider,
        { driver: ProviderDriverKind.make(provider), config: settings.providers[provider] },
      ]);
    }
    for (const [instanceId, instance] of instances) {
      const variable = provider === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR";
      const environmentHome =
        instance.environment?.findLast((entry) => entry.name === variable)?.value ??
        environment[variable];
      let paths: string[];
      if (provider === "codex") {
        const decoded = decodeCodex(instance.config ?? {});
        if (Option.isNone(decoded)) continue;
        const config = decoded.value;
        const layout = yield* resolveCodexHomeLayout(
          !config.homePath.trim() && !config.shadowHomePath.trim() && environmentHome?.trim()
            ? { ...config, homePath: environmentHome }
            : config,
        );
        paths = [layout.sharedHomePath];
        if (layout.effectiveHomePath) paths.push(layout.effectiveHomePath);
      } else {
        const decoded = decodeClaude(instance.config ?? {});
        if (Option.isNone(decoded)) continue;
        const configured = decoded.value.homePath.trim() || environmentHome?.trim();
        paths = [
          path.resolve(
            configured ? expandHomePath(configured) : path.join(NodeOS.homedir(), ".claude"),
          ),
        ];
      }
      for (const homePath of paths) {
        const key = `${provider}\0${homePath}`;
        const previous = homes.get(key);
        homes.set(key, {
          provider,
          homePath,
          instanceIds: [...new Set([...(previous?.instanceIds ?? []), instanceId])],
        });
      }
    }
  }
  return [...homes.values()];
});
