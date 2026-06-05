// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type {
  MasterWorkflowSpecification,
  MasterEnvironmentLibrary,
} from '@engine/types.js';
import { deepCopySpec } from '@engine/spec-copy.js';
import { InMemoryResourceManager } from '@engine/resource-manager.js';
import { WorkflowCoordinator } from '../coordinator/WorkflowCoordinator';
import type { LoadedWorkflow, ActiveWorkflow, CompletedWorkflow, ManagerSnapshot, Listener } from './types';

/** crypto.randomUUID() requires a secure context (HTTPS/localhost).
 *  This fallback uses crypto.getRandomValues() which works over plain HTTP. */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type AddWorkflowResult = { id: string } | { duplicateId: string };

export class WorkflowManager {
  private static STORAGE_KEY = 'trajectory-completed-history';
  private static MAX_COMPLETED = 50;
  private static MAX_TRACE_PER_WORKFLOW = 500;

  private _loaded: LoadedWorkflow[] = [];
  private _active: ActiveWorkflow[] = [];
  private _completed: CompletedWorkflow[] = [];
  private _focusedActiveId: string | null = null;
  private _snapshot: ManagerSnapshot = { loaded: [], active: [], completed: [], focusedActiveId: null };
  private _listeners = new Set<Listener>();
  private _coordinatorUnsubs = new Map<string, () => void>();
  /** Shared resource managers for environment-scoped cross-workflow sync, keyed by env OID set. */
  private _envResourceManagers = new Map<string, InMemoryResourceManager>();
  /** Guard against re-entrant pumping of sibling coordinators. */
  private _pumpingInProgress = false;

  constructor() {
    this._completed = WorkflowManager.loadCompleted();
    this._snapshot = { loaded: [], active: [], completed: this._completed, focusedActiveId: null };
  }

