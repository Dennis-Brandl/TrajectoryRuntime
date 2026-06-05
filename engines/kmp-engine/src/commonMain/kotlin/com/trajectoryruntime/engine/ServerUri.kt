// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.

// SSRF guard for action-server URIs. A workflow package's
// action_server_specifications[].uri (and the per-step server binding) is
// author-controlled; the runtime fetches it (capabilities, invoke, command,
// delete), so it must be constrained. Kotlin port of engines/web/src/lib/server-uri.ts.
package com.trajectoryruntime.engine

import io.ktor.http.Url

class DisallowedServerUriException(message: String) : Exception(message)

private val LOOPBACK_V4 = Regex("^127(?:\\.\\d{1,3}){3}$")

private fun isLoopbackHost(hostname: String): Boolean {
    val h = hostname.trim('[', ']') // strip IPv6 brackets if present
    return h == "localhost" || h == "::1" || LOOPBACK_V4.matches(h)
}

private fun schemeOf(uri: String): String? =
    try { Url(uri).protocol.name.lowercase() } catch (_: Throwable) { null }

/** Lightweight parseable + http(s)-scheme check (used by the validator). */
fun hasValidServerUriScheme(uri: String): Boolean {
    val s = schemeOf(uri) ?: return false
    return s == "http" || s == "https"
}

/**
 * Whether the action-server URI may be contacted. http(s) only; loopback by
 * default (blocks external, private-LAN, and cloud-metadata hosts). If an
 * allow-list is supplied, the URI must match one of its origins/prefixes.
 */
fun isAllowedServerUri(uri: String, allowlist: List<String> = emptyList()): Boolean {
    val url = try { Url(uri) } catch (_: Throwable) { return false }
    val scheme = url.protocol.name.lowercase()
    if (scheme != "http" && scheme != "https") return false
    val list = allowlist.map { it.trim() }.filter { it.isNotEmpty() }
    if (list.isNotEmpty()) {
        val origin = buildString {
            append(scheme).append("://").append(url.host)
            if (url.port != url.protocol.defaultPort && url.port != 0) append(":").append(url.port)
        }
        return list.any { origin == it || uri.startsWith(it) }
    }
    return isLoopbackHost(url.host)
}

fun assertAllowedServerUri(uri: String, allowlist: List<String> = emptyList()) {
    if (!isAllowedServerUri(uri, allowlist)) {
        throw DisallowedServerUriException(
            "Action-server URI is not allowed: \"$uri\". It must be http(s) and loopback, " +
                "or listed in the trusted action-server allow-list.",
        )
    }
}
