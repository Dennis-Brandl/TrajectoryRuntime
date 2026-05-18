// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
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
