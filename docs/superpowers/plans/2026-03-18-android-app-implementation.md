# TrajectoryRuntime Android App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native Android app with full web-ui feature parity — 5-tab navigation, all 11 form element types, adaptive phone/tablet layouts, Room persistence with active state resume, file loading via picker + intent handler, and export/share.

**Architecture:** Single-module Jetpack Compose app at `engines/android-app/` consuming the KMP engine's JVM target via Gradle project dependency. StateFlow from engine through Coordinator → Manager → ViewModel → Compose. Room DB for loaded, active, and completed workflow persistence.

**Tech Stack:** Kotlin 2.1.0, Jetpack Compose + Material 3, Room, Coil 3, Media3 ExoPlayer, Navigation Compose, KMP Engine (JVM target)

**Spec:** `docs/superpowers/specs/2026-03-18-android-app-design.md`

---

## File Structure

```
engines/android-app/
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── proguard-rules.pro
└── src/
    ├── main/
    │   ├── AndroidManifest.xml
    │   └── kotlin/com/trajectoryruntime/android/
    │       ├── TrajectoryRuntimeApp.kt                  ← Application class, Room init
    │       ├── MainActivity.kt                    ← Entry point, intent handling
    │       ├── ui/
    │       │   ├── navigation/AppNavigation.kt    ← NavHost + bottom NavigationBar
    │       │   ├── screens/
    │       │   │   ├── HomeScreen.kt              ← Load/manage workflows
    │       │   │   ├── HomeViewModel.kt
    │       │   │   ├── ActiveScreen.kt            ← Execute active steps (adaptive)
    │       │   │   ├── ActiveViewModel.kt
    │       │   │   ├── OverviewScreen.kt          ← Workflow graph visualization
    │       │   │   ├── OverviewViewModel.kt
    │       │   │   ├── HistoryScreen.kt           ← Completed workflow history
    │       │   │   ├── HistoryViewModel.kt
    │       │   │   ├── SettingsScreen.kt          ← App preferences
    │       │   │   └── SettingsViewModel.kt
    │       │   ├── components/
    │       │   │   ├── StepRenderer.kt            ← YES NO / USER INTERACTION dispatch
    │       │   │   ├── FormRenderer.kt            ← Breakpoint selection, phone/tablet layout
    │       │   │   ├── ActiveStepCard.kt          ← Step card with state-based rendering
    │       │   │   ├── WorkflowCard.kt            ← Loaded/active workflow list item
    │       │   │   └── WorkflowGraph.kt           ← Canvas-based graph visualization
    │       │   ├── elements/
    │       │   │   ├── ElementRegistry.kt         ← Type string → Composable mapping
    │       │   │   ├── ElementProps.kt            ← Shared props interface
    │       │   │   ├── TextInputElement.kt
    │       │   │   ├── TextareaElement.kt
    │       │   │   ├── CheckboxElement.kt
    │       │   │   ├── RadioElement.kt
    │       │   │   ├── ButtonElement.kt
    │       │   │   ├── TimerElement.kt
    │       │   │   ├── HeaderElement.kt
    │       │   │   ├── TextElement.kt
    │       │   │   ├── ImageElement.kt
    │       │   │   ├── VideoElement.kt
    │       │   │   └── DividerElement.kt
    │       │   └── theme/
    │       │       ├── Theme.kt                   ← Material 3 dynamic color theme
    │       │       ├── Color.kt
    │       │       └── Type.kt
    │       ├── coordinator/
    │       │   └── WorkflowCoordinator.kt         ← Wraps KMP engine, StateFlow
    │       ├── manager/
    │       │   └── WorkflowManager.kt             ← Lifecycle: loaded → active → completed
    │       ├── storage/
    │       │   ├── AppDatabase.kt                 ← Room database definition
    │       │   ├── WorkflowDao.kt                 ← DAO for all 3 tables
    │       │   └── Entities.kt                    ← Room entity classes
    │       └── util/
    │           ├── FileProcessor.kt               ← ZIP extraction, JSON parsing, mediaMap
    │           └── RtfRenderer.kt                 ← HTML→AnnotatedString conversion
    ├── test/
    │   └── kotlin/com/trajectoryruntime/android/
    │       ├── coordinator/WorkflowCoordinatorTest.kt
    │       ├── manager/WorkflowManagerTest.kt
    │       ├── util/FileProcessorTest.kt
    │       └── ResumeReplayTest.kt
    └── androidTest/
        └── kotlin/com/trajectoryruntime/android/
            ├── storage/WorkflowDaoTest.kt
            └── ui/NavigationTest.kt
```

---

## Phase 1: Project Scaffold & Build (Tasks 1-2)

### Task 1: Create Gradle project and build configuration

**Files:**
- Create: `engines/android-app/settings.gradle.kts`
- Create: `engines/android-app/build.gradle.kts`
- Create: `engines/android-app/gradle.properties`
- Create: `engines/android-app/proguard-rules.pro`

- [ ] **Step 1: Create settings.gradle.kts**

```kotlin
// engines/android-app/settings.gradle.kts
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

@Suppress("UnstableApiUsage")
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "TrajectoryRuntime-Android"

include(":app")
include(":engine")
project(":engine").projectDir = file("../kmp-engine")

// Note: The KMP engine declares jvm() target, not android(). This works because
// KMP JVM target artifacts are compatible with the Android Gradle plugin's JVM
// dependency resolution. This is the same pattern used by engines/android-ui/.
```

- [ ] **Step 2: Create gradle.properties**

```properties
# engines/android-app/gradle.properties
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
org.gradle.jvmargs=-Xmx2g
```

- [ ] **Step 3: Create app/build.gradle.kts**

```kotlin
// engines/android-app/build.gradle.kts (root)
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.0" apply false
    id("com.google.devtools.ksp") version "2.1.0-1.0.29" apply false
}
```

Create `engines/android-app/app/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.trajectoryruntime.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.trajectoryruntime.android"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    // KMP Engine (JVM target)
    implementation(project(":engine"))

    // Compose BOM
    val composeBom = platform("androidx.compose:compose-bom:2025.01.01")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material3:material3-window-size-class")
    implementation("androidx.compose.material3:material3-adaptive-navigation-suite")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.animation:animation")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Navigation
    implementation("androidx.navigation:navigation-compose:2.8.5")

    // Lifecycle + ViewModel
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Room
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")

    // Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Image loading
    implementation("io.coil-kt.coil3:coil-compose:3.0.4")

    // Video playback
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    testImplementation("app.cash.turbine:turbine:1.2.0")
    androidTestImplementation(composeBom)
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.room:room-testing:2.6.1")
}
```

- [ ] **Step 4: Create proguard-rules.pro**

```proguard
# engines/android-app/proguard-rules.pro

# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.trajectoryruntime.**$$serializer { *; }
-keepclassmembers class com.trajectoryruntime.** { *** Companion; }
-keepclasseswithmembers class com.trajectoryruntime.** { kotlinx.serialization.KSerializer serializer(...); }

# GraalVM Polyglot (used by KMP engine for SCRIPT steps)
-keep class org.graalvm.** { *; }
-keep class com.oracle.truffle.** { *; }
-dontwarn org.graalvm.**
-dontwarn com.oracle.truffle.**

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**
```

- [ ] **Step 5: Copy Gradle wrapper from existing android-ui**

Run:
```bash
cp -r engines/android-ui/gradle engines/android-app/gradle
cp engines/android-ui/gradlew engines/android-app/gradlew
cp engines/android-ui/gradlew.bat engines/android-app/gradlew.bat
```

- [ ] **Step 6: Verify project builds**

Run:
```bash
cd engines/android-app && ./gradlew :app:assembleDebug
```
Expected: BUILD SUCCESSFUL

- [ ] **Step 7: Commit**

```bash
git add engines/android-app/
git commit -m "feat(android): scaffold Gradle project with all dependencies"
```

---

### Task 2: Create Application class, Theme, and empty MainActivity

**Files:**
- Create: `engines/android-app/app/src/main/AndroidManifest.xml`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/TrajectoryRuntimeApp.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/MainActivity.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/theme/Theme.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/theme/Color.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/theme/Type.kt`
- Create: `engines/android-app/app/src/main/res/values/strings.xml`
- Create: `engines/android-app/app/src/main/res/values/themes.xml`

- [ ] **Step 1: Create AndroidManifest.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:name=".TrajectoryRuntimeApp"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.TrajectoryRuntime">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.TrajectoryRuntime">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:mimeType="application/octet-stream" />
                <data android:mimeType="application/zip" />
                <data android:mimeType="application/json" />
                <data android:pathPattern=".*\\.WFmasterX" />
                <data android:pathPattern=".*\\.WFmaster" />
            </intent-filter>
        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>
```

