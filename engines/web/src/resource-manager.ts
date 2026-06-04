// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type { ResourcePropertySpecification, ResourceSnapshotEntry } from './types.js';

// ── Result Types ──

export type AcquireResult = { granted: true; name?: string } | { granted: false };
export type ReceiveResult = { available: true; data: string } | { available: false };
export type SyncResult = { ready: true } | { ready: false };
export type GrantEntry = { stepOid: string; resourceKey: string };

// ── Interface ──
//
// MODEL: Resource pools are pure state (counts or lists of names). Acquire decrements;
// Release increments. The manager does NOT track WHO holds what — it is the workflow
// author's responsibility to release the correct name (named pool) or amount (countable)
// that they originally acquired. There is no auto-release on workflow abort.
//
// Resources are identified by a composite resourceKey (resource_source_oid:resource_name).
//
// stepOid (and instance-prefixed variants for cross-workflow sync) is used ONLY for
// queue routing — when a Release frees pool capacity, the head-of-queue stepOid is
// added to pendingGrants so its engine can resume the waiting step.

export interface ResourceManager {
  registerResource(resourceKey: string, spec: ResourcePropertySpecification, ownerId: string, scope?: 'workflow' | 'environment'): void;
  unregisterResources(ownerId: string): void;

  acquire(resourceKey: string, stepOid: string, amount?: number): AcquireResult;
  /** Release one unit (binary/shared) or `amount` units (countable) or `name` (named pool). */
  release(resourceKey: string, amount?: number, name?: string): boolean;

  acquireAmount(resourceKey: string, stepOid: string, amount: number): AcquireResult;
  releaseAmount(resourceKey: string, amount: number): void;

  acquireNamed(resourceKey: string, stepOid: string): AcquireResult;
  /** Returns true if name was returned to pool, false if name was already available
   *  (double-release) or not part of this pool at registration time. */
  releaseNamed(resourceKey: string, name: string): boolean;

  send(resourceKey: string, stepOid: string, data: string): SyncResult;
  receive(resourceKey: string, stepOid: string): ReceiveResult;
  synchronize(resourceKey: string, stepOid: string): SyncResult;

  getSyncData(stepOid: string): string | undefined;
  clearSyncData(stepOid: string): void;

  /** When a queued named-pool Acquire becomes grantable, the manager reserves the name
   *  out of `available` and records it here. The engine consumes this on grant processing
   *  to write the name to the Acquire's cmd.target property. */
  consumePendingNamedAssignment(stepOid: string): string | undefined;

  flushGranted(knownStepOids?: Set<string>): GrantEntry[];
  /** Cancel all queued waiters whose stepOid is in `stepOids`. Pool state is NOT
   *  modified — the workflow author is responsible for releasing what was acquired
   *  (model intentionally has no per-holder tracking, so abort cleanup of pool
   *  state is impossible). */
  cancelQueuedWaiters(stepOids: Set<string>): void;

  /** Explicit user action: reset each named resource to its registered initial state
   *  (inUse=0 / available=originalNames). Queue is preserved and tryGrant runs so any
   *  waiters can immediately be served from the now-free pool. Returns the resourceKeys
   *  that actually had non-default state before the reset. */
  resetResources(resourceKeys: Set<string>): string[];

  hasResource(resourceKey: string): boolean;
  getSnapshot(): ResourceSnapshotEntry[];
}

// ── Internal State Types ──

interface BinaryExclusiveState {
  type: 'binary exclusive use';
  inUse: 0 | 1;
  queue: string[];                    // queue of waiting stepOids
  ownerId: string;
  scope: 'workflow' | 'environment';
  resourceKey: string;
}

interface BinarySharedState {
  type: 'binary shared use with pool limits';
  inUse: number;
  useLimit: number;
  queue: string[];
  ownerId: string;
  scope: 'workflow' | 'environment';
  resourceKey: string;
}

interface CountableState {
  type: 'countable use with pool limits';
  inUse: number;
  useLimit: number;
  queue: { stepOid: string; amount: number }[];
  ownerId: string;
  scope: 'workflow' | 'environment';
  resourceKey: string;
}

interface NamedPoolState {
  type: 'named pool';
  available: string[];                // names currently free
  originalNames: Set<string>;         // sanity check on release: only names from this pool can be returned
  queue: string[];
  ownerId: string;
  scope: 'workflow' | 'environment';
  resourceKey: string;
}

interface SyncState {
  type: 'sync';
  sendQueue: { stepOid: string; data: string }[];
  receiveQueue: string[];
  pendingSync: string[];
  ownerId: string;
  scope: 'workflow' | 'environment';
  resourceKey: string;
}

type ResourceState = BinaryExclusiveState | BinarySharedState | CountableState | NamedPoolState | SyncState;

// ── Implementation ──

