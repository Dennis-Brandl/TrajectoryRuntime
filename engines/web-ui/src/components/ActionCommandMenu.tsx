// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useState, useRef, useEffect, useCallback } from 'react';
import type { ActionProxyController, ControllerSnapshot } from '../actionProxy/ActionProxyController.js';
import { commandsForState } from '../actionProxy/stateMapping.js';
import type { ActionCommand } from '../actionProxy/types.js';
import styles from './ActionCommandMenu.module.css';

interface Props {
  controller: ActionProxyController;
  snapshot: ControllerSnapshot;
}

export function ActionCommandMenu({ controller, snapshot }: Props) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  const allowed: ActionCommand[] = snapshot.serverState
    ? commandsForState(snapshot.serverState, snapshot.supportedCommands, snapshot.visibility)
    : [];

  const handle = useCallback(async (cmd: ActionCommand) => {
    setOpen(false);
    try {
      await controller.sendCommand(cmd);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      const msg = err.code === 'INVALID_STATE_TRANSITION'
        ? `Cannot ${cmd} while ${snapshot.serverState}`
        : err.message ?? 'Command failed';
      setToast(msg);
      setTimeout(() => setToast(null), 3000);
    }
  }, [controller, snapshot.serverState]);

  return (
    <div className={styles.container} ref={ref}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(o => !o)}
        disabled={snapshot.commandInFlight !== null}
        aria-label="Action commands"
      >
        {snapshot.commandInFlight ? '…' : '⋮'}
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {allowed.length === 0 ? (
            <div className={styles.empty}>No commands available</div>
          ) : (
            allowed.map(cmd => (
              <button key={cmd} className={styles.item} role="menuitem" onClick={() => handle(cmd)}>
                {cmd}
              </button>
            ))
          )}
        </div>
      )}
      {toast && (
        <div role="status" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff3cd', border: '1px solid #ffeeba', padding: '6px 10px', borderRadius: 4, fontSize: 13, whiteSpace: 'nowrap', zIndex: 11 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
