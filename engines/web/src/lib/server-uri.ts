// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.

// SSRF guard for action-server URIs. A workflow package's
// action_server_specifications[].uri is author-controlled; the runtime fetches
// it (capabilities, invoke, command, delete, SSE), so it must be constrained.

export class DisallowedServerUriError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DisallowedServerUriError';
  }
}

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  return h === 'localhost' || h === '::1' || /^127(?:\.\d{1,3}){3}$/.test(h);
}

/**
 * Whether the action-server URI may be contacted. http(s) only; loopback by
 * default (blocks external, private-LAN, and cloud-metadata hosts). If an
 * allow-list is supplied, the URI must match one of its origins/prefixes.
 */
export function isAllowedServerUri(uri: string, allowlist: string[] = []): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const list = allowlist.map((s) => s.trim()).filter(Boolean);
  if (list.length > 0) {
    return list.some((entry) => url.origin === entry || uri.startsWith(entry));
  }
  return isLoopbackHost(url.hostname);
}

export function assertAllowedServerUri(uri: string, allowlist: string[] = []): void {
  if (!isAllowedServerUri(uri, allowlist)) {
    throw new DisallowedServerUriError(
      `Action-server URI is not allowed: "${uri}". It must be http(s) and loopback, or listed in the trusted action-server allow-list.`,
    );
  }
}

/** Lightweight parseable + http(s)-scheme check (used by the validators). */
export function hasValidServerUriScheme(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
