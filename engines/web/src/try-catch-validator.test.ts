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

describe('validator: cross-reference TRY rules', () => {
  it('DUPLICATE_CATCH_ID', () => {
    const wf = baseWithCatch();
    wf.steps.push(step({ local_id: 'C2', oid: 'c2', step_type: 'CATCH', catch_id: 'C1' }) as never,
                  step({ local_id: 'R2', oid: 'r2', step_type: 'RETURN', return_config: { command: 'ABANDON' } }) as never);
    wf.connections.push({ from_step_id: 'c2', to_step_id: 'r2' });
    assert.equal(validate(wf).error_code, 'DUPLICATE_CATCH_ID');
  });
  it('UNMATCHED_TRY', () => {
    assert.equal(validate(baseWithCatch({ trySpec: [{ mode: 'ERROR', catch_id: 'Ghost' }] })).error_code, 'UNMATCHED_TRY');
  });
  it('GOTO_TARGET_NOT_FOUND', () => {
    assert.equal(validate(baseWithCatch({ returnConfig: { command: 'GOTO', goto_step_oid: 'ghost' } })).error_code, 'GOTO_TARGET_NOT_FOUND');
  });
  it('GOTO_TARGET_IN_CATCH', () => {
    // GOTO points at the CATCH's own step c1 (inside a catch network)
    assert.equal(validate(baseWithCatch({ returnConfig: { command: 'GOTO', goto_step_oid: 'c1' } })).error_code, 'GOTO_TARGET_IN_CATCH');
  });
});

describe('validator: topology TRY rules', () => {
  it('CROSS_NETWORK_EDGE when an edge crosses the boundary', () => {
    // Give the catch network an interior node (c1 → mid1 → r1) so the cross edge
    // targets a non-CATCH/non-RETURN node and does NOT trip a degree rule first
    // (spec §6.5: structural-degree checks fire before topology).
    const wf = baseWithCatch();
    wf.steps.push(step({ local_id: 'Mid', oid: 'mid1', step_type: 'USER_INTERACTION' }) as never);
    wf.connections = wf.connections.filter(
      c => !(c.from_step_id === 'c1' && c.to_step_id === 'r1'),
    );
    wf.connections.push(
      { from_step_id: 'c1', to_step_id: 'mid1' },
      { from_step_id: 'mid1', to_step_id: 'r1' },
      { from_step_id: 's2', to_step_id: 'mid1' }, // main flow → catch-network interior
    );
    assert.equal(validate(wf).error_code, 'CROSS_NETWORK_EDGE');
  });

  it('rejects a CATCH that cannot reach a RETURN (runtime: ORPHANED_STEP; CATCH_WITHOUT_RETURN is editor-time)', () => {
    // Replace the CATCH's RETURN with a non-RETURN dead end. The partition is
    // RETURN-gated (spec §6.5), so this catch island is NOT orphan-exempt and is
    // rejected as ORPHANED_STEP at runtime. The dedicated CATCH_WITHOUT_RETURN
    // code (spec §6.3) is surfaced by the editor (§6.6), not the runtime.
    const wf = baseWithCatch();
    wf.steps = wf.steps.map(s =>
      (s as Record<string, unknown>).oid === 'r1'
        ? step({ local_id: 'U', oid: 'r1', step_type: 'USER_INTERACTION' }) as never
        : s,
    );
    const r = validate(wf);
    assert.equal(r.valid, false);
    assert.equal(r.error_code, 'ORPHANED_STEP');
  });

  it('accepts an ORPHANED_CATCH (catch_id referenced by no TRY) — valid:true', () => {
    const wf = baseWithCatch({ trySpec: [] }); // action has no TRY → C1 is orphaned but valid
    const r = validate(wf);
    assert.equal(r.valid, true, `expected valid, got ${r.error_code}`);
  });
});

describe('validator: invalid TRY/RETURN enum values (tryCatchValidation precedes AJV)', () => {
  it('INVALID_TRY_MODE when a try mode is not ERROR/ABORT/TIMEOUT', () => {
    assert.equal(validate(baseWithCatch({ trySpec: [{ mode: 'BOGUS', catch_id: 'C1' }] })).error_code, 'INVALID_TRY_MODE');
  });
  it('INVALID_RETURN_COMMAND when return_config.command is unknown', () => {
    assert.equal(validate(baseWithCatch({ returnConfig: { command: 'NOPE' } })).error_code, 'INVALID_RETURN_COMMAND');
  });
  it('INVALID_RESTART_MODE when restart_mode is not CLEAN/KEEP', () => {
    assert.equal(validate(baseWithCatch({ returnConfig: { command: 'RESTART', restart_mode: 'BOGUS' } })).error_code, 'INVALID_RESTART_MODE');
  });
});
