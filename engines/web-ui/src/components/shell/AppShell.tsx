// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState, useCallback, useRef, useEffect } from 'react';
import { Workflow } from 'lucide-react';
import type { DeviceType, FrameExpansion } from './DeviceFrame';
import type { DisplayStyle } from '@engine/types.js';
import { TitleBar } from './TitleBar';
import { TabBar, type TabId } from './TabBar';
import { ErrorBoundary } from './ErrorBoundary';
import type { HomeMenuAction } from './homeMenuTypes';
import { HomeScreen } from '../screens/HomeScreen';
import { ActiveScreen } from '../screens/ActiveScreen';
import { OverviewScreen } from '../screens/OverviewScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import styles from './AppShell.module.css';

const TAB_IDS: TabId[] = ['home', 'active', 'overview', 'history', 'settings'];

interface AppShellProps {
  deviceType: DeviceType;
  showGraph?: boolean;
  onToggleGraph?: () => void;
  onFrameExpansionChange?: (expansion: FrameExpansion) => void;
}

export function AppShell({ deviceType, showGraph, onToggleGraph, onFrameExpansionChange }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [activeStepInfo, setActiveStepInfo] = useState<{
    workflowLocalId: string;
    workflowVersion: string;
    stepLocalId: string;
    stepOid: string;
    instanceNumber: number | null;
    workflowDisplayStyle: DisplayStyle;
  } | null>(null);
  const [homeMenuAction, setHomeMenuAction] = useState<HomeMenuAction | null>(null);
  const screenRefs = useRef<Record<TabId, HTMLDivElement | null>>({
    home: null,
    active: null,
    overview: null,
    history: null,
    settings: null,
  });

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab((current) => {
      if (current === tab) {
        // Tap on already-active tab: scroll to top
        const el = screenRefs.current[tab];
        if (el) el.scrollTop = 0;
        return current;
      }
      return tab;
    });
  }, []);

  const handleNavigateToActive = useCallback(() => {
    setActiveTab('active');
  }, []);

  const shellClass = `${styles.shell} ${styles[`shell--${deviceType}`] || ''}`;

  // BPMN diagrams flow left-to-right, so the workflow pane reads better as a
  // wide horizontal strip below the canvas. Other notations (flowchart/isa88)
  // use the vertical pane on the left.
  const isGraphPaneVisible = deviceType === 'desktop' && !!showGraph && activeTab === 'active';
  const graphPanePosition: 'side' | 'below' | null = !isGraphPaneVisible
    ? null
    : activeStepInfo?.workflowDisplayStyle === 'bpmn'
      ? 'below'
      : 'side';

  // Report desired frame expansion to App so it can size the DeviceFrame.
  useEffect(() => {
    onFrameExpansionChange?.(graphPanePosition);
  }, [graphPanePosition, onFrameExpansionChange]);

  return (
    <div className={shellClass}>
      {/* Zone 1: Reserved Area */}
      <div className={styles.reservedArea} />

      {/* Zone 2: Title Area */}
      <TitleBar activeTab={activeTab} activeStepInfo={activeStepInfo} onHomeMenuAction={setHomeMenuAction} deviceType={deviceType} />

      {/* Zone 3: Top Buffer */}
      <div className={styles.topBuffer} />

      {/* Zone 4: Main body — sidebar + working area for tablet/desktop, working area only for phone */}
      {deviceType === 'phone' ? (
        <>
          <div className={styles.workingArea}>
            {TAB_IDS.map((id) => (
              <div
                key={id}
                ref={(el) => { screenRefs.current[id] = el; }}
                className={styles.screen}
                style={{ display: activeTab === id ? 'flex' : 'none' }}
              >
                <ErrorBoundary>
                  {id === 'home' && <HomeScreen onNavigateToActive={handleNavigateToActive} menuAction={homeMenuAction} onMenuActionHandled={() => setHomeMenuAction(null)} />}
                  {id === 'active' && <ActiveScreen deviceType={deviceType} onStepChange={setActiveStepInfo} />}
                  {id === 'overview' && <OverviewScreen highlightedStepOid={activeStepInfo?.stepOid ?? null} />}
                  {id === 'history' && <HistoryScreen />}
                  {id === 'settings' && <SettingsScreen />}
                </ErrorBoundary>
              </div>
            ))}
          </div>
          <div className={styles.bottomBuffer} />
          <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
        </>
      ) : (
        <div className={styles.sidebarLayout}>
          <div className={styles.sidebar}>
            <TabBar activeTab={activeTab} onTabChange={handleTabChange} vertical />
            {deviceType === 'desktop' && onToggleGraph && (
              <>
                <div className={styles.sidebarDivider} />
                <button
                  type="button"
                  className={`${styles.sidebarToggle} ${showGraph ? styles.sidebarToggleActive : ''}`}
                  onClick={onToggleGraph}
                  title={showGraph ? 'Hide workflow diagram' : 'Show workflow diagram'}
                  aria-pressed={showGraph}
                >
                  <Workflow size={24} />
                  <span className={styles.sidebarToggleLabel}>Diagram</span>
                </button>
              </>
            )}
          </div>
          {graphPanePosition === 'side' && (
            <div className={styles.graphPaneSide}>
              <ErrorBoundary>
                <OverviewScreen highlightedStepOid={activeStepInfo?.stepOid ?? null} />
              </ErrorBoundary>
            </div>
          )}
          <div className={styles.contentColumn}>
            <div className={styles.workingArea}>
              {TAB_IDS.map((id) => (
                <div
                  key={id}
                  ref={(el) => { screenRefs.current[id] = el; }}
                  className={styles.screen}
                  style={{ display: activeTab === id ? 'flex' : 'none' }}
                >
                  <ErrorBoundary>
                    {id === 'home' && <HomeScreen onNavigateToActive={handleNavigateToActive} menuAction={homeMenuAction} onMenuActionHandled={() => setHomeMenuAction(null)} />}
                    {id === 'active' && <ActiveScreen deviceType={deviceType} onStepChange={setActiveStepInfo} />}
                    {id === 'overview' && <OverviewScreen highlightedStepOid={activeStepInfo?.stepOid ?? null} />}
                    {id === 'history' && <HistoryScreen />}
                    {id === 'settings' && <SettingsScreen />}
                  </ErrorBoundary>
                </div>
              ))}
            </div>
            {graphPanePosition === 'below' && (
              <div className={styles.graphPaneBelow}>
                <ErrorBoundary>
                  <OverviewScreen highlightedStepOid={activeStepInfo?.stepOid ?? null} />
                </ErrorBoundary>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
