// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type { ActionEvent, ActionInstanceObserver, ServerState } from './types.js';

type ESCtor = typeof EventSource;

export class SseObserver implements ActionInstanceObserver {
  constructor(private ESImpl: ESCtor = typeof EventSource !== 'undefined' ? EventSource : (undefined as unknown as ESCtor)) {
    if (!this.ESImpl) throw new Error('SseObserver requires EventSource (browser or polyfill).');
  }

  subscribe(serverUri: string, instanceId: string, onEvent: (e: ActionEvent) => void): () => void {
    const url = `${serverUri}/trajectory/v1/instances/${encodeURIComponent(instanceId)}/events`;
    const es = new this.ESImpl(url);

    es.addEventListener('state_change', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data) as { state: ServerState; previous_state: ServerState | null; timestamp: string };
      onEvent({ kind: 'state_change', state: data.state, previous_state: data.previous_state, ts: data.timestamp, eventId: Number(ev.lastEventId) });
    });

    es.addEventListener('output', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data) as { outputs: Array<{ name: string; value: string }>; timestamp: string };
      onEvent({ kind: 'output', outputs: data.outputs, ts: data.timestamp, eventId: Number(ev.lastEventId) });
    });

    es.addEventListener('log', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data) as { stream: 'stdout' | 'stderr'; message: string; timestamp: string };
      onEvent({ kind: 'log', stream: data.stream, message: data.message, ts: data.timestamp, eventId: Number(ev.lastEventId) });
    });

    es.addEventListener('heartbeat', (ev: MessageEvent) => {
      const data = JSON.parse(ev.data) as { timestamp: string };
      onEvent({ kind: 'heartbeat', ts: data.timestamp });
    });

    return () => es.close();
  }
}
