import { useAtomValue } from "@effect/atom-react";
import * as Option from "effect/Option";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";
import { useEffect, useMemo } from "react";
import { appAtomRegistry } from "../../rpc/atomRegistry";

export function useClickUpCachedQuery<A, E>(query: Atom.Atom<AsyncResult.AsyncResult<A, E>>) {
  const mountedResult = useMemo(() => appAtomRegistry.get(query), [query]);
  const result = useAtomValue(query);
  useEffect(() => {
    // Retained atoms outlive the route, so returning must explicitly revalidate them.
    const cached = appAtomRegistry.get(query);
    if (
      !mountedResult.waiting &&
      Option.isSome(AsyncResult.value(mountedResult)) &&
      !cached.waiting
    ) {
      appAtomRegistry.refresh(query);
    }
  }, [query, mountedResult]);
  return result;
}
