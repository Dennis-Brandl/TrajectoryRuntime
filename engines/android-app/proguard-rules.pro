# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class io.saturnis.trajectory.**$$serializer { *; }
-keepclassmembers class io.saturnis.trajectory.** { *** Companion; }
-keepclasseswithmembers class io.saturnis.trajectory.** { kotlinx.serialization.KSerializer serializer(...); }

# GraalVM Polyglot (used by KMP engine for SCRIPT steps)
-keep class org.graalvm.** { *; }
-keep class com.oracle.truffle.** { *; }
-dontwarn org.graalvm.**
-dontwarn com.oracle.truffle.**

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**
