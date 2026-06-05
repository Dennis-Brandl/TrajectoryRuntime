// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { useState, useCallback } from 'react';
import type { MasterEnvironmentSpecification } from '@engine/types.js';
import type { ActionCapability, EnvironmentCapability } from './types.js';
import { ActionApiClient } from './ActionApiClient.js';
import type { MappingMode, WorkflowEnvRef } from './mapping.js';
import { mapWorkflowEnvActions } from './mapping.js';

export interface BindingResult {
  bindings: Record<string, string>;
  capabilities: Map<string, Map<string, ActionCapability>>;
  rewrittenOids: Map<string, string>;
  chosenServerByEnv: Map<string, string>;
}

export type BindingState =
  | { phase: 'idle' }
  | { phase: 'picking'; envIndex: number; envs: MasterEnvironmentSpecification[]; bindings: Record<string, string>; capabilities: Map<string, Map<string, ActionCapability>>; capabilitiesByServer: Map<string, EnvironmentCapability[]> }
  | { phase: 'fetching-capabilities'; envName: string }
  | { phase: 'mapping' }
  | { phase: 'resolving-name-conflict'; conflicts: Array<{ envOid: string; envName: string; candidates: Array<{ serverUri: string; envCap: EnvironmentCapability }> }>; selections: Map<string, string>; envs: MasterEnvironmentSpecification[]; bindings: Record<string, string>; capabilities: Map<string, Map<string, ActionCapability>>; capabilitiesByServer: Map<string, EnvironmentCapability[]> }
  | { phase: 'mapping-error'; message: string; details?: { envName?: string; missingActionOids?: string[]; missingActionName?: string } }
  | { phase: 'error'; envName: string; message: string; envs: MasterEnvironmentSpecification[]; bindings: Record<string, string>; capabilities: Map<string, Map<string, ActionCapability>>; envIndex: number }
  | { phase: 'done'; result: BindingResult }
  | { phase: 'abandoned' };

export function useServerBindings() {
  const [state, setState] = useState<BindingState>({ phase: 'idle' });
  const api = new ActionApiClient();

  const begin = useCallback((envs: MasterEnvironmentSpecification[]) => {
    if (envs.length === 0) {
      setState({ phase: 'done', result: { bindings: {}, capabilities: new Map(), rewrittenOids: new Map(), chosenServerByEnv: new Map() } });
      return;
    }
    const bindings: Record<string, string> = {};
    const capabilities = new Map<string, Map<string, ActionCapability>>();
    const capabilitiesByServer = new Map<string, EnvironmentCapability[]>();
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
      void fetchAllCapabilities(envs, bindings, capabilities, capabilitiesByServer, api, setState);
    } else {
      setState({ phase: 'picking', envIndex: 0, envs: remainingEnvs, bindings, capabilities, capabilitiesByServer });
    }
  }, []);

  const selectServer = useCallback((uri: string) => {
    setState(prev => {
      if (prev.phase !== 'picking') return prev;
      const env = prev.envs[prev.envIndex];
      const nextBindings = { ...prev.bindings, [env.oid]: uri };
      const nextIndex = prev.envIndex + 1;
      if (nextIndex >= prev.envs.length) {
        void fetchAllCapabilities([...prev.envs], nextBindings, new Map(prev.capabilities), new Map(prev.capabilitiesByServer), api, setState);
        return { phase: 'fetching-capabilities', envName: env.local_id };
      }
      return { ...prev, envIndex: nextIndex, bindings: nextBindings };
    });
  }, [api]);

  const resolveConflict = useCallback((envOid: string, serverUri: string) => {
    setState(prev => {
      if (prev.phase !== 'resolving-name-conflict') return prev;
      const selections = new Map(prev.selections).set(envOid, serverUri);
      if (selections.size < prev.conflicts.length) {
        return { ...prev, selections };
      }
      // All conflicts resolved — build a filtered capabilitiesByServer that respects selections
      // for conflicting envs (only the picked server is considered for each conflicted env name).
      const filteredCaps = new Map<string, EnvironmentCapability[]>();
      for (const [uri, caps] of prev.capabilitiesByServer) {
        // For each server, filter out environment entries that belong to a conflicted env name
        // UNLESS this server is the one picked for that env.
        const conflictedEnvOids = new Set(prev.conflicts.map(c => c.envOid));
        const filteredEnvCaps = caps.filter(cap => {
          // Find if this capability's environment matches any conflicted env
          const conflict = prev.conflicts.find(c => {
            const picked = selections.get(c.envOid);
            // Include if it's not a conflicted env name, OR this is the picked server for it
            return cap.environment_name === c.envName && picked !== uri;
          });
          return !conflict;
        });
        if (filteredEnvCaps.length > 0) {
          filteredCaps.set(uri, filteredEnvCaps);
        }
      }
      // Rebuild flat capabilities map from filtered caps
      const filteredFlatCaps = new Map<string, Map<string, ActionCapability>>();
      for (const [uri, caps] of filteredCaps) {
        const map = new Map<string, ActionCapability>();
        for (const env of caps) {
          for (const action of env.actions) {
            map.set(action.action_oid, action);
          }
        }
        filteredFlatCaps.set(uri, map);
      }
      runMapping(prev.envs, prev.bindings, filteredFlatCaps, filteredCaps, setState);
      return { phase: 'mapping' };
    });
  }, []);

  const abandon = useCallback(() => setState({ phase: 'abandoned' }), []);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, begin, selectServer, resolveConflict, abandon, reset };
}

