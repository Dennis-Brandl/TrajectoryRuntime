// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type {
  MasterWorkflowSpecification,
  MasterWorkflowStep,
  WorkflowConnection,
  StepState,
  WorkflowState,
  StepInstance,
  TraceEntry,
  UserAction,
  RoutingResult,
  PendingResourceState,
  ResourceCommandSpecification,
  WaitingStepInfo,
  ActiveStepInfo,
  CompletedStepInfo,
  FailureMode,
  CatchContext,
} from './types.js';
import { ACTIVE_STEP_STATES } from './types.js';
import type { ResourceManager } from './resource-manager.js';
import { InMemoryResourceManager } from './resource-manager.js';
import { PropertyStore } from './properties.js';
import { isAutoCompleting, needsUserAction, handleSelect1, handleUserAction, getFormElements, canonicalStepType, executeScript, activateCatchStep } from './step-handlers.js';
import { splitResourceCommands, sortActivationCommands } from './resource-helpers.js';
import { partitionCatchNetworks, type CatchNetworkPartition } from './catch-network-partition.js';

export class WorkflowEngine {
  private steps: Map<string, StepInstance>;
  private connections: WorkflowConnection[];
  private propertyStore: PropertyStore;
  private trace: TraceEntry[];
  private traceOrder: number;
  private workflowState: WorkflowState;
  private pendingUserSteps: Set<string>;
  private waitAllTracking: Map<string, { expected: Set<string>; completed: Set<string> }>;
  private routingContext: Map<string, RoutingResult>;
  private completionQueue: string[];
  private stepDefinitionOrder: string[]; // OIDs in original definition order
  private childWorkflows: Map<string, MasterWorkflowSpecification>; // local_id → spec
  private activeChildEngines: Map<string, WorkflowEngine>; // parent step OID → child engine
  private workflow: MasterWorkflowSpecification;
  private stepParameterSnapshots: Map<string, { inputParameters: Record<string, string>; outputParameters: Record<string, string>; description: string; label: string; stepType: string }>;
  private resourceManager?: ResourceManager;
  private pendingResources: Map<string, PendingResourceState>;
  private instanceId: string;
  private activeCatches: Map<string, CatchContext> = new Map();

  constructor(
    workflow: MasterWorkflowSpecification,
    setup?: { starting_parameters?: Record<string, string>; initial_properties?: Record<string, string>; resourceManager?: ResourceManager },
  ) {
    this.workflow = workflow;
    this.steps = new Map();
    this.stepDefinitionOrder = [];
    this.connections = workflow.connections;
    this.propertyStore = new PropertyStore();
    this.trace = [];
    this.traceOrder = 0;
    this.workflowState = 'IDLE';
    this.pendingUserSteps = new Set();
    this.waitAllTracking = new Map();
    this.routingContext = new Map();
    this.completionQueue = [];
    this.childWorkflows = new Map();
    this.activeChildEngines = new Map();
    this.stepParameterSnapshots = new Map();
    this.resourceManager = setup?.resourceManager;
    this.pendingResources = new Map();
    this.instanceId = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Initialize steps
    for (const step of workflow.steps) {
      const normalized: StepInstance = {
        oid: step.oid,
        stepType: canonicalStepType(step.step_type),
        state: 'IDLE',
        step,
      };
      this.steps.set(step.oid, normalized);
      this.stepDefinitionOrder.push(step.oid);
    }

    // Validate: action local_ids are unique across all environments
    {
      const envs = workflow.environment_specifications ?? [];
      const seenLocalIds = new Map<string, string>();
      for (const env of envs) {
        const actions = (env.included_actions ?? []) as Array<{ local_id: string }>;
        for (const a of actions) {
          const prior = seenLocalIds.get(a.local_id);
          if (prior !== undefined) {
            throw new Error(
              `Workflow has duplicate action local_id "${a.local_id}" in environments ` +
              `"${prior}" and "${env.local_id}". Action local_ids must be unique across environments.`
            );
          }
          seenLocalIds.set(a.local_id, env.local_id);
        }
      }
    }

    // Index child workflows by local_id
    const childSpecs = workflow.children;
    if (childSpecs) {
      for (const cw of childSpecs) {
        this.childWorkflows.set(cw.local_id, cw);
      }
    }

    // Initialize property store
    this.propertyStore.initializeFromWorkflow(workflow);
    if (setup?.initial_properties) {
      this.propertyStore.initializeFromSetup(setup.initial_properties);
    }

    // Initialize workflow-level starting parameters
    this.propertyStore.initializeStartingParameters(
      workflow.starting_parameter_specifications,
      setup?.starting_parameters,
    );
  }

  start(): void {
    this.workflowState = 'RUNNING';

    // Auto-create ResourceManager if workflow defines resources or any step/child has resource commands
    if (!this.resourceManager) {
      const hasResourceSpecs = !!this.workflow.resource_property_specifications?.length;
      const hasResourceCmds = this.workflow.steps.some(s => s.resource_command_specifications?.length);
      const allChildren = this.workflow.children;
      const childHasResourceCmds = allChildren?.some(cw =>
        cw.steps.some(s => s.resource_command_specifications?.length),
      );
      const hasEnvResources = this.workflow.environment_specifications?.some(
        env => env.resource_property_specifications?.length,
      );
      if (hasResourceSpecs || hasResourceCmds || childHasResourceCmds || hasEnvResources) {
        this.resourceManager = new InMemoryResourceManager();
      }
    }

    // Register workflow-scoped resources (keyed by spec oid:name)
    if (this.resourceManager && this.workflow.resource_property_specifications) {
      for (const spec of this.workflow.resource_property_specifications) {
        if (spec.scope !== 'environment') {
          const resourceKey = `${this.workflow.oid}:${spec.name}`;
          this.resourceManager.registerResource(resourceKey, spec, this.workflow.oid, 'workflow');
        }
      }
    }

    // Register environment-scoped resources (keyed by env oid:name)
    if (this.resourceManager && this.workflow.environment_specifications) {
      for (const envSpec of this.workflow.environment_specifications) {
        if (envSpec.resource_property_specifications) {
          for (const spec of envSpec.resource_property_specifications) {
            const resourceKey = `${envSpec.oid}:${spec.name}`;
            this.resourceManager.registerResource(resourceKey, spec, envSpec.oid, 'environment');
          }
        }
      }
    }

    // Find START step
    const startStep = [...this.steps.values()].find(s => s.stepType === 'START');
    if (!startStep) throw new Error('No START step found');

    // START auto-completes immediately
    this.recordTrace(startStep.oid, 'COMPLETED');
    startStep.state = 'COMPLETED';
    this.completionQueue.push(startStep.oid);
    this.drainCompletionQueue();
  }

