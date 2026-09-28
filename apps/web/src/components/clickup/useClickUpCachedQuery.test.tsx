import { RegistryContext } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { act, createElement, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { useClickUpCachedQuery } from "./useClickUpCachedQuery";

let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  appAtomRegistry.reset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("shows retained data immediately on revisit while revalidating, including after a failed refresh", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const requests: Array<{ resolve: (value: string) => void; reject: (error: Error) => void }> = [];
  const query = Atom.make(
    Effect.tryPromise(
      () => new Promise<string>((resolve, reject) => requests.push({ resolve, reject })),
    ),
  ).pipe(Atom.swr({ staleTime: 30_000, revalidateOnMount: true }), Atom.setIdleTTL(Infinity));
  const rendered: Array<{ value: string | null; waiting: boolean; failed: boolean }> = [];
  function View({ atom = query }: { atom?: typeof query }) {
    const result = useClickUpCachedQuery(atom);
    rendered.push({
      value: Option.getOrNull(AsyncResult.value(result)),
      waiting: result.waiting,
      failed: AsyncResult.isFailure(result),
    });
    return null;
  }
  const mount = () =>
    act(() => {
      root = create(
        createElement(RegistryContext.Provider, { value: appAtomRegistry }, createElement(View)),
      );
    });
  await mount();
  expect(requests).toHaveLength(1);
  await act(async () => {
    requests[0]!.resolve("Saved tasks");
  });
  expect(rendered.at(-1)?.value).toBe("Saved tasks");
  await act(() => root!.unmount());
  await vi.advanceTimersByTimeAsync(6 * 60_000);
  rendered.length = 0;
  await mount();
  expect(rendered[0]?.value).toBe("Saved tasks");
  expect(rendered.at(-1)).toEqual({ value: "Saved tasks", waiting: true, failed: false });
  expect(requests).toHaveLength(2);
  await act(async () => {
    requests[1]!.reject(new Error("Temporarily unavailable"));
  });
  expect(rendered.at(-1)).toEqual({ value: "Saved tasks", waiting: false, failed: true });
  await act(() => root!.unmount());
  await mount();
  expect(requests).toHaveLength(3);
  await act(async () => {
    requests[2]!.resolve("Updated tasks");
  });
  expect(rendered.at(-1)).toEqual({ value: "Updated tasks", waiting: false, failed: false });

  const otherScope = Atom.make(Effect.never);
  await act(() =>
    root!.update(
      createElement(
        RegistryContext.Provider,
        { value: appAtomRegistry },
        createElement(View, { atom: otherScope }),
      ),
    ),
  );
  expect(rendered.at(-1)?.value).toBeNull();
});

it("does not refetch when the cold request settles before the mount effect", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const query = Atom.make<AsyncResult.AsyncResult<string>>(AsyncResult.initial(true));
  const refresh = vi.spyOn(appAtomRegistry, "refresh");
  function View() {
    useClickUpCachedQuery(query);
    useLayoutEffect(() => {
      appAtomRegistry.set(query, AsyncResult.success("fast response"));
    }, []);
    return null;
  }
  await act(() => {
    root = create(
      createElement(RegistryContext.Provider, { value: appAtomRegistry }, createElement(View)),
    );
  });
  expect(refresh).not.toHaveBeenCalled();
});
