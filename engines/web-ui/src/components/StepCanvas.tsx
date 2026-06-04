// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type { CSSProperties } from 'react';
import type { FormLayoutExportEntry, FormElement } from '@engine/types.js';
import { getElementComponent } from './elements/registry';
import homeIcon from '../assets/chrome-icons/Home.png';
import overviewIcon from '../assets/chrome-icons/Overview.png';
import listIcon from '../assets/chrome-icons/List.png';
import previousIcon from '../assets/chrome-icons/Previous.png';
import nextIcon from '../assets/chrome-icons/Next.png';

const CANVAS_W = 1024;
const CANVAS_H = 768;
const TOP_HEIGHT = 51;
const LEFT_WIDTH = 77;

export interface StepCanvasHeader {
  workflowName?: string;
  workflowVersion?: string;
  workflowState?: string;
  stepLabel?: string;
}

interface StepCanvasProps {
  layout: FormLayoutExportEntry;
  header?: StepCanvasHeader;
  formValues: Record<string, unknown>;
  onFormChange: (fieldName: string, value: unknown) => void;
  onButtonPress: (outputValue: string) => void;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  mediaMap: Record<string, string>;
  buttonsDisabled?: boolean;
  disabledTooltip?: string;
}

/**
 * Runtime port of the editor's FormCanvas + ChromeOverlay (desktop layout).
 *
 * Mirrors C:\TrajectoryEditor\src\components\form-designer\FormCanvas.tsx and
 * ChromeOverlay.tsx so editor element coordinates (x/y/w/h) land in the
 * same pixel positions at runtime. Elements are absolutely positioned;
 * chrome (51px top bar + 77px left nav rail) is drawn as a visual overlay
 * with pointerEvents:none so it does not intercept element interaction.
 *
 * Editor invariant: usable design area is (77, 51) to (1024, 768).
 */
export function StepCanvas({
  layout,
  header,
  formValues,
  onFormChange,
  onButtonPress,
  properties,
  inputParameters,
  mediaMap,
  buttonsDisabled,
  disabledTooltip,
}: StepCanvasProps) {
  const width = layout.canvasWidth ?? CANVAS_W;
  const height = layout.canvasHeight ?? CANVAS_H;

  return (
    <div
      className="step-canvas"
      style={{
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      {layout.elements.map((el, i) => (
        <ElementSlot
          key={elementKey(el, i)}
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
      ))}
      <ChromeOverlay header={header} />
    </div>
  );
}

interface ElementSlotProps {
  element: FormElement;
  formValues: Record<string, unknown>;
  onFormChange: (fieldName: string, value: unknown) => void;
  onButtonPress: (outputValue: string) => void;
  properties: Record<string, string>;
  inputParameters: Record<string, string>;
  mediaMap: Record<string, string>;
  buttonsDisabled?: boolean;
  disabledTooltip?: string;
}

function ElementSlot({ element, ...rest }: ElementSlotProps) {
  const Component = getElementComponent(element.type);
  if (!Component) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
      }}
    >
      <Component element={element} {...rest} />
    </div>
  );
}

function ChromeOverlay({ header }: { header?: StepCanvasHeader }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <div style={topBarStyle}>
        <HeaderText header={header} />
      </div>
      <NavRail />
    </div>
  );
}

const topBarStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: TOP_HEIGHT,
  background: '#000000',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 16px',
  overflow: 'hidden',
  pointerEvents: 'none',
};

/**
 * Renders the workflow header in two centered rows inside the 51px black bar:
 *
 *   WorkflowName · v{version} · {STATE}      ← 14px, weight 500
 *   {Step Label}                              ← 18px, weight 700
 *
 * Both rows use white text. Font sizes are kept above the 13px used by
 * StateCommandMenu's "State Commands" button per the design spec.
 */
function HeaderText({ header }: { header?: StepCanvasHeader }) {
  if (!header) return null;
  const { workflowName, workflowVersion, workflowState, stepLabel } = header;
  const meta = [
    workflowName,
    workflowVersion ? `v${workflowVersion}` : null,
    workflowState,
  ].filter(Boolean).join(' · ');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        maxWidth: '100%',
        textAlign: 'center',
      }}
    >
      {meta && (
        <span
          style={{
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
            opacity: 0.85,
          }}
        >
          {meta}
        </span>
      )}
      {stepLabel && (
        <span
          style={{
            color: '#ffffff',
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}
        >
          {stepLabel}
        </span>
      )}
    </div>
  );
}

const NAV_BUTTONS = [
  { icon: homeIcon, label: 'Home' },
  { icon: overviewIcon, label: 'Overview' },
  { icon: listIcon, label: 'List' },
  { icon: previousIcon, label: 'Previous' },
  { icon: nextIcon, label: 'Next' },
];

function NavRail() {
  return (
    <div
      style={{
        position: 'absolute',
        top: TOP_HEIGHT,
        left: 0,
        bottom: 0,
        width: LEFT_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-around',
        alignItems: 'center',
        background: '#f1f5f9',
        borderRight: '1px solid #e2e8f0',
        pointerEvents: 'none',
        padding: '8px 0',
      }}
    >
      {NAV_BUTTONS.map(({ icon, label }) => (
        <div
          key={label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              backgroundColor: '#475569',
              WebkitMaskImage: `url(${icon})`,
              maskImage: `url(${icon})`,
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
          <span style={{ fontSize: 9, color: '#64748b', userSelect: 'none' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function elementKey(el: FormElement, index: number): string {
  if ('fieldName' in el && el.fieldName) return el.fieldName as string;
  return `${el.type}-${index}`;
}
