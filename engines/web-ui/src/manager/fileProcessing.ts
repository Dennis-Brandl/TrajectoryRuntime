// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
/**
 * File-to-workflow extraction utility.
 *
 * Handles .WFmasterX (ZIP), .json, and .WFmaster files.
 * Validates extracted specs before returning.
 */
import JSZip from 'jszip';
import type { MasterWorkflowSpecification, MasterEnvironmentLibrary } from '@engine/types.js';
import { validateWorkflow } from './validation';

export interface ProcessedWorkflow {
  workflow: MasterWorkflowSpecification;
  mediaMap: Record<string, string>;
  environments: MasterEnvironmentLibrary[];
}

export interface ProcessingError {
  error: string;
  details?: string;
}

export type ProcessResult = ProcessedWorkflow | ProcessingError;

export function isProcessingError(r: ProcessResult): r is ProcessingError {
  return 'error' in r;
}

export async function processWorkflowFile(file: File): Promise<ProcessResult> {
  try {
    if (file.name.endsWith('.WFmasterX')) {
      return await processZipFile(file);
    } else if (file.name.endsWith('.json') || file.name.endsWith('.WFmaster')) {
      return await processJsonFile(file);
    } else {
      return { error: `Unsupported file type: ${file.name}` };
    }
  } catch (err) {
    return { error: `Error processing file: ${err}` };
  }
}

async function processZipFile(file: File): Promise<ProcessResult> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Find the .WFmaster file inside the archive
  const wfMasterFile = Object.keys(zip.files).find(name => name.endsWith('.WFmaster'));
  if (!wfMasterFile) {
    return { error: 'No .WFmaster file found inside the .WFmasterX archive' };
  }

  const text = await zip.files[wfMasterFile].async('string');
  let workflow: MasterWorkflowSpecification;
  try {
    workflow = JSON.parse(text) as MasterWorkflowSpecification;
  } catch {
    return { error: 'Failed to parse .WFmaster JSON inside archive' };
  }

  // Extract environment libraries from .WFenvir files
  const envirEntries = Object.entries(zip.files).filter(
    ([name]) => name.endsWith('.WFenvir'),
  );
  const environments: MasterEnvironmentLibrary[] = [];
  for (const [, entry] of envirEntries) {
    const envirText = await entry.async('string');
    environments.push(JSON.parse(envirText) as MasterEnvironmentLibrary);
  }

  // Extract media files into blob URLs (parallel for speed)
  const mediaEntries = Object.entries(zip.files).filter(
    ([name, entry]) => !name.endsWith('.WFmaster') && !name.endsWith('.WFenvir') && !name.endsWith('.json') && !entry.dir,
  );
  const blobs = await Promise.all(
    mediaEntries.map(async ([name, entry]) => {
      const blob = await entry.async('blob');
      return [name, URL.createObjectURL(blob)] as const;
    }),
  );
  const mediaMap: Record<string, string> = {};
  for (const [name, blobUrl] of blobs) {
    mediaMap[name] = blobUrl;
    // Also key by basename (strip directory prefix like "images/")
    const basename = name.includes('/') ? name.split('/').pop()! : name;
    if (basename !== name) {
      mediaMap[basename] = blobUrl;
    }
    // Also key by bare filename (strip oid prefix from "{oid}-{filename}" basenames).
    // This allows tablet/desktop layouts to resolve images when their device-specific
    // imageOid file is missing from the archive but another variant exists.
    const bare = basename.replace(/^\d+-/, '');
    if (bare !== basename && !mediaMap[bare]) {
      mediaMap[bare] = blobUrl;
    }
  }

  // Validate the extracted workflow
  const validation = validateWorkflow(workflow as unknown as Record<string, unknown>);
  if (!validation.valid) {
    // Revoke any blob URLs we created since we're rejecting
    for (const url of Object.values(mediaMap)) {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }
    return {
      error: 'Workflow validation failed',
      details: validation.error_message ?? validation.error_code,
    };
  }

  return { workflow, mediaMap, environments };
}

async function processJsonFile(file: File): Promise<ProcessResult> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: `JSON parse error in ${file.name}` };
  }

  // Support both raw workflows and test fixtures (which wrap workflow in .workflow)
  const record = parsed as Record<string, unknown>;
  const workflow = (record.workflow ?? record) as MasterWorkflowSpecification;

  // Validate
  const validation = validateWorkflow(workflow as unknown as Record<string, unknown>);
  if (!validation.valid) {
    return {
      error: 'Workflow validation failed',
      details: validation.error_message ?? validation.error_code,
    };
  }

  return { workflow, mediaMap: {}, environments: [] };
}
