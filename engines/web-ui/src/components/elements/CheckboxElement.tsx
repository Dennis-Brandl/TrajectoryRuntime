// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useMemo } from 'react';
import type { ElementProps } from './registry';
import type { FormElementCheckbox } from '@engine/types.js';
import { resolveOptions } from './resolveOptions';

// Editor's CheckboxRenderer paints a vertical stack: optional label, then one
// row per option with a 14x14 square outline + the option label. The runtime
// keeps the same vertical layout but swaps the static square divs for real
// <input type="checkbox"> elements styled to match.
export function CheckboxElement({ element, formValues, onFormChange, inputParameters }: ElementProps) {
  const el = element as FormElementCheckbox;
  const selected = (formValues[el.fieldName] as string[]) ?? [];
  const options = useMemo(
    () => resolveOptions(el, inputParameters),
    [el.options, el.listSource, inputParameters],
  );

  const fontSize = el.fontSize ?? 13;

  const toggle = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter((v) => v !== val)
      : [...selected, val];
    onFormChange(el.fieldName, next);
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {el.label && (
        <div
          style={{
            fontSize,
            fontWeight: 600,
            color: '#374151',
            lineHeight: 1.2,
            flexShrink: 0,
            marginBottom: 2,
          }}
        >
          {el.label}
        </div>
      )}
      {options.length === 0 ? null : options.map((opt) => {
        const checked = selected.includes(opt.value);
        return (
          <label
            key={opt.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize,
              color: '#374151',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(opt.value)}
              style={{
                width: 14,
                height: 14,
                margin: 0,
                flexShrink: 0,
                accentColor: '#3b82f6',
                cursor: 'pointer',
              }}
            />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}
