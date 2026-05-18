// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useRef, useEffect, useState, type CSSProperties } from 'react';
import type { FormLayoutExportEntry, FormElement } from '@engine/types.js';
import { getElementComponent } from './elements/registry';
import { StepCanvas, type StepCanvasHeader } from './StepCanvas';

type ViewportOverride = 'phone' | 'tablet-vertical' | 'tablet-horizontal' | 'desktop';

interface FormRendererProps {
  layouts: FormLayoutExportEntry[];
  formValues: Record<string, unknown>;
  onFormChange: (fieldName: string, value: unknown) => void;
  onButtonPress: (outputValue: string) => void;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  viewportOverride?: ViewportOverride;
  mediaMap: Record<string, string>;
  buttonsDisabled?: boolean;
  disabledTooltip?: string;
  /** Header info shown in the desktop StepCanvas black title bar. */
  header?: StepCanvasHeader;
}

interface FormRow { elements: FormElement[]; }

function viewportToLayoutType(viewport: ViewportOverride): 'phone' | 'tablet' | 'desktop' {
  switch (viewport) {
    case 'phone':
    case 'tablet-vertical':
      return 'phone';
    case 'tablet-horizontal':
      return 'tablet';
    case 'desktop':
      return 'desktop';
  }
}

function detectViewport(width: number, height: number): ViewportOverride {
  const portrait = height > width;
  if (portrait) return 'phone';
  const smallest = Math.min(width, height);
  if (smallest >= 1024) return 'desktop';
  if (smallest >= 600) return 'tablet-horizontal';
  return 'phone';
}

function pickLayout(
  layouts: FormLayoutExportEntry[],
  containerWidth: number,
  containerHeight: number,
  viewportOverride?: ViewportOverride,
): FormLayoutExportEntry {
  const viewport = viewportOverride ?? detectViewport(containerWidth, containerHeight);
  const targetType = viewportToLayoutType(viewport);
  const exact = layouts.find((l) => l.deviceType === targetType);
  if (exact) return exact;
  return (
    layouts.find((l) => l.deviceType === 'tablet') ??
    layouts.find((l) => l.deviceType === 'desktop') ??
    layouts[0]
  );
}

/**
 * Group elements into rows by transitive y-band overlap. Two elements share a
 * row when their y-ranges overlap by at least `threshold` of the shorter
 * element's height. Within each row, elements are sorted by x.
 *
 * Only used on tablet-horizontal.
 */
function clusterRows(sorted: FormElement[], threshold = 0.3): FormRow[] {
  const groups: FormElement[][] = [];
  for (const el of sorted) {
    const bot = el.y + el.height;
    const minHEl = Math.max(1, el.height);
    const match = groups.find((row) => row.some((other) => {
      const oBot = other.y + other.height;
      const overlap = Math.max(0, Math.min(bot, oBot) - Math.max(el.y, other.y));
      return overlap / Math.min(minHEl, Math.max(1, other.height)) >= threshold;
    }));
    if (match) match.push(el);
    else groups.push([el]);
  }
  return groups.map((g) => ({
    elements: [...g].sort((a, b) => a.x - b.x),
  }));
}

function isButtonRow(row: FormRow): boolean {
  return row.elements.every((e) => e.type === 'button');
}

/**
 * Renders the chosen device-specific form layout as a vertical flow with
 * optional column clustering on tablet-horizontal.
 *
 * Editor `x` and `y` only drive ordering. Editor `width` is used as a column
 * weight when a row has multiple elements (tablet-horizontal). Editor
 * `height` becomes a min-height; `image` / `video` preserve declared aspect
 * ratio. Trailing rows that consist entirely of `button` elements anchor
 * to the bottom of the available form area.
 */
