import type * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";

const allPermits = Number.MAX_SAFE_INTEGER;
const admission = Semaphore.makeUnsafe(allPermits);

/** Session starts may overlap each other, but never destructive history cleanup. */
export const withProviderHistoryAdmission = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  admission.withPermit(effect);

export const withProviderHistoryCleanup = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  admission.withPermits(allPermits)(effect);
