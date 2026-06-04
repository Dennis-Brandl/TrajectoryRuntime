// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
/**
 * Substitute property chips in HTML content.
 * Handles two formats:
 *   1. {{PropertyName.EntryName}} — mustache-style placeholders
 *   2. <span data-param-chip="PropertyName.EntryName"></span> — Trajectory rich-text chips
 */
export function substituteChips(
  html: string,
  properties: Record<string, string>,
  inputParameters?: Record<string, string>,
): string {
  const lookup = (key: string): string | undefined => {
    // Exact match in properties or input parameters
    if (properties[key] !== undefined) return properties[key];
    if (inputParameters?.[key] !== undefined) return inputParameters[key];
    // Fallback: search properties by entry name (e.g. "NickName" matches "UserInfo.NickName")
    for (const [propKey, propVal] of Object.entries(properties)) {
      const dotIdx = propKey.lastIndexOf('.');
      if (dotIdx >= 0 && propKey.substring(dotIdx + 1) === key) return propVal;
    }
    return undefined;
  };

  // 1. Replace <span data-param-chip="KEY">...</span> with the resolved value
  let result = html.replace(
    /<span\s+data-param-chip="([^"]+)"[^>]*>.*?<\/span>/g,
    (_match, key: string) => {
      const trimmed = key.trim();
      const value = lookup(trimmed);
      return value !== undefined ? escapeHtml(value) : `{{${trimmed}}}`;
    },
  );
  // 2. Replace {{KEY}} mustache placeholders (escape the value — it may be
  //    untrusted form input or property data containing HTML).
  result = result.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimmed = key.trim();
    const value = lookup(trimmed);
    return value !== undefined ? escapeHtml(value) : `{{${trimmed}}}`;
  });
  // 3. Convert newlines to <br> so line breaks render in HTML
  result = result.replace(/\n/g, '<br />');
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
