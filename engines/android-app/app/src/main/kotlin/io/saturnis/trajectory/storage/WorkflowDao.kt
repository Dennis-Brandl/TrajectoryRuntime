// Copyright (c) 2026 Saturnis.io. All rights reserved.
// Licensed under the GNU AGPL v3. See LICENSE.md for details.
package io.saturnis.trajectory.storage

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkflowDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLoaded(workflow: LoadedWorkflowEntity)

    @Query("SELECT * FROM loaded_workflows ORDER BY loadedAt DESC")
    fun observeLoaded(): Flow<List<LoadedWorkflowEntity>>

    @Query("SELECT * FROM loaded_workflows WHERE id = :id")
    suspend fun getLoaded(id: String): LoadedWorkflowEntity?

    @Query("SELECT * FROM loaded_workflows WHERE specOid = :specOid LIMIT 1")
    suspend fun getLoadedBySpecOid(specOid: String): LoadedWorkflowEntity?

    @Query("DELETE FROM loaded_workflows WHERE id = :id")
    suspend fun deleteLoaded(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertActive(workflow: ActiveWorkflowEntity)

    @Update
    suspend fun updateActive(workflow: ActiveWorkflowEntity)

    @Query("SELECT * FROM active_workflows")
    suspend fun getAllActive(): List<ActiveWorkflowEntity>

    @Query("SELECT * FROM active_workflows")
    fun observeActive(): Flow<List<ActiveWorkflowEntity>>

    @Query("DELETE FROM active_workflows WHERE id = :id")
    suspend fun deleteActive(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCompleted(workflow: CompletedWorkflowEntity)

    @Query("SELECT * FROM completed_workflows ORDER BY finishedAt DESC")
    fun observeCompleted(): Flow<List<CompletedWorkflowEntity>>

    @Query("SELECT * FROM completed_workflows WHERE id = :id")
    suspend fun getCompleted(id: String): CompletedWorkflowEntity?

    @Query("DELETE FROM completed_workflows WHERE id = :id")
    suspend fun deleteCompleted(id: String)

    @Query("DELETE FROM completed_workflows")
    suspend fun clearCompleted()
}
