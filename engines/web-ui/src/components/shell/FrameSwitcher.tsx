// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useRef, useEffect, useState } from 'react';
import type { DeviceType } from './DeviceFrame';
import styles from './FrameSwitcher.module.css';

const DEVICE_OPTIONS: DeviceType[] = ['desktop', 'tablet-horizontal', 'phone'];
const LABELS: Partial<Record<DeviceType, string>> = {
  phone: 'Phone',
  'tablet-horizontal': 'Tablet',
  desktop: 'Desktop',
};

interface FrameSwitcherProps {
  value: DeviceType;
  onChange: (type: DeviceType) => void;
}

export function FrameSwitcher({ value, onChange }: FrameSwitcherProps) {
  const [animated, setAnimated] = useState(false);
  const mountRef = useRef(false);

  // Enable transition after first render to avoid initial position flicker
  useEffect(() => {
    if (!mountRef.current) {
      mountRef.current = true;
      requestAnimationFrame(() => setAnimated(true));
    }
  }, []);

  const activeIndex = DEVICE_OPTIONS.indexOf(value);
  const offset = activeIndex * 100; // percentage of one segment width

  const highlightClass = animated
    ? `${styles.highlight} ${styles.highlightAnimated}`
    : styles.highlight;

  return (
    <div className={styles.switcher}>
      <div
        className={highlightClass}
        style={{ transform: `translateX(${offset}%)` }}
      />
      {DEVICE_OPTIONS.map((type) => (
        <button
          key={type}
          className={`${styles.segment} ${type === value ? styles.segmentActive : ''}`}
          onClick={() => onChange(type)}
          type="button"
        >
          {LABELS[type] ?? type}
        </button>
      ))}
    </div>
  );
}
