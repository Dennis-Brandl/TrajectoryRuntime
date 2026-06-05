// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useState, useCallback, useMemo, useEffect } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useWorkflowManager } from '../../manager/useWorkflowManager';
import type { ResourceSnapshotEntry } from '@engine/types.js';
import styles from './SettingsScreen.module.css';

type ResourceScope = 'environment' | 'workflow';

export function SettingsScreen() {
  const manager = useWorkflowManager();

  const [notifySteps, setNotifySteps] = useLocalStorage('trajectory-notify-steps', false);
  const [notifyDenied, setNotifyDenied] = useState(false);

  const handleNotifyToggle = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotifySteps(true);
        setNotifyDenied(false);
      } else {
        setNotifySteps(false);
        setNotifyDenied(true);
      }
    } else {
      setNotifySteps(false);
      setNotifyDenied(false);
    }
  }, [setNotifySteps]);

  const [actionProxyMode, setActionProxyMode] = useLocalStorage<'sse-preferred' | 'poll-only'>('actionProxy.mode', 'sse-preferred');
  const [actionProxyPollSec, setActionProxyPollSec] = useLocalStorage<number>('actionProxy.pollSec', 4);

  const [pollSecInput, setPollSecInput] = useState<string>(() => String(actionProxyPollSec));

  // Keep input in sync if the stored value changes externally
  useEffect(() => {
    setPollSecInput(String(actionProxyPollSec));
  }, [actionProxyPollSec]);

  const handlePollSecChange = useCallback((raw: string) => {
    setPollSecInput(raw);
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 1) {
      setActionProxyPollSec(Math.min(300, Math.max(1, Math.round(v))));
    }
  }, [setActionProxyPollSec]);

  const [confirmDeleteLoaded, setConfirmDeleteLoaded] = useLocalStorage('trajectory-confirm-delete-loaded', true);
  const [confirmDeleteCompleted, setConfirmDeleteCompleted] = useLocalStorage('trajectory-confirm-delete-completed', false);

  const [envActionMapping, setEnvActionMapping] = useLocalStorage<'Exact' | 'Name'>(
    'trajectory-env-action-mapping',
    'Name',
  );

  const [allowScript, setAllowScriptSetting] = useLocalStorage('trajectory.allowScriptExecution', false);

  const handleClearHistory = useCallback(() => {
    if (window.confirm('Clear all completed workflow history?')) {
      manager.clearCompleted();
    }
  }, [manager]);

  const [dialogScope, setDialogScope] = useState<ResourceScope | null>(null);
  const [snapshot, setSnapshot] = useState<ResourceSnapshotEntry[]>([]);
  const [lastReleaseResult, setLastReleaseResult] = useState<string | null>(null);

  const refreshSnapshot = useCallback((scope: ResourceScope) => {
    setSnapshot(scope === 'environment'
      ? manager.getEnvironmentResourceSnapshot()
      : manager.getWorkflowResourceSnapshot());
  }, [manager]);

  const openDialog = useCallback((scope: ResourceScope) => {
    setLastReleaseResult(null);
    setDialogScope(scope);
    refreshSnapshot(scope);
  }, [refreshSnapshot]);

  const closeDialog = useCallback(() => setDialogScope(null), []);

  const releaseAll = useCallback(() => {
    if (!dialogScope) return;
    const released = dialogScope === 'environment'
      ? manager.releaseAllEnvironmentResources()
      : manager.releaseAllWorkflowResources();
    setDialogScope(null);
    const label = dialogScope === 'environment' ? 'environment' : 'workflow';
    setLastReleaseResult(
      released.length === 0
        ? `No ${label} resources were held`
        : `Released ${released.length}: ${released.join(', ')}`,
    );
  }, [dialogScope, manager]);

  const releaseOne = useCallback((resourceKey: string) => {
    manager.resetResource(resourceKey);
    if (dialogScope) refreshSnapshot(dialogScope);
  }, [manager, dialogScope, refreshSnapshot]);

  return (
    <div className={styles.screen}>
      <h2 className={styles.heading}>Settings</h2>

      <div className={styles.settingGroup}>
        <h3 className={styles.groupTitle}>Notifications</h3>
        <label className={styles.settingRow}>
          <span className={styles.settingLabel}>Notify on new active steps</span>
          <input
            type="checkbox"
            checked={notifySteps}
            onChange={(e) => handleNotifyToggle(e.target.checked)}
            className={styles.checkbox}
          />
        </label>
        {notifyDenied && (
          <p className={styles.permissionDenied}>
            Notification permission denied. Enable in browser settings.
          </p>
        )}
      </div>

      <div className={styles.settingGroup}>
        <h3 className={styles.groupTitle}>Confirmations</h3>
        <label className={styles.settingRow}>
          <span className={styles.settingLabel}>Confirm delete of loaded workflows</span>
          <input
            type="checkbox"
            checked={confirmDeleteLoaded}
            onChange={(e) => setConfirmDeleteLoaded(e.target.checked)}
            className={styles.checkbox}
          />
        </label>
        <label className={styles.settingRow}>
          <span className={styles.settingLabel}>Confirm delete of completed workflows</span>
          <input
            type="checkbox"
            checked={confirmDeleteCompleted}
            onChange={(e) => setConfirmDeleteCompleted(e.target.checked)}
            className={styles.checkbox}
          />
        </label>
      </div>

      <div className={styles.settingGroup}>
        <h3 className={styles.groupTitle}>Action Servers</h3>
        <div className={styles.settingRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <span className={styles.settingLabel}>Connection mode</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="actionProxyMode"
              checked={actionProxyMode === 'sse-preferred'}
              onChange={() => setActionProxyMode('sse-preferred')}
            />
            Use SSE when available
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="radio"
              name="actionProxyMode"
              checked={actionProxyMode === 'poll-only'}
              onChange={() => setActionProxyMode('poll-only')}
            />
            Always poll
          </label>
        </div>
        <div className={styles.settingRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={styles.settingLabel}>Poll interval (seconds)</span>
            <input
              type="number"
              min={1}
              max={300}
              value={pollSecInput}
              onChange={(e) => handlePollSecChange(e.target.value)}
              style={{ width: 64, textAlign: 'right' }}
            />
          </label>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Used for opaque actions or when SSE is unavailable.
          </p>
        </div>
      </div>

      <div className={styles.settingGroup}>
        <h3 className={styles.groupTitle}>Data Management</h3>
        <button className={styles.dangerButton} onClick={handleClearHistory}>
          Clear All History
        </button>
        <button className={styles.dangerButton} onClick={() => openDialog('environment')}>
          View All Environment Resources
        </button>
        <button className={styles.dangerButton} onClick={() => openDialog('workflow')}>
          View All Workflow Resources
        </button>
        {lastReleaseResult && (
          <p className={styles.permissionDenied} style={{ color: 'var(--color-text-secondary)' }}>
            {lastReleaseResult}
          </p>
        )}
      </div>

      <div className={styles.settingGroup}>
        <h3 className={styles.groupTitle}>Action Server Mapping</h3>
        <p className={styles.settingHelp}>
          How to resolve workflow environment and action references against connected
          action servers at workflow start.
        </p>
        <label className={styles.settingRow}>
          <input
            type="radio"
            name="env-action-mapping"
            value="Name"
            checked={envActionMapping === 'Name'}
            onChange={() => setEnvActionMapping('Name')}
          />
          <span className={styles.settingLabel}>
            <strong>Name</strong> — match by environment and action names
            (case-sensitive); rewrite workflow OIDs to server-supplied values.
          </span>
        </label>
        <label className={styles.settingRow}>
          <input
            type="radio"
            name="env-action-mapping"
            value="Exact"
            checked={envActionMapping === 'Exact'}
            onChange={() => setEnvActionMapping('Exact')}
          />
          <span className={styles.settingLabel}>
            <strong>Exact</strong> — workflow OIDs must match the action server
            exactly; mismatch prevents workflow start.
          </span>
        </label>
      </div>

      <div className={styles.settingGroup}>
        <h3 className={styles.groupTitle}>Security</h3>
        <label className={styles.settingRow}>
          <span className={styles.settingLabel}>Allow SCRIPT step execution</span>
          <input
            type="checkbox"
            checked={allowScript}
            onChange={(e) => setAllowScriptSetting(e.target.checked)}
            className={styles.checkbox}
          />
        </label>
        <p className={styles.settingHelp}>
          SCRIPT steps run code supplied by the workflow author. Leave this OFF
          unless you trust the imported package — a malicious script can run in
          your browser. Off by default.
        </p>
      </div>

      <div className={styles.settingGroup}>
        <h3 className={styles.groupTitle}>About</h3>
        <p className={styles.aboutName}>Trajectory Desktop</p>
        <p className={styles.aboutVersion}>Version {__APP_VERSION__}</p>
        <p className={styles.settingHelp}>
          <a href="/help.html" target="_blank" rel="noopener noreferrer">
            Open Help Guide
          </a>
        </p>
      </div>

      {dialogScope && (
        <ResourcesDialog
          scope={dialogScope}
          snapshot={snapshot}
          onCancel={closeDialog}
          onReleaseAll={releaseAll}
          onReleaseOne={releaseOne}
        />
      )}
    </div>
  );
}

interface ResourcesDialogProps {
  scope: ResourceScope;
  snapshot: ResourceSnapshotEntry[];
  onCancel: () => void;
  onReleaseAll: () => void;
  onReleaseOne: (resourceKey: string) => void;
}

function ResourcesDialog({ scope, snapshot, onCancel, onReleaseAll, onReleaseOne }: ResourcesDialogProps) {
  const sorted = useMemo(
    () => [...snapshot].sort((a, b) => a.resourceName.localeCompare(b.resourceName)),
    [snapshot],
  );
  const title = scope === 'environment' ? 'Environment Resources' : 'Workflow Resources';
  const emptyText = scope === 'environment'
    ? 'No environment resources are registered.'
    : 'No workflow resources are registered.';

  return (
    <div
      className={styles.modalBackdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>{title}</h3>
        <div className={styles.modalBody}>
          {sorted.length === 0 ? (
            <p className={styles.modalEmpty}>{emptyText}</p>
          ) : (
            <table className={styles.resourceTable}>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Type</th>
                  <th className={styles.numeric}>Total</th>
                  <th className={styles.numeric}>Acquired</th>
                  <th className={styles.numeric}>Available</th>
                  <th className={styles.numeric}>Queued</th>
                  <th aria-label="Release"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.name}>
                    <td>{r.resourceName}</td>
                    <td>{r.type}</td>
                    <td className={styles.numeric}>{r.type === 'sync' ? '—' : r.total}</td>
                    <td className={styles.numeric}>{r.type === 'sync' ? '—' : r.inUse}</td>
                    <td className={styles.numeric}>{r.type === 'sync' ? '—' : r.available}</td>
                    <td className={styles.numeric}>{r.queued}</td>
                    <td className={styles.numeric}>
                      <button
                        className={styles.iconButton}
                        title="Release this resource"
                        aria-label={`Release ${r.resourceName}`}
                        onClick={() => onReleaseOne(r.name)}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className={styles.modalActions}>
          <button className={styles.modalCancel} onClick={onCancel}>Cancel</button>
          <button className={styles.dangerButton} style={{ width: 'auto' }} onClick={onReleaseAll}>
            Release All
          </button>
        </div>
      </div>
    </div>
  );
}
