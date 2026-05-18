// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
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
