import * as Cache from "effect/Cache";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ApiTask, decodeResponse, normalizeTask, type ClickUpApi } from "./ClickUpApi.ts";

class Workspace extends Data.Class<{ workspaceId: string; token: string }> {}

export const makeTaskSearch = Effect.fn("ClickUpTaskSearch.make")(function* (
  api: typeof ClickUpApi.Service,
) {
  // The public API has no task-name filter. Share a short-lived, account-scoped
  // workspace snapshot across keystrokes instead of rescanning it for each query.
  const snapshots = yield* Cache.makeWith(
    ({ workspaceId, token }: Workspace) =>
      Effect.gen(function* () {
        const tasks = new Map<string, ReturnType<typeof normalizeTask>>();
        for (let start = 0; ; start += 4) {
          const responses = yield* Effect.forEach(
            [start, start + 1, start + 2, start + 3],
            (page) => {
              const query = new URLSearchParams({
                page: String(page),
                subtasks: "true",
                include_closed: "true",
                order_by: "updated",
                reverse: "true",
              });
              return api
                .request(`team/${encodeURIComponent(workspaceId)}/task?${query}`, { token })
                .pipe(
                  Effect.flatMap(
                    decodeResponse(
                      Schema.Struct({
                        tasks: Schema.Array(ApiTask),
                        last_page: Schema.optional(Schema.Boolean),
                      }),
                    ),
                  ),
                );
            },
            { concurrency: 4 },
          );
          for (const response of responses) {
            for (const task of response.tasks) {
              tasks.set(task.id, { ...normalizeTask(task), description: "" });
            }
            if (
              response.last_page === true ||
              (response.last_page === undefined && response.tasks.length < 100)
            ) {
              return [...tasks.values()];
            }
          }
        }
      }),
    { capacity: 8, timeToLive: (result) => (result._tag === "Success" ? "5 minutes" : 0) },
  );
  return Effect.fn("ClickUpTaskSearch.search")(function* (
    workspaceId: string,
    token: string,
    query: string,
  ) {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/);
    const tasks = (yield* Cache.get(snapshots, new Workspace({ workspaceId, token }))).filter(
      (task) =>
        terms.every((term) => `${task.name} ${task.taskId}`.toLocaleLowerCase().includes(term)),
    );
    return { tasks: tasks.slice(0, 50), hasMore: tasks.length > 50 };
  });
});
