// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
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
