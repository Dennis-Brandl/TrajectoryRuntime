// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ServerUriTest {
    @Test fun loopbackAllowedByDefault() {
        assertTrue(isAllowedServerUri("http://localhost:3002"))
        assertTrue(isAllowedServerUri("http://127.0.0.1:3002/"))
        assertTrue(isAllowedServerUri("http://[::1]:3002"))
    }

    @Test fun externalAndPrivateRejectedByDefault() {
        assertFalse(isAllowedServerUri("https://evil.example"))
        assertFalse(isAllowedServerUri("http://169.254.169.254/"))   // cloud metadata
        assertFalse(isAllowedServerUri("http://10.0.0.5:8080"))      // private LAN
    }

    @Test fun nonHttpSchemeRejected() {
        assertFalse(isAllowedServerUri("file:///etc/passwd"))
        assertFalse(hasValidServerUriScheme("file:///etc/passwd"))
        assertTrue(hasValidServerUriScheme("http://anything"))
        assertTrue(hasValidServerUriScheme("https://anything"))
    }

    @Test fun allowlistHonored() {
        val allow = listOf("https://actions.example.com")
        assertTrue(isAllowedServerUri("https://actions.example.com/v1/", allow))
        assertFalse(isAllowedServerUri("https://other.example.com", allow))
    }

    @Test fun assertThrowsOnDisallowed() {
        assertFailsWith<DisallowedServerUriException> { assertAllowedServerUri("https://evil.example") }
        assertAllowedServerUri("http://localhost:3002") // must NOT throw
    }
}
