// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useState, useRef, useEffect } from 'react';
import { EllipsisVertical } from 'lucide-react';
import { useFocusedId } from '../../manager/useWorkflowManager';
import { StateCommandMenu } from '../StateCommandMenu';
import type { TabId } from './TabBar';
import type { HomeMenuAction } from './homeMenuTypes';
import styles from './TitleBar.module.css';

interface TitleBarProps {
  activeTab: TabId;
  activeStepInfo?: { workflowLocalId: string; workflowVersion: string; stepLocalId: string; instanceNumber: number | null } | null;
  onHomeMenuAction?: (action: HomeMenuAction) => void;
  deviceType?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';
}

export function TitleBar({ activeTab, activeStepInfo, onHomeMenuAction, deviceType }: TitleBarProps) {
  if (activeTab === 'active') {
    return <ActiveTitleBar activeStepInfo={activeStepInfo} deviceType={deviceType} />;
  }

  return <DefaultTitleBar activeTab={activeTab} onHomeMenuAction={onHomeMenuAction} />;
}

function DefaultTitleBar({ activeTab, onHomeMenuAction }: { activeTab: TabId; onHomeMenuAction?: (action: HomeMenuAction) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const showMenu = activeTab === 'home';

  return (
    <div className={styles.titleBar}>
      <div className={styles.branding}>
        <img src="/ic_launcher_round.png" alt="" className={styles.appIcon} />
        <span className={styles.appName}>Trajectory Desktop</span>
        <span className={styles.appVersion}>v{__APP_VERSION__}</span>
      </div>
      {showMenu ? (
        <div className={styles.menuContainer} ref={menuRef}>
          <button className={styles.menuButton} aria-label="Menu" onClick={() => setMenuOpen(o => !o)}>
            <EllipsisVertical size={20} />
          </button>
          {menuOpen && (
            <div className={styles.menuDropdown}>
              <button className={styles.menuItem} onClick={() => { onHomeMenuAction?.('sort-name'); setMenuOpen(false); }}>
                Sort by Name
              </button>
              <button className={styles.menuItem} onClick={() => { onHomeMenuAction?.('sort-date'); setMenuOpen(false); }}>
                Sort by Date
              </button>
              <div className={styles.menuDivider} />
              <button className={styles.menuItem} onClick={() => { onHomeMenuAction?.('show-value-props'); setMenuOpen(false); }}>
                Show Value Properties and Resources
              </button>
              <button className={styles.menuItem} onClick={() => { onHomeMenuAction?.('show-env-props'); setMenuOpen(false); }}>
                Show Environment Properties
              </button>
            </div>
          )}
        </div>
      ) : (
        <button className={styles.menuButton} aria-label="Menu">
          <EllipsisVertical size={20} />
        </button>
      )}
    </div>
  );
}

function ActiveTitleBar({ activeStepInfo, deviceType }: { activeStepInfo?: { workflowLocalId: string; workflowVersion: string; stepLocalId: string; instanceNumber: number | null } | null; deviceType?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop' }) {
  const focusedId = useFocusedId();
  const isLarge = deviceType === 'tablet-horizontal' || deviceType === 'tablet-vertical' || deviceType === 'desktop';

  if (activeStepInfo) {
    return (
      <div className={styles.titleBar}>
        <div className={`${styles.workflowInfo}${isLarge ? ` ${styles.workflowInfoLarge}` : ''}`}>
          <span className={styles.workflowTitle}>
            {activeStepInfo.workflowLocalId}{activeStepInfo.instanceNumber != null ? ` (${activeStepInfo.instanceNumber})` : ''} v{activeStepInfo.workflowVersion}
          </span>
          <span className={styles.stepId}>{activeStepInfo.stepLocalId}</span>
        </div>
        <StateCommandMenu workflowId={focusedId} />
      </div>
    );
  }

  return (
    <div className={styles.titleBar}>
      <span className={styles.noWorkflow}>No active workflow</span>
    </div>
  );
}
