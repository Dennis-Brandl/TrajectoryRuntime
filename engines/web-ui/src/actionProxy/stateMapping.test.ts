// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mapServerStateToEngineState, cardLabelFor, commandsForState } from './stateMapping.js';

test('server state IDLE maps to engine STARTING', () => {
  assert.equal(mapServerStateToEngineState('IDLE'), 'STARTING');
});

test('server state RUNNING maps to engine EXECUTING', () => {
  assert.equal(mapServerStateToEngineState('RUNNING'), 'EXECUTING');
});

test('server state HELD maps to engine PAUSED', () => {
  assert.equal(mapServerStateToEngineState('HELD'), 'PAUSED');
});

test('server state PAUSED maps to engine PAUSED', () => {
  assert.equal(mapServerStateToEngineState('PAUSED'), 'PAUSED');
});

test('server state COMPLETED maps to engine COMPLETED', () => {
  assert.equal(mapServerStateToEngineState('COMPLETED'), 'COMPLETED');
});

test('server states ABORTED/STOPPED/ERRORED map to engine ERRORED', () => {
  assert.equal(mapServerStateToEngineState('ABORTED'), 'ERRORED');
  assert.equal(mapServerStateToEngineState('STOPPED'), 'ERRORED');
  assert.equal(mapServerStateToEngineState('ERRORED'), 'ERRORED');
});

test('cardLabelFor returns the raw server state title-cased', () => {
  assert.equal(cardLabelFor('IDLE'), 'Starting');
  assert.equal(cardLabelFor('RUNNING'), 'Running');
  assert.equal(cardLabelFor('PAUSED'), 'Paused');
  assert.equal(cardLabelFor('HELD'), 'Held');
  assert.equal(cardLabelFor('COMPLETED'), 'Completed');
  assert.equal(cardLabelFor('ABORTED'), 'Aborted');
  assert.equal(cardLabelFor('STOPPED'), 'Stopped');
});

test('commandsForState: HELD shows only STOP and ABORT', () => {
  const cmds = commandsForState('HELD', ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], 'observable');
  assert.deepEqual(cmds.sort(), ['ABORT','STOP']);
});

test('commandsForState: RUNNING shows PAUSE/HOLD/ABORT/STOP', () => {
  const cmds = commandsForState('RUNNING', ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], 'observable');
  assert.deepEqual(cmds.sort(), ['ABORT','HOLD','PAUSE','STOP']);
});

test('commandsForState: PAUSED shows RESUME/ABORT/STOP', () => {
  const cmds = commandsForState('PAUSED', ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], 'observable');
  assert.deepEqual(cmds.sort(), ['ABORT','RESUME','STOP']);
});

test('commandsForState: opaque visibility only shows ABORT', () => {
  const cmds = commandsForState('RUNNING', ['ABORT'], 'opaque');
  assert.deepEqual(cmds, ['ABORT']);
});

test('commandsForState: hides commands not in supported_commands', () => {
  const cmds = commandsForState('RUNNING', ['ABORT','PAUSE'], 'observable');
  assert.deepEqual(cmds.sort(), ['ABORT','PAUSE']);
});

test('commandsForState: COMPLETED shows CLEAR only', () => {
  const cmds = commandsForState('COMPLETED', ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], 'observable');
  assert.deepEqual(cmds, ['CLEAR']);
});

test('commandsForState: ERRORED shows CLEAR and ABORT', () => {
  const cmds = commandsForState('ERRORED', ['PAUSE','RESUME','HOLD','UNHOLD','ABORT','STOP','CLEAR'], 'observable');
  assert.deepEqual(cmds.sort(), ['ABORT','CLEAR']);
});
