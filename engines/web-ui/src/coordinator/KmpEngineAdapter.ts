// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type {
  WorkflowState,
  TraceEntry,
  UserAction,
  ActiveStepInfo,
  StepInstance,
  MasterWorkflowSpecification,
} from '@engine/types.js';

// Will hold the dynamically imported KMP module
let FacadeClass: any = null;

/**
 * Initialize the KMP engine module. Must be called before creating KmpWorkflowEngine instances.
 */
export async function initKmpEngine(): Promise<void> {
  if (FacadeClass) return;
  // Import the KMP JS output — Vite resolves @kmp-engine alias
  const kmpModule = await import('@kmp-engine/kmp-engine.js');
  // The KMP UMD module exports at com.trajectoryruntime.engine.WorkflowEngineFacade
  FacadeClass = kmpModule.com?.trajectoryruntime?.engine?.WorkflowEngineFacade
    ?? kmpModule.default?.com?.trajectoryruntime?.engine?.WorkflowEngineFacade;
  if (!FacadeClass) {
    // Explore the module structure to find the facade
    console.error('KMP module exports:', Object.keys(kmpModule));
    throw new Error('Could not find WorkflowEngineFacade in KMP module');
  }
}

/**
 * Check if KMP engine is initialized and ready.
 */
export function isKmpReady(): boolean {
  return FacadeClass !== null;
}

/**
 * Adapter that wraps the KMP JS facade to match the TS WorkflowEngine interface.
 */
export class KmpWorkflowEngine {
  private facade: any;

  constructor(
    workflow: MasterWorkflowSpecification,
    setup?: {
      starting_parameters?: Record<string, string>;
      initial_properties?: Record<string, string>;
      resourceManager?: unknown;
    },
  ) {
    if (!FacadeClass) throw new Error('KMP engine not initialized. Call initKmpEngine() first.');
    this.facade = new FacadeClass();
    // KMP engine creates its own ResourceManager internally — strip it from setup
    const kmpSetup = setup
      ? { starting_parameters: setup.starting_parameters, initial_properties: setup.initial_properties }
      : null;
    this.facade.create(
      JSON.stringify(workflow),
      kmpSetup ? JSON.stringify(kmpSetup) : null,
    );
  }

  start(): void {
    this.facade.start();
  }

  submitAction(action: UserAction, _actionIndex: number): void {
    this.facade.submitAction(JSON.stringify(action));
  }

  getTrace(): TraceEntry[] {
    return JSON.parse(this.facade.getTrace());
  }

  getWorkflowState(): WorkflowState {
    return this.facade.getWorkflowState() as WorkflowState;
  }

  getProperties(): Record<string, string> {
    return JSON.parse(this.facade.getProperties());
  }

  getAllProperties(): Record<string, string> {
    return JSON.parse(this.facade.getAllProperties());
  }

  getActiveInputParameters(): Record<string, string> {
    return JSON.parse(this.facade.getActiveInputParameters());
  }

  getActiveSteps(): ActiveStepInfo[] {
    const raw = JSON.parse(this.facade.getActiveSteps());
    return raw.map((info: any) => ({
      step: {
        oid: info.step.oid,
        stepType: info.step.stepType,
        state: info.step.state,
        step: info.step.step,
      } as StepInstance,
      workflowName: info.workflowName,
      waitingOn: info.waitingOn,
    }));
  }

  getStepParameterSnapshots(): Map<
    string,
    {
      inputParameters: Record<string, string>;
      outputParameters: Record<string, string>;
      description: string;
      label: string;
      stepType: string;
    }
  > {
    const raw = JSON.parse(this.facade.getStepParameterSnapshots());
    const result = new Map<string, any>();
    for (const [oid, snap] of Object.entries(raw)) {
      result.set(oid, snap);
    }
    return result;
  }

  /** Stub — KMP engine doesn't support hasStep for child workflows yet */
  hasStep(_stepOid: string): boolean {
    return true; // Assume all steps belong to this engine
  }

  getCompletedSteps() { return []; }
  checkRestartSafety(_targetOids: string[]) { return []; }
  restartToSteps(_targetOids: string[]) { /* no-op */ }
}
