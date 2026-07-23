import type { PropertyGridField, RuntimeValueProperty, RuntimeValueSource, VisualControl } from "../ir/types.js";
import { collectEnumMemberNames } from "./enumCatalog.js";
import { collectPropertyGridCatalog } from "./propertyGridCatalog.js";
import { collectUniqueNeutralResourceStrings } from "./neutralResourceCatalog.js";

type ResolvedValue = {
  value: string | number | boolean;
  typeName?: string;
};

/**
 * Apply only source-proven initialization defaults. Literal assignments are
 * always eligible; model values are limited to configuration-like classes so
 * an arbitrary Patient/Order record is never replaced by a fabricated fresh
 * entity. The original assignment contract remains on the control.
 */
export async function materializeRuntimeValueDefaults(
  controls: VisualControl[],
  contextPath: string,
): Promise<void> {
  const entries: Array<{ control: VisualControl; source: RuntimeValueSource }> = [];
  visitControls(controls, (control) => {
    for (const source of control.runtimeValueSources ?? []) entries.push({ control, source });
  });
  if (entries.length === 0) return;

  const modelSources = entries.map((entry) => entry.source).filter(isPreviewSafeModelSource);
  const needsResources = entries.some((entry) => /(?:^|\.)(?:Properties\.)?Resources\.[A-Za-z_]\w*$/.test(entry.source.expression.trim()));
  const [catalog, resourceValues] = await Promise.all([
    collectRecursiveModelCatalog(contextPath, modelSources),
    needsResources ? collectUniqueNeutralResourceStrings(contextPath) : Promise.resolve(new Map<string, string>()),
  ]);
  const resolved = entries.map((entry) => ({
    ...entry,
    resolved: resolveSource(entry.source, catalog, resourceValues),
  }));
  for (const entry of resolved) {
    if (entry.resolved) entry.source.resolvedDefault = entry.resolved.value;
  }

  const enumTypes = new Set<string>();
  for (const entry of resolved) {
    if (!entry.resolved || !["selectedIndex", "selectedItem"].includes(entry.source.property)) continue;
    if (typeof entry.resolved.value === "string" && isEnumLikeType(entry.resolved.typeName)) {
      enumTypes.add(shortTypeName(entry.resolved.typeName!));
    }
  }
  const enumMembers = await collectEnumMemberNames(contextPath, enumTypes);

  const groups = new Map<string, typeof resolved>();
  for (const entry of resolved) {
    const key = `${entry.control.name}|${entry.source.property}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(entry);
    groups.set(key, bucket);
  }
  for (const bucket of groups.values()) {
    // An unresolved assignment to the same property means runtime data or a
    // branch still participates in the initial value, so no preview default is
    // authoritative even if another assignment was individually resolvable.
    if (bucket.some((entry) => !entry.resolved)) continue;
    const values = new Set(bucket.map((entry) => `${typeof entry.resolved!.value}:${String(entry.resolved!.value)}`));
    // Multiple initialization paths that disagree usually represent a runtime
    // branch. Preserve their contracts, but do not guess which branch is active.
    if (values.size !== 1) continue;
    const { control, source, resolved: value } = bucket[0];
    applyResolvedValue(control, source.property, value!, enumMembers);
  }
}

async function collectRecursiveModelCatalog(
  contextPath: string,
  sources: RuntimeValueSource[],
): Promise<Map<string, PropertyGridField[]>> {
  const catalog = new Map<string, PropertyGridField[]>();
  let requested = new Set(sources.map((source) => shortTypeName(source.modelType!)));
  for (let depth = 0; depth < 8 && requested.size > 0; depth += 1) {
    const missing = new Set([...requested].filter((typeName) => !catalog.has(typeName)));
    if (missing.size > 0) {
      const found = await collectPropertyGridCatalog(contextPath, missing);
      for (const [typeName, fields] of found) catalog.set(typeName, fields);
      // Mark unresolved names too so the same large context is not rescanned.
      for (const typeName of missing) if (!catalog.has(typeName)) catalog.set(typeName, []);
    }
    requested = new Set<string>();
    for (const source of sources) {
      let typeName = shortTypeName(source.modelType!);
      for (const memberName of source.memberPath?.slice(0, -1) ?? []) {
        const field = catalog.get(typeName)?.find((candidate) => candidate.name === memberName);
        if (!field?.instantiated) break;
        typeName = shortTypeName(field.typeName);
        if (!catalog.has(typeName)) requested.add(typeName);
      }
    }
  }
  return catalog;
}

function resolveSource(
  source: RuntimeValueSource,
  catalog: ReadonlyMap<string, PropertyGridField[]>,
  resources: ReadonlyMap<string, string>,
): ResolvedValue | undefined {
  if (source.conditional) return undefined;
  if (source.literalValue !== undefined) return applyNegation({ value: source.literalValue }, source.negated);
  const resource = source.expression.trim().match(/(?:^|\.)(?:Properties\.)?Resources\.([A-Za-z_]\w*)$/)?.[1];
  if (resource && resources.has(resource)) return applyNegation({ value: resources.get(resource)! }, source.negated);
  if (!isPreviewSafeModelSource(source)) return undefined;
  let typeName = shortTypeName(source.modelType!);
  const path = source.memberPath ?? [];
  for (let index = 0; index < path.length; index += 1) {
    const field = catalog.get(typeName)?.find((candidate) => candidate.name === path[index]);
    if (!field) return undefined;
    if (index === path.length - 1) {
      return field.defaultValue === undefined
        ? undefined
        : applyNegation({ value: field.defaultValue, typeName: field.typeName }, source.negated);
    }
    if (!field.instantiated) return undefined;
    typeName = shortTypeName(field.typeName);
  }
  return undefined;
}

function applyNegation(value: ResolvedValue, negated?: boolean): ResolvedValue | undefined {
  if (!negated) return value;
  return typeof value.value === "boolean" ? { ...value, value: !value.value } : undefined;
}

function applyResolvedValue(
  control: VisualControl,
  property: RuntimeValueProperty,
  resolved: ResolvedValue,
  enumMembers: ReadonlyMap<string, string[]>,
): void {
  const value = resolved.value;
  switch (property) {
    case "text":
      control.text = String(value);
      return;
    case "checked":
    case "enabled":
    case "readOnly":
      if (typeof value === "boolean") control.appearance[property] = value;
      return;
    case "placeholderText":
      if (typeof value === "string") control.appearance.placeholderText = value;
      return;
    case "toolTipText":
      if (typeof value === "string") control.appearance.toolTipText = value;
      return;
    case "value":
      if (typeof value === "string" || typeof value === "number") control.appearance.value = value;
      return;
    case "selectedIndex": {
      const index = selectionIndex(control, value, resolved.typeName, enumMembers);
      if (index !== undefined) control.appearance.selectedIndex = index;
      return;
    }
    case "selectedItem": {
      const index = selectionIndex(control, value, resolved.typeName, enumMembers);
      if (index !== undefined) control.appearance.selectedIndex = index;
      else if (typeof value === "string" && control.kind === "ComboBox") control.text = value;
      return;
    }
  }
}

function selectionIndex(
  control: VisualControl,
  value: string | number | boolean,
  typeName: string | undefined,
  enumMembers: ReadonlyMap<string, string[]>,
): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string") return undefined;
  if (typeName && isEnumLikeType(typeName)) {
    const index = enumMembers.get(shortTypeName(typeName))?.indexOf(value) ?? -1;
    if (index >= 0) return index;
  }
  const index = control.items?.indexOf(value) ?? -1;
  return index >= 0 ? index : undefined;
}

function isPreviewSafeModelSource(source: RuntimeValueSource): boolean {
  return Boolean(source.modelType && source.memberPath?.length
    && /(?:Config|Settings|Options|Preferences)$/i.test(shortTypeName(source.modelType)));
}

function isEnumLikeType(typeName: string | undefined): boolean {
  if (!typeName) return false;
  return !/^(?:string|bool|boolean|byte|sbyte|short|ushort|int|uint|long|ulong|float|double|decimal|char)$/i
    .test(shortTypeName(typeName).replace(/\?$/, ""));
}

function shortTypeName(typeName: string): string {
  return typeName.replace(/^global::/, "").replace(/\?$/, "").split(".").pop()!;
}

function visitControls(controls: VisualControl[], visitor: (control: VisualControl) => void): void {
  for (const control of controls) {
    visitor(control);
    visitControls(control.children, visitor);
  }
}
