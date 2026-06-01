// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { ActionCommand, ServerState, Visibility } from './types.js';

export type EngineStepState = 'IDLE' | 'STARTING' | 'EXECUTING' | 'PAUSED' | 'COMPLETED' | 'ERRORED';

export function mapServerStateToEngineState(s: ServerState): EngineStepState {
  switch (s) {
    case 'IDLE': return 'STARTING';
    case 'RUNNING': return 'EXECUTING';
    case 'PAUSED': return 'PAUSED';
    case 'HELD': return 'PAUSED';
    case 'COMPLETED': return 'COMPLETED';
    case 'ABORTED':
    case 'STOPPED':
    case 'ERRORED':
      return 'ERRORED';
  }
}

export function mapServerStateToFailureMode(s: ServerState): 'error' | 'abort' | null {
  switch (s) {
    case 'ABORTED':
    case 'STOPPED':
      return 'abort';
    case 'ERRORED':
      return 'error';
    default:
      return null;
  }
}

const CARD_LABELS: Record<ServerState, string> = {
  IDLE: 'Starting',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  HELD: 'Held',
  COMPLETED: 'Completed',
  ABORTED: 'Aborted',
  STOPPED: 'Stopped',
  ERRORED: 'Errored',
};

export function cardLabelFor(s: ServerState): string {
  return CARD_LABELS[s];
}

const PER_STATE_COMMANDS: Record<ServerState, ReadonlyArray<ActionCommand>> = {
  IDLE: ['ABORT'],
  RUNNING: ['PAUSE', 'HOLD', 'ABORT', 'STOP'],
  PAUSED: ['RESUME', 'ABORT', 'STOP'],
  HELD: ['STOP', 'ABORT'],
  COMPLETED: ['CLEAR'],
  ABORTED: ['CLEAR'],
  STOPPED: ['CLEAR'],
  ERRORED: ['CLEAR', 'ABORT'],
};

export function commandsForState(
  state: ServerState,
  supported: ActionCommand[],
  visibility: Visibility,
): ActionCommand[] {
  if (visibility === 'opaque') {
    return supported.includes('ABORT') ? ['ABORT'] : [];
  }
  const supportedSet = new Set(supported);
  return PER_STATE_COMMANDS[state].filter(c => supportedSet.has(c));
}
