// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnvironmentLibrary } from './environment-loader.js';
import { InMemoryResourceManager } from './resource-manager.js';

describe('loadEnvironmentLibrary', () => {
  it('registers resources from environment specifications', () => {
    const mgr = new InMemoryResourceManager();
    const lib = {
      local_id: 'env1', oid: 'env1', version: '1.0.0', last_modified_date: '2026-03-11',
      environment_specifications: [{
        local_id: 'spec1', oid: 'spec1', version: '1.0.0', last_modified_date: '2026-03-11',
        included_actions: [],
        resource_property_specifications: [
          { name: 'SharedLock', resource_type: 'binary exclusive use' as const },
        ],
      }],
    };
    const props = loadEnvironmentLibrary(lib, mgr);
    assert.ok(mgr.hasResource('spec1:SharedLock'));
    assert.deepEqual(props, {});
  });

  it('loads value properties from environment', () => {
    const mgr = new InMemoryResourceManager();
    const lib = {
      local_id: 'env1', oid: 'env1', version: '1.0.0', last_modified_date: '2026-03-11',
      environment_specifications: [{
        local_id: 'spec1', oid: 'spec1', version: '1.0.0', last_modified_date: '2026-03-11',
        included_actions: [],
        value_property_specifications: [
          { name: 'Config', entries: [{ name: 'Mode', value: 'production' }] },
        ],
      }],
    };
    const props = loadEnvironmentLibrary(lib, mgr);
    assert.equal(props['Config.Mode'], 'production');
  });

  it('walks child_libraries recursively', () => {
    const mgr = new InMemoryResourceManager();
    const lib = {
      local_id: 'root', oid: 'root', version: '1.0.0', last_modified_date: '2026-03-11',
      environment_specifications: [],
      child_libraries: [{
        local_id: 'child', oid: 'child', version: '1.0.0', last_modified_date: '2026-03-11',
        environment_specifications: [{
          local_id: 'spec1', oid: 'spec1', version: '1.0.0', last_modified_date: '2026-03-11',
          included_actions: [],
          resource_property_specifications: [
            { name: 'ChildLock', resource_type: 'binary exclusive use' as const },
          ],
        }],
      }],
    };
    loadEnvironmentLibrary(lib, mgr);
    assert.ok(mgr.hasResource('spec1:ChildLock'));
  });

  it('idempotent: does not re-register existing resources', () => {
    const mgr = new InMemoryResourceManager();
    mgr.registerResource('spec1:Lock', { name: 'Lock', resource_type: 'binary exclusive use' }, 'env');
    mgr.acquire('spec1:Lock', 's1');
    const lib = {
      local_id: 'env1', oid: 'env1', version: '1.0.0', last_modified_date: '2026-03-11',
      environment_specifications: [{
        local_id: 'spec1', oid: 'spec1', version: '1.0.0', last_modified_date: '2026-03-11',
        included_actions: [],
        resource_property_specifications: [
          { name: 'Lock', resource_type: 'binary exclusive use' as const },
        ],
      }],
    };
    loadEnvironmentLibrary(lib, mgr);
    const result = mgr.acquire('spec1:Lock', 's2');
    assert.deepEqual(result, { granted: false });
  });
});
