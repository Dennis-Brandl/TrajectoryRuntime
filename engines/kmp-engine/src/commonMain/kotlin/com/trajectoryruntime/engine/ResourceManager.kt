// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

// ── Result Types ──

data class AcquireResult(val granted: Boolean, val name: String? = null)
data class ReceiveResult(val available: Boolean, val data: String = "")
data class SyncResult(val ready: Boolean)

// ── Interface ──
//
// MODEL: Resource pools are pure state (counts or lists of names). Acquire decrements;
// Release increments. The manager does NOT track WHO holds what — it is the workflow
// author's responsibility to release the correct name (named pool) or amount (countable)
// that they originally acquired. There is no auto-release on workflow abort.
//
// Queue entries (waiterId) are full requesterIds in the format "instanceId:stepOid"
// so cross-workflow grant routing can find the right engine. They are used ONLY for
// queue routing — when a Release frees pool capacity, the head-of-queue waiterId is
// added to pendingGrants so its engine can resume the waiting step.

interface ResourceManager {
    fun registerResource(spec: ResourcePropertySpecification, ownerId: String, scope: String? = null)
    fun unregisterResources(ownerId: String)

    fun acquire(resourceName: String, requesterId: String): AcquireResult
    /** Release one unit (binary/shared) or 1 unit (countable plain Acquire's mate). */
    fun release(resourceName: String): Boolean

    fun acquireAmount(resourceName: String, requesterId: String, amount: Double): AcquireResult
    fun releaseAmount(resourceName: String, amount: Double)

    fun acquireNamed(resourceName: String, requesterId: String): AcquireResult
    /** Returns true if the name was returned to pool, false if name was already
     *  available (double-release) or never belonged to this pool. */
    fun releaseNamed(resourceName: String, name: String): Boolean

    fun send(resourceName: String, requesterId: String, data: String): SyncResult
    fun receive(resourceName: String, requesterId: String): ReceiveResult
    fun synchronize(resourceName: String, requesterId: String): SyncResult

    fun getSyncData(requesterId: String): String?
    fun clearSyncData(requesterId: String)

    /** When a queued named-pool Acquire becomes grantable, the manager reserves the name
     *  out of `available` and records it here. The engine consumes this on grant
     *  processing to write the name to the Acquire's cmd.target property. */
    fun consumePendingNamedAssignment(requesterId: String): String?

    fun flushGranted(knownStepOids: Set<String>? = null): List<String>

    /** Cancel all queued waiters whose stepOid (suffix of `instanceId:stepOid`) is in
     *  `stepOids`. Pool state is NOT modified — workflow author is responsible for
     *  releasing what was acquired (model intentionally has no per-holder tracking). */
    fun cancelQueuedWaiters(stepOids: Set<String>)

    /** Explicit user action: reset each named resource to its registered initial state
     *  (inUse=0 / available=originalNames). Queue is preserved and tryGrant runs so
     *  any waiters can immediately be served. Returns the resourceKeys that actually
     *  had non-default state before the reset. */
    fun resetResources(resourceKeys: Set<String>): List<String>

    fun hasResource(resourceName: String): Boolean

    /** Snapshot of every registered resource for inspection in UIs. */
    fun getSnapshot(): List<ResourceSnapshotEntry>
}

// ── Internal State Types ──

private sealed class ResourceState(val ownerId: String, val resourceName: String, val scope: String)

private class BinaryExclusiveState(
    ownerId: String,
    resourceName: String,
    scope: String,
    var inUse: Int = 0, // 0 or 1
    val queue: MutableList<String> = mutableListOf(),
) : ResourceState(ownerId, resourceName, scope)

private class BinarySharedState(
    ownerId: String,
    resourceName: String,
    scope: String,
    var inUse: Int = 0,
    val useLimit: Int,
    val queue: MutableList<String> = mutableListOf(),
) : ResourceState(ownerId, resourceName, scope)

private class CountableState(
    ownerId: String,
    resourceName: String,
    scope: String,
    var inUse: Double = 0.0,
    val useLimit: Double,
    val queue: MutableList<Pair<String, Double>> = mutableListOf(),
) : ResourceState(ownerId, resourceName, scope)

private class NamedPoolState(
    ownerId: String,
    resourceName: String,
    scope: String,
    val available: MutableList<String>,
    val originalNames: Set<String>,
    val queue: MutableList<String> = mutableListOf(),
) : ResourceState(ownerId, resourceName, scope)

private class SyncState(
    ownerId: String,
    resourceName: String,
    scope: String,
    val sendQueue: MutableList<Pair<String, String>> = mutableListOf(),
    val receiveQueue: MutableList<String> = mutableListOf(),
    val pendingSync: MutableList<String> = mutableListOf(),
) : ResourceState(ownerId, resourceName, scope)

