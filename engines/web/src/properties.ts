// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
import type {
  MasterWorkflowSpecification,
  ParameterDefaultSource,
  ParameterSpecification,
  OutputParameterSpecification,
  FormElement,
} from './types.js';

/** Pure function to resolve a ParameterDefaultSource against flat maps. */
export function resolveDefaultValue(
  source: ParameterDefaultSource | undefined,
  properties: Record<string, string>,
  inputParameters: Record<string, string>,
): string {
  if (!source) return '';
  if (source.mode === 'static') return source.value;
  if (source.mode === 'property' || source.mode === 'parameter')
    return properties[source.value] ?? '';
  if (source.mode === 'input')
    return inputParameters[source.value] ?? '';
  return '';
}

export class PropertyStore {
  private store = new Map<string, string>();
  private startingParameters = new Map<string, string>();
  private inputParameters = new Map<string, string>();

  initializeFromWorkflow(workflow: MasterWorkflowSpecification): void {
    const specs = workflow.value_property_specifications;
    if (!specs) return;
    for (const prop of specs) {
      for (const entry of prop.entries) {
        this.store.set(`${prop.name}.${entry.name}`, entry.value);
      }
    }
  }

  initializeFromSetup(initialProperties: Record<string, string>): void {
    for (const [key, value] of Object.entries(initialProperties)) {
      this.store.set(key, value);
    }
  }

  initializeStartingParameters(
    specs: ParameterSpecification[] | undefined,
    values: Record<string, string> | undefined,
  ): void {
    if (!specs) return;
    for (const spec of specs) {
      // Caller-supplied value takes precedence over spec default
      if (values && spec.id in values) {
        this.startingParameters.set(spec.id, values[spec.id]);
      } else {
        // Resolve the default_value based on value_type
        let resolved = spec.default_value;
        if (spec.value_type === 'property') {
          resolved = this.resolvePropertyKey(spec.default_value);
        }
        this.startingParameters.set(spec.id, resolved);
      }
      // Also make starting params available as properties for downstream lookups
      this.store.set(spec.id, this.startingParameters.get(spec.id)!);
    }
  }

  resolveInputParameters(specs: ParameterSpecification[] | undefined): void {
    if (!specs) return;
    this.inputParameters.clear();
    for (const spec of specs) {
      let resolved = spec.default_value;
      if (spec.value_type === 'property') {
        resolved = this.resolvePropertyKey(spec.default_value);
      }
      this.inputParameters.set(spec.id, resolved);
    }
  }

  /** Resolve a property key: exact match first, then group prefix fallback.
   *  If the key matches a group (e.g., "DataToSend" with entries "DataToSend.X", "DataToSend.Y"),
   *  returns a JSON array of {name, value} pairs. */
  resolveKey(key: string): string {
    return this.resolvePropertyKey(key);
  }

  private resolvePropertyKey(key: string): string {
    const exact = this.store.get(key);
    if (exact !== undefined) return exact;
    // Check for group prefix: collect all "key.xxx" entries.
    // The "Description" entry is intentionally excluded — value properties use it
    // for human-readable annotation, not for runtime data, so it should never
    // surface in serialized lists, sync payloads, or input-parameter resolutions.
    const prefix = key + '.';
    const entries: { name: string; value: string }[] = [];
    for (const [k, v] of this.store) {
      if (k.startsWith(prefix)) {
        const name = k.substring(prefix.length);
        if (name.toLowerCase() === 'description') continue;
        entries.push({ name, value: v });
      }
    }
    if (entries.length > 0) return JSON.stringify(entries);
    return '';
  }

  get(dotKey: string): string | undefined {
    return this.store.get(dotKey);
  }

  set(dotKey: string, value: string): void {
    this.store.set(dotKey, value);
  }

  /** Sync-receive write: set bare target, and if data is a JSON [{name,value},...] array
   *  (mirror of resolveKey's group serialization), also explode entries into dotted children
   *  so downstream readers can consume either the full record or individual fields. */
  setSyncTarget(target: string, data: string): void {
    this.store.set(target, data);
    const entries = parseGroupEntries(data);
    if (!entries) return;
    for (const e of entries) {
      this.store.set(`${target}.${e.name}`, e.value);
    }
  }

  resolveDefault(defaultSource: ParameterDefaultSource | undefined): string {
    if (!defaultSource) return '';
    if (defaultSource.mode === 'static') return defaultSource.value;
    if (defaultSource.mode === 'property' || defaultSource.mode === 'parameter')
      return this.store.get(defaultSource.value) ?? '';
    if (defaultSource.mode === 'input')
      return this.inputParameters.get(defaultSource.value)
        ?? this.startingParameters.get(defaultSource.value)
        ?? '';
    return '';
  }

  captureFormOutputs(
    elements: FormElement[],
    formValues: Record<string, unknown>,
    outputSpecs?: OutputParameterSpecification[],
  ): void {
    for (const el of elements) {
      if (!('outputParameter' in el) || !el.outputParameter) continue;
      if (!('fieldName' in el)) continue;
      const fieldName = (el as { fieldName: string }).fieldName;
      const value = formValues[fieldName];
      if (value === undefined) continue;

      // Resolve target: use output_parameter_specifications target if available,
      // otherwise use el.outputParameter directly (which may already be dotted).
      const spec = outputSpecs?.find(s => s.id === el.outputParameter);
      const key = spec?.target || el.outputParameter;

      if (Array.isArray(value)) {
        this.store.set(key, JSON.stringify(value));
      } else {
        this.store.set(key, String(value));
      }
    }
  }

  getInputParameters(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of this.inputParameters) {
      result[key] = value;
    }
    // Include starting parameters as fallback
    for (const [key, value] of this.startingParameters) {
      if (!(key in result)) {
        result[key] = value;
      }
    }
    return result;
  }

  toFlatMap(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of this.store) {
      result[key] = value;
    }
    return result;
  }
}

/** Parse a string as the JSON shape produced by resolveKey's group fallback:
 *  [{"name": string, "value": string}, ...]. Returns null on any deviation. */
function parseGroupEntries(data: string): { name: string; value: string }[] | null {
  if (!data) return null;
  const trimmed = data.trim();
  if (!trimmed.startsWith('[')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const result: { name: string; value: string }[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') return null;
    const name = (item as { name?: unknown }).name;
    const value = (item as { value?: unknown }).value;
    if (typeof name !== 'string' || typeof value !== 'string') return null;
    result.push({ name, value });
  }
  return result;
}
