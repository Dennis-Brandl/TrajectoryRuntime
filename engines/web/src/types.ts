// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
// ── Workflow Document Types ──

export interface ManagedElement {
  local_id: string;
  oid: string;
  description?: string;
  version: string;
  last_modified_date: string;
}

export interface WorkflowConnection {
  from_step_id: string;
  to_step_id: string;
  condition?: string;
  connection_id?: string;
  source_handle_id?: string;
  waypoints?: { x: number; y: number }[];
}

export interface ParameterDefaultSource {
  mode: 'static' | 'property' | 'parameter' | 'input';
  value: string;
}

export interface FormElementBase {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
}

export interface FormElementButton extends FormElementBase {
  type: 'button';
  label: string;
  outputValue: string;
  deletable?: boolean;
}

export type TextInputMode = 'text' | 'number' | 'phone' | 'password' | 'dropdown' | 'combobox';

export interface ListItemSource {
  mode: 'static' | 'input';
  value?: string;
}

export interface ListItem {
  label: string;
  value: string;
}

export interface FormElementTextInput extends FormElementBase {
  type: 'textInput';
  label?: string;
  placeholder?: string;
  fieldName: string;
  required?: boolean;
  outputParameter?: string;
  defaultSource?: ParameterDefaultSource;
  placeholderSource?: ParameterDefaultSource;
  inputMode?: TextInputMode;
  listItems?: ListItem[];
  listSource?: ListItemSource;
}

export interface FormElementTextarea extends FormElementBase {
  type: 'textarea';
  label?: string;
  placeholder?: string;
  fieldName: string;
  required?: boolean;
  rows?: number;
  outputParameter?: string;
  defaultSource?: ParameterDefaultSource;
  placeholderSource?: ParameterDefaultSource;
}

export type OptionEntry = string | { label: string; value: string };

export interface FormElementCheckbox extends FormElementBase {
  type: 'checkbox';
  label?: string;
  fieldName: string;
  options?: OptionEntry[];
  /** Dynamic options sourced from an input parameter (typically a value-property
   *  list). When present and `options` is empty, each entry of the resolved JSON
   *  array becomes a checkbox row. Description entries are filtered upstream by
   *  PropertyStore.resolvePropertyKey. */
  listSource?: ListItemSource;
  required?: boolean;
  outputParameter?: string;
  /** Font size applied to both option-row text and the group label/legend.
   *  Defaults when unset: 15/13 web, 14/12 android (option/legend). */
  fontSize?: number;
}

export interface FormElementRadio extends FormElementBase {
  type: 'radio';
  label?: string;
  fieldName: string;
  options?: OptionEntry[];
  /** Dynamic options sourced from an input parameter (see FormElementCheckbox.listSource). */
  listSource?: ListItemSource;
  required?: boolean;
  outputParameter?: string;
  /** Font size applied to both option-row text and the group label/legend.
   *  Defaults when unset: 15/13 web, 14/12 android (option/legend). */
  fontSize?: number;
}

export interface FormElementHeader extends FormElementBase {
  type: 'header';
  content: { content: string; plainText: string };
  fontSize?: number;
}

export interface FormElementText extends FormElementBase {
  type: 'text';
  content: { content: string; plainText: string };
  fontSize?: number;
}

export interface FormElementDivider extends FormElementBase {
  type: 'divider';
  thickness?: number;
  color?: string;
}

export interface FormElementTimer extends FormElementBase {
  type: 'timer';
  label: string;
  fieldName: string;
  durationSeconds: number;
  direction: 'countdown' | 'countup';
  blockDone?: boolean;
  outputParameter?: string;
  defaultSource?: ParameterDefaultSource;
}

export interface FormElementImage extends FormElementBase {
  type: 'image';
  src: string;
  /**
   * Stable OID for this image element, used as the namespace prefix for exported
   * image files in the ZIP package. Unlike the step OID (which changes when a
   * RuntimeWorkflow is created), this imageOid is preserved across exports and
   * imports, ensuring that image file references remain valid.
   *
   * Generated once when the image element is created and never changed.
   * Archive entry name: `{imageOid}-{src}`
   */
  imageOid?: string;
}

export interface FormElementVideo extends FormElementBase {
  type: 'video';
  src: string;
  posterUrl?: string;
}

export type FormElement =
  | FormElementButton
  | FormElementTextInput
  | FormElementTextarea
  | FormElementCheckbox
  | FormElementRadio
  | FormElementHeader
  | FormElementText
  | FormElementDivider
  | FormElementTimer
  | FormElementImage
  | FormElementVideo;