// ── Implementation ──

class InMemoryResourceManager : ResourceManager {
    private val resources = mutableMapOf<String, ResourceState>()
    private val pendingGrants = mutableListOf<String>()
    private val syncMatchedData = mutableMapOf<String, String>()
    private val pendingNamedAssignments = mutableMapOf<String, String>()

    override fun registerResource(spec: ResourcePropertySpecification, ownerId: String, scope: String?) {
        if (resources.containsKey(spec.name)) return
        val resolvedScope = scope ?: if (spec.scope == "environment") "environment" else "workflow"
        resources[spec.name] = when (spec.resource_type) {
            "binary exclusive use" ->
                BinaryExclusiveState(ownerId, spec.name, resolvedScope)
            "binary shared use with pool limits" ->
                BinarySharedState(ownerId, spec.name, resolvedScope, useLimit = spec.use_limit ?: 1)
            "countable use with pool limits" ->
                CountableState(ownerId, spec.name, resolvedScope, useLimit = (spec.use_limit ?: 1).toDouble())
            "named pool" -> {
                val names = spec.names ?: emptyList()
                NamedPoolState(ownerId, spec.name, resolvedScope, available = names.toMutableList(), originalNames = names.toSet())
            }
            "sync" -> SyncState(ownerId, spec.name, resolvedScope)
            else -> throw IllegalArgumentException("Unknown resource type: \"${spec.resource_type}\"")
        }
    }

    override fun unregisterResources(ownerId: String) {
        val keys = resources.entries.filter { it.value.ownerId == ownerId }.map { it.key }
        for (key in keys) resources.remove(key)
    }

    override fun hasResource(resourceName: String): Boolean = resources.containsKey(resourceName)

    private fun getResource(name: String): ResourceState =
        resources[name] ?: throw IllegalStateException("Resource \"$name\" is not registered")

    override fun acquire(resourceName: String, requesterId: String): AcquireResult {
        return when (val r = getResource(resourceName)) {
            is BinaryExclusiveState -> {
                if (r.inUse == 0 && r.queue.isEmpty()) {
                    r.inUse = 1
                    AcquireResult(granted = true)
                } else {
                    r.queue.add(requesterId)
                    AcquireResult(granted = false)
                }
            }
            is BinarySharedState -> {
                if (r.inUse < r.useLimit && r.queue.isEmpty()) {
                    r.inUse++
                    AcquireResult(granted = true)
                } else {
                    r.queue.add(requesterId)
                    AcquireResult(granted = false)
                }
            }
            is NamedPoolState -> acquireNamed(resourceName, requesterId)
            is CountableState -> {
                // Plain "Acquire" on a countable resource — acquire 1 unit
                if (r.inUse + 1 <= r.useLimit && r.queue.isEmpty()) {
                    r.inUse += 1
                    AcquireResult(granted = true)
                } else {
                    r.queue.add(requesterId to 1.0)
                    AcquireResult(granted = false)
                }
            }
            else -> throw IllegalStateException("acquire() not supported for resource type")
        }
    }

    override fun release(resourceName: String): Boolean {
        val r = resources[resourceName] ?: return false
        return when (r) {
            is BinaryExclusiveState -> {
                if (r.inUse == 0) return false
                r.inUse = 0
                tryGrantBinaryExclusive(r)
                true
            }
            is BinarySharedState -> {
                if (r.inUse == 0) return false
                r.inUse--
                tryGrantBinaryShared(r)
                true
            }
            is CountableState -> {
                releaseAmount(resourceName, 1.0)
                true
            }
            else -> false
        }
    }

    private fun tryGrantBinaryExclusive(r: BinaryExclusiveState) {
        if (r.inUse == 0 && r.queue.isNotEmpty()) {
            val next = r.queue.removeFirst()
            r.inUse = 1
            pendingGrants.add(next)
        }
    }

    private fun tryGrantBinaryShared(r: BinarySharedState) {
        while (r.inUse < r.useLimit && r.queue.isNotEmpty()) {
            val next = r.queue.removeFirst()
            r.inUse++
            pendingGrants.add(next)
        }
    }

    override fun acquireAmount(resourceName: String, requesterId: String, amount: Double): AcquireResult {
        val r = getResource(resourceName)
        if (r !is CountableState) throw IllegalStateException("acquireAmount() not supported")
        if (r.inUse + amount <= r.useLimit && r.queue.isEmpty()) {
            r.inUse += amount
            return AcquireResult(granted = true)
        }
        r.queue.add(requesterId to amount)
        return AcquireResult(granted = false)
    }

