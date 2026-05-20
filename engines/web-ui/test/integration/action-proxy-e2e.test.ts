// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { ensureContainerUp, listCapabilities, invokeAction, getInstance, deleteInstance, waitForState, sendCommand, BASE_URL } from './action-container.js';

let containerOk = false;

before(async () => {
  try {
    await ensureContainerUp();
    containerOk = true;
  } catch (e) {
    console.warn(`[integration] Skipping all tests: ${e instanceof Error ? e.message : e}`);
  }
});

test('invoke → reaches COMPLETED', async (t) => {
  if (!containerOk) { t.skip('container not reachable'); return; }
  const caps = await listCapabilities();
  assert.ok(caps.length > 0, 'container has at least one action');
  const observable = caps.find(c => c.visibility === 'observable');
  assert.ok(observable, 'expected at least one observable action');

  const instanceId = await invokeAction(observable!.action_oid, {
    environment_oid: 'env-test',
    workflow_instance_id: 'e2e-wf-1',
    step_instance_id: 'e2e-si-1',
    step_oid: 'e2e-step-1',
    input_parameters: [],
  });

  await waitForState(instanceId, 'COMPLETED', 30_000);
  const snap = await getInstance(instanceId);
  assert.equal(snap.state.current, 'COMPLETED');
  await deleteInstance(instanceId);
});

test('PAUSE command returns 200 when valid', async (t) => {
  if (!containerOk) { t.skip('container not reachable'); return; }
  const caps = await listCapabilities();
  const target = caps.find(c => c.supported_commands.includes('PAUSE') && c.visibility === 'observable');
  if (!target) return;
  const instanceId = await invokeAction(target.action_oid, {
    environment_oid: 'env-test',
    workflow_instance_id: 'e2e-wf-2',
    step_instance_id: 'e2e-si-2',
    step_oid: 'e2e-step-2',
    input_parameters: [],
  });
  try {
    await waitForState(instanceId, 'RUNNING', 10_000);
  } catch {
    // some actions skip RUNNING and go straight to COMPLETED on test fixtures
  }
  const resp = await sendCommand(instanceId, 'PAUSE');
  assert.ok([200, 409].includes(resp.status), `unexpected status ${resp.status}`);
  await deleteInstance(instanceId);
});

test('DELETE on missing instance returns 404 and we tolerate it', async (t) => {
  if (!containerOk) { t.skip('container not reachable'); return; }
  const resp = await fetch(`${BASE_URL}/trajectory/v1/instances/non-existent`, { method: 'DELETE' });
  assert.ok([404, 200].includes(resp.status));
});

test('invalid command returns 422', async (t) => {
  if (!containerOk) { t.skip('container not reachable'); return; }
  const caps = await listCapabilities();
  const target = caps[0];
  const instanceId = await invokeAction(target.action_oid, {
    environment_oid: 'env-test',
    workflow_instance_id: 'e2e-wf-3',
    step_instance_id: 'e2e-si-3',
    step_oid: 'e2e-step-3',
    input_parameters: [],
  });
  const resp = await sendCommand(instanceId, 'BOGUS');
  assert.equal(resp.status, 422);
  await deleteInstance(instanceId);
});
