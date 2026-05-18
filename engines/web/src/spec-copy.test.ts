// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { deepCopySpec, _resetOidCounter } from './spec-copy.js';
import type { MasterWorkflowSpecification } from './types.js';

/** Minimal spec for testing. */
function makeSpec(): MasterWorkflowSpecification {
  return {
    local_id: 'parent-wf',
    oid: 'parent-oid',
    version: '1.0.0',
    last_modified_date: '2026-03-26',
    steps: [
      { local_id: 'start', oid: 'step-a', version: '1.0.0', last_modified_date: '2026-03-26', step_type: 'START' },
      { local_id: 'interact', oid: 'step-b', version: '1.0.0', last_modified_date: '2026-03-26', step_type: 'USER_INTERACTION',
        form_layout_config: [
          { deviceType: 'phone', canvasWidth: 400, canvasHeight: 800, elements: [
            { type: 'image', x: 0, y: 0, width: 100, height: 100, imageOid: 'img-001', src: 'photo.png' },
            { type: 'textInput', x: 0, y: 120, width: 200, height: 40, fieldName: 'field1', label: 'Name' },
          ] },
        ],
      },
      { local_id: 'end', oid: 'step-c', version: '1.0.0', last_modified_date: '2026-03-26', step_type: 'END' },
    ],
    connections: [
      { from_step_id: 'step-a', to_step_id: 'step-b' },
      { from_step_id: 'step-b', to_step_id: 'step-c', connection_id: 'conn-1', source_handle_id: 'yes' },
    ],
  };
}

/** Spec with child workflows. */
function makeSpecWithChildren(): MasterWorkflowSpecification {
  return {
    ...makeSpec(),
    child_workflows: [
      {
        local_id: 'child-wf',
        oid: 'child-oid',
        version: '1.0.0',
        last_modified_date: '2026-03-26',
        steps: [
          { local_id: 'c-start', oid: 'child-step-1', version: '1.0.0', last_modified_date: '2026-03-26', step_type: 'START' },
          { local_id: 'c-end', oid: 'child-step-2', version: '1.0.0', last_modified_date: '2026-03-26', step_type: 'END' },
        ],
        connections: [
          { from_step_id: 'child-step-1', to_step_id: 'child-step-2' },
        ],
      },
    ],
  };
}

