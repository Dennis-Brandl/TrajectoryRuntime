// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
/// <reference types="vite/client" />

/** App version string injected by vite.config.ts at build time (e.g. "2.1.1"). */
declare const __APP_VERSION__: string;

declare module '@kmp-engine/kmp-engine.js' {
  const kmpEngine: {
    com: {
      trajectoryruntime: {
        engine: {
          WorkflowEngineFacade: new () => {
            validate(workflowJson: string): string;
            create(workflowJson: string, setupJson: string | null): void;
            start(): void;
            createAndStart(workflowJson: string, setupJson: string | null): void;
            submitAction(actionJson: string): void;
            getTrace(): string;
            getWorkflowState(): string;
            getProperties(): string;
            getAllProperties(): string;
            getActiveSteps(): string;
            getActiveInputParameters(): string;
            getStepParameterSnapshots(): string;
          };
        };
      };
    };
  };
  export = kmpEngine;
}