function runMapping(
  envs: MasterEnvironmentSpecification[],
  bindings: Record<string, string>,
  capabilities: Map<string, Map<string, ActionCapability>>,
  capabilitiesByServer: Map<string, EnvironmentCapability[]>,
  setState: (s: BindingState) => void,
): void {
  setState({ phase: 'mapping' });
  const mode = (localStorage.getItem('trajectory-env-action-mapping') as MappingMode) ?? 'Name';
  const workflowEnvs: WorkflowEnvRef[] = envs.map((env) => {
    const actions = (env.included_actions ?? []) as Array<{ oid?: string; action_oid?: string; action_name?: string }>;
    return {
      oid: env.oid,
      local_id: env.local_id,
      requiredActionOids: actions.map((a) => a.oid ?? a.action_oid).filter((x): x is string => !!x),
      requiredActionNames: actions.map((a) => a.action_name ?? '').filter(Boolean),
    };
  });
  const result = mapWorkflowEnvActions({ mode, workflowEnvs, capabilitiesByServer });

  if (result.kind === 'ok') {
    // After Name-mode mapping, applyOidRewrites rewrites every
    // step.action_proxy_config.environment_oid to the server's env oid,
    // but `bindings` was keyed by the WORKFLOW's pre-rewrite env oid (set
    // back in `begin()`). The coordinator looks up serverUri by the env
    // oid that's actually on the step (post-rewrite), so without this
    // remap startActionProxy throws "No server bound for environment ..."
    // for any workflow whose authored env oids differ from the server's.
    // Mirror the same remap on chosenServerByEnv for symmetry.
    const rewrittenBindings: Record<string, string> = {};
    for (const [oldOid, uri] of Object.entries(bindings)) {
      const newOid = result.rewrittenOids.get(oldOid) ?? oldOid;
      rewrittenBindings[newOid] = uri;
    }
    const rewrittenChosen = new Map<string, string>();
    for (const [oldOid, uri] of result.chosenServerByEnv) {
      const newOid = result.rewrittenOids.get(oldOid) ?? oldOid;
      rewrittenChosen.set(newOid, uri);
    }
    setState({
      phase: 'done',
      result: { bindings: rewrittenBindings, capabilities, rewrittenOids: result.rewrittenOids, chosenServerByEnv: rewrittenChosen },
    });
    return;
  }
  if (result.kind === 'oid_mismatch') {
    setState({
      phase: 'mapping-error',
      message: `Environment '${result.envName}' (oid ${result.envOid}) does not match any environment on the configured server. Switch the runtime to 'Name' mapping or update the workflow.`,
      details: { envName: result.envName, missingActionOids: result.missingActionOids },
    });
    return;
  }
  if (result.kind === 'name_not_found') {
    setState({
      phase: 'mapping-error',
      message: result.missingActionName
        ? `Action '${result.missingActionName}' was not found in environment '${result.envName}' on any configured server.`
        : `Environment named '${result.envName}' was not found on any configured action server.`,
      details: { envName: result.envName, missingActionName: result.missingActionName },
    });
    return;
  }
  if (result.kind === 'needs_resolution') {
    setState({
      phase: 'resolving-name-conflict',
      conflicts: result.conflicts,
      selections: new Map(),
      envs,
      bindings,
      capabilities,
      capabilitiesByServer,
    });
    return;
  }
}

async function fetchAllCapabilities(
  envs: MasterEnvironmentSpecification[],
  bindings: Record<string, string>,
  capabilities: Map<string, Map<string, ActionCapability>>,
  capabilitiesByServer: Map<string, EnvironmentCapability[]>,
  api: ActionApiClient,
  setState: (s: BindingState) => void,
): Promise<void> {
  const uniqueUris = new Set(Object.values(bindings));
  for (const uri of uniqueUris) {
    if (capabilities.has(uri)) continue;
    setState({ phase: 'fetching-capabilities', envName: uri });
    try {
      const envCaps: EnvironmentCapability[] = await api.getCapabilities(uri);
      // Store env-grouped form for mapping
      capabilitiesByServer.set(uri, envCaps);
      // Build flat action_oid → ActionCapability map for downstream consumers
      const map = new Map<string, ActionCapability>();
      for (const env of envCaps) {
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
  runMapping(envs, bindings, capabilities, capabilitiesByServer, setState);
}
