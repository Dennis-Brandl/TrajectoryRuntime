// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

import com.fasterxml.jackson.databind.ObjectMapper
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

private val MAPPER = ObjectMapper()
@Suppress("UNCHECKED_CAST")
private fun wfMap(json: String): Map<String, Any?> = MAPPER.readValue(json, Map::class.java) as Map<String, Any?>

private const val DATE = "2026-05-31T12:00:00.000Z"

/** START→Action→END + a CATCH→RETURN island. The ACTION PROXY carries action_proxy_config + a matching
 *  environment so the workflow passes actionProxyValidation (shape from exec-action-proxy-001). */
private fun baseWithCatch(trySpecJson: String = """[{"mode":"ERROR","catch_id":"C1"}]""",
                          returnJson: String = """{"command":"ABANDON"}""",
                          extra: String = ""): String = """
{
  "local_id":"wf","oid":"wf-1","version":"1.0.0","last_modified_date":"$DATE","schemaVersion":"4.0",
  "environment_specifications":[
    {"local_id":"env","oid":"env-1","version":"1.0.0","last_modified_date":"$DATE","included_actions":[{"action_oid":"act-1","action_name":"DoThing","action_library":"lib-1"}]}
  ],
  "steps":[
    {"local_id":"Start","oid":"s1","version":"1.0.0","last_modified_date":"$DATE","step_type":"START"},
    {"local_id":"Action","oid":"s2","version":"1.0.0","last_modified_date":"$DATE","step_type":"ACTION PROXY","action_proxy_config":{"action_oid":"act-1","environment_oid":"env-1"},"try_specifications":$trySpecJson},
    {"local_id":"End","oid":"s3","version":"1.0.0","last_modified_date":"$DATE","step_type":"END"},
    {"local_id":"Catch","oid":"c1","version":"1.0.0","last_modified_date":"$DATE","step_type":"CATCH","catch_id":"C1"},
    {"local_id":"Ret","oid":"r1","version":"1.0.0","last_modified_date":"$DATE","step_type":"RETURN","return_config":$returnJson}
    $extra
  ],
  "connections":[
    {"from_step_id":"s1","to_step_id":"s2"},
    {"from_step_id":"s2","to_step_id":"s3"},
    {"from_step_id":"c1","to_step_id":"r1"}
  ]
}"""

class TryCatchValidatorTest {
  @Test fun `CATCH and RETURN are valid step types`() {
    // Smoke test: CATCH/RETURN must be accepted as step types (not INVALID_STEP_TYPE).
    // (The catch island is still ORPHANED_STEP until the K-B orphan exemption — that's fine here.)
    val r = validate(wfMap(baseWithCatch()))
    assertNotEquals("INVALID_STEP_TYPE", r.error_code, "CATCH/RETURN must be accepted step types")
  }

  @Test fun `accepts a minimal well-formed TRY CATCH RETURN workflow`() {
    val r = validate(wfMap(baseWithCatch()))
    assertEquals(true, r.valid, "expected valid, got ${r.error_code}: ${r.error_message}")
  }

  @Test fun `accepts a RETURN with the COMPLETE command`() {
    val r = validate(wfMap(baseWithCatch(returnJson = """{"command":"COMPLETE"}""")))
    assertEquals(true, r.valid, "expected valid, got ${r.error_code}: ${r.error_message}")
  }

