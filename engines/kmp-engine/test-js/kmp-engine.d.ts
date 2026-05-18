declare module 'kmp-engine' {
  export namespace com.trajectoryruntime.engine {
    class WorkflowEngineFacade {
      constructor();
      validate(workflowJson: string): string;
      createAndStart(workflowJson: string, setupJson: string | null): void;
      submitAction(actionJson: string): void;
      getTrace(): string;
      getWorkflowState(): string;
      getProperties(): string;
    }
  }
}
