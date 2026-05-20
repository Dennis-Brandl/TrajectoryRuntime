// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useSyncExternalStore } from 'react';
import type { ActionProxyController, ControllerSnapshot } from './ActionProxyController.js';

export function useActionProxy(controller: ActionProxyController | null): ControllerSnapshot | null {
  return useSyncExternalStore(
    cb => (controller ? controller.subscribe(cb) : () => {}),
    () => (controller ? controller.getSnapshot() : null),
    () => null,
  );
}
