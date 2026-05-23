// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Upload, Trash2, QrCode } from 'lucide-react';
import { processWorkflowFile, isProcessingError } from '../../manager/fileProcessing';
import { useWorkflowManager, useManagerSnapshot } from '../../manager/useWorkflowManager';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { WorkflowStartDialog } from '../WorkflowStartDialog';
import { ActionServerPicker } from '../ActionServerPicker';
import { useServerBindings } from '../../actionProxy/useServerBindings';
import type { HomeMenuAction } from '../shell/homeMenuTypes';
import type { LoadedWorkflow, CompletedWorkflow } from '../../manager/types';
import type { ResourceSnapshotEntry } from '@engine/types.js';
import styles from './HomeScreen.module.css';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface HomeScreenProps {
  onNavigateToActive: () => void;
  menuAction?: HomeMenuAction | null;
  onMenuActionHandled?: () => void;
}

export function HomeScreen({ onNavigateToActive, menuAction, onMenuActionHandled }: HomeScreenProps) {
  const manager = useWorkflowManager();
  const snapshot = useManagerSnapshot();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTarget, setStartTarget] = useState<LoadedWorkflow | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const touchStartX = useRef(0);
  /** instanceId of the workflow that has been prepared but not yet started (picker flow). */
  const [pendingInstanceId, setPendingInstanceId] = useState<string | null>(null);
  const { state: bindingsState, begin: bindingsBegin, selectServer: bindingsSelectServer, resolveConflict, abandon: bindingsAbandon, reset: bindingsReset } = useServerBindings();

  // Delete confirmation settings
  const [confirmDeleteLoaded] = useLocalStorage('trajectory-confirm-delete-loaded', true);
  const [confirmDeleteCompleted] = useLocalStorage('trajectory-confirm-delete-completed', false);

  // Sort and display state
  const [sortMode, setSortMode] = useState<'name' | 'date'>('date');
  const [showValueProps, setShowValueProps] = useState(false);
  const [showEnvProps, setShowEnvProps] = useState(false);

  const loaded = snapshot.loaded;
  const active = snapshot.active;
  const completed = snapshot.completed;

  // Sort loaded workflows
  const sortedLoaded = [...loaded].sort((a, b) => {
    if (sortMode === 'name') return a.localId.localeCompare(b.localId);
    return b.loadedAt - a.loadedAt; // most recent first
  });

  // Handle menu actions from TitleBar
  useEffect(() => {
    if (!menuAction) return;
    switch (menuAction) {
      case 'sort-name': setSortMode('name'); break;
      case 'sort-date': setSortMode('date'); break;
      case 'show-value-props': setShowValueProps(true); break;
      case 'show-env-props': setShowEnvProps(true); break;
    }
    onMenuActionHandled?.();
  }, [menuAction, onMenuActionHandled]);

  const handleFiles = useCallback(
    async (files: FileList) => {
      for (const file of files) {
        const result = await processWorkflowFile(file);
        if (isProcessingError(result)) {
          setError(result.error + (result.details ? `: ${result.details}` : ''));
          return;
        }
        const addResult = manager.addWorkflow(result.workflow, result.mediaMap, result.environments);
        if ('duplicateId' in addResult) {
          setError('This workflow is already loaded');
          return;
        }
      }
      setError(null);
    },
    [manager],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleFiles],
  );

  const handleLoadClick = useCallback(() => { fileInputRef.current?.click(); }, []);

  // Desktop-only drag and drop
  const [dragOver, setDragOver] = useState(false);
  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleWorkflowClick = useCallback((wf: LoadedWorkflow) => {
    setStartTarget(wf);
  }, []);

  const handleStartConfirm = useCallback((id: string, startingParams?: Record<string, string>) => {
    setStartTarget(null);
    const instanceId = manager.prepareWorkflow(id, startingParams);
    if (!instanceId) return;
    const coordinator = manager.getCoordinator(instanceId);
    const envs = coordinator?.envsNeedingBinding() ?? [];
    if (envs.length === 0) {
      manager.runWorkflow(instanceId);
      onNavigateToActive();
    } else {
      setPendingInstanceId(instanceId);
      bindingsBegin(envs);
    }
  }, [manager, onNavigateToActive, bindingsBegin]);

  const handleStartCancel = useCallback(() => { setStartTarget(null); }, []);

  // React to binding phase transitions
  useEffect(() => {
    if (!pendingInstanceId) return;
    if (bindingsState.phase === 'done') {
      const coordinator = manager.getCoordinator(pendingInstanceId);
      if (coordinator) {
        coordinator.setServerBindings(
          pendingInstanceId,
          bindingsState.result.bindings,
          bindingsState.result.capabilities,
        );
      }
      manager.runWorkflow(pendingInstanceId);
      setPendingInstanceId(null);
      bindingsReset();
      onNavigateToActive();
    } else if (bindingsState.phase === 'abandoned') {
      // User declined — abort the prepared (but not yet started) workflow
      const coordinator = manager.getCoordinator(pendingInstanceId);
      coordinator?.abort();
      setPendingInstanceId(null);
      bindingsReset();
    }
  }, [bindingsState.phase, pendingInstanceId, manager, onNavigateToActive, bindingsReset]);

  const handleActiveWorkflowClick = useCallback((wfId: string) => {
    manager.focusWorkflow(wfId);
    onNavigateToActive();
  }, [manager, onNavigateToActive]);

  // Swipe-to-delete handlers (shared for loaded + completed)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent, id: string) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -80) {
      setSwipedId(id);
    } else if (dx > 40 && swipedId === id) {
      setSwipedId(null);
    }
  }, [swipedId]);

  // Delete loaded workflow (with optional confirmation)
  const handleDeleteLoaded = useCallback((id: string) => {
    if (confirmDeleteLoaded && !window.confirm('Delete this loaded workflow?')) return;
    manager.removeLoadedWorkflow(id);
    setSwipedId(null);
  }, [manager, confirmDeleteLoaded]);

  // Delete completed workflow (with optional confirmation)
  const handleDeleteCompleted = useCallback((id: string) => {
    if (confirmDeleteCompleted && !window.confirm('Delete this completed workflow?')) return;
    manager.removeCompletedWorkflow(id);
    setSwipedId(null);
  }, [manager, confirmDeleteCompleted]);

  useEffect(() => {
    if (!swipedId) return;
    const handler = () => setSwipedId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [swipedId]);

  const handleClearCompleted = useCallback(() => {
    manager.clearCompleted();
  }, [manager]);

  // Gather active workflow properties
  function getActiveProperties(): Record<string, string> {
    const props: Record<string, string> = {};
    for (const wf of active) {
      const coord = manager.getCoordinator(wf.id);
      if (coord) {
        Object.assign(props, coord.getSnapshot().properties);
      }
    }
    return props;
  }

  // Gather resource snapshots from active workflows
  function getActiveResources(): ResourceSnapshotEntry[] {
    const resources: ResourceSnapshotEntry[] = [];
    for (const wf of active) {
      const coord = manager.getCoordinator(wf.id);
      if (coord) {
        resources.push(...coord.getSnapshot().resources);
      }
    }
    return resources;
  }

  // Gather environment properties from loaded workflows
  function getEnvironmentProperties(): Record<string, string> {
    const props: Record<string, string> = {};
    for (const wf of loaded) {
      for (const env of wf.environments) {
        for (const envSpec of env.environment_specifications) {
          if (envSpec.value_property_specifications) {
            for (const spec of envSpec.value_property_specifications) {
              for (const entry of spec.entries) {
                props[`${spec.name}.${entry.name}`] = entry.value;
              }
            }
          }
          if (envSpec.resource_property_specifications) {
            for (const rps of envSpec.resource_property_specifications) {
              props[`${rps.name} (${rps.resource_type})`] = rps.names?.join(', ') ?? '';
            }
          }
        }
      }
    }
    return props;
  }

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <button className={styles.loadButton} onClick={handleLoadClick}>
          <Plus size={16} />
          Load Workflow
        </button>
        <button className={styles.loadButton} onClick={() => { /* placeholder */ }} disabled>
          <QrCode size={16} />
          Scan QR Code
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".WFmasterX,.json,.WFmaster"
          className={styles.hiddenInput}
          onChange={handleFileInputChange}
        />
      </div>

      {/* Desktop-only drop zone */}
      <div
        className={`${styles.dropZone}${dragOver ? ` ${styles.dropZoneDragOver}` : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload size={20} className={styles.dropIcon} />
        <span>Drop .WFmasterX or .json file here</span>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Loaded Workflows Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionHeader}>Loaded Workflows</h3>
        {sortedLoaded.length > 0 ? (
          <ul className={styles.workflowList}>
            {sortedLoaded.map(wf => (
              <li key={wf.id} className={styles.swipeContainer}>
                <div className={styles.swipeDeleteZone} onClick={(e) => { e.stopPropagation(); handleDeleteLoaded(wf.id); }}>
                  <Trash2 size={20} className={styles.swipeDeleteIcon} />
                </div>
                <div
                  className={`${styles.swipeContent}${swipedId === wf.id ? ` ${styles.swiped}` : ''}`}
                  onClick={() => !swipedId && handleWorkflowClick(wf)}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={(e) => handleSwipeTouchEnd(e, wf.id)}
                >
                  <div className={styles.workflowItem}>
                    <span className={styles.workflowName}>
                      {wf.localId} <span className={styles.workflowVersion}>v{wf.version}</span>
                    </span>
                    <button
                      className={styles.deleteButton}
                      title="Remove workflow"
                      onClick={(e) => { e.stopPropagation(); handleDeleteLoaded(wf.id); }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptySection}>No workflows loaded</p>
        )}
      </div>

      {/* Active Workflows Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionHeader}>Active Workflows</h3>
        {active.length > 0 ? (
          <ul className={styles.workflowList}>
            {active.map(wf => (
              <li key={wf.id} className={styles.workflowItem} onClick={() => handleActiveWorkflowClick(wf.id)}>
                <span className={styles.workflowName}>
                  {wf.localId}{wf.instanceNumber != null ? ` (${wf.instanceNumber})` : ''} <span className={styles.workflowVersion}>v{wf.version}</span>
                </span>
                <span className={styles.runningBadge}>Running</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptySection}>No active workflows</p>
        )}
      </div>

      {/* Completed Workflows Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h3 className={styles.sectionHeader}>Completed</h3>
          {completed.length > 0 && (
            <button className={styles.clearButton} onClick={handleClearCompleted}>Clear all</button>
          )}
        </div>
        {completed.length > 0 ? (
          <ul className={styles.workflowList}>
            {completed.map(wf => (
              <li key={wf.id} className={styles.swipeContainer}>
                <div className={styles.swipeDeleteZone} onClick={(e) => { e.stopPropagation(); handleDeleteCompleted(wf.id); }}>
                  <Trash2 size={20} className={styles.swipeDeleteIcon} />
                </div>
                <div
                  className={`${styles.swipeContent}${swipedId === wf.id ? ` ${styles.swiped}` : ''}`}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={(e) => handleSwipeTouchEnd(e, wf.id)}
                >
                  <div className={styles.workflowItem}>
                    <span className={styles.workflowName}>
                      {wf.localId} <span className={styles.workflowVersion}>v{wf.version}</span>
                    </span>
                    <span className={styles.completedTime}>{formatTime(wf.finishedAt)}</span>
                    <span className={styles.completedBadge} data-state={wf.finalState}>
                      {wf.finalState}
                    </span>
                    <button
                      className={`${styles.deleteButton} ${styles.deleteButtonHoverOnly}`}
                      title="Delete completed workflow"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCompleted(wf.id); }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptySection}>No completed workflows</p>
        )}
      </div>

      {startTarget && (
        <WorkflowStartDialog
          workflow={startTarget}
          onStart={handleStartConfirm}
          onCancel={handleStartCancel}
        />
      )}

      {bindingsState.phase === 'picking' && (() => {
        const env = bindingsState.envs[bindingsState.envIndex];
        return (
          <ActionServerPicker
            environmentName={env.local_id}
            servers={env.action_server_specifications ?? []}
            onUse={bindingsSelectServer}
            onAbandon={bindingsAbandon}
          />
        );
      })()}

      {bindingsState.phase === 'fetching-capabilities' && (
        <div className={styles.pickerOverlay}>
          <div className={styles.pickerStatus}>Connecting to {bindingsState.envName}&hellip;</div>
        </div>
      )}

      {bindingsState.phase === 'error' && (
        <div className={styles.pickerOverlay}>
          <div className={styles.pickerError}>
            <p>Could not connect to <strong>{bindingsState.envName}</strong>: {bindingsState.message}</p>
            <button className={styles.pickerErrorBtn} onClick={bindingsAbandon}>Cancel</button>
          </div>
        </div>
      )}

      {bindingsState.phase === 'mapping-error' && (
        <div className={styles.pickerOverlay}>
          <div className={styles.mappingError}>
            <h3 className={styles.mappingErrorTitle}>Cannot start workflow</h3>
            <p className={styles.mappingErrorMessage}>{bindingsState.message}</p>
            <button className={styles.pickerErrorBtn} onClick={bindingsReset}>Dismiss</button>
          </div>
        </div>
      )}

      {bindingsState.phase === 'resolving-name-conflict' && (
        <div className={styles.pickerOverlay}>
          <div className={styles.conflictModal}>
            <h3 className={styles.conflictModalTitle}>Multiple action servers offer this environment</h3>
            {bindingsState.conflicts.map((c) => {
              const pickedUri = bindingsState.selections.get(c.envOid);
              return (
                <div key={c.envOid} className={styles.conflictEnv}>
                  <strong className={styles.conflictEnvName}>{c.envName}</strong>
                  <ul className={styles.conflictCandidates}>
                    {c.candidates.map((cand) => {
                      const isPicked = pickedUri === cand.serverUri;
                      return (
                        <li key={cand.serverUri} className={isPicked ? styles.conflictCandidatePicked : undefined}>
                          <button
                            className={isPicked ? styles.conflictBtnPicked : styles.conflictBtn}
                            onClick={() => resolveConflict(c.envOid, cand.serverUri)}
                            disabled={isPicked}
                          >
                            {cand.serverUri}
                          </button>
                          {isPicked && <span className={styles.conflictPickedLabel}>Selected</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Value Properties & Resources Modal */}
      {showValueProps && (
        <div className={styles.propsOverlay} onClick={() => setShowValueProps(false)}>
          <div className={styles.propsPanel} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.propsTitle}>Value Properties</h3>
            <PropertiesTable data={getActiveProperties()} />
            <h3 className={styles.propsTitle} style={{ marginTop: 16 }}>Resources</h3>
            <ResourcesTable resources={getActiveResources()} />
          </div>
        </div>
      )}

      {/* Environment Properties Modal */}
      {showEnvProps && (
        <div className={styles.propsOverlay} onClick={() => setShowEnvProps(false)}>
          <div className={styles.propsPanel} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.propsTitle}>Environment Properties</h3>
            <PropertiesTable data={getEnvironmentProperties()} />
          </div>
        </div>
      )}
    </div>
  );
}

function PropertiesTable({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return <p className={styles.emptySection}>No properties found</p>;
  }
  return (
    <table className={styles.propsTable}>
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td>{key}</td>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResourcesTable({ resources }: { resources: ResourceSnapshotEntry[] }) {
  if (resources.length === 0) {
    return <p className={styles.emptySection}>No active resources</p>;
  }
  return (
    <table className={styles.propsTable}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 8px' }}>Resource</th>
          <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 8px' }}>Type</th>
          <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 8px' }}>State</th>
          <th style={{ textAlign: 'right', fontWeight: 600, padding: '4px 8px' }}>Queued</th>
        </tr>
      </thead>
      <tbody>
        {resources.map((r) => (
          <tr key={r.name}>
            <td>{r.name}</td>
            <td>{r.type}</td>
            <td>{r.state}</td>
            <td style={{ textAlign: 'right' }}>{r.queuedAcquires}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
