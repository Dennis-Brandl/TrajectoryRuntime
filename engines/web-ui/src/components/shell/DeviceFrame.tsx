// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useRef, useEffect, type ReactNode } from 'react';
import styles from './DeviceFrame.module.css';

export type DeviceType = 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';

/**
 * Desktop frame expansion modes that grow the frame to fit the optional
 * workflow graph pane next to (or below) the step canvas.
 *  - 'side'  → side-by-side: widens the frame (flowchart/isa88 workflows).
 *  - 'below' → stacked: makes the frame taller (BPMN workflows, since BPMN
 *              diagrams flow left-to-right and read better as a wide strip).
 */
export type FrameExpansion = 'side' | 'below' | null;

interface DeviceFrameProps {
  deviceType: DeviceType;
  children: ReactNode;
  expanded?: FrameExpansion;
}

export function DeviceFrame({ deviceType, children, expanded }: DeviceFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const savedDesktopSize = useRef<{ width: string; height: string } | null>(null);
  const expandedClass = deviceType === 'desktop' && expanded === 'side'
    ? ` ${styles['frame--desktop-wide']}`
    : deviceType === 'desktop' && expanded === 'below'
      ? ` ${styles['frame--desktop-tall']}`
      : '';
  const frameClass = `${styles.frame} ${styles[`frame--${deviceType}`]}${expandedClass}`;

  // Save desktop resize dimensions when leaving, restore when returning
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    if (deviceType !== 'desktop') {
      // Leaving desktop — save any inline size set by the resize handle
      if (el.style.width || el.style.height) {
        savedDesktopSize.current = { width: el.style.width, height: el.style.height };
      }
      el.style.width = '';
      el.style.height = '';
    } else if (savedDesktopSize.current) {
      // Returning to desktop — restore saved size
      el.style.width = savedDesktopSize.current.width;
      el.style.height = savedDesktopSize.current.height;
    }
  }, [deviceType]);

  return (
    <div ref={frameRef} className={frameClass}>
      {deviceType === 'desktop' && (
        <div className={styles.titleBar}>
          <div className={styles.trafficLights}>
            <span className={`${styles.trafficDot} ${styles.dotClose}`} />
            <span className={`${styles.trafficDot} ${styles.dotMinimize}`} />
            <span className={`${styles.trafficDot} ${styles.dotMaximize}`} />
          </div>
        </div>
      )}
      {deviceType === 'phone' && <div className={styles.dynamicIsland} />}
      <div className={styles.content} data-device={deviceType}>
        {children}
      </div>
      {deviceType === 'phone' && <div className={styles.homeIndicator} />}
    </div>
  );
}
