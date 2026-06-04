// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useContext, useSyncExternalStore } from 'react';
import { WorkflowContext } from './WorkflowContext';
import type { WorkflowCoordinator, CoordinatorSnapshot } from './WorkflowCoordinator';

export function useWorkflowCoordinator(): WorkflowCoordinator {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflowCoordinator must be used within WorkflowProvider');
  return ctx;
}

export function useWorkflowSnapshot(): CoordinatorSnapshot {
  const coordinator = useWorkflowCoordinator();
  return useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot);
}
