// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
//
// Type surface for the generated standalone validator
// (workflow-validator.generated.cjs), emitted by scripts/gen-validator.mjs as
// CommonJS. The module's export is the Ajv validate function.
import type { ValidateFunction } from 'ajv';
declare const validate: ValidateFunction;
export = validate;
