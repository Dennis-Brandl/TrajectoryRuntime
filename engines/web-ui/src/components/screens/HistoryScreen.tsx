// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { useWorkflowManager, useManagerSnapshot } from '../../manager/useWorkflowManager';
import type { CompletedWorkflow, LoadedWorkflow } from '../../manager/types';
import type { MasterWorkflowSpecification } from '@engine/types.js';
import { StepDetailPopup } from '../StepDetailPopup';
import styles from './HistoryScreen.module.css';

const AUTO_TYPES = new Set(['START', 'END', 'PARALLEL', 'WAIT ALL', 'WAIT ANY', 'SELECT 1', 'SELECT_1']);

interface StepEntry {
  stepOid: string;
  stepType: string;
  label: string;
  description: string;
  completedAt: number;
  state: string;
  error?: string;
  inputParameters: Record<string, string>;
  outputParameters: Record<string, string>;
}

function findStepByLocalId(
  spec: MasterWorkflowSpecification,
  localId: string,
): { script_config?: { source?: string } } | undefined {
  for (const step of spec.steps) {
    if (step.local_id === localId) return step;
  }
  const children = spec.children ?? [];
  for (const child of children) {
    const found = findStepByLocalId(child as MasterWorkflowSpecification, localId);
    if (found) return found;
  }
  return undefined;
}

function findScriptSource(loaded: LoadedWorkflow | undefined, localId: string): string | undefined {
  if (!loaded) return undefined;
  return findStepByLocalId(loaded.spec, localId)?.script_config?.source;
}

/** Exact wall-clock time with millisecond resolution — used for debugging step timing. */
function formatExactTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

