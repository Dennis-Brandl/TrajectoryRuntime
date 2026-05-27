// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState } from 'react';
import type { ActionServerSpecification } from '@engine/types.js';
import styles from './ActionServerPicker.module.css';

interface Props {
  environmentName: string;
  servers: ActionServerSpecification[];
  onUse: (uri: string) => void;
  onAbandon: () => void;
}

function isValidUrl(s: string): boolean {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

export function ActionServerPicker({ environmentName, servers, onUse, onAbandon }: Props) {
  const [selected, setSelected] = useState<string | null>(servers[0]?.uri ?? null);
  const [adhoc, setAdhoc] = useState<string>('');
  const [touched, setTouched] = useState(false);

  if (servers.length === 0) {
    const valid = adhoc.length === 0 || isValidUrl(adhoc);
    return (
      <div className={styles.backdrop} role="dialog" aria-modal="true">
        <div className={styles.dialog}>
          <div className={styles.title}>Pick an action server</div>
          <div className={styles.subtitle}>
            Environment <strong>{environmentName}</strong> has no registered action servers.
            Enter a server URI to continue.
          </div>
          <input
            className={styles.uriInput}
            placeholder="http://localhost:3002"
            value={adhoc}
            onChange={e => setAdhoc(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-label="Server URI"
          />
          {touched && !valid && <div className={styles.uriError}>Enter a valid http(s) URL.</div>}
          <div className={styles.actions}>
            <button className={styles.secondary} onClick={onAbandon}>Abandon workflow</button>
            <button className={styles.primary} onClick={() => onUse(adhoc)} disabled={!isValidUrl(adhoc)}>Connect</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.dialog}>
        <div className={styles.title}>Pick an action server</div>
        <div className={styles.subtitle}>
          Environment <strong>{environmentName}</strong> has multiple registered servers.
          Choose one to use for this workflow.
        </div>
        <div className={styles.serverList}>
          {servers.map(s => (
            <label key={s.uri} className={styles.serverOption}>
              <input
                type="radio"
                name="server"
                value={s.uri}
                checked={selected === s.uri}
                onChange={() => setSelected(s.uri)}
              />
              <div>
                <div className={styles.serverName}>{s.name}</div>
                <div className={styles.serverUri}>{s.uri}</div>
                {s.description && <div className={styles.serverDesc}>{s.description}</div>}
              </div>
            </label>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.secondary} onClick={onAbandon}>Abandon workflow</button>
          <button className={styles.primary} onClick={() => selected && onUse(selected)} disabled={!selected}>Use</button>
        </div>
      </div>
    </div>
  );
}
