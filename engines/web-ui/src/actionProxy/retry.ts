// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.

export const TRANSPORT_BACKOFFS_MS: ReadonlyArray<number> = [250, 500, 1000, 2000, 5000, 15000, 30000];

interface RetryOptions {
  sleep?: (ms: number) => Promise<void>;
  onAttempt?: (attemptNumber: number) => void;
  backoffs?: ReadonlyArray<number>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isTransportError(e: unknown): boolean {
  // Logic errors are tagged with `code` and `status` by ActionApiClient.
  // TypeError from fetch (e.g., "Failed to fetch"), DOMException AbortError,
  // and any error WITHOUT a `code` field are treated as transport-level.
  const err = e as { code?: unknown };
  return err.code === undefined;
}

export async function retryTransport<T>(
  op: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  const backoffs = opts.backoffs ?? TRANSPORT_BACKOFFS_MS;
  let attempt = 0;
  for (;;) {
    attempt++;
    opts.onAttempt?.(attempt);
    try {
      return await op();
    } catch (e) {
      if (!isTransportError(e)) throw e;
      const idx = attempt - 1;
      if (idx >= backoffs.length) throw e;
      await sleep(backoffs[idx]);
    }
  }
}
