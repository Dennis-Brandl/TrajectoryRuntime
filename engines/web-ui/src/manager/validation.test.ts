// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateWorkflow } from './validation.js';

const DATE = '2026-06-03T00:00:00.000Z';
const s = (o: Record<string, unknown>) => ({ version: '1.0.0', last_modified_date: DATE, ...o });

// A CATCH network is a disconnected island reached at runtime via a TRY's catch_id,
// NOT by an edge from START. The validator must exempt catch-network steps from the
// "reachable from START" orphan check — otherwise the CATCH and its RETURN are wrongly
// reported as ORPHANED_STEP. Regression for the TrajectoryRuntime web-ui validator,
// which had drifted from engines/web/src/validator.ts (missing the exemption).
test('does not flag a catch-network RETURN/CATCH as orphaned (reachable only via TRY)', () => {
  const wf = {
    schemaVersion: '4.0',
    local_id: 'wf',
    oid: 'wf-1',
    version: '1.0.0',
    last_modified_date: DATE,
    steps: [
      s({ local_id: 'Start', oid: 's1', step_type: 'START' }),
      s({ local_id: 'End', oid: 's2', step_type: 'END' }),
      s({ local_id: 'Catch', oid: 'c1', step_type: 'CATCH', catch_id: 'C1' }),
      s({ local_id: 'Ret', oid: 'r1', step_type: 'RETURN', return_config: { command: 'ABANDON' } }),
    ],
    connections: [
      { from_step_id: 's1', to_step_id: 's2' }, // main flow
      { from_step_id: 'c1', to_step_id: 'r1' }, // catch island: CATCH → RETURN
    ],
  };

  const result = validateWorkflow(wf);
  assert.notEqual(
    result.error_code,
    'ORPHANED_STEP',
    `catch-network step wrongly reported orphaned: ${result.error_message}`,
  );
  assert.equal(result.valid, true, `expected valid; got ${result.error_code}: ${result.error_message}`);
});
