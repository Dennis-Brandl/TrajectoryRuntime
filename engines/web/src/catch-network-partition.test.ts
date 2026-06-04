// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { partitionCatchNetworks } from './catch-network-partition.js';

const steps = [
  { oid: 's1', step_type: 'START' },
  { oid: 's2', step_type: 'ACTION PROXY' },
  { oid: 's3', step_type: 'END' },
  { oid: 'c1', step_type: 'CATCH', catch_id: 'C1' },
  { oid: 'c2', step_type: 'USER_INTERACTION' },
  { oid: 'c3', step_type: 'RETURN' },
];
const connections = [
  { from_step_id: 's1', to_step_id: 's2' },
  { from_step_id: 's2', to_step_id: 's3' },
  { from_step_id: 'c1', to_step_id: 'c2' },
  { from_step_id: 'c2', to_step_id: 'c3' },
];

describe('partitionCatchNetworks', () => {
  it('separates main-flow from catch-network steps', () => {
    const p = partitionCatchNetworks(steps, connections);
    assert.deepEqual([...p.mainFlowStepOids].sort(), ['s1', 's2', 's3']);
    assert.deepEqual([...p.catchNetworkStepOids].sort(), ['c1', 'c2', 'c3']);
  });

  it('indexes networks by catch_id', () => {
    const p = partitionCatchNetworks(steps, connections);
    assert.deepEqual([...(p.networksByCatchId.get('C1') ?? [])].sort(), ['c1', 'c2', 'c3']);
  });

  it('excludes a CATCH whose downstream has no RETURN', () => {
    const p = partitionCatchNetworks(
      [{ oid: 's1', step_type: 'START' }, { oid: 's2', step_type: 'END' },
       { oid: 'c1', step_type: 'CATCH', catch_id: 'C1' }, { oid: 'c2', step_type: 'USER_INTERACTION' }],
      [{ from_step_id: 's1', to_step_id: 's2' }, { from_step_id: 'c1', to_step_id: 'c2' }],
    );
    assert.equal(p.catchNetworkStepOids.size, 0);
    assert.equal(p.mainFlowStepOids.size, 4);
  });
});
