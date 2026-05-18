// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useContext, useCallback, useRef, useSyncExternalStore } from 'react';
import { WorkflowManagerContext } from './WorkflowManagerContext';
import type { WorkflowManager } from './WorkflowManager';
import type { ManagerSnapshot } from './types';

export function useWorkflowManager(): WorkflowManager {
  const manager = useContext(WorkflowManagerContext);
  if (!manager) throw new Error('useWorkflowManager must be used within WorkflowManagerProvider');
  return manager;
}

export function useManagerSnapshot(): ManagerSnapshot {
  const manager = useWorkflowManager();
  return useSyncExternalStore(manager.subscribe, manager.getSnapshot);
}

export function useManagerSelector<T>(selector: (snap: ManagerSnapshot) => T): T {
  const manager = useWorkflowManager();
  const prevRef = useRef<T>(undefined as T);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(manager.getSnapshot());
    if (Object.is(prevRef.current, next)) return prevRef.current as T;
    prevRef.current = next;
    return next;
  }, [manager]);

  return useSyncExternalStore(manager.subscribe, getSnapshot);
}

export function useActiveCount(): number {
  return useManagerSelector(s => s.active.length);
}

export function useFocusedId(): string | null {
  return useManagerSelector(s => s.focusedActiveId);
}