  submitAction(action: UserAction, _actionIndex: number): void {
    // Check if the action is for a child engine
    for (const [parentOid, childEngine] of this.activeChildEngines) {
      if (childEngine.hasStep(action.step_oid)) {
        childEngine.submitAction(action, _actionIndex);
        // Child may have released resources — flush grants at parent level
        this.resumeGrantedSteps();
        // Check if child completed
        if (childEngine.getWorkflowState() === 'COMPLETED') {
          this.completeChildWorkflow(parentOid, childEngine);
        }
        return;
      }
    }

    const stepInstance = this.steps.get(action.step_oid);
    if (!stepInstance) throw new Error(`Step ${action.step_oid} not found`);

    // Handle pause/resume without completing the step
    if (action.action === 'pause') {
      this.pauseStep(action.step_oid);
      return;
    }
    if (action.action === 'resume') {
      this.resumeStep(action.step_oid);
      return;
    }

    if (stepInstance.state !== 'EXECUTING') throw new Error(`Step ${action.step_oid} is not EXECUTING`);

    if (action.action === 'fail') {
      this.handleStepFailure(stepInstance, action.failure_mode ?? 'ERROR', action.error ?? null, _actionIndex);
      return;
    }

    // Handle the action
    const routing = handleUserAction(stepInstance.step, action, this.propertyStore);

    // Snapshot output parameters for this step
    const snapshot = this.stepParameterSnapshots.get(stepInstance.oid);
    if (snapshot) {
      // Capture from output_parameter_specifications
      if (stepInstance.step.output_parameter_specifications) {
        for (const spec of stepInstance.step.output_parameter_specifications) {
          const key = spec.target ?? spec.id;
          const value = this.propertyStore.get(key);
          if (value !== undefined) {
            snapshot.outputParameters[key] = value;
          }
        }
      }
      // Capture form element outputs
      if (action.form_values) {
        const elements = getFormElements(stepInstance.step);
        for (const el of elements) {
          if ('outputParameter' in el && el.outputParameter) {
            const spec = stepInstance.step.output_parameter_specifications?.find(s => s.id === el.outputParameter);
            const key = spec?.target ?? el.outputParameter;
            const value = this.propertyStore.get(key);
            if (value !== undefined) {
              snapshot.outputParameters[key] = value;
            }
          }
        }
      }
    }

    // Complete the step
    this.recordTrace(stepInstance.oid, 'COMPLETED', _actionIndex);
    stepInstance.state = 'COMPLETED';
    this.pendingUserSteps.delete(stepInstance.oid);

    // Store routing context
    if (routing.conditionValue || routing.connectionId) {
      this.routingContext.set(stepInstance.oid, routing);
    }

    this.completionQueue.push(stepInstance.oid);
    this.drainCompletionQueue();
  }

  private handleStepFailure(stepInstance: StepInstance, mode: FailureMode, error: string | null, actionIndex: number): void {
    const matching = stepInstance.step.try_specifications?.find(t => t.mode === mode);
    const catchStep = matching ? this.findCatchByCatchId(matching.catch_id) : undefined;

    if (matching && catchStep) {
      if (this.activeCatches.has(catchStep.oid)) {
        // CATCH_REENTRY (spec §6.4): the catch is already active → abort the workflow.
        this.recordTrace(stepInstance.oid, 'ERRORED', actionIndex, `CATCH_REENTRY on ${matching.catch_id}`);
        stepInstance.state = 'ERRORED';
        this.workflowState = 'ABORTED';
        return;
      }
      this.activeCatches.set(catchStep.oid, {
        catch_oid: catchStep.oid,
        trigger_step_oid: stepInstance.oid,
        trigger_step_name: stepInstance.step.local_id,
        trigger_reason: mode,
        error_message: error,
        activated_at: new Date().toISOString(),
      });
      // Deactivate the trigger step (caught — do NOT propagate failure).
      this.recordTrace(stepInstance.oid, 'IDLE', actionIndex);
      stepInstance.state = 'IDLE';
      this.pendingUserSteps.delete(stepInstance.oid);
      this.pendingResources.delete(stepInstance.oid);
      // Run the catch network.
      this.activateStep(catchStep);
      this.drainCompletionQueue();
      return;
    }

    // No matching TRY — uncaught failure errors the workflow (mirrors the SCRIPT-error path).
    this.recordTrace(stepInstance.oid, 'ERRORED', actionIndex, error ?? undefined);
    stepInstance.state = 'ERRORED';
    this.workflowState = 'ERRORED';
    this.pendingUserSteps.delete(stepInstance.oid);
    this.pendingResources.delete(stepInstance.oid);
    if (this.resourceManager) {
      const known = new Set<string>();
      this.collectKnownStepOids(known);
      this.resourceManager.cancelQueuedWaiters(known);
    }
  }

  private findCatchByCatchId(catchId: string): StepInstance | undefined {
    for (const s of this.steps.values()) {
      if (s.stepType === 'CATCH' && s.step.catch_id === catchId) return s;
    }
    return undefined;
  }

  private buildPartition(): CatchNetworkPartition {
    const steps = [...this.steps.values()].map(s => ({ oid: s.oid, step_type: s.stepType, catch_id: s.step.catch_id }));
    const conns = this.connections.map(c => ({ from_step_id: c.from_step_id, to_step_id: c.to_step_id }));
    return partitionCatchNetworks(steps, conns);
  }

  private findActiveCatchForReturn(returnOid: string): string | undefined {
    const partition = this.buildPartition();
    for (const [catchId, net] of partition.networksByCatchId) {
      if (net.has(returnOid)) {
        const catchStep = this.findCatchByCatchId(catchId);
        if (catchStep && this.activeCatches.has(catchStep.oid)) return catchStep.oid;
      }
    }
    return undefined;
  }

  private cleanupCatchNetwork(catchOid: string): void {
    const catchStep = this.steps.get(catchOid);
    const cid = catchStep?.step.catch_id;
    const net = cid ? this.buildPartition().networksByCatchId.get(cid) : undefined;
    for (const oid of net ?? []) {
      const st = this.steps.get(oid);
      if (st && st.state !== 'IDLE') { this.recordTrace(oid, 'IDLE'); st.state = 'IDLE'; }
    }
  }

  private dispatchReturn(returnStep: StepInstance): void {
    const rc = returnStep.step.return_config;
    if (!rc) return;
    const catchOid = this.findActiveCatchForReturn(returnStep.oid);
    const ctx = catchOid ? this.activeCatches.get(catchOid) : undefined;
    switch (rc.command) {
      case 'ABANDON': this.returnAbandon(); break;
      case 'RESTART': this.returnRestart(rc.restart_mode ?? 'KEEP'); break; // Task E2
      case 'GOTO': if (rc.goto_step_oid) this.returnGoto(rc.goto_step_oid); break; // Task E3
      case 'RETRY': this.returnRetry(ctx); break; // Task E4
    }
    if (catchOid) {
      this.cleanupCatchNetwork(catchOid);
      this.activeCatches.delete(catchOid);
    }
  }

