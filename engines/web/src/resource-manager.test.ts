// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryResourceManager } from './resource-manager.js';

// Resource manager model: pools are pure state (counts or named lists).
// Acquire decrements; Release increments. The manager does NOT track
// who holds what — workflow author is responsible for releasing the right
// name/amount. Queue entries identify waiters by stepOid only (for grant
// routing on release).

describe('InMemoryResourceManager — binary exclusive use', () => {
  function makeManager() {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource('wf1:Lock', { name: 'Lock', resource_type: 'binary exclusive use' }, 'wf1');
    return mgr;
  }

  it('acquire succeeds when resource is free', () => {
    const mgr = makeManager();
    const result = mgr.acquire('wf1:Lock', 's1');
    assert.deepEqual(result, { granted: true });
  });

  it('acquire fails when resource is held', () => {
    const mgr = makeManager();
    mgr.acquire('wf1:Lock', 's1');
    const result = mgr.acquire('wf1:Lock', 's2');
    assert.deepEqual(result, { granted: false });
  });

  it('release frees the resource for next acquirer', () => {
    const mgr = makeManager();
    mgr.acquire('wf1:Lock', 's1');
    mgr.release('wf1:Lock');
    const result = mgr.acquire('wf1:Lock', 's2');
    assert.deepEqual(result, { granted: true });
  });

  it('queued request is granted after release via flushGranted', () => {
    const mgr = makeManager();
    mgr.acquire('wf1:Lock', 's1');
    mgr.acquire('wf1:Lock', 's2'); // queued
    mgr.release('wf1:Lock');
    const granted = mgr.flushGranted();
    assert.equal(granted.length, 1);
    assert.equal(granted[0].stepOid, 's2');
    assert.equal(granted[0].resourceKey, 'wf1:Lock');
  });

  it('release of free resource returns false (no-op)', () => {
    const mgr = makeManager();
    assert.equal(mgr.release('wf1:Lock'), false);
  });

  it('double release after acquire is no-op on the second call', () => {
    const mgr = makeManager();
    mgr.acquire('wf1:Lock', 's1');
    assert.equal(mgr.release('wf1:Lock'), true);
    assert.equal(mgr.release('wf1:Lock'), false); // already free
  });

  it('throws on unregistered resource', () => {
    const mgr = new InMemoryResourceManager();
    assert.throws(() => mgr.acquire('NoSuch', 's1'), /not registered/);
  });

  it('FIFO queue order', () => {
    const mgr = makeManager();
    mgr.acquire('wf1:Lock', 's1');
    mgr.acquire('wf1:Lock', 's2'); // queued
    mgr.acquire('wf1:Lock', 's3'); // queued
    mgr.release('wf1:Lock');
    const g1 = mgr.flushGranted();
    assert.equal(g1.length, 1);
    assert.equal(g1[0].stepOid, 's2');
    mgr.release('wf1:Lock');
    const g2 = mgr.flushGranted();
    assert.equal(g2.length, 1);
    assert.equal(g2[0].stepOid, 's3');
  });
});

describe('InMemoryResourceManager — binary shared use with pool limits', () => {
  function makeManager() {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource('wf1:Pool', { name: 'Pool', resource_type: 'binary shared use with pool limits', use_limit: 2 }, 'wf1');
    return mgr;
  }

  it('multiple acquires up to use_limit succeed', () => {
    const mgr = makeManager();
    assert.deepEqual(mgr.acquire('wf1:Pool', 's1'), { granted: true });
    assert.deepEqual(mgr.acquire('wf1:Pool', 's2'), { granted: true });
  });

  it('acquire beyond use_limit fails', () => {
    const mgr = makeManager();
    mgr.acquire('wf1:Pool', 's1');
    mgr.acquire('wf1:Pool', 's2');
    assert.deepEqual(mgr.acquire('wf1:Pool', 's3'), { granted: false });
  });

  it('release opens slot for queued request', () => {
    const mgr = makeManager();
    mgr.acquire('wf1:Pool', 's1');
    mgr.acquire('wf1:Pool', 's2');
    mgr.acquire('wf1:Pool', 's3'); // queued
    mgr.release('wf1:Pool');
    const granted = mgr.flushGranted();
    assert.equal(granted.length, 1);
    assert.equal(granted[0].stepOid, 's3');
  });
});

