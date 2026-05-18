// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaCarouselType } from 'embla-carousel';
import { Check } from 'lucide-react';
import type { UserAction, DisplayStyle } from '@engine/types.js';
import { useWorkflowManager, useManagerSnapshot } from '../../manager/useWorkflowManager';
import { useAllActiveSteps } from '../../manager/useAllActiveSteps';
import type { ActiveWorkflow } from '../../manager/types';
import { ActiveStepCard } from '../ActiveStepCard';
import styles from './ActiveScreen.module.css';

function DotIndicator({ count, selected }: { count: number; selected: number }) {
  if (count <= 1) return null;
  return (
    <div className={styles.dots}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`${styles.dot}${i === selected ? ` ${styles.dotActive}` : ''}`} />
      ))}
    </div>
  );
}

interface ActiveScreenProps {
  deviceType?: 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';
  onStepChange?: (info: { workflowLocalId: string; workflowVersion: string; stepLocalId: string; stepOid: string; instanceNumber: number | null; workflowDisplayStyle: DisplayStyle } | null) => void;
}

export function ActiveScreen({ deviceType, onStepChange }: ActiveScreenProps) {
  const manager = useWorkflowManager();
  const managerSnap = useManagerSnapshot();
  const allSteps = useAllActiveSteps();
  const [selected, setSelected] = useState(0);
  const [completedWf, setCompletedWf] = useState<{ name: string; id: string } | null>(null);

  const emblaOptions = useMemo(() => ({
    loop: true,
    align: 'start' as const,
    containScroll: false as const,
  }), []);
  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions);

  // Track workflow removals for completion overlay
  const prevActiveRef = useRef<ActiveWorkflow[]>(managerSnap.active);
  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = managerSnap.active;
    for (const pw of prev) {
      if (!managerSnap.active.some(w => w.id === pw.id)) {
        setCompletedWf({ name: pw.localId, id: pw.id });
        const timer = setTimeout(() => setCompletedWf(null), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [managerSnap.active]);

  // Sync Embla selection
  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = (api: EmblaCarouselType) => {
      setSelected(api.selectedScrollSnap());
    };
    emblaApi.on('select', onSelect);
    onSelect(emblaApi);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi]);

  // Scroll to focused workflow's first step only when focus actually changes
  const prevFocusedRef = useRef(managerSnap.focusedActiveId);
  useEffect(() => {
    const focusedId = managerSnap.focusedActiveId;
    if (!focusedId || focusedId === prevFocusedRef.current || !emblaApi || allSteps.length === 0) return;
    prevFocusedRef.current = focusedId;
    const idx = allSteps.findIndex(s => s.workflowId === focusedId);
    if (idx >= 0) {
      emblaApi.scrollTo(idx);
    }
  }, [managerSnap.focusedActiveId, emblaApi, allSteps]);

  // Update manager focus and notify TitleBar when selected step changes
  useEffect(() => {
    const currentStep = allSteps[selected];
    if (currentStep) {
      manager.focusWorkflow(currentStep.workflowId);
      onStepChange?.({
        workflowLocalId: currentStep.workflowLocalId,
        workflowVersion: currentStep.workflowVersion,
        stepLocalId: currentStep.stepInfo.step.step.local_id,
        stepOid: currentStep.stepInfo.step.oid,
        instanceNumber: currentStep.instanceNumber,
        workflowDisplayStyle: currentStep.workflowDisplayStyle,
      });
    } else {
      onStepChange?.(null);
    }
  }, [selected, allSteps, manager, onStepChange]);

  // Reindex when steps change (skip if no steps — carousel is unmounted)
  useEffect(() => {
    if (emblaApi && allSteps.length > 0) emblaApi.reInit();
  }, [emblaApi, allSteps.length]);

  // Clamp selected if steps shrink
  useEffect(() => {
    if (allSteps.length > 0 && selected >= allSteps.length) {
      setSelected(allSteps.length - 1);
    }
  }, [allSteps.length, selected]);

  const onAction = useCallback(
    (action: UserAction) => {
      const currentStep = allSteps[selected];
      if (!currentStep) return;
      manager.getCoordinator(currentStep.workflowId)?.submitAction(action);
    },
    [manager, allSteps, selected],
  );

  const completionOverlay = completedWf && (
    <div className={styles.completionOverlay}>
      <div className={styles.completionCard}>
        <Check size={32} className={styles.completionIcon} />
        <p className={styles.completionTitle}>Workflow Complete</p>
        <p className={styles.completionName}>{completedWf.name}</p>
      </div>
    </div>
  );

  if (allSteps.length === 0) {
    return (
      <div className={styles.activeScreen}>
        <div className={styles.emptyState}>No active steps</div>
        {completionOverlay}
      </div>
    );
  }

  return (
    <div className={styles.activeScreen}>
      <div className={styles.stepViewport} ref={emblaRef}>
        <div className={styles.stepContainer}>
          {allSteps.map((flat) => (
            <div className={styles.stepSlide} key={`${flat.workflowId}-${flat.stepInfo.step.oid}`}>
              <ActiveStepCard
                step={flat.stepInfo}
                onAction={onAction}
                workflowId={flat.workflowId}
                properties={flat.properties}
                inputParameters={flat.inputParameters}
                mediaMap={flat.mediaMap}
                deviceType={deviceType}
                header={{
                  workflowName: flat.workflowLocalId,
                  workflowVersion: flat.workflowVersion,
                  workflowState: flat.workflowState,
                  stepLabel: flat.stepInfo.step.step.description ?? flat.stepInfo.step.step.local_id,
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <DotIndicator count={allSteps.length} selected={selected} />
      {completionOverlay}
    </div>
  );
}
