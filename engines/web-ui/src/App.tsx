// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useEffect, useState } from 'react';
import { DeviceFrame, type DeviceType, type FrameExpansion } from './components/shell/DeviceFrame';
import { FrameSwitcher } from './components/shell/FrameSwitcher';
import { AppShell } from './components/shell/AppShell';
import { WelcomeSplash } from './components/shell/WelcomeSplash';
import { WorkflowManagerProvider } from './manager/WorkflowManagerContext';
import { useLocalStorage } from './hooks/useLocalStorage';
import './theme.css';
import './App.css';

export function App() {
  const [deviceTypeRaw, setDeviceType] = useLocalStorage<string>('trajectory-device-type', 'desktop');
  const deviceType: DeviceType = (
    deviceTypeRaw === 'tablet' || deviceTypeRaw === 'tablet-vertical'
      ? 'tablet-horizontal'
      : deviceTypeRaw
  ) as DeviceType;
  const [showGraph, setShowGraph] = useLocalStorage<boolean>('trajectory-show-graph', false);
  const [frameExpansion, setFrameExpansion] = useState<FrameExpansion>(null);
  const [theme] = useLocalStorage<'light' | 'dark'>('trajectory-theme', 'light');
  const [splashDismissed, setSplashDismissed] = useLocalStorage<boolean>('trajectory-splash-dismissed', false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (!splashDismissed) {
    return (
      <WelcomeSplash
        onContinue={() => {
          setDeviceType('desktop');
          setSplashDismissed(true);
        }}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-controls">
        <FrameSwitcher value={deviceType} onChange={setDeviceType} />
      </div>
      <div className="page-frame">
        <DeviceFrame deviceType={deviceType} expanded={frameExpansion}>
          <WorkflowManagerProvider>
            <AppShell
              deviceType={deviceType}
              showGraph={showGraph}
              onToggleGraph={() => setShowGraph(!showGraph)}
              onFrameExpansionChange={setFrameExpansion}
            />
          </WorkflowManagerProvider>
        </DeviceFrame>
      </div>
    </div>
  );
}
