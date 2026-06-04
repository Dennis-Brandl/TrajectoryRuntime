// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ActionProxyController } from './ActionProxyController.js';
import { PersistenceStore } from './persistence.js';
import type { ActionEvent, ActionInstanceObserver } from './types.js';

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string): void { this.map.delete(k); }
  setItem(k: string, v: string): void { this.map.set(k, v); }
}

class FakeObserver implements ActionInstanceObserver {
  private handlers: Array<(e: ActionEvent) => void> = [];
  subscribe(_uri: string, _id: string, onEvent: (e: ActionEvent) => void): () => void {
    this.handlers.push(onEvent);
    return () => { this.handlers = this.handlers.filter(h => h !== onEvent); };
  }
  emit(e: ActionEvent): void { for (const h of this.handlers) h(e); }
}

function fakeFetch(invokeResult: { status: number; body: unknown }, commandResult?: { status: number; body: unknown }) {
  return async (url: string, _init: RequestInit) => {
    if (url.includes('/invoke')) return new Response(JSON.stringify(invokeResult.body), { status: invokeResult.status, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/command')) {
      const r = commandResult ?? { status: 200, body: { data: {}, meta: {} } };
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/instances/ai-1')) return new Response('', { status: 200 });
    throw new Error(`unexpected ${url}`);
  };
}

interface CapturedTerminal {
  state: 'COMPLETED' | 'ERRORED';
  outputs: Record<string, string>;
  errorMessage: string | null;
  failureMode?: 'error' | 'abort' | 'timeout' | null;
}

test('invokes and subscribes, then on COMPLETED writes outputs and signals terminal', async () => {
  const store = new PersistenceStore(new FakeStorage());
  const observer = new FakeObserver();
  const captured: CapturedTerminal[] = [];
  const controller = new ActionProxyController({
    serverUri: 'http://localhost:3002',
    actionOid: 'act-1',
    invokeRequest: { environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [{ name: 'src', value: 'A' }] },
    visibility: 'observable',
    supportedCommands: ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'],
    persistence: store,
    observer,
    fetchImpl: fakeFetch({ status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } }) as typeof fetch,
    onTerminal: t => captured.push(t),
  });
  await controller.start();
  assert.equal(store.readAll().length, 1);
  observer.emit({ kind: 'state_change', state: 'RUNNING', previous_state: 'IDLE', ts: '2026-05-19T00:00:01Z', eventId: 1 });
  assert.equal(controller.getSnapshot().serverState, 'RUNNING');
  observer.emit({ kind: 'output', outputs: [{ name: 'duration_ms', value: '500' }], ts: '2026-05-19T00:00:02Z', eventId: 2 });
  observer.emit({ kind: 'state_change', state: 'COMPLETED', previous_state: 'RUNNING', ts: '2026-05-19T00:00:03Z', eventId: 3 });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].state, 'COMPLETED');
  assert.deepEqual(captured[0].outputs, { duration_ms: '500' });
  store.flushSync();
  assert.equal(store.readAll().length, 0);
});

test('on ABORTED signals terminal as ERRORED', async () => {
  const observer = new FakeObserver();
  const captured: CapturedTerminal[] = [];
  const controller = new ActionProxyController({
    serverUri: 'http://localhost:3002',
    actionOid: 'act-1',
    invokeRequest: { environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [] },
    visibility: 'observable',
    supportedCommands: ['ABORT'],
    persistence: new PersistenceStore(new FakeStorage()),
    observer,
    fetchImpl: fakeFetch({ status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } }) as typeof fetch,
    onTerminal: t => captured.push(t),
  });
  await controller.start();
  observer.emit({ kind: 'state_change', state: 'ABORTED', previous_state: 'RUNNING', ts: '2026-05-19T00:00:00Z', eventId: 1 });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].state, 'ERRORED');
});

