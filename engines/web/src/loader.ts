// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { readFileSync } from 'node:fs';
import AdmZip from 'adm-zip';
import type { MasterEnvironmentLibrary } from './types.js';

export interface LoadResult {
  workflow: Record<string, unknown>;
  environments: MasterEnvironmentLibrary[];
}

/**
 * Load a workflow from a .WFmaster (JSON) or .WFmasterX (ZIP) file.
 * Returns only the workflow document.
 */
export function loadWorkflow(filePath: string): Record<string, unknown> {
  return loadWorkflowPackage(filePath).workflow;
}

/**
 * Load a workflow package from a .WFmaster (JSON) or .WFmasterX (ZIP) file.
 * Returns both the workflow document and any environment libraries found in the package.
 */
export function loadWorkflowPackage(filePath: string): LoadResult {
  if (filePath.endsWith('.WFmasterX')) {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    const entry = entries.find(e => e.entryName.endsWith('.WFmaster'));
    if (!entry) {
      throw new Error('No .WFmaster file found inside the .WFmasterX archive');
    }
    const workflow = JSON.parse(entry.getData().toString('utf-8'));
    const environments: MasterEnvironmentLibrary[] = [];
    for (const e of entries) {
      if (e.entryName.startsWith('environments/') && e.entryName.endsWith('.WFenvir')) {
        environments.push(JSON.parse(e.getData().toString('utf-8')));
      }
    }
    return { workflow, environments };
  }

  return {
    workflow: JSON.parse(readFileSync(filePath, 'utf-8')),
    environments: [],
  };
}