  private returnAbandon(): void {
    for (const step of this.steps.values()) {
      if (ACTIVE_STEP_STATES.has(step.state)) { this.recordTrace(step.oid, 'IDLE'); step.state = 'IDLE'; }
    }
    this.completionQueue.length = 0; // cancel any queued activations
    if (this.resourceManager) this.releaseAllResources();
    this.workflowState = 'ABORTED';
  }

  // Stubs — implemented in later tasks. dispatchReturn already routes to them.
  private returnRestart(mode: 'CLEAN' | 'KEEP'): void { /* Task E2 */ void mode; }
  private returnGoto(gotoOid: string): void { /* Task E3 */ void gotoOid; }
  private returnRetry(ctx?: CatchContext): void { /* Task E4 */ void ctx; }

  /** Check if this engine (or any child engine) owns a step OID. */
  hasStep(stepOid: string): boolean {
    if (this.steps.has(stepOid)) return true;
    for (const childEngine of this.activeChildEngines.values()) {
      if (childEngine.hasStep(stepOid)) return true;
    }
    return false;
  }

  getTrace(): TraceEntry[] {
    const result = [...this.trace];
    for (const childEngine of this.activeChildEngines.values()) {
      result.push(...childEngine.getTrace());
    }
    return result;
  }

  getWorkflowState(): WorkflowState {
    return this.workflowState;
  }

  /** Test/observability accessor: count of currently-active catch contexts. */
  activeCatchesSize(): number { return this.activeCatches.size; }

  /** Return the deepest active child workflow spec, or this workflow's spec if no child is active. */
  getActiveSpec(): MasterWorkflowSpecification {
    for (const childEngine of this.activeChildEngines.values()) {
      return childEngine.getActiveSpec();
    }
    return this.workflow;
  }

  getProperties(): Record<string, string> {
    return this.propertyStore.toFlatMap();
  }

  getInputParameters(): Record<string, string> {
    return this.propertyStore.getInputParameters();
  }

  /** Get all executing steps including those in child workflows. */
  getExecutingSteps(): StepInstance[] {
    const result: StepInstance[] = [];
    for (const step of this.steps.values()) {
      if (step.state === 'EXECUTING'
        && !this.activeChildEngines.has(step.oid)
        && step.stepType !== 'WAIT ALL') {
        result.push(step);
      }
    }
    // Include child engine executing steps
    for (const childEngine of this.activeChildEngines.values()) {
      result.push(...childEngine.getExecutingSteps());
    }
    return result;
  }

  /** Get all waiting steps (blocked on resources) including child workflows. */
  getWaitingSteps(): WaitingStepInfo[] {
    const result: WaitingStepInfo[] = [];
    for (const step of this.steps.values()) {
      if (step.state === 'WAITING') {
        const pending = this.pendingResources.get(step.oid);
        result.push({
          step,
          workflowName: this.workflow.local_id,
          resourceName: pending?.blockedOn?.resource_name ?? 'unknown',
          commandType: pending?.blockedOn?.command_type ?? 'Acquire',
        });
      }
    }
    for (const childEngine of this.activeChildEngines.values()) {
      result.push(...childEngine.getWaitingSteps());
    }
    return result;
  }

  /** Get all steps in an active (UI-visible) state, including child workflows. */
  getActiveSteps(): ActiveStepInfo[] {
    const result: ActiveStepInfo[] = [];
    for (const step of this.steps.values()) {
      if (!ACTIVE_STEP_STATES.has(step.state)) continue;
      if (this.activeChildEngines.has(step.oid)) continue;
      if (step.stepType === 'WAIT ALL') continue;

      const info: ActiveStepInfo = { step, workflowName: this.workflow.local_id };
      if (step.state === 'WAITING') {
        const pending = this.pendingResources.get(step.oid);
        info.waitingOn = {
          resourceName: pending?.blockedOn?.resource_name ?? 'unknown',
          commandType: pending?.blockedOn?.command_type ?? 'Acquire',
        };
      }
      result.push(info);
    }
    for (const childEngine of this.activeChildEngines.values()) {
      result.push(...childEngine.getActiveSteps());
    }
    return result;
  }

  /** Get all user-visible completed steps (excludes auto-completing types). */
  getCompletedSteps(): CompletedStepInfo[] {
    const autoTypes = new Set(['START', 'END', 'PARALLEL', 'WAIT ALL', 'WAIT ANY', 'SELECT 1', 'SELECT_1', 'SCRIPT', 'MATH']);
    const result: CompletedStepInfo[] = [];
    for (const step of this.steps.values()) {
      if (step.state !== 'COMPLETED') continue;
      if (autoTypes.has(canonicalStepType(step.stepType))) continue;
      const traceEntry = this.trace.find(t => t.step_oid === step.oid && t.state === 'COMPLETED');
      result.push({
        oid: step.oid,
        localId: step.step.local_id,
        stepType: step.stepType,
        description: step.step.description ?? step.stepType,
        completedOrder: traceEntry?.order ?? 0,
        completedAt: traceEntry?.timestamp ?? Date.now(),
      });
    }
    result.sort((a, b) => a.completedOrder - b.completedOrder);
    return result;
  }

  /** Pause an EXECUTING step. */
  pauseStep(stepOid: string): void {
    const step = this.steps.get(stepOid);
    if (step && step.state === 'EXECUTING') {
      step.state = 'PAUSED';
      this.recordTrace(stepOid, 'PAUSED');
    } else {
      // Try child engines
      for (const child of this.activeChildEngines.values()) {
        child.pauseStep(stepOid);
      }
    }
  }

  /** Resume a PAUSED step back to EXECUTING. */
  resumeStep(stepOid: string): void {
    const step = this.steps.get(stepOid);
    if (step && step.state === 'PAUSED') {
      step.state = 'EXECUTING';
      this.recordTrace(stepOid, 'EXECUTING');
    } else {
      // Try child engines
      for (const child of this.activeChildEngines.values()) {
        child.resumeStep(stepOid);
      }
    }
  }

  /** Get all child engine input parameters (deepest active child wins). */
  getActiveInputParameters(): Record<string, string> {
    for (const childEngine of this.activeChildEngines.values()) {
      const childParams = childEngine.getActiveInputParameters();
      if (Object.keys(childParams).length > 0) return childParams;
    }
    return this.propertyStore.getInputParameters();
  }

  /** Get per-step parameter snapshots including child engines. */
  getStepParameterSnapshots(): Map<string, { inputParameters: Record<string, string>; outputParameters: Record<string, string>; description: string; label: string; stepType: string }> {
    const result = new Map(this.stepParameterSnapshots);
    for (const childEngine of this.activeChildEngines.values()) {
      for (const [oid, snap] of childEngine.getStepParameterSnapshots()) {
        result.set(oid, snap);
      }
    }
    return result;
  }

