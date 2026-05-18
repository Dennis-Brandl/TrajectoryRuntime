// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useRef } from 'react';
import type { ActiveStepInfo, UserAction } from '@engine/types.js';
import { StepRenderer } from './StepRenderer';
import type { StepCanvasHeader } from './StepCanvas';
import styles from './ActiveStepCard.module.css';

export interface ActiveStepCardProps {
  step: ActiveStepInfo;
  onAction: (action: UserAction) => void;
  workflowId: string;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  mediaMap: Record<string, string>;
  deviceType?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';
  header?: StepCanvasHeader;
}

/** Step types that require user interaction. */
const INTERACTIVE_TYPES = new Set(['YES_NO', 'USER_INTERACTION']);

/** Step states shown as calm info cards. */
const INFO_STATES = new Set(['HELD', 'POSTED', 'RECEIVED', 'IN_PROGRESS', 'ABORTED']);

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatState(state: string): string {
  return state.replace(/_/g, ' ');
}

export function ActiveStepCard({ step, onAction, workflowId, properties, inputParameters, mediaMap, deviceType, header }: ActiveStepCardProps) {
  const { step: instance } = step;
  const { state, stepType } = instance;

  // Track timestamps for when a step first enters a given state
  const timestampMapRef = useRef<Map<string, number>>(new Map());
  const tsKey = `${instance.oid}:${state}`;
  if (!timestampMapRef.current.has(tsKey)) {
    timestampMapRef.current.set(tsKey, Date.now());
  }
  const timestamp = timestampMapRef.current.get(tsKey)!;

  const label = instance.step.description ?? stepType;
  const isInteractive = INTERACTIVE_TYPES.has(stepType);

  // 1. Interactive mode: EXECUTING + interactive step type
  if (state === 'EXECUTING' && isInteractive) {
    return (
      <div className={styles.card}>
        <StepRenderer
          step={instance}
          onAction={onAction}
          workflowId={workflowId}
          properties={properties}
          inputParameters={inputParameters}
          mediaMap={mediaMap}
          viewportOverride={deviceType}
          header={header}
        />
      </div>
    );
  }

  // 2. Disabled mode: WAITING or PAUSED with interactive step type
  if ((state === 'WAITING' || state === 'PAUSED') && isInteractive) {
    const bannerText = state === 'WAITING' ? 'Waiting...' : 'Paused';
    return (
      <div className={styles.card}>
        <div className={styles.statusBanner}>{bannerText}</div>
        <div className={styles.disabledOverlay}>
          <StepRenderer
            step={instance}
            onAction={onAction}
            workflowId={workflowId}
            properties={properties}
            inputParameters={inputParameters}
            mediaMap={mediaMap}
            viewportOverride={deviceType}
            header={header}
          />
        </div>
      </div>
    );
  }

  // 3. Info card mode: non-interactive states
  if (INFO_STATES.has(state)) {
    return (
      <div className={styles.infoCard}>
        <div className={styles.infoLabel}>{label}</div>
        <div className={styles.infoState}>{formatState(state)}</div>
        <div className={styles.infoTimestamp}>{formatTime(timestamp)}</div>
      </div>
    );
  }

  // 4. Auto-completing / processing: EXECUTING but non-interactive type
  if (state === 'EXECUTING' && !isInteractive) {
    return (
      <div className={styles.infoCard}>
        <div className={styles.infoLabel}>{label}</div>
        <div className={styles.infoState}>Processing...</div>
        <div className={styles.infoTimestamp}>{formatTime(timestamp)}</div>
      </div>
    );
  }

  // 5. Fallback for WAITING/PAUSED non-interactive steps
  if (state === 'WAITING' || state === 'PAUSED') {
    return (
      <div className={styles.infoCard}>
        <div className={styles.infoLabel}>{label}</div>
        <div className={styles.infoState}>{formatState(state)}</div>
        <div className={styles.infoTimestamp}>{formatTime(timestamp)}</div>
      </div>
    );
  }

  // Generic fallback
  return (
    <div className={styles.infoCard}>
      <div className={styles.infoLabel}>{label}</div>
      <div className={styles.infoState}>{formatState(state)}</div>
    </div>
  );
}
