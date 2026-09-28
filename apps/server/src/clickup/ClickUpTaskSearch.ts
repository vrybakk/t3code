import * as Cache from "effect/Cache";
import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { ApiTask, decodeResponse, normalizeTask, type ClickUpApi } from "./ClickUpApi.ts";

class Workspace extends Data.Class<{ workspaceId: string; token: string }> {}

export const makeTaskSearch = Effect.fn("ClickUpTaskSearch.make")(function* (
  api: typeof ClickUpApi.Service,
) {
  const requestGate = yield* Semaphore.make(1);
  let nextRequestAt = 0;
  // Leave headroom under ClickUp's 100 requests/minute token limit for other task actions.
  const requestPage = Effect.fn("ClickUpTaskSearch.requestPage")(
    function* (path: string, token: string) {
      yield* Effect.sleep(Math.max(0, nextRequestAt - (yield* Clock.currentTimeMillis)));
      nextRequestAt = (yield* Clock.currentTimeMillis) + 1_000;
      return yield* api.request(path, { token }).pipe(
        Effect.tapError((error) =>
          Effect.gen(function* () {
            if (error.retryAfterMs !== undefined) {
              nextRequestAt = Math.max(
                nextRequestAt,
                (yield* Clock.currentTimeMillis) + error.retryAfterMs,
              );
            }
          }),
        ),
      );
    },
    requestGate.withPermit,
    Effect.retry({ while: (error) => error.retryAfterMs !== undefined }),
  );
  // Keep successful pages across cancellation or errors; expose matches only after the last page.
  const snapshots = yield* Cache.makeWith(
    ({ workspaceId, token }: Workspace) =>
      Effect.gen(function* () {
        const gate = yield* Semaphore.make(1);
        const tasks = new Map<string, ReturnType<typeof normalizeTask>>();
        let page = 0;
        let complete = false;
        let expiresAt = 0;
        return Effect.fnUntraced(function* () {
          if ((yield* Clock.currentTimeMillis) >= expiresAt) {
            tasks.clear();
            page = 0;
            complete = false;
          }
          while (!complete) {
            const query = new URLSearchParams({
              page: String(page),
              subtasks: "true",
              include_closed: "true",
              order_by: "updated",
              reverse: "true",
            });
            const response = yield* requestPage(
              `team/${encodeURIComponent(workspaceId)}/task?${query}`,
              token,
            ).pipe(
              Effect.flatMap(
                decodeResponse(
                  Schema.Struct({
                    tasks: Schema.Array(ApiTask),
                    last_page: Schema.optional(Schema.Boolean),
                  }),
                ),
              ),
            );
            for (const task of response.tasks) {
              tasks.set(task.id, { ...normalizeTask(task), description: "" });
            }
            page++;
            complete =
              response.last_page === true ||
              (response.last_page === undefined && response.tasks.length < 100);
            expiresAt = (yield* Clock.currentTimeMillis) + 5 * 60_000;
          }
          return [...tasks.values()];
        }, gate.withPermit);
      }),
    { capacity: 8, timeToLive: () => Duration.infinity },
  );
  return Effect.fn("ClickUpTaskSearch.search")(function* (
    workspaceId: string,
    token: string,
    query: string,
  ) {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/);
    const snapshot = yield* Cache.get(snapshots, new Workspace({ workspaceId, token }));
    const tasks = (yield* snapshot()).filter((task) =>
      terms.every((term) => `${task.name} ${task.taskId}`.toLocaleLowerCase().includes(term)),
    );
    return { tasks: tasks.slice(0, 50), hasMore: tasks.length > 50 };
  });
});