describe('InMemoryResourceManager — countable use with pool limits', () => {
  function makeManager() {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource('wf1:Slots', { name: 'Slots', resource_type: 'countable use with pool limits', use_limit: 10 }, 'wf1');
    return mgr;
  }

  it('acquire amount within limit', () => {
    const mgr = makeManager();
    assert.deepEqual(mgr.acquireAmount('wf1:Slots', 's1', 5), { granted: true });
    assert.deepEqual(mgr.acquireAmount('wf1:Slots', 's2', 5), { granted: true });
  });

  it('acquire amount exceeding limit fails', () => {
    const mgr = makeManager();
    mgr.acquireAmount('wf1:Slots', 's1', 8);
    assert.deepEqual(mgr.acquireAmount('wf1:Slots', 's2', 5), { granted: false });
  });

  it('strict FIFO: large request at head blocks smaller request behind', () => {
    const mgr = makeManager();
    mgr.acquireAmount('wf1:Slots', 's1', 8);
    mgr.acquireAmount('wf1:Slots', 's2', 5); // queued
    mgr.acquireAmount('wf1:Slots', 's3', 1); // queued behind s2
    mgr.releaseAmount('wf1:Slots', 3); // now 5 free — s2 can be served
    const granted = mgr.flushGranted();
    assert.equal(granted.length, 1);
    assert.equal(granted[0].stepOid, 's2');
    // s3 still queued
    assert.deepEqual(mgr.flushGranted(), []);
  });

  it('releaseAmount clamps inUse at zero (defensive bound on author error)', () => {
    const mgr = makeManager();
    mgr.acquireAmount('wf1:Slots', 's1', 3);
    // Author releases more than they acquired — silently clamped to 0.
    mgr.releaseAmount('wf1:Slots', 5);
    // Pool now fully free; an 8-amount acquire succeeds.
    assert.deepEqual(mgr.acquireAmount('wf1:Slots', 's2', 8), { granted: true });
  });

  it('multiple acquires + releases of arbitrary amounts (no per-holder tracking)', () => {
    const mgr = makeManager();
    mgr.acquireAmount('wf1:Slots', 's1', 4);
    mgr.acquireAmount('wf1:Slots', 's2', 3);
    // Pool: 7/10 in use. Release 4 (whichever amount author chose).
    mgr.releaseAmount('wf1:Slots', 4);
    // Pool: 3/10 in use. Now 7 free.
    assert.deepEqual(mgr.acquireAmount('wf1:Slots', 's3', 7), { granted: true });
  });
});

describe('InMemoryResourceManager — named pool', () => {
  function makeManager() {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource('wf1:Docks', {
      name: 'Docks',
      resource_type: 'named pool',
      names: ['Dock 1', 'Dock 2', 'Dock 3'],
    }, 'wf1');
    return mgr;
  }

  it('acquire assigns any available name', () => {
    const mgr = makeManager();
    const result = mgr.acquireNamed('wf1:Docks', 's1');
    assert.equal(result.granted, true);
    assert.ok('name' in result && result.name);
  });

  it('exhaust pool then queue', () => {
    const mgr = makeManager();
    mgr.acquireNamed('wf1:Docks', 's1');
    mgr.acquireNamed('wf1:Docks', 's2');
    mgr.acquireNamed('wf1:Docks', 's3');
    assert.deepEqual(mgr.acquireNamed('wf1:Docks', 's4'), { granted: false });
  });

  it('release returns name to pool', () => {
    const mgr = makeManager();
    const r1 = mgr.acquireNamed('wf1:Docks', 's1');
    assert.ok(r1.granted && r1.name);
    assert.equal(mgr.releaseNamed('wf1:Docks', r1.name), true);
    const r2 = mgr.acquireNamed('wf1:Docks', 's2');
    assert.equal(r2.granted, true);
  });

  it('multi-acquire + release of arbitrary names (no holder tracking)', () => {
    // The bug that motivated the model change: hold multiple names, release out of order.
    const mgr = makeManager();
    const r1 = mgr.acquireNamed('wf1:Docks', 's1');
    const r2 = mgr.acquireNamed('wf1:Docks', 's2');
    const r3 = mgr.acquireNamed('wf1:Docks', 's3');
    assert.ok(r1.granted && r1.name && r2.granted && r2.name && r3.granted && r3.name);
    // Release the SECOND-acquired name (out of order). Author tells us which name.
    assert.equal(mgr.releaseNamed('wf1:Docks', r2.name), true);
    // Pool now has r2.name available; new acquire should grant it.
    const r4 = mgr.acquireNamed('wf1:Docks', 's4');
    assert.ok(r4.granted && r4.name === r2.name);
  });

  it('double-release of the same name is silently ignored', () => {
    const mgr = makeManager();
    const r1 = mgr.acquireNamed('wf1:Docks', 's1');
    assert.ok(r1.granted && r1.name);
    assert.equal(mgr.releaseNamed('wf1:Docks', r1.name), true);
    assert.equal(mgr.releaseNamed('wf1:Docks', r1.name), false); // already in pool
  });

  it('release of a name that was never part of the pool is silently ignored', () => {
    const mgr = makeManager();
    assert.equal(mgr.releaseNamed('wf1:Docks', 'Phantom Dock'), false);
  });

  it('release grants to queued request and propagates name via pendingNamedAssignment', () => {
    const mgr = makeManager();
    const r1 = mgr.acquireNamed('wf1:Docks', 's1');
    mgr.acquireNamed('wf1:Docks', 's2');
    mgr.acquireNamed('wf1:Docks', 's3');
    mgr.acquireNamed('wf1:Docks', 's4'); // queued
    assert.ok(r1.granted && r1.name);
    mgr.releaseNamed('wf1:Docks', r1.name);
    const granted = mgr.flushGranted();
    assert.equal(granted.length, 1);
    assert.equal(granted[0].stepOid, 's4');
    // The reserved name is delivered to the engine via consumePendingNamedAssignment.
    const assignedName = mgr.consumePendingNamedAssignment('s4');
    assert.equal(assignedName, r1.name);
    // Consumed once — second consume returns undefined.
    assert.equal(mgr.consumePendingNamedAssignment('s4'), undefined);
  });
});

