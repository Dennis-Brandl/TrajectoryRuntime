// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useSyncExternalStore } from 'react';
import type { ActionProxyController, ControllerSnapshot } from './ActionProxyController.js';

export function useActionProxy(controller: ActionProxyController | null): ControllerSnapshot | null {
  return useSyncExternalStore(
    cb => (controller ? controller.subscribe(cb) : () => {}),
    () => (controller ? controller.getSnapshot() : null),
    () => null,
  );
}