export function FormRenderer({
  layouts,
  formValues,
  onFormChange,
  onButtonPress,
  properties,
  inputParameters,
  viewportOverride,
  mediaMap,
  buttonsDisabled,
  disabledTooltip,
  header,
}: FormRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 360, height: 800 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  if (layouts.length === 0) return null;
  const layout = pickLayout(layouts, containerSize.width, containerSize.height, viewportOverride);

  const sortedElements = [...layout.elements].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  const effectiveViewport = viewportOverride
    ?? detectViewport(containerSize.width, containerSize.height);

  // Desktop: defer to StepCanvas, which mirrors the editor's FormCanvas +
  // ChromeOverlay (51px black title bar + 77px left nav rail) at the
  // editor's exact 1024×768 dimensions. Editor element coordinates land
  // 1:1 in the runtime canvas.
  //
  // Only enter the absolute-positioned canvas when the picked layout is
  // actually a desktop layout. If pickLayout fell back to a tablet/phone
  // deviceType because no desktop entry was exported, those coordinates
  // belong to a smaller canvas and would misposition inside 1024×768.
  // Drop through to the responsive flex-row renderer instead.
  if (effectiveViewport === 'desktop' && layout.deviceType === 'desktop') {
    return (
      <StepCanvas
        layout={layout}
        header={header}
        formValues={formValues}
        onFormChange={onFormChange}
        onButtonPress={onButtonPress}
        properties={properties}
        inputParameters={inputParameters}
        mediaMap={mediaMap}
        buttonsDisabled={buttonsDisabled}
        disabledTooltip={disabledTooltip}
      />
    );
  }

  const useColumns = effectiveViewport === 'tablet-horizontal';
  const rows: FormRow[] = useColumns
    ? clusterRows(sortedElements)
    : sortedElements.map((el) => ({ elements: [el] }));

  let trailingCount = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (isButtonRow(rows[i])) trailingCount++;
    else break;
  }
  const nonButtonRows = trailingCount > 0
    ? rows.slice(0, rows.length - trailingCount)
    : rows;
  const trailingButtonRows = trailingCount > 0
    ? rows.slice(rows.length - trailingCount)
    : [];

  const elementSlot = (el: FormElement, extra: CSSProperties, key: string) => (
    <div
      key={key}
      className="form-element-slot"
      style={{ ...slotIntrinsicStyle(el), ...extra }}
    >
      <ElementRenderer
        element={el}
        formValues={formValues}
        onFormChange={onFormChange}
        onButtonPress={onButtonPress}
        properties={properties}
        inputParameters={inputParameters}
        mediaMap={mediaMap}
        buttonsDisabled={buttonsDisabled}
        disabledTooltip={disabledTooltip}
      />
    </div>
  );

  const renderRow = (row: FormRow, rowIdx: number) => {
    if (row.elements.length === 1) {
      return elementSlot(
        row.elements[0],
        { width: '100%' },
        elementKey(row.elements[0], rowIdx),
      );
    }
    return (
      <div
        key={`row-${rowIdx}`}
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 12,
          width: '100%',
          alignItems: 'flex-start',
        }}
      >
        {row.elements.map((el, colIdx) => elementSlot(
          el,
          {
            flex: `${Math.max(1, el.width)} 1 0`,
            minWidth: 0,
          },
          elementKey(el, rowIdx * 1000 + colIdx),
        ))}
      </div>
    );
  };

  if (trailingButtonRows.length === 0) {
    return (
      <div
        ref={containerRef}
        className="form-renderer"
        style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}
      >
        {rows.map((row, i) => renderRow(row, i))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="form-renderer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '100%',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {nonButtonRows.map((row, i) => renderRow(row, i))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {trailingButtonRows.map((row, i) => renderRow(row, nonButtonRows.length + i))}
      </div>
    </div>
  );
}

function slotIntrinsicStyle(el: FormElement): CSSProperties {
  if (el.type === 'image' || el.type === 'video') {
    if (el.width && el.height) {
      return { aspectRatio: `${el.width} / ${el.height}` };
    }
    return {};
  }
  if (el.height && el.height > 0) {
    return { minHeight: el.height };
  }
  return {};
}

/** Stable key for form elements */
function elementKey(el: FormElement, index: number): string {
  if ('fieldName' in el && el.fieldName) return el.fieldName as string;
  return `${el.type}-${index}`;
}

function ElementRenderer({
  element,
  formValues,
  onFormChange,
  onButtonPress,
  properties,
  inputParameters,
  mediaMap,
  buttonsDisabled,
  disabledTooltip,
}: {
  element: FormElement;
  formValues: Record<string, unknown>;
  onFormChange: (fieldName: string, value: unknown) => void;
  onButtonPress: (outputValue: string) => void;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  mediaMap: Record<string, string>;
  buttonsDisabled?: boolean;
  disabledTooltip?: string;
}) {
  const Component = getElementComponent(element.type);
  if (!Component) return null;
  return (
    <Component
      element={element}
      formValues={formValues}
      onFormChange={onFormChange}
      onButtonPress={onButtonPress}
      properties={properties}
      inputParameters={inputParameters}
      mediaMap={mediaMap}
      buttonsDisabled={buttonsDisabled}
      disabledTooltip={disabledTooltip}
    />
  );
}