describe('deepCopySpec', () => {
  beforeEach(() => _resetOidCounter());

  it('generates new step OIDs', () => {
    const original = makeSpec();
    const copy = deepCopySpec(original);

    // New OIDs should be rt_ prefixed
    for (const step of copy.steps) {
      assert.ok(step.oid.startsWith('rt_'), `Expected rt_ prefix, got: ${step.oid}`);
    }

    // Original OIDs unchanged
    assert.equal(original.steps[0].oid, 'step-a');
    assert.equal(original.steps[1].oid, 'step-b');
    assert.equal(original.steps[2].oid, 'step-c');
  });

  it('remaps connection references to new OIDs', () => {
    const original = makeSpec();
    const copy = deepCopySpec(original);

    const oidSet = new Set(copy.steps.map(s => s.oid));

    for (const conn of copy.connections) {
      assert.ok(oidSet.has(conn.from_step_id), `from_step_id ${conn.from_step_id} not in step OIDs`);
      assert.ok(oidSet.has(conn.to_step_id), `to_step_id ${conn.to_step_id} not in step OIDs`);
    }
  });

  it('preserves connection_id and source_handle_id', () => {
    const copy = deepCopySpec(makeSpec());
    const conn = copy.connections[1];
    assert.equal(conn.connection_id, 'conn-1');
    assert.equal(conn.source_handle_id, 'yes');
  });

  it('preserves local_id on steps', () => {
    const copy = deepCopySpec(makeSpec());
    assert.equal(copy.steps[0].local_id, 'start');
    assert.equal(copy.steps[1].local_id, 'interact');
    assert.equal(copy.steps[2].local_id, 'end');
  });

  it('preserves imageOid in form layout config', () => {
    const copy = deepCopySpec(makeSpec());
    const layout = (copy.steps[1].form_layout_config as any[])[0];
    const imageEl = layout.elements[0];
    assert.equal(imageEl.imageOid, 'img-001');
  });

  it('deep-clones form layout config (no shared references)', () => {
    const original = makeSpec();
    const copy = deepCopySpec(original);
    const origLayout = (original.steps[1].form_layout_config as any[])[0];
    const copyLayout = (copy.steps[1].form_layout_config as any[])[0];
    copyLayout.elements[0].imageOid = 'CHANGED';
    assert.equal(origLayout.elements[0].imageOid, 'img-001');
  });

  it('recurses into child workflows with new OIDs', () => {
    const copy = deepCopySpec(makeSpecWithChildren());
    const child = copy.child_workflows![0];

    // Child steps have new OIDs
    for (const step of child.steps) {
      assert.ok(step.oid.startsWith('rt_'), `Child step OID ${step.oid} should be regenerated`);
    }

    // Child connections remapped
    const childOidSet = new Set(child.steps.map(s => s.oid));
    for (const conn of child.connections) {
      assert.ok(childOidSet.has(conn.from_step_id), `Child from_step_id ${conn.from_step_id} not in child OIDs`);
      assert.ok(childOidSet.has(conn.to_step_id), `Child to_step_id ${conn.to_step_id} not in child OIDs`);
    }
  });

  it('produces no OID collisions across multiple copies', () => {
    const spec = makeSpecWithChildren();
    const copy1 = deepCopySpec(spec);
    const copy2 = deepCopySpec(spec);

    const allOids1 = [...copy1.steps.map(s => s.oid), ...copy1.child_workflows![0].steps.map(s => s.oid)];
    const allOids2 = [...copy2.steps.map(s => s.oid), ...copy2.child_workflows![0].steps.map(s => s.oid)];

    // No overlap between copies
    const set1 = new Set(allOids1);
    for (const oid of allOids2) {
      assert.ok(!set1.has(oid), `OID collision: ${oid}`);
    }
  });

  it('does not modify the original spec', () => {
    const original = makeSpec();
    const origJson = JSON.stringify(original);
    deepCopySpec(original);
    assert.equal(JSON.stringify(original), origJson);
  });

  it('preserves spec-level local_id and version but regenerates oid', () => {
    const copy = deepCopySpec(makeSpec());
    assert.equal(copy.local_id, 'parent-wf');
    assert.ok(copy.oid.startsWith('rt_'), `Spec OID should be regenerated, got: ${copy.oid}`);
    assert.notEqual(copy.oid, 'parent-oid');
    assert.equal(copy.version, '1.0.0');
  });

  it('regenerates spec OID for child workflows', () => {
    const copy = deepCopySpec(makeSpecWithChildren());
    const child = copy.child_workflows![0];
    assert.ok(child.oid.startsWith('rt_'), `Child spec OID should be regenerated`);
    assert.notEqual(child.oid, 'child-oid');
    assert.equal(child.local_id, 'child-wf');
  });

  it('remaps resource_source_oid for workflow-scoped resources', () => {
    const spec: MasterWorkflowSpecification = {
      ...makeSpec(),
      child_workflows: [{
        local_id: 'child-wf', oid: 'child-oid', version: '1.0.0', last_modified_date: '2026-03-26',
        steps: [
          { local_id: 'c-start', oid: 'cs1', version: '1.0.0', last_modified_date: '2026-03-26', step_type: 'START' },
          { local_id: 'c-acquire', oid: 'cs2', version: '1.0.0', last_modified_date: '2026-03-26', step_type: 'USER_INTERACTION',
            resource_command_specifications: [
              { resource_name: 'Lock', command_type: 'Acquire', resource_source_oid: 'parent-oid', resource_source_type: 'workflow' },
              { resource_name: 'Counter', command_type: 'Acquire Pool Amount', resource_source_oid: 'child-oid', resource_source_type: 'workflow', amount: 1 },
              { resource_name: 'EnvLock', command_type: 'Acquire', resource_source_oid: 'env-123', resource_source_type: 'environment' },
            ],
          },
          { local_id: 'c-end', oid: 'cs3', version: '1.0.0', last_modified_date: '2026-03-26', step_type: 'END' },
        ],
        connections: [
          { from_step_id: 'cs1', to_step_id: 'cs2' },
          { from_step_id: 'cs2', to_step_id: 'cs3' },
        ],
      }],
    };

    const copy = deepCopySpec(spec);
    const childStep = copy.child_workflows![0].steps[1];
    const cmds = childStep.resource_command_specifications!;

    // Workflow-scoped: remapped to new spec OIDs
    assert.equal(cmds[0].resource_source_oid, copy.oid); // parent resource → new parent oid
    assert.equal(cmds[1].resource_source_oid, copy.child_workflows![0].oid); // child resource → new child oid
    // Environment-scoped: preserved
    assert.equal(cmds[2].resource_source_oid, 'env-123');
  });

  it('spec OIDs are unique across multiple copies', () => {
    const spec = makeSpecWithChildren();
    const copy1 = deepCopySpec(spec);
    const copy2 = deepCopySpec(spec);
    assert.notEqual(copy1.oid, copy2.oid);
    assert.notEqual(copy1.child_workflows![0].oid, copy2.child_workflows![0].oid);
  });
});