export interface FormLayoutExportEntry {
  deviceType: 'phone' | 'tablet' | 'desktop';
  canvasWidth: number;
  canvasHeight: number;
  elements: FormElement[];
}

export interface YesNoConfig {
  yes_label?: string;
  no_label?: string;
  yes_value?: string;
  no_value?: string;
  default_selection?: 'yes' | 'no' | 'none';
}

export interface Select1Option {
  id: string;
  label: string;
  operator: '==' | '!=' | '<' | '>' | '<=' | '>=' | 'Contains' | 'Not Contains';
  value: string;
  value_type: 'literal' | 'property';
  is_default: boolean;
}

export interface Select1Config {
  input_name?: string;
  input_value_type?: 'literal' | 'property';
  options?: Select1Option[];
}

export interface ScriptConfig {
  language?: string;
  source?: string;
}

export interface ParameterSpecification {
  id: string;
  oid?: string;
  description?: string;
  default_value: string;
  value_type?: 'literal' | 'property';
  json_schema?: string;
  entries?: PropertyEntrySpecification[];
}

export interface OutputParameterSpecification {
  id: string;
  oid?: string;
  description?: string;
  target?: string;
  entries?: PropertyEntrySpecification[];
}

export interface PropertyEntrySpecification {
  name: string;
  value: string;
}

export interface PropertySpecification {
  name: string;
  oid?: string;
  entries: PropertyEntrySpecification[];
}

export type ResourceCommandType =
  | 'Acquire' | 'Release'
  | 'Acquire Pool Amount' | 'Release Pool Amount'
  | 'Send' | 'Receive' | 'Synchronize';

export interface ResourceSnapshotEntry {
  name: string;                           // composite resourceKey: "ownerId:resourceName"
  ownerId: string;                        // workflow oid (workflow-scoped) or env oid (env-scoped)
  scope: 'workflow' | 'environment';      // partition for "View All Env" vs "View All Workflow"
  resourceName: string;                   // bare resource name without owner prefix
  type: string;                           // resource_type string
  total: number;                          // capacity: use_limit, names.length, 1 (binary exclusive), or 0 (sync)
  inUse: number;                          // currently held: count or names-out
  available: number;                      // total - inUse (named pool: available.length)
  queued: number;                         // queue length (renamed from queuedAcquires; same meaning)
  /** @deprecated use `queued` */
  queuedAcquires: number;
  state: string;                          // human-readable summary, e.g. "2/3 in use"
}

export interface ResourceCommandSpecification {
  oid?: string;
  command_type: ResourceCommandType;
  resource_name: string;
  resource_source_type?: 'workflow' | 'environment';
  resource_source_oid?: string;
  amount?: number;
  target?: string;
  source?: string;
}

export interface ResourcePropertySpecification {
  name: string;
  resource_type: string;
  scope?: 'workflow' | 'environment';
  use_limit?: number;
  description?: string;
  names?: string[];
}

export interface PendingResourceState {
  stepOid: string;
  blockedOn?: { resource_name: string; command_type: ResourceCommandType };
  remainingCommands: ResourceCommandSpecification[];
  completionCommands: ResourceCommandSpecification[];
}

export interface WaitingStepInfo {
  step: StepInstance;
  workflowName: string;
  resourceName: string;
  commandType: ResourceCommandType;
}

export interface ActiveStepInfo {
  step: StepInstance;
  workflowName: string;
  /** Set when step is WAITING on a resource. */
  waitingOn?: { resourceName: string; commandType: ResourceCommandType };
}

export interface CompletedStepInfo {
  oid: string;
  localId: string;
  stepType: string;
  description: string;
  completedOrder: number;
  completedAt: number;
}

export interface ActionServerSpecification {
  name: string;
  uri: string;
  description?: string;
  connection_type: string;
}

export interface MasterEnvironmentSpecification {
  local_id: string;
  oid: string;
  description?: string;
  version: string;
  last_modified_date: string;
  library_name?: string;
  included_actions?: unknown[];
  value_property_specifications?: PropertySpecification[];
  action_property_specifications?: PropertySpecification[];
  resource_property_specifications?: ResourcePropertySpecification[];
  action_server_specifications?: ActionServerSpecification[];
}

export interface MasterEnvironmentLibrary {
  local_id: string;
  oid: string;
  description?: string;
  version: string;
  last_modified_date: string;
  environment_specifications: MasterEnvironmentSpecification[];
  child_libraries?: MasterEnvironmentLibrary[];
}

export interface ActionProxyConfig {
  action_oid: string;
  environment_oid: string;
  timeout_ms?: number;
}

export type FailureMode = 'ERROR' | 'ABORT' | 'TIMEOUT';

