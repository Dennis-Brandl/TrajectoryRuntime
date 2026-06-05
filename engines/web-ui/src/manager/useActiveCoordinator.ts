// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useCallback, useSyncExternalStore } from 'react';
import type { CoordinatorSnapshot } from '../coordinator/WorkflowCoordinator';
import { useWorkflowManager, useFocusedId } from './useWorkflowManager';

export function useCoordinatorById(id: string | null): CoordinatorSnapshot | null {
  const manager = useWorkflowManager();

  const subscribe = useCallback((cb: () => void) => {
    if (!id) return () => {};
    const coordinator = manager.getCoordinator(id);
    if (!coordinator) return () => {};
    return coordinator.subscribe(cb);
  }, [manager, id]);

  const getSnapshot = useCallback((): CoordinatorSnapshot | null => {
    if (!id) return null;
    const coordinator = manager.getCoordinator(id);
    return coordinator?.getSnapshot() ?? null;
  }, [manager, id]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useActiveCoordinator(): CoordinatorSnapshot | null {
  const focusedId = useFocusedId();
  return useCoordinatorById(focusedId);
}
