// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type { ElementProps } from './registry';
import type { FormElementHeader } from '@engine/types.js';
import { substituteChips } from '../../utils/richText';
import { sanitizeHTML } from '../../utils/sanitize-html';

// Inline styles mirror the editor's HeaderRenderer read-mode output.
// Param chips and paragraph rules come from the editor's PARAM_CHIP_CSS so
// rich-text content (with [data-param-chip] spans and <p> tags) renders the
// same way at runtime.
const HEADER_CHIP_CSS = `
  .bp-header-element [data-param-chip] {
    background: #dbeafe;
    border: 1px solid #93c5fd;
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 0.85em;
    color: #1e40af;
    font-family: monospace;
    white-space: nowrap;
  }
  .dark .bp-header-element [data-param-chip] {
    background: #1e3a5f;
    border-color: #3b82f6;
    color: #93c5fd;
  }
  .bp-header-element [data-param-chip]::before {
    content: attr(data-param-chip);
  }
  .bp-header-element p {
    margin: 0;
    padding: 0;
    min-height: 1em;
  }
`;

export function HeaderElement({ element, properties, inputParameters }: ElementProps) {
  const el = element as FormElementHeader;
  const ext = el as FormElementHeader & {
    fontWeight?: string;
    color?: string;
    align?: 'left' | 'center' | 'right';
  };
  const html = sanitizeHTML(substituteChips(el.content.content, properties, inputParameters));
  return (
    <>
      <style>{HEADER_CHIP_CSS}</style>
      <div
        className="bp-header-element"
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          padding: '4px 6px',
          overflow: 'hidden',
          userSelect: 'none',
          cursor: 'default',
          fontSize: el.fontSize ?? 24,
          fontWeight: ext.fontWeight ?? 'bold',
          color: ext.color ?? '#1e293b',
          textAlign: ext.align ?? 'left',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
