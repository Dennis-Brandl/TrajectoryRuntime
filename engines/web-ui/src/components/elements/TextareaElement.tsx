// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type { CSSProperties } from 'react';
import type { ElementProps } from './registry';
import type { FormElementTextarea } from '@engine/types.js';
import { resolveDefaultValue } from '@engine/properties.js';

// Editor's TextareaRenderer shows a label (12px / 500w) above a bordered
// rect containing the placeholder. Runtime keeps the same chrome but swaps
// the inner rect for a real <textarea> bound to the form value.
export function TextareaElement({ element, formValues, onFormChange, properties, inputParameters }: ElementProps) {
  const el = element as FormElementTextarea;
  const value = (formValues[el.fieldName] as string) ?? '';
  const placeholder =
    resolveDefaultValue(el.placeholderSource, properties, inputParameters) || el.placeholder || 'Enter text...';

  const containerStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    padding: '4px 6px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    userSelect: 'none',
    position: 'relative',
  };

  const labelStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
    lineHeight: 1.2,
    flexShrink: 0,
  };

  const textareaStyle: CSSProperties = {
    width: '100%',
    flexGrow: 1,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 14,
    color: '#111827',
    background: '#ffffff',
    boxSizing: 'border-box',
    resize: 'none',
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.3,
  };

  return (
    <div style={containerStyle}>
      {el.label && <label style={labelStyle}>{el.label}</label>}
      <textarea
        placeholder={placeholder}
        rows={el.rows ?? 3}
        value={value}
        onChange={(e) => onFormChange(el.fieldName, e.target.value)}
        required={el.required}
        style={textareaStyle}
      />
    </div>
  );
}