describe('InMemoryResourceManager — sync', () => {
  function makeManager() {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource('wf1:Chan', { name: 'Chan', resource_type: 'sync' }, 'wf1');
    return mgr;
  }

  it('send then receive: sender waits, receiver picks up data', () => {
    const mgr = makeManager();
    const sendResult = mgr.send('wf1:Chan', 'sender-step', 'hello');
    assert.deepEqual(sendResult, { ready: false });
    const recvResult = mgr.receive('wf1:Chan', 'receiver-step');
    assert.deepEqual(recvResult, { available: true, data: 'hello' });
    const granted = mgr.flushGranted();
    assert.ok(granted.some(g => g.stepOid === 'sender-step'));
  });

  it('receive then send: receiver waits, sender delivers', () => {
    const mgr = makeManager();
    const recvResult = mgr.receive('wf1:Chan', 'receiver-step');
    assert.deepEqual(recvResult, { available: false });
    const sendResult = mgr.send('wf1:Chan', 'sender-step', 'world');
    assert.deepEqual(sendResult, { ready: true });
    const granted = mgr.flushGranted();
    assert.ok(granted.some(g => g.stepOid === 'receiver-step'));
    assert.ok(granted.some(g => g.stepOid === 'sender-step'));
    const data = mgr.getSyncData('receiver-step');
    assert.equal(data, 'world');
  });

  it('synchronize: both sides wait, then both released', () => {
    const mgr = makeManager();
    assert.deepEqual(mgr.synchronize('wf1:Chan', 's1'), { ready: false });
    assert.deepEqual(mgr.synchronize('wf1:Chan', 's2'), { ready: true });
    const granted = mgr.flushGranted();
    assert.ok(granted.some(g => g.stepOid === 's1'));
    assert.ok(granted.some(g => g.stepOid === 's2'));
  });
});

describe('InMemoryResourceManager — cancelQueuedWaiters', () => {
  it('removes waiters from binary/shared/countable/named/sync queues without touching pool state', () => {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource('wf1:Lock', { name: 'Lock', resource_type: 'binary exclusive use' }, 'wf1');
    mgr.registerResource('wf1:Pool', { name: 'Pool', resource_type: 'binary shared use with pool limits', use_limit: 1 }, 'wf1');
    mgr.registerResource('wf1:Slots', { name: 'Slots', resource_type: 'countable use with pool limits', use_limit: 5 }, 'wf1');
    mgr.registerResource('wf1:Docks', { name: 'Docks', resource_type: 'named pool', names: ['A', 'B'] }, 'wf1');

    // Hold the binary/shared resources, then queue some waiters.
    mgr.acquire('wf1:Lock', 'holder-step');
    mgr.acquire('wf1:Lock', 's2'); // queued
    mgr.acquire('wf1:Pool', 'holder-step');
    mgr.acquire('wf1:Pool', 's3'); // queued
    mgr.acquireAmount('wf1:Slots', 'holder-step', 5);
    mgr.acquireAmount('wf1:Slots', 's4', 3); // queued
    mgr.acquireNamed('wf1:Docks', 'h1');
    mgr.acquireNamed('wf1:Docks', 'h2');
    mgr.acquireNamed('wf1:Docks', 's5'); // queued

    mgr.cancelQueuedWaiters(new Set(['s2', 's3', 's4', 's5']));

    // Holder still holds: subsequent release grants only the un-cancelled waiters (none here).
    mgr.release('wf1:Lock');
    mgr.release('wf1:Pool');
    mgr.releaseAmount('wf1:Slots', 5);
    mgr.releaseNamed('wf1:Docks', 'A');
    const granted = mgr.flushGranted();
    assert.deepEqual(granted, []); // queues were cancelled
  });

  it('does NOT auto-release pool state (model intentionally lacks per-holder tracking)', () => {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource('wf1:Lock', { name: 'Lock', resource_type: 'binary exclusive use' }, 'wf1');
    mgr.acquire('wf1:Lock', 'step-from-aborted-workflow');
    // Cancelling the waiters of an aborted workflow does NOT release what the workflow held.
    // Workflow author is responsible for matching Acquire with Release on the End path.
    mgr.cancelQueuedWaiters(new Set(['step-from-aborted-workflow']));
    // Lock is still held — leak is by design.
    assert.deepEqual(mgr.acquire('wf1:Lock', 's2'), { granted: false });
  });
});
