// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import DOMPurify from 'dompurify';

/**
 * Sanitize HTML before rendering it via dangerouslySetInnerHTML. Mirrors the
 * Editor's allow-list (TrajectoryEditor/src/lib/sanitize-html.ts): only safe
 * formatting tags plus the `data-param-chip` attribute used by rich-text chips.
 * The Runtime opens untrusted author packages, so this MUST wrap any author HTML.
 */
export function sanitizeHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'span',
      'strong',
      'em',
      'u',
      's',
      'sub',
      'sup',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'a',
      'img',
      'hr',
      'div',
    ],
    ALLOWED_ATTR: [
      'style',
      'class',
      'href',
      'target',
      'rel',
      'src',
      'alt',
      'width',
      'height',
      'data-param-chip',
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['data-param-chip'],
  });
}
