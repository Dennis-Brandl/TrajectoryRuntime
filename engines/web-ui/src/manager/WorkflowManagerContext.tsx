// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { createContext, useMemo, type ReactNode } from 'react';
import { WorkflowManager } from './WorkflowManager';

export const WorkflowManagerContext = createContext<WorkflowManager | null>(null);

export function WorkflowManagerProvider({ children }: { children: ReactNode }) {
  const manager = useMemo(() => new WorkflowManager(), []);

  return (
    <WorkflowManagerContext.Provider value={manager}>
      {children}
    </WorkflowManagerContext.Provider>
  );
}