export class InMemoryResourceManager implements ResourceManager {
  private resources = new Map<string, ResourceState>();
  private pendingGrants: GrantEntry[] = [];
  private syncMatchedData = new Map<string, string>();
  private pendingNamedAssignments = new Map<string, string>();

  registerResource(resourceKey: string, spec: ResourcePropertySpecification, ownerId: string, scope?: 'workflow' | 'environment'): void {
    if (this.resources.has(resourceKey)) return;
    const resolvedScope: 'workflow' | 'environment' = scope ?? (spec.scope === 'environment' ? 'environment' : 'workflow');
    switch (spec.resource_type) {
      case 'binary exclusive use':
        this.resources.set(resourceKey, { type: 'binary exclusive use', inUse: 0, queue: [], ownerId, scope: resolvedScope, resourceKey });
        break;
      case 'binary shared use with pool limits':
        this.resources.set(resourceKey, { type: 'binary shared use with pool limits', inUse: 0, useLimit: spec.use_limit ?? 1, queue: [], ownerId, scope: resolvedScope, resourceKey });
        break;
      case 'countable use with pool limits':
        this.resources.set(resourceKey, { type: 'countable use with pool limits', inUse: 0, useLimit: spec.use_limit ?? 1, queue: [], ownerId, scope: resolvedScope, resourceKey });
        break;
      case 'named pool': {
        const names = [...(spec.names ?? [])];
        this.resources.set(resourceKey, { type: 'named pool', available: names, originalNames: new Set(names), queue: [], ownerId, scope: resolvedScope, resourceKey });
        break;
      }
      case 'sync':
        this.resources.set(resourceKey, { type: 'sync', sendQueue: [], receiveQueue: [], pendingSync: [], ownerId, scope: resolvedScope, resourceKey });
        break;
      default:
        throw new Error(`Unknown resource type: "${spec.resource_type}"`);
    }
  }

  unregisterResources(ownerId: string): void {
    for (const [key, state] of this.resources) {
      if (state.ownerId === ownerId) {
        this.resources.delete(key);
      }
    }
  }

  hasResource(resourceKey: string): boolean {
    return this.resources.has(resourceKey);
  }

  private getResource(key: string): ResourceState {
    const r = this.resources.get(key);
    if (!r) throw new Error(`Resource "${key}" is not registered`);
    return r;
  }

  private addGrant(stepOid: string, resourceKey: string): void {
    this.pendingGrants.push({ stepOid, resourceKey });
  }

  // ── Acquire / Release dispatchers ──

  acquire(resourceKey: string, stepOid: string, amount?: number): AcquireResult {
    const r = this.getResource(resourceKey);
    switch (r.type) {
      case 'binary exclusive use': {
        if (r.inUse === 0 && r.queue.length === 0) {
          r.inUse = 1;
          return { granted: true };
        }
        r.queue.push(stepOid);
        return { granted: false };
      }
      case 'binary shared use with pool limits': {
        if (r.inUse < r.useLimit && r.queue.length === 0) {
          r.inUse++;
          return { granted: true };
        }
        r.queue.push(stepOid);
        return { granted: false };
      }
      case 'countable use with pool limits':
        return this.acquireAmount(resourceKey, stepOid, amount ?? 1);
      case 'named pool':
        return this.acquireNamed(resourceKey, stepOid);
      default:
        throw new Error(`acquire() not supported for resource type "${r.type}"`);
    }
  }

  release(resourceKey: string, amount?: number, name?: string): boolean {
    const r = this.getResource(resourceKey);
    switch (r.type) {
      case 'binary exclusive use': {
        if (r.inUse === 0) return false;
        r.inUse = 0;
        this.tryGrantBinaryExclusive(r);
        return true;
      }
      case 'binary shared use with pool limits': {
        if (r.inUse === 0) return false;
        r.inUse--;
        this.tryGrantBinaryShared(r);
        return true;
      }
      case 'countable use with pool limits':
        this.releaseAmount(resourceKey, amount ?? 1);
        return true;
      case 'named pool':
        if (!name) return false;
        return this.releaseNamed(resourceKey, name);
      default:
        return false;
    }
  }

  private tryGrantBinaryExclusive(r: BinaryExclusiveState): void {
    if (r.inUse === 0 && r.queue.length > 0) {
      const next = r.queue.shift()!;
      r.inUse = 1;
      this.addGrant(next, r.resourceKey);
    }
  }

  private tryGrantBinaryShared(r: BinarySharedState): void {
    while (r.inUse < r.useLimit && r.queue.length > 0) {
      const next = r.queue.shift()!;
      r.inUse++;
      this.addGrant(next, r.resourceKey);
    }
  }

  // ── Countable ──

