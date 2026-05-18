// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
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
