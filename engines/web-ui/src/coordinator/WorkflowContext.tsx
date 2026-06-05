// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { createContext, useMemo, type ReactNode } from 'react';
import { WorkflowCoordinator } from './WorkflowCoordinator';

export const WorkflowContext = createContext<WorkflowCoordinator | null>(null);

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const coordinator = useMemo(() => new WorkflowCoordinator(), []);
  return (
    <WorkflowContext.Provider value={coordinator}>
      {children}
    </WorkflowContext.Provider>
  );
}
