// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { WorkflowEngine } from '@engine/engine.js';
import { InMemoryResourceManager } from '@engine/resource-manager.js';
import { loadEnvironmentLibrary } from '@engine/environment-loader.js';
import type {
  MasterWorkflowSpecification,
  MasterEnvironmentLibrary,
  MasterEnvironmentSpecification,
  WorkflowState,
  TraceEntry,
  UserAction,
  ActiveStepInfo,
  ResourceSnapshotEntry,
} from '@engine/types.js';
import { KmpWorkflowEngine, initKmpEngine, isKmpReady } from './KmpEngineAdapter.js';
import { ActionProxyController } from '../actionProxy/ActionProxyController.js';
import { PersistenceStore } from '../actionProxy/persistence.js';
import { SseObserver } from '../actionProxy/SseObserver.js';
import type { ActionCapability, ActionInstanceObserver } from '../actionProxy/types.js';
import { environmentsNeedingBinding } from '../actionProxy/environmentScan.js';
import { rewriteWorkflowOids } from '../actionProxy/rewriteWorkflowOids.js';

const USE_KMP_ENGINE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_KMP_ENGINE === 'true');

export interface CoordinatorSnapshot {
  workflowState: WorkflowState;
  activeSteps: ActiveStepInfo[];
  trace: TraceEntry[];
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  error: string | null;
  mediaMap: Record<string, string>;
  stepParams: Record<string, { inputParameters: Record<string, string>; outputParameters: Record<string, string>; description: string; label: string; stepType: string }>;
  resources: ResourceSnapshotEntry[];
}

type Listener = () => void;

export class WorkflowCoordinator {
  private engine: WorkflowEngine | null = null;
  private workflow: MasterWorkflowSpecification | null = null;
  private _mediaMap: Record<string, string> = {};
  private actionIndex = 0;
  private snapshot: CoordinatorSnapshot = {
    workflowState: 'IDLE',
    activeSteps: [],
    trace: [],
    properties: {},
    inputParameters: {},
    error: null,
    mediaMap: {},
    stepParams: {},
    resources: [],
  };
  private environments: MasterEnvironmentLibrary[] = [];
  private _setup: { starting_parameters?: Record<string, string>; initial_properties?: Record<string, string> } | undefined;
  private _sharedResourceManager: InstanceType<typeof InMemoryResourceManager> | null = null;
  private listeners = new Set<Listener>();
  private _formValues: Record<string, Record<string, unknown>> = {};
  private _actionControllers = new Map<string, ActionProxyController>();
  private _serverBindings: Record<string, string> = {};
  private _capabilities = new Map<string, Map<string, ActionCapability>>();
  private _persistence = new PersistenceStore();
  private _observer: ActionInstanceObserver = new SseObserver();
  private _workflowInstanceId: string = '';

  getSnapshot = (): CoordinatorSnapshot => this.snapshot;

  /** Get persisted form values for a step (survives component remounts). */
  getFormValues(stepOid: string): Record<string, unknown> {
    return this._formValues[stepOid] ?? {};
  }

