// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.

// Local, browser-persisted runtime settings.

const ALLOW_SCRIPT_KEY = 'trajectory.allowScriptExecution';

/**
 * Whether SCRIPT steps from imported workflows may execute author-supplied
 * code. Default TRUE in this build (demo): SCRIPT runs unless the user has
 * explicitly opted out. Only an explicit 'false' disables execution.
 */
export function getAllowScript(): boolean {
  try {
    // Demo default: ON. Only an explicit opt-out ('false') disables execution.
    return globalThis.localStorage?.getItem(ALLOW_SCRIPT_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setAllowScript(allow: boolean): void {
  try {
    globalThis.localStorage?.setItem(ALLOW_SCRIPT_KEY, allow ? 'true' : 'false');
  } catch {
    // No localStorage (e.g. SSR/tests) — nothing to persist.
  }
}

const SERVER_ALLOWLIST_KEY = 'trajectory.actionServerAllowlist';

/**
 * Action-server origins the user trusts beyond loopback (comma-separated in
 * localStorage). Empty by default → loopback-only.
 */
export function getServerAllowlist(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(SERVER_ALLOWLIST_KEY) ?? '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
