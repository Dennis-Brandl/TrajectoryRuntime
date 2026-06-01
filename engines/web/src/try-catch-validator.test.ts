// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './validator.js';

const DATE = '2026-05-31T12:00:00.000Z';
function step(o: Record<string, unknown>) {
  return { version: '1.0.0', last_modified_date: DATE, ...o };
}
/** START→Action→END main flow + an independent CATCH→RETURN island.
 *  The ACTION PROXY carries a valid action_proxy_config + matching environment
 *  (shape from exec-action-proxy-001.json) so the workflow passes actionProxyValidation. */
function baseWithCatch(extra: { trySpec?: unknown; returnConfig?: unknown } = {}) {
  return {
    local_id: 'wf', oid: 'wf-1', version: '1.0.0', last_modified_date: DATE, schemaVersion: '4.0',
    environment_specifications: [
      { local_id: 'env', oid: 'env-1', version: '1.0.0', last_modified_date: DATE,
        included_actions: [{ action_oid: 'act-1', action_name: 'DoThing', action_library: 'lib-1' }] },
    ],
    steps: [
      step({ local_id: 'Start', oid: 's1', step_type: 'START' }),
      step({ local_id: 'Action', oid: 's2', step_type: 'ACTION PROXY',
             action_proxy_config: { action_oid: 'act-1', environment_oid: 'env-1' },
             try_specifications: extra.trySpec ?? [{ mode: 'ERROR', catch_id: 'C1' }] }),
      step({ local_id: 'End', oid: 's3', step_type: 'END' }),
      step({ local_id: 'Catch', oid: 'c1', step_type: 'CATCH', catch_id: 'C1' }),
      step({ local_id: 'Ret', oid: 'r1', step_type: 'RETURN',
             return_config: extra.returnConfig ?? { command: 'ABANDON' } }),
    ],
    connections: [
      { from_step_id: 's1', to_step_id: 's2' },
      { from_step_id: 's2', to_step_id: 's3' },
      { from_step_id: 'c1', to_step_id: 'r1' },
    ],
  };
}

describe('validator: catch-network is not orphaned', () => {
  it('accepts a minimal well-formed TRY/CATCH/RETURN workflow', () => {
    const r = validate(baseWithCatch());
    assert.equal(r.valid, true, `expected valid, got ${r.error_code}: ${r.error_message}`);
  });
});

describe('validator: structural TRY rules', () => {
  function withExtraStep(s: Record<string, unknown>, conns: Array<Record<string, string>> = []) {
    const wf = baseWithCatch();
    wf.steps.push(step(s) as never);
    wf.connections.push(...(conns as never[]));
    return wf;
  }

  it('CATCH_WRONG_DEGREE when a CATCH has an incoming connection', () => {
    const wf = baseWithCatch();
    wf.connections.push({ from_step_id: 's1', to_step_id: 'c1' });
    assert.equal(validate(wf).error_code, 'CATCH_WRONG_DEGREE');
  });
  it('RETURN_WRONG_DEGREE when a RETURN has an outgoing connection', () => {
    const wf = baseWithCatch();
    wf.connections.push({ from_step_id: 'r1', to_step_id: 's3' });
    assert.equal(validate(wf).error_code, 'RETURN_WRONG_DEGREE');
  });
  it('TRY_ON_INVALID_STEP when try_specifications is on a USER_INTERACTION', () => {
    const wf = withExtraStep(
      { local_id: 'U', oid: 'u1', step_type: 'USER_INTERACTION', try_specifications: [{ mode: 'ERROR', catch_id: 'C1' }] },
      [{ from_step_id: 's2', to_step_id: 'u1' }, { from_step_id: 'u1', to_step_id: 's3' }],
    );
    // remove the now-redundant s2→s3 edge so u1 is on the main path
    wf.connections = wf.connections.filter(c => !(c.from_step_id === 's2' && c.to_step_id === 's3'));
    assert.equal(validate(wf).error_code, 'TRY_ON_INVALID_STEP');
  });
  it('DUPLICATE_TRY_MODE when one step repeats a mode', () => {
    const r = validate(baseWithCatch({ trySpec: [{ mode: 'ERROR', catch_id: 'C1' }, { mode: 'ERROR', catch_id: 'C1' }] }));
    assert.equal(r.error_code, 'DUPLICATE_TRY_MODE');
  });
  it('MISSING_RESTART_MODE when RESTART has no restart_mode', () => {
    assert.equal(validate(baseWithCatch({ returnConfig: { command: 'RESTART' } })).error_code, 'MISSING_RESTART_MODE');
  });
  it('MISSING_GOTO_TARGET when GOTO has no goto_step_oid', () => {
    assert.equal(validate(baseWithCatch({ returnConfig: { command: 'GOTO' } })).error_code, 'MISSING_GOTO_TARGET');
  });
});
