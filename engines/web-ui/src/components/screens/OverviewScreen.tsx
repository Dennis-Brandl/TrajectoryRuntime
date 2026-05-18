// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
// engines/web-ui/src/components/screens/OverviewScreen.tsx
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaCarouselType } from 'embla-carousel';
import { GitBranch } from 'lucide-react';
import { useWorkflowManager, useManagerSnapshot } from '../../manager/useWorkflowManager';
import type { CoordinatorSnapshot } from '../../coordinator/WorkflowCoordinator';
import type { MasterWorkflowSpecification } from '@engine/types.js';
import type { WorkflowManager } from '../../manager/WorkflowManager';
import { WorkflowGraph } from './WorkflowGraph';
import styles from './OverviewScreen.module.css';

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

interface SlideData {
  id: string;
  localId: string;
  spec: MasterWorkflowSpecification;
  snapshot: CoordinatorSnapshot;
}

/** Build current slide data from all active workflows. */
function buildSlides(manager: WorkflowManager): SlideData[] {
  const managerSnap = manager.getSnapshot();
  return managerSnap.active
    .map(wf => {
      const coordinator = manager.getCoordinator(wf.id);
      if (!coordinator) return null;
      const spec = coordinator.getActiveSpec();
      if (!spec) return null;
      return {
        id: wf.id,
        localId: wf.localId,
        spec,
        snapshot: coordinator.getSnapshot(),
      };
    })
    .filter((s): s is SlideData => s !== null);
}

interface OverviewScreenProps {
  highlightedStepOid?: string | null;
}

export function OverviewScreen({ highlightedStepOid }: OverviewScreenProps = {}) {
  const manager = useWorkflowManager();
  const managerSnap = useManagerSnapshot();
  const [selected, setSelected] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [slides, setSlides] = useState<SlideData[]>(() => buildSlides(manager));

  const emblaOptions = useMemo(() => ({
    loop: true,
    align: 'start' as const,
    containScroll: false as const,
    watchDrag: !isZoomed,
  }), [isZoomed]);
  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions);

  // Subscribe to both manager AND each active coordinator for live state updates.
  // Pattern from useAllActiveSteps.ts — dynamically manages coordinator subscriptions.
  const refresh = useCallback(() => {
    setSlides(buildSlides(manager));
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

    const managerUnsub = manager.subscribe(() => {
      syncCoordinatorSubs();
      refresh();
    });

    syncCoordinatorSubs();
    refresh();

    return () => {
      managerUnsub();
      for (const unsub of coordUnsubs.values()) unsub();
      coordUnsubs.clear();
    };
  }, [manager, refresh]);

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

  // Scroll to focused workflow only when focusedActiveId actually changes
  const lastFocusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!emblaApi || !managerSnap.focusedActiveId) return;
    if (managerSnap.focusedActiveId === lastFocusedRef.current) return;
    lastFocusedRef.current = managerSnap.focusedActiveId;
    const idx = slides.findIndex(s => s.id === managerSnap.focusedActiveId);
    if (idx >= 0) {
      emblaApi.scrollTo(idx);
    }
  }, [managerSnap.focusedActiveId, emblaApi, slides]);

  // Reinit carousel when slide count or zoom state changes
  const slideCount = slides.length;
  useEffect(() => {
    if (emblaApi && slideCount > 0) emblaApi.reInit();
  }, [emblaApi, slideCount, isZoomed]);

  // Clamp selected if slides shrink
  useEffect(() => {
    if (slides.length > 0 && selected >= slides.length) {
      setSelected(slides.length - 1);
    }
  }, [slides.length, selected]);

  const onZoomChange = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
  }, []);

  if (slides.length === 0) {
    return (
      <div className={styles.screen}>
        <div className={styles.emptyState}>
          <GitBranch size={48} className={styles.emptyIcon} />
          <p className={styles.emptyText}>No active workflows</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.viewport} ref={emblaRef}>
        <div className={styles.carouselContainer}>
          {slides.map((slide, i) => (
            <div className={styles.slide} key={slide.id}>
              <div className={styles.slideTitle}>{slide.localId}</div>
              <WorkflowGraph
                spec={slide.spec}
                snapshot={slide.snapshot}
                isActive={i === selected}
                onZoomChange={onZoomChange}
                highlightedStepOid={highlightedStepOid}
              />
            </div>
          ))}
        </div>
      </div>
      <DotIndicator count={slides.length} selected={selected} />
    </div>
  );
}