  acquireAmount(resourceKey: string, stepOid: string, amount: number): AcquireResult {
    const r = this.getResource(resourceKey);
    if (r.type !== 'countable use with pool limits') throw new Error(`acquireAmount() not supported for "${r.type}"`);
    if (r.inUse + amount <= r.useLimit && r.queue.length === 0) {
      r.inUse += amount;
      return { granted: true };
    }
    r.queue.push({ stepOid, amount });
    return { granted: false };
  }

  releaseAmount(resourceKey: string, amount: number): void {
    const r = this.getResource(resourceKey);
    if (r.type !== 'countable use with pool limits') throw new Error(`releaseAmount() not supported for "${r.type}"`);
    // Defensive bounds: floor at 0, accept what the workflow author releases.
    r.inUse = Math.max(0, r.inUse - amount);
    this.tryGrantCountable(r);
  }

  private tryGrantCountable(r: CountableState): void {
    while (r.queue.length > 0) {
      const head = r.queue[0];
      if (r.inUse + head.amount <= r.useLimit) {
        r.queue.shift();
        r.inUse += head.amount;
        this.addGrant(head.stepOid, r.resourceKey);
      } else {
        break; // strict FIFO — don't skip a too-large request
      }
    }
  }

  // ── Named Pool ──

  acquireNamed(resourceKey: string, stepOid: string): AcquireResult {
    const r = this.getResource(resourceKey);
    if (r.type !== 'named pool') throw new Error(`acquireNamed() not supported for "${r.type}"`);
    if (r.available.length > 0 && r.queue.length === 0) {
      const name = r.available.shift()!;
      return { granted: true, name };
    }
    r.queue.push(stepOid);
    return { granted: false };
  }

  releaseNamed(resourceKey: string, name: string): boolean {
    const r = this.getResource(resourceKey);
    if (r.type !== 'named pool') return false;
    // Sanity: only names that originally belonged to this pool can be released.
    // Silently ignore double-release (name already in available).
    if (!r.originalNames.has(name)) return false;
    if (r.available.includes(name)) return false;
    r.available.push(name);
    this.tryGrantNamed(r);
    return true;
  }

  private tryGrantNamed(r: NamedPoolState): void {
    // Reserve names at grant time so an unrelated workflow can't acquire them between
    // when we emit the grant and when the granted step's engine resumes. Record the
    // reserved name in pendingNamedAssignments — the engine reads it on grant
    // processing to write the name to the Acquire's cmd.target property.
    while (r.available.length > 0 && r.queue.length > 0) {
      const stepOid = r.queue.shift()!;
      const name = r.available.shift()!;
      this.pendingNamedAssignments.set(stepOid, name);
      this.addGrant(stepOid, r.resourceKey);
    }
  }

  /** Engine consumes the name reserved for a queued Acquire when processing its grant. */
  consumePendingNamedAssignment(stepOid: string): string | undefined {
    const name = this.pendingNamedAssignments.get(stepOid);
    if (name !== undefined) this.pendingNamedAssignments.delete(stepOid);
    return name;
  }

  // ── Sync ──

  send(resourceKey: string, stepOid: string, data: string): SyncResult {
    const r = this.getResource(resourceKey);
    if (r.type !== 'sync') throw new Error(`send() not supported for "${r.type}"`);
    if (r.receiveQueue.length > 0) {
      const receiverStepOid = r.receiveQueue.shift()!;
      this.addGrant(stepOid, r.resourceKey);
      this.addGrant(receiverStepOid, r.resourceKey);
      this.syncMatchedData.set(receiverStepOid, data);
      return { ready: true };
    }
    r.sendQueue.push({ stepOid, data });
    return { ready: false };
  }

  receive(resourceKey: string, stepOid: string): ReceiveResult {
    const r = this.getResource(resourceKey);
    if (r.type !== 'sync') throw new Error(`receive() not supported for "${r.type}"`);
    if (r.sendQueue.length > 0) {
      const sender = r.sendQueue.shift()!;
      this.addGrant(sender.stepOid, r.resourceKey);
      return { available: true, data: sender.data };
    }
    r.receiveQueue.push(stepOid);
    return { available: false };
  }

  synchronize(resourceKey: string, stepOid: string): SyncResult {
    const r = this.getResource(resourceKey);
    if (r.type !== 'sync') throw new Error(`synchronize() not supported for "${r.type}"`);
    r.pendingSync.push(stepOid);
    if (r.pendingSync.length >= 2) {
      const first = r.pendingSync.shift()!;
      const second = r.pendingSync.shift()!;
      this.addGrant(first, r.resourceKey);
      this.addGrant(second, r.resourceKey);
      return { ready: true };
    }
    return { ready: false };
  }

  getSyncData(stepOid: string): string | undefined {
    return this.syncMatchedData.get(stepOid);
  }

  clearSyncData(stepOid: string): void {
    this.syncMatchedData.delete(stepOid);
  }

