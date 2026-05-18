// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { MasterEnvironmentLibrary, MasterEnvironmentSpecification } from './types.js';
import type { ResourceManager } from './resource-manager.js';

export function loadEnvironmentLibrary(
  lib: MasterEnvironmentLibrary,
  resourceManager: ResourceManager,
): Record<string, string> {
  const properties: Record<string, string> = {};

  function processSpec(spec: MasterEnvironmentSpecification): void {
    if (spec.resource_property_specifications) {
      for (const res of spec.resource_property_specifications) {
        const resourceKey = `${spec.oid}:${res.name}`;
        if (!resourceManager.hasResource(resourceKey)) {
          resourceManager.registerResource(resourceKey, res, spec.oid, 'environment');
        }
      }
    }
    if (spec.value_property_specifications) {
      for (const prop of spec.value_property_specifications) {
        for (const entry of prop.entries) {
          const key = `${prop.name}.${entry.name}`;
          if (!(key in properties)) {
            properties[key] = entry.value;
          }
        }
      }
    }
  }

  function processLibrary(library: MasterEnvironmentLibrary): void {
    for (const spec of library.environment_specifications) {
      processSpec(spec);
    }
    if (library.child_libraries) {
      for (const child of library.child_libraries) {
        processLibrary(child);
      }
    }
  }

  processLibrary(lib);
  return properties;
}
