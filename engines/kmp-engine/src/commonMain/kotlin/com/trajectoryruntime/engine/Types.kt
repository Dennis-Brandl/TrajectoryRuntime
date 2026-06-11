// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

import kotlinx.serialization.*
import kotlinx.serialization.json.*

// ── Resource snapshot ──

data class ResourceSnapshotEntry(
    val name: String,         // composite resourceKey "ownerId:resourceName"
    val ownerId: String,      // workflow oid (workflow-scoped) or env oid (env-scoped)
    val scope: String,        // "workflow" | "environment"
    val resourceName: String, // bare resource name without owner prefix
    val type: String,
    val total: Int,
    val inUse: Int,
    val available: Int,
    val queued: Int,
    val state: String,
)

// ── Workflow Document Types ──

@Serializable
data class ManagedElement(
    val local_id: String,
    val oid: String,
    val description: String? = null,
    val version: String,
    val last_modified_date: String,
)

@Serializable
data class WorkflowConnection(
    val from_step_id: String,
    val to_step_id: String,
    val condition: String? = null,
    val connection_id: String? = null,
    val source_handle_id: String? = null,
    val waypoints: List<Position>? = null,
)

@Serializable
data class Position(val x: Double, val y: Double)

@Serializable
data class ParameterDefaultSource(
    val mode: String, // "static" | "property" | "parameter"
    val value: String,
)

@Serializable
data class YesNoConfig(
    val yes_label: String? = null,
    val no_label: String? = null,
    val yes_value: String? = null,
    val no_value: String? = null,
    val default_selection: String? = null,
)

@Serializable
data class Select1Option(
    val id: String,
    val label: String,
    val operator: String,
    val value: String,
    val value_type: String, // "literal" | "property"
    val is_default: Boolean,
)

@Serializable
data class Select1Config(
    val input_name: String? = null,
    val input_value_type: String? = null,
    val options: List<Select1Option>? = null,
)

@Serializable
data class ScriptConfig(
    val language: String? = null,
    val source: String? = null,
)

@Serializable
data class PropertyEntrySpecification(
    val name: String,
    val value: String,
)

@Serializable
data class ParameterSpecification(
    val id: String,
    val oid: String? = null,
    val description: String? = null,
    val default_value: String,
    val value_type: String? = null,
    val json_schema: String? = null,
    val entries: List<PropertyEntrySpecification>? = null,
)

@Serializable
data class OutputParameterSpecification(
    val id: String,
    val oid: String? = null,
    val description: String? = null,
    val target: String? = null,
    val entries: List<PropertyEntrySpecification>? = null,
)

@Serializable
data class PropertySpecification(
    val name: String,
    val oid: String? = null,
    val entries: List<PropertyEntrySpecification>,
)

@Serializable
data class ResourceCommandSpecification(
    val oid: String? = null,
    val command_type: String,
    val resource_name: String,
    val resource_source_type: String? = null,
    val resource_source_oid: String? = null,
    val amount: Double? = null,
    val target: String? = null,
    val source: String? = null,
)

@Serializable
data class ResourcePropertySpecification(
    val name: String,
    val resource_type: String,
    val use_limit: Int? = null,
    val description: String? = null,
    val names: List<String>? = null,
    val scope: String? = null,
)

@Serializable
data class ActionProxyConfig(
    val action_oid: String,
    val environment_oid: String,
    val timeout_ms: Long? = null,
)

typealias FailureMode = String // "ERROR" | "ABORT" | "TIMEOUT"

@Serializable
data class TrySpecification(
    val mode: String,            // ERROR | ABORT | TIMEOUT
    val catch_id: String,
    val release_on_catch: Boolean? = null,
)

@Serializable
data class ReturnConfig(
    val command: String,         // ABANDON | RESTART | GOTO | RETRY | COMPLETE
    val restart_mode: String? = null, // CLEAN | KEEP
    val goto_step_oid: String? = null,
)

