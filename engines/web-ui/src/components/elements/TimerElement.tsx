// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw } from 'lucide-react';
import type { ElementProps } from './registry';
import type { FormElementTimer } from '@engine/types.js';

// Visual styling mirrors the editor's TimerRenderer (card + HH:MM:SS readout
// + direction chevron + row of muted control buttons). The runtime swaps
// the static buttons for functional Play/Pause + Reset and runs an actual
// 1Hz tick, persisting state via the formValues overlay so the timer
// survives remounts (matches the previous CSS-module behaviour).

interface TimerState {
  startTime: number;
  pausedElapsed: number;
  running: boolean;
}

const TIMER_STATE_PREFIX = '__timer_state_';

function formatHMS(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function TimerElement({ element, formValues, onFormChange }: ElementProps) {
  const el = element as FormElementTimer;
  const stateKey = `${TIMER_STATE_PREFIX}${el.fieldName}`;
  const persisted = formValues[stateKey] as TimerState | undefined;

  const [elapsed, setElapsed] = useState(() => {
    if (!persisted) return 0;
    if (persisted.running) {
      return persisted.pausedElapsed + Math.floor((Date.now() - persisted.startTime) / 1000);
    }
    return persisted.pausedElapsed;
  });
  const [running, setRunning] = useState(persisted?.running ?? true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const startTimeRef = useRef(persisted?.running ? persisted.startTime : Date.now());
  const pausedElapsedRef = useRef(persisted ? persisted.pausedElapsed : 0);
  const stoppedRef = useRef(false);

  const persistState = useCallback((state: TimerState) => {
    onFormChange(stateKey, state);
  }, [stateKey, onFormChange]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  }, []);

  const tick = useCallback(() => {
    if (stoppedRef.current) return;
    const secs = pausedElapsedRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
    setElapsed(secs);
    const display = el.direction === 'countdown'
      ? Math.max(0, el.durationSeconds - secs)
      : secs;
    onFormChange(el.fieldName, String(display));

    if (el.direction === 'countdown' && secs >= el.durationSeconds) {
      stoppedRef.current = true;
      setRunning(false);
      persistState({ startTime: startTimeRef.current, pausedElapsed: secs, running: false });
    }
  }, [el.fieldName, el.durationSeconds, el.direction, onFormChange, persistState]);

  const startInterval = useCallback(() => {
    stopTimer();
    stoppedRef.current = false;
    intervalRef.current = setInterval(tick, 1000);
  }, [tick, stopTimer]);

  useEffect(() => {
    if (persisted && !persisted.running) {
      stoppedRef.current = true;
    } else {
      if (!persisted) {
        persistState({ startTime: startTimeRef.current, pausedElapsed: 0, running: true });
      }
      startInterval();
    }
    return () => {
      stoppedRef.current = true;
      stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlayPause = () => {
    if (running) {
      pausedElapsedRef.current = elapsed;
      stoppedRef.current = true;
      stopTimer();
      setRunning(false);
      persistState({ startTime: startTimeRef.current, pausedElapsed: elapsed, running: false });
    } else {
      startTimeRef.current = Date.now();
      startInterval();
      setRunning(true);
      persistState({ startTime: startTimeRef.current, pausedElapsed: pausedElapsedRef.current, running: true });
    }
  };

  const handleReset = () => {
    pausedElapsedRef.current = 0;
    setElapsed(0);
    startTimeRef.current = Date.now();
    const resetDisplay = el.direction === 'countdown' ? el.durationSeconds : 0;
    onFormChange(el.fieldName, String(resetDisplay));
    if (running) {
      startInterval();
      persistState({ startTime: startTimeRef.current, pausedElapsed: 0, running: true });
    } else {
      stoppedRef.current = true;
      stopTimer();
      persistState({ startTime: startTimeRef.current, pausedElapsed: 0, running: false });
    }
  };

  const display = el.direction === 'countdown'
    ? Math.max(0, el.durationSeconds - elapsed)
    : elapsed;
  const timeString = formatHMS(display);
  const isExpired = el.direction === 'countdown' && elapsed >= el.durationSeconds;
  const DirectionIcon = el.direction === 'countdown' ? ChevronDown : ChevronUp;

  const cardStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    background: '#f8fafc',
    userSelect: 'none',
    gap: 6,
    padding: '8px 12px',
    overflow: 'hidden',
  };

  const labelStyle: CSSProperties = {
    fontSize: 12,
    color: '#64748b',
    letterSpacing: '0.02em',
  };

  const readoutRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  };

  const readoutTextStyle: CSSProperties = {
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: 28,
    fontWeight: 700,
    color: isExpired ? '#dc2626' : '#1e293b',
    lineHeight: 1,
  };

  const controlsRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const controlButtonStyle: CSSProperties = {
    width: 28,
    height: 28,
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    background: '#f1f5f9',
    color: '#475569',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  };

  return (
    <div style={cardStyle}>
      <span style={labelStyle}>{el.label || 'Timer'}</span>
      <div style={readoutRowStyle}>
        <span style={readoutTextStyle}>{timeString}</span>
        <DirectionIcon size={16} color="#94a3b8" />
      </div>
      <div style={controlsRowStyle}>
        <button
          type="button"
          onClick={handlePlayPause}
          style={controlButtonStyle}
          aria-label={running ? 'Pause' : 'Play'}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          type="button"
          onClick={handleReset}
          style={controlButtonStyle}
          aria-label="Reset"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
}