  /** Get all properties merged from this engine and active children. */
  getAllProperties(): Record<string, string> {
    const props = this.propertyStore.toFlatMap();
    for (const childEngine of this.activeChildEngines.values()) {
      Object.assign(props, childEngine.getAllProperties());
    }
    return props;
  }

  getResourceSnapshot(): import('./types.js').ResourceSnapshotEntry[] {
    if (!this.resourceManager || !('getSnapshot' in this.resourceManager)) return [];
    return (this.resourceManager as import('./resource-manager.js').InMemoryResourceManager).getSnapshot();
  }

  /** Snapshot of env-scoped resources visible to this engine. */
  getEnvironmentResourceSnapshot(): import('./types.js').ResourceSnapshotEntry[] {
    return this.getResourceSnapshot().filter(e => e.scope === 'environment');
  }

  /** Snapshot of workflow-scoped resources visible to this engine (master + descendants). */
  getWorkflowResourceSnapshot(): import('./types.js').ResourceSnapshotEntry[] {
    return this.getResourceSnapshot().filter(e => e.scope === 'workflow');
  }

  releaseAllResources(): void {
    if (this.resourceManager) {
      // Per the model, per-workflow tracking is intentionally absent — there's no way
      // for the engine to know what this workflow holds. Cancel any of its queued
      // waiters and discard pending grants. Pool state is the workflow author's
      // responsibility (release via Release commands).
      const known = new Set<string>();
      this.collectKnownStepOids(known);
      this.resourceManager.cancelQueuedWaiters(known);
      this.resourceManager.flushGranted(known);
    }
  }

  /** Explicit user action: reset every env-scoped resource to its registered initial
   *  state. Returns the resourceKeys that had non-default state. */
  releaseAllEnvironmentResources(): string[] {
    if (!this.resourceManager) return [];
    const keys = new Set(this.getEnvironmentResourceSnapshot().map(e => e.name));
    return keys.size === 0 ? [] : this.resourceManager.resetResources(keys);
  }

  /** Explicit user action: reset every workflow-scoped resource visible from this engine. */
  releaseAllWorkflowResources(): string[] {
    if (!this.resourceManager) return [];
    const keys = new Set(this.getWorkflowResourceSnapshot().map(e => e.name));
    return keys.size === 0 ? [] : this.resourceManager.resetResources(keys);
  }

  /** Reset a single resource by composite resourceKey. Returns true if the key existed
   *  in the manager (regardless of whether anything was actually held before reset). */
  resetResource(resourceKey: string): boolean {
    if (!this.resourceManager) return false;
    if (!this.resourceManager.hasResource(resourceKey)) return false;
    this.resourceManager.resetResources(new Set([resourceKey]));
    return true;
  }

  private activateWorkflowProxy(target: StepInstance): void {
    const childSpec = this.childWorkflows.get(target.step.local_id);
    if (!childSpec) {
      // No child workflow found — auto-complete as no-op
      this.recordTrace(target.oid, 'COMPLETED');
      target.state = 'COMPLETED';
      this.completionQueue.push(target.oid);
      return;
    }

    // Resolve parent step's input params → child's starting params
    const startingParams: Record<string, string> = {};
    if (target.step.input_parameter_specifications && childSpec.starting_parameter_specifications) {
      for (const childParam of childSpec.starting_parameter_specifications) {
        // Find matching parent input param by ID
        const parentParam = target.step.input_parameter_specifications.find(p => p.id === childParam.id);
        if (parentParam) {
          let value = parentParam.default_value;
          if (parentParam.value_type === 'property') {
            value = this.propertyStore.resolveKey(parentParam.default_value);
          }
          startingParams[childParam.id] = value;
        }
      }
    }

    // Share the parent's properties with the child
    const initialProperties = this.propertyStore.toFlatMap();

    // Create and start child engine (spec already has unique OIDs from manager-level deep copy)
    const childEngine = new WorkflowEngine(childSpec, {
      starting_parameters: startingParams,
      initial_properties: initialProperties,
      resourceManager: this.resourceManager,
    });

    // Mark parent step as EXECUTING
    this.recordTrace(target.oid, 'EXECUTING');
    target.state = 'EXECUTING';

    childEngine.start();

    if (childEngine.getWorkflowState() === 'COMPLETED') {
      // Child auto-completed (no user steps)
      this.completeChildWorkflow(target.oid, childEngine);
    } else {
      // Child needs user interaction — store it
      this.activeChildEngines.set(target.oid, childEngine);
    }
  }

  private completeChildWorkflow(parentStepOid: string, childEngine: WorkflowEngine): void {
    // Absorb child trace and parameter snapshots before removing the child engine
    this.trace.push(...childEngine.getTrace());
    for (const [oid, snap] of childEngine.getStepParameterSnapshots()) {
      this.stepParameterSnapshots.set(oid, snap);
    }

    this.activeChildEngines.delete(parentStepOid);

    const parentStep = this.steps.get(parentStepOid);
    if (!parentStep) return;

    // Map child output params → parent step output params → property store
    const childSpec = this.childWorkflows.get(parentStep.step.local_id);
    if (childSpec?.output_parameter_specifications && parentStep.step.output_parameter_specifications) {
      const childProps = childEngine.getProperties();
      for (const childOutParam of childSpec.output_parameter_specifications) {
        // Find matching parent output param
        const parentOutParam = parentStep.step.output_parameter_specifications.find(
          p => p.id === childOutParam.id,
        );
        if (parentOutParam?.target) {
          // Get the child's output value and write to parent's target property
          const value = childProps[childOutParam.id] ?? '';
          this.propertyStore.set(parentOutParam.target, value);
        }
      }
    }

    // Complete the parent step
    this.recordTrace(parentStepOid, 'COMPLETED');
    parentStep.state = 'COMPLETED';
    this.completionQueue.push(parentStepOid);
    this.drainCompletionQueue();
  }

  private recordTrace(stepOid: string, state: string, afterAction?: number, error?: string): void {
    this.traceOrder++;
    const entry: TraceEntry = { step_oid: stepOid, state, order: this.traceOrder, timestamp: Date.now() };
    if (afterAction !== undefined) {
      entry.after_action = afterAction;
    }
    if (error !== undefined) {
      entry.error = error;
    }
    this.trace.push(entry);
  }

  private drainCompletionQueue(): void {
    while (this.completionQueue.length > 0) {
      const stepOid = this.completionQueue.shift()!;

      // Process release commands for completing step
      this.processReleaseCommands(stepOid);

      // Resume any steps unblocked by the releases
      this.resumeGrantedSteps();

      const outgoing = this.getRoutedConnections(stepOid);

      for (const conn of outgoing) {
        const targetOid = conn.to_step_id;
        const target = this.steps.get(targetOid);
        if (!target) continue;

        if (target.stepType === 'WAIT ALL') {
          this.handleWaitAllArrival(target, stepOid);
        } else {
          this.activateStep(target);
        }
      }
    }

    // Post-wave: pre-activate WAIT ALL steps still in IDLE
    this.activatePendingWaitAlls();
    this.checkWorkflowCompletion();
  }

