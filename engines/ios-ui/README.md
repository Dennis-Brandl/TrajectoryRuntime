# Trajectory RT iOS UI

SwiftUI app for the Trajectory workflow runtime engine.

## Prerequisites

- macOS with Xcode 15+
- KMP engine framework built: `cd engines/kmp-engine && ./gradlew linkReleaseFrameworkIosArm64`

## Building

1. Build the KMP framework on macOS
2. Open this package in Xcode
3. Add the TrajectoryRuntimeEngine.xcframework to the project
4. Build and run on iOS 17+ simulator or device

## Status

This is a scaffold — the KMP engine integration (coordinator TODO items) needs to be completed once the xcframework is available.
