// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import { resolve } from 'node:path';
import { validate } from './validator.js';
import { WorkflowEngine } from './engine.js';
import { loadWorkflow } from './loader.js';
import type { MasterWorkflowSpecification } from './types.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filePath = args.find(a => !a.startsWith('--'));

  if (!filePath) {
    console.error('Usage: npm run validate -- <path/to/workflow.WFmaster|.WFmasterX> [--dry-run]');
    process.exit(1);
  }

  const fullPath = resolve(filePath);
  let workflow: Record<string, unknown>;
  try {
    workflow = loadWorkflow(fullPath);
  } catch (err) {
    console.error(`${RED}Error:${RESET} ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`${BOLD}Trajectory RT — Workflow Validator${RESET}\n`);
  console.log(`File: ${fullPath}\n`);

  const result = validate(workflow);

  if (result.valid) {
    console.log(`${GREEN}VALID${RESET} — Workflow passes structural and semantic validation.`);

    if (dryRun) {
      console.log(`\n${BOLD}Dry-run execution (auto-completing steps only):${RESET}\n`);
      try {
        const engine = new WorkflowEngine(workflow as unknown as MasterWorkflowSpecification);
        engine.start();
        const trace = engine.getTrace();
        for (const entry of trace) {
          console.log(`  ${entry.order}. ${entry.step_oid} → ${entry.state}`);
        }
        console.log(`\nWorkflow state: ${engine.getWorkflowState()}`);
      } catch (err) {
        console.log(`  Dry-run stopped: ${(err as Error).message}`);
        console.log('  (Expected if workflow has USER_INTERACTION or YES_NO steps requiring user input)');
      }
    }
  } else {
    console.log(`${RED}INVALID${RESET} — ${result.error_code}: ${result.error_message}`);
    process.exit(1);
  }
}

main();
