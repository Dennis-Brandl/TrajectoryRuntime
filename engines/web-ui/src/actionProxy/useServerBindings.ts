// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { useState, useCallback } from 'react';
import type { MasterEnvironmentSpecification } from '@engine/types.js';
import type { ActionCapability, EnvironmentCapability } from './types.js';
import { ActionApiClient } from './ActionApiClient.js';

export interface BindingResult {
  bindings: Record<string, string>;
  capabilities: Map<string, Map<string, ActionCapability>>;
}

export type BindingState =
  | { phase: 'idle' }
  | { phase: 'picking'; envIndex: number; envs: MasterEnvironmentSpecification[]; bindings: Record<string, string>; capabilities: Map<string, Map<string, ActionCapability>> }
  | { phase: 'fetching-capabilities'; envName: string }
  | { phase: 'error'; envName: string; message: string; envs: MasterEnvironmentSpecification[]; bindings: Record<string, string>; capabilities: Map<string, Map<string, ActionCapability>>; envIndex: number }
  | { phase: 'done'; result: BindingResult }
  | { phase: 'abandoned' };

export function useServerBindings() {
  const [state, setState] = useState<BindingState>({ phase: 'idle' });
  const api = new ActionApiClient();

  const begin = useCallback((envs: MasterEnvironmentSpecification[]) => {
    if (envs.length === 0) {
      setState({ phase: 'done', result: { bindings: {}, capabilities: new Map() } });
      return;
    }
    const bindings: Record<string, string> = {};
    const capabilities = new Map<string, Map<string, ActionCapability>>();
    const remainingEnvs: MasterEnvironmentSpecification[] = [];
    for (const env of envs) {
      const servers = env.action_server_specifications ?? [];
      if (servers.length === 1) {
        bindings[env.oid] = servers[0].uri;
      } else {
        remainingEnvs.push(env);
      }
    }
    if (remainingEnvs.length === 0) {
      void fetchAllCapabilities(envs, bindings, capabilities, api, setState);
    } else {
      setState({ phase: 'picking', envIndex: 0, envs: remainingEnvs, bindings, capabilities });
    }
  }, []);

  const selectServer = useCallback((uri: string) => {
    setState(prev => {
      if (prev.phase !== 'picking') return prev;
      const env = prev.envs[prev.envIndex];
      const nextBindings = { ...prev.bindings, [env.oid]: uri };
      const nextIndex = prev.envIndex + 1;
      if (nextIndex >= prev.envs.length) {
        void fetchAllCapabilities([...prev.envs], nextBindings, new Map(prev.capabilities), api, setState);
        return { phase: 'fetching-capabilities', envName: env.local_id };
      }
      return { ...prev, envIndex: nextIndex, bindings: nextBindings };
    });
  }, [api]);

  const abandon = useCallback(() => setState({ phase: 'abandoned' }), []);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, begin, selectServer, abandon, reset };
}

async function fetchAllCapabilities(
  envs: MasterEnvironmentSpecification[],
  bindings: Record<string, string>,
  capabilities: Map<string, Map<string, ActionCapability>>,
  api: ActionApiClient,
  setState: (s: BindingState) => void,
): Promise<void> {
  const uniqueUris = new Set(Object.values(bindings));
  for (const uri of uniqueUris) {
    if (capabilities.has(uri)) continue;
    setState({ phase: 'fetching-capabilities', envName: uri });
    try {
      const envs: EnvironmentCapability[] = await api.getCapabilities(uri);
      const map = new Map<string, ActionCapability>();
      for (const env of envs) {
        for (const action of env.actions) {
          map.set(action.action_oid, action);
        }
      }
      capabilities.set(uri, map);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState({ phase: 'error', envName: uri, message: msg, envs, bindings: {}, capabilities: new Map(), envIndex: 0 });
      return;
    }
  }
  setState({ phase: 'done', result: { bindings, capabilities } });
}
