// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory.storage

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "loaded_workflows")
data class LoadedWorkflowEntity(
    @PrimaryKey val id: String,
    val localId: String,
    val version: String,
    val name: String,
    val specOid: String,
    val specJson: String,
    val mediaDir: String?,
    val mediaMapJson: String?,
    val loadedAt: Long,
)

@Entity(tableName = "active_workflows")
data class ActiveWorkflowEntity(
    @PrimaryKey val id: String,
    val name: String,
    val localId: String,
    val version: String,
    val specJson: String,
    val mediaMapJson: String?,
    val environmentsJson: String?,
    val traceJson: String,
    val propertiesJson: String,
    val userActionsJson: String,
    val workflowState: String,
    val activeStepsJson: String,
    val startedAt: Long,
    val lastUpdatedAt: Long,
)

@Entity(tableName = "completed_workflows")
data class CompletedWorkflowEntity(
    @PrimaryKey val id: String,
    val localId: String,
    val version: String,
    val name: String,
    val specJson: String,
    val traceJson: String,
    val propertiesJson: String,
    val workflowState: String,
    val startedAt: Long,
    val finishedAt: Long,
    val syncStatus: String = "pending",
    val syncedAt: Long? = null,
    val externalId: String? = null,
)
