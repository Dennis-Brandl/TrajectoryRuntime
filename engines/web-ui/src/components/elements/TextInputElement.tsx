// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useMemo, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ElementProps } from './registry';
import type { FormElementTextInput, ListItem } from '@engine/types.js';
import { resolveDefaultValue } from '@engine/properties.js';

/** Mode-specific placeholder defaults (mirrors editor TextInputRenderer). */
const MODE_PLACEHOLDERS: Record<string, string> = {
  text: 'Enter text...',
  number: '0',
  phone: '(555) 123-4567',
  password: '••••••••',
  dropdown: 'Select...',
  combobox: 'Select or type...',
};

/** Resolve the list items for dropdown/combobox modes. */
function resolveListItems(
  el: FormElementTextInput,
  inputParameters: Record<string, string>,
): ListItem[] {
  const source = el.listSource;
  if (!source || source.mode === 'static') {
    return el.listItems ?? [];
  }
  const paramName = source.value ?? '';
  const raw = inputParameters[paramName];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: unknown): ListItem => {
      if (typeof item === 'string') return { label: item, value: item };
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.label === 'string') {
          return { label: obj.label, value: typeof obj.value === 'string' ? obj.value : obj.label };
        }
        if (typeof obj.name === 'string') {
          return { label: obj.name, value: typeof obj.value === 'string' ? obj.value : obj.name };
        }
      }
      return { label: String(item), value: String(item) };
    });
  } catch {
    return [];
  }
}

export function TextInputElement({ element, formValues, onFormChange, properties, inputParameters }: ElementProps) {
  const el = element as FormElementTextInput;
  const ext = el as FormElementTextInput & { fontSize?: number };
  const value = (formValues[el.fieldName] as string) ?? '';
  const resolvedPlaceholder =
    resolveDefaultValue(el.placeholderSource, properties, inputParameters) || el.placeholder || '';
  const mode = el.inputMode ?? 'text';
  const fontSize = ext.fontSize ?? 14;
  const labelFontSize = Math.round(fontSize * 0.85);
  const placeholderText = resolvedPlaceholder || MODE_PLACEHOLDERS[mode] || 'Enter text...';

  const items = useMemo(
    () => resolveListItems(el, inputParameters),
    [el.listItems, el.listSource, inputParameters],
  );

  const containerStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    padding: '4px 6px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 4,
    userSelect: 'none',
    position: 'relative',
  };

  const labelStyle: CSSProperties = {
    fontSize: labelFontSize,
    fontWeight: 500,
    color: '#374151',
    lineHeight: 1.2,
    flexShrink: 0,
  };

  // Common control styling — matches the editor's faux-input <div>.
  const controlStyle: CSSProperties = {
    width: '100%',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize,
    color: '#111827',
    background: '#ffffff',
    boxSizing: 'border-box',
    flexGrow: 1,
    outline: 'none',
    fontFamily: 'inherit',
  };

  if (mode === 'dropdown') {
    return (
      <div style={containerStyle}>
        {el.label && <label style={labelStyle}>{el.label}</label>}
        <div style={{ position: 'relative', flexGrow: 1, display: 'flex' }}>
          <select
            value={value}
            onChange={(e) => onFormChange(el.fieldName, e.target.value)}
            required={el.required}
            style={{
              ...controlStyle,
              appearance: 'none',
              WebkitAppearance: 'none',
              paddingRight: 26,
              color: value ? '#111827' : '#9ca3af',
              cursor: 'pointer',
            }}
          >
            <option value="" disabled hidden>{placeholderText}</option>
            {items.map((item) => (
              <option key={item.value} value={item.value} style={{ color: '#111827' }}>
                {item.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            color="#9ca3af"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
        </div>
      </div>
    );
  }

  if (mode === 'combobox') {
    const listId = `dl-${el.fieldName}`;
    return (
      <div style={containerStyle}>
        {el.label && <label style={labelStyle}>{el.label}</label>}
        <div style={{ position: 'relative', flexGrow: 1, display: 'flex' }}>
          <input
            type="text"
            list={listId}
            placeholder={placeholderText}
            value={value}
            onChange={(e) => onFormChange(el.fieldName, e.target.value)}
            required={el.required}
            style={{ ...controlStyle, paddingRight: 26 }}
          />
          <ChevronDown
            size={14}
            color="#9ca3af"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <datalist id={listId}>
            {items.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </datalist>
        </div>
      </div>
    );
  }

  // text, number, phone, password
  let inputType = 'text';
  let inputModeAttr: string | undefined;
  let allowedChars: RegExp | undefined;

  switch (mode) {
    case 'number':
      inputModeAttr = 'numeric';
      allowedChars = /[^0-9+\-.,]/g;
      break;
    case 'phone':
      inputType = 'tel';
      allowedChars = /[^0-9+\-() ]/g;
      break;
    case 'password':
      inputType = 'password';
      break;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    if (allowedChars) v = v.replace(allowedChars, '');
    onFormChange(el.fieldName, v);
  };

  return (
    <div style={containerStyle}>
      {el.label && <label style={labelStyle}>{el.label}</label>}
      <input
        type={inputType}
        inputMode={inputModeAttr as React.HTMLAttributes<HTMLInputElement>['inputMode']}
        placeholder={placeholderText}
        value={value}
        onChange={handleChange}
        required={el.required}
        style={controlStyle}
      />
    </div>
  );
}
