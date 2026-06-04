// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CompletedStepInfo } from '@engine/types.js';
import styles from './RepeatStepPicker.module.css';

interface RestartStepPickerProps {
  completedSteps: CompletedStepInfo[];
  checkSafety: (oids: string[]) => string[];
  onConfirm: (targetOids: string[]) => void;
  onCancel: () => void;
}

export function RestartStepPicker({ completedSteps, checkSafety, onConfirm, onCancel }: RestartStepPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const warnings = useMemo(() => {
    if (selected.size === 0) return [];
    return checkSafety([...selected]);
  }, [selected, checkSafety]);

  const stepsWithWarnings = useMemo(() => {
    const warnedOids = new Set<string>();
    for (const step of completedSteps) {
      const stepWarnings = checkSafety([step.oid]);
      if (stepWarnings.length > 0) warnedOids.add(step.oid);
    }
    return warnedOids;
  }, [completedSteps, checkSafety]);

  const toggle = (oid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(oid)) next.delete(oid);
      else next.add(oid);
      return next;
    });
  };

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>Restart from Step</h3>

        {warnings.length > 0 && (
          <div className={styles.warningBanner}>
            {warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}

        <ul className={styles.list}>
          {completedSteps.map(step => (
            <li key={step.oid} className={styles.item} onClick={() => toggle(step.oid)}>
              <input
                type="checkbox"
                className={styles.itemCheckbox}
                checked={selected.has(step.oid)}
                onChange={() => toggle(step.oid)}
              />
              <div className={styles.itemInfo}>
                <div className={styles.itemName}>{step.localId}</div>
                <div className={styles.itemTime}>{new Date(step.completedAt).toLocaleString()}</div>
              </div>
              {stepsWithWarnings.has(step.oid) && (
                <AlertTriangle size={16} className={styles.warningBadge} />
              )}
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <button className={styles.cancelButton} onClick={onCancel}>Cancel</button>
          <button
            className={styles.confirmButton}
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            Confirm Restart
          </button>
        </div>
      </div>
    </div>
  );
}