  private processReleaseCommands(stepOid: string): void {
    const pending = this.pendingResources.get(stepOid);
    if (!pending || pending.completionCommands.length === 0 || !this.resourceManager) return;

    const sorted = [...pending.completionCommands].sort((a, b) => a.resource_name.localeCompare(b.resource_name));

    for (const cmd of sorted) {
      const resourceKey = this.buildResourceKey(cmd);

      if (cmd.command_type === 'Release' || cmd.command_type === 'Release Pool Amount') {
        // For named pools, the workflow author specifies cmd.target — the property
        // holding the assigned name to return. The manager has no holder tracking,
        // so the author is responsible for releasing the right name/amount.
        const name = cmd.target ? this.propertyStore.get(cmd.target) : undefined;
        this.resourceManager.release(resourceKey, cmd.amount, name);
      }
    }

    this.pendingResources.delete(stepOid);
  }

  /** Collect all step OIDs known to this engine and its children. */
  private collectKnownStepOids(out: Set<string>): void {
    for (const oid of this.steps.keys()) out.add(oid);
    for (const child of this.activeChildEngines.values()) {
      child.collectKnownStepOids(out);
    }
  }

  /** Check for pending resource grants from a shared resource manager and resume any unblocked steps.
   *  Returns true if any steps were resumed. Called by the coordinator for cross-workflow sync. */
  pumpSharedResources(): boolean {
    if (!this.resourceManager) return false;
    const knownOids = new Set<string>();
    this.collectKnownStepOids(knownOids);
    const granted = this.resourceManager.flushGranted(knownOids);
    if (granted.length === 0) return false;
    this.processGrantedSteps(granted);
    return true;
  }

  private resumeGrantedSteps(): void {
    if (!this.resourceManager) return;
    // Filter by this engine's known step OIDs so cross-workflow grants
    // (e.g. a sibling's Receive step waiting on our Send) stay in the
    // shared queue for the sibling's pumpSharedResources() to pick up.
    const knownOids = new Set<string>();
    this.collectKnownStepOids(knownOids);
    const granted = this.resourceManager.flushGranted(knownOids);
    this.processGrantedSteps(granted);
  }

  private processGrantedSteps(granted: { stepOid: string; resourceKey: string }[]): void {
    for (const grant of granted) {
      // Find the step in this engine or any child engine
      const stepInstance = this.findStepInTree(grant.stepOid);
      if (!stepInstance || stepInstance.state !== 'WAITING') continue;

      const pending = this.pendingResources.get(grant.stepOid)
        ?? this.findPendingInChildren(grant.stepOid);
      if (!pending) {
        stepInstance.state = 'IDLE';
        // Find the engine that owns this step and activate it there
        this.activateStepInTree(stepInstance);
        continue;
      }

      // Check for sync data delivery
      if (this.resourceManager) {
        const syncData = this.resourceManager.getSyncData(grant.stepOid);
        if (syncData !== undefined) {
          const receiveCmd = stepInstance.step.resource_command_specifications?.find(c => c.command_type === 'Receive');
          if (receiveCmd?.target) {
            this.propertyStore.setSyncTarget(receiveCmd.target, syncData);
          }
          this.resourceManager.clearSyncData(grant.stepOid);
        }
      }

      // Check for named-pool name assignment (queued Acquire that's now granted).
      // The manager reserved a name when the pool freed up; write it to the Acquire's
      // cmd.target so downstream commands and completion callers see it.
      if (this.resourceManager) {
        const assignedName = this.resourceManager.consumePendingNamedAssignment(grant.stepOid);
        if (assignedName !== undefined) {
          const acquireCmd = stepInstance.step.resource_command_specifications?.find(c =>
            (c.command_type === 'Acquire' || c.command_type === 'Acquire Pool Amount')
            && this.buildResourceKey(c) === grant.resourceKey,
          );
          if (acquireCmd?.target) {
            this.propertyStore.set(acquireCmd.target, assignedName);
          }
        }
      }

      // Resume remaining activation commands
      if (pending.remainingCommands.length > 0) {
        const allGranted = this.executeActivationCommands(stepInstance, pending.remainingCommands, pending.completionCommands);
        if (!allGranted) continue; // still blocked
      }

      // All activation commands done — find the owning engine to continue activation
      stepInstance.state = 'IDLE';
      if (pending.completionCommands.length > 0) {
        this.setPendingInTree(grant.stepOid, {
          stepOid: grant.stepOid,
          remainingCommands: [],
          completionCommands: pending.completionCommands,
        });
      } else {
        this.deletePendingInTree(grant.stepOid);
      }

      this.activateStepInTree(stepInstance);
    }
  }

  /** Find a step by OID in this engine or any child engine. */
  private findStepInTree(stepOid: string): StepInstance | undefined {
    const local = this.steps.get(stepOid);
    if (local) return local;
    for (const childEngine of this.activeChildEngines.values()) {
      const found = childEngine.findStepInTree(stepOid);
      if (found) return found;
    }
    return undefined;
  }

  /** Find pending resource state in child engines. */
  private findPendingInChildren(stepOid: string): PendingResourceState | undefined {
    for (const childEngine of this.activeChildEngines.values()) {
      const pending = childEngine.pendingResources.get(stepOid);
      if (pending) return pending;
      const found = childEngine.findPendingInChildren(stepOid);
      if (found) return found;
    }
    return undefined;
  }

  /** Set pending resource state in the correct engine in the tree. */
  private setPendingInTree(stepOid: string, state: PendingResourceState): void {
    if (this.steps.has(stepOid)) {
      this.pendingResources.set(stepOid, state);
      return;
    }
    for (const childEngine of this.activeChildEngines.values()) {
      childEngine.setPendingInTree(stepOid, state);
    }
  }

  /** Delete pending resource state from the correct engine in the tree. */
  private deletePendingInTree(stepOid: string): void {
    if (this.pendingResources.has(stepOid)) {
      this.pendingResources.delete(stepOid);
      return;
    }
    for (const childEngine of this.activeChildEngines.values()) {
      childEngine.deletePendingInTree(stepOid);
    }
  }

  /** Activate a step in whichever engine owns it. */
  private activateStepInTree(step: StepInstance): void {
    if (this.steps.has(step.oid)) {
      this.activateStepAfterResources(step);
      return;
    }
    for (const childEngine of this.activeChildEngines.values()) {
      childEngine.activateStepInTree(step);
    }
  }

