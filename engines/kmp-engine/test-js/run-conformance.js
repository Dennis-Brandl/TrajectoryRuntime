const { readFileSync, readdirSync } = require('node:fs');
const { resolve, join } = require('node:path');

// Load the KMP JS module from the dist directory
const distDir = resolve(__dirname, '../build/dist/js/productionLibrary');
const kmpModule = require(resolve(distDir, 'kmp-engine.js'));

// Access the WorkflowEngineFacade class
const FacadeClass = kmpModule.com.trajectoryruntime.engine.WorkflowEngineFacade;

if (!FacadeClass) {
  console.error('Could not find WorkflowEngineFacade in module exports.');
  console.log('Available exports:', JSON.stringify(Object.keys(kmpModule), null, 2));
  process.exit(1);
}

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function findConformanceDir() {
  const candidates = [
    resolve(__dirname, '../../../spec/conformance'),
    resolve(__dirname, '../../../../spec/conformance'),
  ];
  for (const p of candidates) {
    try { readdirSync(p); return p; } catch { /* next */ }
  }
  throw new Error('Cannot find conformance directory');
}

function discoverFixtures(baseDir) {
  const fixtures = [];
  for (const subdir of ['validation', 'execution', 'parameters', 'resources']) {
    const dir = join(baseDir, subdir);
    let files;
    try { files = readdirSync(dir).filter(f => f.endsWith('.json')).sort(); } catch { continue; }
    for (const file of files) {
      fixtures.push(JSON.parse(readFileSync(join(dir, file), 'utf-8')));
    }
  }
  return fixtures;
}

function runFixture(fixture) {
  try {
    const facade = new FacadeClass();

    if (fixture.category === 'validation') {
      const result = JSON.parse(facade.validate(JSON.stringify(fixture.workflow)));
      if (result.valid !== fixture.expected.valid) {
        return { pass: false, error: `Expected valid=${fixture.expected.valid}, got valid=${result.valid}` };
      }
      if (!fixture.expected.valid && fixture.expected.error_code) {
        if (result.error_code !== fixture.expected.error_code) {
          return { pass: false, error: `Expected error_code="${fixture.expected.error_code}", got "${result.error_code}"` };
        }
      }
      return { pass: true };
    }

    // Execution / parameter / resource
    const valResult = JSON.parse(facade.validate(JSON.stringify(fixture.workflow)));
    if (!valResult.valid) {
      return { pass: false, error: `Validation failed: ${valResult.error_code}` };
    }

    const setupJson = fixture.setup ? JSON.stringify(fixture.setup) : null;
    facade.createAndStart(JSON.stringify(fixture.workflow), setupJson);

    if (fixture.user_actions) {
      for (const action of fixture.user_actions) {
        facade.submitAction(JSON.stringify(action));
      }
    }

    if (fixture.expected.execution_trace) {
      const actualTrace = JSON.parse(facade.getTrace());
      const expectedTrace = fixture.expected.execution_trace;
      if (actualTrace.length !== expectedTrace.length) {
        return { pass: false, error: `Trace length: expected ${expectedTrace.length}, got ${actualTrace.length}` };
      }
      for (let i = 0; i < expectedTrace.length; i++) {
        if (expectedTrace[i].step_oid !== actualTrace[i].step_oid) {
          return { pass: false, error: `Trace[${i}] step_oid: expected "${expectedTrace[i].step_oid}", got "${actualTrace[i].step_oid}"` };
        }
        if (expectedTrace[i].state !== actualTrace[i].state) {
          return { pass: false, error: `Trace[${i}] state: expected "${expectedTrace[i].state}", got "${actualTrace[i].state}"` };
        }
      }
    }

    if (fixture.expected.workflow_state) {
      const actualState = facade.getWorkflowState();
      if (actualState !== fixture.expected.workflow_state) {
        return { pass: false, error: `State: expected "${fixture.expected.workflow_state}", got "${actualState}"` };
      }
    }

    if (fixture.expected.final_properties) {
      const actualProps = JSON.parse(facade.getProperties());
      for (const [key, expectedValue] of Object.entries(fixture.expected.final_properties)) {
        if (actualProps[key] !== expectedValue) {
          return { pass: false, error: `Property "${key}": expected "${expectedValue}", got "${actualProps[key] ?? '(undefined)'}"` };
        }
      }
    }

    return { pass: true };
  } catch (err) {
    return { pass: false, error: `Exception: ${err.message || err}` };
  }
}

// Main
const conformanceDir = findConformanceDir();
const fixtures = discoverFixtures(conformanceDir);

console.log(`${BOLD}Trajectory RT - KMP JS Conformance Test${RESET}\n`);
console.log(`Found ${fixtures.length} fixtures\n`);

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
