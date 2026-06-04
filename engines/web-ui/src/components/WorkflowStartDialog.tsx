// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useCallback } from 'react';
import type { LoadedWorkflow } from '../manager/types';
import styles from './WorkflowStartDialog.module.css';

interface WorkflowStartDialogProps {
  workflow: LoadedWorkflow;
  onStart: (id: string, startingParams?: Record<string, string>) => void;
  onCancel: () => void;
}

export function WorkflowStartDialog({ workflow, onStart, onCancel }: WorkflowStartDialogProps) {
  const handleStart = useCallback(() => {
    onStart(workflow.id);
  }, [workflow.id, onStart]);

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.card} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>{workflow.localId}</h2>
        <p className={styles.version}>Version {workflow.version}</p>
        {workflow.spec.description && (
          <p className={styles.description}>{workflow.spec.description}</p>
        )}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.startBtn} onClick={handleStart}>Start</button>
        </div>
      </div>
    </div>
  );
}
