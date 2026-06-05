// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.

import type { EnvironmentCapability } from './types'

export type MappingMode = 'Exact' | 'Name'

export interface WorkflowEnvRef {
  oid: string
  local_id: string
  requiredActionOids: string[]
  requiredActionNames?: string[]
}

export type MappingResult =
  | { kind: 'ok'; rewrittenOids: Map<string, string>; chosenServerByEnv: Map<string, string> }
  | { kind: 'oid_mismatch'; envOid: string; envName: string; missingActionOids: string[] }
  | { kind: 'name_not_found'; envName: string; missingActionName?: string }
  | {
      kind: 'needs_resolution'
      conflicts: Array<{
        envOid: string
        envName: string
        candidates: Array<{ serverUri: string; envCap: EnvironmentCapability }>
      }>
    }

export function mapWorkflowEnvActions(input: {
  mode: MappingMode
  workflowEnvs: WorkflowEnvRef[]
  capabilitiesByServer: Map<string, EnvironmentCapability[]>
}): MappingResult {
  const { mode, workflowEnvs, capabilitiesByServer } = input

  if (mode === 'Exact') {
    for (const wfEnv of workflowEnvs) {
      let found: { envCap: EnvironmentCapability; serverUri: string } | null = null
      for (const [uri, caps] of capabilitiesByServer) {
        const match = caps.find((c) => c.environment_oid === wfEnv.oid)
        if (match) {
          found = { envCap: match, serverUri: uri }
          break
        }
      }
      if (!found) {
        return {
          kind: 'oid_mismatch',
          envOid: wfEnv.oid,
          envName: wfEnv.local_id,
          missingActionOids: wfEnv.requiredActionOids,
        }
      }
      const actionOids = new Set(found.envCap.actions.map((a) => a.action_oid))
      const missing = wfEnv.requiredActionOids.filter((oid) => !actionOids.has(oid))
      if (missing.length > 0) {
        return {
          kind: 'oid_mismatch',
          envOid: wfEnv.oid,
          envName: wfEnv.local_id,
          missingActionOids: missing,
        }
      }
    }
    return { kind: 'ok', rewrittenOids: new Map(), chosenServerByEnv: new Map() }
  }

  // Name mode
  const rewrites = new Map<string, string>()
  const chosenServerByEnv = new Map<string, string>()
  const conflicts: Array<{
    envOid: string
    envName: string
    candidates: Array<{ serverUri: string; envCap: EnvironmentCapability }>
  }> = []

  for (const wfEnv of workflowEnvs) {
    const candidates: Array<{ serverUri: string; envCap: EnvironmentCapability }> = []
    for (const [uri, caps] of capabilitiesByServer) {
      const match = caps.find((c) => c.environment_name === wfEnv.local_id)
      if (match) candidates.push({ serverUri: uri, envCap: match })
    }

    if (candidates.length === 0) {
      return { kind: 'name_not_found', envName: wfEnv.local_id }
    }

    if (candidates.length > 1) {
      conflicts.push({ envOid: wfEnv.oid, envName: wfEnv.local_id, candidates })
      continue
    }

    const { envCap, serverUri } = candidates[0]
    const requiredNames = wfEnv.requiredActionNames ?? []

    for (let i = 0; i < requiredNames.length; i++) {
      const name = requiredNames[i]
      const wfActionOid = wfEnv.requiredActionOids[i]
      const match = envCap.actions.find((a) => a.action_name === name)
      if (!match) {
        return { kind: 'name_not_found', envName: wfEnv.local_id, missingActionName: name }
      }
      rewrites.set(wfActionOid, match.action_oid)
    }

    rewrites.set(wfEnv.oid, envCap.environment_oid)
    chosenServerByEnv.set(wfEnv.oid, serverUri)
  }

  if (conflicts.length > 0) {
    return { kind: 'needs_resolution', conflicts }
  }
  return { kind: 'ok', rewrittenOids: rewrites, chosenServerByEnv }
}