  /** Build composite resource key from a resource command. */
  private buildResourceKey(cmd: ResourceCommandSpecification): string {
    const sourceOid = cmd.resource_source_oid ?? this.workflow.oid;
    return `${sourceOid}:${cmd.resource_name}`;
  }

  private processResourceCommands(target: StepInstance): boolean {
    const cmds = target.step.resource_command_specifications;
    if (!cmds || cmds.length === 0 || !this.resourceManager) return true;

    const { activation, completion } = splitResourceCommands(cmds);
    const sorted = sortActivationCommands(activation);
    const sortedCompletion = [...completion].sort((a, b) => a.resource_name.localeCompare(b.resource_name));

    return this.executeActivationCommands(target, sorted, sortedCompletion);
  }

  private executeActivationCommands(
    target: StepInstance,
    remaining: ResourceCommandSpecification[],
    completionCommands: ResourceCommandSpecification[],
  ): boolean {
    const mgr = this.resourceManager!;

    for (let i = 0; i < remaining.length; i++) {
      const cmd = remaining[i];
      const resourceKey = this.buildResourceKey(cmd);
      let blocked = false;

      switch (cmd.command_type) {
        case 'Acquire': {
          const result = mgr.acquire(resourceKey, target.oid, cmd.amount);
          if (!result.granted) { blocked = true; break; }
          if (result.name && cmd.target) {
            this.propertyStore.set(cmd.target, result.name);
          }
          break;
        }
        case 'Acquire Pool Amount': {
          const result = mgr.acquire(resourceKey, target.oid, cmd.amount);
          if (!result.granted) { blocked = true; break; }
          break;
        }
        case 'Send': {
          // resolveKey falls back to JSON-serialized group entries when the source
          // names a parent property (e.g. "TransferData" with TransferData.Name,
          // TransferData.Address, ...). Plain get() only does exact-match lookup.
          const data = cmd.source ? this.propertyStore.resolveKey(cmd.source) : '';
          const result = mgr.send(resourceKey, target.oid, data);
          if (!result.ready) { blocked = true; break; }
          break;
        }
        case 'Receive': {
          const result = mgr.receive(resourceKey, target.oid);
          if (!result.available) { blocked = true; break; }
          if (cmd.target) {
            this.propertyStore.setSyncTarget(cmd.target, result.data);
          }
          break;
        }
        case 'Synchronize': {
          const result = mgr.synchronize(resourceKey, target.oid);
          if (!result.ready) { blocked = true; break; }
          break;
        }
      }

      if (blocked) {
        const blockedCmd = remaining[i];
        this.pendingResources.set(target.oid, {
          stepOid: target.oid,
          blockedOn: { resource_name: blockedCmd.resource_name, command_type: blockedCmd.command_type },
          remainingCommands: remaining.slice(i + 1),
          completionCommands,
        });
        this.recordTrace(target.oid, 'WAITING');
        target.state = 'WAITING';
        return false;
      }
    }

    if (completionCommands.length > 0) {
      this.pendingResources.set(target.oid, {
        stepOid: target.oid,
        remainingCommands: [],
        completionCommands,
      });
    }
    return true;
  }

  private activateStep(target: StepInstance): void {
    // Allow cycle re-entry: reset COMPLETED steps back to IDLE
    if (target.state === 'COMPLETED') {
      target.state = 'IDLE';
      this.routingContext.delete(target.oid);
      this.pendingResources.delete(target.oid);
    }

    if (target.state !== 'IDLE') return;

    // Process resource activation commands first (may block and enter WAITING)
    if (!this.processResourceCommands(target)) {
      return; // step is WAITING on resources
    }

    this.activateStepAfterResources(target);
  }

  private activateStepAfterResources(target: StepInstance): void {
    // Resolve input parameters AFTER resources are granted, so params can reference
    // acquired resource names (via target property) and sync-received data
    this.propertyStore.resolveInputParameters(target.step.input_parameter_specifications);

    // Snapshot input parameters for this step
    this.stepParameterSnapshots.set(target.oid, {
      inputParameters: { ...this.propertyStore.getInputParameters() },
      outputParameters: {},
      description: target.step.description ?? target.stepType,
      label: target.step.local_id,
      stepType: target.stepType,
    });

    if (target.stepType === 'WORKFLOW PROXY') {
      this.activateWorkflowProxy(target);
      return;
    }

    if (target.stepType === 'RETURN') {
      this.recordTrace(target.oid, 'COMPLETED');
      target.state = 'COMPLETED';
      this.dispatchReturn(target);
      return; // RETURN's command is terminal/redirective — do not fall through.
    }

    if (isAutoCompleting(target.stepType)) {
      if (target.stepType === 'SELECT 1' || target.stepType === 'SELECT_1') {
        const routing = handleSelect1(target.step, this.propertyStore);
        if (routing.connectionId) {
          this.routingContext.set(target.oid, routing);
        }
      }
      if (target.stepType === 'SCRIPT') {
        const inputParams = this.stepParameterSnapshots.get(target.oid)?.inputParameters ?? {};
        const result = executeScript(target.step, this.propertyStore, inputParams);
        if (!result.success) {
          this.recordTrace(target.oid, 'ERRORED', undefined, result.error);
          target.state = 'ERRORED';
          this.workflowState = 'ERRORED';
          this.pendingResources.delete(target.oid);
          if (this.resourceManager) {
            const known = new Set<string>();
            this.collectKnownStepOids(known);
            this.resourceManager.cancelQueuedWaiters(known);
          }
          return;
        }
        const snapshot = this.stepParameterSnapshots.get(target.oid);
        if (snapshot) {
          const outputSpecs = target.step.output_parameter_specifications;
          if (outputSpecs) {
            for (const spec of outputSpecs) {
              if (spec.target) {
                const val = this.propertyStore.get(spec.target);
                if (val !== undefined) {
                  snapshot.outputParameters[spec.id] = val;
                }
              }
            }
          }
        }
      }
      if (target.stepType === 'CATCH') {
        const ctx = this.activeCatches.get(target.oid);
        if (ctx) activateCatchStep(target.step, ctx, this.propertyStore);
      }
      this.recordTrace(target.oid, 'COMPLETED');
      target.state = 'COMPLETED';
      this.completionQueue.push(target.oid);
    } else if (needsUserAction(target.stepType)) {
      this.recordTrace(target.oid, 'EXECUTING');
      target.state = 'EXECUTING';
      this.pendingUserSteps.add(target.oid);
    }
  }

