// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package com.trajectoryruntime.engine

import com.fasterxml.jackson.databind.ObjectMapper
import kotlin.test.Test
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
}