/** Runtime-only (not serialized). */
data class CatchContext(
    val catch_oid: String,
    val trigger_step_oid: String,
    val trigger_step_name: String,
    val trigger_reason: String,
    val error_message: String?,
    val activated_at: String,
)

@Serializable
data class MasterWorkflowStep(
    val local_id: String,
    val oid: String,
    val description: String? = null,
    val version: String,
    val last_modified_date: String,
    val step_type: String,
    val position: Position? = null,
    val input_parameter_specifications: List<ParameterSpecification>? = null,
    val output_parameter_specifications: List<OutputParameterSpecification>? = null,
    val value_property_specifications: List<PropertySpecification>? = null,
    val resource_command_specifications: List<ResourceCommandSpecification>? = null,
    val form_layout_config: JsonElement? = null,
    val yes_no_config: YesNoConfig? = null,
    val script_config: ScriptConfig? = null,
    val select1_config: Select1Config? = null,
    val action_proxy_config: ActionProxyConfig? = null,
    val try_specifications: List<TrySpecification>? = null,
    val catch_id: String? = null,
    val return_config: ReturnConfig? = null,
)

@Serializable
data class MasterWorkflowSpecification(
    val local_id: String,
    val oid: String,
    val description: String? = null,
    val version: String,
    val last_modified_date: String,
    val schemaVersion: String? = null,
    val state: String? = null,
    val steps: List<MasterWorkflowStep>,
    val connections: List<WorkflowConnection>,
    val starting_parameter_specifications: List<ParameterSpecification>? = null,
    val output_parameter_specifications: List<OutputParameterSpecification>? = null,
    val value_property_specifications: List<PropertySpecification>? = null,
    val resource_command_specifications: List<ResourceCommandSpecification>? = null,
    val resource_property_specifications: List<ResourcePropertySpecification>? = null,
    val environment_specifications: List<MasterEnvironmentSpecification>? = null,
    val children: List<ChildWorkflowExport>? = null,
    val viewport: JsonElement? = null,
    val display_style: String? = null,
)

@Serializable
data class ChildWorkflowExport(
    val local_id: String,
    val oid: String,
    val description: String? = null,
    val version: String,
    val last_modified_date: String,
    val schemaVersion: String? = null,
    val state: String? = null,
    val parentChildSpecId: String? = null,
    val steps: List<MasterWorkflowStep>,
    val connections: List<WorkflowConnection>,
    val starting_parameter_specifications: List<ParameterSpecification>? = null,
    val output_parameter_specifications: List<OutputParameterSpecification>? = null,
    val value_property_specifications: List<PropertySpecification>? = null,
    val resource_command_specifications: List<ResourceCommandSpecification>? = null,
    val resource_property_specifications: List<ResourcePropertySpecification>? = null,
    val environment_specifications: List<MasterEnvironmentSpecification>? = null,
    val children: List<ChildWorkflowExport>? = null,
    val viewport: JsonElement? = null,
    val display_style: String? = null,
) {
    /** Convert to MasterWorkflowSpecification for engine consumption. */
    fun toSpec(): MasterWorkflowSpecification = MasterWorkflowSpecification(
        local_id = local_id,
        oid = oid,
        description = description,
        version = version,
        last_modified_date = last_modified_date,
        schemaVersion = schemaVersion,
        state = state,
        steps = steps,
        connections = connections,
        starting_parameter_specifications = starting_parameter_specifications,
        output_parameter_specifications = output_parameter_specifications,
        value_property_specifications = value_property_specifications,
        resource_command_specifications = resource_command_specifications,
        resource_property_specifications = resource_property_specifications,
        environment_specifications = environment_specifications,
        children = children,
        viewport = viewport,
        display_style = display_style,
    )
}

@Serializable
data class ActionServerSpecification(
    val name: String,
    val uri: String,
    val description: String? = null,
    val connection_type: String,  // "REST" only in v1
)