  private handleWaitAllArrival(waitAll: StepInstance, sourceOid: string): void {
    if (waitAll.state === 'COMPLETED') return; // Already done

    if (waitAll.state === 'IDLE') {
      // First arrival — check how many branches are already completed
      const expected = this.getIncomingStepOids(waitAll.oid);
      const completed = new Set<string>([sourceOid]);
      for (const oid of expected) {
        if (this.steps.get(oid)?.state === 'COMPLETED') {
          completed.add(oid);
        }
      }

      this.waitAllTracking.set(waitAll.oid, { expected, completed });

      if (completed.size >= expected.size) {
        // All branches already done — skip EXECUTING, go straight to COMPLETED
        this.completeWaitAll(waitAll);
      } else {
        // Some branches still pending — enter EXECUTING
        this.recordTrace(waitAll.oid, 'EXECUTING');
        waitAll.state = 'EXECUTING';
      }
    } else if (waitAll.state === 'EXECUTING') {
      // Subsequent arrival
      const tracking = this.waitAllTracking.get(waitAll.oid)!;
      tracking.completed.add(sourceOid);

      if (tracking.completed.size >= tracking.expected.size) {
        this.completeWaitAll(waitAll);
      }
    }
  }

  private completeWaitAll(waitAll: StepInstance): void {
    this.recordTrace(waitAll.oid, 'COMPLETED');
    waitAll.state = 'COMPLETED';
    this.completionQueue.push(waitAll.oid);
  }

  private activatePendingWaitAlls(): void {
    // Process in step definition order (inner before outer for nested parallels)
    for (const oid of this.stepDefinitionOrder) {
      const step = this.steps.get(oid)!;
      if (step.stepType !== 'WAIT ALL' || step.state !== 'IDLE') continue;

      // Check if ALL incoming sources are non-IDLE
      const incomingSources = this.getIncomingStepOids(step.oid);
      if (incomingSources.size === 0) continue;

      let allActive = true;
      for (const sourceOid of incomingSources) {
        const source = this.steps.get(sourceOid);
        if (!source || source.state === 'IDLE') {
          allActive = false;
          break;
        }
      }

      if (allActive) {
        // Pre-activate: find which branches are already completed
        const completedSources = new Set<string>();
        for (const sourceOid of incomingSources) {
          const source = this.steps.get(sourceOid);
          if (source && source.state === 'COMPLETED') {
            completedSources.add(sourceOid);
          }
        }

        this.waitAllTracking.set(step.oid, {
          expected: incomingSources,
          completed: completedSources,
        });

        this.recordTrace(step.oid, 'EXECUTING');
        step.state = 'EXECUTING';

        // Check if already fully complete
        if (completedSources.size >= incomingSources.size) {
          this.completeWaitAll(step);
          // Re-drain since we added to queue
          // (drainCompletionQueue will be called by the caller)
        }
      }
    }
  }

  private getIncomingStepOids(targetOid: string): Set<string> {
    const sources = new Set<string>();
    for (const conn of this.connections) {
      if (conn.to_step_id === targetOid) {
        sources.add(conn.from_step_id);
      }
    }
    return sources;
  }

  private getRoutedConnections(stepOid: string): WorkflowConnection[] {
    const all = this.connections.filter(c => c.from_step_id === stepOid);
    const routing = this.routingContext.get(stepOid);

    if (!routing) return all;

    if (routing.connectionId) {
      // SELECT 1: filter by connection_id
      return all.filter(c => c.connection_id === routing.connectionId);
    }

    if (routing.sourceHandleId) {
      // YES_NO: source_handle_id = button outputValue.
      // Match directly, then try legacy "yes"/"no" handles, then condition field.
      const handle = routing.sourceHandleId;
      const matched = all.filter(c =>
        // Direct match: source_handle_id equals the button outputValue
        c.source_handle_id === handle ||
        // Legacy "yes"/"no" handles: map "true"→"yes", "false"→"no"
        (handle === 'true' && c.source_handle_id === 'yes') ||
        (handle === 'false' && c.source_handle_id === 'no') ||
        // Test fixture compat: condition field match (case-insensitive)
        (c.condition && c.condition.toLowerCase() === handle.toLowerCase()),
      );
      if (matched.length > 0) return matched;
      // Last resort: condition "True"/"False" for legacy test fixtures
      return all.filter(c =>
        c.condition?.toLowerCase() === handle.toLowerCase(),
      );
    }

    if (routing.conditionValue) {
      // button_press (USER_INTERACTION): filter by condition, allow unconditional passthrough.
      const val = routing.conditionValue;
      const matched = all.filter(c =>
        (!routing.excludeUnconditional && !c.condition) ||
        c.condition === val ||
        c.condition?.toLowerCase() === val.toLowerCase(),
      );
      return matched;
    }

    return all;
  }

  /**
   * Check if restarting to a target step may deadlock.
   * Analyses the backward path from each active step to the target,
   * classifying by PARALLEL / WAIT ALL crossings.
   * Returns warning strings for problematic cases.
   */
  checkRestartSafety(targetOids: string[]): string[] {
    const warnings: string[] = [];
    const predecessors = this.buildPredecessorMap();
    const activeOids = this.getActiveOids();

    for (const targetOid of targetOids) {
      const target = this.steps.get(targetOid);
      if (!target) continue;
      let reachable = false;
      for (const activeOid of activeOids) {
        const classification = this.classifyBackwardPath(activeOid, targetOid, predecessors);
        if (classification !== 'unreachable') reachable = true;
        if (classification === 'deadlock') {
          const desc = target.step.description ?? target.stepType ?? targetOid;
          warnings.push(`Step "${desc}" — restart may deadlock (complex parallel crossing)`);
        }
      }
      if (!reachable) {
        const desc = target.step.description ?? target.stepType ?? targetOid;
        warnings.push(`Step "${desc}" is not reachable from any active step`);
      }
    }
    return warnings;
  }

  /**
   * Restart execution from target steps using parallel-aware logic.
   *
   * For each active step, classifies the backward path to the target:
   *  - same_chain: idle the active step only
   *  - crosses_parallel: idle ALL active steps in the parallel group
   *  - crosses_wait_all_parallel: idle the active step only
   *  - deadlock/unreachable: skip (warnings already given via checkRestartSafety)
   *
   * Then resets all idled steps + downstream steps and re-activates targets.
   */
  restartToSteps(targetOids: string[]): void {
    if (this.workflowState !== 'RUNNING') return;

    for (const oid of targetOids) {
      const step = this.steps.get(oid);
      if (!step || step.state !== 'COMPLETED') {
        throw new Error(`Cannot restart to step ${oid}: not in COMPLETED state`);
      }
    }

    const predecessors = this.buildPredecessorMap();
    const successors = this.buildSuccessorMap();
    const activeOids = this.getActiveOids();

    // Determine which steps to idle based on path classification
    const toIdle = new Set<string>();
    for (const targetOid of targetOids) {
      for (const activeOid of activeOids) {
        const classification = this.classifyBackwardPath(activeOid, targetOid, predecessors);
        switch (classification) {
          case 'same_chain':
          case 'crosses_wait_all_parallel':
            toIdle.add(activeOid);
            break;
          case 'crosses_parallel': {
            // Find the PARALLEL step on the path and idle ALL active steps downstream of it
            const parallelOid = this.findParallelOnPath(activeOid, targetOid, predecessors);
            if (parallelOid) {
              const parallelDescendants = this.bfsForward(parallelOid, successors);
              for (const desc of parallelDescendants) {
                if (activeOids.has(desc)) toIdle.add(desc);
              }
            }
            break;
          }
          // deadlock / unreachable: do nothing
        }
      }
    }

    // Build full reset set: target steps + idled steps + all steps between target and idled
    const toReset = new Set<string>(targetOids);
    for (const oid of toIdle) toReset.add(oid);
    // Also reset all downstream steps from targets (they'll need to re-execute)
    for (const targetOid of targetOids) {
      const downstream = this.bfsForward(targetOid, successors);
      for (const d of downstream) toReset.add(d);
    }

    // Reset all steps in the set
    for (const oid of toReset) {
      this.resetStep(oid);
    }

    this.completionQueue = this.completionQueue.filter(oid => !toReset.has(oid));

    // Re-activate target steps
    for (const oid of targetOids) {
      this.recordTrace(oid, 'EXECUTING');
    }
    for (const oid of targetOids) {
      const step = this.steps.get(oid)!;
      this.activateStep(step);
    }

    this.drainCompletionQueue();
  }

