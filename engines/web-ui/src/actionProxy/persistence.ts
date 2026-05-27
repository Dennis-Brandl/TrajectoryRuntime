// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.

export interface PersistedInstance {
  workflowInstanceId: string;
  stepInstanceId: string;
  stepOid: string;
  instanceId: string;
  serverUri: string;
  environmentOid: string;
  lastKnownServerState: string;
  lastEventId: number | null;
}

interface PersistedSlice {
  version: 1;
  instances: PersistedInstance[];
}

const KEY = 'trajectory.actionProxyState.v1';

export class PersistenceStore {
  private slice: PersistedSlice;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 250;

  constructor(private storage: Storage = (typeof localStorage !== 'undefined' ? localStorage : (null as unknown as Storage))) {
    this.slice = this.load();
  }

  private load(): PersistedSlice {
    const raw = this.storage?.getItem(KEY);
    if (!raw) return { version: 1, instances: [] };
    try {
      const parsed = JSON.parse(raw) as PersistedSlice;
      if (parsed?.version !== 1 || !Array.isArray(parsed.instances)) throw new Error('shape');
      return parsed;
    } catch {
      return { version: 1, instances: [] };
    }
  }

  readAll(): PersistedInstance[] {
    return [...this.slice.instances];
  }

  upsert(entry: PersistedInstance): void {
    const idx = this.slice.instances.findIndex(e => e.stepInstanceId === entry.stepInstanceId);
    if (idx >= 0) this.slice.instances[idx] = entry;
    else this.slice.instances.push(entry);
    this.scheduleWrite();
  }

  remove(stepInstanceId: string): void {
    this.slice.instances = this.slice.instances.filter(e => e.stepInstanceId !== stepInstanceId);
    this.scheduleWrite();
  }

  removeWorkflow(workflowInstanceId: string): void {
    this.slice.instances = this.slice.instances.filter(e => e.workflowInstanceId !== workflowInstanceId);
    this.scheduleWrite();
  }

  flushSync(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.write();
  }

  private scheduleWrite(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.write(); }, this.DEBOUNCE_MS);
  }

  private write(): void {
    if (!this.storage) return;
    this.storage.setItem(KEY, JSON.stringify(this.slice));
  }
}
