// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './validator.js';
import { WorkflowEngine } from './engine.js';
import { InMemoryResourceManager } from './resource-manager.js';
import type { TestFixture, MasterWorkflowSpecification, TraceEntry, ResourcePropertySpecification } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function findConformanceDir(): string {
  const candidates = [
    resolve(__dirname, '../../../../spec/conformance'),
    resolve(__dirname, '../../../../../spec/conformance'),
    resolve(__dirname, '../../../spec/conformance'),
    resolve(__dirname, '../../spec/conformance'),
  ];
  for (const p of candidates) {
    try {
      readdirSync(p);
      return p;
    } catch {
      // try next
    }
  }
  throw new Error(`Cannot find conformance directory, tried: ${candidates.join(', ')}`);
}

function discoverFixtures(baseDir: string): TestFixture[] {
  const fixtures: TestFixture[] = [];
  const subdirs = ['validation', 'execution', 'parameters', 'resources'];

  for (const subdir of subdirs) {
    const dir = join(baseDir, subdir);
    let files: string[];
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    } catch {
      continue;
    }
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf-8');
      fixtures.push(JSON.parse(content) as TestFixture);
    }
  }

  return fixtures;
}

function compareTrace(expected: TraceEntry[], actual: TraceEntry[]): string | null {
  if (expected.length !== actual.length) {
    return `Trace length mismatch: expected ${expected.length}, got ${actual.length}\n` +
      `  Expected: ${JSON.stringify(expected.map(e => `${e.step_oid}:${e.state}`))}\n` +
      `  Actual:   ${JSON.stringify(actual.map(e => `${e.step_oid}:${e.state}`))}`;
  }

  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const act = actual[i];

    if (exp.step_oid !== act.step_oid) {
      return `Trace[${i}] step_oid: expected "${exp.step_oid}", got "${act.step_oid}"`;
    }
    if (exp.state !== act.state) {
      return `Trace[${i}] state: expected "${exp.state}", got "${act.state}" (step ${exp.step_oid})`;
    }
    if (exp.order !== undefined && exp.order !== act.order) {
      return `Trace[${i}] order: expected ${exp.order}, got ${act.order} (step ${exp.step_oid})`;
    }
    if (exp.after_action !== undefined && exp.after_action !== act.after_action) {
      return `Trace[${i}] after_action: expected ${exp.after_action}, got ${act.after_action} (step ${exp.step_oid})`;
    }
  }

  return null;
}

function compareProperties(expected: Record<string, string>, actual: Record<string, string>): string | null {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];
    if (actualValue !== expectedValue) {
      return `Property "${key}": expected "${expectedValue}", got "${actualValue ?? '(undefined)'}"`;
    }
  }
  return null;
}

function runFixture(fixture: TestFixture): { pass: boolean; error?: string } {
  try {
    if (fixture.category === 'validation') {
      return runValidationFixture(fixture);
    } else {
      return runExecutionFixture(fixture);
    }
  } catch (err) {
    return { pass: false, error: `Exception: ${(err as Error).message}` };
  }
}

function runValidationFixture(fixture: TestFixture): { pass: boolean; error?: string } {
  const result = validate(fixture.workflow);

  if (fixture.expected.valid !== result.valid) {
    return {
      pass: false,
      error: `Expected valid=${fixture.expected.valid}, got valid=${result.valid}` +
        (result.error_code ? ` (error: ${result.error_code})` : ''),
    };
  }

  if (!fixture.expected.valid && fixture.expected.error_code) {
    if (result.error_code !== fixture.expected.error_code) {
      return {
        pass: false,
        error: `Expected error_code="${fixture.expected.error_code}", got "${result.error_code}"`,
      };
    }
  }

  return { pass: true };
}

function runExecutionFixture(fixture: TestFixture): { pass: boolean; error?: string } {
  // First validate
  const valResult = validate(fixture.workflow);
  if (!valResult.valid) {
    return { pass: false, error: `Validation failed: ${valResult.error_code}` };
  }

  // Set up ResourceManager if fixture has resources
  let setup: Record<string, unknown> | undefined = fixture.setup;
  if (fixture.setup?.resources) {
    const mgr = new InMemoryResourceManager();
    for (const spec of fixture.setup.resources as ResourcePropertySpecification[]) {
      mgr.registerResource(`test:${spec.name}`, spec, 'test');
    }
    setup = { ...fixture.setup, resourceManager: mgr };
  }

  // Ensure ResourceManager exists if workflow has resource commands or resource specs
  const workflow = fixture.workflow as Record<string, unknown>;
  const hasResourceSpecs = !!((workflow['resource_property_specifications'] as unknown[]) ?? []).length;
  const hasResourceCmds = ((workflow['steps'] as Record<string, unknown>[]) ?? []).some(
    (s: Record<string, unknown>) => ((s['resource_command_specifications'] as unknown[]) ?? []).length > 0
  );

  if ((hasResourceSpecs || hasResourceCmds) && !setup?.resourceManager) {
    const mgr = new InMemoryResourceManager();
    setup = { ...(setup ?? {}), resourceManager: mgr };
  }

  const workflowSpec = fixture.workflow as unknown as MasterWorkflowSpecification;
  const engine = new WorkflowEngine(workflowSpec, setup);
  engine.start();

  // Submit user actions
  if (fixture.user_actions) {
    for (let i = 0; i < fixture.user_actions.length; i++) {
      engine.submitAction(fixture.user_actions[i], i);
    }
  }

  // Compare execution trace
  if (fixture.expected.execution_trace) {
    const traceErr = compareTrace(fixture.expected.execution_trace, engine.getTrace());
    if (traceErr) return { pass: false, error: `Trace mismatch: ${traceErr}` };
  }

  // Compare workflow state
  if (fixture.expected.workflow_state) {
    const actualState = engine.getWorkflowState();
    if (actualState !== fixture.expected.workflow_state) {
      return { pass: false, error: `Workflow state: expected "${fixture.expected.workflow_state}", got "${actualState}"` };
    }
  }

  // Compare final properties
  if (fixture.expected.final_properties) {
    const propErr = compareProperties(fixture.expected.final_properties, engine.getProperties());
    if (propErr) return { pass: false, error: `Property mismatch: ${propErr}` };
  }

  return { pass: true };
}

// ── Main ──
function main() {
  const conformanceDir = findConformanceDir();
  const fixtures = discoverFixtures(conformanceDir);

  console.log(`${BOLD}Trajectory RT — Conformance Test Runner${RESET}\n`);
  console.log(`Found ${fixtures.length} fixtures in ${conformanceDir}\n`);

  let passed = 0;
  let failed = 0;

  for (const fixture of fixtures) {
    const result = runFixture(fixture);
    if (result.pass) {
      console.log(`  ${GREEN}PASS${RESET}  ${fixture.test_id}: ${fixture.name}`);
      passed++;
    } else {
      console.log(`  ${RED}FAIL${RESET}  ${fixture.test_id}: ${fixture.name}`);
      console.log(`        ${result.error}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
