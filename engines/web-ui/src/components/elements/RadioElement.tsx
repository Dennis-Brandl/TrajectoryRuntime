// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useMemo } from 'react';
import type { ElementProps } from './registry';
import type { FormElementRadio } from '@engine/types.js';
import { resolveOptions } from './resolveOptions';

// Editor's RadioRenderer mirrors CheckboxRenderer but uses a circle outline
// per option. The runtime swaps the static circle divs for real
// <input type="radio"> elements, sharing a name so only one is selectable.
export function RadioElement({ element, formValues, onFormChange, inputParameters }: ElementProps) {
  const el = element as FormElementRadio;
  const value = (formValues[el.fieldName] as string) ?? '';
  const options = useMemo(
    () => resolveOptions(el, inputParameters),
    [el.options, el.listSource, inputParameters],
  );

  const fontSize = el.fontSize ?? 13;

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
      {options.length === 0 ? null : options.map((opt) => (
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
            type="radio"
            name={el.fieldName}
            checked={value === opt.value}
            onChange={() => onFormChange(el.fieldName, opt.value)}
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
      ))}
    </div>
  );
}
