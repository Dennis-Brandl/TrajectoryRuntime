// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type { ElementProps } from './registry';
import type { FormElementText } from '@engine/types.js';
import { substituteChips } from '../../utils/richText';
import { sanitizeHTML } from '../../utils/sanitize-html';

// Mirrors the editor's TextRenderer read-mode styling. Param chip + paragraph
// CSS rules are injected so rich-text content renders identically.
const TEXT_CHIP_CSS = `
  .bp-text-element [data-param-chip] {
    background: #dbeafe;
    border: 1px solid #93c5fd;
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 0.85em;
    color: #1e40af;
    font-family: monospace;
    white-space: nowrap;
  }
  .dark .bp-text-element [data-param-chip] {
    background: #1e3a5f;
    border-color: #3b82f6;
    color: #93c5fd;
  }
  .bp-text-element [data-param-chip]::before {
    content: attr(data-param-chip);
  }
  .bp-text-element p {
    margin: 0;
    padding: 0;
    min-height: 1em;
  }
`;

export function TextElement({ element, properties, inputParameters }: ElementProps) {
  const el = element as FormElementText;
  const ext = el as FormElementText & {
    fontWeight?: string;
    color?: string;
    align?: 'left' | 'center' | 'right';
  };
  const html = sanitizeHTML(substituteChips(el.content.content, properties, inputParameters));
  return (
    <>
      <style>{TEXT_CHIP_CSS}</style>
      <div
        className="bp-text-element"
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          padding: '4px 6px',
          overflow: 'hidden',
          userSelect: 'none',
          cursor: 'default',
          fontSize: el.fontSize ?? 16,
          fontWeight: ext.fontWeight ?? 'normal',
          color: ext.color ?? '#1e293b',
          textAlign: ext.align ?? 'left',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
