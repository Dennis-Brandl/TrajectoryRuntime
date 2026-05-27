// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SseObserver } from './SseObserver.js';
import type { ActionEvent } from './types.js';

interface FakeListener { (ev: { data: string; lastEventId?: string }): void; }

class FakeEventSource {
  static last: FakeEventSource | null = null;
  url: string;
  withCredentials = false;
  readyState = 0;
  onerror: ((ev: Event) => void) | null = null;
  private listeners = new Map<string, FakeListener[]>();
  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: FakeListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(listener);
  }
  close(): void { this.readyState = 2; }
  emit(type: string, data: unknown, id?: number): void {
    const ls = this.listeners.get(type) ?? [];
    for (const l of ls) l({ data: JSON.stringify(data), lastEventId: id?.toString() });
  }
}

test('SseObserver routes state_change events to onEvent', async () => {
  const received: ActionEvent[] = [];
  const observer = new SseObserver(FakeEventSource as unknown as typeof EventSource);
  const unsub = observer.subscribe('http://localhost:3002', 'ai-1', e => received.push(e));
  assert.match(FakeEventSource.last!.url, /\/trajectory\/v1\/instances\/ai-1\/events$/);

  FakeEventSource.last!.emit('state_change', { instance_id: 'ai-1', state: 'RUNNING', previous_state: 'IDLE', timestamp: '2026-05-19T00:00:00Z' }, 1);
  assert.equal(received.length, 1);
  assert.equal(received[0].kind, 'state_change');
  if (received[0].kind === 'state_change') {
    assert.equal(received[0].state, 'RUNNING');
    assert.equal(received[0].eventId, 1);
  }
  unsub();
});

test('SseObserver routes output events', async () => {
  const received: ActionEvent[] = [];
  const observer = new SseObserver(FakeEventSource as unknown as typeof EventSource);
  observer.subscribe('http://localhost:3002', 'ai-2', e => received.push(e));
  FakeEventSource.last!.emit('output', { instance_id: 'ai-2', outputs: [{ name: 'duration_ms', value: '500' }], timestamp: '2026-05-19T00:00:01Z' }, 2);
  assert.equal(received.length, 1);
  assert.equal(received[0].kind, 'output');
});

test('SseObserver routes log events', async () => {
  const received: ActionEvent[] = [];
  const observer = new SseObserver(FakeEventSource as unknown as typeof EventSource);
  observer.subscribe('http://localhost:3002', 'ai-3', e => received.push(e));
  FakeEventSource.last!.emit('log', { instance_id: 'ai-3', stream: 'stderr', message: 'boom', timestamp: '2026-05-19T00:00:02Z' }, 3);
  assert.equal(received.length, 1);
  assert.equal(received[0].kind, 'log');
});

test('SseObserver close stops further events', async () => {
  const received: ActionEvent[] = [];
  const observer = new SseObserver(FakeEventSource as unknown as typeof EventSource);
  const unsub = observer.subscribe('http://localhost:3002', 'ai-4', e => received.push(e));
  const es = FakeEventSource.last!;
  unsub();
  assert.equal(es.readyState, 2); // closed
});