  @Test fun `CATCH_WRONG_DEGREE`() {
    val wf = baseWithCatch().replace(
      """{"from_step_id":"c1","to_step_id":"r1"}""",
      """{"from_step_id":"c1","to_step_id":"r1"},{"from_step_id":"s1","to_step_id":"c1"}""")
    assertEquals("CATCH_WRONG_DEGREE", validate(wfMap(wf)).error_code)
  }
  @Test fun `RETURN_WRONG_DEGREE`() {
    val wf = baseWithCatch().replace(
      """{"from_step_id":"c1","to_step_id":"r1"}""",
      """{"from_step_id":"c1","to_step_id":"r1"},{"from_step_id":"r1","to_step_id":"s3"}""")
    assertEquals("RETURN_WRONG_DEGREE", validate(wfMap(wf)).error_code)
  }
  @Test fun `DUPLICATE_TRY_MODE`() {
    assertEquals("DUPLICATE_TRY_MODE",
      validate(wfMap(baseWithCatch(trySpecJson = """[{"mode":"ERROR","catch_id":"C1"},{"mode":"ERROR","catch_id":"C1"}]"""))).error_code)
  }
  @Test fun `MISSING_RESTART_MODE`() {
    assertEquals("MISSING_RESTART_MODE", validate(wfMap(baseWithCatch(returnJson = """{"command":"RESTART"}"""))).error_code)
  }
  @Test fun `MISSING_GOTO_TARGET`() {
    assertEquals("MISSING_GOTO_TARGET", validate(wfMap(baseWithCatch(returnJson = """{"command":"GOTO"}"""))).error_code)
  }
  @Test fun `UNMATCHED_TRY`() {
    assertEquals("UNMATCHED_TRY", validate(wfMap(baseWithCatch(trySpecJson = """[{"mode":"ERROR","catch_id":"Ghost"}]"""))).error_code)
  }
  @Test fun `DUPLICATE_CATCH_ID`() {
    val wf = baseWithCatch(extra = """,{"local_id":"C2","oid":"c2","version":"1.0.0","last_modified_date":"$DATE","step_type":"CATCH","catch_id":"C1"},{"local_id":"R2","oid":"r2","version":"1.0.0","last_modified_date":"$DATE","step_type":"RETURN","return_config":{"command":"ABANDON"}}""")
      .replace(""""connections":[""", """"connections":[{"from_step_id":"c2","to_step_id":"r2"},""")
    assertEquals("DUPLICATE_CATCH_ID", validate(wfMap(wf)).error_code)
  }
  @Test fun `GOTO_TARGET_NOT_FOUND`() {
    assertEquals("GOTO_TARGET_NOT_FOUND", validate(wfMap(baseWithCatch(returnJson = """{"command":"GOTO","goto_step_oid":"ghost"}"""))).error_code)
  }
  @Test fun `GOTO_TARGET_IN_CATCH`() {
    assertEquals("GOTO_TARGET_IN_CATCH", validate(wfMap(baseWithCatch(returnJson = """{"command":"GOTO","goto_step_oid":"c1"}"""))).error_code)
  }
  @Test fun `CROSS_NETWORK_EDGE`() {
    // Interior node mid1 in the catch network (c1→mid1→r1) so the cross edge s2→mid1 does NOT
    // trip a degree rule first (spec §6.5: structural-degree checks fire before topology).
    val wf = baseWithCatch(
      extra = """,{"local_id":"Mid","oid":"mid1","version":"1.0.0","last_modified_date":"$DATE","step_type":"USER_INTERACTION"}"""
    ).replace(
      """{"from_step_id":"c1","to_step_id":"r1"}""",
      """{"from_step_id":"c1","to_step_id":"mid1"},{"from_step_id":"mid1","to_step_id":"r1"},{"from_step_id":"s2","to_step_id":"mid1"}""")
    assertEquals("CROSS_NETWORK_EDGE", validate(wfMap(wf)).error_code)
  }
  @Test fun `accepts an orphaned CATCH (valid true)`() {
    assertEquals(true, validate(wfMap(baseWithCatch(trySpecJson = "[]"))).valid)
  }
  @Test fun `RETURN-less catch is ORPHANED_STEP at runtime (CATCH_WITHOUT_RETURN is editor-time)`() {
    // Replace the CATCH's RETURN target with a non-RETURN dead end; the RETURN-gated partition
    // leaves the island non-exempt, so semanticValidation rejects it as ORPHANED_STEP.
    val wf = baseWithCatch().replace(
      """{"local_id":"Ret","oid":"r1","version":"1.0.0","last_modified_date":"$DATE","step_type":"RETURN","return_config":{"command":"ABANDON"}}""",
      """{"local_id":"U","oid":"r1","version":"1.0.0","last_modified_date":"$DATE","step_type":"USER_INTERACTION"}""")
    val r = validate(wfMap(wf))
    assertEquals(false, r.valid)
    assertEquals("ORPHANED_STEP", r.error_code)
  }
}
