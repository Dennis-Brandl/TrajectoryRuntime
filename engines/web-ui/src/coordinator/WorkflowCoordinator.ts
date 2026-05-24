// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { WorkflowEngine } from '@engine/engine.js';
import { InMemoryResourceManager } from '@engine/resource-manager.js';
import { loadEnvironmentLibrary } from '@engine/environment-loader.js';
import type {
  MasterWorkflowSpecification,
  MasterEnvironmentLibrary,
  WorkflowState,
  TraceEntry,
  UserAction,
  ActiveStepInfo,
  ResourceSnapshotEntry,
} from '@engine/types.js';
import { HttpActionInvoker } from '@engine/http-action-invoker.js';
import type { ConnectionMode } from '@engine/action-invoker.js';
import type { ActionServerSpecification } from '@engine/types.js';
import { KmpWorkflowEngine, initKmpEngine, isKmpReady } from './KmpEngineAdapter.js';

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
  connectivityByStep: Record<string, 'ok' | 'reconnecting' | 'never_connected'>;
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
    connectivityByStep: {},
  };
  private environments: MasterEnvironmentLibrary[] = [];
  private _setup: { starting_parameters?: Record<string, string>; initial_properties?: Record<string, string> } | undefined;
  private _sharedResourceManager: InstanceType<typeof InMemoryResourceManager> | null = null;
  private listeners = new Set<Listener>();
  private _formValues: Record<string, Record<string, unknown>> = {};
  private invoker: HttpActionInvoker | null = null;
  private serverByEnvOid: Map<string, ActionServerSpecification> = new Map();
  private actionProxyMode: ConnectionMode = 'sse-preferred';
  private actionProxyPollMs = 4000;

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

  setActionProxyOptions(mode: ConnectionMode, pollIntervalMs: number): void {
    this.actionProxyMode = mode;
    this.actionProxyPollMs = pollIntervalMs;
  }

  setServerSelections(map: Map<string, ActionServerSpecification>): void {
    this.serverByEnvOid = map;
  }

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
    // Construct invoker, probe capabilities, wire to engine
    this.invoker = new HttpActionInvoker();
    const uniqueUris = new Set<string>();
    for (const server of this.serverByEnvOid.values()) uniqueUris.add(server.uri.trim());
    for (const uri of uniqueUris) {
      void this.invoker.probeCapabilities(uri).then(caps => {
        this.invoker?.setCapabilities(uri, caps);
      });
    }

    this.engine.setActionInvoker(this.invoker, this.serverByEnvOid);
    this.engine.setActionInvokerOptions(this.actionProxyMode, this.actionProxyPollMs);

    this.engine.subscribeConnectivity((stepOid, status) => {
      this.snapshot = {
        ...this.snapshot,
        connectivityByStep: { ...this.snapshot.connectivityByStep, [stepOid]: status },
      };
      this.publish(this.snapshot);
    });

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

  /** Return the deepest active child spec, or the parent spec if no child is active. */
  getActiveSpec(): MasterWorkflowSpecification | null {
    if (!this.engine) return this.workflow;
    return this.engine.getActiveSpec();
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
      connectivityByStep: {},
    });
  }

  stopStep(stepOid: string): void {
    this.engine?.stopStep(stepOid);
    this.sync();
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
    this.publish({ workflowState, activeSteps, trace, properties, inputParameters, error: null, mediaMap: this._mediaMap, stepParams, resources, connectivityByStep: this.snapshot.connectivityByStep });
  }

  private idleSnapshot(): CoordinatorSnapshot {
    return { workflowState: 'IDLE', activeSteps: [], trace: [], properties: {}, inputParameters: {}, error: null, mediaMap: {}, stepParams: {}, resources: [], connectivityByStep: {} };
  }

  private publish(next: CoordinatorSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
