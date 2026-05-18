// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
import type { FormElementCheckbox, FormElementRadio, OptionEntry } from '@engine/types.js';

/** Normalised option for rendering: `(label, value)` pair. */
export interface ResolvedOption {
  label: string;
  value: string;
}

/**
 * Resolve options for checkbox/radio elements. Tries the static `options` array
 * first, then falls back to `listSource` (an input parameter holding a JSON
 * array — typically populated from a value property whose entries become one
 * option per row).
 *
 * Supported `listSource` shapes:
 *  - "PropertyName"                                  (string — name directly)
 *  - { mode: "input", value: "PropertyName" }        (standard ListItemSource shape)
 *  - { value: "PropertyName" }                       (mode defaults to input)
 *
 * Supported entry shapes inside the resolved JSON:
 *  - plain string  → label = value = string
 *  - {label,value} → as authored
 *  - {name, value} → label = name, value = entry.value (value-property entry shape)
 *
 * "Description" entries are filtered out by PropertyStore.resolvePropertyKey before
 * the JSON ever reaches this layer, so no extra filtering is needed here.
 */
export function resolveOptions(
  el: FormElementCheckbox | FormElementRadio,
  inputParameters: Record<string, string>,
): ResolvedOption[] {
  // listSource (input mode) takes precedence over the static options array,
  // matching TextInputElement.resolveListItems precedence.
  const paramName = extractListSourceParam(el.listSource as unknown);
  if (paramName) {
    const raw = inputParameters[paramName];
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: unknown) => parseOptionUnknown(item));
    } catch {
      return [];
    }
  }
  const staticOptions: OptionEntry[] | undefined = el.options;
  if (staticOptions && staticOptions.length > 0) {
    return staticOptions.map(parseOptionEntry);
  }
  return [];
}

function extractListSourceParam(source: unknown): string | undefined {
  if (typeof source === 'string') return source.length > 0 ? source : undefined;
  if (source && typeof source === 'object') {
    const obj = source as Record<string, unknown>;
    const mode = obj.mode;
    if (mode != null && mode !== 'input') return undefined;
    return typeof obj.value === 'string' && obj.value.length > 0 ? obj.value : undefined;
  }
  return undefined;
}

function parseOptionEntry(opt: OptionEntry): ResolvedOption {
  if (typeof opt === 'string') return { label: opt, value: opt };
  return { label: opt.label, value: opt.value };
}

function parseOptionUnknown(item: unknown): ResolvedOption {
  if (typeof item === 'string') return { label: item, value: item };
  if (item && typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    if (typeof obj.label === 'string') {
      return { label: obj.label, value: typeof obj.value === 'string' ? obj.value : obj.label };
    }
    if (typeof obj.name === 'string') {
      return { label: obj.name, value: typeof obj.value === 'string' ? obj.value : obj.name };
    }
  }
  return { label: String(item), value: String(item) };
}
