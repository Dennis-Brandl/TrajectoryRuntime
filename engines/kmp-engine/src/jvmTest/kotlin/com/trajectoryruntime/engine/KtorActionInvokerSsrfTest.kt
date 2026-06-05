// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertFailsWith

class KtorActionInvokerSsrfTest {
    private val noopCallbacks = object : ActionInvokerCallbacks {
        override fun onStateChange(stepOid: String, newState: StepState, outputs: Map<String, String>?) {}
        override fun onConnectivityChange(stepOid: String, status: String) {}
    }

    @Test fun `invoke rejects a non-loopback server uri before any network call`() {
        val invoker = KtorActionInvoker()
        val req = InvokeRequestKmp(
            stepOid = "s", workflowInstanceId = "w",
            serverUri = "http://169.254.169.254", // cloud-metadata SSRF target
            actionOid = "a", inputs = emptyMap(), pollIntervalMs = 4000,
        )
        assertFailsWith<DisallowedServerUriException> {
            runBlocking { invoker.invoke(req, noopCallbacks) }
        }
    }
}
