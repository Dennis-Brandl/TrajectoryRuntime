// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type { ElementProps } from './registry';
import type { FormElementButton } from '@engine/types.js';

// Editor's ButtonRenderer styles. We mirror them on a real <button> so the
// runtime is visually indistinguishable from the design preview but still
// fires onButtonPress when clicked.
export function ButtonElement({ element, onButtonPress, buttonsDisabled, disabledTooltip }: ElementProps) {
  const el = element as FormElementButton;
  // Editor-specific fields (color, fontSize) live on the editor's ButtonElement
  // type but are absent from the runtime's FormElementButton. Read them
  // optimistically via an `as` widen so we honour them when the spec carries them.
  const ext = el as FormElementButton & { color?: string; fontSize?: number };
  const disabled = buttonsDisabled ?? false;
  const button = (
    <button
      type="button"
      onClick={() => onButtonPress(el.outputValue)}
      disabled={disabled}
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        border: 'none',
        padding: 0,
        background: ext.color ?? '#3b82f6',
        borderRadius: 6,
        color: '#ffffff',
        fontSize: ext.fontSize ?? 14,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {el.label ?? 'Button'}
    </button>
  );
  if (disabled && disabledTooltip) {
    return (
      <span
        title={disabledTooltip}
        style={{ display: 'block', width: '100%', height: '100%' }}
      >
        {button}
      </span>
    );
  }
  return button;
}