    override fun releaseAmount(resourceName: String, amount: Double) {
        val r = getResource(resourceName)
        if (r !is CountableState) throw IllegalStateException("releaseAmount() not supported")
        // Defensive bounds: floor at 0, accept what the workflow author releases.
        r.inUse = maxOf(0.0, r.inUse - amount)
        tryGrantCountable(r)
    }

    private fun tryGrantCountable(r: CountableState) {
        while (r.queue.isNotEmpty()) {
            val (reqId, amt) = r.queue.first()
            if (r.inUse + amt <= r.useLimit) {
                r.queue.removeFirst()
                r.inUse += amt
                pendingGrants.add(reqId)
            } else {
                break
            }
        }
    }

    override fun acquireNamed(resourceName: String, requesterId: String): AcquireResult {
        val r = getResource(resourceName)
        if (r !is NamedPoolState) throw IllegalStateException("acquireNamed() not supported")
        if (r.available.isNotEmpty() && r.queue.isEmpty()) {
            val name = r.available.removeFirst()
            return AcquireResult(granted = true, name = name)
        }
        r.queue.add(requesterId)
        return AcquireResult(granted = false)
    }

    override fun releaseNamed(resourceName: String, name: String): Boolean {
        val r = resources[resourceName] ?: return false
        if (r !is NamedPoolState) return false
        // Sanity: only names from this pool are accepted; silently ignore double-release.
        if (name !in r.originalNames) return false
        if (name in r.available) return false
        r.available.add(name)
        tryGrantNamed(r)
        return true
    }

    private fun tryGrantNamed(r: NamedPoolState) {
        // Reserve names at grant time so an unrelated workflow can't acquire them between
        // when we emit the grant and when the granted step's engine resumes. Record the
        // reserved name in pendingNamedAssignments.
        while (r.available.isNotEmpty() && r.queue.isNotEmpty()) {
            val waiter = r.queue.removeFirst()
            val name = r.available.removeFirst()
            pendingNamedAssignments[waiter] = name
            pendingGrants.add(waiter)
        }
    }

    override fun consumePendingNamedAssignment(requesterId: String): String? {
        val name = pendingNamedAssignments[requesterId]
        if (name != null) pendingNamedAssignments.remove(requesterId)
        return name
    }

    override fun send(resourceName: String, requesterId: String, data: String): SyncResult {
        val r = getResource(resourceName)
        if (r !is SyncState) throw IllegalStateException("send() not supported")
        if (r.receiveQueue.isNotEmpty()) {
            val receiverId = r.receiveQueue.removeFirst()
            pendingGrants.add(requesterId)
            pendingGrants.add(receiverId)
            syncMatchedData[receiverId] = data
            return SyncResult(ready = true)
        }
        r.sendQueue.add(requesterId to data)
        return SyncResult(ready = false)
    }

    override fun receive(resourceName: String, requesterId: String): ReceiveResult {
        val r = getResource(resourceName)
        if (r !is SyncState) throw IllegalStateException("receive() not supported")
        if (r.sendQueue.isNotEmpty()) {
            val (senderId, data) = r.sendQueue.removeFirst()
            pendingGrants.add(senderId)
            return ReceiveResult(available = true, data = data)
        }
        r.receiveQueue.add(requesterId)
        return ReceiveResult(available = false)
    }

    override fun synchronize(resourceName: String, requesterId: String): SyncResult {
        val r = getResource(resourceName)
        if (r !is SyncState) throw IllegalStateException("synchronize() not supported")
        r.pendingSync.add(requesterId)
        if (r.pendingSync.size >= 2) {
            val first = r.pendingSync.removeFirst()
            val second = r.pendingSync.removeFirst()
            pendingGrants.add(first)
            pendingGrants.add(second)
            return SyncResult(ready = true)
        }
        return SyncResult(ready = false)
    }

    override fun getSyncData(requesterId: String): String? = syncMatchedData[requesterId]

    override fun clearSyncData(requesterId: String) {
        syncMatchedData.remove(requesterId)
    }

    override fun flushGranted(knownStepOids: Set<String>?): List<String> {
        if (knownStepOids == null) {
            val result = pendingGrants.toList()
            pendingGrants.clear()
            return result
        }
        val taken = mutableListOf<String>()
        val remaining = mutableListOf<String>()
        for (requesterId in pendingGrants) {
            val colonIdx = requesterId.lastIndexOf(':')
            val stepOid = if (colonIdx >= 0) requesterId.substring(colonIdx + 1) else requesterId
            if (stepOid in knownStepOids) taken.add(requesterId) else remaining.add(requesterId)
        }
        pendingGrants.clear()
        pendingGrants.addAll(remaining)
        return taken
    }

