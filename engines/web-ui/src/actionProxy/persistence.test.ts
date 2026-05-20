// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PersistenceStore } from './persistence.js';

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string): void { this.map.delete(k); }
  setItem(k: string, v: string): void { this.map.set(k, v); }
}

test('upsert + readAll roundtrips entries', () => {
  const s = new PersistenceStore(new FakeStorage());
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si1', stepOid: 'step1', instanceId: 'ai1', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 5 });
  s.flushSync();
  const all = s.readAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].instanceId, 'ai1');
  assert.equal(all[0].lastEventId, 5);
});

test('upsert by stepInstanceId is idempotent', () => {
  const s = new PersistenceStore(new FakeStorage());
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si1', stepOid: 'step1', instanceId: 'ai1', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 5 });
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si1', stepOid: 'step1', instanceId: 'ai1', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'COMPLETED', lastEventId: 7 });
  s.flushSync();
  assert.equal(s.readAll().length, 1);
  assert.equal(s.readAll()[0].lastKnownServerState, 'COMPLETED');
});

test('remove deletes by stepInstanceId', () => {
  const s = new PersistenceStore(new FakeStorage());
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si1', stepOid: 'step1', instanceId: 'ai1', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 1 });
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si2', stepOid: 'step2', instanceId: 'ai2', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 1 });
  s.remove('si1');
  s.flushSync();
  const all = s.readAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].stepInstanceId, 'si2');
});

test('removeWorkflow deletes all entries for workflow', () => {
  const s = new PersistenceStore(new FakeStorage());
  s.upsert({ workflowInstanceId: 'wf1', stepInstanceId: 'si1', stepOid: 'step1', instanceId: 'ai1', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 1 });
  s.upsert({ workflowInstanceId: 'wf2', stepInstanceId: 'si2', stepOid: 'step2', instanceId: 'ai2', serverUri: 'http://localhost:3002', environmentOid: 'env1', lastKnownServerState: 'RUNNING', lastEventId: 1 });
  s.removeWorkflow('wf1');
  s.flushSync();
  assert.equal(s.readAll().length, 1);
});

test('migrates from corrupted storage by resetting', () => {
  const fs = new FakeStorage();
  fs.setItem('trajectory.actionProxyState.v1', '{not valid json');
  const s = new PersistenceStore(fs);
  assert.equal(s.readAll().length, 0);
});