  private static loadCompleted(): CompletedWorkflow[] {
    try {
      const raw = localStorage.getItem(WorkflowManager.STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as CompletedWorkflow[];
    } catch {
      return [];
    }
  }

  private persistCompleted(): void {
    try {
      const capped = this._completed.slice(0, WorkflowManager.MAX_COMPLETED).map(wf => ({
        ...wf,
        trace: wf.trace.slice(0, WorkflowManager.MAX_TRACE_PER_WORKFLOW),
      }));
      localStorage.setItem(WorkflowManager.STORAGE_KEY, JSON.stringify(capped));
    } catch {
      // Storage full — silently fail
    }
  }

  getSnapshot = (): ManagerSnapshot => this._snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  /** Load a workflow spec. Persists until explicitly removed. */
  addWorkflow(
    spec: MasterWorkflowSpecification,
    mediaMap: Record<string, string>,
    environments?: MasterEnvironmentLibrary[],
  ): AddWorkflowResult {
    const existing = this._loaded.find(w => w.specOid === spec.oid);
    if (existing) {
      return { duplicateId: existing.id };
    }

    const id = generateUUID();
    const loaded: LoadedWorkflow = {
      id,
      specOid: spec.oid,
      name: spec.description || spec.oid,
      localId: spec.local_id,
      version: spec.version,
      spec,
      mediaMap,
      environments: environments ?? [],
      loadedAt: Date.now(),
    };

    this._loaded = [...this._loaded, loaded];
    this.publish();
    return { id };
  }

  /** Remove a loaded workflow spec (manual delete only). */
  removeLoadedWorkflow(id: string): void {
    const loaded = this._loaded.find(w => w.id === id);
    if (loaded) {
      // Revoke blob URLs — no more instances can use them
      for (const url of Object.values(loaded.mediaMap)) {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      }
    }
    this._loaded = this._loaded.filter(w => w.id !== id);
    this.publish();
  }

  /** Get or create a shared resource manager for workflows sharing environments. */
  private getSharedResourceManager(environments: MasterEnvironmentLibrary[]): InMemoryResourceManager | undefined {
    if (environments.length === 0) return undefined;
    // Build a stable key from sorted environment OIDs
    const envOids = environments
      .flatMap(lib => lib.environment_specifications.map(e => e.oid))
      .sort()
      .join(',');
    if (!envOids) return undefined;
    let rm = this._envResourceManagers.get(envOids);
    if (!rm) {
      rm = new InMemoryResourceManager();
      this._envResourceManagers.set(envOids, rm);
    }
    return rm;
  }

  /**
   * Prepare a new workflow instance from a loaded spec: creates the coordinator,
   * calls coordinator.load(), adds to the active list, subscribes for completion —
   * but does NOT call coordinator.start(). Call runWorkflow(instanceId) to start.
   * Returns the new instanceId, or null if loadedId is not found.
   */
  prepareWorkflow(loadedId: string, startingParams?: Record<string, string>): string | null {
    const loaded = this._loaded.find(w => w.id === loadedId);
    if (!loaded) return null;

    const instanceId = generateUUID();
    const coordinator = new WorkflowCoordinator();

    // Deep-copy the spec so each instance has unique step OIDs
    const instanceSpec = deepCopySpec(loaded.spec);
    const setup = startingParams ? { starting_parameters: startingParams } : undefined;
    const sharedRM = this.getSharedResourceManager(loaded.environments);
    coordinator.load(instanceSpec, setup, { ...loaded.mediaMap }, loaded.environments, sharedRM);

    const active: ActiveWorkflow = {
      id: instanceId,
      sourceSpecId: loaded.id,
      name: loaded.name,
      localId: loaded.localId,
      version: loaded.version,
      coordinator,
      startedAt: Date.now(),
      instanceNumber: null,
    };

    this._active = [...this._active, active];
    this._focusedActiveId = instanceId;
    this.refreshInstanceNumbers();

    // Subscribe to detect completion and pump cross-workflow resource grants
    const unsub = coordinator.subscribe(() => {
      const snap = coordinator.getSnapshot();
      if (snap.workflowState === 'COMPLETED' || snap.workflowState === 'ABORTED'
        || snap.workflowState === 'STOPPED' || snap.workflowState === 'ERRORED') {
        queueMicrotask(() => {
          this.completeWorkflow(instanceId, snap);
        });
      }
      // Pump other active coordinators that share the same resource manager
      this.pumpSiblingCoordinators(instanceId);
    });
    this._coordinatorUnsubs.set(instanceId, unsub);

    this.publish();
    return instanceId;
  }

  /**
   * Start execution of a prepared workflow instance (call after prepareWorkflow and
   * any server binding setup). Pumps siblings after start.
   */
  runWorkflow(instanceId: string): void {
    const active = this._active.find(w => w.id === instanceId);
    if (!active) return;
    active.coordinator.start();
    this.pumpSiblingCoordinators(instanceId);
    this.publish();
  }

  /** Prepare and immediately start a workflow instance. Preserves original behavior. */
  startWorkflow(loadedId: string, startingParams?: Record<string, string>): string | null {
    const instanceId = this.prepareWorkflow(loadedId, startingParams);
    if (instanceId) this.runWorkflow(instanceId);
    return instanceId;
  }

  /** Move an active workflow to the completed list. */
  private completeWorkflow(instanceId: string, finalSnap: any): void {
    const active = this._active.find(w => w.id === instanceId);
    if (!active) return;

    // Unsubscribe from coordinator
    const unsub = this._coordinatorUnsubs.get(instanceId);
    if (unsub) {
      unsub();
      this._coordinatorUnsubs.delete(instanceId);
    }

    // Create completed entry with final state
    const completed: CompletedWorkflow = {
      id: active.id,
      sourceSpecId: active.sourceSpecId,
      name: active.name,
      localId: active.localId,
      version: active.version,
      finalState: finalSnap.workflowState,
      startedAt: active.startedAt,
      finishedAt: Date.now(),
      trace: finalSnap.trace ?? [],
      properties: finalSnap.properties ?? {},
      stepParams: finalSnap.stepParams ?? {},
    };

    // Remove from active
    this._active = this._active.filter(w => w.id !== instanceId);

    // Shift focus
    if (this._focusedActiveId === instanceId) {
      this._focusedActiveId = this._active.length > 0 ? this._active[0].id : null;
    }

    // Reset coordinator to free resources
    active.coordinator.reset();

    // Reassign instance numbers after removal
    this.refreshInstanceNumbers();

    // Add to completed (most recent first)
    this._completed = [completed, ...this._completed];
    this.publish();
    this.persistCompleted();
  }

  /** Remove a completed workflow from the history. */
  removeCompletedWorkflow(id: string): void {
    this._completed = this._completed.filter(w => w.id !== id);
    this.publish();
    this.persistCompleted();
  }

  /** Clear all completed workflows. */
  clearCompleted(): void {
    this._completed = [];
    this.publish();
    this.persistCompleted();
  }

  focusWorkflow(id: string): void {
    if (this._focusedActiveId === id) return;
    const exists = this._active.some(w => w.id === id);
    if (!exists) return;
    this._focusedActiveId = id;
    this.publish();
  }

  getCoordinator(id: string): WorkflowCoordinator | null {
    const active = this._active.find(w => w.id === id);
    return active?.coordinator ?? null;
  }

  /** Pump all active coordinators (except the source) to check for cross-workflow resource grants. */
  private pumpSiblingCoordinators(sourceId: string): void {
    if (this._pumpingInProgress) return;
    this._pumpingInProgress = true;
    try {
      for (const wf of this._active) {
        if (wf.id === sourceId) continue;
        wf.coordinator.pumpSharedResources();
      }
    } finally {
      this._pumpingInProgress = false;
    }
  }

  /** Release all resources across all active workflows. */
  releaseAllResources(): void {
    for (const wf of this._active) {
      wf.coordinator.releaseAllResources();
    }
  }

  /** Aggregate env-resource snapshot across all active workflows, deduplicated by
   *  composite resourceKey (`name` field). When the same env-scoped pool is shared
   *  by multiple workflows, the entry reflects current pool state once. */
  getEnvironmentResourceSnapshot(): import('@engine/types.js').ResourceSnapshotEntry[] {
    const seen = new Map<string, import('@engine/types.js').ResourceSnapshotEntry>();
    for (const wf of this._active) {
      for (const e of wf.coordinator.getEnvironmentResourceSnapshot()) {
        if (!seen.has(e.name)) seen.set(e.name, e);
      }
    }
    return [...seen.values()];
  }

  /** Aggregate workflow-scoped resource snapshot across all active workflows. */
  getWorkflowResourceSnapshot(): import('@engine/types.js').ResourceSnapshotEntry[] {
    const seen = new Map<string, import('@engine/types.js').ResourceSnapshotEntry>();
    for (const wf of this._active) {
      for (const e of wf.coordinator.getWorkflowResourceSnapshot()) {
        if (!seen.has(e.name)) seen.set(e.name, e);
      }
    }
    return [...seen.values()];
  }

  /** Reset all env-scoped resources across all active workflows. Each workflow
   *  triggers the same shared manager, so duplicates are harmless idempotent ops. */
  releaseAllEnvironmentResources(): string[] {
    const released = new Set<string>();
    for (const wf of this._active) {
      for (const r of wf.coordinator.releaseAllEnvironmentResources()) released.add(r);
    }
    return [...released];
  }

  /** Reset all workflow-scoped resources across all active workflows. */
  releaseAllWorkflowResources(): string[] {
    const released = new Set<string>();
    for (const wf of this._active) {
      for (const r of wf.coordinator.releaseAllWorkflowResources()) released.add(r);
    }
    return [...released];
  }

  /** Reset a single resource by composite resourceKey. Tries each coordinator until
   *  one reports the resource exists in its manager view. */
  resetResource(resourceKey: string): boolean {
    for (const wf of this._active) {
      if (wf.coordinator.resetResource(resourceKey)) return true;
    }
    return false;
  }

  /** Assign instance numbers when multiple instances of the same spec are active. */
  private refreshInstanceNumbers(): void {
    // Group active workflows by sourceSpecId
    const groups = new Map<string, ActiveWorkflow[]>();
    for (const wf of this._active) {
      const group = groups.get(wf.sourceSpecId) ?? [];
      group.push(wf);
      groups.set(wf.sourceSpecId, group);
    }
    for (const group of groups.values()) {
      if (group.length <= 1) {
        // Single instance — no number needed
        for (const wf of group) wf.instanceNumber = null;
      } else {
        // Multiple instances — assign sequential numbers by start order
        group.sort((a, b) => a.startedAt - b.startedAt);
        for (let i = 0; i < group.length; i++) {
          group[i].instanceNumber = i + 1;
        }
      }
    }
  }

  private publish(): void {
    this._snapshot = {
      loaded: this._loaded,
      active: this._active,
      completed: this._completed,
      focusedActiveId: this._focusedActiveId,
    };
    for (const listener of this._listeners) listener();
  }
}