test('classifies ABORTED terminal as failureMode "abort"', async () => {
  const observer = new FakeObserver();
  const captured: CapturedTerminal[] = [];
  const controller = new ActionProxyController({
    serverUri: 'http://localhost:3002', actionOid: 'act-1',
    invokeRequest: { environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [] },
    visibility: 'observable', supportedCommands: ['ABORT'],
    persistence: new PersistenceStore(new FakeStorage()), observer,
    fetchImpl: fakeFetch({ status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } }) as typeof fetch,
    onTerminal: t => captured.push(t),
  });
  await controller.start();
  observer.emit({ kind: 'state_change', state: 'ABORTED', previous_state: 'RUNNING', ts: 't', eventId: 1 });
  assert.equal(captured[0].state, 'ERRORED');
  assert.equal(captured[0].failureMode, 'abort');
});

test('sendCommand 409 captures error but stays subscribed', async () => {
  const observer = new FakeObserver();
  const controller = new ActionProxyController({
    serverUri: 'http://localhost:3002',
    actionOid: 'act-1',
    invokeRequest: { environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [] },
    visibility: 'observable',
    supportedCommands: ['PAUSE','RESUME','ABORT'],
    persistence: new PersistenceStore(new FakeStorage()),
    observer,
    fetchImpl: fakeFetch(
      { status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } },
      { status: 409, body: { error: { code: 'INVALID_STATE_TRANSITION', message: 'no', details: { current_state: 'COMPLETED' } } } },
    ) as typeof fetch,
    onTerminal: () => {},
  });
  await controller.start();
  await assert.rejects(() => controller.sendCommand('PAUSE'), (e: unknown) => (e as { code: string }).code === 'INVALID_STATE_TRANSITION');
});

test('logs ring caps at 100 entries', async () => {
  const observer = new FakeObserver();
  const controller = new ActionProxyController({
    serverUri: 'http://localhost:3002',
    actionOid: 'act-1',
    invokeRequest: { environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [] },
    visibility: 'observable',
    supportedCommands: ['ABORT'],
    persistence: new PersistenceStore(new FakeStorage()),
    observer,
    fetchImpl: fakeFetch({ status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } }) as typeof fetch,
    onTerminal: () => {},
  });
  await controller.start();
  for (let i = 0; i < 120; i++) {
    observer.emit({ kind: 'log', stream: 'stdout', message: `msg ${i}`, ts: '2026-05-19T00:00:00Z', eventId: i + 1 });
  }
  const logs = controller.getSnapshot().logs;
  assert.equal(logs.length, 100);
  assert.equal(logs[0].message, 'msg 20');
  assert.equal(logs[99].message, 'msg 119');
});

test('fires ABORT and a timeout terminal when the wall-clock elapses', async () => {
  const observer = new FakeObserver();
  const captured: CapturedTerminal[] = [];
  let fire: (() => void) | null = null;
  const controller = new ActionProxyController({
    serverUri: 'http://localhost:3002', actionOid: 'act-1',
    invokeRequest: { environment_oid: 'env-1', workflow_instance_id: 'wf-1', step_instance_id: 'si-1', step_oid: 'step-1', input_parameters: [] },
    visibility: 'observable', supportedCommands: ['ABORT'],
    persistence: new PersistenceStore(new FakeStorage()), observer,
    fetchImpl: fakeFetch({ status: 201, body: { data: { instance_id: 'ai-1' }, meta: {} } }) as typeof fetch,
    timeoutMs: 1000,
    setTimeoutImpl: (cb: () => void) => { fire = cb; return 1 as unknown as ReturnType<typeof setTimeout>; },
    clearTimeoutImpl: () => { fire = null; },
    onTerminal: t => captured.push(t),
  });
  await controller.start();
  assert.ok(fire, 'timer not scheduled');
  const doFire = fire as () => void;
  doFire();
  assert.equal(captured.length, 1);
  assert.equal(captured[0].state, 'ERRORED');
  assert.equal(captured[0].failureMode, 'timeout');
});
