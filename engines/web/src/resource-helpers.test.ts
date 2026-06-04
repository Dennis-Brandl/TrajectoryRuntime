// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitResourceCommands, sortActivationCommands } from './resource-helpers.js';
import type { ResourceCommandSpecification } from './types.js';

describe('splitResourceCommands', () => {
  it('separates activation and completion commands', () => {
    const commands: ResourceCommandSpecification[] = [
      { command_type: 'Acquire', resource_name: 'Lock' },
      { command_type: 'Release', resource_name: 'Lock' },
      { command_type: 'Send', resource_name: 'Chan' },
      { command_type: 'Release Pool Amount', resource_name: 'Pool', amount: 5 },
    ];
    const { activation, completion } = splitResourceCommands(commands);
    assert.equal(activation.length, 2); // Acquire, Send
    assert.equal(completion.length, 2); // Release, Release Pool Amount
  });
});

describe('sortActivationCommands', () => {
  it('puts sync command first, then alphabetical by resource_name', () => {
    const commands: ResourceCommandSpecification[] = [
      { command_type: 'Acquire', resource_name: 'Zebra' },
      { command_type: 'Send', resource_name: 'Chan' },
      { command_type: 'Acquire', resource_name: 'Alpha' },
    ];
    const sorted = sortActivationCommands(commands);
    assert.equal(sorted[0].command_type, 'Send');     // sync first
    assert.equal(sorted[1].resource_name, 'Alpha');    // alphabetical
    assert.equal(sorted[2].resource_name, 'Zebra');
  });

  it('sorts completion commands alphabetically', () => {
    const commands: ResourceCommandSpecification[] = [
      { command_type: 'Release', resource_name: 'Zebra' },
      { command_type: 'Release', resource_name: 'Alpha' },
    ];
    const sorted = sortActivationCommands(commands);
    assert.equal(sorted[0].resource_name, 'Alpha');
    assert.equal(sorted[1].resource_name, 'Zebra');
  });
});
