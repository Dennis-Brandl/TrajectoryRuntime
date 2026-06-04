// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useEffect, useRef } from 'react';
import type { ControllerSnapshot } from '../actionProxy/ActionProxyController.js';
import styles from './ActionLogPanel.module.css';

interface Props { snapshot: ControllerSnapshot | null; }

export function ActionLogPanel({ snapshot }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [snapshot?.logs.length]);

  if (!snapshot || snapshot.logs.length === 0) {
    return <div className={styles.empty}>No log messages.</div>;
  }
  return (
    <div className={styles.panel} ref={ref}>
      {snapshot.logs.map((l, i) => (
        <div key={i} className={[styles.entry, l.stream === 'stderr' && styles.stderr].filter(Boolean).join(' ')}>
          <span className={styles.ts}>{l.ts.substring(11, 19)}</span>{l.message}
        </div>
      ))}
    </div>
  );
}