@Serializable
data class MasterEnvironmentSpecification(
    val local_id: String,
    val oid: String,
    val description: String? = null,
    val version: String,
    val last_modified_date: String,
    val library_name: String? = null,
    val included_actions: List<JsonElement>? = null,
    val value_property_specifications: List<PropertySpecification>? = null,
    val action_property_specifications: List<PropertySpecification>? = null,
    val resource_property_specifications: List<ResourcePropertySpecification>? = null,
    val action_server_specifications: List<ActionServerSpecification>? = null,
)

// ── Engine Runtime Types ──

enum class StepState {
    IDLE, WAITING, STARTING, EXECUTING, COMPLETING, COMPLETED, ERRORED, PAUSED,
    HELD, POSTED, RECEIVED, IN_PROGRESS, ABORTED,
}
enum class WorkflowState { IDLE, RUNNING, COMPLETED, ABORTED, STOPPED, ERRORED }

data class StepInstance(
    val oid: String,
    val stepType: String,
    var state: StepState,
    val step: MasterWorkflowStep,
)

@Serializable
data class TraceEntry(
    val step_oid: String,
    val state: String,
    val order: Int,
    val after_action: Int? = null,
    val error: String? = null,
)

data class ValidationResult(
    val valid: Boolean,
    val error_code: String? = null,
    val error_message: String? = null,
)

data class RoutingResult(
    val conditionValue: String? = null,
    val connectionId: String? = null,
    val sourceHandleId: String? = null,
)

data class PendingResourceState(
    val stepOid: String,
    val blockedOn: BlockedOnInfo? = null,
    val remainingCommands: List<ResourceCommandSpecification> = emptyList(),
    val completionCommands: List<ResourceCommandSpecification> = emptyList(),
)

data class BlockedOnInfo(
    val resource_name: String,
    val command_type: String,
)

// ── UI Integration Types ──

data class ActiveStepInfo(
    val step: StepInstance,
    val workflowName: String,
    val waitingOn: WaitingOnInfo? = null,
)

data class WaitingOnInfo(
    val resourceName: String,
    val commandType: String,
)

data class StepParameterSnapshot(
    val inputParameters: Map<String, String>,
    val outputParameters: MutableMap<String, String>,
    val description: String,
    val label: String,
    val stepType: String,
)

data class CompletedStepInfo(
    val oid: String,
    val localId: String,
    val stepType: String,
    val description: String,
    val completedOrder: Int,
)

val ACTIVE_STEP_STATES = setOf(
    StepState.EXECUTING, StepState.WAITING, StepState.PAUSED,
    StepState.STARTING, StepState.COMPLETING,
    StepState.HELD, StepState.POSTED, StepState.RECEIVED, StepState.IN_PROGRESS, StepState.ABORTED,
)

// ── Test Fixture Types ──

@Serializable
data class UserAction(
    val step_oid: String,
    val action: String, // "submit" | "button_press" | "yes" | "no"
    val form_values: Map<String, JsonElement>? = null,
    val button_output: String? = null,
    val failure_mode: String? = null, // set when action == "fail": ERROR | ABORT | TIMEOUT
    val error: String? = null,        // set when action == "fail"
)

@Serializable
data class TestFixtureSetup(
    val starting_parameters: Map<String, String>? = null,
    val initial_properties: Map<String, String>? = null,
)

@Serializable
data class TestFixtureExpected(
    val valid: Boolean,
    val error_code: String? = null,
    val execution_trace: List<TraceEntry>? = null,
    val workflow_state: String? = null,
    val final_properties: Map<String, String>? = null,
)

@Serializable
data class TestFixture(
    val test_id: String,
    val name: String,
    val category: String,
    val tags: List<String>,
    val workflow: JsonObject,
    val setup: TestFixtureSetup? = null,
    val user_actions: List<UserAction>? = null,
    val expected: TestFixtureExpected,
)
