// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { ResourceCommandSpecification } from './types.js';

const ACTIVATION_COMMANDS = new Set([
  'Acquire', 'Acquire Pool Amount', 'Send', 'Receive', 'Synchronize',
]);

const SYNC_COMMANDS = new Set(['Send', 'Receive', 'Synchronize']);

export function splitResourceCommands(
  commands: ResourceCommandSpecification[],
): { activation: ResourceCommandSpecification[]; completion: ResourceCommandSpecification[] } {
  const activation: ResourceCommandSpecification[] = [];
  const completion: ResourceCommandSpecification[] = [];
  for (const cmd of commands) {
    if (ACTIVATION_COMMANDS.has(cmd.command_type)) {
      activation.push(cmd);
    } else {
      completion.push(cmd);
    }
  }
  return { activation, completion };
}

export function sortActivationCommands(
  commands: ResourceCommandSpecification[],
): ResourceCommandSpecification[] {
  return [...commands].sort((a, b) => {
    const aIsSync = SYNC_COMMANDS.has(a.command_type) ? 0 : 1;
    const bIsSync = SYNC_COMMANDS.has(b.command_type) ? 0 : 1;
    if (aIsSync !== bIsSync) return aIsSync - bIsSync;
    return a.resource_name.localeCompare(b.resource_name);
  });
}