  /** Persist a single form field value for a step. */
  setFormValue(stepOid: string, fieldName: string, value: unknown): void {
    if (!this._formValues[stepOid]) this._formValues[stepOid] = {};
    this._formValues[stepOid][fieldName] = value;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Store spec and setup data without creating or starting the engine. */
  load(
    workflow: MasterWorkflowSpecification,
    setup?: { starting_parameters?: Record<string, string>; initial_properties?: Record<string, string> },
    mediaMap?: Record<string, string>,
    environments?: MasterEnvironmentLibrary[],
    sharedResourceManager?: InstanceType<typeof InMemoryResourceManager>,
  ): void {
    this.workflow = workflow;
    this._setup = setup;
    this._mediaMap = mediaMap ?? {};
    this.environments = environments ?? [];
    this._sharedResourceManager = sharedResourceManager ?? null;
    this.actionIndex = 0;
  }

  /** Create the engine and start execution. Must call load() first (or use loadAndStart()). */
  start(): void {
    if (!this.workflow) return;

    const engineSetup: { starting_parameters?: Record<string, string>; initial_properties?: Record<string, string>; resourceManager?: InstanceType<typeof InMemoryResourceManager> } = { ...this._setup };
    if (this.environments.length > 0) {
      // Use shared resource manager if provided (for cross-workflow environment sync),
      // otherwise create a local one
      const resourceManager = this._sharedResourceManager ?? new InMemoryResourceManager();
      const envProperties: Record<string, string> = {};
      for (const env of this.environments) {
        Object.assign(envProperties, loadEnvironmentLibrary(env, resourceManager));
      }
      engineSetup.resourceManager = resourceManager;
      if (Object.keys(envProperties).length > 0) {
        engineSetup.initial_properties = { ...envProperties, ...engineSetup.initial_properties };
      }
    }

    if (USE_KMP_ENGINE && isKmpReady()) {
      this.engine = new KmpWorkflowEngine(this.workflow, engineSetup) as unknown as WorkflowEngine;
    } else {
      this.engine = new WorkflowEngine(this.workflow, engineSetup);
    }
    try {
      this.engine.start();
    } catch (e) {
      this.publish({ ...this.idleSnapshot(), error: String(e) });
      return;
    }
    this.sync();
  }

  /** Load and immediately start a workflow. Preserves backward compatibility. */
  loadAndStart(
    workflow: MasterWorkflowSpecification,
    setup?: { starting_parameters?: Record<string, string>; initial_properties?: Record<string, string> },
    mediaMap?: Record<string, string>,
    environments?: MasterEnvironmentLibrary[],
    sharedResourceManager?: InstanceType<typeof InMemoryResourceManager>,
  ): void {
    this.load(workflow, setup, mediaMap, environments, sharedResourceManager);
    this.start();
  }

  /** Return the stored workflow spec, or null if not loaded. */
  getSpec(): MasterWorkflowSpecification | null {
    return this.workflow;
  }

  /** List environments that need server binding before the engine schedules any ACTION PROXY step. */
  envsNeedingBinding(): MasterEnvironmentSpecification[] {
    if (!this.workflow) return [];
    return environmentsNeedingBinding(this.workflow);
  }

  /** Return the deepest active child spec, or the parent spec if no child is active. */
  getActiveSpec(): MasterWorkflowSpecification | null {
    if (!this.engine) return this.workflow;
    return this.engine.getActiveSpec();
  }

  /** Register server bindings + capabilities for the active workflow (called by picker flow). */
  setServerBindings(workflowInstanceId: string, bindings: Record<string, string>, capabilities: Map<string, Map<string, ActionCapability>>): void {
    this._workflowInstanceId = workflowInstanceId;
    this._serverBindings = bindings;
    this._capabilities = capabilities;
  }

  /**
   * Rewrite authored OIDs in the loaded workflow spec to server-assigned OIDs.
   * Must be called after load() and before start().
   * No-op when rewrites is empty.
   */
  applyOidRewrites(rewrites: Map<string, string>): void {
    if (!this.workflow || rewrites.size === 0) return;
    this.workflow = rewriteWorkflowOids(this.workflow, rewrites);
  }

  /** Get the controller for an active ACTION PROXY step (returns null if none). */
  getActionController(stepInstanceId: string): ActionProxyController | null {
    return this._actionControllers.get(stepInstanceId) ?? null;
  }

  /** Start a controller for an active ACTION PROXY step. */
  startActionProxy(
    stepInstanceId: string,
    stepOid: string,
    actionOid: string,
    environmentOid: string,
    inputs: Array<{ name: string; value: string }>,
    onTerminal: (t: { state: 'COMPLETED' | 'ERRORED'; outputs: Record<string, string>; errorMessage: string | null; failureMode: 'error' | 'abort' | 'timeout' | null }) => void,
    timeoutMs?: number,
  ): ActionProxyController {
    const serverUri = this._serverBindings[environmentOid];
    if (!serverUri) throw new Error(`No server bound for environment ${environmentOid}`);
    const cap = this._capabilities.get(serverUri)?.get(actionOid);
    if (!cap) throw new Error(`No capability cached for action ${actionOid} on ${serverUri}`);
    const controller = new ActionProxyController({
      serverUri,
      actionOid,
      invokeRequest: {
        environment_oid: environmentOid,
        workflow_instance_id: this._workflowInstanceId,
        step_instance_id: stepInstanceId,
        step_oid: stepOid,
        input_parameters: inputs,
      },
      visibility: cap.visibility,
      supportedCommands: cap.supported_commands,
      persistence: this._persistence,
      observer: this._observer,
      timeoutMs,
      onTerminal: t => {
        this._actionControllers.delete(stepInstanceId);
        onTerminal(t);
      },
    });
    this._actionControllers.set(stepInstanceId, controller);
    controller.start().catch(e => {
      this._actionControllers.delete(stepInstanceId);
      onTerminal({ state: 'ERRORED', outputs: {}, errorMessage: String(e instanceof Error ? e.message : e), failureMode: 'error' });
    });
    return controller;
  }

  /**
   * After load() but before start(), call this to detect persisted in-flight
   * instances for this workflow and reconnect them. Terminal instances apply
   * their outputs to the engine; non-terminal ones resume SSE.
   */
  async reconnectPersistedInstances(): Promise<Set<string>> {
    const active = new Set<string>();
    if (!this._workflowInstanceId) return active;
    const persisted = this._persistence.readAll().filter(e => e.workflowInstanceId === this._workflowInstanceId);
    for (const entry of persisted) {
      const capMap = this._capabilities.get(entry.serverUri);
      if (!capMap) continue;
      const controller = new ActionProxyController({
        serverUri: entry.serverUri,
        actionOid: '',
        invokeRequest: {
          environment_oid: entry.environmentOid,
          workflow_instance_id: entry.workflowInstanceId,
          step_instance_id: entry.stepInstanceId,
          step_oid: entry.stepOid,
          input_parameters: [],
        },
        visibility: 'observable',
        supportedCommands: [],
        persistence: this._persistence,
        observer: this._observer,
        onTerminal: _t => {
          this._actionControllers.delete(entry.stepInstanceId);
        },
      });
      this._actionControllers.set(entry.stepInstanceId, controller);
      await controller.reconnect(entry.instanceId, entry.lastEventId);
      const snap = controller.getSnapshot();
      if (snap.serverState && !(['COMPLETED', 'ABORTED', 'STOPPED', 'ERRORED'] as const).includes(snap.serverState as 'COMPLETED' | 'ABORTED' | 'STOPPED' | 'ERRORED')) {
        active.add(entry.stepInstanceId);
      }
    }
    return active;
  }

  /** Abandon workflow: ABORT then DELETE all active instances, then engine abort. */
  async abortWithActionCleanup(): Promise<void> {
    const active = [...this._actionControllers.values()];
    const entries = active
      .map(c => {
        const id = c.getSnapshot().instanceId;
        if (!id) return null;
        const persisted = this._persistence.readAll().find(e => e.instanceId === id);
        if (!persisted) return null;
        return { id, serverUri: persisted.serverUri };
      })
      .filter((x): x is { id: string; serverUri: string } => x !== null);

    await Promise.allSettled(entries.map(({ id, serverUri }) =>
      fetch(`${serverUri}/trajectory/v1/instances/${encodeURIComponent(id)}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'ABORT' }),
      }),
    ));

    await Promise.allSettled(entries.map(({ id, serverUri }) =>
      fetch(`${serverUri}/trajectory/v1/instances/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    ));

    for (const c of active) c.dispose();
    this._actionControllers.clear();
    if (this._workflowInstanceId) this._persistence.removeWorkflow(this._workflowInstanceId);
    this._persistence.flushSync();
    this.abort();
  }

  submitAction(action: UserAction): void {
    if (!this.engine) return;
    try {
      this.engine.submitAction(action, this.actionIndex++);
    } catch (e) {
      this.publish({ ...this.snapshot, error: String(e) });
      return;
    }
    this.sync();
  }

  reset(): void {
    this.engine = null;
    this.workflow = null;
    this.actionIndex = 0;
    this._formValues = {};
    this.publish(this.idleSnapshot());
  }

  /** Re-run the current workflow from scratch. */
  restart(): void {
    this._formValues = {};
    if (this.workflow) {
      this.loadAndStart(this.workflow, this._setup, this._mediaMap, this.environments, this._sharedResourceManager ?? undefined);
    }
  }

  /** Abort the workflow (for ABANDON command). */
  abort(): void {
    for (const c of this._actionControllers.values()) c.dispose();
    this._actionControllers.clear();
    if (this._workflowInstanceId) {
      this._persistence.removeWorkflow(this._workflowInstanceId);
      this._persistence.flushSync();
    }
    if (!this.engine) return;
    this.engine = null;
    this._formValues = {};
    this.publish({
      workflowState: 'ABORTED',
      activeSteps: [],
      trace: this.snapshot.trace,
      properties: this.snapshot.properties,
      inputParameters: {},
      error: null,
      mediaMap: {},
      stepParams: this.snapshot.stepParams,
      resources: [],
    });
  }

  /** Pause all currently EXECUTING steps. */
  pauseAll(): void {
    if (!this.engine) return;
    const activeSteps = this.engine.getActiveSteps();
    for (const stepInfo of activeSteps) {
      if (stepInfo.step.state === 'EXECUTING') {
        this.engine.submitAction({ step_oid: stepInfo.step.oid, action: 'pause' }, this.actionIndex++);
      }
    }
    this.sync();
  }

  /** Resume all currently PAUSED steps. */
  resumeAll(): void {
    if (!this.engine) return;
    const activeSteps = this.engine.getActiveSteps();
    for (const stepInfo of activeSteps) {
      if (stepInfo.step.state === 'PAUSED') {
        this.engine.submitAction({ step_oid: stepInfo.step.oid, action: 'resume' }, this.actionIndex++);
      }
    }
    this.sync();
  }

  /** Release all resources held by this workflow. */
  releaseAllResources(): void {
    if (!this.engine) return;
    this.engine.releaseAllResources();
    this.sync();
  }

  /** Snapshot of env-scoped resources visible from this workflow's engine. */
  getEnvironmentResourceSnapshot(): import('@engine/types.js').ResourceSnapshotEntry[] {
    if (!this.engine) return [];
    return this.engine.getEnvironmentResourceSnapshot();
  }

  /** Snapshot of workflow-scoped resources visible from this workflow's engine. */
  getWorkflowResourceSnapshot(): import('@engine/types.js').ResourceSnapshotEntry[] {
    if (!this.engine) return [];
    return this.engine.getWorkflowResourceSnapshot();
  }

  /** Reset all env-scoped resources to their registered initial state. */
  releaseAllEnvironmentResources(): string[] {
    if (!this.engine) return [];
    const released = this.engine.releaseAllEnvironmentResources();
    this.sync();
    return released;
  }

  /** Reset all workflow-scoped resources visible from this engine. */
  releaseAllWorkflowResources(): string[] {
    if (!this.engine) return [];
    const released = this.engine.releaseAllWorkflowResources();
    this.sync();
    return released;
  }

  /** Reset a single resource by composite resourceKey (the snapshot entry's `name`). */
  resetResource(resourceKey: string): boolean {
    if (!this.engine) return false;
    const ok = this.engine.resetResource(resourceKey);
    if (ok) this.sync();
    return ok;
  }

  /** Check for pending cross-workflow resource grants and resume any unblocked steps. */
  pumpSharedResources(): boolean {
    if (!this.engine) return false;
    const changed = this.engine.pumpSharedResources();
    if (changed) this.sync();
    return changed;
  }

  /** Get completed steps for REPEAT picker. */
  getCompletedSteps(): import('@engine/types.js').CompletedStepInfo[] {
    if (!this.engine) return [];
    return this.engine.getCompletedSteps();
  }

  /** Check safety of repeating to target steps. */
  checkRestartSafety(targetOids: string[]): string[] {
    if (!this.engine) return [];
    return this.engine.checkRestartSafety(targetOids);
  }

  /** Repeat execution from target steps. */
  restartToSteps(targetOids: string[]): void {
    if (!this.engine) return;
    this.engine.restartToSteps(targetOids);
    this.sync();
  }

  private sync(): void {
    if (!this.engine) return;
    const trace = this.engine.getTrace();
    const workflowState = this.engine.getWorkflowState();
    const properties = this.engine.getAllProperties();
    const inputParameters = this.engine.getActiveInputParameters();
    const activeSteps = this.engine.getActiveSteps();
    const stepParamsMap = this.engine.getStepParameterSnapshots();
    const stepParams: Record<string, { inputParameters: Record<string, string>; outputParameters: Record<string, string>; description: string; label: string; stepType: string }> = {};
    for (const [oid, snap] of stepParamsMap) {
      stepParams[oid] = snap;
    }

    const resources = this.engine.getResourceSnapshot();

    // Auto-launch ACTION PROXY controllers when the engine surfaces new active steps.
    // NOTE: Integration test coverage (engine + container) is deferred to manual testing.
    // Unit tests construct ActionProxyController directly and don't exercise this path.
    for (const info of activeSteps) {
      const step = info.step;
      if (step.stepType !== 'ACTION PROXY') continue;
      if (this._actionControllers.has(step.oid)) continue;
      const cfg = step.step.action_proxy_config;
      if (!cfg) continue;
      // In this engine, StepInstance.oid === StepInstance.step.oid (set from MasterWorkflowStep.oid
      // at construction time), so we use step.oid for both the controller key and the engine signal.
      const inputs = stepParamsMap.get(step.oid)?.inputParameters ?? {};
      const inputArr = Object.entries(inputs).map(([name, value]) => ({ name, value }));
      this.startActionProxy(
        step.oid,
        step.oid,
        cfg.action_oid,
        cfg.environment_oid,
        inputArr,
        t => {
          if (!this.engine) return;
          if (t.state === 'COMPLETED') {
            try {
              this.engine.submitAction({ step_oid: step.oid, action: 'submit', form_values: t.outputs }, this.actionIndex++);
              this.sync();
            } catch (e) {
              this.publish({ ...this.snapshot, error: String(e) });
            }
          } else {
            // Real per-step failure: route it into the engine's TRY/CATCH machinery
            // (replaces the Phase-1 empty-submit stub). Maps the web-ui failure vocabulary
            // (lowercase) to the engine's FailureMode (uppercase).
            console.warn(`[ActionProxy] step ${step.oid} terminated as ERRORED (${t.failureMode}): ${t.errorMessage}`);
            try {
              this.engine.submitAction({
                step_oid: step.oid,
                action: 'fail',
                failure_mode: t.failureMode === 'abort' ? 'ABORT' : t.failureMode === 'timeout' ? 'TIMEOUT' : 'ERROR',
                error: t.errorMessage ?? undefined,
              }, this.actionIndex++);
              this.sync();
            } catch (e) {
              this.publish({ ...this.snapshot, error: String(e) });
            }
          }
        },
        cfg.timeout_ms,
      );
    }

    this.publish({ workflowState, activeSteps, trace, properties, inputParameters, error: null, mediaMap: this._mediaMap, stepParams, resources });
  }

  private idleSnapshot(): CoordinatorSnapshot {
    return { workflowState: 'IDLE', activeSteps: [], trace: [], properties: {}, inputParameters: {}, error: null, mediaMap: {}, stepParams: {}, resources: [] };
  }

  private publish(next: CoordinatorSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
