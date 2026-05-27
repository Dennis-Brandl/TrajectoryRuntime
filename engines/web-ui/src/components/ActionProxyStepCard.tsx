// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useMemo } from 'react';
import type { StepInstance } from '@engine/types.js';
import { useActionProxy } from '../actionProxy/useActionProxy.js';
import { useWorkflowCoordinator } from '../coordinator/useWorkflow.js';
import { cardLabelFor } from '../actionProxy/stateMapping.js';
import { ActionCommandMenu } from './ActionCommandMenu.js';
import styles from './ActionProxyStepCard.module.css';

interface Props {
  step: StepInstance;
  inputParameters: Record<string, string>;
}

export function ActionProxyStepCard({ step, inputParameters }: Props) {
  const coordinator = useWorkflowCoordinator();
  const controller = coordinator.getActionController(step.oid);
  const snap = useActionProxy(controller);

  const inputsList = useMemo(
    () => Object.entries(inputParameters),
    [inputParameters],
  );

  const label = snap?.serverState ? cardLabelFor(snap.serverState) : 'Pending';
  const isErrored = snap?.serverState === 'ABORTED' || snap?.serverState === 'STOPPED' || snap?.serverState === 'ERRORED';
  const isHeld = snap?.serverState === 'HELD';

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{step.step.local_id}</div>
          <div className={[styles.state, isErrored && styles.errored, isHeld && styles.held].filter(Boolean).join(' ')}>
            {label}
          </div>
        </div>
        {controller && snap && (
          <ActionCommandMenu controller={controller} snapshot={snap} />
        )}
      </div>

      {snap?.visibility !== 'opaque' && inputsList.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Inputs</div>
          {inputsList.map(([k, v]) => (
            <div key={k} className={styles.row}><span>{k}</span><span>{v}</span></div>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        {snap?.instanceId ? `Instance: ${snap.instanceId}` : 'Connecting…'}
      </div>
    </div>
  );
}
