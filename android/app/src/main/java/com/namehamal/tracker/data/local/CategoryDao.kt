package com.namehamal.tracker.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface CategoryDao {
    @Query("SELECT * FROM category_snapshots WHERE isArchived = 0 ORDER BY sortOrder, name COLLATE NOCASE, categoryId")
    fun observeActiveCategories(): Flow<List<CategorySnapshotEntity>>

    @Query("SELECT * FROM category_snapshots WHERE categoryId = :categoryId AND isArchived = 0 LIMIT 1")
    suspend fun getActiveCategory(categoryId: String): CategorySnapshotEntity?

    @Query("SELECT * FROM category_snapshots ORDER BY sortOrder, name COLLATE NOCASE, categoryId")
    suspend fun getAllCategories(): List<CategorySnapshotEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(category: CategorySnapshotEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(categories: List<CategorySnapshotEntity>)

    @Query("DELETE FROM category_snapshots")
    suspend fun clearAll()
}
