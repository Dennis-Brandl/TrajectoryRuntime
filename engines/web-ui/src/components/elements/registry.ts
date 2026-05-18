// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { ComponentType } from 'react';
import type { FormElement } from '@engine/types.js';

export interface ElementProps {
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

const registry = new Map<string, ComponentType<ElementProps>>();

export function registerElement(type: string, component: ComponentType<ElementProps>): void {
  registry.set(type, component);
}

export function getElementComponent(type: string): ComponentType<ElementProps> | undefined {
  return registry.get(type);
}
