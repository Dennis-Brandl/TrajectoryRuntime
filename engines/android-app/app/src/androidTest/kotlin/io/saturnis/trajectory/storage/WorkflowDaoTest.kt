// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.storage

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WorkflowDaoTest {
    private lateinit var db: AppDatabase
    private lateinit var dao: WorkflowDao

    @Before
    fun setup() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.workflowDao()
    }

    @After
    fun teardown() {
        db.close()
    }

    @Test
    fun insertAndRetrieveLoaded() = runTest {
        val entity = LoadedWorkflowEntity(
            id = "load-1", localId = "wf-1", version = "1.0", name = "Test WF",
            specOid = "oid-1", specJson = "{}", mediaDir = null, mediaMapJson = null,
            loadedAt = System.currentTimeMillis(),
        )
        dao.insertLoaded(entity)
        val result = dao.getLoaded("load-1")
        assertNotNull(result)
        assertEquals("wf-1", result!!.localId)
    }

    @Test
    fun insertActiveAndRetrieve() = runTest {
        val loaded = LoadedWorkflowEntity(
            id = "load-1", localId = "wf-1", version = "1.0", name = "Test",
            specOid = "oid-1", specJson = "{}", mediaDir = null, mediaMapJson = null,
            loadedAt = System.currentTimeMillis(),
        )
        dao.insertLoaded(loaded)

        val active = ActiveWorkflowEntity(
            id = "active-1",
            name = "Test", localId = "wf-1", version = "1.0",
            specJson = "{}", mediaMapJson = null, environmentsJson = null,
            traceJson = "[]", propertiesJson = "{}",
            userActionsJson = "[]", workflowState = "RUNNING",
            activeStepsJson = "[]",
            startedAt = System.currentTimeMillis(),
            lastUpdatedAt = System.currentTimeMillis(),
        )
        dao.insertActive(active)

        val result = dao.getAllActive()
        assertEquals(1, result.size)
        assertEquals("RUNNING", result[0].workflowState)
    }

    @Test
    fun insertCompletedAndObserve() = runTest {
        val entity = CompletedWorkflowEntity(
            id = "comp-1", localId = "wf-1", version = "1.0", name = "Done WF",
            specJson = "{}", traceJson = "[]", propertiesJson = "{}",
            workflowState = "COMPLETED",
            startedAt = 1000L, finishedAt = 2000L,
        )
        dao.insertCompleted(entity)
        val result = dao.observeCompleted().first()
        assertEquals(1, result.size)
        assertEquals("COMPLETED", result[0].workflowState)
    }

    @Test
    fun duplicateLoadedBySpecOid() = runTest {
        val entity = LoadedWorkflowEntity(
            id = "load-1", localId = "wf-1", version = "1.0", name = "Test",
            specOid = "oid-1", specJson = "{}", mediaDir = null, mediaMapJson = null,
            loadedAt = System.currentTimeMillis(),
        )
        dao.insertLoaded(entity)
        val dup = dao.getLoadedBySpecOid("oid-1")
        assertNotNull(dup)
    }

    @Test
    fun deleteLoadedDoesNotRemoveActive() = runTest {
        val loaded = LoadedWorkflowEntity(
            id = "load-1", localId = "wf-1", version = "1.0", name = "Test",
            specOid = "oid-1", specJson = "{}", mediaDir = null, mediaMapJson = null,
            loadedAt = System.currentTimeMillis(),
        )
        dao.insertLoaded(loaded)
        val active = ActiveWorkflowEntity(
            id = "active-1",
            name = "Test", localId = "wf-1", version = "1.0",
            specJson = "{}", mediaMapJson = null, environmentsJson = null,
            traceJson = "[]", propertiesJson = "{}",
            userActionsJson = "[]", workflowState = "RUNNING",
            activeStepsJson = "[]",
            startedAt = System.currentTimeMillis(),
            lastUpdatedAt = System.currentTimeMillis(),
        )
        dao.insertActive(active)

        dao.deleteLoaded("load-1")
        val result = dao.getAllActive()
        assertEquals(1, result.size) // active workflow survives loaded deletion
    }
}
