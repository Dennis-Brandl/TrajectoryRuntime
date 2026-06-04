// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.

// Local, browser-persisted runtime settings.

const ALLOW_SCRIPT_KEY = 'trajectory.allowScriptExecution';

/**
 * Whether SCRIPT steps from imported workflows may execute author-supplied
 * code. Default FALSE — only enable for packages you trust.
 */
export function getAllowScript(): boolean {
  try {
    return globalThis.localStorage?.getItem(ALLOW_SCRIPT_KEY) === 'true';
  } catch {
    return false;
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