- [ ] **Step 2: Create TrajectoryRuntimeApp.kt**

```kotlin
package com.trajectoryruntime.android

import android.app.Application
import com.trajectoryruntime.android.storage.AppDatabase

class TrajectoryRuntimeApp : Application() {
    val database: AppDatabase by lazy {
        AppDatabase.create(this)
    }
}
```

- [ ] **Step 3: Create Theme.kt**

```kotlin
package com.trajectoryruntime.android.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

@Composable
fun TrajectoryRuntimeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context)
            else dynamicLightColorScheme(context)
        }
        darkTheme -> darkColorScheme()
        else -> lightColorScheme()
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        content = content,
    )
}
```

- [ ] **Step 4: Create Color.kt and Type.kt**

```kotlin
// Color.kt
package com.trajectoryruntime.android.ui.theme

import androidx.compose.ui.graphics.Color

// Step state colors (matching web-ui WorkflowGraph)
val StepCompleted = Color(0xFF4ADE80)
val StepExecuting = Color(0xFF3B82F6)
val StepWaiting = Color(0xFF93C5FD)
val StepPaused = Color(0xFFEAB308)
val StepErrored = Color(0xFFEF4444)
val StepIdle = Color(0xFF6B7280)
```

```kotlin
// Type.kt
package com.trajectoryruntime.android.ui.theme

import androidx.compose.material3.Typography

val AppTypography = Typography() // Use Material 3 defaults
```

- [ ] **Step 5: Create MainActivity.kt (shell)**

```kotlin
package com.trajectoryruntime.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.trajectoryruntime.android.ui.theme.TrajectoryRuntimeTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TrajectoryRuntimeTheme {
                // Navigation will be added in Task 5
                androidx.compose.material3.Text("TrajectoryRuntime Android")
            }
        }
    }
}
```

- [ ] **Step 6: Create resource files**

`res/values/strings.xml`:
```xml
<resources>
    <string name="app_name">Trajectory RT</string>
</resources>
```

`res/values/themes.xml`:
```xml
<resources>
    <style name="Theme.TrajectoryRuntime" parent="android:Theme.Material.Light.NoActionBar" />
</resources>
```

`res/xml/file_paths.xml`:
```xml
<paths>
    <files-path name="exports" path="exports/" />
</paths>
```

- [ ] **Step 7: Build and install on device**

Run:
```bash
cd engines/android-app && ./gradlew :app:installDebug
```
Expected: App launches, shows "TrajectoryRuntime Android" text.

- [ ] **Step 8: Commit**

```bash
git add engines/android-app/app/src/
git commit -m "feat(android): add Application, MainActivity, Material 3 theme"
```

---

## Phase 2: Storage Layer (Tasks 3-4)

### Task 3: Create Room entities and database

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/storage/Entities.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/storage/WorkflowDao.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/storage/AppDatabase.kt`

- [ ] **Step 1: Create Entities.kt**

```kotlin
package com.trajectoryruntime.android.storage

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
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

