// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TrajectoryRuntime-iOS",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "TrajectoryRuntimeUI", targets: ["TrajectoryRuntimeUI"]),
    ],
    targets: [
        .target(
            name: "TrajectoryRuntimeUI",
            dependencies: [],
            path: "Sources/TrajectoryRuntimeUI"
        ),
    ]
)