  flushGranted(knownStepOids?: Set<string>): GrantEntry[] {
    if (!knownStepOids) {
      const result = [...this.pendingGrants];
      this.pendingGrants = [];
      return result;
    }
    const taken: GrantEntry[] = [];
    const remaining: GrantEntry[] = [];
    for (const grant of this.pendingGrants) {
      if (knownStepOids.has(grant.stepOid)) {
        taken.push(grant);
      } else {
        remaining.push(grant);
      }
    }
    this.pendingGrants = remaining;
    return taken;
  }

  cancelQueuedWaiters(stepOids: Set<string>): void {
    for (const state of this.resources.values()) {
      if (state.type === 'binary exclusive use'
        || state.type === 'binary shared use with pool limits'
        || state.type === 'named pool') {
        state.queue = state.queue.filter(s => !stepOids.has(s));
      } else if (state.type === 'countable use with pool limits') {
        state.queue = state.queue.filter(q => !stepOids.has(q.stepOid));
      } else if (state.type === 'sync') {
        state.sendQueue = state.sendQueue.filter(s => !stepOids.has(s.stepOid));
        state.receiveQueue = state.receiveQueue.filter(s => !stepOids.has(s));
        state.pendingSync = state.pendingSync.filter(s => !stepOids.has(s));
      }
    }
    // Clear pending grants and named-pool assignments for cancelled steps; if any names
    // were already reserved for these steps, return them to the pool.
    this.pendingGrants = this.pendingGrants.filter(g => !stepOids.has(g.stepOid));
    for (const [stepOid, name] of this.pendingNamedAssignments) {
      if (stepOids.has(stepOid)) {
        this.pendingNamedAssignments.delete(stepOid);
        // Find the resource and return the name. Linear scan acceptable for cleanup path.
        for (const state of this.resources.values()) {
          if (state.type === 'named pool' && state.originalNames.has(name) && !state.available.includes(name)) {
            state.available.push(name);
            break;
          }
        }
      }
    }
  }

  getSnapshot(): ResourceSnapshotEntry[] {
    const result: ResourceSnapshotEntry[] = [];
    for (const [key, r] of this.resources) {
      const colon = key.indexOf(':');
      const resourceName = colon >= 0 ? key.substring(colon + 1) : key;
      let total = 0;
      let inUse = 0;
      let available = 0;
      let queued = r.type === 'sync' ? 0 : r.queue.length;
      let state: string;
      switch (r.type) {
        case 'binary exclusive use':
          total = 1; inUse = r.inUse; available = 1 - r.inUse;
          state = r.inUse === 1 ? 'In use' : 'Free';
          break;
        case 'binary shared use with pool limits':
          total = r.useLimit; inUse = r.inUse; available = r.useLimit - r.inUse;
          state = `${r.inUse}/${r.useLimit} in use`;
          break;
        case 'countable use with pool limits':
          total = r.useLimit; inUse = r.inUse; available = r.useLimit - r.inUse;
          state = `${r.inUse}/${r.useLimit} in use`;
          break;
        case 'named pool':
          total = r.originalNames.size; available = r.available.length; inUse = total - available;
          state = `${available} available, ${inUse} in use`;
          break;
        case 'sync':
          total = 0; inUse = 0; available = 0;
          queued = r.sendQueue.length + r.receiveQueue.length + r.pendingSync.length;
          state = `send:${r.sendQueue.length} recv:${r.receiveQueue.length} sync:${r.pendingSync.length}`;
          break;
      }
      result.push({
        name: key,
        ownerId: r.ownerId,
        scope: r.scope,
        resourceName,
        type: r.type,
        total,
        inUse,
        available,
        queued,
        queuedAcquires: queued,
        state,
      });
    }
    return result;
  }

  resetResources(resourceKeys: Set<string>): string[] {
    const reset: string[] = [];
    for (const key of resourceKeys) {
      const state = this.resources.get(key);
      if (!state) continue;
      switch (state.type) {
        case 'binary exclusive use':
          if (state.inUse > 0) reset.push(key);
          state.inUse = 0;
          this.tryGrantBinaryExclusive(state);
          break;
        case 'binary shared use with pool limits':
          if (state.inUse > 0) reset.push(key);
          state.inUse = 0;
          this.tryGrantBinaryShared(state);
          break;
        case 'countable use with pool limits':
          if (state.inUse > 0) reset.push(key);
          state.inUse = 0;
          this.tryGrantCountable(state);
          break;
        case 'named pool':
          if (state.available.length !== state.originalNames.size) reset.push(key);
          state.available = [...state.originalNames];
          this.tryGrantNamed(state);
          break;
        case 'sync':
          state.sendQueue = [];
          state.receiveQueue = [];
          state.pendingSync = [];
          break;
      }
    }
    return reset;
  }
}
