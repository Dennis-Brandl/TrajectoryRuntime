// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
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