    override fun cancelQueuedWaiters(stepOids: Set<String>) {
        fun matches(requesterId: String): Boolean {
            val colonIdx = requesterId.lastIndexOf(':')
            val stepOid = if (colonIdx >= 0) requesterId.substring(colonIdx + 1) else requesterId
            return stepOid in stepOids
        }

        for (state in resources.values) {
            when (state) {
                is BinaryExclusiveState -> state.queue.removeAll(::matches)
                is BinarySharedState -> state.queue.removeAll(::matches)
                is CountableState -> state.queue.removeAll { matches(it.first) }
                is NamedPoolState -> state.queue.removeAll(::matches)
                is SyncState -> {
                    state.sendQueue.removeAll { matches(it.first) }
                    state.receiveQueue.removeAll(::matches)
                    state.pendingSync.removeAll(::matches)
                }
            }
        }
        // Drop any pending grants for cancelled steps; if any names were reserved
        // for them, return those names to their pools.
        pendingGrants.removeAll(::matches)
        val toReturn = pendingNamedAssignments.entries.filter { matches(it.key) }
        for (entry in toReturn) {
            pendingNamedAssignments.remove(entry.key)
            for (state in resources.values) {
                if (state is NamedPoolState && entry.value in state.originalNames && entry.value !in state.available) {
                    state.available.add(entry.value)
                    break
                }
            }
        }
    }

    override fun resetResources(resourceKeys: Set<String>): List<String> {
        val reset = mutableListOf<String>()
        for (key in resourceKeys) {
            val state = resources[key] ?: continue
            when (state) {
                is BinaryExclusiveState -> {
                    if (state.inUse > 0) reset.add(key)
                    state.inUse = 0
                    tryGrantBinaryExclusive(state)
                }
                is BinarySharedState -> {
                    if (state.inUse > 0) reset.add(key)
                    state.inUse = 0
                    tryGrantBinaryShared(state)
                }
                is CountableState -> {
                    if (state.inUse > 0) reset.add(key)
                    state.inUse = 0.0
                    tryGrantCountable(state)
                }
                is NamedPoolState -> {
                    if (state.available.size != state.originalNames.size) reset.add(key)
                    state.available.clear()
                    state.available.addAll(state.originalNames)
                    tryGrantNamed(state)
                }
                is SyncState -> {
                    state.sendQueue.clear()
                    state.receiveQueue.clear()
                    state.pendingSync.clear()
                }
            }
        }
        return reset
    }

    override fun getSnapshot(): List<ResourceSnapshotEntry> {
        val out = mutableListOf<ResourceSnapshotEntry>()
        for ((key, r) in resources) {
            val colon = key.indexOf(':')
            val resourceName = if (colon >= 0) key.substring(colon + 1) else key
            var total = 0
            var inUse = 0
            var available = 0
            var queued = 0
            var state = ""
            when (r) {
                is BinaryExclusiveState -> {
                    total = 1; inUse = r.inUse; available = 1 - r.inUse; queued = r.queue.size
                    state = if (r.inUse == 1) "In use" else "Free"
                }
                is BinarySharedState -> {
                    total = r.useLimit; inUse = r.inUse; available = r.useLimit - r.inUse; queued = r.queue.size
                    state = "${r.inUse}/${r.useLimit} in use"
                }
                is CountableState -> {
                    total = r.useLimit.toInt(); inUse = r.inUse.toInt(); available = total - inUse; queued = r.queue.size
                    state = "${r.inUse.toInt()}/${r.useLimit.toInt()} in use"
                }
                is NamedPoolState -> {
                    total = r.originalNames.size; available = r.available.size; inUse = total - available; queued = r.queue.size
                    state = "$available available, $inUse in use"
                }
                is SyncState -> {
                    queued = r.sendQueue.size + r.receiveQueue.size + r.pendingSync.size
                    state = "send:${r.sendQueue.size} recv:${r.receiveQueue.size} sync:${r.pendingSync.size}"
                }
            }
            out.add(ResourceSnapshotEntry(
                name = key, ownerId = r.ownerId, scope = r.scope, resourceName = resourceName,
                type = r.resourceType, total = total, inUse = inUse, available = available,
                queued = queued, state = state,
            ))
        }
        return out
    }
}

private val ResourceState.resourceType: String get() = when (this) {
    is BinaryExclusiveState -> "binary exclusive use"
    is BinarySharedState -> "binary shared use with pool limits"
    is CountableState -> "countable use with pool limits"
    is NamedPoolState -> "named pool"
    is SyncState -> "sync"
}