@Entity(
    tableName = "active_workflows",
    foreignKeys = [ForeignKey(
        entity = LoadedWorkflowEntity::class,
        parentColumns = ["id"],
        childColumns = ["loadedWorkflowId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("loadedWorkflowId")],
)
data class ActiveWorkflowEntity(
    @PrimaryKey val id: String,
    val loadedWorkflowId: String,
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
```

- [ ] **Step 2: Create WorkflowDao.kt**

```kotlin
package com.trajectoryruntime.android.storage

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface WorkflowDao {
    // Loaded workflows
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

    // Active workflows
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

    // Completed workflows
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
```

- [ ] **Step 3: Create AppDatabase.kt**

```kotlin
package com.trajectoryruntime.android.storage

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        LoadedWorkflowEntity::class,
        ActiveWorkflowEntity::class,
        CompletedWorkflowEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun workflowDao(): WorkflowDao

    companion object {
        fun create(context: Context): AppDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "trajectoryruntime.db",
            )
            .fallbackToDestructiveMigration()
            .build()
        }
    }
}
```

- [ ] **Step 4: Build to verify Room compiles**

Run: `cd engines/android-app && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL (Room annotation processing via KSP)

- [ ] **Step 5: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/storage/
git commit -m "feat(android): add Room database with 3-table schema"
```

---

### Task 4: Room DAO instrumented tests

**Files:**
- Create: `engines/android-app/app/src/androidTest/kotlin/com/trajectoryruntime/android/storage/WorkflowDaoTest.kt`

- [ ] **Step 1: Write DAO tests**

```kotlin
package com.trajectoryruntime.android.storage

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
        // Insert loaded first (FK constraint)
        val loaded = LoadedWorkflowEntity(
            id = "load-1", localId = "wf-1", version = "1.0", name = "Test",
            specOid = "oid-1", specJson = "{}", mediaDir = null, mediaMapJson = null,
            loadedAt = System.currentTimeMillis(),
        )
        dao.insertLoaded(loaded)

        val active = ActiveWorkflowEntity(
            id = "active-1", loadedWorkflowId = "load-1",
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
    fun cascadeDeleteLoadedRemovesActive() = runTest {
        val loaded = LoadedWorkflowEntity(
            id = "load-1", localId = "wf-1", version = "1.0", name = "Test",
            specOid = "oid-1", specJson = "{}", mediaDir = null, mediaMapJson = null,
            loadedAt = System.currentTimeMillis(),
        )
        dao.insertLoaded(loaded)
        val active = ActiveWorkflowEntity(
            id = "active-1", loadedWorkflowId = "load-1",
            traceJson = "[]", propertiesJson = "{}",
            userActionsJson = "[]", workflowState = "RUNNING",
            activeStepsJson = "[]",
            startedAt = System.currentTimeMillis(),
            lastUpdatedAt = System.currentTimeMillis(),
        )
        dao.insertActive(active)

        dao.deleteLoaded("load-1")
        val result = dao.getAllActive()
        assertEquals(0, result.size)
    }
}
```

- [ ] **Step 2: Run instrumented tests on physical device**

Run: `cd engines/android-app && ./gradlew :app:connectedDebugAndroidTest`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add engines/android-app/app/src/androidTest/
git commit -m "test(android): add Room DAO instrumented tests"
```

---

## Phase 3: Engine Integration (Tasks 5-7)

### Task 5: FileProcessor — ZIP extraction and spec validation

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/util/FileProcessor.kt`
- Create: `engines/android-app/app/src/test/kotlin/com/trajectoryruntime/android/util/FileProcessorTest.kt`

- [ ] **Step 1: Write FileProcessor unit test**

```kotlin
package com.trajectoryruntime.android.util

import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TemporaryFolder
import kotlinx.serialization.json.Json
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class FileProcessorTest {
    @get:Rule
    val tempDir = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `detectFormat identifies ZIP files`() {
        val zipFile = tempDir.newFile("test.WFmasterX")
        ZipOutputStream(zipFile.outputStream()).use { zos ->
            zos.putNextEntry(ZipEntry("workflow.json"))
            zos.write("""{"local_id":"wf-1","oid":"oid-1","version":"1.0","last_modified_date":"2026-01-01","steps":[],"connections":[]}""".toByteArray())
            zos.closeEntry()
        }
        assertEquals(FileFormat.ZIP, FileProcessor.detectFormat(zipFile))
    }

    @Test
    fun `detectFormat identifies JSON files`() {
        val jsonFile = tempDir.newFile("test.json")
        jsonFile.writeText("""{"local_id":"wf-1"}""")
        assertEquals(FileFormat.JSON, FileProcessor.detectFormat(jsonFile))
    }

    @Test
    fun `extractZip extracts workflow json and media`() {
        val zipFile = tempDir.newFile("test.WFmasterX")
        val specJson = """{"local_id":"wf-1","oid":"oid-1","version":"1.0","last_modified_date":"2026-01-01","steps":[],"connections":[]}"""
        ZipOutputStream(zipFile.outputStream()).use { zos ->
            zos.putNextEntry(ZipEntry("workflow.json"))
            zos.write(specJson.toByteArray())
            zos.closeEntry()
            zos.putNextEntry(ZipEntry("media/img-001-photo.jpg"))
            zos.write(byteArrayOf(0xFF.toByte(), 0xD8.toByte())) // JPEG magic
            zos.closeEntry()
        }

        val outputDir = tempDir.newFolder("output")
        val result = FileProcessor.extractZip(zipFile, outputDir)
        assertTrue(result.specFile.exists())
        assertEquals(1, result.mediaMap.size)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engines/android-app && ./gradlew :app:testDebugUnitTest --tests "com.trajectoryruntime.android.util.FileProcessorTest"`
Expected: FAIL — FileProcessor class not found

- [ ] **Step 3: Implement FileProcessor**

```kotlin
package com.trajectoryruntime.android.util

import android.content.Context
import android.net.Uri
import com.trajectoryruntime.engine.MasterWorkflowSpecification
import com.trajectoryruntime.engine.Validator
import com.trajectoryruntime.engine.ValidationResult
import kotlinx.serialization.json.Json
import java.io.File
import java.io.InputStream
import java.util.UUID
import java.util.zip.ZipInputStream

enum class FileFormat { ZIP, JSON }

data class ExtractResult(
    val specFile: File,
    val mediaMap: Map<String, String>, // key -> absolute file path
)

data class ProcessResult(
    val spec: MasterWorkflowSpecification,
    val mediaDir: String?,
    val mediaMap: Map<String, String>,
)

sealed class ProcessError {
    data class InvalidFormat(val message: String) : ProcessError()
    data class ValidationFailed(val code: String, val message: String) : ProcessError()
    data class ExtractionFailed(val cause: Throwable) : ProcessError()
}

object FileProcessor {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun detectFormat(file: File): FileFormat {
        val header = file.inputStream().use { it.readNBytes(4) }
        // ZIP magic: PK\x03\x04
        return if (header.size >= 4 && header[0] == 0x50.toByte() && header[1] == 0x4B.toByte()
            && header[2] == 0x03.toByte() && header[3] == 0x04.toByte()
        ) FileFormat.ZIP else FileFormat.JSON
    }

    fun extractZip(zipFile: File, outputDir: File): ExtractResult {
        val mediaMap = mutableMapOf<String, String>()
        var specFile: File? = null

        ZipInputStream(zipFile.inputStream()).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                if (!entry.isDirectory) {
                    val name = entry.name
                    val outFile = File(outputDir, name)
                    outFile.parentFile?.mkdirs()
                    outFile.outputStream().use { zis.copyTo(it) }

                    if (name.endsWith(".json") && (name == "workflow.json" || specFile == null)) {
                        specFile = outFile
                    } else {
                        // Build media map key: filename without path
                        val key = name.substringAfterLast("/")
                        mediaMap[key] = outFile.absolutePath
                    }
                }
                entry = zis.nextEntry
            }
        }

        return ExtractResult(
            specFile = specFile ?: throw IllegalStateException("No workflow.json found in ZIP"),
            mediaMap = mediaMap,
        )
    }

    fun processFile(
        context: Context,
        uri: Uri,
        workflowsDir: File,
    ): Result<ProcessResult> = runCatching {
        val workflowId = UUID.randomUUID().toString()
        val workflowDir = File(workflowsDir, workflowId)
        workflowDir.mkdirs()

        // Copy URI to temp file
        val tempFile = File(workflowDir, "source")
        context.contentResolver.openInputStream(uri)?.use { input ->
            tempFile.outputStream().use { output -> input.copyTo(output) }
        } ?: throw IllegalStateException("Cannot open URI: $uri")

        val format = detectFormat(tempFile)
        val specJson: String
        val mediaMap: Map<String, String>

        when (format) {
            FileFormat.ZIP -> {
                val mediaDir = File(workflowDir, "media")
                mediaDir.mkdirs()
                val result = extractZip(tempFile, workflowDir)
                specJson = result.specFile.readText()
                mediaMap = result.mediaMap
            }
            FileFormat.JSON -> {
                specJson = tempFile.readText()
                mediaMap = emptyMap()
            }
        }

        // Save spec
        File(workflowDir, "spec.json").writeText(specJson)
        tempFile.delete()

        // Parse and validate
        val spec = json.decodeFromString<MasterWorkflowSpecification>(specJson)

        // Validate via KMP engine Validator
        val specMap = json.decodeFromString<Map<String, Any?>>(specJson)
        val validation = Validator().validate(specMap)
        if (!validation.valid) {
            throw IllegalArgumentException(
                "Workflow validation failed: ${validation.error_code} - ${validation.error_message}"
            )
        }

        ProcessResult(
            spec = spec,
            mediaDir = workflowDir.absolutePath,
            mediaMap = mediaMap,
        )
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cd engines/android-app && ./gradlew :app:testDebugUnitTest --tests "com.trajectoryruntime.android.util.FileProcessorTest"`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/util/FileProcessor.kt
git add engines/android-app/app/src/test/kotlin/com/trajectoryruntime/android/util/FileProcessorTest.kt
git commit -m "feat(android): add FileProcessor for ZIP extraction and JSON loading"
```

---

### Task 6: WorkflowCoordinator — engine wrapper with StateFlow

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/coordinator/WorkflowCoordinator.kt`
- Create: `engines/android-app/app/src/test/kotlin/com/trajectoryruntime/android/coordinator/WorkflowCoordinatorTest.kt`

- [ ] **Step 1: Write coordinator test**

```kotlin
package com.trajectoryruntime.android.coordinator

import com.trajectoryruntime.engine.*
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class WorkflowCoordinatorTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun minimalSpec(): MasterWorkflowSpecification {
        val specJson = """
        {
            "local_id": "test-wf", "oid": "oid-1", "version": "1.0",
            "last_modified_date": "2026-01-01",
            "steps": [
                {"local_id": "start", "oid": "s1", "version": "1.0", "last_modified_date": "2026-01-01", "step_type": "START"},
                {"local_id": "end", "oid": "s2", "version": "1.0", "last_modified_date": "2026-01-01", "step_type": "END"}
            ],
            "connections": [{"from_step_id": "s1", "to_step_id": "s2"}]
        }
        """.trimIndent()
        return json.decodeFromString(specJson)
    }

    @Test
    fun `loadAndStart transitions to COMPLETED for start-end workflow`() = runTest {
        val coordinator = WorkflowCoordinator()
        coordinator.loadAndStart(minimalSpec())
        val state = coordinator.state.value
        assertEquals(WorkflowState.COMPLETED, state.workflowState)
    }

    @Test
    fun `initial state is IDLE`() {
        val coordinator = WorkflowCoordinator()
        assertEquals(WorkflowState.IDLE, coordinator.state.value.workflowState)
    }

    @Test
    fun `getUserActions returns empty for no interactions`() = runTest {
        val coordinator = WorkflowCoordinator()
        coordinator.loadAndStart(minimalSpec())
        assertTrue(coordinator.getUserActions().isEmpty())
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engines/android-app && ./gradlew :app:testDebugUnitTest --tests "com.trajectoryruntime.android.coordinator.WorkflowCoordinatorTest"`
Expected: FAIL

- [ ] **Step 3: Implement WorkflowCoordinator**

```kotlin
package com.trajectoryruntime.android.coordinator

import com.trajectoryruntime.engine.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString

data class CoordinatorState(
    val workflowState: WorkflowState = WorkflowState.IDLE,
    val activeSteps: List<ActiveStepInfo> = emptyList(),
    val trace: List<TraceEntry> = emptyList(),
    val properties: Map<String, String> = emptyMap(),
    val inputParameters: Map<String, String> = emptyMap(),
    val stepParams: Map<String, StepParameterSnapshot> = emptyMap(),
    val mediaMap: Map<String, String> = emptyMap(),
    val error: String? = null,
)

class WorkflowCoordinator {
    private var engine: WorkflowEngine? = null
    private var spec: MasterWorkflowSpecification? = null
    private var _mediaMap: Map<String, String> = emptyMap()
    private val _userActions = mutableListOf<UserAction>()
    private var actionIndex = 0

    private val _state = MutableStateFlow(CoordinatorState())
    val state: StateFlow<CoordinatorState> = _state.asStateFlow()

    fun loadAndStart(
        spec: MasterWorkflowSpecification,
        setup: TestFixtureSetup? = null,
        mediaMap: Map<String, String> = emptyMap(),
    ) {
        this.spec = spec
        this._mediaMap = mediaMap
        this._userActions.clear()
        this.actionIndex = 0
        engine = WorkflowEngine(spec, setup)
        engine!!.start()
        sync()
    }

    fun submitAction(action: UserAction) {
        val eng = engine ?: return
        _userActions.add(action)
        actionIndex++
        eng.submitAction(action, actionIndex)
        sync()
    }

    fun getSpec(): MasterWorkflowSpecification? = spec

    fun getUserActions(): List<UserAction> = _userActions.toList()

    fun reset() {
        engine = null
        spec = null
        _mediaMap = emptyMap()
        _userActions.clear()
        actionIndex = 0
        _state.value = CoordinatorState()
    }

    fun restart() {
        val s = spec ?: return
        loadAndStart(s, mediaMap = _mediaMap)
    }

    // Note: pauseAll()/resumeAll() are not yet available in the KMP engine.
    // These will be added in a future version if needed.

    private fun sync() {
        val eng = engine ?: return
        _state.value = CoordinatorState(
            workflowState = eng.getWorkflowState(),
            activeSteps = eng.getActiveSteps(),
            trace = eng.getTrace(),
            properties = eng.getProperties(),
            inputParameters = eng.getActiveInputParameters(),
            stepParams = eng.getStepParameterSnapshots(),
            mediaMap = _mediaMap,
        )
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cd engines/android-app && ./gradlew :app:testDebugUnitTest --tests "com.trajectoryruntime.android.coordinator.WorkflowCoordinatorTest"`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/coordinator/
git add engines/android-app/app/src/test/kotlin/com/trajectoryruntime/android/coordinator/
git commit -m "feat(android): add WorkflowCoordinator with StateFlow"
```

---

### Task 7: WorkflowManager — lifecycle with Room persistence

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/manager/WorkflowManager.kt`
- Create: `engines/android-app/app/src/test/kotlin/com/trajectoryruntime/android/manager/WorkflowManagerTest.kt`

- [ ] **Step 1: Write manager test (core lifecycle)**

```kotlin
package com.trajectoryruntime.android.manager

import com.trajectoryruntime.engine.MasterWorkflowSpecification
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class WorkflowManagerTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun startEndSpec(): MasterWorkflowSpecification {
        return json.decodeFromString("""
        {
            "local_id": "test-wf", "oid": "oid-1", "version": "1.0",
            "last_modified_date": "2026-01-01",
            "steps": [
                {"local_id": "start", "oid": "s1", "version": "1.0", "last_modified_date": "2026-01-01", "step_type": "START"},
                {"local_id": "end", "oid": "s2", "version": "1.0", "last_modified_date": "2026-01-01", "step_type": "END"}
            ],
            "connections": [{"from_step_id": "s1", "to_step_id": "s2"}]
        }
        """.trimIndent())
    }

    @Test
    fun `addWorkflow adds to loaded list`() {
        val manager = WorkflowManager(dao = null) // null DAO for unit tests
        val result = manager.addWorkflow(startEndSpec(), emptyMap())
        assertTrue(result is AddResult.Success)
        assertEquals(1, manager.state.value.loaded.size)
    }

    @Test
    fun `addWorkflow detects duplicates by specOid`() {
        val manager = WorkflowManager(dao = null)
        manager.addWorkflow(startEndSpec(), emptyMap())
        val result = manager.addWorkflow(startEndSpec(), emptyMap())
        assertTrue(result is AddResult.Duplicate)
    }

    @Test
    fun `startWorkflow moves from loaded to active`() {
        val manager = WorkflowManager(dao = null)
        val addResult = manager.addWorkflow(startEndSpec(), emptyMap()) as AddResult.Success
        val instanceId = manager.startWorkflow(addResult.id)
        assertNotNull(instanceId)
        assertEquals(1, manager.state.value.active.size)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd engines/android-app && ./gradlew :app:testDebugUnitTest --tests "com.trajectoryruntime.android.manager.WorkflowManagerTest"`
Expected: FAIL

- [ ] **Step 3: Implement WorkflowManager**

```kotlin
package com.trajectoryruntime.android.manager

import com.trajectoryruntime.android.coordinator.WorkflowCoordinator
import com.trajectoryruntime.android.coordinator.CoordinatorState
import com.trajectoryruntime.android.storage.WorkflowDao
import com.trajectoryruntime.android.storage.*
import com.trajectoryruntime.engine.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
// Uses: kotlinx.coroutines.flow.debounce for snapshot throttling
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import java.util.UUID

data class LoadedWorkflow(
    val id: String,
    val specOid: String,
    val localId: String,
    val version: String,
    val name: String,
    val spec: MasterWorkflowSpecification,
    val mediaMap: Map<String, String>,
    val mediaDir: String?,
    val loadedAt: Long,
)

data class ActiveWorkflow(
    val id: String,
    val sourceLoadedId: String,
    val name: String,
    val localId: String,
    val version: String,
    val coordinator: WorkflowCoordinator,
    val startedAt: Long,
)

data class CompletedWorkflow(
    val id: String,
    val localId: String,
    val version: String,
    val name: String,
    val workflowState: String,
    val startedAt: Long,
    val finishedAt: Long,
    val traceJson: String,
    val propertiesJson: String,
    val specJson: String,
)

data class ManagerState(
    val loaded: List<LoadedWorkflow> = emptyList(),
    val active: List<ActiveWorkflow> = emptyList(),
    val completed: List<CompletedWorkflow> = emptyList(),
    val focusedActiveId: String? = null,
)

sealed class AddResult {
    data class Success(val id: String) : AddResult()
    data class Duplicate(val existingId: String) : AddResult()
}

class WorkflowManager(
    private val dao: WorkflowDao?,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main),
) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val _state = MutableStateFlow(ManagerState())
    val state: StateFlow<ManagerState> = _state.asStateFlow()

    private val coordinatorJobs = mutableMapOf<String, Job>()

    fun addWorkflow(
        spec: MasterWorkflowSpecification,
        mediaMap: Map<String, String>,
        mediaDir: String? = null,
    ): AddResult {
        val existing = _state.value.loaded.find { it.specOid == spec.oid }
        if (existing != null) return AddResult.Duplicate(existing.id)

        val id = UUID.randomUUID().toString()
        val loaded = LoadedWorkflow(
            id = id, specOid = spec.oid, localId = spec.local_id,
            version = spec.version, name = spec.description ?: spec.local_id,
            spec = spec, mediaMap = mediaMap, mediaDir = mediaDir,
            loadedAt = System.currentTimeMillis(),
        )

        _state.update { it.copy(loaded = it.loaded + loaded) }

        dao?.let { d ->
            scope.launch(Dispatchers.IO) {
                d.insertLoaded(LoadedWorkflowEntity(
                    id = id, localId = spec.local_id, version = spec.version,
                    name = loaded.name, specOid = spec.oid,
                    specJson = json.encodeToString(spec),
                    mediaDir = mediaDir,
                    mediaMapJson = json.encodeToString(mediaMap),
                    loadedAt = loaded.loadedAt,
                ))
            }
        }

        return AddResult.Success(id)
    }

    fun startWorkflow(loadedId: String): String? {
        val loaded = _state.value.loaded.find { it.id == loadedId } ?: return null
        val instanceId = UUID.randomUUID().toString()
        val coordinator = WorkflowCoordinator()

        val active = ActiveWorkflow(
            id = instanceId, sourceLoadedId = loaded.id,
            name = loaded.name, localId = loaded.localId,
            version = loaded.version, coordinator = coordinator,
            startedAt = System.currentTimeMillis(),
        )

        _state.update { it.copy(
            active = it.active + active,
            focusedActiveId = instanceId,
        ) }

        // Persist active to Room BEFORE starting
        dao?.let { d ->
            scope.launch(Dispatchers.IO) {
                d.insertActive(ActiveWorkflowEntity(
                    id = instanceId, loadedWorkflowId = loaded.id,
                    traceJson = "[]", propertiesJson = "{}",
                    userActionsJson = "[]", workflowState = "RUNNING",
                    activeStepsJson = "[]",
                    startedAt = active.startedAt,
                    lastUpdatedAt = active.startedAt,
                ))
            }
        }

        // Start engine FIRST (synchronous — state settles immediately)
        coordinator.loadAndStart(loaded.spec, mediaMap = loaded.mediaMap)

        // THEN set up watchers (avoids race with synchronous completion)
        // Check if already completed (e.g., START→END workflow)
        val currentState = coordinator.state.value.workflowState
        if (currentState in setOf(
            WorkflowState.COMPLETED, WorkflowState.ABORTED,
            WorkflowState.STOPPED, WorkflowState.ERRORED,
        )) {
            completeWorkflow(instanceId, coordinator.state.value)
            return instanceId
        }

        // Watch for future completion
        val job = scope.launch {
            coordinator.state.collect { coordState ->
                if (coordState.workflowState in setOf(
                    WorkflowState.COMPLETED, WorkflowState.ABORTED,
                    WorkflowState.STOPPED, WorkflowState.ERRORED,
                )) {
                    completeWorkflow(instanceId, coordState)
                    cancel()
                }
            }
        }
        coordinatorJobs[instanceId] = job

        // Persist snapshots on state changes (debounced)
        val snapshotJob = scope.launch {
            coordinator.state
                .debounce(300) // Debounce: only persist after 300ms of no changes
                .collect { coordState ->
                    persistActiveSnapshot(instanceId, coordinator, coordState)
                }
        }
        coordinatorJobs["${instanceId}-snapshot"] = snapshotJob

        return instanceId
    }

    fun removeLoadedWorkflow(id: String) {
        _state.update { it.copy(loaded = it.loaded.filter { w -> w.id != id }) }
        dao?.let { d -> scope.launch(Dispatchers.IO) { d.deleteLoaded(id) } }
    }

    fun removeCompletedWorkflow(id: String) {
        _state.update { it.copy(completed = it.completed.filter { w -> w.id != id }) }
        dao?.let { d -> scope.launch(Dispatchers.IO) { d.deleteCompleted(id) } }
    }

    fun focusWorkflow(id: String) {
        _state.update { it.copy(focusedActiveId = id) }
    }

    fun getCoordinator(activeId: String): WorkflowCoordinator? {
        return _state.value.active.find { it.id == activeId }?.coordinator
    }

    private fun completeWorkflow(instanceId: String, finalState: CoordinatorState) {
        val active = _state.value.active.find { it.id == instanceId } ?: return

        coordinatorJobs.remove(instanceId)?.cancel()
        coordinatorJobs.remove("${instanceId}-snapshot")?.cancel()

        val completed = CompletedWorkflow(
            id = instanceId, localId = active.localId,
            version = active.version, name = active.name,
            workflowState = finalState.workflowState.name,
            startedAt = active.startedAt,
            finishedAt = System.currentTimeMillis(),
            traceJson = json.encodeToString(finalState.trace),
            propertiesJson = json.encodeToString(finalState.properties),
            specJson = json.encodeToString(active.coordinator.getSpec()),
        )

        _state.update { current ->
            current.copy(
                active = current.active.filter { it.id != instanceId },
                completed = listOf(completed) + current.completed,
                focusedActiveId = if (current.focusedActiveId == instanceId) {
                    current.active.firstOrNull { it.id != instanceId }?.id
                } else current.focusedActiveId,
            )
        }

        active.coordinator.reset()

        dao?.let { d ->
            scope.launch(Dispatchers.IO) {
                d.deleteActive(instanceId)
                d.insertCompleted(CompletedWorkflowEntity(
                    id = completed.id, localId = completed.localId,
                    version = completed.version, name = completed.name,
                    specJson = completed.specJson,
                    traceJson = completed.traceJson,
                    propertiesJson = completed.propertiesJson,
                    workflowState = completed.workflowState,
                    startedAt = completed.startedAt,
                    finishedAt = completed.finishedAt,
                ))
            }
        }
    }

    private suspend fun persistActiveSnapshot(
        instanceId: String,
        coordinator: WorkflowCoordinator,
        coordState: CoordinatorState,
    ) {
        dao?.let { d ->
            withContext(Dispatchers.IO) {
                d.updateActive(ActiveWorkflowEntity(
                    id = instanceId,
                    loadedWorkflowId = _state.value.active.find { it.id == instanceId }?.sourceLoadedId ?: return@withContext,
                    traceJson = json.encodeToString(coordState.trace),
                    propertiesJson = json.encodeToString(coordState.properties),
                    userActionsJson = json.encodeToString(coordinator.getUserActions()),
                    workflowState = coordState.workflowState.name,
                    activeStepsJson = json.encodeToString(coordState.activeSteps.map {
                        mapOf("oid" to it.step.oid, "stepType" to it.step.stepType, "label" to (it.step.step.description ?: it.step.stepType))
                    }),
                    startedAt = _state.value.active.find { it.id == instanceId }?.startedAt ?: 0L,
                    lastUpdatedAt = System.currentTimeMillis(),
                ))
            }
        }
    }

    suspend fun resumeFromDatabase() {
        val d = dao ?: return
        withContext(Dispatchers.IO) {
            // Restore loaded workflows
            val loadedEntities = d.observeLoaded().first()
            val loadedList = loadedEntities.mapNotNull { entity ->
                try {
                    val spec = json.decodeFromString<MasterWorkflowSpecification>(entity.specJson)
                    val mediaMap: Map<String, String> = entity.mediaMapJson?.let {
                        json.decodeFromString(it)
                    } ?: emptyMap()
                    LoadedWorkflow(
                        id = entity.id, specOid = entity.specOid,
                        localId = entity.localId, version = entity.version,
                        name = entity.name, spec = spec, mediaMap = mediaMap,
                        mediaDir = entity.mediaDir, loadedAt = entity.loadedAt,
                    )
                } catch (e: Exception) {
                    android.util.Log.e("WorkflowManager", "Failed to restore loaded workflow ${entity.id}", e)
                    null
                }
            }

            // Restore active workflows via replay
            val activeEntities = d.getAllActive()
            val activeList = activeEntities.mapNotNull { entity ->
                try {
                    val loaded = loadedList.find { it.id == entity.loadedWorkflowId } ?: return@mapNotNull null
                    val coordinator = WorkflowCoordinator()
                    val userActions: List<UserAction> = json.decodeFromString(entity.userActionsJson)

                    // Replay: create engine, start, replay user actions
                    coordinator.loadAndStart(loaded.spec, mediaMap = loaded.mediaMap)
                    for (action in userActions) {
                        coordinator.submitAction(action)
                    }

                    ActiveWorkflow(
                        id = entity.id, sourceLoadedId = entity.loadedWorkflowId,
                        name = loaded.name, localId = loaded.localId,
                        version = loaded.version, coordinator = coordinator,
                        startedAt = entity.startedAt,
                    )
                } catch (e: Exception) {
                    android.util.Log.e("WorkflowManager", "Failed to restore active workflow ${entity.id}", e)
                    // Clean up failed active workflow from DB
                    d.deleteActive(entity.id)
                    null
                }
            }

            // Restore completed
            val completedEntities = d.observeCompleted().first()
            val completedList = completedEntities.map { entity ->
                CompletedWorkflow(
                    id = entity.id, localId = entity.localId,
                    version = entity.version, name = entity.name,
                    workflowState = entity.workflowState,
                    startedAt = entity.startedAt, finishedAt = entity.finishedAt,
                    traceJson = entity.traceJson,
                    propertiesJson = entity.propertiesJson,
                    specJson = entity.specJson,
                )
            }

            withContext(Dispatchers.Main) {
                _state.value = ManagerState(
                    loaded = loadedList,
                    active = activeList,
                    completed = completedList,
                    focusedActiveId = activeList.firstOrNull()?.id,
                )
            }
        }
    }
}
```

- [ ] **Step 4: Run tests**

Run: `cd engines/android-app && ./gradlew :app:testDebugUnitTest --tests "com.trajectoryruntime.android.manager.WorkflowManagerTest"`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/manager/
git add engines/android-app/app/src/test/kotlin/com/trajectoryruntime/android/manager/
git commit -m "feat(android): add WorkflowManager with Room persistence and resume"
```

---

## Phase 4: UI Foundation (Tasks 8-9)

### Task 8: Navigation shell with 5-tab bottom bar

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/navigation/AppNavigation.kt`
- Modify: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/MainActivity.kt`

- [ ] **Step 1: Create AppNavigation.kt**

```kotlin
package com.trajectoryruntime.android.ui.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*

enum class Screen(val route: String, val label: String, val icon: ImageVector) {
    Home("home", "Home", Icons.Default.Home),
    Active("active", "Active", Icons.Default.PlayArrow),
    Overview("overview", "Overview", Icons.Default.AccountTree),
    History("history", "History", Icons.Default.History),
    Settings("settings", "Settings", Icons.Default.Settings),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppNavigation(
    homeScreen: @Composable () -> Unit,
    activeScreen: @Composable () -> Unit,
    overviewScreen: @Composable () -> Unit,
    historyScreen: @Composable () -> Unit,
    settingsScreen: @Composable () -> Unit,
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
                Screen.entries.forEach { screen ->
                    NavigationBarItem(
                        icon = { Icon(screen.icon, contentDescription = screen.label) },
                        label = { Text(screen.label) },
                        selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                        onClick = {
                            navController.navigate(screen.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Screen.Home.route) { homeScreen() }
            composable(Screen.Active.route) { activeScreen() }
            composable(Screen.Overview.route) { overviewScreen() }
            composable(Screen.History.route) { historyScreen() }
            composable(Screen.Settings.route) { settingsScreen() }
        }
    }
}
```

- [ ] **Step 2: Update MainActivity.kt to use navigation**

```kotlin
package com.trajectoryruntime.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.Text
import com.trajectoryruntime.android.ui.navigation.AppNavigation
import com.trajectoryruntime.android.ui.theme.TrajectoryRuntimeTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TrajectoryRuntimeTheme {
                AppNavigation(
                    homeScreen = { Text("Home") },
                    activeScreen = { Text("Active") },
                    overviewScreen = { Text("Overview") },
                    historyScreen = { Text("History") },
                    settingsScreen = { Text("Settings") },
                )
            }
        }
    }
}
```

- [ ] **Step 3: Build and test on device**

Run: `cd engines/android-app && ./gradlew :app:installDebug`
Expected: App shows 5-tab bottom bar, tapping tabs switches between placeholder screens.

- [ ] **Step 4: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/
git commit -m "feat(android): add 5-tab bottom navigation shell"
```

---

### Task 9: Element registry and all 11 form elements

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/elements/ElementProps.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/elements/ElementRegistry.kt`
- Create: 11 element files (one per type)
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/util/RtfRenderer.kt`

- [ ] **Step 1: Create ElementProps.kt**

```kotlin
package com.trajectoryruntime.android.ui.elements

import kotlinx.serialization.json.JsonElement

data class ElementProps(
    val element: JsonObject,  // JsonObject implements Map<String, JsonElement>
    val formValues: Map<String, Any?>,
    val onFormChange: (fieldName: String, value: Any?) -> Unit,
    val onButtonPress: (outputValue: String) -> Unit,
    val properties: Map<String, String>,
    val inputParameters: Map<String, String>,
    val mediaMap: Map<String, String>,
)
```

- [ ] **Step 2: Create ElementRegistry.kt**

```kotlin
package com.trajectoryruntime.android.ui.elements

import androidx.compose.runtime.Composable

typealias ElementComposable = @Composable (ElementProps) -> Unit

object ElementRegistry {
    private val registry = mutableMapOf<String, ElementComposable>()

    fun register(type: String, composable: ElementComposable) {
        registry[type] = composable
    }

    fun get(type: String): ElementComposable? = registry[type]

    fun registerDefaults() {
        register("textInput") { TextInputElement(it) }
        register("textarea") { TextareaElement(it) }
        register("checkbox") { CheckboxElement(it) }
        register("radio") { RadioElement(it) }
        register("button") { ButtonElement(it) }
        register("timer") { TimerElement(it) }
        register("header") { HeaderElement(it) }
        register("text") { TextElement(it) }
        register("image") { ImageElement(it) }
        register("video") { VideoElement(it) }
        register("divider") { DividerElement(it) }
    }
}
```

- [ ] **Step 3: Create RtfRenderer.kt**

```kotlin
package com.trajectoryruntime.android.util

import android.os.Build
import android.text.Html
import android.text.Spanned
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import android.text.style.*

fun htmlToAnnotatedString(html: String): AnnotatedString {
    val spanned: Spanned = Html.fromHtml(html, Html.FROM_HTML_MODE_COMPACT)
    return buildAnnotatedString {
        append(spanned.toString())
        spanned.getSpans(0, spanned.length, Any::class.java).forEach { span ->
            val start = spanned.getSpanStart(span)
            val end = spanned.getSpanEnd(span)
            when (span) {
                is StyleSpan -> when (span.style) {
                    android.graphics.Typeface.BOLD -> addStyle(SpanStyle(fontWeight = FontWeight.Bold), start, end)
                    android.graphics.Typeface.ITALIC -> addStyle(SpanStyle(fontStyle = FontStyle.Italic), start, end)
                    android.graphics.Typeface.BOLD_ITALIC -> addStyle(
                        SpanStyle(fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic), start, end
                    )
                }
                is UnderlineSpan -> addStyle(SpanStyle(textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline), start, end)
            }
        }
    }
}

fun substituteChips(content: String, properties: Map<String, String>, inputParameters: Map<String, String>): String {
    var result = content
    val chipPattern = Regex("""\{\{(property|parameter):([^}]+)\}\}""")
    result = chipPattern.replace(result) { match ->
        val type = match.groupValues[1]
        val key = match.groupValues[2]
        when (type) {
            "property" -> properties[key] ?: match.value
            "parameter" -> inputParameters[key] ?: match.value
            else -> match.value
        }
    }
    return result
}
```

- [ ] **Step 4: Create all 11 element composables**

Create each file in `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/elements/`. Each element extracts its config from `props.element` (a `Map<String, JsonElement>`) using kotlinx.serialization JSON helpers.

Key elements (abbreviated — full implementations for each):

**TextInputElement.kt:**
```kotlin
package com.trajectoryruntime.android.ui.elements

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kotlinx.serialization.json.*

@Composable
fun TextInputElement(props: ElementProps) {
    val el = props.element
    val fieldName = el["fieldName"]?.jsonPrimitive?.content ?: return
    val label = el["label"]?.jsonPrimitive?.contentOrNull
    val placeholder = el["placeholder"]?.jsonPrimitive?.contentOrNull
    val value = (props.formValues[fieldName] as? String) ?: ""

    OutlinedTextField(
        value = value,
        onValueChange = { props.onFormChange(fieldName, it) },
        label = label?.let { { Text(it) } },
        placeholder = placeholder?.let { { Text(it) } },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
}
```

**TextareaElement.kt:** Same as TextInputElement but with `singleLine = false` and `minLines` from `rows` config.

**CheckboxElement.kt:**
```kotlin
package com.trajectoryruntime.android.ui.elements

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.*

@Composable
fun CheckboxElement(props: ElementProps) {
    val el = props.element
    val fieldName = el["fieldName"]?.jsonPrimitive?.content ?: return
    val label = el["label"]?.jsonPrimitive?.contentOrNull
    val options = el["options"]?.jsonArray ?: return
    val selected = (props.formValues[fieldName] as? List<*>)?.filterIsInstance<String>() ?: emptyList()

    Column {
        if (label != null) Text(label, style = MaterialTheme.typography.labelLarge)
        options.forEach { opt ->
            val (optLabel, optValue) = parseOption(opt)
            Row(
                modifier = Modifier.fillMaxWidth().clickable {
                    val next = if (optValue in selected) selected - optValue else selected + optValue
                    props.onFormChange(fieldName, next)
                }.padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(checked = optValue in selected, onCheckedChange = null)
                Spacer(Modifier.width(8.dp))
                Text(optLabel)
            }
        }
    }
}

internal fun parseOption(opt: JsonElement): Pair<String, String> {
    return when {
        opt is JsonPrimitive -> opt.content to opt.content
        opt is JsonObject -> {
            val label = opt["label"]?.jsonPrimitive?.content ?: ""
            val value = opt["value"]?.jsonPrimitive?.content ?: label
            label to value
        }
        else -> "" to ""
    }
}
```

**RadioElement.kt:** Similar to CheckboxElement but with `RadioButton` and single selection.

**ButtonElement.kt:**
```kotlin
package com.trajectoryruntime.android.ui.elements

import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import kotlinx.serialization.json.*

@Composable
fun ButtonElement(props: ElementProps) {
    val el = props.element
    val label = el["label"]?.jsonPrimitive?.content ?: "Button"
    val outputValue = el["outputValue"]?.jsonPrimitive?.content ?: ""

    Button(onClick = { props.onButtonPress(outputValue) }) {
        Text(label)
    }
}
```

**TimerElement.kt:** Countdown/countup with `LaunchedEffect` + `delay(1000)` loop, circular progress indicator.

**HeaderElement.kt / TextElement.kt:** Parse `content.content` HTML, run chip substitution, render via `htmlToAnnotatedString()`.

**ImageElement.kt:** Use Coil `AsyncImage` with `model` resolved from mediaMap.

**VideoElement.kt:** Use Media3 ExoPlayer via `AndroidView` wrapping `PlayerView`.

**DividerElement.kt:** `HorizontalDivider` with thickness and color from config.

- [ ] **Step 5: Register elements in TrajectoryRuntimeApp.kt**

Add to `TrajectoryRuntimeApp.onCreate()`:
```kotlin
override fun onCreate() {
    super.onCreate()
    ElementRegistry.registerDefaults()
}
```

- [ ] **Step 6: Build to verify all elements compile**

Run: `cd engines/android-app && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 7: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/elements/
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/util/RtfRenderer.kt
git commit -m "feat(android): add element registry with all 11 form element types"
```

---

## Phase 5: Core Components (Tasks 10-12)

### Task 10: FormRenderer with adaptive phone/tablet layout

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/components/FormRenderer.kt`

- [ ] **Step 1: Implement FormRenderer**

```kotlin
package com.trajectoryruntime.android.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.*
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.trajectoryruntime.android.ui.elements.*
import kotlinx.serialization.json.*

@Composable
fun FormRenderer(
    layouts: JsonElement?,
    formValues: Map<String, Any?>,
    onFormChange: (String, Any?) -> Unit,
    onButtonPress: (String) -> Unit,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
    mediaMap: Map<String, String>,
    isCompact: Boolean, // true = phone, false = tablet
) {
    if (layouts == null) return

    val layoutArray = when {
        layouts is JsonArray -> layouts
        layouts is JsonObject -> JsonArray(listOf(layouts))
        else -> return
    }

    val layout = pickLayout(layoutArray, isCompact)
    val elements = layout?.get("elements")?.jsonArray ?: return

    if (isCompact) {
        PhoneLayout(elements, formValues, onFormChange, onButtonPress, properties, inputParameters, mediaMap)
    } else {
        TabletLayout(elements, layout, formValues, onFormChange, onButtonPress, properties, inputParameters, mediaMap)
    }
}

private fun pickLayout(layouts: JsonArray, isCompact: Boolean): JsonObject? {
    val targetType = if (isCompact) "phone" else "tablet"
    // Try exact match first
    val match = layouts.firstOrNull {
        it.jsonObject["deviceType"]?.jsonPrimitive?.contentOrNull == targetType
    }?.jsonObject
    if (match != null) return match
    // Fallback: desktop for tablet, or first available
    if (!isCompact) {
        val desktop = layouts.firstOrNull {
            it.jsonObject["deviceType"]?.jsonPrimitive?.contentOrNull == "desktop"
        }?.jsonObject
        if (desktop != null) return desktop
    }
    return layouts.firstOrNull()?.jsonObject
}

@Composable
private fun PhoneLayout(
    elements: JsonArray,
    formValues: Map<String, Any?>,
    onFormChange: (String, Any?) -> Unit,
    onButtonPress: (String) -> Unit,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
    mediaMap: Map<String, String>,
) {
    val sorted = elements.sortedBy {
        it.jsonObject["y"]?.jsonPrimitive?.doubleOrNull ?: 0.0
    }
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        sorted.forEachIndexed { index, el ->
            val obj = el.jsonObject
            val type = obj["type"]?.jsonPrimitive?.contentOrNull ?: return@forEachIndexed
            val composable = ElementRegistry.get(type) ?: return@forEachIndexed
            val props = ElementProps(
                element = obj,
                formValues = formValues,
                onFormChange = onFormChange,
                onButtonPress = onButtonPress,
                properties = properties,
                inputParameters = inputParameters,
                mediaMap = mediaMap,
            )
            composable(props)
        }
    }
}

@Composable
private fun TabletLayout(
    elements: JsonArray,
    layout: JsonObject,
    formValues: Map<String, Any?>,
    onFormChange: (String, Any?) -> Unit,
    onButtonPress: (String) -> Unit,
    properties: Map<String, String>,
    inputParameters: Map<String, String>,
    mediaMap: Map<String, String>,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val containerWidth = constraints.maxWidth.toFloat()
        val canvasWidth = layout["canvasWidth"]?.jsonPrimitive?.floatOrNull ?: 800f
        val contentBottom = elements.maxOfOrNull {
            val y = it.jsonObject["y"]?.jsonPrimitive?.floatOrNull ?: 0f
            val h = it.jsonObject["height"]?.jsonPrimitive?.floatOrNull ?: 0f
            y + h
        } ?: 400f
        val effectiveWidth = maxOf(
            canvasWidth,
            elements.maxOfOrNull {
                val x = it.jsonObject["x"]?.jsonPrimitive?.floatOrNull ?: 0f
                val w = it.jsonObject["width"]?.jsonPrimitive?.floatOrNull ?: 0f
                x + w
            } ?: canvasWidth
        ) + 16f
        val scale = containerWidth / effectiveWidth
        val density = LocalDensity.current

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(with(density) { (contentBottom * scale + 16).toDp() })
        ) {
            elements.forEach { el ->
                val obj = el.jsonObject
                val type = obj["type"]?.jsonPrimitive?.contentOrNull ?: return@forEach
                val composable = ElementRegistry.get(type) ?: return@forEach
                val x = (obj["x"]?.jsonPrimitive?.floatOrNull ?: 0f) * scale
                val y = (obj["y"]?.jsonPrimitive?.floatOrNull ?: 0f) * scale
                val w = (obj["width"]?.jsonPrimitive?.floatOrNull ?: 100f) * scale
                val h = (obj["height"]?.jsonPrimitive?.floatOrNull ?: 40f) * scale

                Box(
                    modifier = Modifier
                        .offset(
                            x = with(density) { x.toDp() },
                            y = with(density) { y.toDp() },
                        )
                        .size(
                            width = with(density) { w.toDp() },
                            height = with(density) { h.toDp() },
                        )
                ) {
                    val props = ElementProps(
                        element = obj,
                        formValues = formValues,
                        onFormChange = onFormChange,
                        onButtonPress = onButtonPress,
                        properties = properties,
                        inputParameters = inputParameters,
                        mediaMap = mediaMap,
                    )
                    composable(props)
                }
            }
        }
    }
}
```

- [ ] **Step 2: Build to verify**

Run: `cd engines/android-app && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/components/FormRenderer.kt
git commit -m "feat(android): add FormRenderer with adaptive phone/tablet layout"
```

---

### Task 11: StepRenderer and ActiveStepCard

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/components/StepRenderer.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/components/ActiveStepCard.kt`

- [ ] **Step 1: Create StepRenderer.kt**

Dispatches to YES NO / USER INTERACTION rendering. YES NO shows two buttons (with custom labels from config) plus optional form elements. USER INTERACTION renders the full form via FormRenderer. Follows the web-ui's `StepRenderer.tsx` pattern including `computeInitialFormValues` for defaultSource resolution.

- [ ] **Step 2: Create ActiveStepCard.kt**

Renders a step card with state-based logic matching web-ui's `ActiveStepCard.tsx`:
- EXECUTING + interactive → StepRenderer
- WAITING/PAUSED + interactive → StepRenderer with disabled overlay + status banner
- Non-interactive states → info card with label, state, timestamp

Wrapped in a Material 3 `Card` composable.

- [ ] **Step 3: Build and verify**

Run: `cd engines/android-app && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/components/StepRenderer.kt
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/components/ActiveStepCard.kt
git commit -m "feat(android): add StepRenderer and ActiveStepCard components"
```

---

### Task 12: WorkflowCard component

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/components/WorkflowCard.kt`

- [ ] **Step 1: Create WorkflowCard.kt**

A reusable card for displaying loaded and active workflows on the Home screen. Shows workflow name, local ID, version, progress indicator (for active), and loaded timestamp. Supports swipe-to-dismiss for delete action.

Uses Material 3 `ElevatedCard`, `SwipeToDismissBox`, and `LinearProgressIndicator`.

- [ ] **Step 2: Build and commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/components/WorkflowCard.kt
git commit -m "feat(android): add WorkflowCard component"
```

---

## Phase 6: Screens (Tasks 13-17)

### Task 13: HomeScreen with file picker

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/HomeScreen.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/HomeViewModel.kt`

- [ ] **Step 1: Create HomeViewModel.kt**

Observes `WorkflowManager.state`, exposes loaded/active lists. Handles file loading via `FileProcessor`, calls `manager.addWorkflow()`. Exposes `startWorkflow()` and `removeLoadedWorkflow()` actions.

- [ ] **Step 2: Create HomeScreen.kt**

Two sections: "Loaded" (ready to start) and "Active" (in progress). FAB to open system file picker via `ActivityResultContracts.OpenDocument`. Each loaded workflow shows as a `WorkflowCard` with tap-to-start. Each active workflow shows progress. Swipe-to-delete on loaded workflows.

- [ ] **Step 3: Build and test on device**

Run: `cd engines/android-app && ./gradlew :app:installDebug`
Expected: Home screen shows, FAB opens file picker, loading a `.WFmasterX` file shows it in the loaded list.

- [ ] **Step 4: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/Home*
git commit -m "feat(android): add HomeScreen with file picker and workflow management"
```

---

### Task 14: ActiveScreen with adaptive layout

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/ActiveScreen.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/ActiveViewModel.kt`

- [ ] **Step 1: Create ActiveViewModel.kt**

Aggregates all active steps across all running workflows (mirroring web-ui's `useAllActiveSteps`). Exposes `flatActiveSteps: StateFlow<List<FlatActiveStep>>` where each entry carries workflowId, stepInfo, properties, inputParameters, mediaMap.

- [ ] **Step 2: Create ActiveScreen.kt**

Uses `WindowSizeClass` to pick layout:

**Phone (Compact):** `HorizontalPager` from Compose Foundation. Each page is an `ActiveStepCard`. Dot indicator at bottom. Swipe between active steps across all workflows.

**Tablet (Medium/Expanded):** Row with 280dp-wide step list on left, detail pane on right. `LazyColumn` for the list, `ActiveStepCard` in the detail pane. Tapping a list item updates the detail.

Steps grouped by workflow with a header showing workflow name.

- [ ] **Step 3: Build and test on both phone and tablet**

Run: `cd engines/android-app && ./gradlew :app:installDebug`
Expected: Phone shows swipe pager, tablet shows list+detail. Start a workflow from Home, navigate to Active, see the step forms.

- [ ] **Step 4: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/Active*
git commit -m "feat(android): add ActiveScreen with adaptive phone/tablet layout"
```

---

### Task 15: OverviewScreen with Canvas-based graph

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/components/WorkflowGraph.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/OverviewScreen.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/OverviewViewModel.kt`

- [ ] **Step 1: Create WorkflowGraph.kt**

Compose Canvas implementation of the web-ui's SVG graph. Draws:
- Rectangular nodes for most step types
- Diamond nodes for PARALLEL, WAIT ALL, WAIT ANY, SELECT 1
- Orthogonal edge paths between nodes
- Color-coded by step state (completed=green, executing=blue, waiting=light blue, paused=yellow, errored=red, idle=gray)

Supports `transformable` modifier for pinch-to-zoom and pan gestures. Uses `graphicsLayer` for scale/offset transforms.

Fallback layout algorithm (DFS-based layer assignment) for specs without position data.

- [ ] **Step 2: Create OverviewScreen.kt**

Shows the workflow graph for the currently focused active workflow. Dropdown or tab selector if multiple workflows are active. "No active workflow" empty state.

- [ ] **Step 3: Test on device with a real workflow**

Expected: Graph renders with correct colors. Pinch-to-zoom works. Nodes update color as steps complete.

- [ ] **Step 4: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/components/WorkflowGraph.kt
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/Overview*
git commit -m "feat(android): add OverviewScreen with Canvas workflow graph"
```

---

### Task 16: HistoryScreen with export

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/HistoryScreen.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/HistoryViewModel.kt`

- [ ] **Step 1: Create HistoryViewModel.kt**

Observes `WorkflowManager.state.completed`. Exposes `removeCompleted()`, `exportAsJson()` (writes temp file, returns URI via FileProvider), and `exportAsSummary()` (returns plain text string).

- [ ] **Step 2: Create HistoryScreen.kt**

`LazyColumn` of completed workflows sorted by `finishedAt` descending. Each card shows: name, completion time, final state badge (COMPLETED/ABORTED/ERRORED with color). Tap to expand trace view. Share button triggers Android share sheet via `Intent.ACTION_SEND`.

Swipe-to-dismiss for delete with confirmation dialog.

Export JSON format:
```json
{
    "workflowName": "...",
    "workflowLocalId": "...",
    "workflowVersion": "...",
    "workflowState": "COMPLETED",
    "startedAt": "2026-03-18T10:00:00Z",
    "finishedAt": "2026-03-18T10:45:00Z",
    "properties": { ... },
    "trace": [ ... ]
}
```

- [ ] **Step 3: Test on device**

Expected: Completed workflows appear in history. Share button opens system share sheet. Swipe to delete works.

- [ ] **Step 4: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/History*
git commit -m "feat(android): add HistoryScreen with export/share"
```

---

### Task 17: SettingsScreen

**Files:**
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/SettingsScreen.kt`
- Create: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/SettingsViewModel.kt`

- [ ] **Step 1: Create SettingsViewModel.kt**

Reads/writes preferences via Android `SharedPreferences` or Jetpack DataStore:
- `theme`: "light" | "dark" | "system"
- `confirmDeleteLoaded`: Boolean
- `confirmDeleteCompleted`: Boolean

- [ ] **Step 2: Create SettingsScreen.kt**

Material 3 preference-style layout:
- Theme selector: segmented button or radio group (Light / Dark / System)
- Confirm delete loaded: Switch
- Confirm delete completed: Switch
- App version: read from `BuildConfig.VERSION_NAME`

- [ ] **Step 3: Test on device**

Expected: Theme changes apply immediately. Toggle switches persist across app restart.

- [ ] **Step 4: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/screens/Settings*
git commit -m "feat(android): add SettingsScreen with theme and confirmation prefs"
```

---

## Phase 7: Integration & Polish (Tasks 18-20)

### Task 18: Wire everything together in MainActivity

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/MainActivity.kt`
- Modify: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/TrajectoryRuntimeApp.kt`

- [ ] **Step 1: Update TrajectoryRuntimeApp with WorkflowManager**

```kotlin
class TrajectoryRuntimeApp : Application() {
    val database: AppDatabase by lazy { AppDatabase.create(this) }
    val workflowManager: WorkflowManager by lazy {
        WorkflowManager(dao = database.workflowDao())
    }

    override fun onCreate() {
        super.onCreate()
        ElementRegistry.registerDefaults()
    }
}
```

- [ ] **Step 2: Update MainActivity with full navigation and intent handling**

Wire all ViewModels with the WorkflowManager from Application. Handle incoming intents for `.WFmasterX` files. Call `workflowManager.resumeFromDatabase()` on startup.

- [ ] **Step 3: Handle incoming file intents**

In `onCreate()` and `onNewIntent()`, check `intent.data` for file URIs. Verify file extension from ContentResolver display name. Pass valid URIs to FileProcessor → WorkflowManager.

- [ ] **Step 4: Test full flow on device**

- Load a workflow via file picker → appears on Home
- Start it → Active screen shows step
- Fill out form → submit → next step
- Complete workflow → appears in History
- Kill app mid-workflow → reopen → Active screen resumes

- [ ] **Step 5: Commit**

```bash
git add engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/
git commit -m "feat(android): wire full app with intent handling and state resume"
```

---

### Task 19: Intent handler — open .WFmasterX from external apps

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/MainActivity.kt`

- [ ] **Step 1: Test intent handling**

Send a `.WFmasterX` file via email to the test device. Open the attachment — TrajectoryRuntime should appear as an option. Tapping it should open the app and load the workflow.

Also test: download a `.WFmasterX` from browser, tap in file manager.

- [ ] **Step 2: Verify extension checking**

Ensure the app rejects non-workflow files that happen to match the broad MIME types (e.g., a random `.zip` file). The ContentResolver display name check in `onCreate()` handles this.

- [ ] **Step 3: Commit (if any fixes needed)**

```bash
git commit -m "fix(android): refine intent handler file extension verification"
```

---

### Task 20: Dark mode and theme polish

**Files:**
- Modify: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/ui/theme/Theme.kt`
- Modify: `engines/android-app/app/src/main/kotlin/com/trajectoryruntime/android/MainActivity.kt`

- [ ] **Step 1: Wire theme preference to TrajectoryRuntimeTheme**

Read the theme preference from SettingsViewModel. Pass `darkTheme` parameter based on preference:
- "system" → `isSystemInDarkTheme()`
- "dark" → `true`
- "light" → `false`

- [ ] **Step 2: Test all three modes on device**

Toggle between Light, Dark, and System. Verify all screens look correct in both themes. Check that Material You dynamic color works on Android 12+ devices.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(android): wire theme preference to Material 3 dynamic theming"
```

---

## Phase 8: Testing & Verification (Task 21)

### Task 21: End-to-end manual testing on physical devices

- [ ] **Step 1: Test on physical phone**

Checklist:
- [ ] Load .WFmasterX via file picker
- [ ] Load .WFmasterX via intent (email attachment / file manager)
- [ ] Run linear workflow (START → steps → END)
- [ ] Run branching workflow (YES NO, SELECT 1)
- [ ] Run parallel workflow (PARALLEL → multiple steps → WAIT ALL)
- [ ] Submit all form element types (text, textarea, checkbox, radio, button, timer)
- [ ] Verify images load from bundled ZIP
- [ ] Verify video plays from remote URI (or shows offline placeholder)
- [ ] Kill app mid-workflow, reopen, verify resume at correct step
- [ ] Run 2+ workflows simultaneously
- [ ] Complete workflow, verify it appears in History
- [ ] Export completed result as JSON via share sheet
- [ ] Swipe to delete loaded and completed workflows
- [ ] Toggle dark/light/system theme
- [ ] Verify Active screen uses swipe pager layout

- [ ] **Step 2: Test on physical tablet**

Same checklist as phone, plus:
- [ ] Verify Active screen uses list+detail split layout
- [ ] Verify form elements use absolute positioning on tablet
- [ ] Verify Overview graph supports pinch-to-zoom

- [ ] **Step 3: Fix any issues found, commit fixes**

- [ ] **Step 4: Final commit**

```bash
git commit -m "feat(android): TrajectoryRuntime Android v1.0.0 complete"
```
