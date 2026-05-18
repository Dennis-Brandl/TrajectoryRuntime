// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { ElementProps } from './registry';
import type { FormElementDivider } from '@engine/types.js';

// Editor's DividerRenderer wraps the rule in a flex row so the line is
// centred vertically within its bounding box. We mirror that exactly.
export function DividerElement({ element }: ElementProps) {
  const el = element as FormElementDivider;
  const thickness = el.thickness ?? 1;
  const color = el.color ?? '#e2e8f0';
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          height: thickness,
          background: color,
          borderRadius: thickness > 2 ? 2 : 0,
        }}
      />
    </div>
  );
}
