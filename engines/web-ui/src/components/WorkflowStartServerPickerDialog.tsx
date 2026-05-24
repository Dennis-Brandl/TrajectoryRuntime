// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState } from 'react';
import type { ActionServerSpecification } from '@engine/types.js';

export interface EnvPick {
  envLocalId: string;
  envOid: string;
  servers: ActionServerSpecification[];
}

export interface WorkflowStartServerPickerDialogProps {
  picks: EnvPick[];
  onResolved: (choices: Map<string, ActionServerSpecification>) => void;
  onCancel: () => void;
}

export function WorkflowStartServerPickerDialog({
  picks,
  onResolved,
  onCancel,
}: WorkflowStartServerPickerDialogProps) {
  const [selections, setSelections] = useState<Record<string, number>>(
    Object.fromEntries(picks.map(p => [p.envOid, 0])),
  );

  const submit = () => {
    const map = new Map<string, ActionServerSpecification>();
    for (const p of picks) {
      const idx = selections[p.envOid] ?? 0;
      map.set(p.envOid, p.servers[idx]);
    }
    onResolved(map);
  };

  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 400, maxWidth: 600 }}>
        <h2 style={{ marginTop: 0 }}>Choose Action Server</h2>
        {picks.map(p => (
          <div key={p.envOid} style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 'bold', marginBottom: 8 }}>Environment: {p.envLocalId}</p>
            {p.servers.map((s, i) => (
              <label key={i} style={{ display: 'block', marginBottom: 4 }}>
                <input
                  type="radio"
                  name={p.envOid}
                  checked={selections[p.envOid] === i}
                  onChange={() => setSelections({ ...selections, [p.envOid]: i })}
                />
                {' '}{s.name} — <code>{s.uri.trim()}</code>
                {s.description && <span style={{ color: '#666' }}> · {s.description}</span>}
              </label>
            ))}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={submit} style={{ background: '#1976d2', color: 'white' }}>Start</button>
        </div>
      </div>
    </div>
  );
}