  /** Classify the backward path from activeOid to targetOid by what step types it crosses. */
  private classifyBackwardPath(
    activeOid: string,
    targetOid: string,
    predecessors: Map<string, Set<string>>,
  ): 'same_chain' | 'crosses_parallel' | 'crosses_wait_all_parallel' | 'deadlock' | 'unreachable' {
    // BFS backward from active step, recording path step types
    const visited = new Map<string, { crossesParallel: boolean; crossesWaitAll: boolean }>();
    const queue: { oid: string; crossesParallel: boolean; crossesWaitAll: boolean }[] = [
      { oid: activeOid, crossesParallel: false, crossesWaitAll: false },
    ];
    visited.set(activeOid, { crossesParallel: false, crossesWaitAll: false });

    while (queue.length > 0) {
      const { oid, crossesParallel, crossesWaitAll } = queue.shift()!;

      if (oid === targetOid) {
        if (!crossesParallel && !crossesWaitAll) return 'same_chain';
        if (crossesWaitAll && crossesParallel) return 'crosses_wait_all_parallel';
        if (crossesParallel) return 'crosses_parallel';
        return 'deadlock';
      }

      const preds = predecessors.get(oid);
      if (!preds) continue;

      for (const pred of preds) {
        const predStep = this.steps.get(pred);
        if (!predStep) continue;

        const newCrossesParallel = crossesParallel || predStep.stepType === 'PARALLEL';
        const newCrossesWaitAll = crossesWaitAll || predStep.stepType === 'WAIT ALL';

        const existing = visited.get(pred);
        if (!existing) {
          visited.set(pred, { crossesParallel: newCrossesParallel, crossesWaitAll: newCrossesWaitAll });
          queue.push({ oid: pred, crossesParallel: newCrossesParallel, crossesWaitAll: newCrossesWaitAll });
        }
      }
    }

    return 'unreachable';
  }

  /** Find the PARALLEL step on the backward path from activeOid to targetOid. */
  private findParallelOnPath(
    activeOid: string,
    targetOid: string,
    predecessors: Map<string, Set<string>>,
  ): string | null {
    const visited = new Set<string>();
    const queue = [activeOid];
    visited.add(activeOid);

    while (queue.length > 0) {
      const oid = queue.shift()!;
      if (oid === targetOid) return null;

      const preds = predecessors.get(oid);
      if (!preds) continue;

      for (const pred of preds) {
        if (visited.has(pred)) continue;
        visited.add(pred);
        const predStep = this.steps.get(pred);
        if (predStep?.stepType === 'PARALLEL') return pred;
        queue.push(pred);
      }
    }
    return null;
  }

  /** BFS forward from a step, returning all descendant OIDs (excluding the start). */
  private bfsForward(startOid: string, successors: Map<string, Set<string>>): Set<string> {
    const result = new Set<string>();
    const queue = [startOid];
    while (queue.length > 0) {
      const oid = queue.shift()!;
      const succs = successors.get(oid);
      if (!succs) continue;
      for (const succ of succs) {
        if (!result.has(succ)) {
          result.add(succ);
          queue.push(succ);
        }
      }
    }
    return result;
  }

  /** Build predecessor map: step OID → set of predecessor OIDs. */
  private buildPredecessorMap(): Map<string, Set<string>> {
    const predecessors = new Map<string, Set<string>>();
    for (const conn of this.connections) {
      if (!predecessors.has(conn.to_step_id)) predecessors.set(conn.to_step_id, new Set());
      predecessors.get(conn.to_step_id)!.add(conn.from_step_id);
    }
    return predecessors;
  }

  /** Build successor map: step OID → set of successor OIDs. */
  private buildSuccessorMap(): Map<string, Set<string>> {
    const successors = new Map<string, Set<string>>();
    for (const conn of this.connections) {
      if (!successors.has(conn.from_step_id)) successors.set(conn.from_step_id, new Set());
      successors.get(conn.from_step_id)!.add(conn.to_step_id);
    }
    return successors;
  }

  /** Get all currently active step OIDs. */
  private getActiveOids(): Set<string> {
    const active = new Set<string>();
    for (const step of this.steps.values()) {
      if (ACTIVE_STEP_STATES.has(step.state)) active.add(step.oid);
    }
    return active;
  }

  /** Reset a single step to IDLE and clean up all associated tracking state. */
  private resetStep(oid: string): void {
    const step = this.steps.get(oid);
    if (!step) return;
    if (step.state !== 'IDLE') this.recordTrace(oid, 'IDLE');
    step.state = 'IDLE';
    this.routingContext.delete(oid);
    this.pendingResources.delete(oid);
    this.pendingUserSteps.delete(oid);
    this.stepParameterSnapshots.delete(oid);
    this.waitAllTracking.delete(oid);
    if (this.activeChildEngines.has(oid)) {
      this.activeChildEngines.delete(oid);
    }
  }

  private findStepByLocalId(localId: string): StepInstance | undefined {
    for (const step of this.steps.values()) {
      if (step.step.local_id === localId) return step;
    }
    return undefined;
  }

  private checkWorkflowCompletion(): void {
    const endCompleted = [...this.steps.values()].some(
      s => s.stepType === 'END' && s.state === 'COMPLETED',
    );

    if (endCompleted && this.pendingUserSteps.size === 0) {
      const anyBlocking = [...this.steps.values()].some(
        s => s.state === 'EXECUTING' || s.state === 'WAITING',
      );
      if (!anyBlocking) {
        this.workflowState = 'COMPLETED';
      }
    }
  }
}
