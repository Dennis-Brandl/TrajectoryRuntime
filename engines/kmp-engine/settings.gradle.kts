pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
    }
    plugins {
        kotlin("multiplatform") version "2.1.0"
        kotlin("plugin.serialization") version "2.1.0"
    }
}

rootProject.name = "kmp-engine"
