// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState, useEffect, useCallback } from 'react';
import { useWorkflowManager } from './useWorkflowManager';
import type { ActiveStepInfo, DisplayStyle } from '@engine/types.js';
import type { CoordinatorSnapshot } from '../coordinator/WorkflowCoordinator';
import type { WorkflowManager } from './WorkflowManager';

export interface FlatActiveStep {
  workflowId: string;
  workflowLocalId: string;
  workflowVersion: string;
  workflowState: string;
  workflowDisplayStyle: DisplayStyle;
  instanceNumber: number | null;
  stepInfo: ActiveStepInfo;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  mediaMap: Record<string, string>;
  stepParams: CoordinatorSnapshot['stepParams'];
}

function buildSnapshot(manager: WorkflowManager): FlatActiveStep[] {
  const managerSnap = manager.getSnapshot();
  const result: FlatActiveStep[] = [];
  for (const wf of managerSnap.active) {
    const coord = manager.getCoordinator(wf.id);
    if (!coord) continue;
    const snap = coord.getSnapshot();
    const spec = coord.getSpec();
    const displayStyle: DisplayStyle = spec?.display_style ?? 'flowchart';
    for (const stepInfo of snap.activeSteps) {
      result.push({
        workflowId: wf.id,
        workflowLocalId: wf.localId,
        workflowVersion: wf.version,
        workflowState: snap.workflowState,
        workflowDisplayStyle: displayStyle,
        instanceNumber: wf.instanceNumber,
        stepInfo,
        properties: snap.properties,
        inputParameters: snap.stepParams[stepInfo.step.oid]?.inputParameters ?? snap.inputParameters,
        mediaMap: snap.mediaMap,
        stepParams: snap.stepParams,
      });
    }
  }
  return result;
}

/**
 * Returns a flat list of all active steps across all running workflows.
 * Dynamically manages coordinator subscriptions as workflows come and go.
 */
export function useAllActiveSteps(): FlatActiveStep[] {
  const manager = useWorkflowManager();
  const [steps, setSteps] = useState<FlatActiveStep[]>(() => buildSnapshot(manager));

  const refresh = useCallback(() => {
    setSteps(prev => {
      const next = buildSnapshot(manager);
      // Avoid new reference if step identities haven't changed
      if (prev.length === next.length && prev.every((s, i) =>
        s.stepInfo === next[i].stepInfo && s.workflowId === next[i].workflowId
      )) {
        return prev;
      }
      return next;
    });
  }, [manager]);

  useEffect(() => {
    const coordUnsubs = new Map<string, () => void>();

    const syncCoordinatorSubs = () => {
      const snap = manager.getSnapshot();
      const currentIds = new Set<string>();

      for (const wf of snap.active) {
        currentIds.add(wf.id);
        if (!coordUnsubs.has(wf.id)) {
          const coord = manager.getCoordinator(wf.id);
          if (coord) {
            coordUnsubs.set(wf.id, coord.subscribe(refresh));
          }
        }
      }

      for (const [id, unsub] of coordUnsubs) {
        if (!currentIds.has(id)) {
          unsub();
          coordUnsubs.delete(id);
        }
      }
    };

    // Subscribe to manager — re-sync coordinator subs on changes
    const managerUnsub = manager.subscribe(() => {
      syncCoordinatorSubs();
      refresh();
    });

    // Initial setup
    syncCoordinatorSubs();
    refresh();

    return () => {
      managerUnsub();
      for (const unsub of coordUnsubs.values()) unsub();
      coordUnsubs.clear();
    };
  }, [manager, refresh]);

  return steps;
}
