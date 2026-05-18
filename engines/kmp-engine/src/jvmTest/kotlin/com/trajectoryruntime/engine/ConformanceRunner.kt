// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

import com.fasterxml.jackson.databind.ObjectMapper
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import java.io.File

class ConformanceRunner {

    private val json = Json { ignoreUnknownKeys = true }
    private val mapper = ObjectMapper()

    private fun findConformanceDir(): File {
        val userDir = System.getProperty("user.dir") ?: "."
        val candidates = listOf(
            File(userDir, "../../spec/conformance"),
            File(userDir, "../../../spec/conformance"),
            File(userDir, "spec/conformance"),
        )
        for (dir in candidates) {
            if (dir.isDirectory) return dir.canonicalFile
        }
        throw IllegalStateException("Cannot find conformance directory, tried: ${candidates.map { it.absolutePath }}")
    }

    private fun discoverFixtures(baseDir: File): List<TestFixture> {
        val fixtures = mutableListOf<TestFixture>()
        val subdirs = listOf("validation", "execution", "parameters", "resources")

        for (subdir in subdirs) {
            val dir = File(baseDir, subdir)
            if (!dir.isDirectory) continue

            val files = dir.listFiles()
                ?.filter { it.extension == "json" }
                ?.sortedBy { it.name }
                ?: continue

            for (file in files) {
                val content = file.readText()
                val fixture = json.decodeFromString<TestFixture>(content)
                fixtures.add(fixture)
            }
        }

        return fixtures
    }

    @TestFactory
    fun conformanceTests(): List<DynamicTest> {
        val conformanceDir = findConformanceDir()
        val fixtures = discoverFixtures(conformanceDir)

        return fixtures.map { fixture ->
            DynamicTest.dynamicTest("${fixture.test_id}: ${fixture.name}") {
                runFixture(fixture)
            }
        }
    }

    private fun runFixture(fixture: TestFixture) {
        if (fixture.category == "validation") {
            runValidationFixture(fixture)
        } else {
            runExecutionFixture(fixture)
        }
    }

    private fun runValidationFixture(fixture: TestFixture) {
        // Convert JsonObject to Map<String, Any?> for the validator
        val workflowMap = jsonObjectToMap(fixture.workflow)
        val result = validate(workflowMap)

        if (fixture.expected.valid != result.valid) {
            val extra = if (result.error_code != null) " (error: ${result.error_code})" else ""
            throw AssertionError(
                "Expected valid=${fixture.expected.valid}, got valid=${result.valid}$extra"
            )
        }

        if (!fixture.expected.valid && fixture.expected.error_code != null) {
            if (result.error_code != fixture.expected.error_code) {
                throw AssertionError(
                    "Expected error_code=\"${fixture.expected.error_code}\", got \"${result.error_code}\""
                )
            }
        }
    }

    private fun runExecutionFixture(fixture: TestFixture) {
        // First validate
        val workflowMap = jsonObjectToMap(fixture.workflow)
        val valResult = validate(workflowMap)
        if (!valResult.valid) {
            throw AssertionError("Validation failed: ${valResult.error_code}")
        }

        // Deserialize workflow as typed object
        val workflowJson = fixture.workflow.toString()
        val workflow = json.decodeFromString<MasterWorkflowSpecification>(workflowJson)
        val engine = WorkflowEngine(workflow, fixture.setup)
        engine.start()

        // Submit user actions
        fixture.user_actions?.forEachIndexed { i, action ->
            engine.submitAction(action, i)
        }

        // Compare execution trace
        fixture.expected.execution_trace?.let { expectedTrace ->
            val actualTrace = engine.getTrace()
            compareTrace(expectedTrace, actualTrace)
        }

        // Compare workflow state
        fixture.expected.workflow_state?.let { expectedState ->
            val actualState = engine.getWorkflowState().name
            if (actualState != expectedState) {
                throw AssertionError(
                    "Workflow state: expected \"$expectedState\", got \"$actualState\""
                )
            }
        }

        // Compare final properties
        fixture.expected.final_properties?.let { expectedProps ->
            val actualProps = engine.getProperties()
            compareProperties(expectedProps, actualProps)
        }
    }

    private fun compareTrace(expected: List<TraceEntry>, actual: List<TraceEntry>) {
        if (expected.size != actual.size) {
            throw AssertionError(
                "Trace length mismatch: expected ${expected.size}, got ${actual.size}\n" +
                    "  Expected: ${expected.map { "${it.step_oid}:${it.state}" }}\n" +
                    "  Actual:   ${actual.map { "${it.step_oid}:${it.state}" }}"
            )
        }

        for (i in expected.indices) {
            val exp = expected[i]
            val act = actual[i]

            if (exp.step_oid != act.step_oid) {
                throw AssertionError("Trace[$i] step_oid: expected \"${exp.step_oid}\", got \"${act.step_oid}\"")
            }
            if (exp.state != act.state) {
                throw AssertionError("Trace[$i] state: expected \"${exp.state}\", got \"${act.state}\" (step ${exp.step_oid})")
            }
            if (exp.order != act.order) {
                throw AssertionError("Trace[$i] order: expected ${exp.order}, got ${act.order} (step ${exp.step_oid})")
            }
            if (exp.after_action != null && exp.after_action != act.after_action) {
                throw AssertionError("Trace[$i] after_action: expected ${exp.after_action}, got ${act.after_action} (step ${exp.step_oid})")
            }
        }
    }

    private fun compareProperties(expected: Map<String, String>, actual: Map<String, String>) {
        for ((key, expectedValue) in expected) {
            val actualValue = actual[key]
            if (actualValue != expectedValue) {
                throw AssertionError(
                    "Property \"$key\": expected \"$expectedValue\", got \"${actualValue ?: "(undefined)"}\""
                )
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun jsonObjectToMap(jsonObject: kotlinx.serialization.json.JsonObject): Map<String, Any?> {
        // Use Jackson to convert the JSON string to a Map
        val jsonString = jsonObject.toString()
        return mapper.readValue(jsonString, Map::class.java) as Map<String, Any?>
    }
}
