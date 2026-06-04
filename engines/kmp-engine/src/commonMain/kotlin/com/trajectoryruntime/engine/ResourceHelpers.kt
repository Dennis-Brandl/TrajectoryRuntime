// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package com.trajectoryruntime.engine

private val ACTIVATION_COMMANDS = setOf(
    "Acquire", "Acquire Pool Amount", "Send", "Receive", "Synchronize",
)

private val SYNC_COMMANDS = setOf("Send", "Receive", "Synchronize")

data class SplitCommands(
    val activation: List<ResourceCommandSpecification>,
    val completion: List<ResourceCommandSpecification>,
)

fun splitResourceCommands(commands: List<ResourceCommandSpecification>): SplitCommands {
    val activation = mutableListOf<ResourceCommandSpecification>()
    val completion = mutableListOf<ResourceCommandSpecification>()
    for (cmd in commands) {
        if (cmd.command_type in ACTIVATION_COMMANDS) {
            activation.add(cmd)
        } else {
            completion.add(cmd)
        }
    }
    return SplitCommands(activation, completion)
}

fun sortActivationCommands(
    commands: List<ResourceCommandSpecification>,
): List<ResourceCommandSpecification> {
    return commands.sortedWith(compareBy(
        { if (it.command_type in SYNC_COMMANDS) 0 else 1 },
        { it.resource_name },
    ))
}
