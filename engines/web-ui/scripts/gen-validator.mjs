// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
// Build-time code generation for the workflow structural validator.
//
// The Runtime is served under a strict CSP (script-src 'self', no 'unsafe-eval')
// as a defense-in-depth backstop for sanitized rich-text rendering. Ajv compiles
// schemas by generating a function via new Function(), which that CSP blocks in
// the browser. We therefore precompile the (static) workflow schema into a
// standalone validator HERE, in Node at build time, where eval is allowed. The
// emitted module is plain JS that runs without any runtime compilation.
//
// Output: src/manager/workflow-validator.generated.js  (imported by validation.ts)
// Regenerate with: npm run gen:validator

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AjvModule from 'ajv';
import standaloneModule from 'ajv/dist/standalone/index.js';

const Ajv = AjvModule.default ?? AjvModule;
const standaloneCode = standaloneModule.default ?? standaloneModule;

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../../../spec/workflow-schema.json');
// Emitted as CommonJS (.cjs): Ajv's standalone output require()s small runtime
// helpers (e.g. ucs2length). A .cjs module resolves those natively; Vite and tsx
// bundle them, so the browser bundle still contains no runtime eval/new Function.
const outPath = resolve(here, '../src/manager/workflow-validator.generated.cjs');

// Must stay in lockstep with the form-element handling the runtime applied
// before compiling, so the precompiled validator is byte-for-byte equivalent.
function relaxFormElementRequired(schema) {
  const defs = schema['$defs'];
  if (!defs) return;
  const formElementNames = [
    'FormElementButton', 'FormElementText', 'FormElementHeader',
    'FormElementTextInput', 'FormElementTextarea', 'FormElementImage',
    'FormElementVideo', 'FormElementCheckbox', 'FormElementRadio',
    'FormElementDivider', 'FormElementTimer',
  ];
  for (const name of formElementNames) {
    const def = defs[name];
    if (!def?.allOf) continue;
    for (const part of def.allOf) {
      if (part.properties && part.properties.type) {
        part.required = ['type'];
      }
    }
  }
}

const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
delete schema['$schema'];
relaxFormElementRequired(schema);

// logger:false silences Ajv's "unknown format ... ignored" notices (strict:false
// already ignores formats — same behavior the runtime had). It does not affect the
// generated validator code.
const ajv = new Ajv({ allErrors: true, strict: false, logger: false, code: { source: true } });
const validate = ajv.compile(schema);
const moduleCode = standaloneCode(ajv, validate);

const header =
  '// @ts-nocheck\n' +
  '/* eslint-disable */\n' +
  '// GENERATED FILE - DO NOT EDIT.\n' +
  '// Produced by scripts/gen-validator.mjs from spec/workflow-schema.json.\n' +
  '// CSP-safe: precompiled so the browser never calls new Function(). Regenerate: npm run gen:validator\n';

writeFileSync(outPath, header + moduleCode);
console.log(`[gen-validator] wrote ${outPath} (${header.length + moduleCode.length} bytes)`);
