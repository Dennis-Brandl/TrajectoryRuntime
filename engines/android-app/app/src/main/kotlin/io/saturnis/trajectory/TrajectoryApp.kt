// Copyright (c) 2026 Dennis Brandl
// Licensed under the Apache License, Version 2.0. See LICENSE for details.
package io.saturnis.trajectory

import android.app.Application
import io.saturnis.trajectory.manager.WorkflowManager
import io.saturnis.trajectory.storage.AppDatabase
import io.saturnis.trajectory.ui.elements.ElementRegistry

class TrajectoryApp : Application() {
    val database: AppDatabase by lazy {
        AppDatabase.create(this)
    }

    val workflowManager: WorkflowManager by lazy {
        WorkflowManager(dao = database.workflowDao())
    }

    override fun onCreate() {
        super.onCreate()
        ElementRegistry.registerDefaults()
    }
}
