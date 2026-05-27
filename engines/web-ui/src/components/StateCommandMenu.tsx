// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState, useEffect, useRef, useCallback } from 'react';
import { EllipsisVertical } from 'lucide-react';
import { useWorkflowManager } from '../manager/useWorkflowManager';
import { useCoordinatorById } from '../manager/useActiveCoordinator';
import { ConfirmDialog } from './ConfirmDialog';
import { RestartStepPicker } from './RestartStepPicker';
import styles from './StateCommandMenu.module.css';

type DestructiveAction = 'abandon' | 'restartAll';

interface StateCommandMenuProps {
  workflowId: string | null;
}

export function StateCommandMenu({ workflowId }: StateCommandMenuProps) {
  const manager = useWorkflowManager();
  const snapshot = useCoordinatorById(workflowId);
  const [open, setOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<DestructiveAction | null>(null);
  const [showRestartPicker, setShowRestartPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Command validity
  const isRunning = snapshot?.workflowState === 'RUNNING';
  const hasExecuting = snapshot?.activeSteps.some(s => s.step.state === 'EXECUTING') ?? false;
  const hasPaused = snapshot?.activeSteps.some(s => s.step.state === 'PAUSED') ?? false;

  const coordinator = workflowId ? manager.getCoordinator(workflowId) : null;
  const completedSteps = coordinator?.getCompletedSteps() ?? [];
  const canRestartFromStep = isRunning && completedSteps.length > 0;

  const canPause = isRunning && hasExecuting;
  const canResume = isRunning && hasPaused;
  const canAbandon = isRunning;
  const canRestartAll = isRunning;

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [open]);

  const handlePause = useCallback(() => {
    if (workflowId) manager.getCoordinator(workflowId)?.pauseAll();
    setOpen(false);
  }, [manager, workflowId]);

  const handleResume = useCallback(() => {
    if (workflowId) manager.getCoordinator(workflowId)?.resumeAll();
    setOpen(false);
  }, [manager, workflowId]);

  const handleAbandon = useCallback(() => {
    setConfirmAction('abandon');
    setOpen(false);
  }, []);

  const handleRestartAll = useCallback(() => {
    setConfirmAction('restartAll');
    setOpen(false);
  }, []);

  const handleRestartFromStep = useCallback(() => {
    setShowRestartPicker(true);
    setOpen(false);
  }, []);

  const handleRestartConfirm = useCallback((targetOids: string[]) => {
    coordinator?.restartToSteps(targetOids);
    setShowRestartPicker(false);
  }, [coordinator]);

  const handleConfirm = useCallback(() => {
    if (!workflowId) return;
    if (confirmAction === 'abandon') {
      void manager.getCoordinator(workflowId)?.abortWithActionCleanup();
    } else if (confirmAction === 'restartAll') {
      manager.getCoordinator(workflowId)?.restart();
    }
    setConfirmAction(null);
  }, [manager, workflowId, confirmAction]);

  const handleCancelConfirm = useCallback(() => {
    setConfirmAction(null);
  }, []);

  const toggleMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(prev => !prev);
  }, []);

  return (
    <div className={styles.menuContainer} ref={containerRef}>
      <button className={styles.dotsButton} onClick={toggleMenu} aria-label="State Commands">
        <EllipsisVertical size={20} />
      </button>
      <button className={styles.textButton} onClick={toggleMenu}>
        State Commands
      </button>

      {open && (
        <div className={styles.dropdown}>
          <button className={styles.commandBtn} disabled={!canPause} onClick={handlePause}>
            Pause
          </button>
          <button className={styles.commandBtn} disabled={!canResume} onClick={handleResume}>
            Resume
          </button>
          <button className={styles.commandBtn} disabled={!canRestartFromStep} onClick={handleRestartFromStep}>
            Restart from Step
          </button>
          <button
            className={`${styles.commandBtn} ${styles.destructive}`}
            disabled={!canAbandon}
            onClick={handleAbandon}
          >
            Abandon
          </button>
          <button
            className={`${styles.commandBtn} ${styles.destructive}`}
            disabled={!canRestartAll}
            onClick={handleRestartAll}
          >
            Restart from Beginning
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmAction === 'abandon'}
        title="Abandon Workflow?"
        message="This will stop and remove the workflow. This cannot be undone."
        confirmLabel="Abandon"
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />
      <ConfirmDialog
        open={confirmAction === 'restartAll'}
        title="Restart Workflow?"
        message="This will stop the current execution and restart from the beginning."
        confirmLabel="Restart"
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
      />

      {showRestartPicker && (
        <RestartStepPicker
          completedSteps={completedSteps}
          checkSafety={(oids) => coordinator?.checkRestartSafety(oids) ?? []}
          onConfirm={handleRestartConfirm}
          onCancel={() => setShowRestartPicker(false)}
        />
      )}
    </div>
  );
}
