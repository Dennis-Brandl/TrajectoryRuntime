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
// Emitted as native ESM (.js, via esm:true below). Ajv's standalone output imports a
// small runtime helper (ucs2length); ESM is required because Vite's DEV server serves
// source modules natively WITHOUT CommonJS interop, so a .cjs default export only links
// in the Rollup `vite build` path — under `vite` dev the app white-screens with
// "doesn't provide an export named: 'default'". Still precompiled: no eval/new Function.
const outPath = resolve(here, '../src/manager/workflow-validator.generated.js');

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
const ajv = new Ajv({ allErrors: true, strict: false, logger: false, code: { source: true, esm: true } });
const validate = ajv.compile(schema);
const moduleCode = standaloneCode(ajv, validate);

// Ajv's esm:true output emits ESM `export`s but STILL pulls its runtime helper
// (ucs2length) in via a CommonJS `require().default` — a hybrid valid as neither
// CJS nor ESM. Rewrite that single top-level require into a static ESM import
// (hoisted) so the module is pure ESM and Vite's dev server can link it natively.
const esmCode = moduleCode.replace(
  /const (\w+) = require\((["'])([^"']+)\2\)\.default;/g,
  (_match, id, quote, spec) => {
    // Strict ESM resolvers (Node native) require an explicit extension on deep
    // package paths; Vite/Rollup tolerate either, so the extension is the safe form.
    const path = /\.[mc]?js$/.test(spec) ? spec : `${spec}.js`;
    // The helper (ajv/dist/runtime/ucs2length) is CommonJS exposing its function as
    // `exports.default`. ESM↔CJS default interop DIFFERS by loader: Node native ESM
    // makes the default the whole `module.exports` (fn at `.default.default`), while
    // esbuild/Vite unwrap `__esModule` (fn at `.default`). Import the namespace and
    // unwrap defensively so the module works under BOTH node:test and Vite/browser.
    const ns = `__cjs_${id}`;
    return (
      `import * as ${ns} from ${quote}${path}${quote};` +
      `const ${id} = ${ns}.default?.default ?? ${ns}.default ?? ${ns};`
    );
  },
);

const header =
  '// @ts-nocheck\n' +
  '/* eslint-disable */\n' +
  '// GENERATED FILE - DO NOT EDIT.\n' +
  '// Produced by scripts/gen-validator.mjs from spec/workflow-schema.json.\n' +
  '// CSP-safe: precompiled so the browser never calls new Function(). Regenerate: npm run gen:validator\n';

writeFileSync(outPath, header + esmCode);
console.log(`[gen-validator] wrote ${outPath} (${header.length + esmCode.length} bytes)`);
