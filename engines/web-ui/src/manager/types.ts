// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type { MasterWorkflowSpecification, MasterEnvironmentLibrary } from '@engine/types.js';
import type { WorkflowCoordinator, CoordinatorSnapshot } from '../coordinator/WorkflowCoordinator';

/** A loaded workflow spec — persists until explicitly deleted. */
export interface LoadedWorkflow {
  id: string;
  specOid: string;
  name: string;
  localId: string;
  version: string;
  spec: MasterWorkflowSpecification;
  mediaMap: Record<string, string>;
  environments: MasterEnvironmentLibrary[];
  loadedAt: number;
}

/** A running workflow instance — created from a LoadedWorkflow. */
export interface ActiveWorkflow {
  id: string;
  sourceSpecId: string;  // links back to LoadedWorkflow.id
  name: string;
  localId: string;
  version: string;
  coordinator: WorkflowCoordinator;
  startedAt: number;
  instanceNumber: number | null;  // shown when multiple instances of the same spec are active; null = only one
}

/** A finished workflow instance. */
export interface CompletedWorkflow {
  id: string;
  sourceSpecId: string;
  name: string;
  localId: string;
  version: string;
  finalState: string;  // 'COMPLETED' | 'ABORTED' | 'STOPPED' | 'ERRORED'
  startedAt: number;
  finishedAt: number;
  trace: any[];
  properties: Record<string, string>;
  stepParams: Record<string, {
    inputParameters: Record<string, string>;
    outputParameters: Record<string, string>;
    description: string;
    label: string;
    stepType: string;
  }>;
}

export interface ManagerSnapshot {
  loaded: LoadedWorkflow[];
  active: ActiveWorkflow[];
  completed: CompletedWorkflow[];
  focusedActiveId: string | null;
}

export type Listener = () => void;