/** Date + exact time for workflow-finished timestamps. */
function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date} ${formatExactTime(ts)}`;
}

/** Human-friendly label for a trace state. */
function stateLabel(state: string): string {
  switch (state) {
    case 'EXECUTING': return 'Started';
    case 'STARTING': return 'Starting';
    case 'COMPLETING': return 'Completing';
    case 'COMPLETED': return 'Completed';
    case 'ERRORED': return 'Errored';
    case 'PAUSED': return 'Paused';
    case 'ABORTED': return 'Aborted';
    case 'WAITING': return 'Waiting';
    default: return state;
  }
}

function stateColor(state: string): string {
  if (state === 'COMPLETED') return 'completed';
  if (state === 'ERRORED') return 'errored';
  return 'stopped';
}

function buildStepEntries(wf: CompletedWorkflow): StepEntry[] {
  const entries: StepEntry[] = [];
  for (const trace of wf.trace) {
    if (trace.state !== 'COMPLETED' && trace.state !== 'EXECUTING' && trace.state !== 'ERRORED') continue;
    const params = wf.stepParams?.[trace.step_oid];
    if (!params) continue;
    if (AUTO_TYPES.has(params.stepType)) continue;
    entries.push({
      stepOid: trace.step_oid,
      stepType: params.stepType,
      label: params.label || trace.step_oid,
      description: params.description || params.label || trace.step_oid,
      completedAt: trace.timestamp ?? wf.finishedAt,
      state: trace.state,
      error: trace.error,
      inputParameters: params.inputParameters,
      outputParameters: params.outputParameters,
    });
  }
  // Oldest on top — chronological reading of step execution.
  // Per v2.0 Phase 7 design: "list in time order (oldest on top), scrolled to bottom".
  entries.sort((a, b) => a.completedAt - b.completedAt);
  return entries;
}

export function HistoryScreen() {
  const manager = useWorkflowManager();
  const snapshot = useManagerSnapshot();
  const [selectedWfId, setSelectedWfId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<StepEntry | null>(null);

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm('Delete this completed workflow?')) return;
    manager.removeCompletedWorkflow(id);
    if (selectedWfId === id) setSelectedWfId(null);
  }, [manager, selectedWfId]);

  const workflows = useMemo(() => {
    return [...snapshot.completed].sort((a, b) => b.finishedAt - a.finishedAt);
  }, [snapshot.completed]);

  const selectedWf = useMemo(() => {
    if (!selectedWfId) return null;
    return workflows.find(w => w.id === selectedWfId) ?? null;
  }, [workflows, selectedWfId]);

  const stepEntries = useMemo(() => {
    if (!selectedWf) return [];
    return buildStepEntries(selectedWf);
  }, [selectedWf]);

  const selectedLoaded = useMemo(() => {
    if (!selectedWf) return undefined;
    return snapshot.loaded.find(w => w.id === selectedWf.sourceSpecId);
  }, [selectedWf, snapshot.loaded]);

  const selectedScriptSource = useMemo(() => {
    if (!selectedStep || selectedStep.stepType !== 'SCRIPT') return undefined;
    return findScriptSource(selectedLoaded, selectedStep.label);
  }, [selectedStep, selectedLoaded]);

  // Step detail view
  if (selectedWf) {
    return (
      <div className={styles.screen}>
        <button className={styles.backButton} onClick={() => setSelectedWfId(null)}>
          <ChevronLeft size={18} />
          <span>History</span>
        </button>

        <div className={styles.wfHeader}>
          <div className={styles.wfHeaderName}>{selectedWf.localId}</div>
          <div className={styles.wfHeaderMeta}>
            <span className={`${styles.stateBadge} ${styles[stateColor(selectedWf.finalState)]}`}>
              {selectedWf.finalState}
            </span>
            <span className={styles.wfHeaderTime}>{formatDateTime(selectedWf.finishedAt)}</span>
          </div>
        </div>

        {stepEntries.length > 0 ? (
          <ul className={styles.list}>
            {stepEntries.map((entry, i) => (
              <li key={`${entry.stepOid}-${entry.state}-${i}`} className={styles.stepItem} onClick={() => setSelectedStep(entry)}>
                <div className={styles.stepInfo}>
                  <div className={styles.stepType}>
                    {entry.stepType}
                    {entry.state === 'ERRORED' && (
                      <span className={`${styles.stateBadge} ${styles.errored} ${styles.stepStateBadge}`}>ERRORED</span>
                    )}
                  </div>
                  <div className={styles.stepDesc}>
                    {entry.label}
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#888' }}>· {stateLabel(entry.state)}</span>
                  </div>
                </div>
                <span className={styles.stepTime} style={{ fontFamily: 'monospace' }}>{formatExactTime(entry.completedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No recorded steps</p>
        )}

        {selectedStep && (
          <StepDetailPopup
            stepOid={selectedStep.stepOid}
            stepType={selectedStep.stepType}
            description={selectedStep.description}
            completedAt={selectedStep.completedAt}
            state={selectedStep.state}
            error={selectedStep.error}
            scriptSource={selectedScriptSource}
            inputParameters={selectedStep.inputParameters}
            outputParameters={selectedStep.outputParameters}
            onClose={() => setSelectedStep(null)}
          />
        )}
      </div>
    );
  }

  // Workflow list view
  return (
    <div className={styles.screen}>
      {workflows.length > 0 ? (
        <ul className={styles.list}>
          {workflows.map(wf => {
            const stepCount = buildStepEntries(wf).length;
            return (
              <li key={wf.id} className={styles.wfItem} onClick={() => setSelectedWfId(wf.id)}>
                <div className={styles.wfInfo}>
                  <div className={styles.wfName}>{wf.localId}</div>
                  <div className={styles.wfMeta}>
                    <span className={`${styles.stateBadge} ${styles[stateColor(wf.finalState)]}`}>
                      {wf.finalState}
                    </span>
                    <span className={styles.wfStepCount}>
                      {stepCount} step{stepCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <span className={styles.wfTime} style={{ fontFamily: 'monospace' }}>{formatDateTime(wf.finishedAt)}</span>
                <button
                  className={styles.deleteButton}
                  title="Delete workflow"
                  onClick={(e) => { e.stopPropagation(); handleDelete(wf.id); }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>No completed workflows</p>
      )}
    </div>
  );
}