export interface TrySpecification {
  mode: FailureMode;
  catch_id: string;
  release_on_catch?: boolean;
}

export interface ReturnConfig {
  command: 'ABANDON' | 'RESTART' | 'GOTO' | 'RETRY';
  restart_mode?: 'CLEAN' | 'KEEP';
  goto_step_oid?: string;
}

export interface MasterWorkflowStep extends ManagedElement {
  step_type: string;
  position?: { x: number; y: number };
  input_parameter_specifications?: ParameterSpecification[];
  output_parameter_specifications?: OutputParameterSpecification[];
  value_property_specifications?: PropertySpecification[];
  resource_command_specifications?: ResourceCommandSpecification[];
  form_layout_config?: FormLayoutExportEntry[] | Record<string, unknown>;
  yes_no_config?: YesNoConfig;
  script_config?: ScriptConfig;
  select1_config?: Select1Config;
  action_proxy_config?: ActionProxyConfig;
  try_specifications?: TrySpecification[];
  catch_id?: string;
  return_config?: ReturnConfig;
}

export type DisplayStyle = 'flowchart' | 'bpmn' | 'isa88';

export interface MasterWorkflowSpecification extends ManagedElement {
  schemaVersion?: string;
  state?: string;
  display_style?: DisplayStyle;
  steps: MasterWorkflowStep[];
  connections: WorkflowConnection[];
  starting_parameter_specifications?: ParameterSpecification[];
  output_parameter_specifications?: OutputParameterSpecification[];
  value_property_specifications?: PropertySpecification[];
  resource_command_specifications?: ResourceCommandSpecification[];
  resource_property_specifications?: ResourcePropertySpecification[];
  environment_specifications?: MasterEnvironmentSpecification[];
  children?: ChildWorkflowExport[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface ChildWorkflowExport extends MasterWorkflowSpecification {
  parentChildSpecId: string | null;
}

// ── Engine Runtime Types ──

export type StepState =
  | 'IDLE' | 'STARTING' | 'COMPLETING' | 'COMPLETED' | 'ERRORED'
  | 'EXECUTING' | 'WAITING' | 'PAUSED'
  | 'HELD' | 'POSTED' | 'RECEIVED' | 'IN_PROGRESS' | 'ABORTED';

/** States that represent an active step visible in the UI (not auto-completing, not finished). */
export const ACTIVE_STEP_STATES: ReadonlySet<StepState> = new Set<StepState>([
  'EXECUTING', 'WAITING', 'PAUSED',
  'STARTING', 'COMPLETING',
  'HELD', 'POSTED', 'RECEIVED', 'IN_PROGRESS', 'ABORTED',
]);
export type WorkflowState = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'ABORTED' | 'STOPPED' | 'ERRORED';

export interface StepInstance {
  oid: string;
  stepType: string; // normalized (underscores → spaces)
  state: StepState;
  step: MasterWorkflowStep;
}

export interface CatchContext {
  catch_oid: string;
  trigger_step_oid: string;
  trigger_step_name: string;
  trigger_reason: FailureMode;
  error_message: string | null;
  activated_at: string;
}

export interface TraceEntry {
  step_oid: string;
  state: string;
  order: number;
  timestamp: number;
  after_action?: number;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  error_code?: string;
  error_message?: string;
}

export interface RoutingResult {
  conditionValue?: string;
  connectionId?: string;
  /** When set, filter outgoing connections by source_handle_id. Used by YES_NO. */
  sourceHandleId?: string;
  /** When true, only connections with a matching condition fire (no unconditional passthrough). Used by YES_NO. */
  excludeUnconditional?: boolean;
}

// ── Test Fixture Types ──

export interface UserAction {
  step_oid: string;
  action: 'submit' | 'button_press' | 'yes' | 'no' | 'pause' | 'resume' | 'fail';
  form_values?: Record<string, unknown>;
  button_output?: string;
  /** Set when action === 'fail': the classified failure mode driving TRY dispatch. */
  failure_mode?: FailureMode;
  /** Set when action === 'fail': the underlying error message, if any. */
  error?: string;
}

export interface TestFixture {
  test_id: string;
  name: string;
  category: 'validation' | 'execution' | 'parameters';
  tags: string[];
  workflow: Record<string, unknown>;
  setup?: {
    starting_parameters?: Record<string, string>;
    initial_properties?: Record<string, string>;
    resources?: ResourcePropertySpecification[];
  };
  user_actions?: UserAction[];
  expected: {
    valid: boolean;
    error_code?: string;
    execution_trace?: TraceEntry[];
    workflow_state?: string;
    final_properties?: Record<string, string>;
  };
}
